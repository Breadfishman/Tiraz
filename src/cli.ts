import { Command } from 'commander';
import { describeError } from './core/config';
import { registerSkillsCommand } from './cli/skills';

/** Kept in sync with package.json's `version` field. */
const VERSION = '0.0.0';

/**
 * Build the root `tiraz` command. Subcommands are registered here as each phase
 * lands; Phase 0 wires the program shell plus the `skills` command group.
 */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name('tiraz')
    .description('A design-taste engine for AI coding agents.')
    .version(VERSION, '-v, --version');
  registerSkillsCommand(program);
  return program;
}

try {
  await buildProgram().parseAsync();
} catch (err) {
  console.error(describeError(err));
  process.exitCode = 1;
}
