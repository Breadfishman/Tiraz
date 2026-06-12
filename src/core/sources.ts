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
  /** Homepage / docs URL, surfaced as a reference link in the dashboard. */
  url: string;
  tier: SourceTier;
  license: string;
  /** Enabling this source requires its own toggle + surfaces {@link ComponentSource.warning}. */
  restricted: boolean;
  /**
   * Signature components / effects this source is known for. Tiraz feeds these to the agent as a
   * palette to **blend** across sources into something unique (anti-slop, §12) — not to copy one
   * library wholesale.
   */
  signatures: string[];
  /** Warning surfaced when a restricted source is enabled (SPEC §12, §17). */
  warning?: string;
  notes: string;
}

/** The ToS warning surfaced when a user enables a restricted source (SPEC §12, §17). */
export const ACETERNITY_TOS_WARNING =
  'Aceternity UI carries a restrictive ToS (no republishing, selling, sub-licensing, or ' +
  'redistribution). This is generally fine for personal / non-distributed projects (e.g. a ' +
  'personal site) but risky for enterprise or commercial work. Tiraz never bundles it — it is ' +
  'only fetched into your repo on demand. Enable it only if your use case fits those terms.';

/** The attribution / paid-mix warning surfaced when Skiper UI is enabled (SPEC §12, §17). */
export const SKIPER_TOS_WARNING =
  'Skiper UI mixes free and paid components: the free tier requires attribution, and many ' +
  'components are premium (paid). Tiraz only fetches the publicly-available free slugs and never ' +
  'bundles them — keep the required attribution, and do not rely on paid components being fetchable. ' +
  'Enable it only if those terms fit your use.';

/**
 * The known component sources (SPEC §12 / §13 — licenses verified against live sources, 2026).
 * Diversity across sources is itself an anti-slop mechanism: drawing from one well industrializes a
 * new monoculture. Tier-1 is bundle-able (MIT, redistributable); Tier-2 is fetch-only (copied into
 * the user's repo). Sources whose terms forbid redistribution are `restricted` (toggle + warning).
 */
export const SOURCES: readonly ComponentSource[] = [
  {
    id: 'magic-ui',
    name: 'Magic UI',
    url: 'https://magicui.design',
    tier: 'bundled',
    license: 'MIT',
    restricted: false,
    signatures: [
      'marquee',
      'animated beam',
      'bento grid',
      'shimmer button',
      'border beam',
      'particles',
    ],
    notes: '150+ Motion-based animated components; bundled and always available.',
  },
  {
    id: 'react-bits',
    name: 'React Bits',
    url: 'https://www.reactbits.dev',
    tier: 'fetch',
    license: 'MIT + Commons Clause',
    restricted: false,
    signatures: [
      'split text',
      'aurora background',
      'blob cursor',
      'animated waves',
      'gradient text',
    ],
    notes:
      'Animated text/background effects. Fetch-only: copied into your repo (= permitted "use"); ' +
      'Commons Clause forbids reselling it as a product, so never bundled.',
  },
  {
    id: '21st-registry',
    name: '21st.dev registry',
    url: 'https://21st.dev',
    tier: 'fetch',
    license: 'Community (MIT-class)',
    restricted: false,
    signatures: ['hero sections', 'pricing tables', 'animated tabs', 'testimonial marquees'],
    notes:
      'Large community registry. The "Magic" generator is a separate Agent backend, not a source.',
  },
  {
    id: 'cult-ui',
    name: 'Cult UI',
    url: 'https://www.cult-ui.com',
    tier: 'fetch',
    license: 'MIT',
    restricted: false,
    signatures: ['shift cards', 'dynamic island', 'texture cards', 'neumorphic controls'],
    notes: 'Tasteful Motion components: shift/texture cards, dynamic islands, neumorphic effects.',
  },
  {
    id: 'motion-primitives',
    name: 'Motion Primitives',
    url: 'https://motion-primitives.com',
    tier: 'fetch',
    license: 'MIT',
    restricted: false,
    signatures: [
      'shimmer text',
      'morphing dialog',
      'number ticker',
      'in-view reveal',
      'cursor effects',
    ],
    notes:
      'Motion-first primitives: animated/shimmer text, morphing dialogs, number tickers, in-view reveals.',
  },
  {
    id: 'kokonut-ui',
    name: 'Kokonut UI',
    url: 'https://kokonutui.com',
    tier: 'fetch',
    license: 'MIT',
    restricted: false,
    signatures: ['AI-chat input', 'gradient buttons', 'card stacks', 'file-upload UI'],
    notes:
      '100+ Tailwind + shadcn + Motion components: AI-chat inputs, gradient buttons, card stacks.',
  },
  {
    id: 'smoothui',
    name: 'SmoothUI',
    url: 'https://www.smoothui.dev',
    tier: 'fetch',
    license: 'MIT',
    restricted: false,
    signatures: ['Siri orb', 'number flow', 'dynamic island', 'app-store cards'],
    notes:
      '50+ Motion micro-interactions: Siri orb, number flow, dynamic-island and app-store-style cards.',
  },
  {
    id: 'eldora-ui',
    name: 'Eldora UI',
    url: 'https://www.eldoraui.site',
    tier: 'fetch',
    license: 'MIT',
    restricted: false,
    signatures: ['marquee', 'globe', 'animated beams', 'text reveal'],
    notes:
      '150+ animated effects (React + Motion): marquees, globes, animated beams, text reveals.',
  },
  {
    id: 'tailark',
    name: 'Tailark',
    url: 'https://tailark.com',
    tier: 'fetch',
    license: 'MIT',
    restricted: false,
    signatures: ['hero sections', 'feature grids', 'pricing tables', 'testimonials', 'CTAs'],
    notes:
      'MIT shadcn marketing BLOCKS (whole sections, not atoms): heroes, features, pricing, ' +
      'testimonials, CTAs — ideal for full landing pages. Registry verified live.',
  },
  {
    id: 'mynaui',
    name: 'MynaUI',
    url: 'https://mynaui.com',
    tier: 'fetch',
    license: 'MIT',
    restricted: false,
    signatures: ['buttons', 'accordions', 'inputs', 'badges', 'avatars', 'tabs'],
    notes:
      'MIT Tailwind + shadcn + Radix component set (clean form/control primitives). Numbered slugs ' +
      '(button1, accordion1, …); registry verified live.',
  },
  {
    id: 'indie-ui',
    name: 'Indie UI',
    url: 'https://ui.indie-starter.dev',
    tier: 'fetch',
    license: 'MIT',
    restricted: false,
    signatures: ['animated cards', 'modals', 'tooltips', 'grids'],
    notes:
      'shadcn + Motion animated components (cards, modals, tooltips). Smaller, younger collection.',
  },
  {
    id: 'animate-ui',
    name: 'Animate UI',
    url: 'https://animate-ui.com',
    tier: 'fetch',
    license: 'MIT + Commons Clause',
    restricted: false,
    signatures: ['animated icons', 'motion tabs', 'springy accordions'],
    notes:
      'Fully-animated shadcn/Magic-UI-style set (animated icons, motion tabs/accordions). Commons ' +
      'Clause: copy into your repo freely, never resell as a product (same posture as React Bits).',
  },
  {
    id: 'origin-ui',
    name: 'Origin UI',
    url: 'https://originui.com',
    tier: 'fetch',
    license: 'MIT (components) / AGPL-3.0 (repo)',
    restricted: false,
    signatures: ['inputs', 'selects', 'date pickers', 'form controls'],
    notes:
      '400+ copy-paste components — the broadest form/control coverage. Only the MIT component ' +
      'directories are safe to copy; the surrounding repo tooling is AGPL-3.0 — do not vendor it.',
  },
  {
    id: 'aceternity',
    name: 'Aceternity UI',
    url: 'https://ui.aceternity.com',
    tier: 'fetch',
    license: 'Restrictive ToS (no redistribution)',
    restricted: true,
    signatures: [
      '3D cards',
      'aurora background',
      'spotlight',
      'meteors',
      'sparkles',
      'animated beams',
    ],
    warning: ACETERNITY_TOS_WARNING,
    notes:
      'High-impact hero effects (3D cards, aurora/spotlight/meteors). Toggleable, OFF by default. ' +
      'Its ToS forbids reproducing material — many effects are reimplemented MIT in Magic UI / Eldora.',
  },
  {
    id: 'skiper-ui',
    name: 'Skiper UI',
    url: 'https://skiper-ui.com',
    tier: 'fetch',
    license: 'Free tier (attribution) + paid premium',
    restricted: true,
    signatures: [
      'card swipers',
      'theme toggles',
      'marquees',
      'scroll effects',
      'interactive cards',
    ],
    warning: SKIPER_TOS_WARNING,
    notes:
      'Un-common animated components (card swipers, scroll effects). Toggleable, OFF by default. ' +
      'Free tier needs attribution and mixes in paid components — only free slugs are fetchable.',
  },
] as const;

