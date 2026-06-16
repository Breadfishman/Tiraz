/**
 * The live taste judge (SPEC §9): a vision model reads two rendered screenshots and picks the
 * better one for a given lens. The prompt building and verdict parsing are pure + fully tested; the
 * actual Anthropic vision call (and reading the image files) is the injected `complete` boundary,
 * with the real implementation in `anthropic-io.ts` (coverage-excluded glue).
 *
 * Pairwise, not absolute — LLM judges are far better at relative comparisons (SPEC §9). Images are
 * shown as neutral "A" / "B" so the model never sees the variant ids.
 */

import { z } from 'zod';
import type { JudgeCandidate, JudgeContext, PairwiseJudge, PairwiseVerdict } from './taste-judge';
import { antiSlopRubric, calibrationAnchors, paletteRubric } from './taste-rubric';

// Lens rubrics judge CRAFT for the option's own intent, not conformity to one house style (SPEC §9).
// They reward control and deliberateness in any aesthetic and never prefer sparse-over-dense or
// restrained-over-bold for its own sake — that bias is exactly what used to collapse diversity.
const LENS_RUBRICS: Record<string, string> = {
  typography:
    "type craft only: is the type system deliberate and well-executed for THIS design's intent — " +
    'hierarchy, scale and weight contrast, pairing, line-length, leading, tracking? Reward confident, ' +
    'intentional type (loud or quiet); penalise timid system-stack defaults and flat hierarchy.',
  layout:
    'composition craft only: spatial control, rhythm, focal hierarchy, and intentional use of space ' +
    "(dense or sparse) for THIS design's intent. Reward deliberate, controlled composition; penalise " +
    'templated, defaulted layout. Do NOT prefer sparse over dense or symmetric over asymmetric — ' +
    'judge control and intent, not style.',
  motion:
    'implied motion and interaction polish: easing, choreography, micro-interaction cues visible in ' +
    'the still. Reward motion that is intentional and choreographed for this design; penalise generic ' +
    'or defaulted motion. Absence of motion is fine when the design does not call for it.',
  // Dedicated palette/colour lens — judges colour craft (cohesion + intent), not amount of colour.
  palette: paletteRubric(),
  // The anti-slop lens draws on the universal floor so the judge grades on the same style-neutral
  // catalog the agent builds against (taste-rubric.ts) — commitment + craft, not a preferred look.
  'generic-feel': antiSlopRubric(),
};

const DEFAULT_RUBRIC = 'overall design quality and taste for this brief.';

// A few concise calibration anchors (from the shared rubric) so the critic's bar is grounded few-shot
// rather than free-floating — kept consistent with what the generator builds against (taste-rubric.ts).
const JUDGE_SYSTEM = [
  'You are a senior design critic with exceptional, non-generic taste. You compare two UI ' +
    'screenshots and judge which is better on a single specified dimension. You are decisive and ' +
    'never call a tie.',
  '',
  ...calibrationAnchors(),
].join('\n');

export interface JudgePrompt {
  system: string;
  prompt: string;
}

/** Each option's own aesthetic direction, so the judge grades execution-of-intent, not house style. */
export interface JudgeIntents {
  a?: string;
  b?: string;
}

/** Build the (pure) system + user prompt for a lens comparison. The caller supplies the images. */
export function buildJudgePrompt(
  brief: string,
  lens: string,
  intents: JudgeIntents = {},
): JudgePrompt {
  const rubric = LENS_RUBRICS[lens] ?? DEFAULT_RUBRIC;
  const lines = [
    'Two UI screenshots implement the same brief. The first image is option A; the second is option B.',
    '',
    `Brief: ${brief.trim() === '' ? '(no brief supplied)' : brief.trim()}`,
  ];

  // When each option states its own aesthetic direction, judge how well it realises THAT — the two
  // may pursue very different looks, and neither aesthetic is "more correct" (SPEC §9).
  const aIntent = intents.a?.trim() ?? '';
  const bIntent = intents.b?.trim() ?? '';
  if (aIntent !== '' || bIntent !== '') {
    lines.push(
      '',
      'Each option commits to its OWN aesthetic direction — they may be very different (minimal,',
      'maximal, brutalist, playful). Do NOT favour one aesthetic over another; judge which option',
      'realises its own direction with more craft, commitment, and memorability on the dimension below.',
    );
    if (aIntent !== '') lines.push(`Option A's direction: ${aIntent}`);
    if (bIntent !== '') lines.push(`Option B's direction: ${bIntent}`);
  }

  lines.push(
    '',
    `Judge ONLY this dimension — ${lens}: ${rubric}`,
    'Ignore all other dimensions. Pick the single better option.',
    '',
    'Respond with strict JSON and nothing else:',
    '{"winner": "A" | "B", "rationale": "<one or two sentences, specific to the dimension>"}',
  );
  return { system: JUDGE_SYSTEM, prompt: lines.join('\n') };
}

const VerdictSchema = z.object({
  winner: z.enum(['A', 'B']),
  rationale: z.string().min(1),
});

/** Extract the first balanced `{…}` JSON object from arbitrary model text, or `null`. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Parse a model response into a {@link PairwiseVerdict}, mapping the "A"/"B" label back to the
 * candidate ids. Defaults to `aId` (with a noting rationale) when the response can't be parsed — the
 * tournament must always get a valid winner from the pair.
 */
export function parseVerdict(text: string, aId: string, bId: string): PairwiseVerdict {
  const json = extractJsonObject(text);
  if (json !== null) {
    try {
      const parsed = VerdictSchema.safeParse(JSON.parse(json));
      if (parsed.success) {
        return {
          winner: parsed.data.winner === 'A' ? aId : bId,
          rationale: parsed.data.rationale,
        };
      }
    } catch {
      // fall through to the default below
    }
  }
  return {
    winner: aId,
    rationale: `Could not parse judge response; defaulted to A. Raw: ${text.trim().slice(0, 200)}`,
  };
}

export interface VisionRequest {
  model: string;
  system: string;
  prompt: string;
  /** Screenshot paths in [A, B] order — the live impl reads + sends them as image blocks. */
  imagePaths: [string, string];
}

/** Sends a lens prompt + the two screenshots to a vision model and returns its raw text response. */
export type VisionComplete = (request: VisionRequest) => Promise<string>;

/**
 * {@link PairwiseJudge} backed by a vision model (SPEC §9). Pure orchestration: build the lens
 * prompt, hand the two screenshots to the injected `complete`, parse the verdict. The mixed-model
 * panel is realized by `JudgeContext.model` varying per lens (`DEFAULT_LENSES`).
 */
export class VisionPairwiseJudge implements PairwiseJudge {
  private readonly complete: VisionComplete;

  constructor(complete: VisionComplete) {
    this.complete = complete;
  }

  async compare(a: JudgeCandidate, b: JudgeCandidate, ctx: JudgeContext): Promise<PairwiseVerdict> {
    const { system, prompt } = buildJudgePrompt(ctx.brief, ctx.lens, {
      ...(a.intent !== undefined ? { a: a.intent } : {}),
      ...(b.intent !== undefined ? { b: b.intent } : {}),
    });
    const text = await this.complete({
      model: ctx.model,
      system,
      prompt,
      imagePaths: [a.screenshotPath, b.screenshotPath],
    });
    return parseVerdict(text, a.id, b.id);
  }
}
