/**
 * Snapshots — named checkpoints of an evolution session you can revert to. A snapshot is just a
 * saved copy of the **manifest** (the decision state: which variants exist + their hearted / culled /
 * selected status), because every variant's *code* already lives immutably on its own committed
 * `tiraz/<id>` branch — heart/cull change status, never code, and cull never deletes a branch. So a
 * checkpoint is cheap and non-destructive, and reverting just restores the manifest; the branches it
 * references are all still on disk. Stored under `.tiraz/snapshots/` with a small index.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describeError, isErrnoException } from './config';
import type { Manifest } from './manifest';
import {
  MANIFEST_DIR,
  ManifestError,
  ManifestSchema,
  loadManifest,
  saveManifest,
} from './manifest';

export const SNAPSHOT_DIR = path.join(MANIFEST_DIR, 'snapshots');

export class SnapshotError extends Error {
  override readonly name = 'SnapshotError';
}

/** Lightweight metadata for listing snapshots without loading each full manifest. */
export interface SnapshotMeta {
  id: string;
  label: string;
  createdAt: string;
  /** Number of variant nodes captured. */
  nodes: number;
  /** Number of generations captured. */
  generations: number;
}

interface SnapshotDeps {
  /** Clock; defaults to wall-clock ISO. Injected for deterministic tests. */
  now?: () => string;
}

function snapshotsDir(cwd: string): string {
  return path.join(cwd, SNAPSHOT_DIR);
}

function indexPath(cwd: string): string {
  return path.join(snapshotsDir(cwd), 'index.json');
}

function snapshotPath(cwd: string, id: string): string {
  return path.join(snapshotsDir(cwd), `${id}.json`);
}

/** Filesystem-safe slug from a human label (kebab, alphanumeric), or `snapshot` when empty. */
function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug === '' ? 'snapshot' : slug;
}

/** Read the snapshot index (newest last), or `[]` when none exists yet. */
export async function listSnapshots(cwd: string): Promise<SnapshotMeta[]> {
  let raw: string;
  try {
    raw = await readFile(indexPath(cwd), 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  try {
    return JSON.parse(raw) as SnapshotMeta[];
  } catch (err) {
    throw new SnapshotError(`Corrupt snapshot index: ${describeError(err)}`);
  }
}

async function writeIndex(cwd: string, index: SnapshotMeta[]): Promise<void> {
  await mkdir(snapshotsDir(cwd), { recursive: true });
  await writeFile(indexPath(cwd), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

/** A unique id from the label slug + a numeric suffix when the slug is already taken. */
function uniqueId(slug: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n += 1) {
    const candidate = `${slug}-${String(n)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Save the current manifest as a named snapshot. Returns its metadata. Throws {@link SnapshotError}
 * if there is no manifest to snapshot.
 */
export async function saveSnapshot(
  cwd: string,
  label: string,
  deps: SnapshotDeps = {},
): Promise<SnapshotMeta> {
  const manifest = await loadManifest(cwd);
  if (manifest === null) {
    throw new SnapshotError('No Tiraz manifest to snapshot (run `tiraz gen` first).');
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const index = await listSnapshots(cwd);
  const id = uniqueId(slugify(label), new Set(index.map((s) => s.id)));
  const meta: SnapshotMeta = {
    id,
    label: label.trim() === '' ? id : label.trim(),
    createdAt: now(),
    nodes: Object.keys(manifest.nodes).length,
    generations: manifest.generations.length,
  };

  await mkdir(snapshotsDir(cwd), { recursive: true });
  await writeFile(snapshotPath(cwd, id), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeIndex(cwd, [...index, meta]);
  return meta;
}

/** Load a snapshot's stored manifest (validated), or throw {@link SnapshotError}. */
export async function readSnapshot(cwd: string, id: string): Promise<Manifest> {
  let raw: string;
  try {
    raw = await readFile(snapshotPath(cwd, id), 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      throw new SnapshotError(`No snapshot named '${id}'.`);
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new SnapshotError(`Corrupt snapshot '${id}': ${describeError(err)}`);
  }
  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new ManifestError(`Snapshot '${id}' is not a valid manifest`, snapshotPath(cwd, id));
  }
  return result.data;
}

/**
 * Restore a snapshot: overwrite the live manifest with the snapshot's. The current state is first
 * auto-saved (label `auto: before restore`) so a revert is itself reversible. Returns the restored
 * manifest.
 */
export async function restoreSnapshot(
  cwd: string,
  id: string,
  deps: SnapshotDeps = {},
): Promise<Manifest> {
  const restored = await readSnapshot(cwd, id); // validates the target exists first
  // Auto-checkpoint the current state so the restore can be undone — only if there is one.
  if ((await loadManifest(cwd)) !== null) {
    await saveSnapshot(cwd, 'auto: before restore', deps);
  }
  await saveManifest(cwd, restored);
  return restored;
}
