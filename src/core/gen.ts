import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Agent, CommandRunner } from './agent';
import {
  composeCritiquePrompt,
  composePrompt,
  shotCommand,
  spawnRunner,
  tellsCommand,
} from './agent';
import { brandFonts, brandPromptSection } from './brand';
import type { CreativeContext } from './creative-context';
import { REFS_DIR, loadCreativeContext } from './creative-context';
import { tasteSection } from './taste-memory';
import { resolveFetchPlan } from './component-fetch';
import { fetchComponents } from './component-fetch-io';
import { planAndFetchTwentyFirst } from './twentyfirst-io';
import type { TirazConfig } from './config';
import { loadConfig } from './config';
import type { DetectedHarness, HarnessKind } from './detect';
import { detectHarness } from './detect';
import { resolveCapabilities } from './capabilities';
import type { DesignSystem } from './ds-adherence';
import { collectDesignSystem } from './ds-collect-io';
import type { Genome } from './genome';
import { genomeId } from './genome';
import type { Manifest, VariantNode } from './manifest';
import {
  createManifest,
  loadManifest,
  recordGeneration,
  saveManifest,
  upsertNode,
} from './manifest';
import type { Mutex } from './pool';
import type { Renderer } from './render';
import { installResolvedSkills } from './skills-install';
import { resolveActiveSkills } from './skills-registry';
import { resolveSources } from './sources';
import type { WorktreeInfo } from './worktree';
import { addWorktree, assignPort, linkNodeModules } from './worktree';

export class GenError extends Error {
  override readonly name = 'GenError';
}

/** Dependencies for materializing a variant (the swappable external leaves). */
export interface VariantDeps {
  agent: Agent;
  renderer: Renderer;
  /** Directory holding the bundled vendored skills (the package's `skills/`). */
  skillsSourceDir: string;
  /** Injected for git operations / tests. */
  runner?: CommandRunner;
  /**
   * Optional serializer for the `git worktree add` step. When a round materializes variants in
   * parallel, concurrent `git worktree add` calls contend on the repo's locks — the search
   * controller passes a shared {@link Mutex} so only one worktree is created at a time, while the
   * expensive agent + render work still runs fully in parallel. Absent → no serialization.
   */
  worktreeLock?: Mutex;
  /**
   * Absolute path of the running `tiraz` CLI. When set, the build agent is given a `tiraz shot`
   * command to render + screenshot its own work mid-session (and the matching permission rule is
   * granted by the CLI layer's agent). Absent → the agent is only told to run the build/typecheck.
   */
  tirazCli?: string;
}

export interface GenerateVariantContext {
  cwd: string;
  mode: TirazConfig['mode'];
  genome: Genome;
  generation: number;
  port: number;
  harness: DetectedHarness;
  /** Capability-library names available this run (SPEC §10), advertised to the agent. */
  capabilities?: string[];
  /** The repo's design system (SPEC §3/§9), so the agent builds within it instead of hardcoding. */
  designSystem?: DesignSystem;
  /** Branch to base the worktree on (defaults to HEAD). Bred/recombined children base on a parent. */
  baseRef?: string;
  /** One-shot human directive for directed breeding ("what to improve") — passed to the agent. */
  directive?: string;
  /**
   * Run the optional self-critique-and-revise second pass after the first render (SPEC §9). When
   * enabled the agent reviews its own rendered output against the slop-tell rubric and fixes the
   * worst offenders in place, then we re-commit and re-render. Defaults to off when omitted.
   */
  selfCritique?: boolean;
  /**
   * Genuine component fetching (SPEC §12, Phase 1). In `'install'` mode, real components from the
   * genome's permitted sources are pre-fetched into the worktree before the agent runs and the
   * prompt asks the agent to compose + restyle them; `'signatures'` (or omitted) keeps the
   * prompt-only behaviour. Best-effort: a worktree with no `components.json` silently falls back.
   */
  fetchMode?: TirazConfig['sources']['fetchMode'];
  /** Max components to install per variant when `fetchMode === 'install'` (defaults to 6). */
  fetchBudget?: number;
  /**
   * Bundled-tier source ids (e.g. `magic-ui`) — fetched alongside the genome's Tier-2 `sources`.
   * Bundled sources are always available but aren't recorded on the genome, so the caller passes
   * them here; without this they'd never be installed even though they have a registry entry.
   */
  bundledSources?: string[];
  /**
   * 21st.dev semantic-search fetching (SPEC §12, Phase 2/3). When enabled (and `TWENTY_FIRST_API_KEY`
   * is set), a planning agent pass picks search queries and Tiraz installs the matching real
   * components from 21st.dev's `fetch-ui` endpoint before the main agent runs. Best-effort: no key,
   * a failed plan, or an offline endpoint silently fetches nothing and the variant proceeds.
   */
  twentyFirst?: boolean;
  /** Max 21st.dev queries (= components) per variant when {@link twentyFirst} is on (defaults to 3). */
  twentyFirstBudget?: number;
  /** `generation.skills` — `lean` skips the large greenfield primary skill (defaults to `full`). */
  skills?: TirazConfig['generation']['skills'];
  /** BRAND.md, taste notes, and reference screenshots (loaded once per round by the caller). */
  creative?: CreativeContext;
}

