import path from 'node:path';
import type { TirazConfig } from './config';
import { loadConfig } from './config';
import type { HarnessKind } from './detect';
import { detectHarness } from './detect';
import type { Genome, GraftSpec } from './genome';
import { genomeId, mutateGenome, recombineGenome } from './genome';
import type { GenDeps } from './gen';
import { generateVariant, usedPorts } from './gen';
import type { Manifest, VariantNode } from './manifest';
import { createManifest, loadManifest, saveManifest, upsertNode } from './manifest';
import { resolveCapabilities } from './capabilities';
import { collectDesignSystem } from './ds-collect-io';
import { seedPrimaries } from './skills-registry';
import { resolveSources } from './sources';
import { assignPort } from './worktree';

export class SearchError extends Error {
  override readonly name = 'SearchError';
}

export interface SeedContext {
  brief: string;
  target?: string;
  createdAt: string;
  generation: number;
}

/**
 * Distinct round-0 "looks" (SPEC §4 — primary-as-diversity + the dials). Each gives a meaningfully
 * different starting point (overlay + dial profile), so a round of N variants spans real options
 * instead of near-duplicates. Cycled across the population alongside the primary span.
 */
const SEED_PROFILES: { overlay: Genome['overlay']; dials: Genome['dials'] }[] = [
  { overlay: 'none', dials: { variance: 5, motion: 5, density: 5 } }, // balanced
  { overlay: 'minimalist', dials: { variance: 3, motion: 2, density: 3 } }, // calm, airy
  { overlay: 'brutalist', dials: { variance: 8, motion: 4, density: 7 } }, // bold, dense
  { overlay: 'soft', dials: { variance: 6, motion: 8, density: 4 } }, // expressive, kinetic
  { overlay: 'none', dials: { variance: 9, motion: 6, density: 5 } }, // high-variance editorial
];

/**
 * Seed `count` diverse round-0 genomes (SPEC §4, §7): span the available primaries (both in
 * greenfield; the single forced primary in integration) AND cycle distinct overlay+dial profiles,
 * so a round offers genuinely different options rather than near-identical variants.
 */
export function seedGenomes(config: TirazConfig, count: number, ctx: SeedContext): Genome[] {
  const primaries = seedPrimaries(config.mode);
  const permittedSources = resolveSources(config.sources).permittedIds;
  return Array.from({ length: count }, (_unused, i) => {
    const primarySkill = primaries[i % primaries.length];
    const primary = primarySkill?.primaryKey ?? config.primary;
    // Profiles offset by the primary index so the two primaries don't get identical profiles.
    const profile = SEED_PROFILES[(i + (i % primaries.length)) % SEED_PROFILES.length];
    return {
      id: genomeId(ctx.generation, i),
      parents: [],
      primary,
      overlay: profile?.overlay ?? config.overlay,
      dials: profile?.dials ?? config.dials,
      commands: [],
      seed: i,
      brief: ctx.brief,
      createdAt: ctx.createdAt,
      ...(ctx.target !== undefined ? { target: ctx.target } : {}),
      ...(permittedSources.length > 0 ? { sources: permittedSources } : {}),
    } satisfies Genome;
  });
}

/** One genome to materialize, optionally based on a parent's branch (so children refine, not restart). */
interface MaterializeItem {
  genome: Genome;
  baseRef?: string;
}

/** Set generation `index`'s id list (creating the slot), so it can be written incrementally. */
function withGeneration(manifest: Manifest, index: number, ids: string[]): Manifest {
  const generations = [...manifest.generations];
  generations[index] = [...ids];
  return { ...manifest, generations };
}

/** Materialize a list of genomes into a new generation and persist them. */
async function materialize(
  cwd: string,
  config: TirazConfig,
  manifest: Manifest,
  items: MaterializeItem[],
  generation: number,
  harnessKind: HarnessKind | undefined,
  deps: GenDeps,
): Promise<VariantNode[]> {
  const harness = await detectHarness(cwd, harnessKind);
  const ports = new Set(usedPorts(manifest));
  const capabilities = resolveCapabilities(config.modules).libraries.map((c) => c.name);
  const designSystem = await collectDesignSystem(cwd);

  // Persist after EACH variant (not all-at-once): a long, agent-driven run that's interrupted then
  // keeps every completed variant instead of losing the whole generation.
  const nodes: VariantNode[] = [];
  const ids: string[] = [];
  let updated = manifest;
  for (const { genome, baseRef } of items) {
    const port = assignPort(ports);
    ports.add(port);
    const node = await generateVariant(
      {
        cwd,
        mode: config.mode,
        genome,
        generation,
        port,
        harness,
        capabilities,
        designSystem,
        ...(baseRef !== undefined ? { baseRef } : {}),
      },
      deps,
    );
    nodes.push(node);
    ids.push(node.genome.id);
    updated = withGeneration(upsertNode(updated, node), generation, ids);
    await saveManifest(cwd, updated);
  }
  return nodes;
}

