import type { Command } from 'commander';
import { ClaudeCodeAgent } from '../core/agent';
import { describeError } from '../core/config';
import type { HarnessKind } from '../core/detect';
import { createPlaywrightRenderer } from '../core/playwright-io';
import { generateGeneration } from '../core/search';
import { bundledSkillsDir } from './bundled';

const HARNESSES: readonly HarnessKind[] = ['storybook', 'ladle', 'histoire', 'scratch', 'app'];

interface GenCliOptions {
  brief: string;
  count: string;
  target?: string;
  harness?: string;
}

/** Register the `gen` command (SPEC §5/§7): produce a generation of variants (live agent + renderer). */
export function registerGenCommand(program: Command): void {
  program
    .command('gen')
    .description('Generate a round of variants (drives the coding agent + live renderer).')
    .requiredOption('-b, --brief <text>', 'The UI brief / section spec to implement')
    .option('-c, --count <n>', 'Variants to produce this round', '3')
    .option(
      '-t, --target <target>',
      'Scope: component:<path> | route:</path> | story:<id> | <path>',
    )
    .option(
      '--harness <kind>',
      `Render surface (${HARNESSES.join(' | ')}); auto-detected otherwise`,
    )
    .action(async (options: GenCliOptions) => {
      const cwd = process.cwd();
      const count = Number.parseInt(options.count, 10);
      if (!Number.isInteger(count) || count < 1) {
        console.error(`--count must be a positive integer (got "${options.count}").`);
        process.exitCode = 1;
        return;
      }
      if (options.harness !== undefined && !HARNESSES.includes(options.harness as HarnessKind)) {
        console.error(`Unknown harness: "${options.harness}". Use: ${HARNESSES.join(' | ')}`);
        process.exitCode = 1;
        return;
      }

      try {
        const nodes = await generateGeneration(
          {
            cwd,
            brief: options.brief,
            count,
            ...(options.target !== undefined ? { target: options.target } : {}),
            ...(options.harness !== undefined ? { harness: options.harness as HarnessKind } : {}),
          },
          {
            agent: new ClaudeCodeAgent(),
            renderer: createPlaywrightRenderer(),
            skillsSourceDir: bundledSkillsDir(),
          },
        );
        console.log(`Generated ${String(nodes.length)} variant(s):`);
        for (const node of nodes) {
          console.log(`  ${node.genome.id}  →  ${node.renderUrl ?? '(no render)'}`);
        }
        console.log('\nNext: `tiraz score` to rank them, then `tiraz tree` to inspect.');
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
