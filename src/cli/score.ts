import type { Command } from 'commander';
import { createVisionJudge } from '../core/anthropic-io';
import { createClaudeCliJudge } from '../core/claude-judge-io';
import { describeError, loadConfig } from '../core/config';
import { collectDesignSystem, collectUsedValues } from '../core/ds-collect-io';
import { lint } from '../core/lint';
import type { LintResult } from '../core/lint';
import type { PairwiseJudge } from '../core/taste-judge';
import { loadManifest } from '../core/manifest';
import { runScore } from '../core/score';

interface ScoreCliOptions {
  generation?: string;
  judge?: string;
  /** Commander sets `lint: false` when `--no-lint` is passed. */
  lint?: boolean;
}

const PASS_LINT: LintResult = { passed: true, score: 100, violations: [] };

/** Register the `score` command (SPEC §5/§9): score a generation with the full three-term fitness. */
export function registerScoreCommand(program: Command): void {
  program
    .command('score')
    .description('Score a generation: lint floor + DS-adherence + the vision taste judge.')
    .option('-g, --generation <n>', 'Generation index to score (default: the latest)')
    .option('-j, --judge <kind>', 'Taste judge backend: claude-cli | api (default: auto-detect)')
    .option('--no-lint', 'Skip the lint floor (score DS-adherence + taste only)')
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

        // Auto-pick the judge: the Anthropic API when a key is set, else the local `claude` CLI.
        const judgeKind =
          options.judge ?? (process.env.ANTHROPIC_API_KEY !== undefined ? 'api' : 'claude-cli');
        const judge: PairwiseJudge =
          judgeKind === 'api' ? createVisionJudge() : createClaudeCliJudge();
        console.log(`Scoring generation ${String(generationIndex)} with the ${judgeKind} judge…`);

        const designSystem = await collectDesignSystem(cwd);
        const scored = await runScore(cwd, generationIndex, {
          lint:
            options.lint === false
              ? () => Promise.resolve(PASS_LINT)
              : (node) =>
                  lint({
                    target: node.renderUrl ?? node.worktree,
                    threshold: config.lintThreshold,
                    fast: true,
                    cwd,
                  }),
          designSystem,
          collectUsedValues,
          judge,
          weights: config.fitness.weights,
        });

        console.log(`\nScored generation ${String(generationIndex)}:`);
        for (const id of scored.generations[generationIndex] ?? []) {
          const node = scored.nodes[id];
          const f = node?.fitness;
          if (f === undefined || f === null) continue;
          const floor = options.lint === false ? 'skipped' : f.lintFloor.passed ? 'pass' : 'FAIL';
          console.log(
            `  ${id}  composite ${String(f.composite)}  (lint ${floor}, ds ${String(f.dsAdherence.score)}, taste #${String(f.taste.rank)})`,
          );
          const rationale = f.taste.panel[0]?.rationale;
          if (rationale !== undefined && rationale !== '') {
            console.log(`       ↳ ${rationale.slice(0, 140)}`);
          }
        }
        console.log(
          '\nNext: `tiraz tree` / `tiraz dashboard` to inspect, then `tiraz select <id…>`.',
        );
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
