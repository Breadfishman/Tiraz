import type { Command } from 'commander';
import { createVisionJudge } from '../core/anthropic-io';
import { createClaudeCliJudge } from '../core/claude-judge-io';
import { describeError, loadConfig } from '../core/config';
import { collectDesignSystem, collectUsedValues } from '../core/ds-collect-io';
import { brandBrief, brandFonts } from '../core/brand';
import { loadCreativeContext } from '../core/creative-context';
import { createVariantLinter, createVariantScanner } from '../core/lint';
import type { LintResult } from '../core/lint';
import type { RankingJudge } from '../core/taste-judge';
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
    .option('--no-lint', 'Skip the (free, local) lint pass entirely')
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
        const judge: RankingJudge =
          judgeKind === 'api' ? createVisionJudge() : createClaudeCliJudge();
        console.log(
          `Scoring generation ${String(generationIndex)} with the ${judgeKind} judge (${config.agent.judgeModel}, one call)…`,
        );

        const designSystem = await collectDesignSystem(cwd);
        const creative = await loadCreativeContext(cwd);
        const nearDupes: string[] = [];
        const scored = await runScore(cwd, generationIndex, {
          lint:
            options.lint === false
              ? () => Promise.resolve(PASS_LINT)
              : createVariantLinter({
                  cwd,
                  threshold: config.lintThreshold,
                  onSkip: (id, message) => {
                    console.warn(`  (lint skipped for ${id}: ${message.split('\n')[0] ?? ''})`);
                  },
                }),
          designSystem,
          collectUsedValues,
          judge,
          judgeModel: config.agent.judgeModel,
          weights: config.fitness.weights,
          lintGate: config.fitness.lintFloorRequired,
          scan: createVariantScanner({ cwd }),
          exemptFonts: creative.brand !== null ? brandFonts(creative.brand) : [],
          tellPenalty: config.fitness.tellPenalty,
          onNearDuplicates: (pairs) => {
            for (const p of pairs) {
              nearDupes.push(`${p.a} ≈ ${p.b} (${String(Math.round(p.similarity * 100))}% alike)`);
            }
          },
          brand: brandBrief(creative.brand),
          taste: creative.taste,
          referencePaths: creative.references,
        });

        console.log(`\nScored generation ${String(generationIndex)}:`);
        for (const id of scored.generations[generationIndex] ?? []) {
          const node = scored.nodes[id];
          const f = node?.fitness;
          if (f === undefined || f === null) continue;
          const issues = f.lintFloor.violations.length;
          const issueText = `${String(issues)} issue${issues === 1 ? '' : 's'}`;
          // Only call it a pass/FAIL when the floor actually gates; otherwise it's advisory.
          const floor =
            options.lint === false
              ? 'skipped'
              : config.fitness.lintFloorRequired
                ? `${f.lintFloor.passed ? 'pass' : 'FAIL'}${issues > 0 ? `, ${issueText}` : ''}`
                : issues > 0
                  ? `${issueText}, advisory`
                  : 'clean';
          console.log(
            `  ${id}  composite ${String(f.composite)}  (lint ${floor}, ds ${String(f.dsAdherence.score)}, taste #${String(f.taste.rank)})`,
          );
          if (f.originality !== undefined) {
            const tells = f.originality.tells.join(', ');
            console.log(
              `       originality ${String(f.originality.score)} (${tells === '' ? 'no AI-default tells' : tells})`,
            );
          }
          const rationale = f.taste.panel[0]?.rationale;
          if (rationale !== undefined && rationale !== '') {
            console.log(`       ↳ ${rationale.slice(0, 140)}`);
          }
        }
        if (nearDupes.length > 0) {
          console.log('\nNear-duplicates (same type/palette/habits; consider culling one):');
          for (const line of nearDupes) console.log(`  ${line}`);
        }
        if (creative.brand === null) {
          console.log(
            '\nTip: add a BRAND.md (`tiraz brand draft`) so variants grow out of your brand.',
          );
        }
        console.log(
          '\nNext: `tiraz tree` / `tiraz dashboard` to inspect, then `tiraz select <id…> --why "..."`.',
        );
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
