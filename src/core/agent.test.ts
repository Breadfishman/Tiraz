import { describe, expect, it } from 'vitest';
import type { Genome } from './genome';
import type { CommandResult, CommandRunner } from './agent';
import {
  ClaudeCodeAgent,
  MagicAgent,
  composeCritiquePrompt,
  composePrompt,
  spawnRunner,
} from './agent';

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
    // The shared taste bar is always present (built against the same rubric the judge grades on).
    expect(prompt).toContain('## Taste bar — clear it (this is graded)');
    expect(prompt).toContain('Avoid these slop tells');
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
    // The blend directive lists each permitted source's signature effects (anti-slop).
    expect(prompt).toContain('Blend distinctively');
    expect(prompt).toContain('- react-bits: ');
    expect(prompt).toContain('aurora background');
  });

  it('adds a refine-not-restart directive when the variant has parents (bred/recombined)', () => {
    expect(composePrompt(base, ['frontend-design'])).not.toContain('## Refine');
    const child = composePrompt({ ...base, parents: ['g0-n0'] }, ['frontend-design']);
    expect(child).toContain('## Refine — do not restart');
    expect(child).toContain('g0-n0');
  });

  it('surfaces the repo design system so the agent builds within it (anti-slop)', () => {
    const withDs = composePrompt(base, ['frontend-design'], [], {
      tokens: { color: ['#18181b', '#f9fafb'], spacing: ['4px', '8px'] },
      components: ['Button', 'Card'],
    });
    expect(withDs).toContain('## Design system');
    expect(withDs).toContain('do not hardcode');
    expect(withDs).toContain('color: #18181b, #f9fafb');
    expect(withDs).toContain('components: Button, Card');
    // omitted when there is no design system / it is empty
    expect(composePrompt(base, ['frontend-design'])).not.toContain('## Design system');
    expect(
      composePrompt(base, ['frontend-design'], [], { tokens: {}, components: [] }),
    ).not.toContain('## Design system');
  });

  it('advertises capability libraries when provided, and omits the section when empty', () => {
    const withCaps = composePrompt(base, ['frontend-design'], ['GSAP', 'Motion', 'Three.js']);
    expect(withCaps).toContain('## Available capability libraries');
    expect(withCaps).toContain('GSAP, Motion, Three.js');
    expect(composePrompt(base, ['frontend-design'])).not.toContain('## Available capability');
  });

  it('injects a directed-breed directive as high-priority requested changes', () => {
    const withDirective = composePrompt(
      base,
      ['frontend-design'],
      [],
      undefined,
      'bigger headline',
    );
    expect(withDirective).toContain('## Requested changes — do these specifically');
    expect(withDirective).toContain('bigger headline');
    // omitted when absent or blank
    expect(composePrompt(base, ['frontend-design'])).not.toContain('## Requested changes');
    expect(composePrompt(base, ['frontend-design'], [], undefined, '   ')).not.toContain(
      '## Requested changes',
    );
  });

  it('emits the compose section for fetched components and keeps signatures for un-fetched sources', () => {
    const prompt = composePrompt(
      { ...base, sources: ['magic-ui', 'react-bits'] },
      ['frontend-design'],
      [],
      undefined,
      undefined,
      [{ source: 'magic-ui', item: 'marquee' }],
    );
    // magic-ui got a real component → compose, do not reimplement.
    expect(prompt).toContain('## Real components installed — compose, do not reimplement');
    expect(prompt).toContain('- magic-ui/marquee');
    // react-bits got nothing → keeps the signatures fallback; magic-ui is dropped from it.
    expect(prompt).toContain('## Blend distinctively');
    expect(prompt).toContain('- react-bits: ');
    expect(prompt).not.toContain('- magic-ui: ');
  });

  it('omits the signatures section entirely when every permitted source was fetched', () => {
    const prompt = composePrompt(
      { ...base, sources: ['magic-ui'] },
      ['frontend-design'],
      [],
      undefined,
      undefined,
      [{ source: 'magic-ui', item: 'marquee' }],
    );
    expect(prompt).toContain('## Real components installed');
    expect(prompt).not.toContain('## Blend distinctively');
  });

  it('falls back to the signatures section unchanged when no components are fetched', () => {
    const withFetched = composePrompt(
      { ...base, sources: ['magic-ui', 'react-bits'] },
      ['frontend-design'],
      [],
      undefined,
      undefined,
      [],
    );
    const withoutArg = composePrompt({ ...base, sources: ['magic-ui', 'react-bits'] }, [
      'frontend-design',
    ]);
    expect(withFetched).toBe(withoutArg);
    expect(withFetched).not.toContain('## Real components installed');
    expect(withFetched).toContain('## Blend distinctively');
    expect(withFetched).toContain('- magic-ui: ');
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

describe('composeCritiquePrompt', () => {
  it('instructs a focused self-review against the shared taste bar without rebuilding', () => {
    const prompt = composeCritiquePrompt(base);
    expect(prompt).toContain('# Tiraz self-critique pass');
    expect(prompt).toContain('ALREADY built this component');
    expect(prompt).toContain('do NOT restart from scratch');
    expect(prompt).toContain('A hero section for a coffee roaster.'); // the brief
    // The same shared rubric the judge grades on (taste-rubric.ts).
    expect(prompt).toContain('## Taste bar — clear it (this is graded)');
    expect(prompt).toContain('Avoid these slop tells');
    expect(prompt).toContain('2-3 WORST');
    expect(prompt).toContain('preserving the overall direction');
    expect(prompt).toContain('Variation seed: 42');
    // No screenshot path supplied → no screenshot section.
    expect(prompt).not.toContain('## Your rendered output');
  });

  it('mentions the rendered screenshot when a path is given (and omits it when blank)', () => {
    const withShot = composeCritiquePrompt(base, '/shots/g0-n0.png');
    expect(withShot).toContain('## Your rendered output');
    expect(withShot).toContain('/shots/g0-n0.png');
    expect(composeCritiquePrompt(base, '   ')).not.toContain('## Your rendered output');
  });
});

const fakeRunner =
  (result: CommandResult): CommandRunner =>
  () =>
    Promise.resolve(result);

describe('ClaudeCodeAgent', () => {
  it('builds headless print-mode args with an edit-applying permission mode', () => {
    const agent = new ClaudeCodeAgent({
      runner: fakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(agent.buildArgs({ cwd: '/x', prompt: 'hello', skills: [] })).toEqual([
      '-p',
      '--permission-mode',
      'acceptEdits',
      'hello',
    ]);
  });

  it('honours a custom permission mode', () => {
    const agent = new ClaudeCodeAgent({
      runner: fakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      permissionMode: 'bypassPermissions',
    });
    expect(agent.buildArgs({ cwd: '/x', prompt: 'p', skills: [] })).toContain('bypassPermissions');
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

describe('MagicAgent', () => {
  const env = { TWENTY_FIRST_API_KEY: 'sk-test' };

  it('builds the Magic CLI args', () => {
    const agent = new MagicAgent({
      runner: fakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      env,
    });
    expect(agent.buildArgs({ cwd: '/x', prompt: 'a card', skills: [] })).toEqual([
      '-y',
      '@21st-dev/magic@latest',
      '--prompt',
      'a card',
    ]);
  });

  it('fails fast with guidance when the API key is absent (and never spawns)', async () => {
    let called = false;
    const runner: CommandRunner = () => {
      called = true;
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    const agent = new MagicAgent({ runner, env: {} });
    const result = await agent.run({ cwd: '/x', prompt: 'p', skills: [] });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('TWENTY_FIRST_API_KEY');
    expect(called).toBe(false);
  });

  it('runs and reports success when the key is present', async () => {
    const agent = new MagicAgent({
      runner: fakeRunner({ exitCode: 0, stdout: 'generated', stderr: '' }),
      env,
    });
    const result = await agent.run({ cwd: '/x', prompt: 'p', skills: [] });
    expect(result).toEqual({ ok: true, exitCode: 0, output: 'generated' });
  });

  it('treats a blank key as absent', () => {
    expect(new MagicAgent({ env: { TWENTY_FIRST_API_KEY: '  ' } }).hasApiKey()).toBe(false);
    expect(new MagicAgent({ env }).hasApiKey()).toBe(true);
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
