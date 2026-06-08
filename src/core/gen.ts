import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Agent, CommandRunner } from './agent';
import { composePrompt } from './agent';
import type { TirazConfig } from './config';
import { loadConfig } from './config';
import type { DetectedHarness, HarnessKind } from './detect';
import { detectHarness } from './detect';
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
import type { Renderer } from './render';
import { installResolvedSkills } from './skills-install';
import { resolveActiveSkills } from './skills-registry';
import { addWorktree, assignPort } from './worktree';

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
}

export interface GenerateVariantContext {
  cwd: string;
  mode: TirazConfig['mode'];
  genome: Genome;
  generation: number;
  port: number;
  harness: DetectedHarness;
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
  });
  const activeSkillIds = resolved.all.map((skill) => skill.id);

  const branch = `tiraz/${ctx.genome.id}`;
  const worktreePath = path.join(ctx.cwd, '.tiraz', 'worktrees', ctx.genome.id);
  await mkdir(path.dirname(worktreePath), { recursive: true });
  await addWorktree({
    repoRoot: ctx.cwd,
    branch,
    worktreePath,
    ...(deps.runner !== undefined ? { runner: deps.runner } : {}),
  });

  await installResolvedSkills(resolved.all, {
    sourceDir: deps.skillsSourceDir,
    worktreeDir: worktreePath,
  });

  const prompt = composePrompt(ctx.genome, activeSkillIds);
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

  const screenshotPath = path.join(ctx.cwd, '.tiraz', 'screenshots', `${ctx.genome.id}.png`);
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  const render = await deps.renderer.render({
    worktreeDir: worktreePath,
    harness: ctx.harness,
    target: ctx.genome.target ?? '',
    port: ctx.port,
    screenshotPath,
  });

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

  const genome: Genome = {
    id,
    parents: [],
    primary: resolved.primary.primaryKey ?? config.primary,
    overlay: config.overlay,
    dials: config.dials,
    commands: [],
    seed: 0,
    brief: opts.brief,
    createdAt: now(),
    ...(opts.target !== undefined ? { target: opts.target } : {}),
    ...(config.sources.fetch.length > 0 ? { sources: config.sources.fetch } : {}),
  };

  const harness = await detectHarness(opts.cwd, opts.harness);
  const port = assignPort(usedPorts(manifest));

  const node = await generateVariant(
    { cwd: opts.cwd, mode: config.mode, genome, generation, port, harness },
    deps,
  );

  const next = recordGeneration(upsertNode(manifest, node), [id]);
  await saveManifest(opts.cwd, next);
  return node;
}
