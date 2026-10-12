import { describe, expect, it } from 'vitest';
import type { Agent } from './agent';
import { composeDirectionsPrompt, parseDirections, planDirections } from './directions';

const plan = (n: number): string =>
  JSON.stringify({
    directions: Array.from({ length: n }, (_u, i) => ({
      ethos: ` Direction ${String(i)} `,
      excellence: `Excellent ${String(i)}`,
      variance: 12,
      motion: '3',
      density: 0.2,
    })),
  });

describe('composeDirectionsPrompt', () => {
  it('asks for N varied directions as strict JSON, with the brief and design system', () => {
    const prompt = composeDirectionsPrompt({
      brief: 'Company homepage',
      count: 4,
      mode: 'greenfield',
      target: 'route:/',
      designSystem: { tokens: { color: ['--brand'], spacing: [] }, components: ['Button'] },
    });
    expect(prompt).toContain('Propose 4 genuinely different design directions');
    expect(prompt).toContain('Brief: Company homepage');
    expect(prompt).toContain('Target: route:/');
    expect(prompt).toContain('- color: --brand');
    expect(prompt).not.toContain('- spacing:');
    expect(prompt).toContain('- components: Button');
    expect(prompt).toContain('greenfield');
    expect(prompt).toContain('"directions"');
  });

  it('keeps every direction inside the brand in integration mode', () => {
    const prompt = composeDirectionsPrompt({ brief: 'b', count: 3, mode: 'integration' });
    expect(prompt).toContain('REDESIGN of an existing product');
    expect(prompt).toContain('keep the brand');
    expect(prompt).not.toContain('Existing design system');
  });
});

describe('parseDirections', () => {
  it('parses, trims, clamps dials, and truncates to count', () => {
    const directions = parseDirections(`Sure:\n${plan(5)}`, 3);
    expect(directions).toHaveLength(3);
    expect(directions?.[0]).toEqual({
      ethos: 'Direction 0',
      excellence: 'Excellent 0',
      dials: { variance: 10, motion: 3, density: 1 },
    });
  });

  it('returns null for unusable replies (no JSON, bad shape, too few)', () => {
    expect(parseDirections('nope', 2)).toBeNull();
    expect(parseDirections('{"directions": [{"ethos": ""}]}', 1)).toBeNull();
    expect(parseDirections(plan(1), 2)).toBeNull();
    expect(parseDirections('{"directions": [}', 1)).toBeNull();
  });
});

describe('planDirections', () => {
  it('makes one read-only, low-turn call on the planner model and parses the reply', async () => {
    const calls: Parameters<Agent['run']>[0][] = [];
    const agent: Agent = {
      run: (opts) => {
        calls.push(opts);
        return Promise.resolve({ ok: true, exitCode: 0, output: plan(2) });
      },
    };
    const directions = await planDirections({
      agent,
      cwd: '/repo',
      brief: 'b',
      count: 2,
      mode: 'greenfield',
      model: 'claude-sonnet-5-5',
    });
    expect(directions).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      cwd: '/repo',
      readOnly: true,
      maxTurns: 2,
      model: 'claude-sonnet-5-5',
    });
  });

  it('returns null on agent failure or a thrown error (caller falls back to the catalog)', async () => {
    const failing: Agent = {
      run: () => Promise.resolve({ ok: false, exitCode: 1, output: plan(2) }),
    };
    const throwing: Agent = { run: () => Promise.reject(new Error('spawn ENOENT')) };
    const base = { cwd: '/repo', brief: 'b', count: 2, mode: 'greenfield' as const };
    expect(await planDirections({ ...base, agent: failing })).toBeNull();
    expect(await planDirections({ ...base, agent: throwing })).toBeNull();
  });
});
