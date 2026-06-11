import { spawn } from 'node:child_process';
import type { DesignSystem } from './ds-adherence';
import type { Genome } from './genome';
import { signaturesFor } from './sources';
import { tasteBarSection } from './taste-rubric';

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

/** Summarize a repo's design system into prompt lines (SPEC §3/§9) — empty if there's nothing. */
function designSystemSection(system: DesignSystem | undefined): string[] {
  if (system === undefined) return [];
  const categories = Object.entries(system.tokens).filter(([, vals]) => vals.length > 0);
  if (categories.length === 0 && system.components.length === 0) return [];

  const lines = [
    '## Design system — build WITHIN it (do not hardcode)',
    'This repo has a real design system. Use its tokens / utility classes and existing components.',
    'Raw off-system literals (hex/rgb/hsl colours, px/rem sizes, ad-hoc fonts) are SCORED AGAINST you',
    'and are the #1 reason output reads as generic AI work. Prefer tokens over literal values.',
    'Do NOT reference external image/font URLs or asset paths that may 404 — use inline SVG, CSS, or',
    'the existing public assets so every feature actually renders.',
  ];
  for (const [category, vals] of categories) {
    lines.push(`- ${category}: ${vals.slice(0, 8).join(', ')}`);
  }
  if (system.components.length > 0) {
    lines.push(`- components: ${system.components.slice(0, 12).join(', ')}`);
  }
  lines.push('');
  return lines;
}

/**
 * Compose the agent prompt from a genome + its resolved active skill ids (SPEC §8): brief,
 * target scope, the repo's design system (§3/§9), active skills, dials, commands, recombination
 * instructions, permitted Tier-2 sources, and the available capability libraries (§10). Pure and
 * deterministic — absent inputs simply produce no section.
 */
export function composePrompt(
  genome: Genome,
  activeSkillIds: string[],
  capabilities: string[] = [],
  designSystem?: DesignSystem,
  directive?: string,
  fetched?: { source: string; item: string }[],
): string {
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

  // The shared taste bar, high in the prompt: the agent builds against the same rubric the judge
  // grades on (see taste-rubric.ts) — the main lever against output that reads as AI-slop.
  lines.push(...tasteBarSection());

  if (genome.parents.length > 0) {
    lines.push(
      '## Refine — do not restart',
      `This worktree already contains a parent implementation (${genome.parents.join(', ')}). Improve`,
      'it in the direction of the parameters/commands below; keep what already works rather than',
      'rebuilding from scratch.',
      '',
    );
  }

  // A human's directed-breed instruction (the dashboard "what to improve" box) — the most specific,
  // highest-priority signal for this child. One-shot: it shapes this variant, not its descendants.
  if (directive !== undefined && directive.trim() !== '') {
    lines.push(
      '## Requested changes — do these specifically',
      directive.trim(),
      'Make these the focus of your edits; preserve everything else that already works.',
      '',
    );
  }

  lines.push(...designSystemSection(designSystem));

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

  // Real components fetched into this worktree get the COMPOSE section (import + restyle the real
  // code). This is independent of `genome.sources` because bundled sources (e.g. Magic UI) are
  // fetched too without appearing in the genome's Tier-2 list.
  const fetchedComponents = fetched ?? [];
  if (fetchedComponents.length > 0) {
    lines.push(
      '## Real components installed — compose, do not reimplement',
      'These are PRODUCTION components from your permitted sources, ALREADY installed in this',
      'worktree (find them under the `components/` directory). IMPORT and COMPOSE them into an',
      'original layout, and RESTYLE them through the design system’s tokens — do NOT rebuild them',
      'from scratch and do NOT leave them as their stock demo look.',
    );
    for (const { source, item } of fetchedComponents) {
      lines.push(`- ${source}/${item}`);
    }
    lines.push('');
  }

  if (genome.sources && genome.sources.length > 0) {
    // Sources that did NOT get a fetched item fall back to the signatures section — exactly today's
    // behaviour, so install mode degrades gracefully per source.
    const fetchedSourceIds = new Set(fetchedComponents.map((f) => f.source));
    const signatureFallback = signaturesFor(genome.sources).filter(
      ({ id }) => !fetchedSourceIds.has(id),
    );
    if (signatureFallback.length > 0) {
      lines.push(
        '## Blend distinctively — do not copy one library (anti-slop)',
        'Draw inspiration from these sources, each known for signature effects. BLEND elements from',
        "several into one cohesive, original composition — never replicate a single library's look",
        'wholesale (that only swaps one generic style for another). The result must not be mistakable',
        "for any one library's demo. Style everything through the design system's tokens.",
      );
      for (const { id, signatures } of signatureFallback) {
        lines.push(`- ${id}: ${signatures.join(', ')}`);
      }
      lines.push('');
    }
  }

  if (capabilities.length > 0) {
    lines.push(
      '## Available capability libraries',
      `Installed and available for animation / 3D / video: ${capabilities.join(', ')}. Use them where they raise craft, not by default.`,
      '',
    );
  }

  lines.push(`Variation seed: ${String(genome.seed)} — make distinctive choices for this seed.`);
  return lines.join('\n');
}

