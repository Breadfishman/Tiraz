import type { Command } from 'commander';
import { selectSurvivors } from '../core/beam';
import { describeError } from '../core/config';
import { loadManifest, saveManifest } from '../core/manifest';

/** Register the `select` command (SPEC §5). */
export function registerSelectCommand(program: Command): void {
  program
    .command('select <nodes...>')
    .description('Mark survivors; prune the rest of their generation.')
    .action(async (nodes: string[]) => {
      const cwd = process.cwd();
      const manifest = await loadManifest(cwd);
      if (manifest === null) {
        console.error('No Tiraz run found here (.tiraz/manifest.json is missing).');
        process.exitCode = 1;
        return;
      }
      try {
        await saveManifest(cwd, selectSurvivors(manifest, nodes));
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
        return;
      }
      console.log(`Marked ${String(nodes.length)} survivor(s): ${nodes.join(', ')}`);
    });
}
