import type { TasteResult } from './fitness';

export interface JudgeCandidate {
  id: string;
  screenshotPath: string;
  /**
   * This variant's own aesthetic intent (its `excellence` line, falling back to its ethos), so the
   * judge grades how well each option realises ITS OWN direction rather than conformity to one house
   * style (SPEC §9, the anti-homogenisation lever). Absent for variants with no stated direction.
   */
  intent?: string;
}

/** A listwise verdict: every candidate id, best first, plus a one-line critique per id. */
export interface RankingVerdict {
  order: string[];
  critiques: Record<string, string>;
}

export interface JudgeContext {
  brief: string;
  /** Vision model id used for the ranking call. */
  model: string;
  /** Compact BRAND.md excerpt: what's unique, what's off-limits. */
  brand?: string;
  /** The owner's taste notes (TASTE.md). */
  taste?: string;
  /** Screenshots of reference sites the owner loves (the bar), sent after the options. */
  references?: string[];
}

/**
 * Ranks a whole generation of rendered variants in ONE call (SPEC §9). The live implementation is a
 * vision model reading every screenshot at once; the ranking logic below depends only on this
 * interface, so it is fully testable with a deterministic fake.
 */
export interface RankingJudge {
  rank(candidates: JudgeCandidate[], ctx: JudgeContext): Promise<RankingVerdict>;
}

/** Default judge model — a strong, cheaper vision model; override with `agent.judgeModel`. */
export const DEFAULT_JUDGE_MODEL = 'claude-sonnet-5-5';

/** The single panel "lens" recorded per variant now that one listwise call judges every dimension. */
export const OVERALL_LENS = 'overall';

export interface TasteRankingOptions {
  brief: string;
  judge: RankingJudge;
  model?: string;
  brand?: string;
  taste?: string;
  references?: string[];
}

/**
 * Rank a generation's variants with one listwise judge call (SPEC §9). Replaces the old pairwise
 * tournament (every pair x every lens x both orders — quadratic in the number of variants) with a
 * single call that sees every screenshot side by side, which current vision models handle well.
 *
 * The verdict is normalised defensively: unknown or duplicate ids are dropped and any candidate the
 * judge omitted is appended in input order, so every candidate always gets a rank. The derived 0-100
 * score is linear in rank (best = 100, worst = 0). A lone candidate needs no call.
 */
export async function runTasteRanking(
  candidates: JudgeCandidate[],
  opts: TasteRankingOptions,
): Promise<Record<string, TasteResult>> {
  const model = opts.model ?? DEFAULT_JUDGE_MODEL;
  if (candidates.length === 0) return {};

  const ids = candidates.map((c) => c.id);
  const verdict: RankingVerdict =
    candidates.length === 1
      ? { order: ids, critiques: {} }
      : await opts.judge.rank(candidates, {
          brief: opts.brief,
          model,
          ...(opts.brand !== undefined ? { brand: opts.brand } : {}),
          ...(opts.taste !== undefined ? { taste: opts.taste } : {}),
          ...(opts.references !== undefined ? { references: opts.references } : {}),
        });

  const known = new Set(ids);
  const order: string[] = [];
  for (const id of verdict.order) {
    if (known.has(id) && !order.includes(id)) order.push(id);
  }
  for (const id of ids) {
    if (!order.includes(id)) order.push(id);
  }

  const n = order.length;
  const result: Record<string, TasteResult> = {};
  order.forEach((id, index) => {
    result[id] = {
      rank: index + 1,
      derivedScore: n === 1 ? 100 : Math.round(((n - 1 - index) / (n - 1)) * 100),
      panel: [
        {
          lens: OVERALL_LENS,
          model,
          rationale: verdict.critiques[id] ?? (n === 1 ? 'only variant' : 'no critique returned'),
        },
      ],
    };
  });
  return result;
}
