import type { Command } from 'commander';
import { cull } from '../core/beam';
import { describeError } from '../core/config';
import { loadManifest, saveManifest } from '../core/manifest';

/** Register the `cull` command (SPEC §7): negative selection — kill variants or whole lineages. */
export function registerCullCommand(program: Command): void {
  program
    .command('cull <nodes...>')
    .description('Cull variants (mark pruned). With --lineage, also kill their descendants.')
    .option(
      '--lineage',
      'Also cull every descendant whose whole ancestry is culled (kill the chain)',
    )
    .action(async (nodes: string[], options: { lineage?: boolean }) => {
      const cwd = process.cwd();
      const manifest = await loadManifest(cwd);
      if (manifest === null) {
        console.error('No Tiraz run found here (.tiraz/manifest.json is missing).');
        process.exitCode = 1;
        return;
      }
      try {
        const { manifest: updated, culled } = cull(manifest, nodes, {
          ...(options.lineage === true ? { cascade: true } : {}),
        });
        await saveManifest(cwd, updated);
        console.log(
          culled.length === 0
            ? 'Nothing to cull (already pruned).'
            : `Culled ${String(culled.length)} variant(s): ${culled.join(', ')}`,
        );
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
