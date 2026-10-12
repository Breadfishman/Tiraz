import { describe, expect, it } from 'vitest';
import type { Genome } from './genome';
import type { CommandResult, CommandRunner } from './agent';
import {
  ClaudeCodeAgent,
  MagicAgent,
  composeCritiquePrompt,
  composePrompt,
  defaultAllowedTools,
  parseClaudeJson,
  shellQuote,
  shotCommand,
  spawnRunner,
  tellsCommand,
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
    expect(prompt).toContain('universal floor');
    expect(prompt).not.toContain('## Target');
    expect(prompt).not.toContain('## Recombination');
    expect(prompt).not.toContain('## Apply these commands');
    expect(prompt).not.toContain('## Aesthetic direction'); // no ethos on the base genome
  });

  it('injects the gen-0 aesthetic ethos as a commit-fully direction when present', () => {
    const withEthos = composePrompt(
      { ...base, ethos: 'Raw neo-brutalism — heavy type, hard edges.' },
      ['frontend-design'],
    );
    expect(withEthos).toContain('## Aesthetic direction — commit FULLY to this');
    expect(withEthos).toContain('Raw neo-brutalism — heavy type, hard edges.');
    expect(withEthos).toContain('Do NOT converge on a safe, centered, generic layout');
  });

  it('surfaces a per-direction excellence line alongside the ethos when present', () => {
    const prompt = composePrompt(
      {
        ...base,
        ethos: 'Y2K maximalism — loud and dense.',
        excellence: 'joyful excess with control',
      },
      ['frontend-design'],
    );
    expect(prompt).toContain(
      'What excellent looks like in THIS direction: joyful excess with control',
    );
    // No excellence → no such line.
    expect(composePrompt({ ...base, ethos: 'Y2K maximalism.' }, ['frontend-design'])).not.toContain(
      'What excellent looks like in THIS direction',
    );
  });

  it('tells a feral variant (no installed skills) to invent its own language', () => {
    const feral = composePrompt({ ...base, ethos: 'Alien and experimental.' }, []);
    expect(feral).toContain('## No prescriptive design skill — invent your own');
    expect(feral).not.toContain('## Active design skills');
    // Dials still follow the skills block.
    expect(feral).toContain('## Design parameters (dials, 1–10)');
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

describe('composePrompt — headless, brand, multi-page, and self-check sections', () => {
  it('always tells the agent it is headless (no questions, skip missing setup scripts)', () => {
    const prompt = composePrompt(base, []);
    expect(prompt).toContain('You are running headless');
    expect(prompt).toContain('runs a script that is not present');
  });

  it('adds the keep-the-brand section only in integration mode', () => {
    expect(
      composePrompt(base, [], [], undefined, undefined, undefined, { mode: 'integration' }),
    ).toContain('## Keep the brand');
    expect(
      composePrompt(base, [], [], undefined, undefined, undefined, { mode: 'greenfield' }),
    ).not.toContain('## Keep the brand');
  });

  it('frames a multi-page variant as extending the established design', () => {
    const prompt = composePrompt({ ...base, extends: 'g1-n2' }, []);
    expect(prompt).toContain('## Extend the established design');
    expect(prompt).toContain('from g1-n2');
    expect(composePrompt(base, [])).not.toContain('## Extend the established design');
  });

  it('always asks for a build check, and adds the screenshot loop when a shot command is given', () => {
    const plain = composePrompt(base, []);
    expect(plain).toContain('## Check your work before finishing');
    expect(plain).not.toContain('Render and screenshot your target');
    const withShot = composePrompt(base, [], [], undefined, undefined, undefined, {
      check: { command: 'node cli.js shot --out /s/x.png', screenshotPath: '/s/x.png' },
    });
    expect(withShot).toContain('`node cli.js shot --out /s/x.png`');
    expect(withShot).toContain('full-page PNG to /s/x.png');
  });
});

describe('composePrompt — brand uniqueness sections', () => {
  const extras = (e: Parameters<typeof composePrompt>[6]) =>
    composePrompt(base, [], [], undefined, undefined, undefined, e);

  it('injects brand, references, and taste when provided', () => {
    const prompt = extras({
      brand: ['## The brand (BRAND.md)', 'Only true of us: x', ''],
      taste: ["## The owner's taste so far", '- liked g0-n1', ''],
      references: ['/repo/.tiraz/refs/love-1.png'],
    });
    expect(prompt).toContain('## The brand (BRAND.md)');
    expect(prompt).toContain('## Reference sites the owner loves');
    expect(prompt).toContain('- /repo/.tiraz/refs/love-1.png');
    expect(prompt).toContain("## The owner's taste so far");
    expect(composePrompt(base, [])).not.toContain('## Reference sites');
  });

  it('builds around a planned signature, or asks the agent to decide one first', () => {
    expect(composePrompt({ ...base, signature: 'a hand-drawn roast curve' }, [])).toContain(
      '## Signature element — build the design around it\na hand-drawn roast curve',
    );
    expect(composePrompt(base, [])).toContain('## Signature element — decide it first');
  });

  it('always warns about the second-order AI look', () => {
    expect(composePrompt(base, [])).toContain('## The second-order AI look — avoid it');
    expect(composeCritiquePrompt(base)).toContain('## The second-order AI look — avoid it');
  });

  it('applies a philosophy backbone with its lazy failure mode; ignores unknown ids', () => {
    const prompt = composePrompt({ ...base, philosophy: 'swiss' }, []);
    expect(prompt).toMatch(/## Design backbone: .*Swiss/i);
    expect(prompt).toContain('The lazy version to avoid:');
    expect(composePrompt({ ...base, philosophy: 'nope' }, [])).not.toContain('## Design backbone');
  });

  it('chooses typography: brand fonts > direction type > integration keep > curated library', () => {
    expect(extras({ brandFonts: ['GT Alpina'] })).toContain('Use the brand typefaces: GT Alpina');
    expect(composePrompt({ ...base, typography: 'Söhne + Tiempos' }, [])).toContain(
      'Use: Söhne + Tiempos.',
    );
    expect(extras({ mode: 'integration' })).toContain("Keep the site's existing brand typefaces");
    const library = composePrompt(base, []);
    expect(library).toContain('## Typography — choose deliberately');
    expect(library).toContain('Avoid: ');
  });

  it('adds the tells scan to the self-check when given', () => {
    const prompt = extras({
      check: {
        command: 'shot',
        screenshotPath: '/s.png',
        tellsCommand: 'node cli tells --worktree /wt',
      },
    });
    expect(prompt).toContain('`node cli tells --worktree /wt`');
  });
});

describe('composeCritiquePrompt', () => {
  it('instructs a focused self-review against the shared taste bar without rebuilding', () => {
    const prompt = composeCritiquePrompt(base);
    expect(prompt).toContain('# Tiraz self-critique pass');
    expect(prompt).toContain('ALREADY built this');
    expect(prompt).toContain('do NOT restart from scratch');
    expect(prompt).toContain('A hero section for a coffee roaster.'); // the brief
    // The same shared rubric the judge grades on (taste-rubric.ts).
    expect(prompt).toContain('## Taste bar — clear it (this is graded)');
    expect(prompt).toContain('universal floor');
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
      '--output-format',
      'json',
      '--permission-mode',
      'acceptEdits',
      'hello',
    ]);
  });

  it('adds model, turn cap, permissions (as one --settings JSON) and resume, prompt last', () => {
    const agent = new ClaudeCodeAgent({
      runner: fakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      model: 'claude-opus-5-5',
      maxTurns: 40,
      allowedTools: ['Bash(npm run build:*)'],
    });
    const args = agent.buildArgs({
      cwd: '/x',
      prompt: 'build it',
      skills: [],
      additionalDirectories: ['/repo/.tiraz/screenshots'],
      resumeSessionId: 'sess-1',
    });
    expect(args).toEqual([
      '-p',
      '--output-format',
      'json',
      '--permission-mode',
      'acceptEdits',
      '--model',
      'claude-opus-5-5',
      '--max-turns',
      '40',
      '--settings',
      JSON.stringify({
        permissions: {
          allow: ['Bash(npm run build:*)'],
          additionalDirectories: ['/repo/.tiraz/screenshots'],
        },
      }),
      '--resume',
      'sess-1',
      'build it',
    ]);
  });

  it('lets a run override model + turns and go read-only (deny edits/shell, no allow-list)', () => {
    const agent = new ClaudeCodeAgent({
      runner: fakeRunner({ exitCode: 0, stdout: '', stderr: '' }),
      model: 'claude-opus-5-5',
      maxTurns: 40,
      allowedTools: ['Bash(npm run build:*)'],
    });
    const args = agent.buildArgs({
      cwd: '/x',
      prompt: 'plan',
      skills: [],
      model: 'claude-sonnet-5-5',
      maxTurns: 2,
      readOnly: true,
    });
    expect(args).toContain('claude-sonnet-5-5');
    expect(args).not.toContain('claude-opus-5-5');
    expect(args[args.indexOf('--max-turns') + 1]).toBe('2');
    const settings = JSON.parse(args[args.indexOf('--settings') + 1] ?? '{}') as {
      permissions: { allow?: string[]; deny?: string[] };
    };
    expect(settings.permissions.allow).toBeUndefined();
    expect(settings.permissions.deny).toEqual(expect.arrayContaining(['Edit', 'Write', 'Bash']));
  });

  it('parses JSON output: result text, session id, and cost', async () => {
    const agent = new ClaudeCodeAgent({
      runner: fakeRunner({
        exitCode: 0,
        stdout: JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'all done',
          session_id: 'sess-9',
          total_cost_usd: 0.42,
        }),
        stderr: '',
      }),
    });
    expect(await agent.run({ cwd: '/x', prompt: 'p', skills: [] })).toEqual({
      ok: true,
      exitCode: 0,
      output: 'all done',
      sessionId: 'sess-9',
      costUsd: 0.42,
    });
  });

  it('treats a max-turns stop as usable work, and is_error as failure', async () => {
    const capped = new ClaudeCodeAgent({
      runner: fakeRunner({
        exitCode: 1,
        stdout: JSON.stringify({ subtype: 'error_max_turns', is_error: true, session_id: 's' }),
        stderr: '',
      }),
    });
    const cappedResult = await capped.run({ cwd: '/x', prompt: 'p', skills: [] });
    expect(cappedResult.ok).toBe(true);
    expect(cappedResult.output).toContain('max-turns');

    const errored = new ClaudeCodeAgent({
      runner: fakeRunner({
        exitCode: 0,
        stdout: JSON.stringify({ subtype: 'error_during_execution', is_error: true }),
        stderr: 'api down',
      }),
    });
    expect(await errored.run({ cwd: '/x', prompt: 'p', skills: [] })).toEqual({
      ok: false,
      exitCode: 0,
      output: 'api down',
    });
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

describe('parseClaudeJson', () => {
  it('returns null for non-object output', () => {
    expect(parseClaudeJson('plain text')).toBeNull();
    expect(parseClaudeJson('[1,2]')).toBeNull();
    expect(parseClaudeJson('null')).toBeNull();
  });

  it('keeps only well-typed fields', () => {
    expect(parseClaudeJson('{"result": 3, "session_id": "s", "is_error": "no"}')).toEqual({
      sessionId: 's',
    });
  });
});

describe('shell helpers', () => {
  it('quotes only when needed', () => {
    expect(shellQuote('/a/b-c_d.png')).toBe('/a/b-c_d.png');
    expect(shellQuote('')).toBe("''");
    expect(shellQuote("it's here")).toBe(`'it'\\''s here'`);
  });

  it('builds a tiraz shot command whose prefix matches the default allow-rule', () => {
    const cmd = shotCommand('/pkg/dist/cli.js', {
      worktree: '/repo/.tiraz/worktrees/g0-n0',
      harness: 'storybook',
      target: 'story:hero--default',
      port: 41000,
      out: '/repo/.tiraz/screenshots/g0-n0-check.png',
    });
    expect(cmd).toBe(
      'node /pkg/dist/cli.js shot --worktree /repo/.tiraz/worktrees/g0-n0 --harness storybook ' +
        '--target story:hero--default --port 41000 --out /repo/.tiraz/screenshots/g0-n0-check.png',
    );
    expect(defaultAllowedTools('/pkg/dist/cli.js')).toContain('Bash(node /pkg/dist/cli.js shot:*)');
    expect(defaultAllowedTools().some((rule) => rule.includes('shot'))).toBe(false);
    expect(defaultAllowedTools('/pkg/dist/cli.js')).toContain(
      'Bash(node /pkg/dist/cli.js tells:*)',
    );
    expect(tellsCommand('/pkg/dist/cli.js', { worktree: '/wt', base: 'abc' })).toBe(
      'node /pkg/dist/cli.js tells --worktree /wt --base abc',
    );
    expect(tellsCommand('/pkg/dist/cli.js', { worktree: '/wt' })).toBe(
      'node /pkg/dist/cli.js tells --worktree /wt',
    );
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
