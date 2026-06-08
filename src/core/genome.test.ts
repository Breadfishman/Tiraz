import { describe, expect, it } from 'vitest';
import type { Genome } from './genome';
import { GenomeSchema, GraftSpecSchema, genomeId, parseGenomeId } from './genome';

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
