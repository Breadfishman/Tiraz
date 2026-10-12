/**
 * The live taste judge (SPEC §9): a vision model sees every rendered screenshot of a generation at
 * once and ranks them in a single call. Prompt building and verdict parsing are pure + fully tested;
 * the actual vision call (and reading the image files) is the injected `complete` boundary, with real
 * implementations in `anthropic-io.ts` (API) and `claude-judge-io.ts` (the local `claude` CLI).
 *
 * Images are shown as neutral numbered options so the model never sees the variant ids.
 */

import { z } from 'zod';
import type { JudgeCandidate, JudgeContext, RankingJudge, RankingVerdict } from './taste-judge';
import { antiSlopRubric, calibrationAnchors, paletteRubric } from './taste-rubric';

// One rubric covering what the old per-lens panel split apart. It judges CRAFT for each option's own
// intent, never conformity to one house style (sparse vs dense, restrained vs loud are not graded).
const RUBRIC = [
  '- Typography: a deliberate type system — hierarchy, scale and weight contrast, pairing, measure,',
  '  leading. Confident type (loud or quiet) beats timid system-stack defaults.',
  '- Layout: spatial control, rhythm, a clear focal hierarchy, intentional use of space (dense or',
  '  sparse). Deliberate composition beats a templated, defaulted layout.',
  `- Colour: ${paletteRubric()}`,
  `- Originality: ${antiSlopRubric()}`,
  '- Execution: nothing broken — no overlapping or clipped content, unstyled sections, missing images',
  '  or blank areas. A broken render loses to a working one regardless of ambition.',
].join('\n');

const JUDGE_SYSTEM = [
  'You are a senior design critic with exceptional, non-generic taste. You rank rendered UI',
  'screenshots from best to worst. You are decisive: every option gets a distinct rank.',
  '',
  ...calibrationAnchors(),
].join('\n');

export interface JudgePrompt {
  system: string;
  prompt: string;
}

/**
 * Build the (pure) system + user prompt for ranking `intents.length` options. `intents[i]` is option
 * `i + 1`'s own stated direction (or undefined). The caller supplies the images in the same order.
 */
export function buildRankPrompt(brief: string, intents: (string | undefined)[]): JudgePrompt {
  const n = intents.length;
  const lines = [
    `${String(n)} UI screenshots implement the same brief. The images are options 1 to ${String(n)},`,
    'in the order given (each may be a tall full-page capture — look at the whole page).',
    '',
    `Brief: ${brief.trim() === '' ? '(no brief supplied)' : brief.trim()}`,
  ];

  const stated = intents.map((intent) => intent?.trim() ?? '');
  if (stated.some((intent) => intent !== '')) {
    lines.push(
      '',
      'Each option commits to its OWN aesthetic direction — they may be very different (minimal,',
      'maximal, brutalist, playful). Do NOT favour one aesthetic over another; judge which options',
      'realise their own direction with the most craft, commitment, and memorability.',
    );
    stated.forEach((intent, i) => {
      if (intent !== '') lines.push(`- Option ${String(i + 1)}'s direction: ${intent}`);
    });
  }

  lines.push(
    '',
    'Judge on:',
    RUBRIC,
    '',
    'Rank ALL options, best first. For each, give one specific sentence of critique: what works and',
    'the single most important thing to fix.',
    '',
    'Respond with strict JSON and nothing else:',
    '{"ranking": [{"option": <number>, "critique": "<one sentence>"}, ...]}',
  );
  return { system: JUDGE_SYSTEM, prompt: lines.join('\n') };
}

const RankingSchema = z.object({
  ranking: z
    .array(
      z.object({
        option: z.union([z.number(), z.string()]),
        critique: z.string().optional(),
      }),
    )
    .min(1),
});

/** Extract the first balanced `{…}` JSON object from arbitrary model text, or `null`. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
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
 * Parse a model response into a {@link RankingVerdict}, mapping 1-based option numbers back to the
 * candidate ids. Out-of-range or duplicate options are ignored (the ranker appends any omitted ids).
 * When nothing parses, returns the input order with an explanatory critique so a run never aborts.
 */
export function parseRanking(text: string, ids: readonly string[]): RankingVerdict {
  const json = extractJsonObject(text);
  if (json !== null) {
    try {
      const parsed = RankingSchema.safeParse(JSON.parse(json));
      if (parsed.success) {
        const order: string[] = [];
        const critiques: Record<string, string> = {};
        for (const entry of parsed.data.ranking) {
          const index = Number(entry.option) - 1;
          const id = Number.isInteger(index) ? ids[index] : undefined;
          if (id === undefined || order.includes(id)) continue;
          order.push(id);
          const critique = entry.critique?.trim() ?? '';
          if (critique !== '') critiques[id] = critique;
        }
        if (order.length > 0) return { order, critiques };
      }
    } catch {
      // fall through to the default below
    }
  }
  const note = `Could not parse judge response; kept input order. Raw: ${text.trim().slice(0, 200)}`;
  return { order: [...ids], critiques: Object.fromEntries(ids.map((id) => [id, note])) };
}

export interface VisionRequest {
  model: string;
  system: string;
  prompt: string;
  /** Screenshot paths in option order — the live impl reads + sends them as image blocks. */
  imagePaths: string[];
}

/** Sends the ranking prompt + every screenshot to a vision model and returns its raw text. */
export type VisionComplete = (request: VisionRequest) => Promise<string>;

/** {@link RankingJudge} backed by a vision model: build the prompt, call `complete`, parse. */
export class VisionRankingJudge implements RankingJudge {
  private readonly complete: VisionComplete;

  constructor(complete: VisionComplete) {
    this.complete = complete;
  }

  async rank(candidates: JudgeCandidate[], ctx: JudgeContext): Promise<RankingVerdict> {
    const { system, prompt } = buildRankPrompt(
      ctx.brief,
      candidates.map((c) => c.intent),
    );
    const text = await this.complete({
      model: ctx.model,
      system,
      prompt,
      imagePaths: candidates.map((c) => c.screenshotPath),
    });
    return parseRanking(
      text,
      candidates.map((c) => c.id),
    );
  }
}
