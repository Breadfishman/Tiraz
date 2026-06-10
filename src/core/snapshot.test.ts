import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import type { VariantNode } from './manifest';
import {
  createManifest,
  loadManifest,
  recordGeneration,
  saveManifest,
  upsertNode,
} from './manifest';
import { SnapshotError, listSnapshots, restoreSnapshot, saveSnapshot } from './snapshot';

const config = TirazConfigSchema.parse({});
const tmpDirs: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-snapshot-'));
  tmpDirs.push(dir);
  return dir;
}

function node(id: string, status: VariantNode['status']): VariantNode {
  return {
    genome: {
      id,
      parents: [],
      primary: 'impeccable',
      overlay: 'none',
      dials: { variance: 5, motion: 5, density: 5 },
      commands: [],
      seed: 0,
      brief: 'b',
      createdAt: '2026-06-08T00:00:00.000Z',
    },
    generation: 0,
    branch: `tiraz/${id}`,
    worktree: `/tmp/${id}`,
    fitness: null,
    status,
  };
}

async function seed(cwd: string): Promise<void> {
  let m = createManifest('demo', 'greenfield', config);
  m = upsertNode(m, node('g0-n0', 'survivor'));
  m = upsertNode(m, node('g0-n1', 'scored'));
  m = recordGeneration(m, ['g0-n0', 'g0-n1']);
  await saveManifest(cwd, m);
}

const clock = (iso: string) => (): string => iso;

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('saveSnapshot / listSnapshots', () => {
  it('captures the manifest with metadata and lists it', async () => {
    const cwd = await tempProject();
    await seed(cwd);
    const meta = await saveSnapshot(cwd, 'liked these', { now: clock('2026-06-10T10:00:00.000Z') });
    expect(meta).toMatchObject({ label: 'liked these', nodes: 2, generations: 1 });
    expect(meta.id).toBe('liked-these');
    expect(await listSnapshots(cwd)).toEqual([meta]);
  });

  it('disambiguates ids when the same label is reused', async () => {
    const cwd = await tempProject();
    await seed(cwd);
    const a = await saveSnapshot(cwd, 'round', { now: clock('2026-06-10T10:00:00.000Z') });
    const b = await saveSnapshot(cwd, 'round', { now: clock('2026-06-10T10:01:00.000Z') });
    expect(a.id).toBe('round');
    expect(b.id).toBe('round-2');
    expect((await listSnapshots(cwd)).map((s) => s.id)).toEqual(['round', 'round-2']);
  });

  it('returns [] when there are no snapshots', async () => {
    expect(await listSnapshots(await tempProject())).toEqual([]);
  });

  it('throws when there is no manifest to snapshot', async () => {
    await expect(saveSnapshot(await tempProject(), 'x')).rejects.toBeInstanceOf(SnapshotError);
  });
});

describe('restoreSnapshot', () => {
  it('reverts the manifest to the snapshot and auto-checkpoints the current state first', async () => {
    const cwd = await tempProject();
    await seed(cwd);
    await saveSnapshot(cwd, 'checkpoint', { now: clock('2026-06-10T10:00:00.000Z') });

    // Mutate after the snapshot: cull g0-n1.
    const current = await loadManifest(cwd);
    await saveManifest(cwd, upsertNode(current!, { ...node('g0-n1', 'pruned') }));
    expect((await loadManifest(cwd))?.nodes['g0-n1']?.status).toBe('pruned');

    const restored = await restoreSnapshot(cwd, 'checkpoint', {
      now: clock('2026-06-10T11:00:00.000Z'),
    });
    expect(restored.nodes['g0-n1']?.status).toBe('scored'); // reverted
    expect((await loadManifest(cwd))?.nodes['g0-n1']?.status).toBe('scored');

    // The pre-restore state was auto-saved so the revert is itself reversible.
    const ids = (await listSnapshots(cwd)).map((s) => s.id);
    expect(ids).toContain('auto-before-restore');
  });

  it('throws for an unknown snapshot', async () => {
    const cwd = await tempProject();
    await seed(cwd);
    await expect(restoreSnapshot(cwd, 'nope')).rejects.toBeInstanceOf(SnapshotError);
  });
});
