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
