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
    })
    .refine((f) => Math.abs(f.weights.dsAdherence + f.weights.taste - 1) < 1e-9, {
      message: 'fitness.weights.dsAdherence + fitness.weights.taste must sum to 1',
    })
    .default({ lintFloorRequired: true, weights: { dsAdherence: 0.5, taste: 0.5 } }),

  sources: z
    .strictObject({
      bundled: z.array(z.string()),
      fetch: z.array(z.string()),
      // Aceternity is toggleable; enabling it should surface a ToS warning at the
      // CLI layer (SPEC §12) — the schema only records the toggle.
      aceternity: z.boolean(),
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
      ],
      aceternity: false,
    }),

  harness: z.enum(['auto', 'storybook', 'ladle', 'histoire', 'scratch', 'app']).default('auto'),

  /** Greenfield default; in integration mode this is overwritten by stack detection. */
  framework: z.string().min(1).default('astro'),

  lintThreshold: z.number().int().min(0).max(100).default(80),

  modules: z
    .strictObject({ threeD: z.boolean(), remotion: z.boolean() })
    .default({ threeD: false, remotion: false }),

  /**
   * Generation behaviour. `selfCritique` adds a second agent pass after the first render: the agent
   * reviews its own rendered output against the slop-tell rubric and fixes the worst offenders in
   * place (SPEC §9 anti-slop). On by default — it is the headline taste lever for generation.
   */
  generation: z.strictObject({ selfCritique: z.boolean() }).default({ selfCritique: true }),
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