/**
 * Sources deliberately excluded from the fetch menu for license reasons (SPEC §12), surfaced so the
 * exclusion is explicit rather than silent:
 * - **Hover.dev** — proprietary/paid; its license forbids redistributing its components.
 * - **Skiper UI** — free tier requires attribution and mixes in paid premium components; opt in
 *   manually rather than auto-fetching.
 */
export const EXCLUDED_SOURCES: readonly { id: string; name: string; reason: string }[] = [
  { id: 'hover-dev', name: 'Hover.dev', reason: 'Proprietary/paid; forbids redistribution.' },
] as const;

export class SourceError extends Error {
  override readonly name = 'SourceError';
}

/** Look up a source by id, or `undefined` if unknown. */
export function getSource(id: string): ComponentSource | undefined {
  return SOURCES.find((source) => source.id === id);
}

/** The signature-effect palette for the given source ids — what the agent blends from (anti-slop). */
export function signaturesFor(ids: readonly string[]): { id: string; signatures: string[] }[] {
  return ids
    .map((id) => getSource(id))
    .filter((source): source is ComponentSource => source !== undefined)
    .map((source) => ({ id: source.id, signatures: source.signatures }));
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
 * Each restricted source maps to its dedicated off-by-default config toggle (SPEC §12, §17). A
 * restricted source is never admitted via the `fetch` list — only by flipping its own boolean.
 */
export const RESTRICTED_TOGGLES: Record<string, 'aceternity' | 'skiper'> = {
  aceternity: 'aceternity',
  'skiper-ui': 'skiper',
};

/** Whether a restricted source is enabled via its dedicated config toggle (false if it has none). */
export function restrictedEnabled(id: string, cfg: TirazConfig['sources']): boolean {
  const key = RESTRICTED_TOGGLES[id];
  return key !== undefined ? cfg[key] : false;
}

/**
 * Resolve the configured sources (SPEC §12) into the bundled set, the permitted Tier-2 fetch set,
 * and any warnings. A restricted source (Aceternity, Skiper UI) is only permitted when its dedicated
 * toggle is on, and enabling it yields its ToS warning. Throws {@link SourceError} on an unknown id.
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

  // Restricted sources are admitted only via their dedicated toggle, each surfacing its ToS warning.
  for (const source of SOURCES) {
    if (source.restricted && restrictedEnabled(source.id, cfg)) {
      fetch.push(source);
      if (source.warning !== undefined) {
        warnings.push(source.warning);
      }
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
