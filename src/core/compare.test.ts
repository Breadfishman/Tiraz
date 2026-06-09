import { describe, expect, it } from 'vitest';
import { renderCompareHtml } from './compare';
import { TirazConfigSchema } from './config';
import type { Fitness, Manifest, VariantNode } from './manifest';
import { createManifest, recordGeneration, upsertNode } from './manifest';

function fitness(composite: number, rank: number, pass: boolean): Fitness {
  return {
    lintFloor: { passed: pass, violations: [] },
    dsAdherence: { score: 80, offSystemValues: [] },
    taste: { rank, derivedScore: composite, panel: [] },
    composite,
  };
}

function node(id: string, opts: Partial<VariantNode> = {}): VariantNode {
  return {
    genome: {
      id,
      parents: [],
      primary: 'impeccable',
      overlay: 'none',
      dials: { variance: 7, motion: 3, density: 6 },
      commands: [],
      seed: 0,
      brief: 'A hero section',
      createdAt: '2026-06-09T00:00:00.000Z',
    },
    generation: 0,
    branch: `tiraz/${id}`,
    worktree: `/repo/.tiraz/worktrees/${id}`,
    screenshot: `/repo/.tiraz/screenshots/${id}.png`,
    fitness: null,
    status: 'generated',
    ...opts,
  };
}

function manifestWith(nodes: VariantNode[], generations: string[][]): Manifest {
  let m = createManifest('demo', 'integration', TirazConfigSchema.parse({}));
  for (const n of nodes) m = upsertNode(m, n);
  for (const gen of generations) m = recordGeneration(m, gen);
  return m;
}

describe('renderCompareHtml', () => {
  it('renders a card per variant with its genome, and relative screenshot srcs', () => {
    const m = manifestWith([node('g0-n0'), node('g0-n1')], [['g0-n0', 'g0-n1']]);
    const html = renderCompareHtml(m, { outDir: '/repo/.tiraz' });

    expect(html).toContain('g0-n0');
    expect(html).toContain('g0-n1');
    // screenshot src is relative to the HTML's dir, forward-slashed
    expect(html).toContain('src="screenshots/g0-n0.png"');
    expect(html).toContain('variance 7 · motion 3 · density 6');
    // self-contained: includes the lightbox script + the slide list
    expect(html).toContain('<script>');
    expect(html).toContain('"id":"g0-n0"');
  });

  it('shows fitness and marks the best-composite variant per generation', () => {
    const m = manifestWith(
      [
        node('g0-n0', { fitness: fitness(82, 1, true), status: 'survivor' }),
        node('g0-n1', { fitness: fitness(55, 2, false), status: 'pruned' }),
      ],
      [['g0-n0', 'g0-n1']],
    );
    const html = renderCompareHtml(m, { outDir: '/repo/.tiraz' });
    expect(html).toContain('82</b> composite');
    expect(html).toContain('lint ✓');
    expect(html).toContain('lint ✗');
    expect(html).toContain('★ best'); // highest composite flagged
    expect(html).toContain('taste #1');
  });

  it('escapes HTML in user content (briefs / graft instructions)', () => {
    const evil = node('g0-n0');
    evil.genome.brief = 'A <script>alert(1)</script> hero';
    const html = renderCompareHtml(manifestWith([evil], [['g0-n0']]), { outDir: '/repo/.tiraz' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('handles a variant with no screenshot', () => {
    const m = manifestWith([node('g0-n0', { screenshot: undefined })], [['g0-n0']]);
    const html = renderCompareHtml(m, { outDir: '/repo/.tiraz' });
    expect(html).toContain('not rendered');
  });
});
