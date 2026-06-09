import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Render surfaces Tiraz can target (SPEC §11). */
export type HarnessKind = 'storybook' | 'ladle' | 'histoire' | 'scratch' | 'app';

export interface DetectedHarness {
  kind: HarnessKind;
  /** Human-readable explanation of why this harness was chosen. */
  reason: string;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Merged dependencies + devDependencies from the repo's package.json (empty if none/unreadable). */
async function readPackageDeps(repoRoot: string): Promise<Record<string, string>> {
  let text: string;
  try {
    text = await readFile(path.join(repoRoot, 'package.json'), 'utf8');
  } catch {
    return {};
  }
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(text) as typeof pkg;
  } catch {
    return {};
  }
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

function hasDep(deps: Record<string, string>, matches: (name: string) => boolean): boolean {
  return Object.keys(deps).some(matches);
}

export interface DetectedFramework {
  /** Canonical framework id, or `null` if none could be identified. */
  framework: string | null;
  reason: string;
}

/** Ordered framework probes — most specific first (e.g. SvelteKit before Svelte, Next before React). */
const FRAMEWORK_PROBES: { id: string; match: (name: string) => boolean }[] = [
  { id: 'next', match: (n) => n === 'next' },
  { id: 'astro', match: (n) => n === 'astro' },
  { id: 'remix', match: (n) => n.startsWith('@remix-run/') },
  { id: 'nuxt', match: (n) => n === 'nuxt' || n === 'nuxt3' },
  { id: 'sveltekit', match: (n) => n === '@sveltejs/kit' },
  { id: 'gatsby', match: (n) => n === 'gatsby' },
  { id: 'vue', match: (n) => n === 'vue' },
  { id: 'svelte', match: (n) => n === 'svelte' },
  { id: 'vite', match: (n) => n === 'vite' },
  { id: 'react', match: (n) => n === 'react' },
];

/**
 * Identify the host framework from the repo's `package.json` (SPEC §3 — detect and conform). Returns
 * `null` when nothing recognizable is present, so `adopt` can leave the configured default untouched.
 */
export async function detectFramework(repoRoot: string): Promise<DetectedFramework> {
  const deps = await readPackageDeps(repoRoot);
  for (const probe of FRAMEWORK_PROBES) {
    if (hasDep(deps, probe.match)) {
      return { framework: probe.id, reason: `found ${probe.id} in package.json dependencies` };
    }
  }
  return { framework: null, reason: 'no known framework found in package.json' };
}

/**
 * Resolve the render harness for a repo (SPEC §11): explicit override → detect an existing
 * playground (Storybook → Ladle → Histoire) → fall back to `scratch` (a v2 stretch goal).
 */
export async function detectHarness(
  repoRoot: string,
  override?: HarnessKind,
): Promise<DetectedHarness> {
  if (override !== undefined) {
    return { kind: override, reason: 'explicit --harness override' };
  }

  const deps = await readPackageDeps(repoRoot);

  if (
    (await pathExists(path.join(repoRoot, '.storybook'))) ||
    hasDep(deps, (n) => n === 'storybook' || n.startsWith('@storybook/'))
  ) {
    return { kind: 'storybook', reason: 'found Storybook (.storybook/ or @storybook dependency)' };
  }

  if (
    (await pathExists(path.join(repoRoot, '.ladle'))) ||
    hasDep(deps, (n) => n === '@ladle/react')
  ) {
    return { kind: 'ladle', reason: 'found Ladle (.ladle/ or @ladle/react dependency)' };
  }

  if (
    (await pathExists(path.join(repoRoot, 'histoire.config.ts'))) ||
    (await pathExists(path.join(repoRoot, 'histoire.config.js'))) ||
    hasDep(deps, (n) => n === 'histoire')
  ) {
    return {
      kind: 'histoire',
      reason: 'found Histoire (histoire.config.* or histoire dependency)',
    };
  }

  return {
    kind: 'scratch',
    reason:
      'no component playground detected — scratch-route fallback is a v2 stretch goal (SPEC §11)',
  };
}
