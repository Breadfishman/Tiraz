import { describe, expect, it } from 'vitest';
import type { JudgeCandidate } from './taste-judge';
import { DEFAULT_LENSES, runTasteTournament } from './taste-judge';
import { UNIVERSAL_CRAFT_MARKERS, UNIVERSAL_SLOP_TELLS } from './taste-rubric';
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

  it('grades the anti-slop lens against the universal floor (commitment, not a preferred look)', () => {
    const { prompt } = buildJudgePrompt('A landing page', 'generic-feel');
    expect(prompt).toContain('originality');
    expect(prompt).toContain('not which aesthetic you');
    expect(prompt).toContain('emoji used as iconography');
  });

  it('grades the dedicated palette lens on colour craft, not amount of colour', () => {
    const { prompt } = buildJudgePrompt('A landing page', 'palette');
    expect(prompt).toContain('palette');
    expect(prompt).toContain('restrained or bold');
    expect(prompt).toContain('Do NOT prefer restrained over saturated');
    expect(prompt).toContain('purple/blue gradient');
    expect(prompt).toContain('contrast');
  });

  it('anchors the critic on any-aesthetic taste, drawn from the universal catalog (no drift)', () => {
    const { system } = buildJudgePrompt('A landing page', 'typography');
    expect(system).toContain('Calibration');
    expect(system).toContain('ANY aesthetic');
    expect(system).toContain('SLOP');
    expect(system).toContain('CRAFT');
    // Drawn from the universal catalog, not duplicated strings.
    expect(system).toContain(UNIVERSAL_SLOP_TELLS[0] ?? '');
    expect(system).toContain(UNIVERSAL_CRAFT_MARKERS[2] ?? '');
  });

  it('judges each option against its own stated direction when intents are supplied', () => {
    const { prompt } = buildJudgePrompt('A hero', 'layout', {
      a: 'Radical Swiss minimalism',
      b: 'Y2K maximalism with control',
    });
    expect(prompt).toContain('Do NOT favour one aesthetic over another');
    expect(prompt).toContain("Option A's direction: Radical Swiss minimalism");
    expect(prompt).toContain("Option B's direction: Y2K maximalism with control");
  });

  it('omits the intent block entirely when neither option states a direction', () => {
    const { prompt } = buildJudgePrompt('A hero', 'layout');
    expect(prompt).not.toContain('commits to its OWN aesthetic direction');
    expect(prompt).not.toContain("Option A's direction");
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

  it('threads each candidate intent into the judge prompt', async () => {
    let captured: Parameters<VisionComplete>[0] | undefined;
    const complete: VisionComplete = (req) => {
      captured = req;
      return Promise.resolve('{"winner":"A","rationale":"r"}');
    };
    const judge = new VisionPairwiseJudge(complete);
    await judge.compare(
      { id: 'g0-n0', screenshotPath: '/a.png', intent: 'Radical Swiss minimalism' },
      { id: 'g0-n1', screenshotPath: '/b.png', intent: 'Cyberpunk HUD' },
      { brief: 'A hero', lens: 'layout', model: 'claude-opus-4-8' },
    );
    expect(captured?.prompt).toContain("Option A's direction: Radical Swiss minimalism");
    expect(captured?.prompt).toContain("Option B's direction: Cyberpunk HUD");
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
