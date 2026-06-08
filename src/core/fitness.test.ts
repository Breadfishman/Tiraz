import { describe, expect, it } from 'vitest';
import type { DsAdherenceResult } from './ds-adherence';
import { composeFitness } from './fitness';
import type { TasteResult } from './fitness';
import type { LintResult } from './lint';

const ds: DsAdherenceResult = { score: 80, offSystemValues: ['color:#abc'], details: [] };
const taste: TasteResult = {
  rank: 1,
  derivedScore: 90,
  panel: [{ lens: 'typography', model: 'claude-opus-4-8', rationale: 'strong type' }],
};
const weights = { dsAdherence: 0.5, taste: 0.5 };

describe('composeFitness', () => {
  it('blends ds-adherence and taste by weight when the lint floor passes', () => {
    const lint: LintResult = { passed: true, score: 95, violations: [] };
    const fitness = composeFitness(lint, ds, taste, weights);
    expect(fitness.composite).toBe(85); // 0.5*80 + 0.5*90
    expect(fitness.lintFloor.passed).toBe(true);
    expect(fitness.dsAdherence.score).toBe(80);
    expect(fitness.taste.rank).toBe(1);
    expect(fitness.taste.panel).toHaveLength(1);
  });

  it('respects non-equal weights', () => {
    const lint: LintResult = { passed: true, score: 95, violations: [] };
    const fitness = composeFitness(lint, ds, taste, { dsAdherence: 0.75, taste: 0.25 });
    expect(fitness.composite).toBe(82.5); // 0.75*80 + 0.25*90
  });

  it('drops a variant (composite 0) when the lint floor fails, preserving the violations', () => {
    const violations = [{ rule: 'x', severity: 20, detail: 'bad' }];
    const lint: LintResult = { passed: false, score: 40, violations };
    const fitness = composeFitness(lint, ds, taste, weights);
    expect(fitness.composite).toBe(0);
    expect(fitness.lintFloor.passed).toBe(false);
    expect(fitness.lintFloor.violations).toEqual(violations);
  });
});
