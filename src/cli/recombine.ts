import type { Command } from 'commander';
import { ClaudeCodeAgent } from '../core/agent';
import { describeError } from '../core/config';
import type { HarnessKind } from '../core/detect';
import type { GraftSpec } from '../core/genome';
import { createPlaywrightRenderer } from '../core/playwright-io';
import { recombineVariant } from '../core/search';
import { bundledSkillsDir } from './bundled';

const HARNESSES: readonly HarnessKind[] = ['storybook', 'ladle', 'histoire', 'scratch', 'app'];
const AXES: readonly NonNullable<GraftSpec['axes']>[number][] = [
  'typography',
  'palette',
  'motion',
  'layout',
  'spacing',
];

interface RecombineCliOptions {
  graft: string;
  axes?: string;
  harness?: string;
}

/** Register the `recombine` command (SPEC §5/§7): human-directed two-parent graft. */
export function registerRecombineCommand(program: Command): void {
  program
    .command('recombine <parentA> <parentB>')
    .description('Graft two survivors into one child via a natural-language instruction.')
    .requiredOption('-g, --graft <text>', 'The graft instruction, e.g. "A\'s type + B\'s motion"')
    .option('--axes <list>', `Comma-separated axes to graft (${AXES.join(', ')})`)
    .option(
      '--harness <kind>',
      `Render surface (${HARNESSES.join(' | ')}); auto-detected otherwise`,
    )
    .action(async (parentA: string, parentB: string, options: RecombineCliOptions) => {
      const cwd = process.cwd();

      let axes: GraftSpec['axes'] | undefined;
      if (options.axes !== undefined) {
        const requested = options.axes
          .split(',')
          .map((a) => a.trim())
          .filter((a) => a !== '');
        const invalid = requested.filter((a) => !(AXES as readonly string[]).includes(a));
        if (invalid.length > 0) {
          console.error(`Unknown axes: ${invalid.join(', ')}. Use: ${AXES.join(', ')}`);
          process.exitCode = 1;
          return;
        }
        axes = requested as GraftSpec['axes'];
      }
      if (options.harness !== undefined && !HARNESSES.includes(options.harness as HarnessKind)) {
        console.error(`Unknown harness: "${options.harness}". Use: ${HARNESSES.join(' | ')}`);
        process.exitCode = 1;
        return;
      }

      try {
        const node = await recombineVariant(
          {
            cwd,
            parentA,
            parentB,
            instructions: options.graft,
            ...(axes !== undefined ? { axes } : {}),
            ...(options.harness !== undefined ? { harness: options.harness as HarnessKind } : {}),
          },
          {
            agent: new ClaudeCodeAgent(),
            renderer: createPlaywrightRenderer(),
            skillsSourceDir: bundledSkillsDir(),
          },
        );
        console.log(`Recombined ${node.genome.id} ← ${parentA} + ${parentB}`);
        console.log(`  graft: ${node.genome.graft?.instructions ?? ''}`);
        console.log('\nNext: `tiraz score` to rank it against the field.');
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
