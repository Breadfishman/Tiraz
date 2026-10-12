/**
 * A curated library of distinctive, freely licensed web fonts, plus the "overused by AI" families.
 *
 * Models reach for the same dozen faces (Inter, Instrument Serif, Fraunces, Space Grotesk, …) on
 * every brief, which is a large part of why generated pages look alike. This module gives the
 * direction planner a wider, deliberately non-default palette to sample from, and a matcher to
 * flag the reflex families. Every library font is on Google Fonts under the SIL Open Font License
 * (verified against google/fonts `ofl/` METADATA). The overused list is drawn from the reflex /
 * banned lists published by the popular design skills — see docs/research/design-skills-landscape.md.
 *
 * Pure data + small helpers, fully unit-tested. `typeMenu` is seed-deterministic so a direction's
 * type sample is reproducible from its genome seed.
 */

/** The job a font does in a type system. */
export type FontRole =
  | 'display-serif'
  | 'text-serif'
  | 'grotesk'
  | 'humanist-sans'
  | 'mono'
  | 'expressive';

/** A distinctive library font. */
export interface LibraryFont {
  /** Family name exactly as served by Google Fonts. */
  family: string;
  /** Primary role in a type system. */
  role: FontRole;
  /** SPDX-style licence id. */
  license: string;
  /** One-line character note. */
  note: string;
}

/** All roles, in menu order. */
export const FONT_ROLES: readonly FontRole[] = [
  'display-serif',
  'text-serif',
  'grotesk',
  'humanist-sans',
  'mono',
  'expressive',
];

const OFL = 'OFL-1.1';

