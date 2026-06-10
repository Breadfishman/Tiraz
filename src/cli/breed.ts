import type { Command } from 'commander';
import { ClaudeCodeAgent } from '../core/agent';
import { describeError } from '../core/config';
import type { HarnessKind } from '../core/detect';
import { createPlaywrightRenderer } from '../core/playwright-io';
import { breedGeneration } from '../core/search';
import { bundledSkillsDir } from './bundled';

const HARNESSES: readonly HarnessKind[] = ['storybook', 'ladle', 'histoire', 'scratch', 'app'];

interface BreedCliOptions {
  factor?: string;
  harness?: string;
  note?: string;
}

/** Register the `breed` command (SPEC §5/§7): mutate survivors into the next generation. */
export function registerBreedCommand(program: Command): void {
  program
    .command('breed <survivors...>')
    .description('Breed the next generation by mutating each survivor (drives agent + renderer).')
    .option('-f, --factor <n>', 'Children per survivor (default: config.beam.factor)')
    .option('-m, --note <text>', 'Directed breeding: what to improve (passed to the agent)')
    .option(
      '--harness <kind>',
      `Render surface (${HARNESSES.join(' | ')}); auto-detected otherwise`,
    )
    .action(async (survivors: string[], options: BreedCliOptions) => {
      const cwd = process.cwd();
      let factor: number | undefined;
      if (options.factor !== undefined) {
        factor = Number.parseInt(options.factor, 10);
        if (!Number.isInteger(factor) || factor < 1) {
          console.error(`--factor must be a positive integer (got "${options.factor}").`);
          process.exitCode = 1;
          return;
        }
      }
      if (options.harness !== undefined && !HARNESSES.includes(options.harness as HarnessKind)) {
        console.error(`Unknown harness: "${options.harness}". Use: ${HARNESSES.join(' | ')}`);
        process.exitCode = 1;
        return;
      }

      try {
        const nodes = await breedGeneration(
          {
            cwd,
            survivors,
            ...(factor !== undefined ? { factor } : {}),
            ...(options.harness !== undefined ? { harness: options.harness as HarnessKind } : {}),
            ...(options.note !== undefined ? { directive: options.note } : {}),
          },
          {
            agent: new ClaudeCodeAgent(),
            renderer: createPlaywrightRenderer(),
            skillsSourceDir: bundledSkillsDir(),
          },
        );
        console.log(`Bred ${String(nodes.length)} child variant(s):`);
        for (const node of nodes) {
          console.log(`  ${node.genome.id}  ←  ${node.genome.parents.join(', ')}`);
        }
        console.log('\nNext: `tiraz score` to rank the new generation.');
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