/**
 * Compose the self-critique-and-revise prompt for the optional second generation pass (SPEC §9):
 * the agent has already built + committed this component in the worktree; it now critically reviews
 * its own rendered output against the shared taste bar and fixes ONLY the worst slop tells, without
 * rebuilding. Injects the same `tasteBarSection()` rubric the judge grades on. Pure and
 * deterministic — mentioning the screenshot only when a path is supplied.
 */
export function composeCritiquePrompt(genome: Genome, screenshotPath?: string): string {
  const lines: string[] = [
    '# Tiraz self-critique pass',
    '',
    'You ALREADY built this component for the brief below and committed it in this worktree. Do NOT',
    'rebuild it and do NOT restart from scratch. Your job now is a focused, critical self-review.',
    '',
    '## Brief',
    genome.brief,
    '',
  ];

  if (screenshotPath !== undefined && screenshotPath.trim() !== '') {
    lines.push(
      '## Your rendered output',
      `A screenshot of your current rendered work is at: ${screenshotPath}`,
      'Inspect it to see how the work actually reads, then judge it against the taste bar below.',
      '',
    );
  }

  lines.push(...tasteBarSection());

  lines.push(
    '## What to do',
    'Critically self-review your committed work against the taste bar above. Identify the 2-3 WORST',
    'slop tells actually present in it, then fix ONLY those — preserving the overall direction and',
    'everything that already works. Targeted edits, not a rebuild. If something already clears the',
    'bar, leave it alone.',
    '',
    `Variation seed: ${String(genome.seed)} — keep this variant's distinctive identity.`,
  );
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
  /**
   * Headless permission mode. Defaults to `acceptEdits` so the agent actually applies file edits in
   * its (isolated) variant worktree without a TTY prompt — `-p` alone leaves edits unapproved and
   * the variant comes back unchanged. Use `bypassPermissions` if a variant must also run commands.
   */
  permissionMode?: string;
}

/** {@link Agent} backed by Claude Code in headless/print mode (`claude -p`). */
export class ClaudeCodeAgent implements Agent {
  private readonly runner: CommandRunner;
  private readonly binary: string;
  private readonly permissionMode: string;

  constructor(opts: ClaudeCodeAgentOptions = {}) {
    this.runner = opts.runner ?? spawnRunner;
    this.binary = opts.binary ?? 'claude';
    this.permissionMode = opts.permissionMode ?? 'acceptEdits';
  }

  /** Build the headless CLI args. Kept separate so it can be asserted without spawning. */
  buildArgs(opts: AgentRunOptions): string[] {
    return ['-p', '--permission-mode', this.permissionMode, opts.prompt];
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