/** Paths the agent may create in a worktree that must never be committed onto a variant branch. */
function uncommittable(installedSkillIds: string[]): string[] {
  // `node_modules` is a symlink to the repo's deps: a `node_modules/` gitignore rule doesn't match a
  // symlink, so without this `git add -A` would commit it. The installed skills are Tiraz scaffolding,
  // not part of the design, and would otherwise ride along into `promote`.
  return ['node_modules', ...installedSkillIds.map((id) => path.join('.claude', 'skills', id))];
}

/**
 * Materialize one variant for a fully-specified genome (SPEC §7 step 1): create its worktree,
 * write the resolved skills, run the agent, render + screenshot. Does **not** touch the manifest —
 * the caller persists. This is the primitive `runGen` and the search controller both build on.
 */
export async function generateVariant(
  ctx: GenerateVariantContext,
  deps: VariantDeps,
): Promise<VariantNode> {
  const resolved = resolveActiveSkills({
    mode: ctx.mode,
    primary: ctx.genome.primary,
    overlay: ctx.genome.overlay,
    ...(ctx.genome.prior !== undefined ? { prior: ctx.genome.prior } : {}),
    ...(ctx.skills !== undefined ? { skills: ctx.skills } : {}),
  });
  const activeSkillIds = resolved.all.map((skill) => skill.id);

  const branch = `tiraz/${ctx.genome.id}`;
  const worktreePath = path.join(ctx.cwd, '.tiraz', 'worktrees', ctx.genome.id);
  await mkdir(path.dirname(worktreePath), { recursive: true });
  // Serialized under concurrency (see VariantDeps.worktreeLock): concurrent `git worktree add` calls
  // race on the repo's locks, so this one step is queued while the rest of the pipeline stays parallel.
  const createWorktree = (): Promise<WorktreeInfo> =>
    addWorktree({
      repoRoot: ctx.cwd,
      branch,
      worktreePath,
      ...(ctx.baseRef !== undefined ? { baseRef: ctx.baseRef } : {}),
      ...(deps.runner !== undefined ? { runner: deps.runner } : {}),
    });
  await (deps.worktreeLock !== undefined
    ? deps.worktreeLock.run(createWorktree)
    : createWorktree());

  const git = deps.runner ?? spawnRunner;
  // Record where this variant started so the lint floor can scan only the files it changed.
  const head = await git('git', ['rev-parse', 'HEAD'], { cwd: worktreePath });
  const baseCommit =
    head.exitCode === 0 && head.stdout.trim() !== '' ? head.stdout.trim() : undefined;

  const installedSkills = await installResolvedSkills(resolved.all, {
    sourceDir: deps.skillsSourceDir,
    worktreeDir: worktreePath,
  });

  // A fresh worktree has no node_modules (gitignored); link the repo's so the harness can boot.
  await linkNodeModules(ctx.cwd, worktreePath);

  // Genuine component fetching (SPEC §12, Phase 1): in install mode, pre-fetch real components from
  // the genome's permitted sources into the worktree so the agent composes + restyles real code.
  // Best-effort — with no `components.json` (or any failure) this returns [] and we fall through to
  // the signatures behaviour, so the variant is never blocked.
  // Homegrown gen-0 variants (SPEC §4) are built entirely from scratch — skip ALL fetching (bundled,
  // registry, and 21st below) so the round always includes a non-library, from-scratch option.
  const homegrown = ctx.genome.homegrown === true;
  const fetched =
    !homegrown && ctx.fetchMode === 'install'
      ? await fetchComponents(
          worktreePath,
          resolveFetchPlan([...(ctx.bundledSources ?? []), ...(ctx.genome.sources ?? [])], {
            budget: ctx.fetchBudget ?? 6,
            seed: ctx.genome.seed,
          }),
          deps.runner !== undefined ? { runner: deps.runner } : {},
        )
      : [];

  // 21st.dev semantic-search fetching (SPEC §12, Phase 2/3): when enabled, a planning agent pass picks
  // search queries and the matching real components are installed into the worktree. Same hard rule —
  // best-effort, never blocks the variant (no key / failed plan / offline → fetches nothing).
  const twentyFirstFetched =
    !homegrown && ctx.twentyFirst === true
      ? await planAndFetchTwentyFirst({
          worktreeDir: worktreePath,
          genome: ctx.genome,
          ...(ctx.designSystem !== undefined ? { designSystem: ctx.designSystem } : {}),
          agent: deps.agent,
          activeSkillIds,
          budget: ctx.twentyFirstBudget ?? 3,
        })
      : [];

  const allFetched = [...fetched, ...twentyFirstFetched];

  const creative = ctx.creative;
  const screenshotsDir = path.join(ctx.cwd, '.tiraz', 'screenshots');
  // Directories outside the worktree the agent may read: its screenshots, plus reference shots.
  const readableDirs = [
    screenshotsDir,
    ...((creative?.references ?? []).length > 0 ? [path.join(ctx.cwd, REFS_DIR)] : []),
  ];
  const screenshotPath = path.join(screenshotsDir, `${ctx.genome.id}.png`);
  await mkdir(screenshotsDir, { recursive: true });
  const check =
    deps.tirazCli !== undefined
      ? (() => {
          const out = path.join(screenshotsDir, `${ctx.genome.id}-check.png`);
          return {
            screenshotPath: out,
            command: shotCommand(deps.tirazCli, {
              worktree: worktreePath,
              harness: ctx.harness.kind,
              target: ctx.genome.target ?? '',
              port: ctx.port,
              out,
            }),
            tellsCommand: tellsCommand(deps.tirazCli, {
              worktree: worktreePath,
              ...(baseCommit !== undefined ? { base: baseCommit } : {}),
            }),
          };
        })()
      : undefined;

  const prompt = composePrompt(
    ctx.genome,
    activeSkillIds,
    ctx.capabilities ?? [],
    ctx.designSystem,
    ctx.directive,
    allFetched.map((f) => ({ source: f.source, item: f.item })),
    {
      mode: ctx.mode,
      ...(check !== undefined ? { check } : {}),
      brand: brandPromptSection(creative?.brand ?? null),
      taste: tasteSection(creative?.taste ?? ''),
      references: creative?.references ?? [],
      brandFonts: creative?.brand != null ? brandFonts(creative.brand) : [],
    },
  );
  const agentResult = await deps.agent.run({
    cwd: worktreePath,
    prompt,
    skills: activeSkillIds,
    // The screenshots live under the repo's `.tiraz/`, outside the worktree — grant access so the
    // agent can read its own check renders.
    additionalDirectories: readableDirs,
    ...(ctx.genome.sources !== undefined ? { sources: ctx.genome.sources } : {}),
  });
  if (!agentResult.ok) {
    throw new GenError(
      `Agent failed for ${ctx.genome.id} (exit ${String(agentResult.exitCode)}): ${agentResult.output}`,
    );
  }

  // Commit the agent's work onto the variant's branch so its design is captured — this is what lets
  // children branch off it (breed/recombine refine, not restart) and what `promote` actually merges.
  // A no-op commit (agent made no changes) exits non-zero; that's fine, so failures are ignored.
  const commitWork = async (message: string): Promise<void> => {
    await git('git', ['add', '-A'], { cwd: worktreePath });
    await git('git', ['reset', '-q', '--', ...uncommittable(installedSkills)], {
      cwd: worktreePath,
    });
    await git('git', ['commit', '-q', '-m', message], { cwd: worktreePath });
  };
  await commitWork(`tiraz: variant ${ctx.genome.id}`);

  const renderShot = (): ReturnType<Renderer['render']> =>
    deps.renderer.render({
      worktreeDir: worktreePath,
      harness: ctx.harness,
      target: ctx.genome.target ?? '',
      port: ctx.port,
      screenshotPath,
    });
  let render = await renderShot();

  // Optional self-critique-and-revise pass (SPEC §9), off by default: the agent reviews its own
  // rendered output against the taste bar and fixes the worst slop tells in place, then we re-commit
  // and re-render. It RESUMES the build session when the backend reported one, so it keeps its
  // context (and prompt cache) instead of re-reading the codebase. A critique-pass failure (or a
  // no-op commit) must not discard the variant — we keep the original render in that case.
  if (ctx.selfCritique === true) {
    const critique = await deps.agent.run({
      cwd: worktreePath,
      prompt: composeCritiquePrompt(ctx.genome, render.screenshotPath),
      skills: activeSkillIds,
      additionalDirectories: readableDirs,
      ...(agentResult.sessionId !== undefined ? { resumeSessionId: agentResult.sessionId } : {}),
      ...(ctx.genome.sources !== undefined ? { sources: ctx.genome.sources } : {}),
    });
    if (critique.ok) {
      await commitWork(`tiraz: variant ${ctx.genome.id} (self-critique)`);
      render = await renderShot();
    }
  }

  return {
    genome: ctx.genome,
    generation: ctx.generation,
    branch,
    worktree: worktreePath,
    devPort: ctx.port,
    renderUrl: render.renderUrl,
    screenshot: render.screenshotPath,
    ...(baseCommit !== undefined ? { baseCommit } : {}),
    fitness: null,
    status: 'generated',
  };
}

