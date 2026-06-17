import { describe, expect, it } from 'vitest';
import {
  COMPONENT_REGISTRY,
  buildFetchCommand,
  fetchedComponentNames,
  fetchedFiles,
  itemUrl,
  parseShadcnInstalledFiles,
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
      'mynaui',
      'react-bits',
      'skiper-ui',
      'smoothui',
      'tailark',
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
    expect(registryFor('cult-ui')?.items[0]).toBe('shift-card');
    expect(registryFor('cult-ui')?.items.length).toBeGreaterThan(1);
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

  it('round-robins across sources and caps at the total available', () => {
    const ids = ['magic-ui', 'cult-ui'];
    const plan = resolveFetchPlan(ids, { budget: 4 });
    // First column takes one item from each source before either source's second item.
    expect(plan.slice(0, 2).map((r) => r.source)).toEqual(['magic-ui', 'cult-ui']);
    expect(plan.length).toBe(4);
    // A budget beyond everything available caps at the combined catalog size.
    const total = ids.reduce((n, id) => n + (registryFor(id)?.items.length ?? 0), 0);
    expect(resolveFetchPlan(ids, { budget: total + 50 }).length).toBe(total);
  });

  it('is deterministic and stable across calls', () => {
    const a = resolveFetchPlan(['magic-ui', 'kokonut-ui'], { budget: 5 });
    const b = resolveFetchPlan(['magic-ui', 'kokonut-ui'], { budget: 5 });
    expect(a).toEqual(b);
  });

  it('rotates each lane by the seed so different variants draw a different slice', () => {
    // seed 0 (default) is the original order; a non-zero seed rotates the source's items, so the
    // population stops fetching the same components (SPEC §12 anti-monoculture).
    const items = registryFor('magic-ui')!.items;
    const unseeded = resolveFetchPlan(['magic-ui'], { budget: 3, seed: 0 }).map((r) => r.item);
    const seeded = resolveFetchPlan(['magic-ui'], { budget: 3, seed: 1 }).map((r) => r.item);
    expect(unseeded).toEqual(items.slice(0, 3));
    expect(seeded).toEqual([items[1], items[2], items[3]]);
    expect(seeded).not.toEqual(unseeded);
    // seed wraps modulo the lane length.
    expect(
      resolveFetchPlan(['magic-ui'], { budget: 3, seed: items.length }).map((r) => r.item),
    ).toEqual(unseeded);
  });

  it('skips permitted sources without a verified registry entry', () => {
    const plan = resolveFetchPlan(['motion-primitives', 'magic-ui', 'unknown'], { budget: 5 });
    // Only magic-ui has a verified registry; the other two contribute no lane.
    expect(plan.every((r) => r.source === 'magic-ui')).toBe(true);
    expect(plan.length).toBe(5);
  });

  it('dedupes a source listed more than once (e.g. bundled + fetch) into one lane', () => {
    const plan = resolveFetchPlan(['magic-ui', 'magic-ui'], { budget: 5 });
    // One lane, not two: every result is magic-ui and no item repeats.
    expect(plan.every((r) => r.source === 'magic-ui')).toBe(true);
    expect(new Set(plan.map((r) => r.item)).size).toBe(plan.length);
    expect(plan.length).toBe(5);
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

describe('fetchedFiles', () => {
  it('flattens + dedupes the recorded file paths across provenance records (Phase 1.5)', () => {
    expect(
      fetchedFiles([
        { source: 'magic-ui', item: 'marquee', url: 'u1', files: ['components/ui/marquee.tsx'] },
        {
          source: 'magic-ui',
          item: 'beam',
          url: 'u2',
          files: ['components/ui/marquee.tsx', 'lib/x.ts'],
        },
        { source: 'cult-ui', item: 'shift', url: 'u3' }, // no files → contributes nothing
      ]),
    ).toEqual(['components/ui/marquee.tsx', 'lib/x.ts']);
    expect(fetchedFiles([])).toEqual([]);
  });
});

describe('parseShadcnInstalledFiles', () => {
  it('extracts bulleted source paths from shadcn stdout, stripping ANSI', () => {
    const stdout =
      '[32m✔[0m Created 2 files:\n  - components/ui/card-stack.tsx\n  - src/lib/utils.ts\n';
    expect(parseShadcnInstalledFiles(stdout)).toEqual([
      'components/ui/card-stack.tsx',
      'src/lib/utils.ts',
    ]);
  });

  it('ignores dependency lines (no slash / no extension) and dedupes; tolerates ./ prefixes', () => {
    const stdout =
      'Installing dependencies:\n  - framer-motion\n  - ./components/ui/marquee.tsx\n  - components/ui/marquee.tsx\n';
    expect(parseShadcnInstalledFiles(stdout)).toEqual(['components/ui/marquee.tsx']);
  });

  it('returns [] for an unrecognized format', () => {
    expect(parseShadcnInstalledFiles('done.')).toEqual([]);
    expect(parseShadcnInstalledFiles('')).toEqual([]);
  });
});
