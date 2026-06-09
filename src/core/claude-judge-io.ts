/**
 * A taste-judge backend that reuses the authenticated `claude` CLI instead of an `ANTHROPIC_API_KEY`
 * (SPEC §9). It reuses the tested `buildJudgePrompt` / `parseVerdict` from `vision-judge.ts` — only
 * the completion changes: instead of the Anthropic SDK reading the images, we hand `claude -p` the
 * two screenshot paths and let it read them with its own tools. Coverage-excluded I/O glue.
 *
 * Caveat vs the API panel: the model is whatever `claude` is configured to, so the panel varies by
 * lens but not by model.
 */

import { spawnRunner } from './agent';
import type { CommandRunner } from './agent';
import { VisionPairwiseJudge } from './vision-judge';
import type { VisionComplete } from './vision-judge';

/** Build a {@link VisionComplete} that drives `claude -p` (reads the screenshots via the CLI). */
export function claudeCliVisionComplete(runner: CommandRunner = spawnRunner): VisionComplete {
  return async (req) => {
    const prompt = [
      req.system,
      '',
      req.prompt,
      '',
      'The two options are local PNG screenshots. Read BOTH image files now using your file tools,',
      'then reply with ONLY the JSON verdict (no prose).',
      `- Option A: ${req.imagePaths[0]}`,
      `- Option B: ${req.imagePaths[1]}`,
    ].join('\n');
    const result = await runner('claude', ['-p', prompt], { cwd: process.cwd() });
    return result.stdout.trim() !== '' ? result.stdout : result.stderr;
  };
}

/** A {@link VisionPairwiseJudge} backed by the local `claude` CLI (no API key needed). */
export function createClaudeCliJudge(runner: CommandRunner = spawnRunner): VisionPairwiseJudge {
  return new VisionPairwiseJudge(claudeCliVisionComplete(runner));
}
