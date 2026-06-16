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
import { createMutex, mapPool } from './pool';
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

/** Per-variant Tier-2 source policy for gen-0 diversity (SPEC §4) — down to `homegrown` (none). */
type SourceMode = 'all' | 'few' | 'single' | 'homegrown';

interface SeedProfile {
  overlay: Genome['overlay'];
  dials: Genome['dials'];
  /** The aesthetic direction the agent must commit to (injected into the prompt). */
  ethos: string;
  /** How many Tier-2 sources this variant may pull from (drives `homegrown` + the blend). */
  sourceMode: SourceMode;
}

/**
 * Distinct round-0 "looks" (SPEC §4). Each is a genuinely different starting point — overlay + dial
 * profile, a one-line aesthetic ETHOS the agent commits to, and a `sourceMode` controlling how much it
 * draws from external libraries (down to `homegrown` = from scratch). Cycled across the population so a
 * round spans real options, not near-duplicates. Profile index 1 is homegrown, so any round of ≥2
 * already includes a from-scratch variant (further guaranteed below).
 */
const SEED_PROFILES: SeedProfile[] = [
  {
    overlay: 'none',
    dials: { variance: 5, motion: 5, density: 5 },
    ethos: 'Balanced and confident — a modern, polished default with strong fundamentals.',
    sourceMode: 'all',
  },
  {
    overlay: 'minimalist',
    dials: { variance: 2, motion: 1, density: 3 },
    ethos:
      'Radical Swiss minimalism — extreme whitespace, one typeface, a strict grid, zero ornament.',
    sourceMode: 'homegrown',
  },
  {
    overlay: 'brutalist',
    dials: { variance: 9, motion: 3, density: 8 },
    ethos:
      'Raw neo-brutalism — heavy type, hard edges, exposed structure, monospace, high contrast.',
    sourceMode: 'few',
  },
  {
    overlay: 'soft',
    dials: { variance: 6, motion: 9, density: 4 },
    ethos: 'Expressive and kinetic — organic shapes, motion-forward, playful, alive.',
    sourceMode: 'all',
  },
  {
    overlay: 'none',
    dials: { variance: 10, motion: 6, density: 6 },
    ethos: 'Editorial maximalism — art-directed, experimental, unexpected layout and scale.',
    sourceMode: 'single',
  },
  {
    overlay: 'minimalist',
    dials: { variance: 4, motion: 2, density: 5 },
    ethos: 'Retro-terminal — monospace, utilitarian, command-line aesthetic, restrained color.',
    sourceMode: 'homegrown',
  },
  {
    overlay: 'soft',
    dials: { variance: 7, motion: 4, density: 4 },
    ethos: 'Refined luxury — restrained palette, elegant type pairing, generous negative space.',
    sourceMode: 'few',
  },
  {
    overlay: 'brutalist',
    dials: { variance: 10, motion: 8, density: 7 },
    ethos: 'Alien and experimental — break conventions, unexpected colour and motion, be bold.',
    sourceMode: 'all',
  },
  {
    overlay: 'none',
    dials: { variance: 8, motion: 7, density: 7 },
    ethos:
      'Y2K maximalism — chrome gradients, glossy bubble buttons, early-web nostalgia, loud and dense.',
    sourceMode: 'few',
  },
  {
    overlay: 'soft',
    dials: { variance: 7, motion: 6, density: 3 },
    ethos: 'Organic biomorphism — blobby gradient-mesh forms, nothing rectilinear, soft and alive.',
    sourceMode: 'all',
  },
  {
    overlay: 'none',
    dials: { variance: 6, motion: 3, density: 6 },
    ethos: 'Art-deco geometry — symmetrical gold-line ornament, tall elegant type, 1920s grandeur.',
    sourceMode: 'homegrown',
  },
  {
    overlay: 'brutalist',
    dials: { variance: 8, motion: 9, density: 9 },
    ethos:
      'Cyberpunk HUD — neon on black, scanlines, glitch, dense technical overlays and readouts.',
    sourceMode: 'all',
  },
  {
    overlay: 'soft',
    dials: { variance: 5, motion: 5, density: 4 },
    ethos:
      'Frosted glassmorphism — translucent layered panels, blur, depth, soft light through glass.',
    sourceMode: 'few',
  },
  {
    overlay: 'brutalist',
    dials: { variance: 7, motion: 4, density: 5 },
    ethos:
      'Bauhaus geometry — primary colours, circles and triangles on a strict grid, functional and bold.',
    sourceMode: 'single',
  },
  {
    overlay: 'none',
    dials: { variance: 3, motion: 1, density: 9 },
    ethos:
      'Print broadsheet — multi-column newspaper grid, serif headlines, hairline rules, dense text.',
    sourceMode: 'homegrown',
  },
  {
    overlay: 'soft',
    dials: { variance: 9, motion: 7, density: 6 },
    ethos:
      'Vaporwave — pastel sunset gradients, retro-futurist chrome, dreamy 80s and 90s nostalgia.',
    sourceMode: 'single',
  },
  {
    overlay: 'soft',
    dials: { variance: 6, motion: 6, density: 4 },
    ethos: 'Claymorphism — soft puffy 3D shapes, rounded depth, friendly and tactile playfulness.',
    sourceMode: 'few',
  },
  {
    overlay: 'none',
    dials: { variance: 10, motion: 5, density: 7 },
    ethos:
      'Memphis postmodernism — clashing 80s shapes, squiggles and confetti, irreverent and loud.',
    sourceMode: 'few',
  },
  {
    overlay: 'minimalist',
    dials: { variance: 4, motion: 3, density: 6 },
    ethos:
      'Technical dark-mode SaaS — precise dev-tool UI, monospace accents, data-dense and crisp.',
    sourceMode: 'all',
  },
  {
    overlay: 'soft',
    dials: { variance: 6, motion: 2, density: 4 },
    ethos:
      'Botanical handcraft — paper texture, ink illustration, warm earthy palette, hand-made calm.',
    sourceMode: 'homegrown',
  },
];

