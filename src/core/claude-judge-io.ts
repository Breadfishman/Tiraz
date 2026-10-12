/**
 * A taste-judge backend that reuses the authenticated `claude` CLI instead of an `ANTHROPIC_API_KEY`
 * (SPEC §9). It reuses the tested `buildRankPrompt` / `parseRanking` from `vision-judge.ts` — only the
 * completion changes: instead of the SDK sending the images, ONE `claude -p` session is handed every
 * screenshot path and reads them with its own Read tool. Coverage-excluded I/O glue.
 */

import { spawnRunner } from './agent';
import type { CommandRunner } from './agent';
import { VisionRankingJudge } from './vision-judge';
import type { VisionComplete } from './vision-judge';

/** Build a {@link VisionComplete} that drives one `claude -p` session to read + rank the screenshots. */
export function claudeCliVisionComplete(runner: CommandRunner = spawnRunner): VisionComplete {
  return async (req) => {
    const prompt = [
      req.system,
      '',
      req.prompt,
      '',
      'The options are local PNG screenshots. Read EVERY image file below with your Read tool (do',
      'nothing else), then reply with ONLY the JSON ranking (no prose).',
      ...req.imagePaths.map((file, i) => `- Option ${String(i + 1)}: ${file}`),
    ].join('\n');
    const args = [
      '-p',
      '--model',
      req.model,
      // One Read per image plus the answer; a small cap keeps a confused session from wandering.
      '--max-turns',
      String(req.imagePaths.length + 4),
      prompt,
    ];
    const result = await runner('claude', args, { cwd: process.cwd() });
    return result.stdout.trim() !== '' ? result.stdout : result.stderr;
  };
}

/** A {@link VisionRankingJudge} backed by the local `claude` CLI (no API key needed). */
export function createClaudeCliJudge(runner: CommandRunner = spawnRunner): VisionRankingJudge {
  return new VisionRankingJudge(claudeCliVisionComplete(runner));
}
