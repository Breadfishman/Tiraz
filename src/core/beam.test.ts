import { describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import type { Fitness, Manifest, VariantNode } from './manifest';
import { createManifest, recordGeneration, upsertNode } from './manifest';
import { BeamError, pruneGeneration, selectSurvivors } from './beam';

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
