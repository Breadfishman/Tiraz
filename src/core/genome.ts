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

function clampDial(value: number): number {
  return Math.min(10, Math.max(1, value));
}

/** Deterministic single-axis mutations (SPEC §7): nudge one dial, or append one command. */
const DIAL_MUTATIONS = [
  { dial: 'variance', delta: 1 },
  { dial: 'variance', delta: -1 },
  { dial: 'motion', delta: 1 },
  { dial: 'motion', delta: -1 },
  { dial: 'density', delta: 1 },
  { dial: 'density', delta: -1 },
] as const;
const COMMAND_MUTATIONS = ['/bolder', '/distill', '/animate', '/quieter'] as const;
const MUTATION_COUNT = DIAL_MUTATIONS.length + COMMAND_MUTATIONS.length;

export interface MutationContext {
  /** The child's genome id. */
  id: string;
  createdAt: string;
}

/**
 * Produce a child genome by applying one small, deterministic mutation to `parent`, chosen by
 * `index` (SPEC §7 — mutation breeding). The child records `parent.id` as its sole parent.
 */
export function mutateGenome(parent: Genome, ctx: MutationContext, index: number): Genome {
  const pick = ((index % MUTATION_COUNT) + MUTATION_COUNT) % MUTATION_COUNT;
  const dials = { ...parent.dials };
  let commands = parent.commands;

  if (pick < DIAL_MUTATIONS.length) {
    const mutation = DIAL_MUTATIONS[pick];
    if (mutation !== undefined) {
      dials[mutation.dial] = clampDial(dials[mutation.dial] + mutation.delta);
    }
  } else {
    const command = COMMAND_MUTATIONS[pick - DIAL_MUTATIONS.length];
    if (command !== undefined) {
      commands = [...parent.commands, command];
    }
  }

  return {
    ...parent,
    id: ctx.id,
    parents: [parent.id],
    dials,
    commands,
    seed: parent.seed + index + 1,
    createdAt: ctx.createdAt,
  };
}

export interface RecombineContext {
  /** The child's genome id. */
  id: string;
  createdAt: string;
  /** The human's natural-language graft instruction — the source of truth (SPEC §7). */
  instructions: string;
  /** Optional structured hint of which axes to graft. */
  axes?: GraftSpec['axes'];
  /** Optional assist context surfaced by impeccable `/extract` + `/document`. */
  extracted?: GraftSpec['extracted'];
}

/**
 * Produce a recombination child from two parents (SPEC §7). Human-directed: `ctx.instructions`
 * drive the graft; `extracted` is assist-only. The child inherits `parentA`'s base design as a
 * starting point and records both parents plus the {@link GraftSpec}.
 */
export function recombineGenome(parentA: Genome, parentB: Genome, ctx: RecombineContext): Genome {
  const graft: GraftSpec = {
    parents: [parentA.id, parentB.id],
    instructions: ctx.instructions,
    ...(ctx.axes !== undefined ? { axes: ctx.axes } : {}),
    ...(ctx.extracted !== undefined ? { extracted: ctx.extracted } : {}),
  };
  return {
    ...parentA,
    id: ctx.id,
    parents: [parentA.id, parentB.id],
    graft,
    seed: parentA.seed + parentB.seed + 1,
    createdAt: ctx.createdAt,
  };
}
