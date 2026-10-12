import path from 'node:path';
import type { Command } from 'commander';
import { spawnRunner } from '../core/agent';
import { brandFonts, loadBrand } from '../core/brand';
import { describeError } from '../core/config';
import { createVariantScanner } from '../core/lint';
import { loadManifest } from '../core/manifest';
import { detectTells, summarizeTells } from '../core/tells';

interface TellsCliOptions {
  worktree?: string;
  base?: string;
}

/**
 * Register `tells`: scan a variant's changed files for the AI house-style tells. Build agents run it
 * mid-session (uncommitted work included); humans can point it at a node id or a worktree.
 */
export function registerTellsCommand(program: Command): void {
  program
    .command('tells [node]')
    .description('Scan a variant for the second-order "AI look" (free, local).')
    .option('--worktree <dir>', 'Scan this worktree (default: the node’s, or the current dir)')
    .option('--base <sha>', 'Diff against this commit (default: the node’s base, else HEAD)')
    .action(async (nodeId: string | undefined, options: TellsCliOptions) => {
      const cwd = process.cwd();
      try {
        const manifest = nodeId !== undefined ? await loadManifest(cwd) : null;
        const node = nodeId !== undefined ? manifest?.nodes[nodeId] : undefined;
        if (nodeId !== undefined && node === undefined) {
          console.error(`Unknown node ${nodeId}.`);
          process.exitCode = 1;
          return;
        }
        const worktree = path.resolve(options.worktree ?? node?.worktree ?? cwd);
        let base = options.base ?? node?.baseCommit;
        if (base === undefined) {
          const head = await spawnRunner('git', ['rev-parse', 'HEAD'], { cwd: worktree });
          base = head.stdout.trim();
        }
        const scan = createVariantScanner({ cwd: worktree });
        const files = await scan({ worktree, baseCommit: base });
        // Brand fonts are exempt; BRAND.md is read from the worktree (else the repo root).
        const brand =
          (await loadBrand(worktree)) ??
          (await loadBrand(path.resolve(worktree, '..', '..', '..')));
        const report = detectTells(files, {
          exemptFonts: brand !== null ? brandFonts(brand) : [],
        });
        console.log(
          `Scanned ${String(files.length)} changed file(s). Originality ${summarizeTells(report)}`,
        );
        for (const finding of report.findings) {
          console.log(
            `  ✗ ${finding.label} (${String(finding.count)}× in ${finding.files.join(', ')})`,
          );
        }
        if (report.findings.length === 0)
          console.log('  ✓ none of the known AI house-style tells.');
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
