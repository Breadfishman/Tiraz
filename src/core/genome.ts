import { z } from 'zod';

/** A design dial: integer intensity 1–10 (SPEC §6). */
const dial = z.number().int().min(1).max(10);

/**
 * Recombination spec — human-directed (SPEC §7). The `instructions` are the source of
 * truth; `extracted` is assist-only context surfaced by impeccable `/extract` + `/document`.
 */
export const GraftSpecSchema = z.strictObject({
  parents: z.array(z.string()).min(2),
  instructions: z.string().min(1),
  axes: z.array(z.enum(['typography', 'palette', 'motion', 'layout', 'spacing'])).optional(),
  extracted: z.record(z.string(), z.unknown()).optional(),
});

export type GraftSpec = z.infer<typeof GraftSpecSchema>;

/** The reproducible inputs that produced a variant (SPEC §6). */
export const GenomeSchema = z.strictObject({
  /** e.g. "g2-n3" = generation 2, node 3. */
  id: z.string().min(1),
  /** `[]` = seed, `[x]` = mutation, `[x, y]` = recombination. */
  parents: z.array(z.string()),
  primary: z.enum(['impeccable', 'design-taste-frontend', 'redesign-existing-projects']),
  overlay: z.enum(['none', 'minimalist', 'brutalist', 'soft']),
  dials: z.strictObject({ variance: dial, motion: dial, density: dial }),
  /** Applied command lineage, e.g. ["/bolder", "/distill"]. */
  commands: z.array(z.string()),
  /** Tier-2 component sources the agent was permitted to draw from (SPEC §12). */
  sources: z.array(z.string()).optional(),
  graft: GraftSpecSchema.optional(),
  seed: z.number().int(),
  /** The section/page brief this variant implements. */
  brief: z.string(),
  /** Integration mode: the scoped target (component / route / story). */
  target: z.string().optional(),
  /** ISO timestamp; supplied by the caller (kept out of pure code for determinism). */
  createdAt: z.string().min(1),
});

export type Genome = z.infer<typeof GenomeSchema>;

/** Build a canonical genome id from a generation and node index, e.g. `genomeId(2, 3)` → "g2-n3". */
export function genomeId(generation: number, node: number): string {
  return `g${String(generation)}-n${String(node)}`;
}

/** Parse a canonical genome id back into its `{ generation, node }`, or `null` if malformed. */
export function parseGenomeId(id: string): { generation: number; node: number } | null {
  const match = /^g(?<generation>\d+)-n(?<node>\d+)$/.exec(id);
  const generation = match?.groups?.generation;
  const node = match?.groups?.node;
  if (generation === undefined || node === undefined) {
    return null;
  }
  return { generation: Number(generation), node: Number(node) };
}
