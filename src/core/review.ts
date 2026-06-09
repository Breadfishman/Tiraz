/**
 * Motion / polish review (SPEC §7, §9 — `tiraz review`). Emil Kowalski's skill judges motion and
 * craft on demand. It has **no stated license**, so it is **never vendored**: this installs it at
 * review time via the agent-skills CLI into the variant's worktree, then runs the agent with it
 * active. Orchestration is testable with injected leaves; the live `claude` run is deferred.
 */

import type { Agent, CommandRunner } from './agent';
import { spawnRunner } from './agent';
import type { VariantNode } from './manifest';
import { loadManifest } from './manifest';

/** Emil's skill — install-time dependency only (SPEC §13). */
export const EMIL_SKILL = 'emilkowalski/skill';

export class ReviewError extends Error {
  override readonly name = 'ReviewError';
}

export interface ReviewOptions {
  cwd: string;
  /** Node to review; defaults to the run's `final`, else the most recent node. */
  nodeId?: string;
}

export interface ReviewDeps {
  /** The coding agent that runs the review (Emil's skill active in the worktree). */
  agent: Agent;
  /** Installs Emil's skill via the agent-skills CLI; defaults to {@link spawnRunner}. */
  runner?: CommandRunner;
  /** The agent-skills launcher; defaults to `npx`. */
  skillBinary?: string;
}

export interface ReviewResult {
  nodeId: string;
  review: string;
}

/** Choose the node to review: explicit id → manifest `final` → most recently generated. */
function selectNode(
  nodes: Record<string, VariantNode>,
  generations: string[][],
  final: string | undefined,
  nodeId: string | undefined,
): VariantNode | undefined {
  if (nodeId !== undefined) {
    return nodes[nodeId];
  }
  if (final !== undefined) {
    return nodes[final];
  }
  const lastGen = generations[generations.length - 1];
  const lastId = lastGen?.[lastGen.length - 1];
  return lastId === undefined ? undefined : nodes[lastId];
}

function reviewPrompt(node: VariantNode): string {
  const lines = [
    '# Motion & polish review',
    '',
    "Use Emil Kowalski's skill to critique this variant's motion design and craft. Focus on:",
    '- animation quality: easing, spring physics, timing, choreography;',
    '- micro-interactions and hover/entrance states;',
    '- overall polish and where it still feels generic or AI-built.',
    '',
    '## Brief',
    node.genome.brief,
  ];
  if (node.screenshot !== undefined) {
    lines.push('', `## Rendered screenshot`, node.screenshot);
  }
  lines.push('', 'Return concrete, prioritized critique — not a rubric score.');
  return lines.join('\n');
}

/**
 * Review a variant's motion/polish (SPEC §7). Installs Emil's skill into the variant's worktree
 * (never vendored — §13), then runs the agent there with it active. Returns the agent's critique.
 */
export async function reviewVariant(opts: ReviewOptions, deps: ReviewDeps): Promise<ReviewResult> {
  const runner = deps.runner ?? spawnRunner;
  const skillBinary = deps.skillBinary ?? 'npx';

  const manifest = await loadManifest(opts.cwd);
  if (manifest === null) {
    throw new ReviewError(`No Tiraz manifest found in ${opts.cwd}`);
  }
  const node = selectNode(manifest.nodes, manifest.generations, manifest.final, opts.nodeId);
  if (node === undefined) {
    throw new ReviewError(
      opts.nodeId !== undefined ? `Variant ${opts.nodeId} not found` : 'No variant to review',
    );
  }

  // Install Emil's skill on demand (install-time dependency only, never vendored).
  const install = await runner(skillBinary, ['skills', 'add', EMIL_SKILL], { cwd: node.worktree });
  if (install.exitCode !== 0) {
    const detail = install.stderr.trim() !== '' ? install.stderr.trim() : install.stdout.trim();
    throw new ReviewError(
      `Failed to install ${EMIL_SKILL} (exit ${String(install.exitCode)}): ${detail}`,
    );
  }

  const result = await deps.agent.run({
    cwd: node.worktree,
    prompt: reviewPrompt(node),
    skills: [EMIL_SKILL],
  });
  if (!result.ok) {
    throw new ReviewError(
      `Review agent failed for ${node.genome.id} (exit ${String(result.exitCode)}): ${result.output}`,
    );
  }

  return { nodeId: node.genome.id, review: result.output };
}
