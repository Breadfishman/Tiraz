import { mkdir, writeFile } from 'node:fs/promises';
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
  /**
   * Set up a Storybook render surface + a starter `Hero` story so `gen` can render and score
   * immediately (SPEC §11). Default `true`; pass `false` (`init --no-storybook`) to skip for repos
   * that bring their own playground.
   */
  renderSurface?: boolean;
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
  /** The starter story id seeded for the render surface (`hero--default`), or null if skipped. */
  storyId: string | null;
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

  // Render surface: a Storybook + a starter `Hero` story, so `gen` has something to render and score
  // out of the box (the #1 first-run blocker otherwise). Skippable via `init --no-storybook`.
  const renderSurface = opts.renderSurface !== false;
  if (renderSurface) {
    await setupRenderSurface(dir, opts.framework, runner);
  }

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
    storyId: renderSurface ? STARTER_STORY_ID : null,
  };
}

/** Canonical id of the seeded story (`title: "Hero"` + `export const Default`), the default gen target. */
const STARTER_STORY_ID = 'hero--default';

/**
 * Install Storybook and seed a starter story. `storybook init` is driven non-interactively: `--yes`
 * (no prompts), `--no-dev` (do NOT launch the dev server, which would hang the scaffold), `--no-agent`
 * (force the real setup instead of agent-mode "log instructions"), and an explicit `--type` so the
 * framework adapter is deterministic rather than auto-detected (Next → `nextjs`; Astro → a React-Vite
 * Storybook for its React islands). Then a `Hero` component + story land so `story:hero--default` resolves.
 */
async function setupRenderSurface(
  dir: string,
  framework: ScaffoldFramework,
  runner: CommandRunner,
): Promise<void> {
  const type = framework === 'next' ? 'nextjs' : 'react';
  const args = [
    'storybook@latest',
    'init',
    '--yes',
    '--no-dev',
    '--no-agent',
    '--disable-telemetry',
    '--type',
    type,
  ];
  if (framework === 'astro') {
    // Astro has no Storybook adapter; render its React islands through the Vite builder.
    args.push('--builder', 'vite');
  }
  await run('npx', args, dir, runner);
  await writeStarterStory(dir);
}

/** Write a self-contained `Hero` component + CSF3 story (id `hero--default`) into `stories/`. */
async function writeStarterStory(dir: string): Promise<void> {
  const storiesDir = path.join(dir, 'stories');
  await mkdir(storiesDir, { recursive: true });
  await writeFile(path.join(storiesDir, 'Hero.tsx'), HERO_COMPONENT, 'utf8');
  await writeFile(path.join(storiesDir, 'Hero.stories.tsx'), HERO_STORY, 'utf8');
}

const HERO_COMPONENT = `/** Starter hero — Tiraz's render-surface seed. Replace freely; bred variants target \`story:hero--default\`. */
export function Hero() {
  return (
    <section
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 800, margin: 0 }}>
        Your headline here
      </h1>
      <p style={{ fontSize: '1.125rem', maxWidth: '36rem', opacity: 0.7, margin: 0 }}>
        A starter hero so Tiraz has something to render and score. Write your brief, run a generation,
        and let the search redesign this.
      </p>
      <button
        style={{
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          border: 'none',
          background: '#111',
          color: '#fff',
          fontSize: '1rem',
          cursor: 'pointer',
        }}
      >
        Get started
      </button>
    </section>
  );
}
`;

const HERO_STORY = `import { Hero } from './Hero';

/** Story id \`hero--default\` — the default \`gen --target\` for a freshly scaffolded project. */
const meta = {
  title: 'Hero',
  component: Hero,
  parameters: { layout: 'fullscreen' },
};

export default meta;

export const Default = {};
`;
