import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnRunner } from './agent';
import type { CommandResult, CommandRunner } from './agent';
import {
  WorktreeError,
  addWorktree,
  assignPort,
  listWorktrees,
  parseWorktreeList,
  removeWorktree,
} from './worktree';

const tmpDirs: string[] = [];

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-wt-'));
  tmpDirs.push(dir);
  await spawnRunner('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await spawnRunner('git', ['config', 'user.email', 'test@tiraz.dev'], { cwd: dir });
  await spawnRunner('git', ['config', 'user.name', 'Tiraz Test'], { cwd: dir });
  await writeFile(path.join(dir, 'README.md'), '# fixture\n', 'utf8');
  await spawnRunner('git', ['add', '-A'], { cwd: dir });
  await spawnRunner('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

const failingRunner =
  (result: CommandResult): CommandRunner =>
  () =>
    Promise.resolve(result);

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('assignPort', () => {
  it('returns the base port when nothing is used', () => {
    expect(assignPort([])).toBe(41000);
  });

  it('skips used ports', () => {
    expect(assignPort([41000, 41001])).toBe(41002);
  });

  it('throws when the range is exhausted', () => {
    expect(() => assignPort([1], { base: 1, max: 2 })).toThrow(/No free port/);
  });
});

describe('parseWorktreeList', () => {
  it('parses porcelain output with branch and detached blocks', () => {
    const porcelain = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo/.tiraz/worktrees/g0-n0',
      'HEAD def456',
      'detached',
      '',
    ].join('\n');
    expect(parseWorktreeList(porcelain)).toEqual([
      { path: '/repo', branch: 'main' },
      { path: '/repo/.tiraz/worktrees/g0-n0', branch: null },
    ]);
  });
});

describe('git worktree operations', () => {
  it('adds, lists, and removes a worktree', async () => {
    const repo = await initRepo();
    const worktreePath = path.join(repo, '.tiraz', 'wt', 'g0-n0');

    const info = await addWorktree({ repoRoot: repo, branch: 'tiraz/g0-n0', worktreePath });
    expect(info).toEqual({ path: worktreePath, branch: 'tiraz/g0-n0' });

    const listed = await listWorktrees(repo);
    expect(listed.some((w) => w.path === worktreePath && w.branch === 'tiraz/g0-n0')).toBe(true);

    await removeWorktree({ repoRoot: repo, worktreePath, force: true });
    const after = await listWorktrees(repo);
    expect(after.some((w) => w.path === worktreePath)).toBe(false);
  });

  it('throws WorktreeError when git fails', async () => {
    await expect(
      addWorktree({
        repoRoot: '/x',
        branch: 'b',
        worktreePath: '/x/wt',
        runner: failingRunner({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }),
      }),
    ).rejects.toBeInstanceOf(WorktreeError);
  });
});
