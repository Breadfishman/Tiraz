import { spawnRunner } from './agent';
import type { CommandRunner } from './agent';
import type { Manifest, VariantNode } from './manifest';
import { loadManifest, saveManifest, upsertNode } from './manifest';
import { removeWorktree } from './worktree';

export class PromoteError extends Error {
  override readonly name = 'PromoteError';
}

export interface PromoteOptions {
  cwd: string;
  /** Node id of the winning variant to promote. */
  nodeId: string;
  /** Branch to merge into (greenfield) or open the PR against (integration); defaults to `main`. */
  base?: string;
}

export interface PromoteDeps {
  /** Injected for git/gh operations and tests; defaults to {@link spawnRunner}. */
  runner?: CommandRunner;
}

export interface PromoteResult {
  mode: Manifest['mode'];
  nodeId: string;
  branch: string;
  base: string;
  /** Integration mode only: the URL of the PR opened by `gh pr create`. */
  prUrl?: string;
}

/** Run a command from `cwd`, throwing {@link PromoteError} on a non-zero exit. */
async function run(
  command: string,
  args: string[],
  cwd: string,
  runner: CommandRunner,
): Promise<string> {
  const result = await runner(command, args, { cwd });
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() !== '' ? result.stderr.trim() : result.stdout.trim();
    throw new PromoteError(
      `${command} ${args.join(' ')} failed (exit ${String(result.exitCode)}): ${detail}`,
    );
  }
  return result.stdout;
}

/**
 * Promote the winning variant (SPEC §5, Phase 4). In **greenfield** mode the variant branch is
 * merged into `base` and its worktree torn down; in **integration** mode the branch is pushed and a
 * pull request is opened via `gh` for human review (no merge). The node is marked `promoted` and
 * recorded as the manifest's `final`. All process work goes through the injected
 * {@link CommandRunner}.
 */
export async function promoteVariant(
  opts: PromoteOptions,
  deps: PromoteDeps = {},
): Promise<PromoteResult> {
  const runner = deps.runner ?? spawnRunner;
  const base = opts.base ?? 'main';

  const manifest = await loadManifest(opts.cwd);
  if (manifest === null) {
    throw new PromoteError(`No Tiraz manifest found in ${opts.cwd}`);
  }
  const node = manifest.nodes[opts.nodeId];
  if (node === undefined) {
    throw new PromoteError(`Variant ${opts.nodeId} not found`);
  }
  const { branch } = node;

  let prUrl: string | undefined;
  if (manifest.mode === 'greenfield') {
    await run('git', ['checkout', base], opts.cwd, runner);
    await run(
      'git',
      ['merge', '--no-ff', branch, '-m', `tiraz: promote ${opts.nodeId}`],
      opts.cwd,
      runner,
    );
    await removeWorktree({ repoRoot: opts.cwd, worktreePath: node.worktree, force: true, runner });
    await run('git', ['branch', '-d', branch], opts.cwd, runner);
  } else {
    await run('git', ['push', '-u', 'origin', branch], opts.cwd, runner);
    const stdout = await run(
      'gh',
      [
        'pr',
        'create',
        '--base',
        base,
        '--head',
        branch,
        '--title',
        `Tiraz: ${node.genome.brief}`,
        '--body',
        `Promotes variant \`${opts.nodeId}\` (generation ${String(node.generation)}).`,
      ],
      opts.cwd,
      runner,
    );
    prUrl = stdout.trim();
  }

  const promoted: VariantNode = { ...node, status: 'promoted' };
  const next: Manifest = { ...upsertNode(manifest, promoted), final: opts.nodeId };
  await saveManifest(opts.cwd, next);

  return {
    mode: manifest.mode,
    nodeId: opts.nodeId,
    branch,
    base,
    ...(prUrl !== undefined ? { prUrl } : {}),
  };
}
