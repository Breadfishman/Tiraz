import { describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import type { Fitness, Manifest, VariantNode } from './manifest';
import { createManifest, recordGeneration, upsertNode } from './manifest';
import { renderStatus, renderTree } from './tree';

const config = TirazConfigSchema.parse({});

function fitness(composite: number): Fitness {
  return {
    lintFloor: { passed: true, violations: [] },
    dsAdherence: { score: 80, offSystemValues: [] },
    taste: { rank: 2, derivedScore: composite, panel: [] },
    composite,
  };
}

function node(
  id: string,
  generation: number,
  parents: string[],
  status: VariantNode['status'],
  scored: boolean,
): VariantNode {
  return {
    genome: {
      id,
      parents,
      primary: 'impeccable',
      overlay: 'none',
      dials: { variance: 5, motion: 5, density: 5 },
      commands: [],
      seed: 0,
      brief: 'b',
      createdAt: '2026-06-08T00:00:00.000Z',
    },
    generation,
    branch: `tiraz/${id}`,
    worktree: `/wt/${id}`,
    fitness: scored ? fitness(88) : null,
    status,
  };
}

function manifest(): Manifest {
  let m = createManifest('acme', 'integration', config);
  m = upsertNode(m, node('g0-n0', 0, [], 'survivor', true));
  m = upsertNode(m, node('g0-n1', 0, [], 'pruned', true));
  m = upsertNode(m, node('g1-n0', 1, ['g0-n0'], 'generated', false));
  m = recordGeneration(m, ['g0-n0', 'g0-n1']);
  m = recordGeneration(m, ['g1-n0']);
  return m;
}

describe('renderTree', () => {
  it('renders each generation with status, composite, and lineage', () => {
    const out = renderTree(manifest());
    expect(out).toContain('acme (integration)');
    expect(out).toContain('generation 0');
    expect(out).toContain('generation 1');
    expect(out).toContain('g0-n0');
    expect(out).toContain('composite 88.0');
    expect(out).toContain('survivor');
    expect(out).toContain('⤴ g0-n0'); // lineage for the bred child
    expect(out).toContain('unscored'); // g1-n0 has no fitness yet
  });

  it('notes the promoted node when present', () => {
    const m = { ...manifest(), final: 'g0-n0' };
    expect(renderTree(m)).toContain('promoted: g0-n0');
  });
});

describe('renderStatus', () => {
  it('summarizes generation and per-status counts', () => {
    const out = renderStatus(manifest());
    expect(out).toContain('generations: 2');
    expect(out).toContain('nodes: 3');
    expect(out).toContain('survivor 1');
    expect(out).toContain('pruned 1');
    expect(out).toContain('generated 1');
  });
});
