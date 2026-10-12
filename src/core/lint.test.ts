import { describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from './agent';
import type { VariantNode } from './manifest';
import {
  LintError,
  changedUiFiles,
  createVariantLinter,
  findingsToViolations,
  lint,
  parseDetectOutput,
  scoreViolations,
  severityWeight,
} from './lint';

const findings = [
  {
    antipattern: 'purple-gradient',
    description: 'cliché gradient',
    severity: 'warning',
    file: 'a.css',
    line: 3,
  },
  { antipattern: 'generic-font', name: 'Generic font', severity: 'advisory' },
];

const fixedRunner =
  (result: CommandResult): CommandRunner =>
  () =>
    Promise.resolve(result);

function capturingRunner(result: CommandResult): {
  runner: CommandRunner;
  calls: { command: string; args: string[] }[];
} {
  const calls: { command: string; args: string[] }[] = [];
  const runner: CommandRunner = (command, args) => {
    calls.push({ command, args });
    return Promise.resolve(result);
  };
  return { runner, calls };
}

describe('severityWeight', () => {
  it('maps known severities (case-insensitive)', () => {
    expect(severityWeight('warning')).toBe(10);
    expect(severityWeight('CRITICAL')).toBe(25);
    expect(severityWeight('advisory')).toBe(5);
  });

  it('uses the default for unknown or missing severities', () => {
    expect(severityWeight('weird')).toBe(10);
    expect(severityWeight(undefined)).toBe(10);
  });
});

describe('findingsToViolations', () => {
  it('maps findings, preferring antipattern → name for the rule and falling back for detail', () => {
    expect(findingsToViolations(findings)).toEqual([
      { rule: 'purple-gradient', severity: 10, detail: 'cliché gradient' },
      { rule: 'generic-font', severity: 5, detail: 'Generic font' },
    ]);
  });

  it('uses the snippet when there is no description', () => {
    expect(findingsToViolations([{ antipattern: 'y', snippet: '<div style=...>' }])).toEqual([
      { rule: 'y', severity: 10, detail: '<div style=...>' },
    ]);
  });

  it('falls back to a file-located label when no description/snippet exists', () => {
    expect(findingsToViolations([{ name: 'X', file: 'b.tsx', line: 9 }])).toEqual([
      { rule: 'X', severity: 10, detail: 'X (b.tsx:9)' },
    ]);
  });
});

describe('scoreViolations', () => {
  it('is 100 with no violations', () => {
    expect(scoreViolations([])).toBe(100);
  });

  it('subtracts weighted penalties', () => {
    expect(scoreViolations([{ rule: 'a', severity: 10, detail: '' }])).toBe(90);
  });

  it('clamps to 0', () => {
    const many = Array.from({ length: 12 }, () => ({ rule: 'a', severity: 10, detail: '' }));
    expect(scoreViolations(many)).toBe(0);
  });
});

describe('parseDetectOutput', () => {
  it('parses a findings array', () => {
    expect(parseDetectOutput(JSON.stringify(findings))).toHaveLength(2);
  });

  it('parses an empty result', () => {
    expect(parseDetectOutput('[]')).toEqual([]);
  });

  it('throws LintError on invalid JSON', () => {
    expect(() => parseDetectOutput('{ not json')).toThrow(LintError);
  });

  it('throws LintError when the shape is wrong', () => {
    expect(() => parseDetectOutput('{"not":"an array"}')).toThrow(LintError);
  });
});

describe('lint', () => {
  it('passes when the score clears the threshold', async () => {
    const result = await lint({
      targets: ['/wt/src/Hero.tsx'],
      threshold: 80,
      runner: fixedRunner({ exitCode: 0, stdout: '[]', stderr: '' }),
    });
    expect(result).toEqual({ passed: true, score: 100, violations: [] });
  });

  it('fails when violations drag the score below the threshold (exit 2 = findings, not failure)', async () => {
    const heavy = JSON.stringify(
      Array.from({ length: 3 }, () => ({ antipattern: 'x', severity: 'critical' })),
    );
    const result = await lint({
      targets: ['src/'],
      threshold: 80,
      runner: fixedRunner({ exitCode: 2, stdout: heavy, stderr: '' }),
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(25);
    expect(result.violations).toHaveLength(3);
  });

  it('invokes `npx --yes impeccable detect --json <targets…>` (no deprecated --fast)', async () => {
    const { runner, calls } = capturingRunner({ exitCode: 0, stdout: '[]', stderr: '' });
    await lint({ targets: ['a.tsx', 'b.css'], threshold: 80, runner });
    expect(calls[0]).toEqual({
      command: 'npx',
      args: ['--yes', 'impeccable', 'detect', '--json', 'a.tsx', 'b.css'],
    });
  });

  it('is a clean pass with no targets, without running the detector', async () => {
    const { runner, calls } = capturingRunner({ exitCode: 0, stdout: '[]', stderr: '' });
    expect(await lint({ targets: [], threshold: 80, runner })).toEqual({
      passed: true,
      score: 100,
      violations: [],
    });
    expect(calls).toHaveLength(0);
  });

  it('throws LintError when the detector produces no output', async () => {
    await expect(
      lint({
        targets: ['src/'],
        threshold: 80,
        runner: fixedRunner({ exitCode: 127, stdout: '', stderr: 'command not found' }),
      }),
    ).rejects.toBeInstanceOf(LintError);
  });
});

/** A runner that answers git/npx calls from a small script, recording each call. */
function scriptedRunner(responses: Record<string, CommandResult>) {
  const calls: { command: string; args: string[]; cwd: string }[] = [];
  const runner: CommandRunner = (command, args, opts) => {
    calls.push({ command, args, cwd: opts.cwd });
    const key = `${command} ${args[0] ?? ''}`;
    return Promise.resolve(responses[key] ?? { exitCode: 1, stdout: '', stderr: 'unexpected' });
  };
  return { runner, calls };
}

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' });

function variant(baseCommit?: string): VariantNode {
  return {
    genome: {
      id: 'g0-n0',
      parents: [],
      primary: 'impeccable',
      overlay: 'none',
      dials: { variance: 5, motion: 5, density: 5 },
      commands: [],
      seed: 0,
      brief: 'hero',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    generation: 0,
    branch: 'tiraz/g0-n0',
    worktree: '/wt',
    ...(baseCommit !== undefined ? { baseCommit } : {}),
    fitness: null,
    status: 'generated',
  };
}

describe('changedUiFiles', () => {
  it('diffs against baseCommit and keeps only lintable UI sources outside .claude/', async () => {
    const { runner, calls } = scriptedRunner({
      'git diff': ok(
        'src/Hero.tsx\nsrc/util.ts\nstyles/site.css\n.claude/skills/x/a.html\nREADME.md\n',
      ),
    });
    expect(await changedUiFiles(variant('abc'), runner)).toEqual([
      '/wt/src/Hero.tsx',
      '/wt/styles/site.css',
    ]);
    expect(calls[0]).toEqual({
      command: 'git',
      args: ['diff', '--name-only', '--diff-filter=AM', 'abc', 'HEAD'],
      cwd: '/wt',
    });
  });

  it('falls back to the merge-base with the repo HEAD for older nodes', async () => {
    const { runner, calls } = scriptedRunner({
      'git merge-base': ok('mb123\n'),
      'git diff': ok('src/Page.astro\nsrc/Page.vue\n'),
    });
    expect(await changedUiFiles(variant(), runner, 'head1')).toEqual(['/wt/src/Page.vue']);
    expect(calls[1]?.args).toContain('mb123');
  });

  it('returns nothing when no base can be determined or the diff fails', async () => {
    const { runner } = scriptedRunner({});
    expect(await changedUiFiles(variant(), runner)).toEqual([]);
    expect(await changedUiFiles(variant(), runner, 'head1')).toEqual([]);
    expect(await changedUiFiles(variant('abc'), runner)).toEqual([]);
  });
});

describe('createVariantLinter', () => {
  it('lints only the changed files of each node', async () => {
    const { runner, calls } = scriptedRunner({
      'git rev-parse': ok('head1\n'),
      'git diff': ok('src/Hero.tsx\n'),
      'npx --yes': ok(JSON.stringify([{ antipattern: 'side-tab', severity: 'warning' }])),
    });
    const lintNode = createVariantLinter({ cwd: '/repo', threshold: 80, runner });
    const result = await lintNode(variant('abc'));
    expect(result).toMatchObject({ passed: true, score: 90 });
    expect(calls.at(-1)?.args).toEqual([
      '--yes',
      'impeccable',
      'detect',
      '--json',
      '/wt/src/Hero.tsx',
    ]);
  });

  it('skips (passes) a node when the detector cannot run, reporting why', async () => {
    const { runner } = scriptedRunner({
      'git rev-parse': ok('head1\n'),
      'git diff': ok('src/Hero.tsx\n'),
      'npx --yes': { exitCode: 1, stdout: '', stderr: 'offline' },
    });
    const skipped: string[] = [];
    const lintNode = createVariantLinter({
      cwd: '/repo',
      threshold: 80,
      runner,
      onSkip: (id, message) => skipped.push(`${id}: ${message}`),
    });
    expect(await lintNode(variant('abc'))).toEqual({
      passed: true,
      score: 100,
      violations: [],
      skipped: true,
    });
    expect(skipped[0]).toContain('g0-n0');
  });
});
