import type { DsAdherenceResult } from './ds-adherence';
import type { LintResult } from './lint';
import type { TellReport } from './tells';
import type { Fitness, TirazConfig } from './manifest';

/**
 * Output of the taste judge (SPEC §9): a pairwise-tournament ranking within a generation plus a
 * derived 0–100 score and the judge's critique (one `overall` panel entry). Produced by
 * `runTasteRanking`; consumed here so the composite can be assembled.
 */
export interface TasteResult {
  rank: number;
  derivedScore: number;
  panel: { lens: string; model: string; rationale: string }[];
}

export interface ComposeFitnessOptions {
  /** A failed lint floor zeroes the composite (default true). */
  lintGate?: boolean;
  /** The "Claude tells" scan; absent → no originality term. */
  tells?: TellReport;
  /** Max fraction of the composite the tells can remove (`fitness.tellPenalty`, default 0.3). */
  tellPenalty?: number;
}

/**
 * Assemble the {@link Fitness} for a variant (SPEC §9). With `lintGate` on, the lint floor is a gate,
 * not a ranker: a variant that fails it gets a composite of 0. With it off (the config default)
 * violations are recorded but advisory. The composite is the weighted blend of design-system
 * adherence and taste, scaled down by the tells scan: `blend * (1 - tellPenalty * (1 - score/100))`.
 */
export function composeFitness(
  lint: LintResult,
  ds: DsAdherenceResult,
  taste: TasteResult,
  weights: TirazConfig['fitness']['weights'],
  opts: ComposeFitnessOptions = {},
): Fitness {
  const blend = weights.dsAdherence * ds.score + weights.taste * taste.derivedScore;
  const penalty =
    opts.tells === undefined ? 0 : (opts.tellPenalty ?? 0.3) * (1 - opts.tells.score / 100);
  const composite = lint.passed || opts.lintGate === false ? blend * (1 - penalty) : 0;

  return {
    lintFloor: { passed: lint.passed, violations: lint.violations },
    dsAdherence: { score: ds.score, offSystemValues: ds.offSystemValues },
    taste: { rank: taste.rank, derivedScore: taste.derivedScore, panel: taste.panel },
    ...(opts.tells !== undefined
      ? {
          originality: {
            score: opts.tells.score,
            tells: opts.tells.findings.map((f) => f.id),
          },
        }
      : {}),
    composite: Math.round(composite * 10) / 10,
  };
}
