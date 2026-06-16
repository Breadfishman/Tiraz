/**
 * The shared taste rubric (SPEC §9), split into two layers so it stops homogenising output:
 *
 * 1. A UNIVERSAL floor — style-neutral tells of templated, machine-generated laziness, plus the
 *    craft markers any considered design shows REGARDLESS of aesthetic. This is the only aesthetic
 *    prior applied to every variant, on both the generation and the judging side.
 * 2. Per-variant excellence — what "great" means is defined by each variant's OWN aesthetic
 *    direction (its ethos / `excellence` string), not by one house style. A maximalist variant is
 *    held to maximalist excellence; a minimalist one to minimalist excellence. That layer lives on
 *    the genome and is injected by `composePrompt` / handed to the judge as each option's intent.
 *
 * The earlier single catalog prescribed one aesthetic (restraint, one accent, negative space) as
 * universal "excellence", so the generator AND the judge pulled every variant toward the same look
 * (premature convergence). Keeping this floor genuinely style-neutral is what lets a diverse round
 * stay diverse. Pure data + formatters, fully unit-tested — tuning here moves both sides at once.
 */

/**
 * Style-neutral slop tells: templated, defaulted laziness that reads as machine-generated in ANY
 * aesthetic. Deliberately free of style-specific bans (gradients, symmetry, blur orbs) — those are
 * legitimate choices in some directions and belong to per-variant intent, not this universal floor.
 */
export const UNIVERSAL_SLOP_TELLS: readonly string[] = [
  'the default AI hero: a centered big heading, one subhead, two pill buttons, and nothing else',
  'a symmetric row of three or four equal feature cards (emoji + title + one sentence)',
  'emoji used as iconography instead of a real icon set or custom marks',
  'untouched framework defaults for spacing, radii, and shadows',
  'a timid type scale: one weight, a system font, little size or hierarchy contrast',
  'the stock section order: hero, logo strip, three features, testimonial, CTA',
  'defaulted styling no one chose — effects left at the model reflex (the purple-to-blue gradient, blanket glassmorphism) rather than picked for this design',
  'no focal hierarchy and no signature element: nothing leads the eye, nothing a person would remember or screenshot',
];

/**
 * Style-neutral craft markers: what considered, human-designed work shows in ANY aesthetic — about
 * control and intent, not a particular look. "Excellence in THIS direction" is layered on per-variant
 * (see the module doc), so these never prescribe restraint-vs-maximalism — only craft.
 */
export const UNIVERSAL_CRAFT_MARKERS: readonly string[] = [
  'a deliberate type system: a real font choice/pairing with intentional weight and scale contrast',
  'intentional composition: a clear focal hierarchy and use of space (dense or sparse) that reads as chosen, not defaulted',
  'one distinctive signature element the whole design is built around',
  'craft in the details: considered borders, dividers, empty/hover states, and micro-interactions',
  'motion, where present, choreographed to reinforce hierarchy rather than decorate',
];

/**
 * Generation-side directive (prompt lines) — the bar to clear, injected high in the agent prompt so
 * it builds against the same rubric the judge grades on. Two layers: the universal floor below, plus
 * "excellent = your own aesthetic direction" (the ethos section carries the specifics per variant).
 */
export function tasteBarSection(): string[] {
  return [
    '## Taste bar — clear it (this is graded)',
    'A design critic scores your render. First, clear this universal floor — these read as',
    'machine-generated in ANY style and are scored against you:',
    ...UNIVERSAL_SLOP_TELLS.map((tell) => `- ${tell}`),
    '',
    'Show these markers of considered design (they hold in any aesthetic):',
    ...UNIVERSAL_CRAFT_MARKERS.map((marker) => `- ${marker}`),
    '',
    "Beyond this floor, what counts as excellent is set by THIS variant's aesthetic direction above —",
    'commit to it fully. You are NOT graded against one house style; a bold, committed, well-crafted',
    'execution of your own direction beats a safe, generic one every time.',
    '',
  ];
}

/**
 * Judge-side rubric text for the dedicated palette / colour lens. Judges colour CRAFT, not a
 * preferred amount of colour: a deliberate, cohesive palette wins whether it is restrained or loud.
 * Only the unchosen default (the reflex purple/blue gradient) and muddy / low-contrast work lose.
 */
export function paletteRubric(): string {
  return [
    'colour only: is the palette a deliberate, cohesive choice executed with confident contrast?',
    'Reward committed, intentional colour — whether restrained or bold and saturated — with legible',
    'foreground/background contrast and considered relationships.',
    'Penalise defaulted, muddy, or unchosen palettes, especially the reflex purple/blue gradient',
    'left at the model default. Do NOT prefer restrained over saturated; judge intent and cohesion,',
    'not how loud the palette is.',
  ].join(' ');
}

/**
 * A few concise calibration anchors so the judge's bar is grounded few-shot rather than free-floating.
 * Reuses the universal catalog strings (no drift) and states the key rule explicitly: taste means a
 * committed, crafted, memorable execution in ANY aesthetic — not adherence to one house style.
 */
export function calibrationAnchors(): string[] {
  return [
    'Calibration — "taste" here means a committed, crafted, memorable execution in ANY aesthetic, not',
    'adherence to one house style. Never favour minimal over maximal (or the reverse) for its own sake.',
    `- SLOP (any style): ${UNIVERSAL_SLOP_TELLS[0] ?? ''}; ${UNIVERSAL_SLOP_TELLS[6] ?? ''}.`,
    `- CRAFT (any style): ${UNIVERSAL_CRAFT_MARKERS[2] ?? ''}, plus ${UNIVERSAL_CRAFT_MARKERS[1] ?? ''}.`,
  ];
}

/**
 * Judge-side rubric text for the originality / anti-slop lens — the concrete criteria the vision
 * model applies when picking the more committed, less-templated option. Judges commitment + craft,
 * NOT which aesthetic the critic prefers.
 */
export function antiSlopRubric(): string {
  return [
    'overall originality and craft: which option commits harder to a memorable, intentional design',
    'rather than the generic AI-default look? Judge commitment and craft, not which aesthetic you',
    `prefer. Penalise templated, defaulted tells — ${UNIVERSAL_SLOP_TELLS.join('; ')}.`,
    `Reward markers of intent — ${UNIVERSAL_CRAFT_MARKERS.join('; ')}.`,
    'The more committed, crafted, memorable option wins.',
  ].join(' ');
}
