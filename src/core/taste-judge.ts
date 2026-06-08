import type { TasteResult } from './fitness';

export interface JudgeCandidate {
  id: string;
  screenshotPath: string;
}

export interface PairwiseVerdict {
  /** The id of the better candidate (must be one of the pair). */
  winner: string;
  rationale: string;
}

export interface LensConfig {
  lens: string;
  /** Model id used for this lens (mixed-model panel de-correlates errors, SPEC §9). */
  model: string;
}

export interface JudgeContext {
  brief: string;
  lens: string;
  model: string;
}

/**
 * Compares two rendered variants for a given lens. The live implementation is a vision model
 * (Anthropic API) reading both screenshots; the tournament below depends only on this interface,
 * so it is fully testable with a deterministic fake.
 */
export interface PairwiseJudge {
  compare(a: JudgeCandidate, b: JudgeCandidate, ctx: JudgeContext): Promise<PairwiseVerdict>;
}

/** Default mixed-model 3-lens panel (SPEC §9): one Sonnet panelist de-correlates the Opus judges. */
export const DEFAULT_LENSES: readonly LensConfig[] = [
  { lens: 'typography', model: 'claude-opus-4-8' },
  { lens: 'layout', model: 'claude-opus-4-8' },
  { lens: 'generic-feel', model: 'claude-sonnet-4-6' },
];

export interface TasteTournamentOptions {
  brief: string;
  judge: PairwiseJudge;
  lenses?: readonly LensConfig[];
}

const NO_VERDICT = 'no winning verdict for this lens';

/**
 * Run a pairwise tournament over a generation's variants (SPEC §9): every unordered pair is judged
 * by every lens in both orders (to cancel position bias). Wins are tallied into a ranking and a
 * derived 0–100 score (win share). Returns a `TasteResult` per candidate keyed by id.
 *
 * Absolute scores are deliberately avoided — LLM judges are far better at relative comparisons.
 */
export async function runTasteTournament(
  candidates: JudgeCandidate[],
  opts: TasteTournamentOptions,
): Promise<Record<string, TasteResult>> {
  const lenses = opts.lenses ?? DEFAULT_LENSES;
  const wins = new Map<string, number>();
  const comparisons = new Map<string, number>();
  const panels = new Map<string, Map<string, string>>();

  const bump = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  const recordPanel = (id: string, lens: string, rationale: string): void => {
    const lensMap = panels.get(id) ?? new Map<string, string>();
    lensMap.set(lens, rationale);
    panels.set(id, lensMap);
  };

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      for (const { lens, model } of lenses) {
        for (const [x, y] of [
          [a, b],
          [b, a],
        ] as const) {
          const verdict = await opts.judge.compare(x, y, { brief: opts.brief, lens, model });
          const winner = verdict.winner === x.id || verdict.winner === y.id ? verdict.winner : x.id;
          bump(wins, winner);
          bump(comparisons, x.id);
          bump(comparisons, y.id);
          recordPanel(winner, lens, verdict.rationale);
        }
      }
    }
  }

  const ranked = candidates
    .map((candidate) => {
      const won = wins.get(candidate.id) ?? 0;
      const total = comparisons.get(candidate.id) ?? 0;
      return {
        id: candidate.id,
        won,
        derivedScore: total === 0 ? 100 : Math.round((won / total) * 100),
      };
    })
    .sort((p, q) => q.won - p.won || p.id.localeCompare(q.id));

  const result: Record<string, TasteResult> = {};
  ranked.forEach((entry, index) => {
    const lensMap = panels.get(entry.id) ?? new Map<string, string>();
    result[entry.id] = {
      rank: index + 1,
      derivedScore: entry.derivedScore,
      panel: lenses.map(({ lens, model }) => ({
        lens,
        model,
        rationale: lensMap.get(lens) ?? NO_VERDICT,
      })),
    };
  });
  return result;
}
