import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

/** Filename Tiraz looks for in the target project root. */
export const CONFIG_FILENAME = 'tiraz.config.json';

/** A design dial: an integer intensity from 1 to 10 (SPEC §6). */
const dial = z.number().int().min(1).max(10);

/**
 * The Tiraz configuration schema — the single source of truth for `tiraz.config.json`
 * (SPEC §6). Every field carries a default, so an absent or `{}` config resolves to the
 * documented defaults. `strictObject` rejects unknown top-level keys, turning config
 * typos into hard errors instead of silently-ignored settings.
 *
 * Nested objects are all-or-nothing: omit a block to get its default, or provide the
 * block with all of its required fields. This keeps validation unambiguous.
 */
export const TirazConfigSchema = z.strictObject({
  /** Set automatically by `adopt` (integration) / `init` (greenfield). */
  mode: z.enum(['integration', 'greenfield']).default('integration'),

  /** Default primary *seed* only — not a population lock; round-0 spans both primaries (SPEC §4). */
  primary: z
    .enum(['impeccable', 'design-taste-frontend', 'redesign-existing-projects'])
    .default('impeccable'),

  overlay: z.enum(['none', 'minimalist', 'brutalist', 'soft']).default('none'),

  dials: z
    .strictObject({ variance: dial, motion: dial, density: dial })
    .default({ variance: 5, motion: 5, density: 5 }),

  beam: z
    .strictObject({
      width: z.number().int().positive(),
      factor: z.number().int().positive(),
      maxDepth: z.number().int().positive(),
    })
    .default({ width: 2, factor: 3, maxDepth: 3 }),

  pruning: z.enum(['human-only', 'lint-gated', 'auto-beam']).default('lint-gated'),

  fitness: z
    .strictObject({
      lintFloorRequired: z.boolean(),
      weights: z.strictObject({
        dsAdherence: z.number().min(0).max(1),
        taste: z.number().min(0).max(1),
      }),
      // How hard the "Claude tells" scan (tells.ts) pulls the composite down: the blend is scaled by
      // `1 - tellPenalty * (1 - tellScore/100)`, so a variant full of AI-default moves loses up to
      // this fraction. 0 = record tells but ignore them. Field-defaulted for existing configs.
      tellPenalty: z.number().min(0).max(1).default(0.3),
    })
    .refine((f) => Math.abs(f.weights.dsAdherence + f.weights.taste - 1) < 1e-9, {
      message: 'fitness.weights.dsAdherence + fitness.weights.taste must sum to 1',
    })
    // The lint floor is advisory by default: violations are recorded and shown, but only zero a
    // variant's composite when `lintFloorRequired` is true. Taste leads the blend; DS-adherence is a
    // supporting signal (off-system literals are surfaced either way).
    .default({
      lintFloorRequired: false,
      weights: { dsAdherence: 0.3, taste: 0.7 },
      tellPenalty: 0.3,
    }),

  sources: z
    .strictObject({
      bundled: z.array(z.string()),
      fetch: z.array(z.string()),
      // Aceternity and Skiper UI are restricted/toggleable; enabling either should surface a ToS
      // warning at the CLI layer (SPEC §12) — the schema only records the toggles. `skiper` is
      // field-defaulted (off) so existing configs without it still validate.
      aceternity: z.boolean(),
      skiper: z.boolean().default(false),
      // Genuine component fetching (SPEC §12, Phase 1). `install` pre-fetches real components from a
      // permitted source's registry into each variant's worktree and asks the agent to compose +
      // restyle them; `signatures` is the prompt-only fallback (today's behavior). Default `install`,
      // reconciled with the hard rule: install is best-effort and silently falls back to signatures
      // when a worktree has no `components.json` / the source has no transport. `fetchBudget` caps the
      // components installed per variant (bounds network + time). These fields carry FIELD-LEVEL
      // defaults so an existing `tiraz.config.json` with a `sources` block but without these keys
      // still validates and picks them up.
      // `off` (the default) skips fetching AND the per-source prompt text entirely: modern agents
      // compose well from the design system alone, and fetching costs time + tokens per variant.
      fetchMode: z.enum(['off', 'signatures', 'install']).default('off'),
      fetchBudget: z.number().int().min(0).max(20).default(6),
      // 21st.dev semantic-search source (SPEC §12, Phase 2/3). Unlike the shadcn-registry sources
      // (fixed slug lists), this is QUERY-DRIVEN: a planning agent pass picks search queries and each
      // hits 21st.dev's authed `fetch-ui` endpoint, which returns real component code. OFF by default
      // — it is a hosted, API-keyed service (needs `TWENTY_FIRST_API_KEY`) so it must be opted into.
      // `twentyFirstBudget` caps the queries (= components) installed per variant. Field-defaulted so
      // existing configs validate without these keys.
      twentyFirst: z.boolean().default(false),
      twentyFirstBudget: z.number().int().min(0).max(8).default(3),
    })
    .default({
      bundled: ['magic-ui'],
      // A diverse default fetch set (all clean-MIT, registry-installable) — diversity across
      // sources is itself an anti-slop mechanism (SPEC §12). Aceternity stays off (restricted).
      fetch: [
        'react-bits',
        '21st-registry',
        'cult-ui',
        'motion-primitives',
        'kokonut-ui',
        'smoothui',
        'eldora-ui',
        'tailark',
        'mynaui',
      ],
      aceternity: false,
      skiper: false,
      fetchMode: 'off',
      fetchBudget: 6,
      twentyFirst: false,
      twentyFirstBudget: 3,
    }),

  harness: z.enum(['auto', 'storybook', 'ladle', 'histoire', 'scratch', 'app']).default('auto'),

  /**
   * How the `app` harness boots the project's own dev server in a variant worktree. Whitespace-
   * separated (no shell quoting); `{port}` is replaced with the variant's port. Override for scripts
   * that take the port differently (e.g. `npx next dev --webpack -p {port}`).
   */
  appCommand: z.string().min(1).default('npm run dev -- --port {port}'),

  /** Greenfield default; in integration mode this is overwritten by stack detection. */
  framework: z.string().min(1).default('astro'),

  lintThreshold: z.number().int().min(0).max(100).default(80),

  modules: z
    .strictObject({ threeD: z.boolean(), remotion: z.boolean() })
    .default({ threeD: false, remotion: false }),

  /**
   * Generation behaviour.
   * - `selfCritique` adds a second agent pass after the first render (resumed in the same session so
   *   it keeps its context). Off by default: the agent already screenshots and checks its own work
   *   during the first pass (see `agent.allowedTools`), so the extra pass rarely pays for itself.
   * - `concurrency` is how many variants in a round are materialized in parallel (SPEC §7). Each
   *   variant is fully isolated (own worktree, port, and branch), so concurrent runs are safe.
   * - `diversity` sets the gen-0 spread: `diverse` (default) / `alien` (more extreme) /
   *   `conservative` (uniform, no per-variant direction).
   * - `directions` is where gen-0 aesthetic directions come from: `planned` (default) asks one cheap
   *   model call to write directions tailored to the brief + the repo's design system (in integration
   *   mode they stay inside the brand); `catalog` cycles the built-in seed profiles. A failed plan
   *   falls back to the catalog.
   * - `skills` controls how much vendored taste doctrine is installed per variant: `lean` (default)
   *   installs only the short base skill (+ the redesign skill in integration mode, + an overlay when
   *   a catalog profile asks for one); `full` also installs the large opinionated primary skill.
   * All fields are field-defaulted so existing configs keep validating.
   */
  generation: z
    .strictObject({
      selfCritique: z.boolean().default(false),
      concurrency: z.number().int().min(1).max(16).default(4),
      diversity: z.enum(['conservative', 'diverse', 'alien']).default('diverse'),
      directions: z.enum(['planned', 'catalog']).default('planned'),
      skills: z.enum(['lean', 'full']).default('lean'),
    })
    .default({
      selfCritique: false,
      concurrency: 4,
      diversity: 'diverse',
      directions: 'planned',
      skills: 'lean',
    }),

  /**
   * Model + session controls for the Claude Code agent and the taste judge. Every field is
   * field-defaulted, so an existing config without this block validates.
   * - `model`: the model for build sessions (`claude --model`); absent → your `claude` default.
   * - `maxTurns`: caps each build session's agentic turns (`--max-turns`) so a stuck variant can't
   *   burn unbounded usage.
   * - `judgeModel`: the vision model that ranks a generation in ONE listwise call.
   * - `plannerModel`: the model that writes gen-0 directions (one short call per round).
   * - `allowedTools`: extra Claude Code permission rules for build sessions, on top of the built-in
   *   set that lets the agent run the build/typecheck and screenshot its own render.
   */
  agent: z
    .strictObject({
      model: z.string().min(1).optional(),
      maxTurns: z.number().int().min(1).max(500).default(60),
      judgeModel: z.string().min(1).default('claude-sonnet-5-5'),
      plannerModel: z.string().min(1).default('claude-sonnet-5-5'),
      allowedTools: z.array(z.string().min(1)).default([]),
    })
    .default({
      maxTurns: 60,
      judgeModel: 'claude-sonnet-5-5',
      plannerModel: 'claude-sonnet-5-5',
      allowedTools: [],
    }),
});

