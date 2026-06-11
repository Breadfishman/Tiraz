import { describe, expect, it } from 'vitest';
import type { JudgeCandidate, PairwiseJudge } from './taste-judge';
import { runTasteTournament } from './taste-judge';

const single = [{ lens: 'overall', model: 'claude-opus-4-8' }];

/** A deterministic judge: the candidate with the higher score (from `scores`) wins. */
function scoreJudge(scores: Record<string, number>): PairwiseJudge {
  return {
    compare: (a, b) =>
      Promise.resolve({
        winner: (scores[a.id] ?? 0) >= (scores[b.id] ?? 0) ? a.id : b.id,
        rationale: `${a.id} vs ${b.id}`,
      }),
  };
}

function candidates(...ids: string[]): JudgeCandidate[] {
  return ids.map((id) => ({ id, screenshotPath: `/s/${id}.png` }));
}

describe('runTasteTournament', () => {
  it('ranks the consistently-preferred variant first', async () => {
    const result = await runTasteTournament(candidates('a', 'b'), {
      brief: 'hero',
      judge: scoreJudge({ a: 10, b: 1 }),
      lenses: single,
    });
    expect(result.a?.rank).toBe(1);
    expect(result.b?.rank).toBe(2);
    // 'a' wins both orders for the one lens → 100; 'b' wins none → 0.
    expect(result.a?.derivedScore).toBe(100);
    expect(result.b?.derivedScore).toBe(0);
  });

  it('produces a total order across three variants', async () => {
    const result = await runTasteTournament(candidates('a', 'b', 'c'), {
      brief: 'hero',
      judge: scoreJudge({ a: 30, b: 20, c: 10 }),
      lenses: single,
    });
    expect(result.a?.rank).toBe(1);
    expect(result.b?.rank).toBe(2);
    expect(result.c?.rank).toBe(3);
  });

  it('attaches a panel entry per lens (default text where a candidate never won)', async () => {
    const result = await runTasteTournament(candidates('a', 'b'), {
      brief: 'hero',
      judge: scoreJudge({ a: 10, b: 1 }),
      // default 4-lens mixed-model panel
    });
    expect(result.a?.panel.map((p) => p.lens)).toEqual([
      'typography',
      'layout',
      'palette',
      'generic-feel',
    ]);
    expect(result.a?.panel[3]?.model).toBe('claude-sonnet-4-6');
    expect(result.b?.panel.every((p) => p.rationale === 'no winning verdict for this lens')).toBe(
      true,
    );
  });

  it('handles a single candidate without any comparisons', async () => {
    const result = await runTasteTournament(candidates('solo'), {
      brief: 'hero',
      judge: scoreJudge({}),
      lenses: single,
    });
    expect(result.solo).toMatchObject({ rank: 1, derivedScore: 100 });
  });

  it('ignores a verdict whose winner is not in the pair (falls back to the first)', async () => {
    const bogusJudge: PairwiseJudge = {
      compare: () => Promise.resolve({ winner: 'not-a-candidate', rationale: 'bogus' }),
    };
    const result = await runTasteTournament(candidates('a', 'b'), {
      brief: 'hero',
      judge: bogusJudge,
      lenses: single,
    });
    // Every verdict falls back to the first-presented candidate; both orders run, so it stays a
    // valid ranking covering both ids.
    expect(Object.keys(result).sort()).toEqual(['a', 'b']);
  });
});
