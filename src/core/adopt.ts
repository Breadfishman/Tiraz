/**
 * Integration-mode attach (SPEC §3, `tiraz adopt`). Detect the host stack and render harness, then
 * write a `tiraz.config.json` with `mode: integration` — conform to the existing repo, never impose
 * a stack. The active primary becomes `redesign-existing-projects` at runtime (resolved from mode),
 * so it is not stored here.
 */

import path from 'node:path';
import { detectFramework, detectHarness } from './detect';
import type { HarnessKind } from './detect';
import { CONFIG_FILENAME, updateConfig } from './config';

export interface AdoptOptions {
  cwd: string;
  /** Explicit render-harness override; otherwise detected (SPEC §11). */
  harness?: HarnessKind;
}

export interface AdoptResult {
  /** Effective framework: detected, else the existing config default. */
  framework: string;
  /** Resolved render harness. */
  harness: HarnessKind;
  harnessReason: string;
  configPath: string;
}

/**
 * Attach Tiraz to an existing repo (SPEC §3). Detects the framework + harness and writes an
 * integration `tiraz.config.json` (preserving any keys the user already set). The detected framework
 * is recorded only when recognized — an unknown stack leaves the configured default untouched rather
 * than imposing one.
 */
export async function adoptProject(opts: AdoptOptions): Promise<AdoptResult> {
  const { framework } = await detectFramework(opts.cwd);
  const harness = await detectHarness(opts.cwd, opts.harness);

  const { config } = await updateConfig(opts.cwd, (current) => {
    current.mode = 'integration';
    if (framework !== null) {
      current.framework = framework;
    }
    if (harness.kind !== 'scratch') {
      current.harness = harness.kind;
    }
  });

  return {
    framework: framework ?? config.framework,
    harness: harness.kind,
    harnessReason: harness.reason,
    configPath: path.join(opts.cwd, CONFIG_FILENAME),
  };
}
