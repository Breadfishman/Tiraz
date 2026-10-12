import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_DIR } from './manifest';
import type { Manifest } from './manifest';

/**
 * Taste memory: the human's one-line reasons for hearting, selecting or culling a variant, kept in
 * a persistent, hand-editable markdown file (`.tiraz/TASTE.md`) that later planner / build / judge
 * prompts read so future rounds lean toward what the owner liked and away from what they rejected.
 */
export const TASTE_FILE = 'TASTE.md';

export type TasteVerdict = 'liked' | 'rejected';

export interface TasteNote {
  verdict: TasteVerdict;
  nodeId: string;
  why: string;
  /** The variant genome's `ethos` (aesthetic direction), when it had one. */
  direction?: string;
  /** ISO timestamp. */
  at: string;
}

const MAX_WHY = 300;

const HEADER_LINES = [
  '# Taste memory',
  '',
  "<!-- Tiraz appends one line per review reason (heart / select / cull --why). Future rounds read this file to steer toward the owner's taste. Edit or delete lines by hand freely; keep one note per line. -->",
  '',
];
const HEADER = HEADER_LINES.join('\n');

/** Absolute path of the taste file for a project. */
export function tastePath(cwd: string): string {
  return path.join(cwd, MANIFEST_DIR, TASTE_FILE);
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** One markdown bullet line for a note, e.g. `- 2026-10-12 liked g0-n2 ("Ink and paper"): …`. */
export function formatTasteNote(note: TasteNote): string {
  let why = clean(note.why);
  if (why.length > MAX_WHY) why = `${why.slice(0, MAX_WHY - 1).trimEnd()}…`;
  const date = note.at.slice(0, 10);
  const direction =
    note.direction !== undefined && clean(note.direction) !== ''
      ? ` ("${clean(note.direction)}")`
      : '';
  return `- ${date} ${note.verdict} ${note.nodeId}${direction}: ${why}`;
}

/** Append a note to `.tiraz/TASTE.md` (creating it with a header). Blank `why` is a no-op. */
export async function appendTasteNote(cwd: string, note: TasteNote): Promise<void> {
  if (clean(note.why) === '') return;
  const file = tastePath(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  let existing: string | null;
  try {
    existing = await readFile(file, 'utf8');
  } catch {
    existing = null;
  }
  const prefix =
    existing === null ? HEADER : existing === '' || existing.endsWith('\n') ? '' : '\n';
  await appendFile(file, `${prefix}${formatTasteNote(note)}\n`, 'utf8');
}

/**
 * The notes (file contents minus the generated header), trimmed. When longer than `maxChars`, the
 * oldest whole lines are dropped so the most recent survive. `''` when the file is missing.
 */
export async function readTasteNotes(cwd: string, maxChars = 4000): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(tastePath(cwd), 'utf8');
  } catch {
    return '';
  }
  const body = raw.startsWith(HEADER) ? raw.slice(HEADER.length) : raw;
  const lines = body.split('\n').filter((line) => line.trim() !== '');
  const kept: string[] = [];
  let size = 0;
  for (const line of [...lines].reverse()) {
    const next = size + line.length + (kept.length > 0 ? 1 : 0);
    if (next > maxChars) break;
    kept.unshift(line);
    size = next;
  }
  return kept.join('\n');
}

/** Prompt lines for the owner's taste so far, or `[]` when there are no notes. */
export function tasteSection(notes: string): string[] {
  const lines = notes.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  return [
    "## The owner's taste so far (from their reviews)",
    'Liked and rejected variants, with their reasons. Lean toward what they liked; never repeat what they rejected.',
    ...lines,
    '',
  ];
}

/**
 * Record the same reason for several nodes of a run (the select / cull / dashboard capture path),
 * filling `direction` from each node's genome ethos. Blank `why` records nothing.
 */
export async function recordTaste(
  cwd: string,
  manifest: Manifest,
  nodeIds: readonly string[],
  verdict: TasteVerdict,
  why: string | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (why === undefined || clean(why) === '') return;
  const at = now.toISOString();
  for (const nodeId of nodeIds) {
    const ethos = manifest.nodes[nodeId]?.genome.ethos;
    await appendTasteNote(cwd, {
      verdict,
      nodeId,
      why,
      at,
      ...(ethos !== undefined ? { direction: ethos } : {}),
    });
  }
}
