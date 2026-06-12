/**
 * Genuine Tier-2 component fetching via 21st.dev semantic search (SPEC §12, Phase 2/3 — the
 * agent-chosen + MCP transport; see `docs/plans/component-fetch.md`).
 *
 * Unlike the shadcn-registry sources (fixed slug lists installed via `npx shadcn add`), 21st.dev is a
 * QUERY-DRIVEN source: a planning agent pass picks short search queries, and each query hits the
 * authed `POST https://magic.21st.dev/api/fetch-ui` endpoint (header `x-api-key`), which semantically
 * searches 21st's library and returns REAL component code inline. This module is the pure core
 * (planning prompt + request shaping + tolerant parsing); the HTTP + filesystem work lives in the
 * coverage-excluded `twentyfirst-io.ts`.
 */

import type { DesignSystem } from './ds-adherence';
import type { Genome } from './genome';

/** Base URL + endpoint for 21st.dev's `fetch-ui` semantic search (returns real component code). */
export const TWENTYFIRST_BASE_URL = 'https://magic.21st.dev';
export const TWENTYFIRST_FETCH_UI_PATH = '/api/fetch-ui';
/** Env var holding the opt-in 21st.dev API key (matches the MagicAgent stub + magic-mcp convention). */
export const TWENTYFIRST_API_KEY_ENV = 'TWENTY_FIRST_API_KEY';
/** Source id fetched components are recorded under — matches the `21st-registry` source in sources.ts. */
export const TWENTYFIRST_SOURCE_ID = '21st-registry';

/** Summarize a design system into one short prompt line (so the planner picks fitting components). */
function designSystemHint(system: DesignSystem | undefined): string[] {
  if (system === undefined) return [];
  const palette = system.tokens.color ?? [];
  if (palette.length === 0 && system.components.length === 0) return [];
  const parts: string[] = [];
  if (palette.length > 0) parts.push(`palette: ${palette.slice(0, 6).join(', ')}`);
  if (system.components.length > 0) {
    parts.push(`existing components: ${system.components.slice(0, 8).join(', ')}`);
  }
  return ['## Design context (so picks fit the system)', parts.join(' — '), ''];
}

/**
 * The planning-pass prompt (SPEC §12, Phase 2): before building, the agent decides which existing
 * 21st.dev components would most elevate THIS brief, and outputs a strict JSON array of short search
 * queries. Pure + deterministic. The output is parsed by {@link parsePlannedQueries}.
 */
export function composePlanningPrompt(
  genome: Genome,
  designSystem: DesignSystem | undefined,
  max: number,
): string {
  const lines: string[] = [
    '# Tiraz component-planning pass (21st.dev)',
    '',
    'You are about to build the UI brief below. BEFORE building, decide which existing, production',
    "UI components from 21st.dev's library would most ELEVATE this specific design if composed into",
    'it — high-craft pieces that are tedious to build from scratch (animated heroes, marquees, bento',
    'grids, testimonial walls, pricing tables, feature sections, etc.). Pick only what genuinely fits',
    'this brief; quality over quantity.',
    '',
    '## Brief',
    genome.brief,
    '',
  ];

  if (genome.target !== undefined) {
    lines.push('## Target', `Scope: ${genome.target}`, '');
  }

  lines.push(...designSystemHint(designSystem));

  lines.push(
    '## Output format — STRICT',
    `Output ONLY a JSON array of at most ${String(max)} short search queries (each 2–4 words),`,
    'ordered most-impactful first. No prose, no markdown fences, no object keys — just the array.',
    'Example: ["animated hero", "testimonial marquee", "pricing table"]',
    'If no external component would help this brief, output exactly: []',
  );
  return lines.join('\n');
}

/** Extract the first JSON array-of-strings from arbitrary agent text, or `[]` if none parses. */
function extractStringArray(text: string): string[] {
  const candidates = [text.trim()];
  // Greedy `[ … ]` (first `[` to last `]`) tolerates surrounding prose / markdown fences.
  const match = /\[[\s\S]*\]/.exec(text);
  if (match !== null) candidates.push(match[0]);
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed;
      }
    } catch {
      // try the next candidate
    }
  }
  return [];
}

/**
 * Parse the planning pass's output into a clean, deduped, capped list of search queries. Tolerant of
 * prose around the JSON array; trims + collapses whitespace, drops empties, dedupes case-insensitively,
 * and caps at `max`. Returns `[]` when nothing parseable is found. Pure.
 */
export function parsePlannedQueries(output: string, opts: { max: number }): string[] {
  if (opts.max <= 0) return [];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const raw of extractStringArray(output)) {
    const query = raw.trim().replace(/\s+/g, ' ');
    if (query === '') continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length >= opts.max) break;
  }
  return queries;
}

/** A component returned by `fetch-ui`: a semantically-matched piece of real UI code. */
export interface TwentyFirstComponent {
  componentName: string;
  componentCode: string;
  demoCode?: string;
  similarity?: number;
}

/** Pull the raw JSON text out of a `fetch-ui` response body (`{ text }`, or a bare string). */
function extractResponseText(body: unknown): string | null {
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null && 'text' in body) {
    const text: unknown = body.text;
    if (typeof text === 'string') return text;
  }
  return null;
}

/** Validate + normalize one raw component record, or `null` if it lacks usable code. */
function toComponent(raw: unknown): TwentyFirstComponent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const nameRaw = rec.componentName;
  const codeRaw = rec.componentCode;
  const demoRaw = rec.demoCode;
  const similarityRaw = rec.similarity;
  const componentName = typeof nameRaw === 'string' ? nameRaw.trim() : '';
  const componentCode = typeof codeRaw === 'string' ? codeRaw : '';
  if (componentName === '' || componentCode.trim() === '') return null;
  return {
    componentName,
    componentCode,
    ...(typeof demoRaw === 'string' ? { demoCode: demoRaw } : {}),
    ...(typeof similarityRaw === 'number' ? { similarity: similarityRaw } : {}),
  };
}

/**
 * Parse a `fetch-ui` response body into the list of usable components. The endpoint returns
 * `{ text: "<json-array-string>" }`; this unwraps + validates it tolerantly, dropping any record
 * without a name + code. Returns `[]` on any malformed input. Pure.
 */
export function parseFetchUiResponse(body: unknown): TwentyFirstComponent[] {
  const text = extractResponseText(body);
  if (text === null) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: TwentyFirstComponent[] = [];
  for (const raw of arr) {
    const component = toComponent(raw);
    if (component !== null) out.push(component);
  }
  return out;
}

/** The best match from a result set: highest `similarity`, falling back to result order. */
export function pickTopComponent(
  components: readonly TwentyFirstComponent[],
): TwentyFirstComponent | null {
  if (components.length === 0) return null;
  const sorted = [...components].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  return sorted[0] ?? null;
}

/** Turn a component name into a safe kebab-case filename slug (e.g. `Shape Landing Hero` → `shape-landing-hero`). */
export function slugifyComponentName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'component' : slug;
}

/** A ready-to-send `fetch-ui` request (URL + method + headers + JSON body). */
export interface FetchUiRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

/** Build the authed `POST /api/fetch-ui` request for one search query. Pure (key passed in). */
export function buildFetchUiRequest(
  query: string,
  message: string,
  apiKey: string,
): FetchUiRequest {
  return {
    url: `${TWENTYFIRST_BASE_URL}${TWENTYFIRST_FETCH_UI_PATH}`,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ message, searchQuery: query }),
  };
}
