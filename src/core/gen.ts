import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Agent, CommandRunner } from './agent';
import { composeCritiquePrompt, composePrompt, spawnRunner } from './agent';
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
  fetchMode?: 'signatures' | 'install';
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

  await installResolvedSkills(resolved.all, {
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

  const prompt = composePrompt(
    ctx.genome,
    activeSkillIds,
    ctx.capabilities ?? [],
    ctx.designSystem,
    ctx.directive,
    allFetched.map((f) => ({ source: f.source, item: f.item })),
  );
  const agentResult = await deps.agent.run({
    cwd: worktreePath,
    prompt,
    skills: activeSkillIds,
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
  const git = deps.runner ?? spawnRunner;
  const commitWork = async (message: string): Promise<void> => {
    await git('git', ['add', '-A'], { cwd: worktreePath });
    await git('git', ['commit', '-q', '-m', message], { cwd: worktreePath });
  };
  await commitWork(`tiraz: variant ${ctx.genome.id}`);

  const screenshotPath = path.join(ctx.cwd, '.tiraz', 'screenshots', `${ctx.genome.id}.png`);
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  const renderShot = (): ReturnType<Renderer['render']> =>
    deps.renderer.render({
      worktreeDir: worktreePath,
      harness: ctx.harness,
      target: ctx.genome.target ?? '',
      port: ctx.port,
      screenshotPath,
    });
  let render = await renderShot();

  // Optional self-critique-and-revise pass (SPEC §9): the agent reviews its own rendered output
  // against the taste bar and fixes the worst slop tells in place, then we re-commit and re-render
  // to refresh the screenshot. The first pass already succeeded, so a critique-pass failure (or a
  // no-op commit) must not discard the variant — we keep the original render in that case.
  if (ctx.selfCritique === true) {
    const critique = await deps.agent.run({
      cwd: worktreePath,
      prompt: composeCritiquePrompt(ctx.genome, render.screenshotPath),
      skills: activeSkillIds,
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
  const resolved = resolveActiveSkills(config);
  const resolvedSources = resolveSources(config.sources);
  const permittedSources = resolvedSources.permittedIds;
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
      fetchMode: config.sources.fetchMode,
      fetchBudget: config.sources.fetchBudget,
      bundledSources,
      twentyFirst: config.sources.twentyFirst,
      twentyFirstBudget: config.sources.twentyFirstBudget,
    },
    deps,
  );

  const next = recordGeneration(upsertNode(manifest, node), [id]);
  await saveManifest(opts.cwd, next);
  return node;
}
