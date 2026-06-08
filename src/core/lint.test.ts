import { describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from './agent';
import {
  LintError,
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
      target: 'http://localhost:41000/',
      threshold: 80,
      runner: fixedRunner({ exitCode: 0, stdout: '[]', stderr: '' }),
    });
    expect(result).toEqual({ passed: true, score: 100, violations: [] });
  });

  it('fails when violations drag the score below the threshold', async () => {
    const heavy = JSON.stringify(
      Array.from({ length: 3 }, () => ({ antipattern: 'x', severity: 'critical' })),
    );
    const result = await lint({
      target: 'src/',
      threshold: 80,
      runner: fixedRunner({ exitCode: 1, stdout: heavy, stderr: '' }),
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(25);
    expect(result.violations).toHaveLength(3);
  });

  it('invokes `npx impeccable detect --fast --json <target>`', async () => {
    const { runner, calls } = capturingRunner({ exitCode: 0, stdout: '[]', stderr: '' });
    await lint({ target: 'src/', threshold: 80, fast: true, runner });
    expect(calls[0]).toEqual({
      command: 'npx',
      args: ['impeccable', 'detect', '--fast', '--json', 'src/'],
    });
  });

  it('throws LintError when the detector produces no output', async () => {
    await expect(
      lint({
        target: 'src/',
        threshold: 80,
        runner: fixedRunner({ exitCode: 127, stdout: '', stderr: 'command not found' }),
      }),
    ).rejects.toBeInstanceOf(LintError);
  });
});
