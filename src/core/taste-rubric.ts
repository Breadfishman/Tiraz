/**
 * The shared taste rubric (SPEC §9): one concrete, opinionated definition of what reads as "AI-slop"
 * versus "designed with taste". It is consumed by BOTH sides of the loop — the generator
 * (`composePrompt`) builds against it, and the vision judge (`buildJudgePrompt`) grades against it —
 * so a variant is held to the exact bar it is scored on, with no drift between the two. Pure data +
 * formatters, fully unit-tested. Tuning the catalog here moves both generation and selection at once.
 */

/** The "AI default" look — concrete tells that make a UI read as machine-generated. */
export const SLOP_TELLS: readonly string[] = [
  'a centered single-column hero: big heading, one subhead, two pill buttons, nothing else',
  'predictable purple/blue gradients, gradient text, and default glassmorphism',
  'a symmetric row of three or four equal feature cards (emoji + title + one sentence)',
  'emoji used as iconography instead of a real icon set or custom marks',
  'untouched framework defaults for spacing, radii, and shadows',
  'a timid type scale — one weight, system font, little size or hierarchy contrast',
  'flat symmetry with no intentional negative space, asymmetry, or focal tension',
  'the stock section order: hero, logo strip, three features, testimonial, CTA',
  'decorative blur blobs / floating gradient orbs standing in for real visual ideas',
  'no signature element — nothing a person would remember or screenshot',
];

/** Markers of considered, human-designed work — what clearing the bar looks like. */
export const EXCELLENCE_MARKERS: readonly string[] = [
  'a confident, wide type scale with deliberate weight and size contrast, and a real font pairing',
  'a committed, restrained palette (often one assertive accent) used with intent, not a rainbow',
  'intentional composition — negative space, asymmetry, overlap, or an off-grid focal moment',
  'one distinctive signature element the whole design is built around',
  'craft in the details: considered borders, dividers, empty/hover states, micro-interactions',
  'restrained, choreographed motion that reinforces hierarchy rather than decorates',
];

/**
 * Generation-side directive (prompt lines) — the bar to clear, injected high in the agent prompt so
 * it builds against the same rubric the judge grades on.
 */
export function tasteBarSection(): string[] {
  return [
    '## Taste bar — clear it (this is graded)',
    'Aim for work a senior product designer would ship and screenshot. The render is scored by a',
    'design critic against the bar below — the generic "AI default" look loses every time.',
    '',
    'Avoid these slop tells (each reads as machine-generated and is scored against you):',
    ...SLOP_TELLS.map((tell) => `- ${tell}`),
    '',
    'Show these markers of considered design instead:',
    ...EXCELLENCE_MARKERS.map((marker) => `- ${marker}`),
    '',
  ];
}

/**
 * Judge-side rubric text for the originality / anti-slop lens — the concrete criteria the vision
 * model applies when picking the less-templated, more-designed option.
 */
export function antiSlopRubric(): string {
  return [
    'overall originality and craft: is it designed with taste, or the generic AI-default look?',
    `Penalise slop tells — ${SLOP_TELLS.join('; ')}.`,
    `Reward markers of intent — ${EXCELLENCE_MARKERS.join('; ')}.`,
    'The more memorable, committed, human-designed option wins.',
  ].join(' ');
}
