/**
 * Best-effort filesystem/process glue for genuine component fetching (SPEC §12, Phase 1 — see
 * `docs/plans/component-fetch.md`). Coverage-excluded like the other `*-io.ts` modules: it spawns
 * the real shadcn registry CLI and touches the worktree, so all the testable decisions live in the
 * pure `component-fetch.ts`.
 *
 * The HARD RULE (the feature defaults ON, so it must degrade gracefully): this NEVER throws and NEVER
 * blocks a variant. With no plan, no `components.json`, an offline environment, or a failing install,
 * the affected source silently falls back to signatures (today's behavior) and we return whatever
 * provenance we managed to collect.
 */

import { spawn } from 'node:child_process';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CommandResult, CommandRunner } from './agent';
import type { FetchProvenance, FetchRef } from './component-fetch';
import { buildFetchCommand, parseShadcnInstalledFiles } from './component-fetch';

/** Hard cap on a single `shadcn add` (network-stall backstop; normal installs finish in seconds). */
const INSTALL_TIMEOUT_MS = 120_000;

/**
 * A {@link CommandRunner} for the shadcn installs — the shared `spawnRunner` can't safely run these.
 * `npx shadcn add` fires interactive prompts that `--yes` does NOT cover (framework selection when
 * undetected; the React-19 peer-dependency strategy prompt when a component needs an npm install). On
 * an inherited/open stdin those block forever and freeze the whole variant (observed live). This runner:
 *
 * 1. **closes stdin** (`stdio[0] = 'ignore'`) so any such prompt gets EOF instead of hanging — the
 *    concrete mechanism behind the never-block-a-variant rule;
 * 2. forces **`npm_config_legacy_peer_deps`** so the peer-dep prompt never triggers in the first place
 *    (the install then *succeeds* rather than being skipped);
 * 3. **hard-kills after `timeoutMs`** as a network-stall backstop, resolving non-zero so the caller
 *    skips that install and falls back to signatures.
 */
function shadcnRunner(timeoutMs: number): CommandRunner {
  return (command, args, opts) =>
    new Promise<CommandResult>((resolve) => {
      const child = spawn(command, args, {
        cwd: opts.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, npm_config_legacy_peer_deps: 'true' },
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result: CommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish({
          exitCode: 124,
          stdout,
          stderr: `${stderr}\n[tiraz] shadcn add timed out after ${String(timeoutMs)}ms`,
        });
      }, timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', () => {
        finish({ exitCode: 1, stdout, stderr });
      });
      child.on('close', (code) => {
        finish({ exitCode: code ?? 0, stdout, stderr });
      });
    });
}

/** Whether a path exists (used to gate on the worktree having a `components.json`). */
async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Read an existing provenance file as an array, or `[]` if absent/unreadable/malformed. */
async function readProvenance(file: string): Promise<FetchProvenance[]> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as FetchProvenance[]) : [];
  } catch {
    return [];
  }
}

/**
 * Install the planned components into `worktreeDir`, best-effort. Returns the provenance for the
 * components that actually landed (exit 0). Per the hard rule:
 *
 * - empty `plan` OR no `<worktreeDir>/components.json` → `[]` (signatures fallback);
 * - each ref runs `npx shadcn add <url> --yes` via `runner`; exit 0 records provenance, a non-zero
 *   exit or a thrown error skips that ref and continues;
 * - the collected provenance is written (merged with any existing) to `<worktreeDir>/.tiraz/provenance.json`;
 * - any unexpected error returns whatever was collected so far.
 *
 * Exit code is the success signal — we do NOT diff which files shadcn wrote (brittle).
 */
export async function fetchComponents(
  worktreeDir: string,
  plan: readonly FetchRef[],
  deps: { runner?: CommandRunner; timeoutMs?: number },
): Promise<FetchProvenance[]> {
  const collected: FetchProvenance[] = [];
  try {
    if (plan.length === 0) return collected;
    if (!(await exists(path.join(worktreeDir, 'components.json')))) return collected;

    const runner = deps.runner ?? shadcnRunner(deps.timeoutMs ?? INSTALL_TIMEOUT_MS);
    for (const ref of plan) {
      try {
        const { command, args } = buildFetchCommand(ref);
        const result = await runner(command, args, { cwd: worktreeDir });
        if (result.exitCode === 0) {
          // Record the files shadcn wrote (Phase 1.5) so DS-adherence can exclude this library code.
          const files = parseShadcnInstalledFiles(result.stdout);
          collected.push({
            source: ref.source,
            item: ref.item,
            url: ref.url,
            ...(files.length > 0 ? { files } : {}),
          });
        }
      } catch {
        // A single failed/thrown install must not block the rest or the variant — skip it.
        continue;
      }
    }

    if (collected.length > 0) {
      const provenanceFile = path.join(worktreeDir, '.tiraz', 'provenance.json');
      try {
        await mkdir(path.dirname(provenanceFile), { recursive: true });
        const merged = [...(await readProvenance(provenanceFile)), ...collected];
        await writeFile(provenanceFile, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
      } catch {
        // Persisting provenance is a nicety; failing to write it must not drop the fetched work.
      }
    }
    return collected;
  } catch {
    // Any unexpected error: degrade to whatever we collected so far (the signatures fallback covers
    // the rest). The variant is never blocked.
    return collected;
  }
}
