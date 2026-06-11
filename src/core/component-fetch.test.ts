import { describe, expect, it } from 'vitest';
import {
  COMPONENT_REGISTRY,
  buildFetchCommand,
  fetchedComponentNames,
  itemUrl,
  registryFor,
  resolveFetchPlan,
} from './component-fetch';

describe('COMPONENT_REGISTRY', () => {
  it('ships only verified shadcn-registry entries (each live-confirmed)', () => {
    expect(COMPONENT_REGISTRY.map((r) => r.id).sort()).toEqual([
      'aceternity',
      'cult-ui',
      'eldora-ui',
      'kokonut-ui',
      'magic-ui',
      'react-bits',
      'smoothui',
    ]);
    for (const reg of COMPONENT_REGISTRY) {
      expect(reg.transport).toBe('shadcn-registry');
      expect(reg.urlTemplate).toContain('{name}');
      expect(reg.items.length).toBeGreaterThan(0);
    }
  });
});

describe('registryFor', () => {
  it('looks up by id', () => {
    expect(registryFor('magic-ui')?.urlTemplate).toBe('https://magicui.design/r/{name}.json');
    expect(registryFor('cult-ui')?.items).toEqual(['shift-card']);
  });

  it('returns undefined for an unknown / signatures-only source', () => {
    // motion-primitives is permitted by default but has no verified registry entry yet.
    expect(registryFor('motion-primitives')).toBeUndefined();
    expect(registryFor('nope')).toBeUndefined();
  });
});

describe('itemUrl', () => {
  it('substitutes {name} with the item slug', () => {
    const reg = registryFor('magic-ui');
    expect(reg).toBeDefined();
    expect(itemUrl(reg!, 'marquee')).toBe('https://magicui.design/r/marquee.json');
    expect(itemUrl(registryFor('kokonut-ui')!, 'card-stack')).toBe(
      'https://kokonutui.com/r/card-stack.json',
    );
  });
});

describe('resolveFetchPlan', () => {
  it('expands a single registry source into its items, capped by budget', () => {
    const plan = resolveFetchPlan(['magic-ui'], { budget: 2 });
    expect(plan).toEqual([
      { source: 'magic-ui', item: 'marquee', url: 'https://magicui.design/r/marquee.json' },
      { source: 'magic-ui', item: 'bento-grid', url: 'https://magicui.design/r/bento-grid.json' },
    ]);
  });

  it('interleaves across sources round-robin so a small budget spans multiple sources', () => {
    const plan = resolveFetchPlan(['magic-ui', 'cult-ui', 'kokonut-ui'], { budget: 3 });
    // First column takes one item from each source before any source's second item.
    expect(plan.map((r) => r.source)).toEqual(['magic-ui', 'cult-ui', 'kokonut-ui']);
    expect(plan.map((r) => r.item)).toEqual(['marquee', 'shift-card', 'card-stack']);
  });

  it('continues to the next column once short lanes are exhausted', () => {
    const plan = resolveFetchPlan(['magic-ui', 'cult-ui'], { budget: 10 });
    // magic-ui has 3 items, cult-ui has 1: m0, c0, m1, m2.
    expect(plan.map((r) => `${r.source}/${r.item}`)).toEqual([
      'magic-ui/marquee',
      'cult-ui/shift-card',
      'magic-ui/bento-grid',
      'magic-ui/border-beam',
    ]);
  });

  it('is deterministic and stable across calls', () => {
    const a = resolveFetchPlan(['magic-ui', 'kokonut-ui'], { budget: 5 });
    const b = resolveFetchPlan(['magic-ui', 'kokonut-ui'], { budget: 5 });
    expect(a).toEqual(b);
  });

  it('skips permitted sources without a verified registry entry', () => {
    const plan = resolveFetchPlan(['motion-primitives', 'magic-ui', 'unknown'], { budget: 5 });
    expect(plan.every((r) => r.source === 'magic-ui')).toBe(true);
    expect(plan.length).toBe(3);
  });

  it('dedupes a source listed more than once (e.g. bundled + fetch) into one lane', () => {
    const plan = resolveFetchPlan(['magic-ui', 'magic-ui'], { budget: 5 });
    expect(plan.map((r) => r.item)).toEqual(['marquee', 'bento-grid', 'border-beam']);
  });

  it('returns [] for an empty budget, zero, or negative budget', () => {
    expect(resolveFetchPlan(['magic-ui'], { budget: 0 })).toEqual([]);
    expect(resolveFetchPlan(['magic-ui'], { budget: -3 })).toEqual([]);
  });

  it('plans aceternity only when it is explicitly permitted (the restricted, toggle-gated source)', () => {
    // Aceternity carries the largest item set, but is never planned unless it is in the permitted
    // list — and resolveSources only admits it when config.sources.aceternity is toggled on.
    expect(registryFor('aceternity')?.items.length).toBeGreaterThanOrEqual(100);
    expect(
      resolveFetchPlan(['magic-ui'], { budget: 50 }).some((r) => r.source === 'aceternity'),
    ).toBe(false);
    const plan = resolveFetchPlan(['aceternity'], { budget: 3 });
    expect(plan.every((r) => r.source === 'aceternity')).toBe(true);
    expect(plan.map((r) => r.item)).toEqual(['grid', 'moving-line', 'sparkles']);
  });

  it('returns [] when no permitted source has a registry entry', () => {
    expect(resolveFetchPlan(['motion-primitives', '21st-registry'], { budget: 6 })).toEqual([]);
    expect(resolveFetchPlan([], { budget: 6 })).toEqual([]);
  });
});

describe('buildFetchCommand', () => {
  it('builds the non-interactive npx shadcn add invocation', () => {
    const ref = {
      source: 'magic-ui',
      item: 'marquee',
      url: 'https://magicui.design/r/marquee.json',
    };
    expect(buildFetchCommand(ref)).toEqual({
      command: 'npx',
      args: ['--yes', 'shadcn@latest', 'add', 'https://magicui.design/r/marquee.json', '--yes'],
    });
  });
});

describe('fetchedComponentNames', () => {
  it('returns the item names of the provenance records', () => {
    expect(
      fetchedComponentNames([
        { source: 'magic-ui', item: 'marquee', url: 'u1' },
        { source: 'cult-ui', item: 'shift-card', url: 'u2' },
      ]),
    ).toEqual(['marquee', 'shift-card']);
    expect(fetchedComponentNames([])).toEqual([]);
  });
});