const HOMEGROWN_CLAUSE =
  ' Build this entirely from scratch — do NOT use external component libraries.';

/** Allocate which Tier-2 sources a gen-0 variant may draw from, per its profile's source mode. */
function allocateSources(mode: SourceMode, permitted: readonly string[], index: number): string[] {
  if (mode === 'homegrown' || permitted.length === 0) return [];
  if (mode === 'all') return [...permitted];
  if (mode === 'single') {
    const pick = permitted[index % permitted.length];
    return pick !== undefined ? [pick] : [];
  }
  // 'few': a rotated window of up to 3 so different variants draw from different small sets.
  const start = (index * 2) % permitted.length;
  return [...permitted.slice(start), ...permitted.slice(0, start)].slice(
    0,
    Math.min(3, permitted.length),
  );
}

/**
 * Seed `count` diverse round-0 genomes (SPEC §4, §7). Spans the available primaries AND cycles the
 * {@link SEED_PROFILES}. In `diverse`/`alien` mode (the default is `diverse`) each variant also gets a
 * distinct ETHOS and a varied source allocation (all / few / single / homegrown-from-scratch), and a
 * homegrown variant is guaranteed per round; `alien` additionally pushes dial extremes + experimentation.
 * `conservative` reverts to the prior uniform full-source seeding (overlay + dials only).
 */
export function seedGenomes(config: TirazConfig, count: number, ctx: SeedContext): Genome[] {
  const primaries = seedPrimaries(config.mode);
  const permittedSources = resolveSources(config.sources).permittedIds;
  const diversity = config.generation.diversity;
  const wide = diversity !== 'conservative';

  const genomes = Array.from({ length: count }, (_unused, i): Genome => {
    const primarySkill = primaries[i % primaries.length];
    const primary = primarySkill?.primaryKey ?? config.primary;
    const profile = SEED_PROFILES[i % SEED_PROFILES.length];

    let dials = profile?.dials ?? config.dials;
    let ethos = profile?.ethos;
    if (diversity === 'alien' && profile !== undefined) {
      dials = {
        variance: Math.min(10, profile.dials.variance + 1),
        motion: Math.min(10, profile.dials.motion + 1),
        density: profile.dials.density,
      };
      ethos = `${profile.ethos} Push it to an extreme — be unconventional, even alien.`;
    }

    const sourceMode: SourceMode = wide ? (profile?.sourceMode ?? 'all') : 'all';
    const homegrown = wide && sourceMode === 'homegrown';
    const sources = wide ? allocateSources(sourceMode, permittedSources, i) : permittedSources;
    if (homegrown && ethos !== undefined) ethos = `${ethos}${HOMEGROWN_CLAUSE}`;

    return {
      id: genomeId(ctx.generation, i),
      parents: [],
      primary,
      overlay: profile?.overlay ?? config.overlay,
      dials,
      commands: [],
      seed: i,
      brief: ctx.brief,
      createdAt: ctx.createdAt,
      ...(ctx.target !== undefined ? { target: ctx.target } : {}),
      ...(sources.length > 0 ? { sources } : {}),
      ...(wide && ethos !== undefined ? { ethos } : {}),
      ...(homegrown ? { homegrown: true } : {}),
    } satisfies Genome;
  });

  // Guarantee at least one homegrown (from-scratch, no-fetch) variant per wide round (SPEC §4).
  if (wide && count >= 2 && !genomes.some((g) => g.homegrown === true)) {
    const last = genomes[genomes.length - 1];
    if (last !== undefined) {
      last.homegrown = true;
      last.ethos = `${last.ethos ?? 'Build from scratch.'}${HOMEGROWN_CLAUSE}`;
      delete last.sources;
    }
  }

  return genomes;
}

