import type { Command } from 'commander';
import { adoptProject } from '../core/adopt';
import { describeError } from '../core/config';
import type { HarnessKind } from '../core/detect';

const HARNESSES: readonly HarnessKind[] = ['storybook', 'ladle', 'histoire', 'scratch', 'app'];

/** Register the `adopt` command (SPEC §3/§5): attach Tiraz to an existing repo. */
export function registerAdoptCommand(program: Command): void {
  program
    .command('adopt')
    .description(
      'Attach to an existing repo: detect the stack + harness, write integration config.',
    )
    .option('--harness <kind>', `Override the render harness (${HARNESSES.join(' | ')})`)
    .action(async (options: { harness?: string }) => {
      const cwd = process.cwd();
      if (options.harness !== undefined && !HARNESSES.includes(options.harness as HarnessKind)) {
        console.error(`Unknown harness: "${options.harness}". Use: ${HARNESSES.join(' | ')}`);
        process.exitCode = 1;
        return;
      }

      try {
        const result = await adoptProject({
          cwd,
          ...(options.harness !== undefined ? { harness: options.harness as HarnessKind } : {}),
        });
        console.log(`Adopted repo in integration mode → ${result.configPath}`);
        console.log(`  framework: ${result.framework}`);
        console.log(`  harness:   ${result.harness} (${result.harnessReason})`);
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
