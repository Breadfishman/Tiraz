import { z } from 'zod';
import { spawnRunner } from './agent';
import type { CommandRunner } from './agent';
import { describeError } from './config';
import type { Violation } from './manifest';

/**
 * A subset of an `impeccable detect --json` finding (the tool emits a flat array of these).
 * Parsed leniently — unknown keys are ignored so detector version drift doesn't break us.
 */
const FindingSchema = z.object({
  antipattern: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  severity: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  snippet: z.string().optional(),
});
const FindingsSchema = z.array(FindingSchema);

type Finding = z.infer<typeof FindingSchema>;

/** impeccable severity vocabulary → a numeric penalty weight. Unknown severities use the default. */
export const SEVERITY_WEIGHTS: Readonly<Record<string, number>> = {
  critical: 25,
  error: 20,
  high: 15,
  warning: 10,
  advisory: 5,
  info: 2,
  low: 2,
};
const DEFAULT_SEVERITY_WEIGHT = 10;

export class LintError extends Error {
  override readonly name = 'LintError';
}

export interface LintResult {
  /** Whether the variant clears the lint floor (`score >= threshold`). Gate, not ranker (SPEC §9). */
  passed: boolean;
  /** 0–100 lint score derived from weighted violations (human-facing only). */
  score: number;
  violations: Violation[];
}

export function severityWeight(severity: string | undefined): number {
  if (severity === undefined) {
    return DEFAULT_SEVERITY_WEIGHT;
  }
  return SEVERITY_WEIGHTS[severity.toLowerCase()] ?? DEFAULT_SEVERITY_WEIGHT;
}

function findingDetail(finding: Finding): string {
  if (finding.description !== undefined) {
    return finding.description;
  }
  if (finding.snippet !== undefined) {
    return finding.snippet;
  }
  const label = finding.name ?? finding.antipattern ?? 'finding';
  return finding.file === undefined
    ? label
    : `${label} (${finding.file}:${String(finding.line ?? 0)})`;
}

export function findingsToViolations(findings: Finding[]): Violation[] {
  return findings.map((finding) => ({
    rule: finding.antipattern ?? finding.name ?? 'unknown',
    severity: severityWeight(finding.severity),
    detail: findingDetail(finding),
  }));
}

/** Lint score: start at 100 and subtract each violation's weight, clamped to [0, 100]. */
export function scoreViolations(violations: Violation[]): number {
  const penalty = violations.reduce((sum, v) => sum + v.severity, 0);
  return Math.max(0, 100 - penalty);
}

/** Parse `impeccable detect --json` stdout into violations. Throws {@link LintError} on bad output. */
export function parseDetectOutput(stdout: string): Violation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch (err) {
    throw new LintError(`impeccable detect did not return valid JSON: ${describeError(err)}`);
  }
  const result = FindingsSchema.safeParse(parsed);
  if (!result.success) {
    throw new LintError('impeccable detect JSON did not match the expected findings shape');
  }
  return findingsToViolations(result.data);
}

export interface LintOptions {
  /** Path or URL the detector scans (a variant's renderUrl in URL mode). */
  target: string;
  /** Minimum score to clear the floor (`config.lintThreshold`). */
  threshold: number;
  /** Use the regex-only fast path (`--fast`). */
  fast?: boolean;
  cwd?: string;
  runner?: CommandRunner;
  /** Binary to invoke; defaults to `npx` (runs `npx impeccable detect`, SPEC §9/§14). */
  binary?: string;
}

/** Run impeccable's deterministic detector against a target and map it to the lint floor result. */
export async function lint(opts: LintOptions): Promise<LintResult> {
  const runner = opts.runner ?? spawnRunner;
  const binary = opts.binary ?? 'npx';
  const args = [
    'impeccable',
    'detect',
    ...(opts.fast === true ? ['--fast'] : []),
    '--json',
    opts.target,
  ];

  const result = await runner(binary, args, { cwd: opts.cwd ?? process.cwd() });
  if (result.stdout.trim() === '') {
    throw new LintError(
      `impeccable detect produced no output (exit ${String(result.exitCode)}): ${result.stderr}`,
    );
  }

  const violations = parseDetectOutput(result.stdout);
  const score = scoreViolations(violations);
  return { passed: score >= opts.threshold, score, violations };
}
