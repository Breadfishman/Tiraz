import { describe, expect, it } from 'vitest';
import { renderDashboardHtml } from './dashboard';
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
      brief: 'A hero',
      createdAt: '2026-06-09T00:00:00.000Z',
    },
    generation: 0,
    branch: `tiraz/${id}`,
    worktree: `/repo/.tiraz/worktrees/${id}`,
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

describe('renderDashboardHtml', () => {
  it('lists every variant in the sidebar and embeds the live endpoints', () => {
    const m = manifestWith([node('g0-n0'), node('g0-n1')], [['g0-n0', 'g0-n1']]);
    const html = renderDashboardHtml(m, {
      'g0-n0': 'http://localhost:41000/iframe.html?id=hero--default',
      'g0-n1': 'http://localhost:41001/iframe.html?id=hero--default',
    });
    expect(html).toContain('data-id="g0-n0"');
    expect(html).toContain('data-id="g0-n1"');
    // endpoints embedded for the client switcher
    expect(html).toContain('http://localhost:41000/iframe.html?id=hero--default');
    expect(html).toContain('<iframe');
  });

  it('marks a variant with no live endpoint as not running (disabled)', () => {
    const m = manifestWith([node('g0-n0')], [['g0-n0']]);
    const html = renderDashboardHtml(m, {}); // no endpoints
    expect(html).toContain('not running');
    expect(html).toContain('disabled');
  });

  it('flags the best-composite variant and surfaces fitness in the data', () => {
    const m = manifestWith(
      [
        node('g0-n0', { fitness: fitness(82, 1, true) }),
        node('g0-n1', { fitness: fitness(55, 2, false) }),
      ],
      [['g0-n0', 'g0-n1']],
    );
    const html = renderDashboardHtml(m, { 'g0-n0': 'http://x/1', 'g0-n1': 'http://x/2' });
    expect(html).toContain('★'); // best flagged
    expect(html).toContain('"composite":82');
  });

  it('escapes the project name', () => {
    const m = manifestWith([node('g0-n0')], [['g0-n0']]);
    m.project = '<b>x</b>';
    const html = renderDashboardHtml(m, {});
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
