import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { describeError, loadConfig } from '../core/config';
import type { ExportContext, ExportTarget } from '../core/export';
import { EXPORT_TARGETS, ExportError, exportArtifact } from '../core/export';
import { loadManifest } from '../core/manifest';
import { bundledSkillsDir } from './bundled';

interface ExportCliOptions {
  target: string;
  node?: string;
  out?: string;
  brief?: string;
}

function isExportTarget(value: string): value is ExportTarget {
  return (EXPORT_TARGETS as readonly string[]).includes(value);
}

/** Register the `export` command (SPEC §5/§12bis): emit handoff artifacts for external tools. */
export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Emit a handoff artifact for an external tool (stitch | v0 | claude-design).')
    .requiredOption('-t, --target <tool>', 'Target tool: stitch | v0 | claude-design')
    .option('-n, --node <id>', 'Source the design intent from a variant node in the manifest')
    .option('-b, --brief <text>', 'Brief to embed (overrides the node/config brief)')
    .option('-o, --out <file>', 'Write to this path instead of the default filename')
    .action(async (options: ExportCliOptions) => {
      const cwd = process.cwd();
      if (!isExportTarget(options.target)) {
        console.error(
          `Unknown export target: "${options.target}". Use: ${EXPORT_TARGETS.join(' | ')}`,
        );
        process.exitCode = 1;
        return;
      }

      try {
        const { config } = await loadConfig(cwd);
        const ctx: ExportContext = {
          brief: options.brief ?? '',
          dials: config.dials,
          primary: config.primary,
          overlay: config.overlay,
          framework: config.framework,
        };

        if (options.node !== undefined) {
          const manifest = await loadManifest(cwd);
          const node = manifest?.nodes[options.node];
          if (node === undefined) {
            console.error(`Variant ${options.node} not found in the manifest.`);
            process.exitCode = 1;
            return;
          }
          ctx.brief = options.brief ?? node.genome.brief;
          ctx.dials = node.genome.dials;
          ctx.primary = node.genome.primary;
          ctx.overlay = node.genome.overlay;
          if (node.genome.target !== undefined) {
            ctx.target = node.genome.target;
          }
        }

        if (options.target === 'stitch') {
          ctx.designTemplate = await readFile(
            path.join(bundledSkillsDir(), 'stitch-design-taste', 'DESIGN.md'),
            'utf8',
          );
        }

        const artifact = exportArtifact(options.target, ctx);
        const outPath =
          options.out !== undefined
            ? path.resolve(cwd, options.out)
            : path.join(cwd, artifact.filename);
        await writeFile(outPath, artifact.content, 'utf8');
        console.log(`Wrote ${options.target} artifact → ${outPath}`);
      } catch (err) {
        if (err instanceof ExportError) {
          console.error(err.message);
          process.exitCode = 1;
          return;
        }
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
