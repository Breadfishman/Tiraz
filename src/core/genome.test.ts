import { describe, expect, it } from 'vitest';
import type { Genome } from './genome';
import { GenomeSchema, GraftSpecSchema, genomeId, mutateGenome, parseGenomeId } from './genome';

const base: Genome = {
  id: 'g0-n0',
  parents: [],
  primary: 'impeccable',
  overlay: 'none',
  dials: { variance: 5, motion: 5, density: 5 },
  commands: [],
  seed: 1,
  brief: 'A hero section for a coffee roaster.',
  createdAt: '2026-06-08T00:00:00.000Z',
};

describe('GenomeSchema', () => {
  it('accepts a minimal valid genome', () => {
    expect(GenomeSchema.safeParse(base).success).toBe(true);
  });

  it('accepts optional fields (sources, target, graft)', () => {
    const full: Genome = {
      ...base,
      parents: ['g0-n0', 'g0-n1'],
      sources: ['react-bits'],
      target: 'component:src/Button.tsx',
      graft: { parents: ['g0-n0', 'g0-n1'], instructions: "A's type + B's motion" },
    };
    expect(GenomeSchema.safeParse(full).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(GenomeSchema.safeParse({ ...base, bogus: 1 }).success).toBe(false);
  });

  it('rejects an out-of-range dial', () => {
    expect(
      GenomeSchema.safeParse({ ...base, dials: { variance: 0, motion: 5, density: 5 } }).success,
    ).toBe(false);
  });
});

describe('GraftSpecSchema', () => {
  it('requires at least two parents', () => {
    expect(GraftSpecSchema.safeParse({ parents: ['a'], instructions: 'x' }).success).toBe(false);
  });

  it('requires non-empty instructions', () => {
    expect(GraftSpecSchema.safeParse({ parents: ['a', 'b'], instructions: '' }).success).toBe(
      false,
    );
  });

  it('accepts a well-formed graft', () => {
    expect(
      GraftSpecSchema.safeParse({
        parents: ['a', 'b'],
        instructions: 'graft it',
        axes: ['typography', 'motion'],
      }).success,
    ).toBe(true);
  });
});

describe('genomeId / parseGenomeId', () => {
  it('builds a canonical id', () => {
    expect(genomeId(2, 3)).toBe('g2-n3');
  });

  it('round-trips a canonical id', () => {
    expect(parseGenomeId(genomeId(2, 3))).toEqual({ generation: 2, node: 3 });
  });

  it('returns null for a malformed id', () => {
    expect(parseGenomeId('not-an-id')).toBeNull();
    expect(parseGenomeId('g2-x3')).toBeNull();
  });
});

describe('mutateGenome', () => {
  const ctx = { id: 'g1-n0', createdAt: '2026-06-08T01:00:00.000Z' };

  it('records the parent and stamps the new id/timestamp', () => {
    const child = mutateGenome(base, ctx, 0);
    expect(child.parents).toEqual(['g0-n0']);
    expect(child.id).toBe('g1-n0');
    expect(child.createdAt).toBe('2026-06-08T01:00:00.000Z');
    expect(child.seed).toBe(base.seed + 0 + 1);
  });

  it('nudges a single dial up or down by index', () => {
    expect(mutateGenome(base, ctx, 0).dials.variance).toBe(6); // +1
    expect(mutateGenome(base, ctx, 1).dials.variance).toBe(4); // -1
    expect(mutateGenome(base, ctx, 2).dials.motion).toBe(6); // +1
  });

  it('clamps dials to the 1–10 range', () => {
    const maxed = { ...base, dials: { variance: 10, motion: 1, density: 5 } };
    expect(mutateGenome(maxed, ctx, 0).dials.variance).toBe(10); // +1 clamped
    expect(mutateGenome(maxed, ctx, 3).dials.motion).toBe(1); // -1 clamped
  });

  it('appends a command for higher indices', () => {
    const child = mutateGenome(base, ctx, 6); // first command mutation
    expect(child.commands).toEqual(['/bolder']);
    expect(child.dials).toEqual(base.dials);
  });

  it('wraps negative indices into range', () => {
    expect(() => mutateGenome(base, ctx, -1)).not.toThrow();
    expect(mutateGenome(base, ctx, -1).parents).toEqual(['g0-n0']);
  });
});
