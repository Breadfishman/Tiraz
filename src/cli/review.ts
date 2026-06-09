import type { Command } from 'commander';
import { ClaudeCodeAgent } from '../core/agent';
import { describeError } from '../core/config';
import { reviewVariant } from '../core/review';

/** Register the `review` command (SPEC §5/§9): Emil's motion/polish review of a variant. */
export function registerReviewCommand(program: Command): void {
  program
    .command('review [node]')
    .description(
      "Review a variant's motion + polish using Emil Kowalski's skill (installed on demand).",
    )
    .action(async (node: string | undefined) => {
      try {
        const result = await reviewVariant(
          { cwd: process.cwd(), ...(node !== undefined ? { nodeId: node } : {}) },
          { agent: new ClaudeCodeAgent() },
        );
        console.log(`Review of ${result.nodeId}:\n`);
        console.log(result.review);
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
