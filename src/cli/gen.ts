import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { describeError } from '../core/config';
import type { Direction } from '../core/directions';
import { parseAuthoredDirections } from '../core/directions';
import type { HarnessKind } from '../core/detect';
import { generateGeneration } from '../core/search';
import { liveDeps } from './live';

const HARNESSES: readonly HarnessKind[] = ['storybook', 'ladle', 'histoire', 'scratch', 'app'];

interface GenCliOptions {
  brief: string;
  count?: string;
  directions?: string;
  target?: string;
  harness?: string;
  from?: string;
}

/** Register the `gen` command (SPEC §5/§7): produce a generation of variants (live agent + renderer). */
export function registerGenCommand(program: Command): void {
  program
    .command('gen')
    .description('Generate a round of variants (drives the coding agent + live renderer).')
    .requiredOption('-b, --brief <text>', 'The UI brief / section spec to implement')
    .option(
      '-c, --count <n>',
      'Variants to produce this round (default 3, or one per --directions entry)',
    )
    .option(
      '--directions <file>',
      'JSON file of hand-authored directions ([{"ethos", "signature"?, "type"?, ...}]) used instead of the planner',
    )
    .option(
      '-t, --target <target>',
      'Scope: component:<path> | route:</path> | story:<id> | <path>',
    )
    .option(
      '--harness <kind>',
      `Render surface (${HARNESSES.join(' | ')}); auto-detected otherwise`,
    )
    .option(
      '--from <node>',
      "Multi-page: extend this node's approved design to a new page (--target), based on its branch",
    )
    .action(async (options: GenCliOptions) => {
      const cwd = process.cwd();
      let directions: Direction[] | undefined;
      if (options.directions !== undefined) {
        try {
          directions = parseAuthoredDirections(await readFile(options.directions, 'utf8'));
        } catch (err) {
          console.error(describeError(err));
          process.exitCode = 1;
          return;
        }
      }
      const count =
        options.count !== undefined
          ? Number.parseInt(options.count, 10)
          : (directions?.length ?? 3);
      if (!Number.isInteger(count) || count < 1) {
        console.error(`--count must be a positive integer (got "${options.count ?? ''}").`);
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
            ...(options.from !== undefined ? { from: options.from } : {}),
            ...(directions !== undefined ? { directions } : {}),
          },
          await liveDeps(cwd),
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