export interface GenerationOptions {
  cwd: string;
  brief: string;
  /** Variants to produce this round (the branching factor). */
  count: number;
  target?: string;
  harness?: HarnessKind;
}

/** Produce a fresh round-0 generation of `count` diverse variants (SPEC §7 step 1). */
export async function generateGeneration(
  opts: GenerationOptions,
  deps: GenDeps,
): Promise<VariantNode[]> {
  if (opts.count < 1) {
    throw new SearchError('count must be at least 1');
  }
  const { config } = await loadConfig(opts.cwd);
  const manifest =
    (await loadManifest(opts.cwd)) ?? createManifest(path.basename(opts.cwd), config.mode, config);
  const generation = manifest.generations.length;
  const now = deps.now ?? (() => new Date().toISOString());

  const genomes = seedGenomes(config, opts.count, {
    brief: opts.brief,
    createdAt: now(),
    generation,
    ...(opts.target !== undefined ? { target: opts.target } : {}),
  });

  return materialize(
    opts.cwd,
    config,
    manifest,
    genomes.map((genome) => ({ genome })),
    generation,
    opts.harness,
    deps,
  );
}

export interface BreedOptions {
  cwd: string;
  /** Survivor node ids to breed from. */
  survivors: string[];
  /** Children per survivor; defaults to `config.beam.factor`. */
  factor?: number;
  harness?: HarnessKind;
}

/** Breed the next generation by mutating each survivor `factor` times (SPEC §7 step 5, mutation). */
export async function breedGeneration(opts: BreedOptions, deps: GenDeps): Promise<VariantNode[]> {
  if (opts.survivors.length === 0) {
    throw new SearchError('No survivors to breed from');
  }
  const { config } = await loadConfig(opts.cwd);
  const manifest = await loadManifest(opts.cwd);
  if (manifest === null) {
    throw new SearchError(`No Tiraz manifest found in ${opts.cwd}`);
  }
  const factor = opts.factor ?? config.beam.factor;
  const generation = manifest.generations.length;
  const now = deps.now ?? (() => new Date().toISOString());

  const items: MaterializeItem[] = [];
  let nodeIndex = 0;
  for (const survivorId of opts.survivors) {
    const parent = manifest.nodes[survivorId];
    if (parent === undefined) {
      throw new SearchError(`Survivor ${survivorId} not found`);
    }
    for (let k = 0; k < factor; k += 1) {
      items.push({
        genome: mutateGenome(
          parent.genome,
          { id: genomeId(generation, nodeIndex), createdAt: now() },
          nodeIndex,
        ),
        // Base the child's worktree on the parent's branch so it refines, not regenerates.
        baseRef: parent.branch,
      });
      nodeIndex += 1;
    }
  }

  return materialize(opts.cwd, config, manifest, items, generation, opts.harness, deps);
}

export interface RecombineOptions {
  cwd: string;
  /** Node id of the first parent (its base design is the starting point). */
  parentA: string;
  /** Node id of the second parent. */
  parentB: string;
  /** The human's natural-language graft instruction (required, SPEC §7). */
  instructions: string;
  axes?: GraftSpec['axes'];
  harness?: HarnessKind;
}

/**
 * Recombine two survivors into a single grafted child (SPEC §7, Phase 4). Human-directed: the
 * caller supplies the natural-language graft instruction. Materializes + persists the child as a
 * new generation and returns it.
 */
export async function recombineVariant(
  opts: RecombineOptions,
  deps: GenDeps,
): Promise<VariantNode> {
  if (opts.instructions.trim() === '') {
    throw new SearchError('Recombination requires a non-empty --graft instruction');
  }
  const { config } = await loadConfig(opts.cwd);
  const manifest = await loadManifest(opts.cwd);
  if (manifest === null) {
    throw new SearchError(`No Tiraz manifest found in ${opts.cwd}`);
  }
  const parentA = manifest.nodes[opts.parentA];
  const parentB = manifest.nodes[opts.parentB];
  if (parentA === undefined || parentB === undefined) {
    throw new SearchError(`Both parents must exist (${opts.parentA}, ${opts.parentB})`);
  }

  const generation = manifest.generations.length;
  const now = deps.now ?? (() => new Date().toISOString());
  const child = recombineGenome(parentA.genome, parentB.genome, {
    id: genomeId(generation, 0),
    createdAt: now(),
    instructions: opts.instructions,
    ...(opts.axes !== undefined ? { axes: opts.axes } : {}),
  });

  const nodes = await materialize(
    opts.cwd,
    config,
    manifest,
    [{ genome: child, baseRef: parentA.branch }],
    generation,
    opts.harness,
    deps,
  );
  const node = nodes[0];
  if (node === undefined) {
    throw new SearchError('Recombination produced no node');
  }
  return node;
}
