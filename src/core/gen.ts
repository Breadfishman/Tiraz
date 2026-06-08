import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Agent, CommandRunner } from './agent';
import { composePrompt } from './agent';
import { loadConfig } from './config';
import type { HarnessKind } from './detect';
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

export interface GenOptions {
  /** The target project root (a git repo). */
  cwd: string;
  /** The brief / section spec the variant implements. */
  brief: string;
  /** Scoped target (component / route / story); integration mode. */
  target?: string;
  /** Force a render harness instead of auto-detecting. */
  harness?: HarnessKind;
}

export interface GenDeps {
  agent: Agent;
  renderer: Renderer;
  /** Directory holding the bundled vendored skills (the package's `skills/`). */
  skillsSourceDir: string;
  /** Injected for git operations / tests; defaults to the real spawn runner inside worktree ops. */
  runner?: CommandRunner;
  /** Clock for `genome.createdAt`; defaults to wall-clock ISO. Injected for deterministic tests. */
  now?: () => string;
}

/**
 * Produce a single variant (Phase 1 — no search): create a worktree, write the resolved skill
 * set into it, run the agent against the composed prompt, render + screenshot the target, and
 * record the resulting node in the manifest. Returns the created node.
 */
export async function runGen(opts: GenOptions, deps: GenDeps): Promise<VariantNode> {
  const { config } = await loadConfig(opts.cwd);
  const manifest: Manifest =
    (await loadManifest(opts.cwd)) ?? createManifest(path.basename(opts.cwd), config.mode, config);

  const generation = manifest.generations.length;
  const id = genomeId(generation, 0);
  const now = deps.now ?? (() => new Date().toISOString());

  const resolved = resolveActiveSkills(config);
  const activeSkillIds = resolved.all.map((skill) => skill.id);

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

  const usedPorts = Object.values(manifest.nodes)
    .map((node) => node.devPort)
    .filter((port): port is number => port !== undefined);
  const port = assignPort(usedPorts);

  const branch = `tiraz/${id}`;
  const worktreePath = path.join(opts.cwd, '.tiraz', 'worktrees', id);
  await mkdir(path.dirname(worktreePath), { recursive: true });
  await addWorktree({
    repoRoot: opts.cwd,
    branch,
    worktreePath,
    ...(deps.runner !== undefined ? { runner: deps.runner } : {}),
  });

  await installResolvedSkills(resolved.all, {
    sourceDir: deps.skillsSourceDir,
    worktreeDir: worktreePath,
  });

  const prompt = composePrompt(genome, activeSkillIds);
  const agentResult = await deps.agent.run({
    cwd: worktreePath,
    prompt,
    skills: activeSkillIds,
    ...(genome.sources !== undefined ? { sources: genome.sources } : {}),
  });
  if (!agentResult.ok) {
    throw new GenError(
      `Agent failed for ${id} (exit ${String(agentResult.exitCode)}): ${agentResult.output}`,
    );
  }

  const screenshotPath = path.join(opts.cwd, '.tiraz', 'screenshots', `${id}.png`);
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  const render = await deps.renderer.render({
    worktreeDir: worktreePath,
    harness,
    target: opts.target ?? '',
    port,
    screenshotPath,
  });

  const node: VariantNode = {
    genome,
    generation,
    branch,
    worktree: worktreePath,
    devPort: port,
    renderUrl: render.renderUrl,
    screenshot: render.screenshotPath,
    fitness: null,
    status: 'generated',
  };

  const next = recordGeneration(upsertNode(manifest, node), [id]);
  await saveManifest(opts.cwd, next);
  return node;
}
