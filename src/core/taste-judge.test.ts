import { describe, expect, it } from 'vitest';
import type { JudgeCandidate, RankingJudge } from './taste-judge';
import { DEFAULT_JUDGE_MODEL, OVERALL_LENS, runTasteRanking } from './taste-judge';

const candidates = (...ids: string[]): JudgeCandidate[] =>
  ids.map((id) => ({ id, screenshotPath: `/shots/${id}.png` }));

/** A fake judge that returns a fixed order + critiques and records how often it was called. */
function fixedJudge(order: string[], critiques: Record<string, string> = {}) {
  const calls: { ids: string[]; model: string }[] = [];
  const judge: RankingJudge = {
    rank: (cands, ctx) => {
      calls.push({ ids: cands.map((c) => c.id), model: ctx.model });
      return Promise.resolve({ order, critiques });
    },
  };
  return { judge, calls };
}

describe('runTasteRanking', () => {
  it('ranks a whole generation with exactly ONE judge call', async () => {
    const { judge, calls } = fixedJudge(['c', 'a', 'b'], { c: 'best', a: 'mid', b: 'worst' });
    const result = await runTasteRanking(candidates('a', 'b', 'c'), { brief: 'hero', judge });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.ids).toEqual(['a', 'b', 'c']);
    expect(result.c).toMatchObject({ rank: 1, derivedScore: 100 });
    expect(result.a).toMatchObject({ rank: 2, derivedScore: 50 });
    expect(result.b).toMatchObject({ rank: 3, derivedScore: 0 });
    expect(result.c?.panel).toEqual([
      { lens: OVERALL_LENS, model: DEFAULT_JUDGE_MODEL, rationale: 'best' },
    ]);
  });

  it('passes the configured model through to the judge and the panel', async () => {
    const { judge, calls } = fixedJudge(['a', 'b']);
    const result = await runTasteRanking(candidates('a', 'b'), {
      brief: 'hero',
      judge,
      model: 'claude-haiku-5-5',
    });
    expect(calls[0]?.model).toBe('claude-haiku-5-5');
    expect(result.a?.panel[0]?.model).toBe('claude-haiku-5-5');
    expect(result.b?.panel[0]?.rationale).toBe('no critique returned');
  });

  it('drops unknown/duplicate ids and appends omitted candidates in input order', async () => {
    const { judge } = fixedJudge(['b', 'ghost', 'b']);
    const result = await runTasteRanking(candidates('a', 'b', 'c'), { brief: '', judge });
    expect(result.b?.rank).toBe(1);
    expect(result.a?.rank).toBe(2);
    expect(result.c?.rank).toBe(3);
    expect(Object.keys(result).sort()).toEqual(['a', 'b', 'c']);
  });

  it('handles a single candidate without calling the judge', async () => {
    const { judge, calls } = fixedJudge([]);
    const result = await runTasteRanking(candidates('solo'), { brief: '', judge });
    expect(calls).toHaveLength(0);
    expect(result.solo).toMatchObject({ rank: 1, derivedScore: 100 });
    expect(result.solo?.panel[0]?.rationale).toBe('only variant');
  });

  it('returns nothing for an empty generation', async () => {
    const { judge, calls } = fixedJudge([]);
    expect(await runTasteRanking([], { brief: '', judge })).toEqual({});
    expect(calls).toHaveLength(0);
  });
});
