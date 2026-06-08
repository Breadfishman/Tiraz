import type { Command } from 'commander';
import { loadManifest } from '../core/manifest';
import { renderStatus, renderTree } from '../core/tree';

/** Register the `tree` and `status` commands (SPEC §5). */
export function registerTreeCommands(program: Command): void {
  program
    .command('tree')
    .description('Render the variant DAG: lineage, scores, and status.')
    .action(async () => {
      const manifest = await loadManifest(process.cwd());
      if (manifest === null) {
        console.error('No Tiraz run found here (.tiraz/manifest.json is missing).');
        process.exitCode = 1;
        return;
      }
      console.log(renderTree(manifest));
    });

  program
    .command('status')
    .description('Summarize the current run (generation and per-status counts).')
    .action(async () => {
      const manifest = await loadManifest(process.cwd());
      if (manifest === null) {
        console.error('No Tiraz run found here (.tiraz/manifest.json is missing).');
        process.exitCode = 1;
        return;
      }
      console.log(renderStatus(manifest));
    });
}
