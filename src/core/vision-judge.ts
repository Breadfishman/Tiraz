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

/** Lens-specific rubrics, mirroring `frontend-design`'s taste criteria (SPEC §9). */
const LENS_RUBRICS: Record<string, string> = {
  typography:
    'type craft only: hierarchy, scale, line-length and leading, font choice and pairing, ' +
    'tracking. Reward confident, non-generic type; penalise default system stacks and timid scale.',
  layout:
    'composition only: spatial rhythm, whitespace, alignment, grid, intentional asymmetry. Reward ' +
    'balance with tension; penalise cramped or boringly symmetric "three equal cards" layouts.',
  motion:
    'implied motion and interaction polish: easing, choreography, micro-interaction cues visible in ' +
    'the still. Reward restraint and intent; penalise generic or absent motion affordances.',
  'generic-feel':
    'overall originality: does it look AI-generated / templated, or designed with taste? Reward ' +
    'distinctive, considered work; penalise the generic "AI default" look.',
};

const DEFAULT_RUBRIC = 'overall design quality and taste for this brief.';

const JUDGE_SYSTEM =
  'You are a senior design critic with exceptional, non-generic taste. You compare two UI ' +
  'screenshots and judge which is better on a single specified dimension. You are decisive and ' +
  'never call a tie.';

export interface JudgePrompt {
  system: string;
  prompt: string;
}

/** Build the (pure) system + user prompt for a lens comparison. The caller supplies the images. */
export function buildJudgePrompt(brief: string, lens: string): JudgePrompt {
  const rubric = LENS_RUBRICS[lens] ?? DEFAULT_RUBRIC;
  const prompt = [
    'Two UI screenshots implement the same brief. The first image is option A; the second is option B.',
    '',
    `Brief: ${brief.trim() === '' ? '(no brief supplied)' : brief.trim()}`,
    '',
    `Judge ONLY this dimension — ${lens}: ${rubric}`,
    'Ignore all other dimensions. Pick the single better option.',
    '',
    'Respond with strict JSON and nothing else:',
    '{"winner": "A" | "B", "rationale": "<one or two sentences, specific to the dimension>"}',
  ].join('\n');
  return { system: JUDGE_SYSTEM, prompt };
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
    const { system, prompt } = buildJudgePrompt(ctx.brief, ctx.lens);
    const text = await this.complete({
      model: ctx.model,
      system,
      prompt,
      imagePaths: [a.screenshotPath, b.screenshotPath],
    });
    return parseVerdict(text, a.id, b.id);
  }
}
