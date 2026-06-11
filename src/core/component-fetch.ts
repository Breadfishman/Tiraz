/**
 * Genuine Tier-2 component fetching (SPEC §12, Phase 1 — see `docs/plans/component-fetch.md`).
 *
 * Today the agent only receives the *signature strings* of permitted sources and is asked to
 * reimplement them. This module is the pure core of the real-fetch path: before the agent runs,
 * Tiraz installs production components from a permitted source's registry into the variant's
 * worktree (via the shadcn registry CLI), and the prompt tells the agent to COMPOSE + restyle that
 * real code rather than rebuild it.
 *
 * Everything here is pure + deterministic — the actual `npx shadcn add` spawning + filesystem work
 * lives in the coverage-excluded `component-fetch-io.ts`. The registry map is intentionally pure
 * data so more verified entries can be appended over time.
 */

/**
 * The transport used to pull a source's components into a worktree, ranked by reliability. Only
 * `shadcn-registry` is implemented in Phase 1; the rest of the union documents the roadmap (`mcp`
 * for a source's MCP server, `copy` for a raw code fetch, `signatures` for today's prompt-only
 * fallback) so later phases slot in behind the same data shape.
 */
export type FetchTransport = 'shadcn-registry' | 'mcp' | 'copy' | 'signatures';

/** A source's registry: how to fetch it and which item slugs are known-good. */
export interface SourceRegistry {
  /** Source id — matches a {@link import('./sources').ComponentSource} id and a genome `sources` entry. */
  id: string;
  transport: FetchTransport;
  /** URL template with a single `{name}` placeholder substituted with an item slug. */
  urlTemplate: string;
  /**
   * The item slugs verified live to return valid shadcn registry JSON. Intentionally small: this
   * list is expand-by-verification only — never add an item without confirming it resolves live.
   */
  items: readonly string[];
}

/**
 * The verified component registry (SPEC §12). Every template + at least one item below was confirmed
 * live to return valid shadcn registry JSON. Pure data so verified entries can be appended later; the
 * item lists are intentionally small and grow only by verification, never by guessing slugs.
 */
export const COMPONENT_REGISTRY: readonly SourceRegistry[] = [
  {
    id: 'magic-ui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://magicui.design/r/{name}.json',
    items: ['marquee', 'bento-grid', 'border-beam'],
  },
  {
    id: 'cult-ui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://www.cult-ui.com/r/{name}.json',
    items: ['shift-card'],
  },
  {
    id: 'kokonut-ui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://kokonutui.com/r/{name}.json',
    items: ['card-stack'],
  },
  {
    id: 'react-bits',
    transport: 'shadcn-registry',
    // React Bits items are variant-suffixed (TS/JS × Tailwind/CSS); `-TS-TW` matches a
    // TypeScript + Tailwind project.
    urlTemplate: 'https://reactbits.dev/r/{name}.json',
    items: ['SplitText-TS-TW'],
  },
  {
    id: 'eldora-ui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://www.eldoraui.site/r/{name}.json',
    items: ['marquee'],
  },
  {
    id: 'smoothui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://www.smoothui.dev/r/{name}.json',
    items: ['siri-orb'],
  },
] as const;

/** Look up the registry entry for a source id, or `undefined` if none is verified. */
export function registryFor(id: string): SourceRegistry | undefined {
  return COMPONENT_REGISTRY.find((reg) => reg.id === id);
}

/** Resolve a concrete registry-item URL by substituting `{name}` in the template with `item`. */
export function itemUrl(reg: SourceRegistry, item: string): string {
  return reg.urlTemplate.replace('{name}', item);
}

/** A single component to fetch: its source, item slug, and resolved registry URL. */
export interface FetchRef {
  source: string;
  item: string;
  url: string;
}

/**
 * Build the ordered list of components to install for the permitted sources, capped at `budget`.
 *
 * Items are **interleaved across sources** (round-robin): with a small budget the plan still spans
 * multiple sources rather than draining one — diversity across sources is itself the anti-slop point
 * (SPEC §12). Only permitted ids that have a verified registry entry contribute. Pure + deterministic
 * (stable order following the registry + item order). `budget <= 0` yields `[]`.
 */
export function resolveFetchPlan(
  permittedSourceIds: readonly string[],
  opts: { budget: number },
): FetchRef[] {
  if (opts.budget <= 0) return [];

  // Collect each permitted source's full item list, preserving the permitted-id order so the
  // round-robin is deterministic.
  const lanes: { reg: SourceRegistry; items: readonly string[] }[] = [];
  const seen = new Set<string>();
  for (const id of permittedSourceIds) {
    if (seen.has(id)) continue; // a source listed in both bundled + fetch must contribute one lane
    seen.add(id);
    const reg = registryFor(id);
    if (reg !== undefined && reg.items.length > 0) {
      lanes.push({ reg, items: reg.items });
    }
  }

  const plan: FetchRef[] = [];
  const maxItems = lanes.reduce((max, lane) => Math.max(max, lane.items.length), 0);
  for (let column = 0; column < maxItems && plan.length < opts.budget; column += 1) {
    for (const lane of lanes) {
      if (plan.length >= opts.budget) break;
      const item = lane.items[column];
      if (item === undefined) continue;
      plan.push({ source: lane.reg.id, item, url: itemUrl(lane.reg, item) });
    }
  }
  return plan;
}

/** The non-interactive `npx shadcn add <url> --yes` invocation for a single ref. */
export function buildFetchCommand(ref: FetchRef): { command: string; args: string[] } {
  return { command: 'npx', args: ['--yes', 'shadcn@latest', 'add', ref.url, '--yes'] };
}

/** Record of one component that was actually installed into a worktree. */
export interface FetchProvenance {
  source: string;
  item: string;
  url: string;
}

/** The item names that were fetched (for the future DS allowlist / crediting follow-up). */
export function fetchedComponentNames(prov: readonly FetchProvenance[]): string[] {
  return prov.map((p) => p.item);
}
