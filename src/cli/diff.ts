import type { Command } from 'commander';
import { renderGenomeDiff } from '../core/diff';
import { loadManifest } from '../core/manifest';

/** Register the `diff` command (SPEC §5): compare the genomes behind two variants. */
export function registerDiffCommand(program: Command): void {
  program
    .command('diff <a> <b>')
    .description('Compare two variants: show which genome inputs differ.')
    .action(async (a: string, b: string) => {
      const manifest = await loadManifest(process.cwd());
      if (manifest === null) {
        console.error('No Tiraz run found here (.tiraz/manifest.json is missing).');
        process.exitCode = 1;
        return;
      }
      const nodeA = manifest.nodes[a];
      const nodeB = manifest.nodes[b];
      if (nodeA === undefined || nodeB === undefined) {
        const missing = [nodeA === undefined ? a : null, nodeB === undefined ? b : null]
          .filter((id): id is string => id !== null)
          .join(', ');
        console.error(`Unknown variant(s): ${missing}`);
        process.exitCode = 1;
        return;
      }
      console.log(renderGenomeDiff(a, nodeA.genome, b, nodeB.genome));
    });
}