/** The curated library — none of these appear in `OVERUSED_FONTS`. */
export const TYPE_LIBRARY: readonly LibraryFont[] = [
  // Display serif
  {
    family: 'Young Serif',
    role: 'display-serif',
    license: OFL,
    note: 'heavy, warm old-style with chunky ball terminals',
  },
  {
    family: 'Gloock',
    role: 'display-serif',
    license: OFL,
    note: 'high-contrast, sharp-wedged serif with a dramatic, inky voice',
  },
  {
    family: 'Rozha One',
    role: 'display-serif',
    license: OFL,
    note: 'ultra-high-contrast Didone-like poster serif with fat stems',
  },
  {
    family: 'Libre Caslon Display',
    role: 'display-serif',
    license: OFL,
    note: 'refined Caslon cut for large sizes, delicate hairlines',
  },
  {
    family: 'Castoro Titling',
    role: 'display-serif',
    license: OFL,
    note: 'inscriptional all-caps titling serif, classical and calm',
  },
  {
    family: 'Bellefair',
    role: 'display-serif',
    license: OFL,
    note: 'slender, elegant transitional serif with a fashion-house air',
  },
  {
    family: 'Gilda Display',
    role: 'display-serif',
    license: OFL,
    note: 'soft, low-key Didone for quiet luxury headlines',
  },
  {
    family: 'Linden Hill',
    role: 'display-serif',
    license: OFL,
    note: 'revival of Goudy Deepdene: bookish, slightly eccentric',
  },
  // Text serif
  {
    family: 'Literata',
    role: 'text-serif',
    license: OFL,
    note: 'sturdy contemporary book face built for long-form screen reading',
  },
  {
    family: 'Source Serif 4',
    role: 'text-serif',
    license: OFL,
    note: 'Fournier-flavoured transitional serif with optical sizes',
  },
  {
    family: 'Spectral',
    role: 'text-serif',
    license: OFL,
    note: 'light, slender screen serif with a crisp literary tone',
  },
  {
    family: 'Alegreya',
    role: 'text-serif',
    license: OFL,
    note: 'calligraphic, rhythmic serif with lively dynamic strokes',
  },
  {
    family: 'Vollkorn',
    role: 'text-serif',
    license: OFL,
    note: 'dark, robust everyday serif with old-style warmth',
  },
  {
    family: 'Petrona',
    role: 'text-serif',
    license: OFL,
    note: 'chiselled, slightly condensed serif with angular details',
  },
  {
    family: 'Besley',
    role: 'text-serif',
    license: OFL,
    note: 'Clarendon-inspired serif with bracketed slabs and big ball terminals',
  },
  {
    family: 'Brygada 1918',
    role: 'text-serif',
    license: OFL,
    note: 'revived Polish book face with distinctive historical texture',
  },
  {
    family: 'Piazzolla',
    role: 'text-serif',
    license: OFL,
    note: 'compact, sharp serif designed for dense, economical text',
  },
  // Grotesk
  {
    family: 'Bricolage Grotesque',
    role: 'grotesk',
    license: OFL,
    note: 'quirky, ink-trapped French grotesque with a width axis',
  },
  {
    family: 'Familjen Grotesk',
    role: 'grotesk',
    license: OFL,
    note: 'Scandinavian grotesk with idiosyncratic g and tight apertures',
  },
  {
    family: 'Schibsted Grotesk',
    role: 'grotesk',
    license: OFL,
    note: 'newsroom grotesk: sturdy, compact, made for headlines',
  },
  {
    family: 'Hanken Grotesk',
    role: 'grotesk',
    license: OFL,
    note: 'clean geometric-leaning grotesk, friendly at small sizes',
  },
  {
    family: 'Darker Grotesque',
    role: 'grotesk',
    license: OFL,
    note: 'tall, narrow, dark grotesque with a strong vertical rhythm',
  },
  {
    family: 'Host Grotesk',
    role: 'grotesk',
    license: OFL,
    note: 'crisp, rational contemporary grotesk with open forms',
  },
  {
    family: 'Public Sans',
    role: 'grotesk',
    license: OFL,
    note: 'neutral, civic grotesk from the US Web Design System',
  },
  {
    family: 'Golos Text',
    role: 'grotesk',
    license: OFL,
    note: 'plain-spoken UI grotesk with excellent Cyrillic',
  },
  {
    family: 'Onest',
    role: 'grotesk',
    license: OFL,
    note: 'open, geometric-leaning grotesk with an approachable, even texture',
  },
  // Humanist sans
  {
    family: 'Alegreya Sans',
    role: 'humanist-sans',
    license: OFL,
    note: 'calligraphic humanist sans with a literary rhythm',
  },
  {
    family: 'Fira Sans',
    role: 'humanist-sans',
    license: OFL,
    note: 'Meta-like humanist sans built for small-screen legibility',
  },
  {
    family: 'Source Sans 3',
    role: 'humanist-sans',
    license: OFL,
    note: 'gothic-rooted humanist workhorse with wide language support',
  },
  {
    family: 'Commissioner',
    role: 'humanist-sans',
    license: OFL,
    note: 'low-contrast humanist sans with optional flared and wedged styles',
  },
  {
    family: 'Cabin',
    role: 'humanist-sans',
    license: OFL,
    note: 'Gill- and Johnston-flavoured humanist sans, gently geometric',
  },
  {
    family: 'Red Hat Text',
    role: 'humanist-sans',
    license: OFL,
    note: 'open, slightly rounded text sans with generous spacing',
  },
  {
    family: 'Atkinson Hyperlegible Next',
    role: 'humanist-sans',
    license: OFL,
    note: 'legibility-first letterforms with exaggerated distinctions',
  },
  {
    family: 'Encode Sans',
    role: 'humanist-sans',
    license: OFL,
    note: 'width-variable sans from condensed to expanded',
  },
  // Mono
  {
    family: 'Martian Mono',
    role: 'mono',
    license: OFL,
    note: 'wide, squarish mono with a width axis and techno edge',
  },
  {
    family: 'Spline Sans Mono',
    role: 'mono',
    license: OFL,
    note: 'friendly grotesque-derived mono with soft curves',
  },
  {
    family: 'Red Hat Mono',
    role: 'mono',
    license: OFL,
    note: 'open, rounded mono that pairs with the Red Hat family',
  },
  {
    family: 'Azeret Mono',
    role: 'mono',
    license: OFL,
    note: 'cool, technical mono with wide proportions',
  },
  {
    family: 'Fragment Mono',
    role: 'mono',
    license: OFL,
    note: 'Helvetica-flavoured monospace, neutral and precise',
  },
  {
    family: 'Victor Mono',
    role: 'mono',
    license: OFL,
    note: 'narrow mono with a cursive, semi-connected italic',
  },
  {
    family: 'Xanh Mono',
    role: 'mono',
    license: OFL,
    note: 'unusual serifed mono with a typewriter-meets-book voice',
  },
  {
    family: 'Chivo Mono',
    role: 'mono',
    license: OFL,
    note: 'grotesque mono with a wide weight range for display use',
  },
  // Expressive / display
  {
    family: 'Unbounded',
    role: 'expressive',
    license: OFL,
    note: 'wide, rounded geometric display with a futurist stance',
  },
  {
    family: 'Bungee',
    role: 'expressive',
    license: OFL,
    note: 'vertical-signage display caps, urban and blocky',
  },
  {
    family: 'Big Shoulders',
    role: 'expressive',
    license: OFL,
    note: 'condensed, Chicago-industrial display with optical sizes',
  },
  {
    family: 'Climate Crisis',
    role: 'expressive',
    license: OFL,
    note: 'variable display whose weight melts with a year axis',
  },
  {
    family: 'Shrikhand',
    role: 'expressive',
    license: OFL,
    note: 'fat, italic, Gujarati-inspired display with swagger',
  },
  {
    family: 'Rubik Mono One',
    role: 'expressive',
    license: OFL,
    note: 'heavy monospaced display caps, poster-loud',
  },
  {
    family: 'Tilt Warp',
    role: 'expressive',
    license: OFL,
    note: 'rounded display with a 3D tilt axis',
  },
  {
    family: 'Bagel Fat One',
    role: 'expressive',
    license: OFL,
    note: 'soft, inflated ultra-bold rounded display',
  },
  {
    family: 'Nabla',
    role: 'expressive',
    license: OFL,
    note: 'COLRv1 colour font with isometric extruded letterforms',
  },
];

