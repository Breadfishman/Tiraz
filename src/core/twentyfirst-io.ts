/**
 * Best-effort glue for genuine component fetching via 21st.dev semantic search (SPEC §12, Phase 2/3 —
 * see `docs/plans/component-fetch.md`). Coverage-excluded like the other `*-io.ts` modules: it runs a
 * real planning agent pass, makes authed HTTP calls, and writes into the worktree, so every testable
 * decision lives in the pure `twentyfirst.ts`.
 *
 * The HARD RULE (same as the shadcn path): this NEVER throws and NEVER blocks a variant. No API key,
 * a failed planning pass, an offline endpoint, or a malformed response all degrade to "fetch nothing"
 * and the variant proceeds on signatures (today's behaviour). It is best-effort enrichment.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Agent } from './agent';
import type { FetchProvenance } from './component-fetch';
import type { DesignSystem } from './ds-adherence';
import type { Genome } from './genome';
import {
  TWENTYFIRST_API_KEY_ENV,
  TWENTYFIRST_BASE_URL,
  TWENTYFIRST_FETCH_UI_PATH,
  TWENTYFIRST_SOURCE_ID,
  buildFetchUiRequest,
  composePlanningPrompt,
  parseFetchUiResponse,
  parsePlannedQueries,
  pickTopComponent,
  slugifyComponentName,
} from './twentyfirst';

/** The subset of the global `fetch` we use — injectable so tests don't hit the network. */
export type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export interface PlanAndFetchTwentyFirstOptions {
  worktreeDir: string;
  genome: Genome;
  designSystem?: DesignSystem;
  /** The coding agent — runs the planning pass that picks the search queries. */
  agent: Agent;
  /** Active skill ids (passed through to the planning agent run). */
  activeSkillIds: string[];
  /** Max search queries the planning pass may pick (each yields its single top component). */
  budget: number;
  /** API key; defaults to `process.env[TWENTY_FIRST_API_KEY]`. */
  apiKey?: string;
  /** Injectable fetch (tests); defaults to global `fetch`. */
  fetchImpl?: FetchImpl;
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
 * Run the planning pass, fetch each planned component from 21st.dev, write the real code into the
 * worktree, and return the provenance for what landed. Best-effort per the hard rule:
 *
 * - no API key / `budget <= 0` → `[]`;
 * - planning pass fails or yields no queries → `[]`;
 * - each query POSTs `/api/fetch-ui`; the top match's code is written to
 *   `<worktree>/components/ui/<slug>.tsx` (duplicate slugs across queries are skipped);
 * - a non-OK response or a thrown error skips that query and continues;
 * - collected provenance is merged into `<worktree>/.tiraz/provenance.json`.
 */
export async function planAndFetchTwentyFirst(
  opts: PlanAndFetchTwentyFirstOptions,
): Promise<FetchProvenance[]> {
  const collected: FetchProvenance[] = [];
  try {
    const apiKey = (opts.apiKey ?? process.env[TWENTYFIRST_API_KEY_ENV] ?? '').trim();
    if (apiKey === '' || opts.budget <= 0) return collected;

    // 1. Planning pass — the agent picks which 21st.dev components would elevate this brief.
    const planResult = await opts.agent.run({
      cwd: opts.worktreeDir,
      prompt: composePlanningPrompt(opts.genome, opts.designSystem, opts.budget),
      skills: opts.activeSkillIds,
      ...(opts.genome.sources !== undefined ? { sources: opts.genome.sources } : {}),
    });
    if (!planResult.ok) return collected;
    const queries = parsePlannedQueries(planResult.output, { max: opts.budget });
    if (queries.length === 0) return collected;

    // 2. Fetch each query's top component and write its real code into the worktree.
    const fetchImpl: FetchImpl = opts.fetchImpl ?? globalThis.fetch;
    const uiDir = path.join(opts.worktreeDir, 'components', 'ui');
    const seenSlugs = new Set<string>();
    for (const query of queries) {
      try {
        const req = buildFetchUiRequest(query, opts.genome.brief, apiKey);
        const res = await fetchImpl(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
        });
        if (!res.ok) continue;
        const top = pickTopComponent(parseFetchUiResponse(await res.json()));
        if (top === null) continue;
        const slug = slugifyComponentName(top.componentName);
        if (seenSlugs.has(slug)) continue;
        seenSlugs.add(slug);
        await mkdir(uiDir, { recursive: true });
        await writeFile(path.join(uiDir, `${slug}.tsx`), top.componentCode, 'utf8');
        collected.push({
          source: TWENTYFIRST_SOURCE_ID,
          item: slug,
          url: `${TWENTYFIRST_BASE_URL}${TWENTYFIRST_FETCH_UI_PATH}?q=${encodeURIComponent(query)}`,
        });
      } catch {
        // One failed query must not block the rest or the variant — skip it.
        continue;
      }
    }

    // 3. Persist provenance (merged with any shadcn-path records). A write failure is non-fatal.
    if (collected.length > 0) {
      const provenanceFile = path.join(opts.worktreeDir, '.tiraz', 'provenance.json');
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
    // Any unexpected error: degrade to whatever we collected (signatures cover the rest).
    return collected;
  }
}
