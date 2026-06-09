import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandRunner } from './agent';
import { spawnRunner } from './agent';
import { TirazConfigSchema } from './config';
import type { Genome } from './genome';
import type { Manifest, VariantNode } from './manifest';
import {
  createManifest,
  loadManifest,
  recordGeneration,
  saveManifest,
  upsertNode,
} from './manifest';
import { PromoteError, promoteVariant } from './promote';
import { addWorktree } from './worktree';

const tmpDirs: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function genome(id: string): Genome {
  return {
    id,
    parents: [],
    primary: 'impeccable',
    overlay: 'none',
    dials: { variance: 5, motion: 5, density: 5 },
    commands: [],
    seed: 0,
    brief: 'A hero section.',
    createdAt: '2026-06-08T00:00:00.000Z',
  };
}

function node(id: string, branch: string, worktree: string): VariantNode {
  return { genome: genome(id), generation: 0, branch, worktree, fitness: null, status: 'survivor' };
}

async function manifestWith(cwd: string, mode: Manifest['mode'], n: VariantNode): Promise<void> {
  const config = TirazConfigSchema.parse({ mode });
  const manifest = recordGeneration(upsertNode(createManifest('fixture', mode, config), n), [
    n.genome.id,
  ]);
  await saveManifest(cwd, manifest);
}

async function initGreenfieldRepo(): Promise<string> {
  const dir = await tempDir('tiraz-promote-');
  await spawnRunner('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await spawnRunner('git', ['config', 'user.email', 'test@tiraz.dev'], { cwd: dir });
  await spawnRunner('git', ['config', 'user.name', 'Tiraz Test'], { cwd: dir });
  await writeFile(path.join(dir, 'README.md'), '# fixture\n', 'utf8');
  await spawnRunner('git', ['add', '-A'], { cwd: dir });
  await spawnRunner('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('promoteVariant (greenfield)', () => {
  it('merges the variant branch into base, tears down the worktree, and records final', async () => {
    const repo = await initGreenfieldRepo();
    const branch = 'tiraz/g0-n0';
    const worktreePath = path.join(repo, '.tiraz', 'worktrees', 'g0-n0');
    await mkdir(path.dirname(worktreePath), { recursive: true });
    await addWorktree({ repoRoot: repo, branch, worktreePath, runner: spawnRunner });
    await writeFile(path.join(worktreePath, 'variant.txt'), 'hi\n', 'utf8');
    await spawnRunner('git', ['add', '-A'], { cwd: worktreePath });
    await spawnRunner('git', ['commit', '-q', '-m', 'variant work'], { cwd: worktreePath });
    await manifestWith(repo, 'greenfield', node('g0-n0', branch, worktreePath));

    const result = await promoteVariant({ cwd: repo, nodeId: 'g0-n0' }, { runner: spawnRunner });

    expect(result.mode).toBe('greenfield');
    expect(result.prUrl).toBeUndefined();
    // The variant's work landed on main, and its worktree is gone.
    expect(await exists(path.join(repo, 'variant.txt'))).toBe(true);
    expect(await exists(worktreePath)).toBe(false);

    const manifest = await loadManifest(repo);
    expect(manifest?.final).toBe('g0-n0');
    expect(manifest?.nodes['g0-n0']?.status).toBe('promoted');
  });
});

describe('promoteVariant (integration)', () => {
  it('pushes the branch and opens a PR via gh, capturing its URL', async () => {
    const repo = await tempDir('tiraz-promote-int-');
    const calls: { command: string; args: string[] }[] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push({ command, args });
      if (command === 'gh') {
        return Promise.resolve({
          exitCode: 0,
          stdout: 'https://github.com/o/r/pull/7\n',
          stderr: '',
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    await manifestWith(repo, 'integration', node('g0-n0', 'tiraz/g0-n0', '/wt/g0-n0'));

    const result = await promoteVariant(
      { cwd: repo, nodeId: 'g0-n0', base: 'develop' },
      { runner },
    );

    expect(result.mode).toBe('integration');
    expect(result.prUrl).toBe('https://github.com/o/r/pull/7');
    expect(calls.some((c) => c.command === 'git' && c.args[0] === 'push')).toBe(true);
    const gh = calls.find((c) => c.command === 'gh');
    expect(gh?.args).toContain('--base');
    expect(gh?.args).toContain('develop');

    const manifest = await loadManifest(repo);
    expect(manifest?.nodes['g0-n0']?.status).toBe('promoted');
    expect(manifest?.final).toBe('g0-n0');
  });
});

describe('promoteVariant (errors)', () => {
  it('throws when there is no manifest', async () => {
    const repo = await tempDir('tiraz-promote-none-');
    await expect(promoteVariant({ cwd: repo, nodeId: 'g0-n0' })).rejects.toBeInstanceOf(
      PromoteError,
    );
  });

  it('throws when the node is unknown', async () => {
    const repo = await tempDir('tiraz-promote-unk-');
    await manifestWith(repo, 'integration', node('g0-n0', 'tiraz/g0-n0', '/wt/g0-n0'));
    await expect(promoteVariant({ cwd: repo, nodeId: 'nope' })).rejects.toBeInstanceOf(
      PromoteError,
    );
  });

  it('surfaces a failed command as a PromoteError', async () => {
    const repo = await tempDir('tiraz-promote-fail-');
    const runner: CommandRunner = () =>
      Promise.resolve({ exitCode: 1, stdout: '', stderr: 'no remote configured' });
    await manifestWith(repo, 'integration', node('g0-n0', 'tiraz/g0-n0', '/wt/g0-n0'));
    await expect(promoteVariant({ cwd: repo, nodeId: 'g0-n0' }, { runner })).rejects.toThrow(
      /no remote configured/,
    );
  });
});
