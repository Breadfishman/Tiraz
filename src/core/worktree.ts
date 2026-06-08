import { spawnRunner } from './agent';
import type { CommandRunner } from './agent';

/** A linked git worktree. */
export interface WorktreeInfo {
  path: string;
  /** Short branch name, or `null` for a detached / bare worktree. */
  branch: string | null;
}

export class WorktreeError extends Error {
  override readonly name = 'WorktreeError';
  readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.stderr = stderr;
  }
}

async function git(repoRoot: string, args: string[], runner: CommandRunner): Promise<string> {
  const result = await runner('git', args, { cwd: repoRoot });
  if (result.exitCode !== 0) {
    throw new WorktreeError(
      `git ${args.join(' ')} failed (exit ${String(result.exitCode)})`,
      result.stderr,
    );
  }
  return result.stdout;
}

export interface AddWorktreeOptions {
  repoRoot: string;
  branch: string;
  worktreePath: string;
  /** Ref to branch from; defaults to `HEAD`. */
  baseRef?: string;
  runner?: CommandRunner;
}

/** Create a new linked worktree on a fresh branch (`git worktree add -b <branch> <path> <base>`). */
export async function addWorktree(opts: AddWorktreeOptions): Promise<WorktreeInfo> {
  const runner = opts.runner ?? spawnRunner;
  const base = opts.baseRef ?? 'HEAD';
  await git(opts.repoRoot, ['worktree', 'add', '-b', opts.branch, opts.worktreePath, base], runner);
  return { path: opts.worktreePath, branch: opts.branch };
}

export interface RemoveWorktreeOptions {
  repoRoot: string;
  worktreePath: string;
  force?: boolean;
  runner?: CommandRunner;
}

/** Remove a linked worktree (`git worktree remove`). */
export async function removeWorktree(opts: RemoveWorktreeOptions): Promise<void> {
  const runner = opts.runner ?? spawnRunner;
  const args = [
    'worktree',
    'remove',
    opts.worktreePath,
    ...(opts.force === true ? ['--force'] : []),
  ];
  await git(opts.repoRoot, args, runner);
}

/** List the repo's worktrees (`git worktree list --porcelain`). */
export async function listWorktrees(
  repoRoot: string,
  runner: CommandRunner = spawnRunner,
): Promise<WorktreeInfo[]> {
  return parseWorktreeList(await git(repoRoot, ['worktree', 'list', '--porcelain'], runner));
}

/** Parse `git worktree list --porcelain` output into structured info. */
export function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  return porcelain
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const lines = block.split('\n');
      const worktreeLine = lines.find((l) => l.startsWith('worktree '));
      const branchLine = lines.find((l) => l.startsWith('branch '));
      return {
        path: worktreeLine === undefined ? '' : worktreeLine.slice('worktree '.length),
        branch:
          branchLine === undefined
            ? null
            : branchLine.slice('branch '.length).replace(/^refs\/heads\//, ''),
      };
    })
    .filter((info) => info.path !== '');
}

export interface PortRange {
  base?: number;
  max?: number;
}

/** Lowest free port in `[base, max)` not present in `used`. Throws if the range is exhausted. */
export function assignPort(used: Iterable<number>, range: PortRange = {}): number {
  const base = range.base ?? 41000;
  const max = range.max ?? 42000;
  const taken = new Set(used);
  for (let port = base; port < max; port += 1) {
    if (!taken.has(port)) {
      return port;
    }
  }
  throw new Error(`No free port available in range ${String(base)}-${String(max)}`);
}
