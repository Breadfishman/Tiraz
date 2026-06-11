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

import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CommandRunner } from './agent';
import { spawnRunner } from './agent';
import type { FetchProvenance, FetchRef } from './component-fetch';
import { buildFetchCommand } from './component-fetch';

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
  deps: { runner?: CommandRunner },
): Promise<FetchProvenance[]> {
  const collected: FetchProvenance[] = [];
  try {
    if (plan.length === 0) return collected;
    if (!(await exists(path.join(worktreeDir, 'components.json')))) return collected;

    const runner = deps.runner ?? spawnRunner;
    for (const ref of plan) {
      try {
        const { command, args } = buildFetchCommand(ref);
        const result = await runner(command, args, { cwd: worktreeDir });
        if (result.exitCode === 0) {
          collected.push({ source: ref.source, item: ref.item, url: ref.url });
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
