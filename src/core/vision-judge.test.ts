import { describe, expect, it } from 'vitest';
import type { JudgeCandidate } from './taste-judge';
import { runTasteRanking } from './taste-judge';
import { UNIVERSAL_CRAFT_MARKERS, UNIVERSAL_SLOP_TELLS } from './taste-rubric';
import {
  VisionRankingJudge,
  type VisionComplete,
  buildRankPrompt,
  extractJsonObject,
  parseRanking,
} from './vision-judge';

describe('buildRankPrompt', () => {
  it('numbers the options, embeds the brief, and covers every dimension in one rubric', () => {
    const { system, prompt } = buildRankPrompt('A pricing page', [undefined, undefined, undefined]);
    expect(system).toContain('design critic');
    expect(prompt).toContain('3 UI screenshots');
    expect(prompt).toContain('options 1 to 3');
    expect(prompt).toContain('A pricing page');
    for (const dimension of ['Typography', 'Layout', 'Colour', 'Originality', 'Execution']) {
      expect(prompt).toContain(`- ${dimension}:`);
    }
    expect(prompt).toContain('"ranking"');
  });

  it('grades colour craft and anti-slop against the universal floor, not a preferred look', () => {
    const { prompt } = buildRankPrompt('A landing page', [undefined, undefined]);
    expect(prompt).toContain('Do NOT prefer restrained over saturated');
    expect(prompt).toContain('not which aesthetic you');
    expect(prompt).toContain('emoji used as iconography');
  });

  it('handles an empty brief', () => {
    expect(buildRankPrompt('   ', [undefined, undefined]).prompt).toContain('(no brief supplied)');
  });

  it('anchors the critic on any-aesthetic taste, drawn from the universal catalog (no drift)', () => {
    const { system } = buildRankPrompt('A landing page', [undefined, undefined]);
    expect(system).toContain('Calibration');
    expect(system).toContain('ANY aesthetic');
    expect(system).toContain(UNIVERSAL_SLOP_TELLS[0] ?? '');
    expect(system).toContain(UNIVERSAL_CRAFT_MARKERS[2] ?? '');
  });

  it('judges each option against its own stated direction when intents are supplied', () => {
    const { prompt } = buildRankPrompt('A hero', ['Radical Swiss minimalism', undefined, 'Y2K']);
    expect(prompt).toContain('Do NOT favour one aesthetic over another');
    expect(prompt).toContain("Option 1's direction: Radical Swiss minimalism");
    expect(prompt).not.toContain("Option 2's direction");
    expect(prompt).toContain("Option 3's direction: Y2K");
  });

  it('omits the intent block entirely when no option states a direction', () => {
    const { prompt } = buildRankPrompt('A hero', [undefined, '  ']);
    expect(prompt).not.toContain('commits to its OWN aesthetic direction');
  });
});

describe('extractJsonObject', () => {
  it('finds the first balanced object, ignoring braces inside strings', () => {
    expect(extractJsonObject('pre {"a": "x}y", "b": {"c": 1}} post')).toBe(
      '{"a": "x}y", "b": {"c": 1}}',
    );
    expect(extractJsonObject('{"a": "say \\"}\\""}')).toBe('{"a": "say \\"}\\""}');
    expect(extractJsonObject('no json')).toBeNull();
    expect(extractJsonObject('{"unterminated": 1')).toBeNull();
  });
});

describe('parseRanking', () => {
  const ids = ['g0-n0', 'g0-n1', 'g0-n2'];

  it('maps option numbers back to ids, best first, with critiques', () => {
    const text =
      'Here you go:\n```json\n{"ranking":[{"option":3,"critique":"bold"},{"option":"1","critique":"ok"},{"option":2}]}\n```';
    expect(parseRanking(text, ids)).toEqual({
      order: ['g0-n2', 'g0-n0', 'g0-n1'],
      critiques: { 'g0-n2': 'bold', 'g0-n0': 'ok' },
    });
  });

  it('ignores out-of-range and duplicate options', () => {
    const text = '{"ranking":[{"option":9},{"option":2},{"option":2},{"option":0}]}';
    expect(parseRanking(text, ids).order).toEqual(['g0-n1']);
  });

  it('keeps the input order with a note when nothing usable parses', () => {
    for (const text of ['no json', '{"ranking": []}', '{"ranking":[{"option":7}]}', '{bad json}']) {
      const verdict = parseRanking(text, ids);
      expect(verdict.order).toEqual(ids);
      expect(verdict.critiques['g0-n0']).toContain('Could not parse judge response');
    }
  });
});

describe('VisionRankingJudge', () => {
  it('sends every screenshot in order with the model + prompt, then parses the ranking', async () => {
    let captured: Parameters<VisionComplete>[0] | undefined;
    const complete: VisionComplete = (req) => {
      captured = req;
      return Promise.resolve('{"ranking":[{"option":2,"critique":"tighter"},{"option":1}]}');
    };
    const judge = new VisionRankingJudge(complete);
    const candidates: JudgeCandidate[] = [
      { id: 'g0-n0', screenshotPath: '/shots/a.png', intent: 'Swiss minimalism' },
      { id: 'g0-n1', screenshotPath: '/shots/b.png' },
    ];

    const verdict = await judge.rank(candidates, { brief: 'A hero', model: 'claude-sonnet-5-5' });

    expect(verdict.order).toEqual(['g0-n1', 'g0-n0']);
    expect(verdict.critiques['g0-n1']).toBe('tighter');
    expect(captured?.model).toBe('claude-sonnet-5-5');
    expect(captured?.imagePaths).toEqual(['/shots/a.png', '/shots/b.png']);
    expect(captured?.prompt).toContain("Option 1's direction: Swiss minimalism");
  });

  it('drives a full generation ranking in a single vision call', async () => {
    let calls = 0;
    const complete: VisionComplete = () => {
      calls += 1;
      return Promise.resolve('{"ranking":[{"option":3},{"option":1},{"option":2}]}');
    };
    const judge = new VisionRankingJudge(complete);
    const result = await runTasteRanking(
      [
        { id: 'a', screenshotPath: '/a.png' },
        { id: 'b', screenshotPath: '/b.png' },
        { id: 'c', screenshotPath: '/c.png' },
      ],
      { brief: 'b', judge },
    );
    expect(calls).toBe(1);
    expect(result.c?.rank).toBe(1);
    expect(result.b?.rank).toBe(3);
  });
});
