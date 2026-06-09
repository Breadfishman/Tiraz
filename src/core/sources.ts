/**
 * Component sourcing (SPEC §12) — a two-tier menu the agent may draw from. Diversity of sources is
 * itself an anti-slop mechanism. **License dictates the tier:** Tier-1 is bundle-able (vendored,
 * redistribution permitted); Tier-2 is fetch-on-demand only (the agent copies components into the
 * *user's* repo — we never redistribute). Usage is sparing by design.
 */

import type { TirazConfig } from './config';

export type SourceTier = 'bundled' | 'fetch';

export interface ComponentSource {
  /** Stable id, also the prefix a fetched component is recorded under (e.g. `react-bits/SplitText`). */
  id: string;
  name: string;
  tier: SourceTier;
  license: string;
  /** Enabling this source requires surfacing a ToS warning (SPEC §12 — Aceternity). */
  restricted: boolean;
  notes: string;
}

/** The known component sources (SPEC §12 / §13 — licenses verified against live sources). */
export const SOURCES: readonly ComponentSource[] = [
  {
    id: 'magic-ui',
    name: 'Magic UI',
    tier: 'bundled',
    license: 'MIT',
    restricted: false,
    notes: '150+ Motion-based animated components; bundled and always available.',
  },
  {
    id: 'react-bits',
    name: 'React Bits',
    tier: 'fetch',
    license: 'MIT + Commons Clause',
    restricted: false,
    notes:
      'Fetch-only: the agent copies components into your repo. Never bundled (Commons Clause).',
  },
  {
    id: '21st-registry',
    name: '21st.dev registry',
    tier: 'fetch',
    license: 'Community',
    restricted: false,
    notes: 'Fetch-only registry. The "Magic" generator is a separate Agent backend, not a source.',
  },
  {
    id: 'aceternity',
    name: 'Aceternity UI',
    tier: 'fetch',
    license: 'Restrictive ToS (no redistribution)',
    restricted: true,
    notes: 'Toggleable, OFF by default. Fetch-only; never bundled.',
  },
] as const;

/** The ToS warning surfaced when a user enables a restricted source (SPEC §12, §17). */
export const ACETERNITY_TOS_WARNING =
  'Aceternity UI carries a restrictive ToS (no republishing, selling, sub-licensing, or ' +
  'redistribution). This is generally fine for personal / non-distributed projects (e.g. a ' +
  'personal site) but risky for enterprise or commercial work. Tiraz never bundles it — it is ' +
  'only fetched into your repo on demand. Enable it only if your use case fits those terms.';

export class SourceError extends Error {
  override readonly name = 'SourceError';
}

/** Look up a source by id, or `undefined` if unknown. */
export function getSource(id: string): ComponentSource | undefined {
  return SOURCES.find((source) => source.id === id);
}

export interface ResolvedSources {
  /** Tier-1 sources, always available (bundled into Tiraz). */
  bundled: ComponentSource[];
  /** Tier-2 sources the agent is permitted to fetch from this run. */
  fetch: ComponentSource[];
  /** Tier-2 source ids — what a genome records as `sources` and the prompt lists. */
  permittedIds: string[];
  /** Warnings to surface to the user (e.g. a restricted source's ToS). */
  warnings: string[];
}

/**
 * Resolve the configured sources (SPEC §12) into the bundled set, the permitted Tier-2 fetch set,
 * and any warnings. A restricted source (Aceternity) is only permitted when explicitly toggled on,
 * and toggling it on yields its ToS warning. Throws {@link SourceError} on an unknown id.
 */
export function resolveSources(cfg: TirazConfig['sources']): ResolvedSources {
  const bundled: ComponentSource[] = [];
  const fetch: ComponentSource[] = [];
  const warnings: string[] = [];

  for (const id of [...cfg.bundled, ...cfg.fetch]) {
    const source = getSource(id);
    if (source === undefined) {
      throw new SourceError(`Unknown component source: "${id}"`);
    }
    // A restricted source is opt-in via its own toggle, not by listing it in `fetch`.
    if (source.restricted) {
      continue;
    }
    (source.tier === 'bundled' ? bundled : fetch).push(source);
  }

  if (cfg.aceternity) {
    const aceternity = getSource('aceternity');
    if (aceternity !== undefined) {
      fetch.push(aceternity);
      warnings.push(ACETERNITY_TOS_WARNING);
    }
  }

  return { bundled, fetch, permittedIds: fetch.map((source) => source.id), warnings };
}

/** The source id a fetched component is recorded under, e.g. `react-bits/SplitText` → `react-bits`. */
export function sourcePrefix(component: string): string | null {
  const match = /^([^/:]+)[/:]/.exec(component.trim());
  return match?.[1] ?? null;
}

/**
 * Whether a used component belongs to one of the `permitted` Tier-2 sources (SPEC §12 — linter
 * coupling). Fetched Tier-2 components are whitelisted so their intentional hardcoded values aren't
 * flagged as off-system slop by DS-adherence (§9).
 */
export function isFromPermittedSource(component: string, permitted: readonly string[]): boolean {
  const prefix = sourcePrefix(component);
  return prefix !== null && permitted.includes(prefix);
}
