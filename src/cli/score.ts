import type { Command } from 'commander';
import { createVisionJudge } from '../core/anthropic-io';
import { describeError, loadConfig } from '../core/config';
import { collectDesignSystem, collectUsedValues } from '../core/ds-collect-io';
import { lint } from '../core/lint';
import { loadManifest } from '../core/manifest';
import { runScore } from '../core/score';

interface ScoreCliOptions {
  generation?: string;
}

/** Register the `score` command (SPEC §5/§9): score a generation with the full three-term fitness. */
export function registerScoreCommand(program: Command): void {
  program
    .command('score')
    .description('Score a generation: lint floor + DS-adherence + the vision taste judge.')
    .option('-g, --generation <n>', 'Generation index to score (default: the latest)')
    .action(async (options: ScoreCliOptions) => {
      const cwd = process.cwd();
      try {
        const { config } = await loadConfig(cwd);
        const manifest = await loadManifest(cwd);
        if (manifest === null || manifest.generations.length === 0) {
          console.error('No Tiraz run found here (run `tiraz gen` first).');
          process.exitCode = 1;
          return;
        }

        const latest = manifest.generations.length - 1;
        const generationIndex =
          options.generation === undefined ? latest : Number.parseInt(options.generation, 10);
        if (
          !Number.isInteger(generationIndex) ||
          generationIndex < 0 ||
          generationIndex >= manifest.generations.length
        ) {
          console.error(
            `--generation must be 0..${String(manifest.generations.length - 1)} (got "${options.generation ?? ''}").`,
          );
          process.exitCode = 1;
          return;
        }

        const designSystem = await collectDesignSystem(cwd);
        const scored = await runScore(cwd, generationIndex, {
          lint: (node) =>
            lint({
              target: node.renderUrl ?? node.worktree,
              threshold: config.lintThreshold,
              fast: true,
              cwd,
            }),
          designSystem,
          collectUsedValues,
          judge: createVisionJudge(),
          weights: config.fitness.weights,
        });

        console.log(`Scored generation ${String(generationIndex)}:`);
        for (const id of scored.generations[generationIndex] ?? []) {
          const f = scored.nodes[id]?.fitness;
          if (f === undefined || f === null) continue;
          const floor = f.lintFloor.passed ? 'pass' : 'FAIL';
          console.log(
            `  ${id}  composite ${String(f.composite)}  (lint ${floor}, ds ${String(f.dsAdherence.score)}, taste #${String(f.taste.rank)})`,
          );
        }
        console.log('\nNext: `tiraz tree` to inspect, then `tiraz select <id…>`.');
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
