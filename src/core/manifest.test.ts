import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import type { TirazConfig } from './config';
import type { VariantNode } from './manifest';
import {
  MANIFEST_DIR,
  MANIFEST_FILENAME,
  ManifestError,
  createManifest,
  loadManifest,
  manifestPath,
  recordGeneration,
  saveManifest,
  upsertNode,
} from './manifest';

const config: TirazConfig = TirazConfigSchema.parse({});
const tmpDirs: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-manifest-'));
  tmpDirs.push(dir);
  return dir;
}

function makeNode(id: string): VariantNode {
  return {
    genome: {
      id,
      parents: [],
      primary: 'impeccable',
      overlay: 'none',
      dials: { variance: 5, motion: 5, density: 5 },
      commands: [],
      seed: 1,
      brief: 'brief',
      createdAt: '2026-06-08T00:00:00.000Z',
    },
    generation: 0,
    branch: `tiraz/${id}`,
    worktree: `/tmp/${id}`,
    fitness: null,
    status: 'generated',
  };
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('manifestPath', () => {
  it('points at .tiraz/manifest.json', () => {
    expect(manifestPath('/proj')).toBe(path.join('/proj', MANIFEST_DIR, MANIFEST_FILENAME));
  });
});

describe('pure manifest helpers', () => {
  it('creates an empty manifest', () => {
    const m = createManifest('demo', 'greenfield', config);
    expect(m).toMatchObject({ project: 'demo', mode: 'greenfield', nodes: {}, generations: [] });
  });

  it('upserts nodes without mutating the original', () => {
    const m0 = createManifest('demo', 'greenfield', config);
    const m1 = upsertNode(m0, makeNode('g0-n0'));
    expect(Object.keys(m0.nodes)).toEqual([]);
    expect(Object.keys(m1.nodes)).toEqual(['g0-n0']);
  });

  it('replaces a node with the same id', () => {
    let m = createManifest('demo', 'greenfield', config);
    m = upsertNode(m, makeNode('g0-n0'));
    m = upsertNode(m, { ...makeNode('g0-n0'), status: 'survivor' });
    expect(Object.keys(m.nodes)).toEqual(['g0-n0']);
    expect(m.nodes['g0-n0']?.status).toBe('survivor');
  });

  it('records generations in order', () => {
    let m = createManifest('demo', 'greenfield', config);
    m = recordGeneration(m, ['g0-n0', 'g0-n1']);
    m = recordGeneration(m, ['g1-n0']);
    expect(m.generations).toEqual([['g0-n0', 'g0-n1'], ['g1-n0']]);
  });
});

describe('loadManifest / saveManifest', () => {
  it('round-trips a manifest through disk', async () => {
    const dir = await tempProject();
    const original = recordGeneration(
      upsertNode(createManifest('demo', 'integration', config), makeNode('g0-n0')),
      ['g0-n0'],
    );
    const written = await saveManifest(dir, original);
    expect(written).toBe(manifestPath(dir));
    expect(await loadManifest(dir)).toEqual(original);
  });

  it('returns null when no manifest exists', async () => {
    const dir = await tempProject();
    expect(await loadManifest(dir)).toBeNull();
  });

  it('throws ManifestError on malformed JSON', async () => {
    const dir = await tempProject();
    await mkdir(path.join(dir, MANIFEST_DIR), { recursive: true });
    await writeFile(manifestPath(dir), '{ broken ', 'utf8');
    await expect(loadManifest(dir)).rejects.toBeInstanceOf(ManifestError);
  });

  it('throws ManifestError on a schema violation', async () => {
    const dir = await tempProject();
    const bad = upsertNode(createManifest('demo', 'greenfield', config), makeNode('g0-n0'));
    const corrupt = JSON.parse(JSON.stringify(bad)) as Record<string, unknown>;
    const nodes = corrupt.nodes as Record<string, Record<string, unknown>>;
    nodes['g0-n0']!.status = 'not-a-status';
    await mkdir(path.join(dir, MANIFEST_DIR), { recursive: true });
    await writeFile(manifestPath(dir), JSON.stringify(corrupt), 'utf8');
    await expect(loadManifest(dir)).rejects.toThrow(/status/);
  });

  it('reports a non-object manifest as a root-level issue', async () => {
    const dir = await tempProject();
    await mkdir(path.join(dir, MANIFEST_DIR), { recursive: true });
    await writeFile(manifestPath(dir), '[]', 'utf8');
    await expect(loadManifest(dir)).rejects.toThrow(/\(root\)/);
  });

  it('re-throws non-ENOENT filesystem errors unchanged', async () => {
    const dir = await tempProject();
    // Make the manifest path a directory so readFile yields EISDIR, not ENOENT.
    await mkdir(manifestPath(dir), { recursive: true });
    await expect(loadManifest(dir)).rejects.not.toBeInstanceOf(ManifestError);
  });
});
