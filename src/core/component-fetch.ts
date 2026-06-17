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
    items: [
      'marquee',
      'bento-grid',
      'border-beam',
      'animated-beam',
      'shimmer-button',
      'particles',
      'globe',
      'orbiting-circles',
      'number-ticker',
      'animated-list',
      'dock',
      'blur-fade',
      'shine-border',
      'ripple',
      'meteors',
      'aurora-text',
      'text-animate',
      'animated-gradient-text',
      'word-rotate',
      'hero-video-dialog',
      'confetti',
      'neon-gradient-card',
      'retro-grid',
      'magic-card',
      'morphing-text',
      'scroll-progress',
      'lens',
      'smooth-cursor',
      'hyper-text',
      'sparkles-text',
      'spinning-text',
      'icon-cloud',
      'safari',
      'iphone',
      'terminal',
      'video-text',
      'pixel-image',
      'highlighter',
      'dot-pattern',
      'grid-pattern',
      'flickering-grid',
    ],
  },
  {
    id: 'cult-ui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://www.cult-ui.com/r/{name}.json',
    items: [
      'shift-card',
      'texture-card',
      'texture-button',
      'dynamic-island',
      'neumorph-button',
      'gradient-heading',
      'family-button',
      'bg-animate-button',
      'expandable',
      'popover',
      'tweet-grid',
      'minimal-card',
      'animated-number',
      'typewriter',
      'direction-aware-tabs',
      'lightboard',
      'canvas-fractal-grid',
      'text-animate',
      'cosmic-button',
      'timer',
      'cutout-card',
      'side-panel',
      'three-d-carousel',
      'dock',
      'sortable-list',
      'floating-panel',
      'color-picker',
      'code-block',
    ],
  },
  {
    id: 'kokonut-ui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://kokonutui.com/r/{name}.json',
    items: [
      'card-stack',
      'ai-prompt',
      'gradient-button',
      'card-flip',
      'beams-background',
      'action-search-bar',
      'file-upload',
      'smooth-drawer',
      'particle-button',
      'toolbar',
      'sliced-text',
      'type-writer',
      'hold-button',
      'swoosh-text',
      'attract-button',
      'shimmer-text',
      'currency-transfer',
      'command-button',
      'shape-hero',
      'ai-text-loading',
      'carousel-cards',
      'ai-input-search',
      'background-paths',
      'apple-activity-card',
      'ai-voice',
      'smooth-tab',
      'team-selector',
      'switch-button',
      'social-button',
      'v0-button',
      'ai-loading',
      'avatar-picker',
      'glitch-text',
      'matrix-text',
      'dynamic-text',
      'tweet-card',
      'scroll-text',
      'liquid-glass-card',
      'profile-dropdown',
    ],
  },
  {
    id: 'react-bits',
    transport: 'shadcn-registry',
    // React Bits items are variant-suffixed (TS/JS × Tailwind/CSS); `-TS-TW` matches a
    // TypeScript + Tailwind project.
    urlTemplate: 'https://reactbits.dev/r/{name}.json',
    items: [
      'SplitText-TS-TW',
      'BlurText-TS-TW',
      'ShinyText-TS-TW',
      'GradientText-TS-TW',
      'CountUp-TS-TW',
      'RotatingText-TS-TW',
      'TrueFocus-TS-TW',
      'DecryptedText-TS-TW',
      'Aurora-TS-TW',
      'Particles-TS-TW',
      'Waves-TS-TW',
      'Threads-TS-TW',
      'Hyperspeed-TS-TW',
      'BlobCursor-TS-TW',
      'Magnet-TS-TW',
      'ClickSpark-TS-TW',
      'Ballpit-TS-TW',
      'Dock-TS-TW',
      'GooeyNav-TS-TW',
      'ScrollFloat-TS-TW',
      'ScrollReveal-TS-TW',
      'ScrollVelocity-TS-TW',
      'FallingText-TS-TW',
      'TextPressure-TS-TW',
      'GlitchText-TS-TW',
      'ScrambledText-TS-TW',
      'VariableProximity-TS-TW',
      'CircularText-TS-TW',
      'FuzzyText-TS-TW',
      'ShapeBlur-TS-TW',
      'StarBorder-TS-TW',
      'SpotlightCard-TS-TW',
      'GlareHover-TS-TW',
      'PixelCard-TS-TW',
      'Noise-TS-TW',
      'Crosshair-TS-TW',
      'SplashCursor-TS-TW',
      'Lanyard-TS-TW',
      'Iridescence-TS-TW',
      'Silk-TS-TW',
      'Balatro-TS-TW',
      'Orb-TS-TW',
      'GridDistortion-TS-TW',
      'GridMotion-TS-TW',
      'Ribbons-TS-TW',
      'MetaBalls-TS-TW',
      'AnimatedList-TS-TW',
      'Stepper-TS-TW',
      'FlowingMenu-TS-TW',
      'BounceCards-TS-TW',
      'CardSwap-TS-TW',
      'Carousel-TS-TW',
      'Stack-TS-TW',
      'Folder-TS-TW',
      'MagicBento-TS-TW',
      'CircularGallery-TS-TW',
      'InfiniteMenu-TS-TW',
      'DecayCard-TS-TW',
      'FlyingPosters-TS-TW',
      'ChromaGrid-TS-TW',
      'ElasticSlider-TS-TW',
      'PixelTransition-TS-TW',
      'Counter-TS-TW',
      'AnimatedContent-TS-TW',
      'FadeContent-TS-TW',
    ],
  },
  {
    id: 'eldora-ui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://www.eldoraui.site/r/{name}.json',
    items: [
      'marquee',
      'safari-browser',
      'macbook-pro',
      'iphone-17-pro',
      'ipad',
      'browser',
      'cobe-globe',
      'github-inline-comments',
      'animated-badge',
      'grid',
      'clerk-otp',
      'integrations',
      'terminal',
      'testimonal-slider',
      'map',
      'svg-ripple-effect',
      'animated-frameworks',
      'blur-in-text',
      'fade-text',
      'gradual-spacing-text',
      'letter-pull-up-text',
      'wavy-text',
      'word-pull-up-text',
      'novatrix-background',
      'photon-beam',
      'hacker-background',
      'card-flip-hover',
      'live-button',
      'animated-shiny-button',
      'animated-list',
      'orbit-rotation',
      'logo-timeline',
      'dock-text',
      'holographic-card',
    ],
  },
  {
    id: 'smoothui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://www.smoothui.dev/r/{name}.json',
    items: [
      'siri-orb',
      'number-flow',
      'dynamic-island',
      'app-download-stack',
      'image-metadata-preview',
      'social-selector',
      'basic-toast',
      'clip-corners-button',
      'phototab',
      'scramble-hover',
      'user-account-avatar',
      'ai-input',
      'ai-branch',
      'agent-avatar',
      'animated-tabs',
      'animated-tooltip',
      'apple-invites',
      'magnetic-button',
      'price-flow',
      'product-card',
      'reveal-text',
      'scrubber',
      'typewriter-text',
      'wave-text',
      'power-off-slide',
      'gooey-popover',
      'glow-hover-card',
      'contribution-graph',
      'cursor-follow',
      'exposure-slider',
      'animated-file-upload',
      'animated-stepper',
      'expandable-cards',
      'reviews-carousel',
      'scrollable-card-stack',
    ],
  },
  {
    // Tailark — MIT shadcn marketing blocks (hero/features/pricing/etc.); slugs spot-verified live.
    id: 'tailark',
    transport: 'shadcn-registry',
    urlTemplate: 'https://tailark.com/r/{name}.json',
    items: [
      'hero-section-1',
      'features-1',
      'pricing-1',
      'testimonials-1',
      'call-to-action-1',
      'hero-section-2',
      'hero-section-3',
      'hero-section-4',
      'hero-section-5',
      'hero-section-6',
      'features-2',
      'features-3',
      'features-4',
      'features-5',
      'features-6',
      'features-7',
      'features-8',
      'features-9',
      'features-10',
      'features-11',
      'features-12',
      'stats-1',
      'team-1',
      'faqs-1',
      'faqs-2',
      'faqs-3',
      'faqs-4',
      'footer-1',
      'footer-2',
      'footer-3',
      'footer-4',
      'footer-5',
      'content-1',
      'content-2',
      'content-3',
      'content-4',
      'content-5',
      'content-6',
      'content-7',
      'integrations-1',
      'logo-cloud-1',
    ],
  },
  {
    // MynaUI — MIT Tailwind + shadcn components; numbered slugs (button1, accordion1, …), verified live.
    id: 'mynaui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://mynaui.com/r/{name}.json',
    items: ['button1', 'accordion1', 'badge1', 'input1', 'avatar1', 'tabs1'],
  },
  {
    // RESTRICTED source: only fetched when `config.sources.skiper` is toggled on (off by default,
    // surfaces a ToS warning). Skiper UI mixes free (attribution-required) and paid components; only
    // the publicly-fetchable free slugs are listed, and the warning flags the attribution + paid mix.
    // Note the distinct `/registry/` path (not `/r/`). Slugs spot-verified live.
    id: 'skiper-ui',
    transport: 'shadcn-registry',
    urlTemplate: 'https://skiper-ui.com/registry/{name}.json',
    items: ['skiper3', 'skiper40', 'skiper54', 'skiper67'],
  },
  {
    // RESTRICTED source: only fetched when `config.sources.aceternity` is toggled on (off by default,
    // surfaces a ToS warning) — see sources.ts. The full core-component set, with slugs sourced from
    // Aceternity's registry index (registry.json); 6 spot-verified live (3d-card, bento-grid,
    // spotlight, meteors, evervault-card, wavy-background). Blocks/templates (hero-sections, pricing,
    // footers, …) are intentionally excluded — these are the components. Any slug that drifts is
    // skipped by the best-effort fetcher, so a stale entry never blocks a variant.
    id: 'aceternity',
    transport: 'shadcn-registry',
    urlTemplate: 'https://ui.aceternity.com/registry/{name}.json',
    items: [
      'grid',
      'moving-line',
      'sparkles',
      'spotlight',
      'glowing-stars',
      'text-reveal-card',
      'animated-tooltip',
      'following-pointer',
      'background-beams',
      'svg-mask-effect',
      'infinite-moving-cards',
      '3d-pin',
      'evervault-card',
      'parallax-scroll',
      'parallax-scroll-2',
      'parallax-hero-images',
      'tracing-beam',
      'container-scroll-animation',
      'text-generate-effect',
      'meteors',
      'card-stack',
      'moving-border',
      'lamp',
      'sticky-scroll-reveal',
      'floating-navbar',
      'navbar-menu',
      'tailwindcss-buttons',
      'bento-grid',
      'card-hover-effect',
      'google-gemini-effect',
      'gooey-input',
      'typewriter-effect',
      'background-boxes',
      '3d-card',
      'images-slider',
      'direction-aware-hover',
      'tabs',
      'hero-parallax',
      'wavy-background',
      'background-gradient',
      'layout-grid',
      'background-gradient-animation',
      'macbook-scroll',
      'input',
      'label',
      'multi-step-loader',
      'globe',
      'aurora-background',
      'canvas-reveal-effect',
      'hover-border-gradient',
      'hero-highlight',
      'vortex',
      'wobble-card',
      'placeholders-and-vanish-input',
      'flip-words',
      'link-preview',
      'glare-card',
      'animated-modal',
      'sidebar',
      'apple-cards-carousel',
      'shooting-stars',
      'stars-background',
      'compare',
      'card-spotlight',
      'cover',
      'file-upload',
      'floating-dock',
      'focus-cards',
      'background-beams-with-collision',
      'timeline',
      'text-hover-effect',
      'lens',
      'background-lines',
      'animated-testimonials',
      'world-map',
      'code-block',
      'carousel',
      'colourful-text',
      'squiggly-text',
      'magnetic-button',
      'notch',
      'spotlight-new',
      'glowing-effect',
      '3d-marquee',
      'container-text-flip',
      'resizable-navbar',
      'draggable-card',
      'sticky-banner',
      'pointer-highlight',
      'stateful-button',
      'loader',
      'comet-card',
      'background-ripple-effect',
      'pixelated-canvas',
      'canvas-text',
      'layout-text-flip',
      'dotted-glow-background',
      'tooltip-card',
      'encrypted-text',
      'noise-background',
      'dither-shader',
      'webcam-pixel-grid',
      'images-badge',
      'keyboard',
      'terminal',
      '3d-globe',
      'ascii-art',
      'scales',
      'text-flipping-board',
    ],
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
  opts: { budget: number; seed?: number },
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

  // Per-variant rotation (SPEC §12 anti-monoculture). Without it the round-robin is identical for
  // every variant with the same permitted sources, so the whole population fetches the same handful
  // of components. Rotate each lane's item list by a seed-derived offset, so different variants draw
  // a different slice of each source's catalog. `seed` defaults to 0 → unrotated (the original,
  // deterministic plan). A single-item lane is unaffected — which is why the catalogs are expanded
  // alongside this so there is something to rotate through.
  const seed = opts.seed ?? 0;
  const oriented = lanes.map((lane) => {
    const len = lane.items.length;
    const offset = ((seed % len) + len) % len;
    return {
      reg: lane.reg,
      items:
        offset === 0 ? lane.items : [...lane.items.slice(offset), ...lane.items.slice(0, offset)],
    };
  });

  const plan: FetchRef[] = [];
  const maxItems = oriented.reduce((max, lane) => Math.max(max, lane.items.length), 0);
  for (let column = 0; column < maxItems && plan.length < opts.budget; column += 1) {
    for (const lane of oriented) {
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
  /**
   * Worktree-relative paths of the files this fetch actually wrote (SPEC §12, Phase 1.5). Recorded so
   * DS-adherence can EXCLUDE fetched library code from the agent's authored-choices score — the
   * literals inside a fetched component are intentional library code, not the agent's off-system slop.
   * Optional/best-effort: absent when the transport couldn't report what it wrote.
   */
  files?: string[];
}

/** The item names that were fetched (for the future DS allowlist / crediting follow-up). */
export function fetchedComponentNames(prov: readonly FetchProvenance[]): string[] {
  return prov.map((p) => p.item);
}

/** All worktree-relative file paths recorded across a provenance list (deduped). */
export function fetchedFiles(prov: readonly FetchProvenance[]): string[] {
  const files = new Set<string>();
  for (const p of prov) for (const f of p.files ?? []) files.add(f);
  return [...files];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;

/**
 * Parse the file paths a `shadcn add` run reported writing, from its stdout (Phase 1.5). shadcn prints
 * the created/updated files as a bulleted list (`  - components/ui/marquee.tsx`). We strip ANSI colour
 * codes and return the bulleted entries that look like source paths (contain a `/` and a file
 * extension), so a dependency line (`- framer-motion`) is not mistaken for a file. Pure + best-effort:
 * an unrecognized format yields `[]` (DS-adherence then simply excludes nothing for that install).
 */
export function parseShadcnInstalledFiles(stdout: string): string[] {
  const files: string[] = [];
  for (const rawLine of stdout.replace(ANSI, '').split('\n')) {
    const match = /^\s*[-•]\s*(\S+\.\w+)\s*$/.exec(rawLine);
    const candidate = match?.[1];
    if (candidate?.includes('/') === true) {
      files.push(candidate.replace(/^\.\//, ''));
    }
  }
  return [...new Set(files)];
}
