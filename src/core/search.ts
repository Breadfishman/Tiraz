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
import {
  createManifest,
  loadManifest,
  recordGeneration,
  saveManifest,
  upsertNode,
} from './manifest';
import { seedPrimaries } from './skills-registry';
import { assignPort } from './worktree';

export class SearchError extends Error {
  override readonly name = 'SearchError';
}

function clampDial(value: number): number {
  return Math.min(10, Math.max(1, value));
}

export interface SeedContext {
  brief: string;
  target?: string;
  createdAt: string;
  generation: number;
}

/**
 * Seed `count` diverse round-0 genomes (SPEC §4, §7): span the available primaries (both in
 * greenfield; the single forced primary in integration) and nudge the variance dial per index so
 * no two variants start identical.
 */
export function seedGenomes(config: TirazConfig, count: number, ctx: SeedContext): Genome[] {
  const primaries = seedPrimaries(config.mode);
  return Array.from({ length: count }, (_unused, i) => {
    const primarySkill = primaries[i % primaries.length];
    const primary = primarySkill?.primaryKey ?? config.primary;
    return {
      id: genomeId(ctx.generation, i),
      parents: [],
      primary,
      overlay: config.overlay,
      dials: { ...config.dials, variance: clampDial(config.dials.variance + ((i % 3) - 1)) },
      commands: [],
      seed: i,
      brief: ctx.brief,
      createdAt: ctx.createdAt,
      ...(ctx.target !== undefined ? { target: ctx.target } : {}),
      ...(config.sources.fetch.length > 0 ? { sources: config.sources.fetch } : {}),
    } satisfies Genome;
  });
}

/** Materialize a list of genomes into a new generation and persist them. */
async function materialize(
  cwd: string,
  mode: TirazConfig['mode'],
  manifest: Manifest,
  genomes: Genome[],
  generation: number,
  harnessKind: HarnessKind | undefined,
  deps: GenDeps,
): Promise<VariantNode[]> {
  const harness = await detectHarness(cwd, harnessKind);
  const ports = new Set(usedPorts(manifest));

  const nodes: VariantNode[] = [];
  for (const genome of genomes) {
    const port = assignPort(ports);
    ports.add(port);
    nodes.push(await generateVariant({ cwd, mode, genome, generation, port, harness }, deps));
  }

  let updated = manifest;
  for (const node of nodes) {
    updated = upsertNode(updated, node);
  }
  updated = recordGeneration(
    updated,
    nodes.map((node) => node.genome.id),
  );
  await saveManifest(cwd, updated);
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

  return materialize(opts.cwd, config.mode, manifest, genomes, generation, opts.harness, deps);
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

  const childGenomes: Genome[] = [];
  let nodeIndex = 0;
  for (const survivorId of opts.survivors) {
    const parent = manifest.nodes[survivorId];
    if (parent === undefined) {
      throw new SearchError(`Survivor ${survivorId} not found`);
    }
    for (let k = 0; k < factor; k += 1) {
      childGenomes.push(
        mutateGenome(
          parent.genome,
          { id: genomeId(generation, nodeIndex), createdAt: now() },
          nodeIndex,
        ),
      );
      nodeIndex += 1;
    }
  }

  return materialize(opts.cwd, config.mode, manifest, childGenomes, generation, opts.harness, deps);
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
    config.mode,
    manifest,
    [child],
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
