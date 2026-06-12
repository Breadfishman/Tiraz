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
    // view controls (present regardless of actions): fullscreen + side-by-side compare
    expect(html).toContain('id="fsbtn"');
    expect(html).toContain('requestFullscreen');
    expect(html).toContain('id="cmp-toggle"');
    expect(html).toContain('id="comparewrap"');
    expect(html).toContain('renderCompare');
  });

  it('collapses the action controls into an Actions dropdown (decluttered top)', () => {
    const m = manifestWith([node('g0-n0')], [['g0-n0']]);
    const html = renderDashboardHtml(m, { 'g0-n0': 'http://x/1' }, { actionsEnabled: true });
    // The action buttons live inside a <details> dropdown rather than an always-open bar.
    expect(html).toContain('class="actmenu"');
    expect(html).toMatch(/<details class="actmenu">[\s\S]*id="act-heart"[\s\S]*<\/details>/);
    // Compare is available alongside the dropdown.
    expect(html).toContain('id="cmp-toggle"');
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

  it('omits the action controls by default', () => {
    const m = manifestWith([node('g0-n0')], [['g0-n0']]);
    const html = renderDashboardHtml(m, { 'g0-n0': 'http://x/1' });
    expect(html).not.toContain('id="act-breed"');
    expect(html).toContain('const actionsEnabled = false;');
  });

  it('renders the full cockpit (heart/cull/focus/breed/combine/promote) when actions are enabled', () => {
    const m = manifestWith([node('g0-n0')], [['g0-n0']]);
    const html = renderDashboardHtml(m, { 'g0-n0': 'http://x/1' }, { actionsEnabled: true });
    expect(html).toContain('id="act-heart"');
    expect(html).toContain('id="act-cull"');
    expect(html).toContain('id="act-cull-lineage"');
    expect(html).toContain('id="act-focus"');
    expect(html).toContain('id="act-breed"');
    expect(html).toContain('id="act-combine-start"');
    expect(html).toContain('id="act-promote"');
    expect(html).toContain('const actionsEnabled = true;');
    expect(html).toContain("'/api/favorite'");
    expect(html).toContain("'/api/cull'");
    expect(html).toContain("'/api/select'"); // focus
    expect(html).toContain("post('/api/breed'");
    expect(html).toContain("post('/api/recombine'");
    expect(html).toContain("post('/api/promote'");
  });

  it('renders the snapshot controls and lists provided snapshots', () => {
    const m = manifestWith([node('g0-n0')], [['g0-n0']]);
    const html = renderDashboardHtml(
      m,
      { 'g0-n0': 'http://x/1' },
      {
        actionsEnabled: true,
        snapshots: [
          { id: 'liked-these', label: 'liked these', createdAt: 'x', nodes: 5, generations: 1 },
        ],
      },
    );
    expect(html).toContain('id="act-snapshot"');
    expect(html).toContain('id="act-restore"');
    expect(html).toContain("post('/api/snapshot'");
    expect(html).toContain("post('/api/snapshot-restore'");
    expect(html).toContain('value="liked-these"');
    expect(html).toContain('liked these · 5v');
  });

  it('surfaces the per-lens judge rationale in the variant data', () => {
    const m = manifestWith(
      [
        node('g0-n0', {
          fitness: {
            ...fitness(80, 1, true),
            taste: {
              rank: 1,
              derivedScore: 80,
              panel: [{ lens: 'layout', model: 'x', rationale: 'asymmetric grid with tension' }],
            },
          },
        }),
      ],
      [['g0-n0']],
    );
    const html = renderDashboardHtml(m, { 'g0-n0': 'http://x/1' });
    expect(html).toContain('asymmetric grid with tension');
    expect(html).toContain('"lens":"layout"');
  });

  it('renders the config & resources panel with toggles and hyperlinks', () => {
    const m = manifestWith([node('g0-n0')], [['g0-n0']]);
    const html = renderDashboardHtml(
      m,
      { 'g0-n0': 'http://x/1' },
      {
        actionsEnabled: true,
        resources: {
          skills: { primary: 'impeccable', overlay: 'none' },
          modules: { threeD: false, remotion: false },
          dials: { variance: 7, motion: 3, density: 6 },
          weights: { dsAdherence: 0.4, taste: 0.6 },
          fetchMode: 'install',
          fetchBudget: 6,
          twentyFirst: false,
          diversity: 'diverse',
          sources: [
            {
              id: 'magic-ui',
              name: 'Magic UI',
              tier: 'bundled',
              url: 'https://magicui.design',
              license: 'MIT',
              enabled: true,
              restricted: false,
            },
          ],
          capabilities: [
            {
              id: 'gsap',
              name: 'GSAP',
              category: 'animation',
              module: 'core',
              url: 'https://www.npmjs.com/package/gsap',
              license: 'MIT',
              enabled: true,
              restricted: false,
            },
          ],
        },
      },
    );
    expect(html).toContain('Config &amp; resources');
    expect(html).toContain('href="https://magicui.design"');
    expect(html).toContain('href="https://www.npmjs.com/package/gsap"');
    expect(html).toContain('data-kind="source" data-id="magic-ui"');
    expect(html).toContain('data-kind="module" data-id="threeD"');
    // Genuine-fetch toggle (the off switch for the default-on install mode), reflecting current mode.
    expect(html).toContain('data-kind="fetchmode" data-id="fetchmode"');
    expect(html).toContain('Fetch real components from sources (install)');
    expect(html).toContain("post('/api/config'");
    // Skill selects (primary seed + overlay) with the active values pre-selected.
    expect(html).toContain('id="cfg-primary"');
    expect(html).toContain('id="cfg-overlay"');
    expect(html).toContain('<option value="impeccable" selected>');
    expect(html).toContain('<option value="redesign-existing-projects">');
    expect(html).toContain('<option value="none" selected>'); // overlay default
    expect(html).toContain("wireSkill('cfg-primary', 'primary')");
    expect(html).toContain("wireSkill('cfg-overlay', 'overlay')");
    // gen-0 diversity selector
    expect(html).toContain('id="cfg-diversity"');
    expect(html).toContain("wireSkill('cfg-diversity', 'diversity')");
    expect(html).toContain("post('/api/config', { kind, id: sel.value");
    // Integration-mode note about the forced primary.
    expect(html).toContain('redesign-existing-projects');
    // Design-dial sliders reflecting the current values.
    expect(html).toContain('data-dial="variance"');
    expect(html).toContain('data-dial="motion"');
    expect(html).toContain('data-dial="density"');
    expect(html).toContain("kind: 'dial'");
    // Fitness taste↔DS weight slider showing 60% taste.
    expect(html).toContain('id="cfg-taste"');
    expect(html).toContain('60% taste');
    expect(html).toContain("kind: 'weight'");
  });

  it('renders a "Score latest" action that posts to /api/score', () => {
    const m = manifestWith([node('g0-n0')], [['g0-n0']]);
    const html = renderDashboardHtml(m, { 'g0-n0': 'http://x/1' }, { actionsEnabled: true });
    expect(html).toContain('id="act-score"');
    expect(html).toContain("post('/api/score'");
  });

  it('marks survivor / promoted status on sidebar items and groups by generation', () => {
    const m = manifestWith(
      [
        node('g0-n0', { status: 'survivor' }),
        node('g0-n1', { status: 'promoted' }),
        node('g0-n2', { status: 'pruned' }),
      ],
      [['g0-n0', 'g0-n1', 'g0-n2']],
    );
    const html = renderDashboardHtml(m, {});
    expect(html).toContain('item s-survivor');
    expect(html).toContain('item s-promoted');
    expect(html).toContain('item s-pruned');
    expect(html).toContain('♥'); // survivor mark
    expect(html).toContain('⬆'); // promoted mark
    expect(html).toContain('generation 0'); // lineage grouping header
  });

  it('annotates a child variant with its parents in the sidebar', () => {
    const child = node('g1-n0', {
      generation: 1,
      genome: { ...node('g1-n0').genome, parents: ['g0-n0'] },
    });
    const m = manifestWith([node('g0-n0'), child], [['g0-n0'], ['g1-n0']]);
    const html = renderDashboardHtml(m, {});
    expect(html).toContain('← g0-n0');
    expect(html).toContain('generation 1');
  });
});
