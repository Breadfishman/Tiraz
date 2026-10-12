/**
 * The owner-supplied material that steers a round away from the model's defaults, loaded once per
 * round and shared by the planner, every build agent, and the judge: BRAND.md, the taste memory
 * (TASTE.md), and screenshots of reference sites the owner loves (`tiraz brand refs`).
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Brand } from './brand';
import { loadBrand } from './brand';
import { readTasteNotes } from './taste-memory';

/** Where `tiraz brand refs` writes reference screenshots, relative to the project root. */
export const REFS_DIR = path.join('.tiraz', 'refs');

export interface CreativeContext {
  brand: Brand | null;
  /** TASTE.md notes (most recent first-kept), or ''. */
  taste: string;
  /** Absolute paths of reference screenshots, sorted. */
  references: string[];
}

/** Absolute paths of the reference screenshots under `<cwd>/.tiraz/refs` (none → []). */
export async function listReferenceShots(cwd: string): Promise<string[]> {
  const dir = path.join(cwd, REFS_DIR);
  try {
    const entries = await readdir(dir);
    return entries
      .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
      .sort()
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

/** Load the brand file, taste notes, and reference screenshots for a project. */
export async function loadCreativeContext(cwd: string): Promise<CreativeContext> {
  const [brand, taste, references] = await Promise.all([
    loadBrand(cwd),
    readTasteNotes(cwd),
    listReferenceShots(cwd),
  ]);
  return { brand, taste, references };
}
