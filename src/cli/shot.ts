import path from 'node:path';
import type { Command } from 'commander';
import { describeError, loadConfig } from '../core/config';
import type { HarnessKind } from '../core/detect';
import { createPlaywrightRenderer } from '../core/playwright-io';

const HARNESSES: readonly HarnessKind[] = ['storybook', 'ladle', 'histoire', 'scratch', 'app'];

interface ShotCliOptions {
  worktree: string;
  harness: string;
  target: string;
  port: string;
  out: string;
}

/**
 * Register `shot`: boot a worktree's render harness, capture a full-page screenshot of the target,
 * and shut down. Build agents run this mid-session to look at their own work before finishing.
 */
export function registerShotCommand(program: Command): void {
  program
    .command('shot')
    .description('Render a worktree target and save a full-page screenshot (used by build agents).')
    .requiredOption('--worktree <dir>', 'The variant worktree to serve')
    .requiredOption('--harness <kind>', `Render surface (${HARNESSES.join(' | ')})`)
    .option('--target <target>', 'Scoped target (story id, route, …)', '')
    .requiredOption('--port <n>', 'Port for the harness dev server')
    .requiredOption('--out <png>', 'Where to write the screenshot')
    .action(async (options: ShotCliOptions) => {
      const port = Number.parseInt(options.port, 10);
      if (!Number.isInteger(port) || port <= 0) {
        console.error(`--port must be a positive integer (got "${options.port}").`);
        process.exitCode = 1;
        return;
      }
      if (!HARNESSES.includes(options.harness as HarnessKind)) {
        console.error(`Unknown harness: "${options.harness}". Use: ${HARNESSES.join(' | ')}`);
        process.exitCode = 1;
        return;
      }
      try {
        const out = path.resolve(options.out);
        const worktreeDir = path.resolve(options.worktree);
        // The `app` dev command comes from the project's tiraz.config.json: the worktree's copy when
        // it's committed, else the repo root's (worktrees live at <repo>/.tiraz/worktrees/<id>).
        const local = await loadConfig(worktreeDir);
        const { config } =
          local.path !== null
            ? local
            : await loadConfig(path.resolve(worktreeDir, '..', '..', '..'));
        await createPlaywrightRenderer({ appCommand: config.appCommand }).render({
          worktreeDir,
          harness: { kind: options.harness as HarnessKind, reason: 'tiraz shot' },
          target: options.target,
          port,
          screenshotPath: out,
        });
        console.log(`Screenshot written to ${out} — read it to check the render.`);
      } catch (err) {
        console.error(`Render failed: ${describeError(err)}`);
        process.exitCode = 1;
      }
    });
}
