import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { renderCompareHtml } from '../core/compare';
import { describeError } from '../core/config';
import { loadManifest } from '../core/manifest';
import { openInBrowser } from './open';

/** Register the `compare` command: build a one-page gallery of all variants for human review. */
export function registerCompareCommand(program: Command): void {
  program
    .command('compare')
    .description('Build a single HTML gallery of all variants (screenshots + genomes) for review.')
    .option('-o, --out <file>', 'Output path (default: .tiraz/compare.html)')
    .option('--open', 'Open the gallery in your browser after writing it')
    .action(async (options: { out?: string; open?: boolean }) => {
      const cwd = process.cwd();
      try {
        const manifest = await loadManifest(cwd);
        if (manifest === null) {
          console.error('No Tiraz run found here (run `tiraz gen` first).');
          process.exitCode = 1;
          return;
        }
        const outPath = path.resolve(cwd, options.out ?? path.join('.tiraz', 'compare.html'));
        const html = renderCompareHtml(manifest, { outDir: path.dirname(outPath) });
        await writeFile(outPath, html, 'utf8');

        const count = Object.keys(manifest.nodes).length;
        console.log(`Wrote comparison gallery (${String(count)} variant(s)) → ${outPath}`);
        console.log(`Open it: file://${outPath}`);
        if (options.open === true) {
          openInBrowser(outPath);
        }
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
