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
import { extractJsonObject } from './vision-judge';

export interface Direction {
  /** One-line aesthetic direction the variant commits to. */
  ethos: string;
  /** What "excellent" means in this direction (the judge grades against it). */
  excellence: string;
  dials: { variance: number; motion: number; density: number };
}

export interface DirectionsRequest {
  brief: string;
  count: number;
  mode: 'integration' | 'greenfield';
  target?: string;
  designSystem?: DesignSystem;
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
  if (req.mode === 'integration') {
    lines.push(
      '',
      'This is a REDESIGN of an existing product. Every direction must keep the brand — logo, name,',
      'voice, brand colours and type — and explore composition, hierarchy, rhythm, imagery, and motion',
      'within it. No costume aesthetics (Y2K, vaporwave, cyberpunk…) unless the brief asks for them.',
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
    'Do not read or edit any files. Reply with strict JSON only:',
    '{"directions": [{"ethos": "<one sentence direction>", "excellence": "<what excellent looks like in',
    'this direction, one sentence>", "variance": <1-10>, "motion": <1-10>, "density": <1-10>}]}',
  );
  return lines.join('\n');
}

const dial = z.coerce.number().transform((n) => Math.min(10, Math.max(1, Math.round(n))));

const DirectionsSchema = z.object({
  directions: z.array(
    z.object({
      ethos: z.string().min(1),
      excellence: z.string().min(1),
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
      maxTurns: 2,
      readOnly: true,
      ...(opts.model !== undefined ? { model: opts.model } : {}),
    });
    if (!result.ok) return null;
    return parseDirections(result.output, opts.count);
  } catch {
    return null;
  }
}
