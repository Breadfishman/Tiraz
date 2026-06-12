import { Command } from 'commander';
import { describeError } from './core/config';
import { registerAdoptCommand } from './cli/adopt';
import { registerBreedCommand } from './cli/breed';
import { registerCompareCommand } from './cli/compare';
import { registerCullCommand } from './cli/cull';
import { registerDashboardCommand } from './cli/dashboard';
import { registerDiffCommand } from './cli/diff';
import { registerExportCommand } from './cli/export';
import { registerGenCommand } from './cli/gen';
import { registerInitCommand } from './cli/init';
import { registerPromoteCommand } from './cli/promote';
import { registerRecombineCommand } from './cli/recombine';
import { registerReviewCommand } from './cli/review';
import { registerScoreCommand } from './cli/score';
import { registerSelectCommand } from './cli/select';
import { registerSkillsCommand } from './cli/skills';
import { registerSnapshotCommand } from './cli/snapshot';
import { registerSourcesCommand } from './cli/sources';
import { registerTreeCommands } from './cli/tree';

/** Kept in sync with package.json's `version` field. */
const VERSION = '0.1.0';

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
  registerSourcesCommand(program);
  registerTreeCommands(program);
  registerSelectCommand(program);
  registerCullCommand(program);
  registerDiffCommand(program);
  registerPromoteCommand(program);
  registerInitCommand(program);
  registerExportCommand(program);
  registerAdoptCommand(program);
  registerReviewCommand(program);
  registerGenCommand(program);
  registerScoreCommand(program);
  registerBreedCommand(program);
  registerRecombineCommand(program);
  registerCompareCommand(program);
  registerDashboardCommand(program);
  registerSnapshotCommand(program);
  return program;
}

// Best-effort: load a local `.env` from the working directory so keys placed there (e.g.
// TWENTY_FIRST_API_KEY for 21st.dev fetching, ANTHROPIC_API_KEY for the vision judge) reach
// process.env. Node 22's built-in `loadEnvFile` throws when the file is absent — that is fine, env
// vars then come from the shell instead.
try {
  process.loadEnvFile();
} catch {
  // No readable `.env` in cwd — rely on the ambient environment.
}

try {
  await buildProgram().parseAsync();
} catch (err) {
  console.error(describeError(err));
  process.exitCode = 1;
}
