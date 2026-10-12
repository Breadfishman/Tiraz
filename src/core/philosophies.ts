/**
 * Named design philosophies and an index of the popular agent "design skills" (the crowd).
 *
 * Two pure catalogs used by the direction planner to break out of the model's house style:
 *
 * 1. PHILOSOPHIES — well-known design movements / schools, each reduced to a handful of concrete,
 *    CHECKABLE constraints (type, grid, colour, ornament, motion) plus the way an AI renders it
 *    lazily. The planner deliberately picks ONE per direction so a round spans genuinely different
 *    backbones instead of five variations on the same cream-and-serif page.
 * 2. CROWD_SKILLS — the agent design skills with real traction (see
 *    docs/research/design-skills-landscape.md for sources). Following every skill produces its own
 *    kind of slop, so this is an INDEX of what their outputs share, used to steer AWAY from the
 *    crowd — never a set of instructions to follow. Tells are derived from each skill's own
 *    published prescriptions and calibration lists, not from a measured corpus of outputs.
 *
 * Pure data + small formatters, fully unit-tested.
 */

/** A design philosophy usable as a direction's backbone. */
export interface Philosophy {
  /** Stable kebab-case id, used in prompts and genomes. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** 3–5 concrete, checkable constraints (type, grid, colour, ornament, motion). */
  constraints: string[];
  /** How it goes wrong when an AI does it lazily — the costume version to avoid. */
  lazyFailure: string;
}

/** A popular agent design skill whose outputs share recognisable tells. */
export interface CrowdSkill {
  /** Stable kebab-case id. */
  id: string;
  /** The skill's name as published. */
  name: string;
  /** Source URL (repository or listing) the entry was verified against. */
  source: string;
  /** Its core aesthetic stance, one line. */
  stance: string;
  /** Recognisable visual tells its outputs share (what makes a site built with it identifiable). */
  tells: string[];
}

/**
 * Design philosophies. Constraints are phrased so a reviewer (or a vision judge) can check them on
 * a render; each `lazyFailure` names the surface-level costume a model produces instead.
 */
