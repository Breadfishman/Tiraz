/**
 * File-walking I/O for the DS-adherence collectors (SPEC §9). Excluded from unit coverage — it reads
 * arbitrary repo/worktree files — so the parsing decisions all live in the tested `ds-collect.ts`.
 * Bounded, best-effort: walks skip heavy/irrelevant dirs and cap the file count.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { FetchProvenance } from './component-fetch';
import { fetchedFiles } from './component-fetch';
import type { DesignSystem, UsedValues } from './ds-adherence';
import {
  buildDesignSystem,
  dropComponents,
  extractExportedComponents,
  extractUsedValues,
  mergeUsedValues,
  parseCssCustomProperties,
} from './ds-collect';
import type { VariantNode } from './manifest';
import { parseTarget } from './render-harness';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.tiraz', // Tiraz's own state (variant worktrees) — never part of the repo's design system
  'dist',
  'build',
  'coverage',
  '.next',
  '.astro',
  '.turbo',
]);
const MAX_FILES = 300;
const COMPONENT_DIRS = ['src/components/ui', 'components/ui', 'src/components', 'app/components'];

/** Bounded recursive walk collecting files with the given extensions, skipping heavy dirs. */
async function walk(dir: string, exts: string[], acc: string[] = []): Promise<string[]> {
  if (acc.length >= MAX_FILES) return acc;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (acc.length >= MAX_FILES) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        await walk(full, exts, acc);
      }
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

async function readSafe(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

/** List PascalCase component names from the repo's component directories (by file basename). */
async function collectComponentNames(repoRoot: string): Promise<string[]> {
  const names: string[] = [];
  for (const rel of COMPONENT_DIRS) {
    let entries;
    try {
      entries = await readdir(path.join(repoRoot, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && /\.(tsx|jsx|vue|svelte)$/.test(entry.name)) {
        const base = entry.name.replace(/\.[^.]+$/, '');
        // kebab/file name → PascalCase (button-group → ButtonGroup)
        const pascal = base
          .split(/[-_]/)
          .map((p) => (p === '' ? '' : p.charAt(0).toUpperCase() + p.slice(1)))
          .join('');
        if (/^[A-Z]/.test(pascal)) names.push(pascal);
      }
    }
  }
  return [...new Set(names)];
}

/**
 * Collect a repo's design system (SPEC §9): parse design tokens from its CSS custom properties and
 * list its component names. Best-effort — an empty system just means everything reads as off-system,
 * which surfaces in the score rather than crashing.
 */
export async function collectDesignSystem(repoRoot: string): Promise<DesignSystem> {
  const cssFiles = await walk(repoRoot, ['.css']);
  const css = (await Promise.all(cssFiles.map(readSafe))).join('\n');
  const props = parseCssCustomProperties(css);
  const components = await collectComponentNames(repoRoot);
  return buildDesignSystem(props, components);
}

/** Read a worktree's `.tiraz/provenance.json` (fetched-component records), or `[]` if absent. */
async function readProvenance(worktree: string): Promise<FetchProvenance[]> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(worktree, '.tiraz', 'provenance.json'), 'utf8'),
    ) as unknown;
    return Array.isArray(parsed) ? (parsed as FetchProvenance[]) : [];
  } catch {
    return [];
  }
}

/**
 * Collect the values a variant actually used (SPEC §9): the scoped target file if it resolves to
 * one, otherwise a bounded scan of the worktree's source. Feeds {@link extractUsedValues}.
 *
 * Phase 1.5 (SPEC §12): FETCHED component files (recorded in `.tiraz/provenance.json`) are EXCLUDED
 * from the scan, and the agent's imports of those fetched components are dropped — so DS-adherence
 * scores the agent's *authored* design choices, not the intentional hardcoded values inside library
 * code it composed. No provenance (e.g. a homegrown variant) → nothing excluded, today's behaviour.
 */
export async function collectUsedValues(node: VariantNode): Promise<UsedValues> {
  const provenance = await readProvenance(node.worktree);
  const fetchedAbsolute = new Set(
    fetchedFiles(provenance).map((rel) => path.join(node.worktree, rel)),
  );

  let files: string[] = [];
  const target = node.genome.target;
  if (target !== undefined) {
    const parsed = parseTarget(target);
    if (parsed.kind === 'component' || parsed.kind === 'path') {
      const candidate = path.join(node.worktree, parsed.value);
      const content = await readSafe(candidate);
      if (content !== '') {
        files = [candidate];
      }
    }
  }
  if (files.length === 0) {
    files = await walk(node.worktree, ['.tsx', '.jsx', '.ts', '.css']);
  }
  // Drop fetched library files — their internal literals are not the agent's off-system choices.
  const authoredFiles = files.filter((f) => !fetchedAbsolute.has(f));

  // The component names exported by the fetched files (so the agent's imports of them aren't penalized).
  const fetchedComponentNames = (
    await Promise.all(
      [...fetchedAbsolute].map(async (f) => extractExportedComponents(await readSafe(f))),
    )
  ).flat();

  const parts = await Promise.all(
    authoredFiles.map(async (f) => extractUsedValues(await readSafe(f))),
  );
  return dropComponents(mergeUsedValues(parts), fetchedComponentNames);
}
