import { describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import type { Fitness, Manifest, VariantNode } from './manifest';
import { createManifest, recordGeneration, upsertNode } from './manifest';
import {
  BeamError,
  cull,
  favorite,
  lineageClosure,
  pruneGeneration,
  selectSurvivors,
} from './beam';

const config = TirazConfigSchema.parse({});

function fitness(composite: number, lintPassed: boolean): Fitness {
  return {
    lintFloor: { passed: lintPassed, violations: [] },
    dsAdherence: { score: 80, offSystemValues: [] },
    taste: { rank: 1, derivedScore: composite, panel: [] },
    composite,
  };
}

function node(id: string, composite: number, lintPassed = true): VariantNode {
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
    worktree: `/wt/${id}`,
    fitness: fitness(composite, lintPassed),
    status: 'scored',
  };
}

/** A generation of three scored nodes: n0=90, n1=70, n2=fails lint. */
function seeded(): Manifest {
  let m = createManifest('demo', 'greenfield', config);
  m = upsertNode(m, node('g0-n0', 90));
  m = upsertNode(m, node('g0-n1', 70));
  m = upsertNode(m, node('g0-n2', 50, false));
  m = recordGeneration(m, ['g0-n0', 'g0-n1', 'g0-n2']);
  return m;
}

describe('pruneGeneration', () => {
  it('human-only: nothing is auto-pruned; all ids ranked as candidates', () => {
    const result = pruneGeneration(seeded(), 0, { mode: 'human-only', width: 2 });
    expect(result.pruned).toEqual([]);
    expect(result.survivors).toEqual([]);
    expect(result.candidates).toEqual(['g0-n0', 'g0-n1', 'g0-n2']); // composite desc
    expect(result.manifest.nodes['g0-n2']?.status).toBe('scored'); // unchanged
  });

  it('lint-gated: drops lint failures, ranks the passing candidates', () => {
    const result = pruneGeneration(seeded(), 0, { mode: 'lint-gated', width: 2 });
    expect(result.pruned).toEqual(['g0-n2']);
    expect(result.candidates).toEqual(['g0-n0', 'g0-n1']);
    expect(result.manifest.nodes['g0-n2']?.status).toBe('pruned');
    expect(result.manifest.nodes['g0-n0']?.status).toBe('scored');
  });

  it('auto-beam: keeps the top `width` passing variants, prunes the rest', () => {
    const result = pruneGeneration(seeded(), 0, { mode: 'auto-beam', width: 1 });
    expect(result.survivors).toEqual(['g0-n0']);
    expect(result.pruned).toEqual(['g0-n1', 'g0-n2']);
    expect(result.manifest.nodes['g0-n0']?.status).toBe('survivor');
    expect(result.manifest.nodes['g0-n1']?.status).toBe('pruned');
  });

  it('throws on an unscored node', () => {
    let m = createManifest('demo', 'greenfield', config);
    const unscored: VariantNode = { ...node('g0-n0', 0), fitness: null, status: 'generated' };
    m = upsertNode(m, unscored);
    m = recordGeneration(m, ['g0-n0']);
    expect(() => pruneGeneration(m, 0, { mode: 'lint-gated', width: 2 })).toThrow(BeamError);
  });

  it('throws on a non-existent generation', () => {
    expect(() => pruneGeneration(seeded(), 9, { mode: 'lint-gated', width: 2 })).toThrow(BeamError);
  });
});

describe('selectSurvivors', () => {
  it('marks selected nodes as survivors and prunes the rest of their generation', () => {
    const updated = selectSurvivors(seeded(), ['g0-n0']);
    expect(updated.nodes['g0-n0']?.status).toBe('survivor');
    expect(updated.nodes['g0-n1']?.status).toBe('pruned');
    expect(updated.nodes['g0-n2']?.status).toBe('pruned');
  });

  it('throws when selecting an unknown node', () => {
    expect(() => selectSurvivors(seeded(), ['nope'])).toThrow(BeamError);
  });
});

/** A small DAG: g0-n0 → g1-n0 → g2-n0; g0-n1 → g1-n1; recombine g2-r0 has parents [g1-n0, g1-n1]. */
function lineageManifest(): Manifest {
  const child = (id: string, parents: string[], generation: number): VariantNode => ({
    ...node(id, 80),
    generation,
    genome: { ...node(id, 80).genome, id, parents },
  });
  let m = createManifest('demo', 'greenfield', config);
  m = upsertNode(m, node('g0-n0', 90));
  m = upsertNode(m, node('g0-n1', 70));
  m = upsertNode(m, child('g1-n0', ['g0-n0'], 1));
  m = upsertNode(m, child('g1-n1', ['g0-n1'], 1));
  m = upsertNode(m, child('g2-n0', ['g1-n0'], 2));
  m = upsertNode(m, child('g2-r0', ['g1-n0', 'g1-n1'], 2)); // recombination of both chains
  return m;
}

describe('lineageClosure', () => {
  it('sweeps in descendants whose whole ancestry is culled', () => {
    // Culling g0-n0 takes g1-n0 and g2-n0, but NOT g2-r0 (its other parent g1-n1 survives).
    expect(lineageClosure(lineageManifest(), ['g0-n0'])).toEqual(
      new Set(['g0-n0', 'g1-n0', 'g2-n0']),
    );
  });

  it('kills a graft child only when every parent is culled', () => {
    expect(lineageClosure(lineageManifest(), ['g0-n0', 'g0-n1'])).toEqual(
      new Set(['g0-n0', 'g0-n1', 'g1-n0', 'g1-n1', 'g2-n0', 'g2-r0']),
    );
  });

  it('never cascades into seeds (no parents)', () => {
    expect(lineageClosure(lineageManifest(), ['g1-n0'])).toEqual(new Set(['g1-n0', 'g2-n0']));
  });
});

describe('cull', () => {
  it('prunes only the named node without cascade', () => {
    const { manifest, culled } = cull(lineageManifest(), ['g0-n0']);
    expect(culled).toEqual(['g0-n0']);
    expect(manifest.nodes['g0-n0']?.status).toBe('pruned');
    expect(manifest.nodes['g1-n0']?.status).toBe('scored');
  });

  it('prunes the whole lineage with cascade, sparing surviving-parent grafts', () => {
    const { manifest, culled } = cull(lineageManifest(), ['g0-n0'], { cascade: true });
    expect(new Set(culled)).toEqual(new Set(['g0-n0', 'g1-n0', 'g2-n0']));
    expect(manifest.nodes['g2-n0']?.status).toBe('pruned');
    expect(manifest.nodes['g2-r0']?.status).toBe('scored'); // grafted child survives
  });

  it('does not re-report already-pruned nodes', () => {
    const once = cull(lineageManifest(), ['g0-n0'], { cascade: true });
    const twice = cull(once.manifest, ['g0-n0'], { cascade: true });
    expect(twice.culled).toEqual([]);
  });

  it('throws on an unknown node', () => {
    expect(() => cull(lineageManifest(), ['nope'])).toThrow(BeamError);
  });
});

describe('favorite', () => {
  it('marks survivors without pruning siblings', () => {
    const updated = favorite(seeded(), ['g0-n0']);
    expect(updated.nodes['g0-n0']?.status).toBe('survivor');
    expect(updated.nodes['g0-n1']?.status).toBe('scored'); // sibling untouched
    expect(updated.nodes['g0-n2']?.status).toBe('scored');
  });

  it('throws on an unknown node', () => {
    expect(() => favorite(seeded(), ['nope'])).toThrow(BeamError);
  });
});
