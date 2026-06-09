import { describe, expect, it } from 'vitest';
import { diffGenomes, renderGenomeDiff } from './diff';
import type { Genome } from './genome';

const a: Genome = {
  id: 'g0-n0',
  parents: [],
  primary: 'impeccable',
  overlay: 'none',
  dials: { variance: 5, motion: 5, density: 5 },
  commands: [],
  seed: 1,
  brief: 'A hero section.',
  createdAt: '2026-06-08T00:00:00.000Z',
};

describe('diffGenomes', () => {
  it('returns no entries for identical genomes', () => {
    expect(diffGenomes(a, { ...a })).toEqual([]);
  });

  it('reports each differing field', () => {
    const b: Genome = {
      ...a,
      overlay: 'brutalist',
      dials: { variance: 8, motion: 5, density: 5 },
      commands: ['/bolder'],
    };
    const fields = diffGenomes(a, b).map((entry) => entry.field);
    expect(fields).toEqual(['overlay', 'variance', 'commands']);
  });

  it('renders optional list fields as an em dash when empty', () => {
    const b: Genome = { ...a, sources: ['react-bits'] };
    const entry = diffGenomes(a, b).find((e) => e.field === 'sources');
    expect(entry).toEqual({ field: 'sources', a: '—', b: 'react-bits' });
  });

  it('compares graft instructions', () => {
    const b: Genome = {
      ...a,
      parents: ['g0-n0', 'g0-n1'],
      graft: { parents: ['g0-n0', 'g0-n1'], instructions: "A's type + B's motion" },
    };
    const entry = diffGenomes(a, b).find((e) => e.field === 'graft');
    expect(entry?.b).toBe("A's type + B's motion");
    expect(entry?.a).toBe('—');
  });
});

describe('renderGenomeDiff', () => {
  it('reports identical genomes', () => {
    expect(renderGenomeDiff('g0-n0', a, 'g0-n1', { ...a })).toContain('identical genomes');
  });

  it('renders a header and one line per differing field', () => {
    const b: Genome = { ...a, overlay: 'soft' };
    const text = renderGenomeDiff('g0-n0', a, 'g0-n1', b);
    expect(text).toContain('diff g0-n0 ↔ g0-n1');
    expect(text).toContain('overlay');
    expect(text).toContain('none');
    expect(text).toContain('soft');
  });
});