/** Fully-resolved configuration (all fields present after parsing). */
export type TirazConfig = z.infer<typeof TirazConfigSchema>;

/** Thrown when a `tiraz.config.json` exists but is invalid JSON or fails schema validation. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  readonly configPath: string;

  constructor(message: string, configPath: string) {
    super(message);
    this.configPath = configPath;
  }
}

export interface LoadConfigResult {
  /** The resolved configuration. */
  config: TirazConfig;
  /** Absolute path the config was read from, or `null` if no file was found (pure defaults). */
  path: string | null;
}

/** Extract a human-readable message from an unknown thrown value. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown error';
}

/** Type guard for Node filesystem errors that carry a string `code` (e.g. `ENOENT`). */
export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err && typeof err.code === 'string';
}

/** Render a Zod validation failure as a readable, multi-line message. */
function formatZodError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const where = issue.path.join('.') || '(root)';
    return `  • ${where}: ${issue.message}`;
  });
  return `Invalid ${CONFIG_FILENAME}:\n${lines.join('\n')}`;
}

/**
 * Load and validate Tiraz config from `<cwd>/tiraz.config.json`.
 *
 * - No file present → documented defaults, with `path: null`.
 * - File present but invalid (bad JSON or schema violation) → throws {@link ConfigError}.
 * - Any other filesystem error (permissions, EISDIR, …) is re-thrown unchanged.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<LoadConfigResult> {
  const configPath = path.join(cwd, CONFIG_FILENAME);

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return { config: TirazConfigSchema.parse({}), path: null };
    }
    throw err;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new ConfigError(`Invalid JSON in ${CONFIG_FILENAME}: ${describeError(err)}`, configPath);
  }

  const result = TirazConfigSchema.safeParse(json);
  if (!result.success) {
    throw new ConfigError(formatZodError(result.error), configPath);
  }
  return { config: result.data, path: configPath };
}

/** Read the config file as a raw JSON object (or `{}` if absent), preserving its existing shape. */
async function readRawConfigObject(configPath: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    throw new ConfigError(`Invalid JSON in ${CONFIG_FILENAME}: ${describeError(err)}`, configPath);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`${CONFIG_FILENAME} must contain a JSON object`, configPath);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Apply `patch` to `<cwd>/tiraz.config.json` and persist it.
 *
 * Reads the existing file as a raw object (preserving only the keys the user set — no default
 * bloat), applies the mutation, validates the *merged* result against {@link TirazConfigSchema},
 * and writes it back as pretty JSON. Throws {@link ConfigError} if the result is invalid (the
 * file is left untouched). Creates the file if it does not yet exist.
 */
export async function updateConfig(
  cwd: string,
  patch: (current: Record<string, unknown>) => void,
): Promise<LoadConfigResult> {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  const raw = await readRawConfigObject(configPath);

  patch(raw);

  const result = TirazConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(formatZodError(result.error), configPath);
  }

  await writeFile(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  return { config: result.data, path: configPath };
}