export const PHILOSOPHIES: readonly Philosophy[] = [
  {
    id: 'swiss',
    name: 'Swiss / International Typographic Style',
    constraints: [
      'a visible modular grid (6–12 columns) that every block, image and caption snaps to',
      'one neo-grotesk family in two or three weights; flush-left, ragged-right text, never centred',
      'hierarchy by size and position alone: no boxes, shadows or decorative rules',
      'asymmetric composition with large deliberate fields of empty space',
      'objective imagery (photography, diagrams) and at most one signal colour beside black and white',
    ],
    lazyFailure:
      'Helvetica-ish type on a centred layout with a red accent, but no actual grid underneath — the look without the system',
  },
  {
    id: 'rams',
    name: 'Dieter Rams — less but better',
    constraints: [
      'every element must have a function; remove anything that only decorates',
      'a neutral palette of warm greys and off-white with a single functional accent reserved for the primary action',
      'controls read as physical, unambiguous objects with clear affordance and generous hit areas',
      'tight, consistent spacing scale and one radius used throughout',
      'motion only as feedback for an action, short and linear-to-ease-out',
    ],
    lazyFailure:
      'an empty white page with a grey pill button — absence mistaken for reduction, with no detailing or honesty of function left',
  },
  {
    id: 'apple-hig',
    name: 'Apple HIG — clarity, deference, depth',
    constraints: [
      'content first: chrome recedes (translucent or minimal bars) and never competes with content',
      'the system type stack with optical sizing; hierarchy by weight and size, tight tracking on large text',
      'depth through layered translucent materials and real elevation, not decorative shadows',
      'interruptible, velocity-aware spring motion that follows the pointer 1:1',
      'large rounded continuous-corner surfaces with consistent concentric radii',
    ],
    lazyFailure:
      'a product shot floating on white with blanket backdrop-blur glass and fade-up animations — Apple keynote cosplay with none of the interaction physics',
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    constraints: [
      'geometric primitives (circle, square, triangle) as structural, not decorative, elements',
      'primary colours (red, yellow, blue) plus black and white, applied in flat solid fields',
      'geometric sans or custom constructed lettering; type set on diagonals or vertical axes is allowed',
      'composition built from overlapping planes with strong figure–ground contrast',
    ],
    lazyFailure:
      'random primary-coloured circles scattered behind an otherwise ordinary SaaS layout',
  },
  {
    id: 'brutalism',
    name: 'Web Brutalism',
    constraints: [
      'raw HTML energy: default-like browser elements, visible structure, unstyled or system type used on purpose',
      'harsh contrast and a palette chosen to clash or to be stark (often black, white and one loud colour)',
      'dense, uneven layout that exposes the grid or deliberately breaks it',
      'no soft shadows, gradients or rounded corners; hard edges only',
      'little or no motion; what exists is abrupt, not eased',
    ],
    lazyFailure:
      'neo-brutalism-as-template: chunky black borders, hard 4px offset shadows and a pastel fill on otherwise conventional cards',
  },
  {
    id: 'memphis',
    name: 'Memphis Group',
    constraints: [
      'clashing saturated pastels and brights used together at full strength',
      'squiggles, terrazzo / confetti patterns and zig-zags as surface pattern on large areas',
      'geometric solids with offset outlines; deliberately irregular, playful composition',
      'chunky display type with rounded or geometric forms',
    ],
    lazyFailure:
      'a few clip-art squiggles sprinkled on a neutral layout — pattern as sticker rather than as the whole surface',
  },
  {
    id: 'editorial',
    name: 'Editorial / magazine',
    constraints: [
      'a real typographic hierarchy with a display face, a text face and distinct deck/standfirst styles',
      'multi-column text grid with varied column spans, pull quotes and image bleeds',
      'art-directed imagery cropped with intent, captions set in a separate style',
      'page rhythm that changes spread to spread rather than repeating one section template',
    ],
    lazyFailure:
      "Claude's house style: cream ground, serif headline with one italic accent word, tiny tracked caps labels, '§ 01' numbering and hairline rules",
  },
  {
    id: 'japanese-ma',
    name: 'Japanese minimalism (ma)',
    constraints: [
      'negative space treated as an active element; content occupies a small part of the field',
      'asymmetric balance with off-centre focal points',
      'a muted natural palette (sumi black, paper, ash, one natural accent such as indigo or vermilion)',
      'vertical rhythm and generous line-height; text blocks kept short',
      'slow, quiet transitions or none at all',
    ],
    lazyFailure:
      'a red circle, a brush-stroke font and a cherry-blossom photo — orientalist decoration in place of spatial restraint',
  },
  {
    id: 'neo-grotesk-product',
    name: 'Neo-grotesk product (Stripe / Linear school)',
    constraints: [
      'one precise grotesk at tight tracking for display, the same family for UI and body',
      'real product UI as the hero visual, rendered crisply at native scale',
      'a dark or near-white base with a disciplined accent system and subtle 1px borders',
      'dense, information-rich sections with precise alignment and a strict 4/8px spacing scale',
      'small, fast micro-interactions (≤200ms) tied to state changes',
    ],
    lazyFailure:
      'the purple-to-blue glow, a dark gradient mesh and three equal feature cards — the Linear look as a skin with no product in it',
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian functionalism',
    constraints: [
      'light, airy grounds with natural tints (birch, oat, fog) rather than pure white',
      'a friendly humanist sans; rounded but not bubbly forms',
      'soft, low-saturation colour blocks used as large calm fields',
      'tactile photography of materials and people in daylight',
    ],
    lazyFailure:
      'beige everything with a sans-serif and a plant photo — warmth without any functional clarity or tactile detail',
  },
  {
    id: 'art-deco',
    name: 'Art Deco',
    constraints: [
      'symmetrical, stepped and sunburst geometry as framing devices',
      'high-contrast or tall condensed display lettering, often all caps with wide tracking on titles',
      'a luxe palette (black, cream or deep green/navy with metallic gold or brass) in flat fills',
      'strong vertical emphasis and repeated linear ornament',
    ],
    lazyFailure:
      'a gold gradient on black with a Gatsby-ish font — the casino-flyer version with no geometric discipline',
  },
  {
    id: 'constructivism',
    name: 'Russian Constructivism',
    constraints: [
      'dynamic diagonal composition; type and blocks set at strong angles',
      'red, black and off-white only, in flat solid areas',
      'heavy condensed sans lettering used as structure, often at huge scale',
      'photomontage and cut-out imagery combined with geometric bars',
    ],
    lazyFailure:
      'a red-and-black propaganda pastiche with a tilted headline and nothing else — slogan aesthetics with no compositional tension',
  },
  {
    id: 'organic-craft',
    name: 'Organic / handmade craft',
    constraints: [
      'irregular, hand-drawn or cut-paper shapes and textures instead of geometric primitives',
      'a palette pulled from natural materials (clay, moss, ink, dye) at varied saturation',
      'type with visible humanity: calligraphic, slab or quirky text faces, never a sterile grotesk',
      'imperfect alignment and layered collage that still keeps a readable hierarchy',
    ],
    lazyFailure:
      'blob SVGs and a handwriting font on a standard template — "organic" as a filter rather than a making process',
  },
  {
    id: 'retro-futurism',
    name: 'Retro-futurism / Y2K',
    constraints: [
      'chrome, iridescent or holographic materials used as focal surfaces',
      'expressive techno display faces, extended widths and outlined type',
      'saturated electric palette (cyan, magenta, acid lime) on deep or silver grounds',
      'UI-like framing devices (windows, HUD panels, pixel grids) as composition',
    ],
    lazyFailure:
      'neon glow on near-black with a monospace font — generic "cyber" instead of a specific era and material',
  },
  {
    id: 'information-design',
    name: 'Information design (Tufte school)',
    constraints: [
      'data or diagrams carry the page; maximise data-ink and remove chart junk',
      'small multiples and annotated figures instead of decorative illustration',
      'a quiet text serif or humanist sans with tabular figures and margin notes',
      'colour used only to encode meaning, with a legend or direct labels',
    ],
    lazyFailure:
      'fake dashboard sparklines and big stat numbers as decoration — charts with no data behind them',
  },
];