/**
 * Families the models reach for by reflex, compiled from the reflex / banned / default lists of
 * Anthropic's frontend-design guidance, Impeccable, Taste Skill and UI UX Pro Max (sources in the
 * research doc). Lowercase; match with `isOverusedFont`.
 */
export const OVERUSED_FONTS: readonly string[] = [
  'inter',
  'inter tight',
  'inter display',
  'instrument serif',
  'instrument sans',
  'fraunces',
  'space grotesk',
  'space mono',
  'playfair display',
  'dm sans',
  'dm serif display',
  'dm serif text',
  'geist',
  'geist mono',
  'manrope',
  'plus jakarta sans',
  'satoshi',
  'cabinet grotesk',
  'outfit',
  'syne',
  'cormorant',
  'cormorant garamond',
  'eb garamond',
  'lora',
  'crimson text',
  'crimson pro',
  'newsreader',
  'ibm plex sans',
  'ibm plex serif',
  'ibm plex mono',
  'jetbrains mono',
  'poppins',
  'open sans',
  'roboto',
  'arial',
  'helvetica',
  'georgia',
  'system-ui',
];

/** Normalise a CSS family name: strip quotes, collapse whitespace, lowercase. */
function normaliseFamily(family: string): string {
  return family.replace(/["'`]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const OVERUSED_SET: ReadonlySet<string> = new Set(OVERUSED_FONTS.map(normaliseFamily));

/** True if `family` is a model-reflex font. Case-, quote- and whitespace-insensitive. */
export function isOverusedFont(family: string): boolean {
  return OVERUSED_SET.has(normaliseFamily(family));
}

/** Non-negative modulo that tolerates negative / fractional seeds. */
function mod(n: number, m: number): number {
  const i = Number.isFinite(n) ? Math.trunc(n) : 0;
  return ((i % m) + m) % m;
}

/**
 * A deterministic, seed-rotated sample of prompt lines (`family — role — note`). Each role's list
 * is rotated by the seed, then roles are interleaved round-robin (starting role also rotated), so
 * any `count >= FONT_ROLES.length` includes at least one font per role. Same seed, same lines.
 */
export function typeMenu(seed: number, count = 12): string[] {
  const total = Math.max(0, Math.min(Math.trunc(count), TYPE_LIBRARY.length));
  const queues = FONT_ROLES.map((role, r) => {
    const fonts = TYPE_LIBRARY.filter((f) => f.role === role);
    const offset = mod(seed + r * 7, fonts.length);
    return [...fonts.slice(offset), ...fonts.slice(0, offset)];
  });
  const start = mod(seed, FONT_ROLES.length);
  const picked: LibraryFont[] = [];
  for (let round = 0; picked.length < total; round++) {
    for (let k = 0; k < queues.length && picked.length < total; k++) {
      const font = queues[(start + k) % queues.length]?.[round];
      if (font) picked.push(font);
    }
  }
  return picked.map((f) => `${f.family} — ${f.role} — ${f.note}`);
}