/** One genome to materialize, optionally based on a parent's branch (so children refine, not restart). */
interface MaterializeItem {
  genome: Genome;
  baseRef?: string;
  /** One-shot human directive (directed breeding) passed through to the agent prompt. */
  directive?: string;
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
  const capabilities = resolveCapabilities(config.modules).libraries.map((c) => c.name);
  const designSystem = await collectDesignSystem(cwd);
  // Bundled-tier sources (e.g. Magic UI) are fetched alongside each genome's Tier-2 `sources`.
  const bundledSources = resolveSources(config.sources).bundled.map((source) => source.id);

  // Assign every port up front (sequentially, before any concurrency) so parallel variants can't
  // race for the same one. Each variant is otherwise fully isolated (own worktree + branch).
  const ports = new Set(usedPorts(manifest));
  const portByIndex = items.map(() => {
    const port = assignPort(ports);
    ports.add(port);
    return port;
  });

  // Persist after EACH variant completes (not all-at-once) so an interrupted round keeps every
  // finished variant. Variants finish out of order under concurrency, so writes are serialized
  // through this chain and the generation is always rebuilt from completed nodes in input order —
  // keeping `manifest.json` deterministic regardless of completion order.
  // One shared lock so concurrent variants create their worktrees one at a time (git worktree add
  // races otherwise); the agent + render work still runs fully in parallel.
  const lockedDeps: GenDeps = { ...deps, worktreeLock: createMutex() };

  const completed = new Array<VariantNode | null>(items.length).fill(null);
  let persistChain: Promise<void> = Promise.resolve();
  const persist = async (index: number, node: VariantNode): Promise<void> => {
    completed[index] = node;
    persistChain = persistChain.then(async () => {
      let updated = manifest;
      const ids: string[] = [];
      for (const done of completed) {
        if (done !== null) {
          updated = upsertNode(updated, done);
          ids.push(done.genome.id);
        }
      }
      await saveManifest(cwd, withGeneration(updated, generation, ids));
    });
    await persistChain;
  };

  const settled = await mapPool(
    items,
    config.generation.concurrency,
    async ({ genome, baseRef, directive }, index) => {
      const node = await generateVariant(
        {
          cwd,
          mode: config.mode,
          genome,
          generation,
          port: portByIndex[index] ?? assignPort(ports),
          harness,
          capabilities,
          designSystem,
          selfCritique: config.generation.selfCritique,
          fetchMode: config.sources.fetchMode,
          fetchBudget: config.sources.fetchBudget,
          bundledSources,
          twentyFirst: config.sources.twentyFirst,
          twentyFirstBudget: config.sources.twentyFirstBudget,
          ...(baseRef !== undefined ? { baseRef } : {}),
          ...(directive !== undefined ? { directive } : {}),
        },
        lockedDeps,
      );
      await persist(index, node);
      return node;
    },
  );

  // Successes (in input order) are already persisted; surface any per-variant failures rather than
  // silently dropping them. The whole round only aborts if nothing succeeded.
  const nodes = completed.filter((node): node is VariantNode => node !== null);
  const failures = settled.flatMap((result, index) =>
    result.status === 'rejected'
      ? [`${items[index]?.genome.id ?? `#${String(index)}`}: ${describeReason(result.reason)}`]
      : [],
  );
  if (failures.length > 0) {
    if (nodes.length === 0) {
      throw new SearchError(
        `All ${String(items.length)} variants failed:\n  ${failures.join('\n  ')}`,
      );
    }
    throw new SearchError(
      `${String(failures.length)} of ${String(items.length)} variants failed (the ` +
        `${String(nodes.length)} that succeeded were saved):\n  ${failures.join('\n  ')}`,
    );
  }
  return nodes;
}

/** Human-readable message for a rejected variant (unknown thrown value → best-effort string). */
function describeReason(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
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
  /** One-shot human directive ("what to improve") applied to every child this round. */
  directive?: string;
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
        ...(opts.directive !== undefined ? { directive: opts.directive } : {}),
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
