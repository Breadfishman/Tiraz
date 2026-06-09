import { spawn } from 'node:child_process';
import type { Genome } from './genome';

export interface AgentRunOptions {
  /** Working directory (the variant's worktree). */
  cwd: string;
  /** The composed prompt (see {@link composePrompt}). */
  prompt: string;
  /** Active skill ids resolved for this variant (installed under `<cwd>/.claude/skills`). */
  skills: string[];
  /** Tier-2 component sources the agent may draw from (SPEC §12). */
  sources?: string[];
}

export interface AgentResult {
  ok: boolean;
  exitCode: number;
  output: string;
}

/**
 * The coding-agent backend (SPEC §8). Deliberately swappable so Claude Code, Cursor/Codex,
 * or 21st.dev "Magic" can be plugged in without touching the search engine.
 */
export interface Agent {
  run(opts: AgentRunOptions): Promise<AgentResult>;
}

/**
 * Compose the agent prompt from a genome + its resolved active skill ids (SPEC §8): brief,
 * target scope, active skills, dials, commands, recombination instructions, and permitted
 * Tier-2 sources. Pure and deterministic — absent genome fields produce no section.
 */
export function composePrompt(genome: Genome, activeSkillIds: string[]): string {
  const lines: string[] = [
    '# Tiraz variant brief',
    '',
    'Implement the following UI brief with exceptional, non-generic design taste.',
    '',
    '## Brief',
    genome.brief,
    '',
  ];

  if (genome.target !== undefined) {
    lines.push('## Target', `Scope your work to: ${genome.target}`, '');
  }

  lines.push(
    '## Active design skills',
    'These skills are installed under .claude/skills and MUST guide your work:',
    ...activeSkillIds.map((id) => `- ${id}`),
    '',
    '## Design parameters (dials, 1–10)',
    `- variance (distance from conventional): ${String(genome.dials.variance)}`,
    `- motion (animation intensity): ${String(genome.dials.motion)}`,
    `- density (information density): ${String(genome.dials.density)}`,
    '',
  );

  if (genome.commands.length > 0) {
    lines.push('## Apply these commands', ...genome.commands.map((c) => `- ${c}`), '');
  }

  if (genome.graft) {
    lines.push('## Recombination (human-directed)', genome.graft.instructions);
    if (genome.graft.axes && genome.graft.axes.length > 0) {
      lines.push(`Axes to graft: ${genome.graft.axes.join(', ')}`);
    }
    lines.push('');
  }

  if (genome.sources && genome.sources.length > 0) {
    lines.push(
      '## Permitted component sources (use sparingly)',
      `You may draw from: ${genome.sources.join(', ')}. Prefer the design system first.`,
      '',
    );
  }

  lines.push(`Variation seed: ${String(genome.seed)} — make distinctive choices for this seed.`);
  return lines.join('\n');
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs a child process and resolves with its exit code and captured output. */
export type CommandRunner = (
  command: string,
  args: string[],
  opts: { cwd: string },
) => Promise<CommandResult>;

/** Default {@link CommandRunner} backed by `child_process.spawn`. */
export const spawnRunner: CommandRunner = (command, args, opts) =>
  new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, { cwd: opts.cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
  });

export interface ClaudeCodeAgentOptions {
  /** Injectable for testing; defaults to {@link spawnRunner}. */
  runner?: CommandRunner;
  /** The Claude Code binary; defaults to `claude`. */
  binary?: string;
}

/** {@link Agent} backed by Claude Code in headless/print mode (`claude -p`). */
export class ClaudeCodeAgent implements Agent {
  private readonly runner: CommandRunner;
  private readonly binary: string;

  constructor(opts: ClaudeCodeAgentOptions = {}) {
    this.runner = opts.runner ?? spawnRunner;
    this.binary = opts.binary ?? 'claude';
  }

  /** Build the headless CLI args. Kept separate so it can be asserted without spawning. */
  buildArgs(opts: AgentRunOptions): string[] {
    return ['-p', opts.prompt];
  }

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const result = await this.runner(this.binary, this.buildArgs(opts), { cwd: opts.cwd });
    return {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      output: result.stdout !== '' ? result.stdout : result.stderr,
    };
  }
}

export interface MagicAgentOptions {
  /** Injectable for testing; defaults to {@link spawnRunner}. */
  runner?: CommandRunner;
  /** The 21st.dev Magic CLI invoked via npx; defaults to `npx`. */
  binary?: string;
  /** Env var holding the opt-in 21st.dev API key; defaults to `TWENTY_FIRST_API_KEY`. */
  apiKeyEnv?: string;
  /** Process env (injectable for tests); defaults to `process.env`. The spawned CLI inherits it. */
  env?: Record<string, string | undefined>;
}

/**
 * {@link Agent} backed by 21st.dev "Magic" (SPEC §8 — an alternate, opt-in backend). Magic is a
 * hosted, API-keyed service, so this requires `TWENTY_FIRST_API_KEY` in the environment (the spawned
 * CLI inherits it). The exact Magic CLI invocation is provisional — the live wiring is deferred to an
 * environment with a key; the backend is here so it can be swapped in behind the `Agent` interface.
 */
export class MagicAgent implements Agent {
  private readonly runner: CommandRunner;
  private readonly binary: string;
  private readonly apiKeyEnv: string;
  private readonly env: Record<string, string | undefined>;

  constructor(opts: MagicAgentOptions = {}) {
    this.runner = opts.runner ?? spawnRunner;
    this.binary = opts.binary ?? 'npx';
    this.apiKeyEnv = opts.apiKeyEnv ?? 'TWENTY_FIRST_API_KEY';
    this.env = opts.env ?? process.env;
  }

  /** Whether the opt-in API key is present (Magic is a hosted service). */
  hasApiKey(): boolean {
    const key = this.env[this.apiKeyEnv];
    return key !== undefined && key.trim() !== '';
  }

  /** Build the Magic CLI args. Kept separate so it can be asserted without spawning. */
  buildArgs(opts: AgentRunOptions): string[] {
    return ['-y', '@21st-dev/magic@latest', '--prompt', opts.prompt];
  }

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    if (!this.hasApiKey()) {
      return {
        ok: false,
        exitCode: 1,
        output: `21st.dev Magic requires an API key — set ${this.apiKeyEnv} (see 21st.dev).`,
      };
    }
    const result = await this.runner(this.binary, this.buildArgs(opts), { cwd: opts.cwd });
    return {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      output: result.stdout !== '' ? result.stdout : result.stderr,
    };
  }
}