export interface GenOptions {
  cwd: string;
  brief: string;
  target?: string;
  harness?: HarnessKind;
}

export interface GenDeps extends VariantDeps {
  /** Clock for `genome.createdAt`; defaults to wall-clock ISO. */
  now?: () => string;
}

/** The dev-server ports already taken by existing nodes. */
export function usedPorts(manifest: Manifest): number[] {
  return Object.values(manifest.nodes)
    .map((node) => node.devPort)
    .filter((port): port is number => port !== undefined);
}

/**
 * Produce a single variant from config (Phase 1 — no search). Builds the round-0 genome and
 * delegates to {@link generateVariant}, then records the node + generation in the manifest.
 */
export async function runGen(opts: GenOptions, deps: GenDeps): Promise<VariantNode> {
  const { config } = await loadConfig(opts.cwd);
  const manifest: Manifest =
    (await loadManifest(opts.cwd)) ?? createManifest(path.basename(opts.cwd), config.mode, config);

  const generation = manifest.generations.length;
  const id = genomeId(generation, 0);
  const now = deps.now ?? (() => new Date().toISOString());
  const resolved = resolveActiveSkills({ ...config, skills: config.generation.skills });
  const resolvedSources = resolveSources(config.sources);
  const permittedSources = config.sources.fetchMode === 'off' ? [] : resolvedSources.permittedIds;
  const bundledSources = resolvedSources.bundled.map((source) => source.id);

  const genome: Genome = {
    id,
    parents: [],
    primary: resolved.primary?.primaryKey ?? config.primary,
    overlay: config.overlay,
    dials: config.dials,
    commands: [],
    seed: 0,
    brief: opts.brief,
    createdAt: now(),
    ...(opts.target !== undefined ? { target: opts.target } : {}),
    ...(permittedSources.length > 0 ? { sources: permittedSources } : {}),
  };

  const harness = await detectHarness(opts.cwd, opts.harness);
  const port = assignPort(usedPorts(manifest));
  const capabilities = resolveCapabilities(config.modules).libraries.map((c) => c.name);
  const designSystem = await collectDesignSystem(opts.cwd);
  const creative = await loadCreativeContext(opts.cwd);

  const node = await generateVariant(
    {
      cwd: opts.cwd,
      mode: config.mode,
      genome,
      generation,
      port,
      harness,
      capabilities,
      designSystem,
      selfCritique: config.generation.selfCritique,
      skills: config.generation.skills,
      fetchMode: config.sources.fetchMode,
      fetchBudget: config.sources.fetchBudget,
      bundledSources,
      twentyFirst: config.sources.twentyFirst,
      twentyFirstBudget: config.sources.twentyFirstBudget,
      creative,
    },
    deps,
  );

  const next = recordGeneration(upsertNode(manifest, node), [id]);
  await saveManifest(opts.cwd, next);
  return node;
}
