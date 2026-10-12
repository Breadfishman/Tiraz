/**
 * Gen-0 direction planning (SPEC §4). Instead of cycling a fixed catalog of looks (which, in a
 * redesign, pushes Y2K or cyberpunk onto a company's brand), one short model call writes `count`
 * distinct directions tailored to the brief and the repo's design system. In integration mode the
 * directions are told to stay inside the existing brand. Prompt building + parsing are pure; the call
 * goes through the swappable {@link Agent}, so it is testable with a fake.
 */

import { z } from 'zod';
import type { Agent } from './agent';
import type { DesignSystem } from './ds-adherence';
import { PHILOSOPHIES, crowdTells, philosophyMenu } from './philosophies';
import { OVERUSED_FONTS, typeMenu } from './type-library';
import { extractJsonObject } from './vision-judge';

export interface Direction {
  /** One-line aesthetic direction the variant commits to. */
  ethos: string;
  /** What "excellent" means in this direction (the judge grades against it). */
  excellence: string;
  /** The one ownable element the direction is built around, drawn from the brand / product. */
  signature?: string;
  /** Philosophy backbone id (`philosophies.ts`), when the planner picked one. */
  philosophy?: string;
  /** Typefaces for this direction. */
  type?: string;
  dials: { variance: number; motion: number; density: number };
}

export interface DirectionsRequest {
  brief: string;
  count: number;
  mode: 'integration' | 'greenfield';
  target?: string;
  designSystem?: DesignSystem;
  /** Compact BRAND.md excerpt (`brandBrief`). */
  brand?: string;
  /** The owner's taste notes (TASTE.md). */
  taste?: string;
  /** Directions already tried in earlier rounds — new ones must differ from them. */
  explored?: string[];
  /** Reference screenshot paths (sites the owner loves) the planner may read. */
  references?: string[];
  /** The brand's own typefaces (BRAND.md); when set, every direction uses them. */
  brandFonts?: string[];
  /** Rotates the type-library sample so rounds see different faces. */
  seed?: number;
}

/** Summarise the design system in a few lines (empty when there's nothing to say). */
function systemLines(system: DesignSystem | undefined): string[] {
  if (system === undefined) return [];
  const lines = Object.entries(system.tokens)
    .filter(([, vals]) => vals.length > 0)
    .map(([category, vals]) => `- ${category}: ${vals.slice(0, 8).join(', ')}`);
  if (system.components.length > 0) {
    lines.push(`- components: ${system.components.slice(0, 12).join(', ')}`);
  }
  return lines.length > 0 ? ['', 'Existing design system:', ...lines] : [];
}

/** Build the (pure) planning prompt. */
export function composeDirectionsPrompt(req: DirectionsRequest): string {
  const lines = [
    `Propose ${String(req.count)} genuinely different design directions for the brief below. They will`,
    'be built in parallel and compared side by side, so they must not be near-duplicates: vary',
    'composition, typographic voice, density, and motion — not just colour.',
    '',
    `Brief: ${req.brief.trim()}`,
  ];
  if (req.target !== undefined) lines.push(`Target: ${req.target}`);
  lines.push(...systemLines(req.designSystem));
  if (req.brand !== undefined && req.brand.trim() !== '') {
    lines.push(
      '',
      'The brand, from its owner (BRAND.md). Every direction must grow out of THIS material — what only',
      'this company can say, its voice, its proof — so it could not be mistaken for a competitor:',
      req.brand.trim(),
    );
  }
  if (req.taste !== undefined && req.taste.trim() !== '') {
    lines.push('', "The owner's reactions to earlier variants:", req.taste.trim());
  }
  if ((req.references ?? []).length > 0) {
    lines.push(
      '',
      'Screenshots of sites the owner loves (read them; aim for that level and kind of taste without',
      'copying them):',
      ...(req.references ?? []).map((ref) => `- ${ref}`),
    );
  }
  if ((req.explored ?? []).length > 0) {
    lines.push(
      '',
      'Already tried in earlier rounds — propose directions clearly different from these:',
      ...(req.explored ?? []).map((d) => `- ${d}`),
    );
  }
  if (req.mode === 'integration') {
    lines.push(
      '',
      'This is a REDESIGN of an existing company. Every direction keeps its identity — name, logo, brand',
      'colours — and anything BRAND.md says to keep; everything else (layout, type, imagery, structure)',
      'is open. No costume aesthetics (Y2K, vaporwave, cyberpunk…) unless the brief asks for them.',
    );
  } else {
    lines.push(
      '',
      'This is greenfield: range widely, from restrained to bold. Avoid the generic AI-default look',
      '(centered hero + two pill buttons + three feature cards, purple-blue gradients).',
    );
  }
  lines.push(
    '',
    'Give each direction a different design-philosophy BACKBONE from this index (its "philosophy" id),',
    'or "none" when the brand needs its own logic. Use the constraints, not the costume:',
    ...philosophyMenu().map((line) => `- ${line}`),
    '',
    "The crowd's looks — what sites built with the popular AI design skills share. No direction may",
    'be just one of these:',
    ...crowdTells().map((tell) => `- ${tell}`),
    '',
  );
  if ((req.brandFonts ?? []).length > 0) {
    lines.push(
      `Typography: the brand's typefaces are ${(req.brandFonts ?? []).join(', ')} — every direction uses them.`,
    );
  } else {
    lines.push(
      "Typography: choose each direction's typefaces from this curated library (different per direction):",
      ...typeMenu(req.seed ?? 0, 18).map((line) => `- ${line}`),
      `Never the model defaults (${OVERUSED_FONTS.slice(0, 12).join(', ')}, …).`,
    );
  }
  lines.push(
    '',
    'Each direction needs a SIGNATURE: one ownable element the whole design is built around, drawn from',
    'the brand or the product (e.g. a custom illustration system, a typographic device, a visualisation',
    'of something real the company does). Not decoration, not a generic device (stat counters, gradient',
    'orbs, logo marquees). Avoid the AI house style too: serif headline with an italic accent word, tiny',
    'letter-spaced uppercase labels, "§ 01" numbering, hairline rules on cream paper.',
    '',
    `${(req.references ?? []).length > 0 ? 'Read only the reference screenshots listed above; do not read' : 'Do not read'} or edit any other files. Reply with strict JSON only:`,
    '{"directions": [{"ethos": "<one sentence direction>", "excellence": "<what excellent looks like in',
    'this direction, one sentence>", "signature": "<the ownable element, one sentence>",',
    '"philosophy": "<id or none>", "type": "<display + text typefaces>",',
    '"variance": <1-10>, "motion": <1-10>, "density": <1-10>}]}',
  );
  return lines.join('\n');
}