/**
 * Popular agent design skills (verified sources in docs/research/design-skills-landscape.md).
 * Tells shared across skills use identical wording so `crowdTells()` de-duplicates them.
 */
export const CROWD_SKILLS: readonly CrowdSkill[] = [
  {
    id: 'anthropic-frontend-design',
    name: 'frontend-design (Anthropic)',
    source: 'https://github.com/anthropics/skills/tree/main/skills/frontend-design',
    stance:
      'a distinctive, subject-led identity with one memorable focal point; its own text lists the looks AI output clusters around',
    tells: [
      'warm cream ground (near #F4F1EA) with a high-contrast serif display and a terracotta / clay accent (near #D97757)',
      'near-black ground with a single acid-green or vermilion accent',
      'broadsheet layout: hairline rules, zero border-radius, dense newspaper columns',
      'one word of a headline accented in italic or the brand colour',
      'tracked-out ALL-CAPS eyebrow labels above headings',
      'numbered section markers (01 / 02 / 03, § 01) on content that is not a sequence',
      "meta strings joined with middle dots ('A · B · C') and 'WORD — fragment' labels",
      'monospace used for small data labels as a "technical" costume',
      "a '→' appended to link and button text",
      'fade-and-slide-up entrance on every section',
    ],
  },
  {
    id: 'impeccable',
    name: 'Impeccable (pbakaus)',
    source: 'https://github.com/pbakaus/impeccable',
    stance:
      'commit to an own-world direction per surface; refuse category defaults, enforced by a deterministic anti-pattern detector',
    tells: [
      'colour committed at page scale: one saturated hue drenching 30–60% of the surface',
      'neutrals tinted toward the accent hue; no pure black, white or grey',
      'no eyebrows or kicker labels at all; headings stand alone',
      'browser surfaces themed from the palette: selection colour, caret, scrollbars, focus rings, underline offset',
      'a single authored motion moment with exponential ease-out; no bounce or elastic easing',
      'faces with a point of view chosen to avoid its reflex list (Fraunces, Playfair, Space Grotesk, DM Sans, Outfit …)',
    ],
  },
  {
    id: 'taste-skill',
    name: 'Taste Skill / design-taste-frontend (Leonxlnx)',
    source: 'https://github.com/Leonxlnx/taste-skill',
    stance:
      'anti-slop premium frontend tuned by variance / motion / density dials, with long lists of hard bans',
    tells: [
      'Geist, Satoshi or Cabinet Grotesk sans paired with a mono (Geist Mono, JetBrains Mono)',
      'Zinc / Slate / Stone neutral base with exactly one accent (emerald, electric blue, deep rose, burnt orange)',
      'bento grids whose cells are tinted, imaged or patterned',
      'asymmetric or split-screen hero instead of a centred one; headline capped at two lines',
      'spring-physics motion (Framer Motion / Motion) on transform and opacity',
      'Phosphor / Tabler / Radix icons instead of Lucide',
      'no em dashes anywhere in the copy',
    ],
  },
  {
    id: 'apple-design',
    name: 'apple-design (emilkowalski/skills)',
    source: 'https://github.com/emilkowalski/skills',
    stance:
      "Apple's WWDC fluid-interface principles translated for the web: instant response, 1:1 tracking, interruptible springs",
    tells: [
      'spring-physics motion (Framer Motion / Motion) on transform and opacity',
      'buttons that scale to ~0.97 on press',
      'translucent nav / toolbars / sheets with backdrop-filter blur and saturate over scrolling content',
      'scroll-edge blur or gradient masks under sticky chrome instead of a 1px divider',
      'system-ui font stack with optical sizing as the default face',
    ],
  },
  {
    id: 'ui-ux-pro-max',
    name: 'UI UX Pro Max (nextlevelbuilder)',
    source: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
    stance:
      'a searchable database of named UI styles, product-type palettes and font pairings matched to the product category',
    tells: [
      'a named style preset applied whole (glassmorphism, claymorphism, neumorphism, bento grid)',
      'stock Google-font pairings such as Playfair Display + Inter, Poppins + Open Sans, Space Grotesk + DM Sans',
      'a palette looked up from the product category, so the colours are predictable from the industry alone',
    ],
  },
];

/** Prompt lines listing philosophies compactly: `id: name — constraint; constraint; …`. */
export function philosophyMenu(): string[] {
  return PHILOSOPHIES.map((p) => `${p.id}: ${p.name} — ${p.constraints.join('; ')}`);
}

/**
 * De-duplicated list of crowd output tells, in catalog order, for an "avoid the crowd" prompt
 * section. Comparison is case- and whitespace-insensitive; the first spelling wins.
 */
export function crowdTells(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const skill of CROWD_SKILLS) {
    for (const tell of skill.tells) {
      const key = tell.trim().replace(/\s+/g, ' ').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tell.trim());
    }
  }
  return out;
}
