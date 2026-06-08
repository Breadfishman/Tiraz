import { describe, expect, it } from 'vitest';
import type { Genome } from './genome';
import type { CommandResult, CommandRunner } from './agent';
import { ClaudeCodeAgent, composePrompt, spawnRunner } from './agent';

const base: Genome = {
  id: 'g0-n0',
  parents: [],
  primary: 'impeccable',
  overlay: 'none',
  dials: { variance: 7, motion: 3, density: 6 },
  commands: [],
  seed: 42,
  brief: 'A hero section for a coffee roaster.',
  createdAt: '2026-06-08T00:00:00.000Z',
};

describe('composePrompt', () => {
  it('includes brief, active skills, and dials; omits absent sections', () => {
    const prompt = composePrompt(base, ['frontend-design', 'impeccable']);
    expect(prompt).toContain('A hero section for a coffee roaster.');
    expect(prompt).toContain('- frontend-design');
    expect(prompt).toContain('- impeccable');
    expect(prompt).toContain('variance (distance from conventional): 7');
    expect(prompt).toContain('Variation seed: 42');
    expect(prompt).not.toContain('## Target');
    expect(prompt).not.toContain('## Recombination');
    expect(prompt).not.toContain('## Apply these commands');
  });

  it('includes target, commands, recombination (with axes), and sources when present', () => {
    const prompt = composePrompt(
      {
        ...base,
        target: 'component:src/Button.tsx',
        commands: ['/bolder', '/distill'],
        sources: ['react-bits', '21st-registry'],
        graft: {
          parents: ['g0-n0', 'g0-n1'],
          instructions: "Take A's typography and B's motion.",
          axes: ['typography', 'motion'],
        },
      },
      ['frontend-design'],
    );
    expect(prompt).toContain('Scope your work to: component:src/Button.tsx');
    expect(prompt).toContain('- /bolder');
    expect(prompt).toContain("Take A's typography and B's motion.");
    expect(prompt).toContain('Axes to graft: typography, motion');
    expect(prompt).toContain('You may draw from: react-bits, 21st-registry');
  });

  it('omits the axes line when a graft has no axes', () => {
    const prompt = composePrompt(
      { ...base, graft: { parents: ['a', 'b'], instructions: 'graft' } },
      ['frontend-design'],
    );
    expect(prompt).toContain('## Recombination');
    expect(prompt).not.toContain('Axes to graft:');
  });
});

const fakeRunner =
  (result: CommandResult): CommandRunner =>
  () =>
    Promise.resolve(result);

describe('ClaudeCodeAgent', () => {
  it('builds headless print-mode args', () => {
    const agent = new ClaudeCodeAgent({
      runner: fakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(agent.buildArgs({ cwd: '/x', prompt: 'hello', skills: [] })).toEqual(['-p', 'hello']);
  });

  it('reports success and returns stdout', async () => {
    const agent = new ClaudeCodeAgent({
      runner: fakeRunner({ exitCode: 0, stdout: 'done', stderr: '' }),
    });
    const result = await agent.run({ cwd: '/x', prompt: 'p', skills: [] });
    expect(result).toEqual({ ok: true, exitCode: 0, output: 'done' });
  });

  it('reports failure and falls back to stderr when stdout is empty', async () => {
    const agent = new ClaudeCodeAgent({
      runner: fakeRunner({ exitCode: 1, stdout: '', stderr: 'boom' }),
    });
    const result = await agent.run({ cwd: '/x', prompt: 'p', skills: [] });
    expect(result).toEqual({ ok: false, exitCode: 1, output: 'boom' });
  });
});

describe('spawnRunner', () => {
  it('runs a real process and captures stdout + exit code', async () => {
    const result = await spawnRunner('node', ['--version'], { cwd: process.cwd() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^v\d+\./);
  });

  it('rejects when the binary cannot be spawned', async () => {
    await expect(
      spawnRunner('tiraz-no-such-binary-xyz', [], { cwd: process.cwd() }),
    ).rejects.toThrow();
  });
});
