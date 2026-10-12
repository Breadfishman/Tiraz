import { z } from 'zod';
import { spawnRunner } from './agent';
import type { CommandRunner } from './agent';
import { describeError } from './config';
import type { VariantNode, Violation } from './manifest';

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
  /** True when the detector could not run (offline, not installed) — treated as a pass. */
  skipped?: boolean;
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
  /** Files / directories the detector scans (typically the files a variant changed). */
  targets: string[];
  /** Minimum score to clear the floor (`config.lintThreshold`). */
  threshold: number;
  cwd?: string;
  runner?: CommandRunner;
  /** Binary to invoke; defaults to `npx` (runs `npx impeccable detect`, SPEC §9/§14). */
  binary?: string;
}

/**
 * Run impeccable's deterministic detector (no model calls) against source targets and map it to the
 * lint floor result. No targets → a clean pass. The detector exits 2 when it finds issues, so the
 * exit code is not treated as failure; only missing/invalid JSON is.
 */
export async function lint(opts: LintOptions): Promise<LintResult> {
  if (opts.targets.length === 0) {
    return { passed: true, score: 100, violations: [] };
  }
  const runner = opts.runner ?? spawnRunner;
  const binary = opts.binary ?? 'npx';
  const args = ['--yes', 'impeccable', 'detect', '--json', ...opts.targets];

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

/** Source extensions impeccable's detector understands. */
const LINTABLE = /\.(html?|css|scss|jsx|tsx|vue|svelte)$/i;

/**
 * The UI source files a variant added or modified since `baseCommit` (absolute paths). When the node
 * predates `baseCommit` tracking, falls back to the merge-base with `fallbackRef` (the repo's HEAD).
 */
export async function changedUiFiles(
  node: Pick<VariantNode, 'worktree' | 'baseCommit'>,
  runner: CommandRunner,
  fallbackRef?: string,
): Promise<string[]> {
  let base = node.baseCommit;
  if (base === undefined && fallbackRef !== undefined) {
    const mb = await runner('git', ['merge-base', 'HEAD', fallbackRef], { cwd: node.worktree });
    if (mb.exitCode === 0 && mb.stdout.trim() !== '') base = mb.stdout.trim();
  }
  if (base === undefined) return [];
  const diff = await runner('git', ['diff', '--name-only', '--diff-filter=AM', base, 'HEAD'], {
    cwd: node.worktree,
  });
  if (diff.exitCode !== 0) return [];
  return diff.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((file) => file !== '' && LINTABLE.test(file) && !file.startsWith('.claude/'))
    .map((file) => `${node.worktree}/${file}`);
}

export interface VariantLinterOptions {
  /** The target project root (its HEAD is the fallback diff base). */
  cwd: string;
  threshold: number;
  runner?: CommandRunner;
  /** Called with a message when the detector can't run and the floor is skipped for a node. */
  onSkip?: (nodeId: string, message: string) => void;
}

/**
 * Build the per-node lint function `runScore` consumes: scan only the files the variant changed.
 * Best-effort — if the detector is unavailable or errors, the node gets a skipped (passing) result
 * instead of aborting the whole score.
 */
export function createVariantLinter(
  opts: VariantLinterOptions,
): (node: VariantNode) => Promise<LintResult> {
  const runner = opts.runner ?? spawnRunner;
  let headRef: Promise<string | undefined> | undefined;
  const repoHead = (): Promise<string | undefined> => {
    headRef ??= runner('git', ['rev-parse', 'HEAD'], { cwd: opts.cwd }).then((r) =>
      r.exitCode === 0 && r.stdout.trim() !== '' ? r.stdout.trim() : undefined,
    );
    return headRef;
  };
  return async (node) => {
    try {
      const targets = await changedUiFiles(node, runner, await repoHead());
      return await lint({ targets, threshold: opts.threshold, cwd: opts.cwd, runner });
    } catch (err) {
      opts.onSkip?.(node.genome.id, describeError(err));
      return { passed: true, score: 100, violations: [], skipped: true };
    }
  };
}