const PHILOSOPHY_IDS = new Set(PHILOSOPHIES.map((p) => p.id));

const dial = z.coerce.number().transform((n) => Math.min(10, Math.max(1, Math.round(n))));

const DirectionsSchema = z.object({
  directions: z.array(
    z.object({
      ethos: z.string().min(1),
      excellence: z.string().min(1),
      signature: z.string().optional(),
      philosophy: z.string().optional(),
      type: z.string().optional(),
      variance: dial,
      motion: dial,
      density: dial,
    }),
  ),
});

/**
 * Parse the planner's reply. Returns up to `count` directions, or `null` when the reply is unusable
 * (no JSON, wrong shape, or fewer than `count` directions — the caller then falls back to the catalog).
 */
export function parseDirections(text: string, count: number): Direction[] | null {
  const json = extractJsonObject(text);
  if (json === null) return null;
  try {
    const parsed = DirectionsSchema.safeParse(JSON.parse(json));
    if (!parsed.success || parsed.data.directions.length < count) return null;
    return parsed.data.directions.slice(0, count).map((d) => ({
      ethos: d.ethos.trim(),
      excellence: d.excellence.trim(),
      ...(d.signature !== undefined && d.signature.trim() !== ''
        ? { signature: d.signature.trim() }
        : {}),
      ...(d.philosophy !== undefined && PHILOSOPHY_IDS.has(d.philosophy.trim().toLowerCase())
        ? { philosophy: d.philosophy.trim().toLowerCase() }
        : {}),
      ...(d.type !== undefined && d.type.trim() !== '' ? { type: d.type.trim() } : {}),
      dials: { variance: d.variance, motion: d.motion, density: d.density },
    }));
  } catch {
    return null;
  }
}

export interface PlanDirectionsOptions extends DirectionsRequest {
  agent: Agent;
  cwd: string;
  /** Planner model (`agent.plannerModel`). */
  model?: string;
}

/**
 * Ask the agent for tailored directions. Best-effort: any failure (agent error, unparseable reply)
 * returns `null` and the caller falls back to the built-in catalog, so a round is never blocked.
 */
export async function planDirections(opts: PlanDirectionsOptions): Promise<Direction[] | null> {
  try {
    const result = await opts.agent.run({
      cwd: opts.cwd,
      prompt: composeDirectionsPrompt(opts),
      skills: [],
      // One turn to answer, plus one per reference screenshot to read.
      maxTurns: 2 + (opts.references?.length ?? 0),
      readOnly: true,
      ...(opts.model !== undefined ? { model: opts.model } : {}),
    });
    if (!result.ok) return null;
    return parseDirections(result.output, opts.count);
  } catch {
    return null;
  }
}
