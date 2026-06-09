import { describe, expect, it } from 'vitest';
import type { JudgeCandidate } from './taste-judge';
import { DEFAULT_LENSES, runTasteTournament } from './taste-judge';
import {
  VisionPairwiseJudge,
  type VisionComplete,
  buildJudgePrompt,
  parseVerdict,
} from './vision-judge';

describe('buildJudgePrompt', () => {
  it('labels the images A/B, embeds the brief, and scopes to the lens rubric', () => {
    const { system, prompt } = buildJudgePrompt('A pricing page', 'typography');
    expect(system).toContain('design critic');
    expect(prompt).toContain('first image is option A; the second is option B');
    expect(prompt).toContain('A pricing page');
    expect(prompt).toContain('typography');
    expect(prompt).toContain('type craft'); // the typography rubric
    expect(prompt).toContain('"winner": "A" | "B"');
  });

  it('falls back to a generic rubric for an unknown lens and handles an empty brief', () => {
    const { prompt } = buildJudgePrompt('   ', 'mystery-lens');
    expect(prompt).toContain('(no brief supplied)');
    expect(prompt).toContain('overall design quality');
  });
});

describe('parseVerdict', () => {
  it('maps A/B back to the candidate ids', () => {
    expect(parseVerdict('{"winner":"A","rationale":"tighter type"}', 'g0-n0', 'g0-n1')).toEqual({
      winner: 'g0-n0',
      rationale: 'tighter type',
    });
    expect(
      parseVerdict('{"winner":"B","rationale":"better rhythm"}', 'g0-n0', 'g0-n1').winner,
    ).toBe('g0-n1');
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const text =
      'Here is my verdict:\n```json\n{"winner": "B", "rationale": "stronger"}\n```\nThanks.';
    expect(parseVerdict(text, 'a', 'b').winner).toBe('b');
  });

  it('defaults to A when the response is unparseable or invalid', () => {
    expect(parseVerdict('no json here', 'a', 'b').winner).toBe('a');
    expect(parseVerdict('{"winner":"C","rationale":"x"}', 'a', 'b').winner).toBe('a');
    expect(parseVerdict('{"winner":"A"}', 'a', 'b').winner).toBe('a'); // missing rationale → invalid
  });
});

describe('VisionPairwiseJudge', () => {
  const a: JudgeCandidate = { id: 'g0-n0', screenshotPath: '/shots/a.png' };
  const b: JudgeCandidate = { id: 'g0-n1', screenshotPath: '/shots/b.png' };

  it('passes the model, prompt, and both images to complete, then parses the verdict', async () => {
    let captured: Parameters<VisionComplete>[0] | undefined;
    const complete: VisionComplete = (req) => {
      captured = req;
      return Promise.resolve('{"winner":"B","rationale":"better hierarchy"}');
    };
    const judge = new VisionPairwiseJudge(complete);

    const verdict = await judge.compare(a, b, {
      brief: 'A hero',
      lens: 'typography',
      model: 'claude-opus-4-8',
    });

    expect(verdict).toEqual({ winner: 'g0-n1', rationale: 'better hierarchy' });
    expect(captured?.model).toBe('claude-opus-4-8');
    expect(captured?.imagePaths).toEqual(['/shots/a.png', '/shots/b.png']);
    expect(captured?.prompt).toContain('typography');
  });

  it('drives a full pairwise tournament deterministically', async () => {
    // A fake vision model that always prefers whichever option is the first image (A).
    const complete: VisionComplete = () => Promise.resolve('{"winner":"A","rationale":"r"}');
    const judge = new VisionPairwiseJudge(complete);
    const candidates: JudgeCandidate[] = [
      { id: 'g0-n0', screenshotPath: '/a.png' },
      { id: 'g0-n1', screenshotPath: '/b.png' },
    ];

    const result = await runTasteTournament(candidates, { brief: 'b', judge });

    // Each ordering makes the first-listed win once → both end up tied; ranks assigned, panels set.
    expect(Object.keys(result).sort()).toEqual(['g0-n0', 'g0-n1']);
    expect(result['g0-n0']?.panel).toHaveLength(DEFAULT_LENSES.length);
    expect(result['g0-n0']?.rank).toBeGreaterThanOrEqual(1);
  });
});
