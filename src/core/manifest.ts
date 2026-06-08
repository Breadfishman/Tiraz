import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { TirazConfigSchema } from './config';
import { describeError, isErrnoException } from './config';
import { GenomeSchema } from './genome';

/** Directory under the target project that holds Tiraz state. */
export const MANIFEST_DIR = '.tiraz';
export const MANIFEST_FILENAME = 'manifest.json';

export const NODE_STATUSES = ['generated', 'scored', 'survivor', 'pruned', 'promoted'] as const;

const ViolationSchema = z.strictObject({
  rule: z.string(),
  severity: z.number(),
  detail: z.string(),
});

/** Three-term fitness (SPEC §6, §9): lint floor gates; DS-adherence + taste rank. */
export const FitnessSchema = z.strictObject({
  lintFloor: z.strictObject({
    passed: z.boolean(),
    violations: z.array(ViolationSchema),
  }),
  dsAdherence: z.strictObject({
    score: z.number(),
    offSystemValues: z.array(z.string()),
  }),
  taste: z.strictObject({
    rank: z.number(),
    derivedScore: z.number(),
    panel: z.array(z.strictObject({ lens: z.string(), model: z.string(), rationale: z.string() })),
  }),
  composite: z.number(),
});

export const VariantNodeSchema = z.strictObject({
  genome: GenomeSchema,
  generation: z.number().int(),
  branch: z.string(),
  worktree: z.string(),
  devPort: z.number().int().optional(),
  renderUrl: z.string().optional(),
  screenshot: z.string().optional(),
  fitness: FitnessSchema.nullable(),
  status: z.enum(NODE_STATUSES),
});

export const ManifestSchema = z.strictObject({
  project: z.string(),
  mode: z.enum(['integration', 'greenfield']),
  config: TirazConfigSchema,
  nodes: z.record(z.string(), VariantNodeSchema),
  generations: z.array(z.array(z.string())),
  final: z.string().optional(),
});

export type Violation = z.infer<typeof ViolationSchema>;
export type Fitness = z.infer<typeof FitnessSchema>;
export type NodeStatus = (typeof NODE_STATUSES)[number];
export type VariantNode = z.infer<typeof VariantNodeSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type TirazConfig = z.infer<typeof TirazConfigSchema>;

export class ManifestError extends Error {
  override readonly name = 'ManifestError';
  readonly manifestPath: string;

  constructor(message: string, manifestPath: string) {
    super(message);
    this.manifestPath = manifestPath;
  }
}

/** Absolute path to the manifest within a target project. */
export function manifestPath(cwd: string): string {
  return path.join(cwd, MANIFEST_DIR, MANIFEST_FILENAME);
}

/** Create an empty manifest for a new run. */
export function createManifest(
  project: string,
  mode: Manifest['mode'],
  config: TirazConfig,
): Manifest {
  return { project, mode, config, nodes: {}, generations: [] };
}

/** Return a copy of `manifest` with `node` inserted/replaced by its genome id. */
export function upsertNode(manifest: Manifest, node: VariantNode): Manifest {
  return { ...manifest, nodes: { ...manifest.nodes, [node.genome.id]: node } };
}

/** Return a copy of `manifest` with a new generation (ordered node ids) appended. */
export function recordGeneration(manifest: Manifest, nodeIds: string[]): Manifest {
  return { ...manifest, generations: [...manifest.generations, [...nodeIds]] };
}

/**
 * Load and validate the manifest from `<cwd>/.tiraz/manifest.json`.
 * Returns `null` if no manifest exists; throws {@link ManifestError} if it is corrupt.
 */
export async function loadManifest(cwd: string): Promise<Manifest | null> {
  const file = manifestPath(cwd);

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new ManifestError(`Invalid JSON in ${MANIFEST_FILENAME}: ${describeError(err)}`, file);
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new ManifestError(
      `Invalid ${MANIFEST_FILENAME}:\n${result.error.issues
        .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n')}`,
      file,
    );
  }
  return result.data;
}

/** Write the manifest to `<cwd>/.tiraz/manifest.json`, creating `.tiraz/` if needed. */
export async function saveManifest(cwd: string, manifest: Manifest): Promise<string> {
  const file = manifestPath(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return file;
}
