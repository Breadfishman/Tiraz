import type { DsAdherenceResult } from './ds-adherence';
import type { LintResult } from './lint';
import type { Fitness, TirazConfig } from './manifest';

/**
 * Output of the taste judge (SPEC §9): a pairwise-tournament ranking within a generation plus a
 * derived 0–100 score and the per-lens panel verdicts. Produced by the VLM judge (next slice);
 * consumed here so the composite can be assembled.
 */
export interface TasteResult {
  rank: number;
  derivedScore: number;
  panel: { lens: string; model: string; rationale: string }[];
}

/**
 * Assemble the three-term {@link Fitness} for a variant (SPEC §9). The lint floor is a gate, not a
 * ranker: a variant that fails it gets a composite of 0 (it is dropped). Otherwise the composite is
 * the configured weighted blend of design-system adherence and taste.
 */
export function composeFitness(
  lint: LintResult,
  ds: DsAdherenceResult,
  taste: TasteResult,
  weights: TirazConfig['fitness']['weights'],
): Fitness {
  const composite = lint.passed
    ? weights.dsAdherence * ds.score + weights.taste * taste.derivedScore
    : 0;

  return {
    lintFloor: { passed: lint.passed, violations: lint.violations },
    dsAdherence: { score: ds.score, offSystemValues: ds.offSystemValues },
    taste: { rank: taste.rank, derivedScore: taste.derivedScore, panel: taste.panel },
    composite,
  };
}
