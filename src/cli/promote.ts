import type { Command } from 'commander';
import { describeError } from '../core/config';
import { promoteVariant } from '../core/promote';

/** Register the `promote` command (SPEC §5): ship the winning variant. */
export function registerPromoteCommand(program: Command): void {
  program
    .command('promote <node>')
    .description('Promote the winning variant: greenfield merges to base; integration opens a PR.')
    .option('-b, --base <branch>', 'Branch to merge into / open the PR against', 'main')
    .action(async (node: string, options: { base: string }) => {
      try {
        const result = await promoteVariant({
          cwd: process.cwd(),
          nodeId: node,
          base: options.base,
        });
        if (result.mode === 'greenfield') {
          console.log(`Merged ${result.branch} into ${result.base} and promoted ${result.nodeId}.`);
        } else {
          console.log(
            `Opened PR for ${result.nodeId}${result.prUrl !== undefined ? `: ${result.prUrl}` : ''}`,
          );
        }
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
