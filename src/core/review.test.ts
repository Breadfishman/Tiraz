import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Agent, CommandRunner } from './agent';
import { TirazConfigSchema } from './config';
import type { Genome } from './genome';
import type { Manifest, VariantNode } from './manifest';
import { createManifest, recordGeneration, saveManifest, upsertNode } from './manifest';
import { EMIL_SKILL, ReviewError, reviewVariant } from './review';

const tmpDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-review-'));
  tmpDirs.push(dir);
  return dir;
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

function node(id: string, extra: Partial<VariantNode> = {}): VariantNode {
  return {
    genome: genome(id),
    generation: 0,
    branch: `tiraz/${id}`,
    worktree: `/wt/${id}`,
    fitness: null,
    status: 'survivor',
    ...extra,
  };
}

async function writeManifest(cwd: string, mutate: (m: Manifest) => Manifest): Promise<void> {
  const config = TirazConfigSchema.parse({ mode: 'greenfield' });
  await saveManifest(cwd, mutate(createManifest('fixture', 'greenfield', config)));
}

const okAgent: Agent = {
  run: () =>
    Promise.resolve({ ok: true, exitCode: 0, output: 'Motion feels generic; stagger the cards.' }),
};

function recordingRunner(): {
  runner: CommandRunner;
  calls: { command: string; args: string[] }[];
} {
  const calls: { command: string; args: string[] }[] = [];
  const runner: CommandRunner = (command, args) => {
    calls.push({ command, args });
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  };
  return { runner, calls };
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('reviewVariant', () => {
  it("installs Emil's skill on demand and returns the agent's critique", async () => {
    const cwd = await tempDir();
    await writeManifest(cwd, (m) =>
      recordGeneration(upsertNode(m, node('g0-n0', { screenshot: '/shot/g0-n0.png' })), ['g0-n0']),
    );
    const { runner, calls } = recordingRunner();

    const result = await reviewVariant({ cwd, nodeId: 'g0-n0' }, { agent: okAgent, runner });

    expect(result.nodeId).toBe('g0-n0');
    expect(result.review).toContain('stagger the cards');
    // Emil installed via the agent-skills CLI in the variant's worktree (never vendored).
    const install = calls.find((c) => c.args.includes('add'));
    expect(install?.args).toEqual(['skills', 'add', EMIL_SKILL]);
  });

  it('defaults to the manifest final when no node is given', async () => {
    const cwd = await tempDir();
    await writeManifest(cwd, (m) => {
      let next = recordGeneration(upsertNode(upsertNode(m, node('g0-n0')), node('g0-n1')), [
        'g0-n0',
        'g0-n1',
      ]);
      next = { ...next, final: 'g0-n1' };
      return next;
    });
    const { runner } = recordingRunner();
    const result = await reviewVariant({ cwd }, { agent: okAgent, runner });
    expect(result.nodeId).toBe('g0-n1');
  });

  it('throws when there is no manifest', async () => {
    const cwd = await tempDir();
    await expect(reviewVariant({ cwd }, { agent: okAgent })).rejects.toBeInstanceOf(ReviewError);
  });

  it('throws when the named node is unknown', async () => {
    const cwd = await tempDir();
    await writeManifest(cwd, (m) => recordGeneration(upsertNode(m, node('g0-n0')), ['g0-n0']));
    await expect(
      reviewVariant({ cwd, nodeId: 'nope' }, { agent: okAgent, runner: recordingRunner().runner }),
    ).rejects.toBeInstanceOf(ReviewError);
  });

  it('surfaces a failed skill install as a ReviewError', async () => {
    const cwd = await tempDir();
    await writeManifest(cwd, (m) => recordGeneration(upsertNode(m, node('g0-n0')), ['g0-n0']));
    const runner: CommandRunner = () =>
      Promise.resolve({ exitCode: 1, stdout: '', stderr: 'offline' });
    await expect(
      reviewVariant({ cwd, nodeId: 'g0-n0' }, { agent: okAgent, runner }),
    ).rejects.toThrow(/offline/);
  });

  it('surfaces a failed review agent as a ReviewError', async () => {
    const cwd = await tempDir();
    await writeManifest(cwd, (m) => recordGeneration(upsertNode(m, node('g0-n0')), ['g0-n0']));
    const failingAgent: Agent = {
      run: () => Promise.resolve({ ok: false, exitCode: 1, output: 'boom' }),
    };
    await expect(
      reviewVariant(
        { cwd, nodeId: 'g0-n0' },
        { agent: failingAgent, runner: recordingRunner().runner },
      ),
    ).rejects.toBeInstanceOf(ReviewError);
  });
});
