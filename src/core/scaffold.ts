import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnRunner } from './agent';
import type { CommandRunner } from './agent';
import { resolveCapabilities, scaffoldPackages } from './capabilities';
import { updateConfig } from './config';

export class ScaffoldError extends Error {
  override readonly name = 'ScaffoldError';
}

export type ScaffoldFramework = 'astro' | 'next';

export interface ScaffoldOptions {
  /** Directory to run from (the parent of a named project, or the project dir itself). */
  cwd: string;
  /** Astro (default) or Next.js (`--next`; also required for v0 interop, SPEC §12bis). */
  framework: ScaffoldFramework;
  /** Capability modules to scaffold (SPEC §10). */
  modules: { threeD: boolean; remotion: boolean };
  /** Optional project name → scaffolds into `<cwd>/<name>`; omitted → scaffolds into `cwd`. */
  projectName?: string;
}

export interface ScaffoldDeps {
  /** Injected for the scaffolder CLIs / tests; defaults to {@link spawnRunner}. */
  runner?: CommandRunner;
}

export interface ScaffoldResult {
  /** Absolute path of the scaffolded project. */
  dir: string;
  framework: ScaffoldFramework;
  /** Capability npm packages installed for the enabled modules. */
  installed: string[];
  /** Warnings surfaced for restricted capabilities that were enabled (e.g. Remotion). */
  warnings: string[];
}

/** Run a command from `cwd`, throwing {@link ScaffoldError} on a non-zero exit. */
async function run(
  command: string,
  args: string[],
  cwd: string,
  runner: CommandRunner,
): Promise<void> {
  const result = await runner(command, args, { cwd });
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() !== '' ? result.stderr.trim() : result.stdout.trim();
    throw new ScaffoldError(
      `${command} ${args.join(' ')} failed (exit ${String(result.exitCode)}): ${detail}`,
    );
  }
}

/**
 * Scaffold a greenfield project (SPEC §10, `tiraz init`). Drives the official framework CLIs through
 * the injected {@link CommandRunner} — Astro (+ Tailwind) or Next.js (Tailwind built in), then
 * shadcn/ui, then installs the pinned capability stack for the enabled modules — and writes a
 * `tiraz.config.json` (`mode: greenfield`). Returns the installed packages and any capability
 * warnings (e.g. Remotion's commercial-license note).
 */
export async function scaffoldProject(
  opts: ScaffoldOptions,
  deps: ScaffoldDeps = {},
): Promise<ScaffoldResult> {
  const runner = deps.runner ?? spawnRunner;
  const target = opts.projectName ?? '.';
  const dir = opts.projectName === undefined ? opts.cwd : path.join(opts.cwd, opts.projectName);

  if (opts.framework === 'astro') {
    await run(
      'npm',
      ['create', 'astro@latest', target, '--', '--template', 'minimal', '--no-install', '--no-git'],
      opts.cwd,
      runner,
    );
  } else {
    await run(
      'npx',
      [
        'create-next-app@latest',
        target,
        '--ts',
        '--tailwind',
        '--app',
        '--eslint',
        '--use-npm',
        '--no-src-dir',
        '--import-alias',
        '@/*',
        '--skip-install',
      ],
      opts.cwd,
      runner,
    );
  }

  // Install base deps (+ the capability stack) FIRST, so the tools below can detect the project and
  // run non-interactively. `npm install` with no extra args reconciles the framework's package.json.
  const installed = scaffoldPackages(opts.modules);
  await run('npm', ['install', ...installed], dir, runner);

  if (opts.framework === 'astro') {
    await run('npx', ['astro', 'add', 'tailwind', '--yes'], dir, runner);
  }

  // `--defaults --yes` keeps shadcn fully non-interactive (no base-color / style prompts).
  await run('npx', ['shadcn@latest', 'init', '--defaults', '--yes'], dir, runner);

  // The framework CLI creates the project dir; ensure it exists before writing config (no-op in
  // real runs, and lets the config land even if a step was a no-op).
  await mkdir(dir, { recursive: true });
  await updateConfig(dir, (current) => {
    current.mode = 'greenfield';
    current.framework = opts.framework;
    current.modules = { threeD: opts.modules.threeD, remotion: opts.modules.remotion };
  });

  return {
    dir,
    framework: opts.framework,
    installed,
    warnings: resolveCapabilities(opts.modules).warnings,
  };
}
