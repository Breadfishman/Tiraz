import type { Fitness, Manifest, TirazConfig, VariantNode } from './manifest';
import { upsertNode } from './manifest';

export type PruningMode = TirazConfig['pruning'];

export class BeamError extends Error {
  override readonly name = 'BeamError';
}

export interface PruneOptions {
  mode: PruningMode;
  /** Survivors to keep under `auto-beam`. */
  width: number;
}

export interface PruneResult {
  manifest: Manifest;
  /** Auto-selected survivors (`auto-beam` only; empty for human-driven modes). */
  survivors: string[];
  /** Ids ranked and awaiting human `select` (`human-only` / `lint-gated`). */
  candidates: string[];
  /** Ids dropped this round. */
  pruned: string[];
}

interface ScoredNode {
  node: VariantNode;
  fitness: Fitness;
}

function scoredNodes(manifest: Manifest, generationIndex: number): ScoredNode[] {
  const ids = manifest.generations[generationIndex];
  if (ids === undefined) {
    throw new BeamError(`Generation ${String(generationIndex)} does not exist`);
  }
  return ids.map((id) => {
    const node = manifest.nodes[id];
    if (node === undefined) {
      throw new BeamError(
        `Node ${id} referenced by generation ${String(generationIndex)} is missing`,
      );
    }
    if (node.fitness === null) {
      throw new BeamError(`Node ${id} has not been scored`);
    }
    return { node, fitness: node.fitness };
  });
}

/** Highest composite first; ties broken by id for determinism. */
function byComposite(a: ScoredNode, b: ScoredNode): number {
  return (
    b.fitness.composite - a.fitness.composite || a.node.genome.id.localeCompare(b.node.genome.id)
  );
}

/**
 * Prune a scored generation per the configured mode (SPEC §7). The lint floor is a hard gate in the
 * automatic modes; `human-only` never auto-drops. Returns the updated manifest plus the survivor /
 * candidate / pruned id lists. `select` still has the final say in every mode.
 */
export function pruneGeneration(
  manifest: Manifest,
  generationIndex: number,
  opts: PruneOptions,
): PruneResult {
  const scored = scoredNodes(manifest, generationIndex);
  const ranked = [...scored].sort(byComposite);
  const passing = ranked.filter((s) => s.fitness.lintFloor.passed);
  const failing = ranked.filter((s) => !s.fitness.lintFloor.passed);

  let updated = manifest;
  const setStatus = (id: string, status: VariantNode['status']): void => {
    const node = updated.nodes[id];
    if (node !== undefined) {
      updated = upsertNode(updated, { ...node, status });
    }
  };

  if (opts.mode === 'human-only') {
    // Linter annotates only; the human selects everything. No automatic status changes.
    return {
      manifest: updated,
      survivors: [],
      candidates: ranked.map((s) => s.node.genome.id),
      pruned: [],
    };
  }

  if (opts.mode === 'lint-gated') {
    for (const s of failing) {
      setStatus(s.node.genome.id, 'pruned');
    }
    return {
      manifest: updated,
      survivors: [],
      candidates: passing.map((s) => s.node.genome.id),
      pruned: failing.map((s) => s.node.genome.id),
    };
  }

  // auto-beam: engine keeps the top `width` passing variants; everything else is pruned.
  const survivors = passing.slice(0, opts.width);
  const dropped = [...passing.slice(opts.width), ...failing];
  for (const s of survivors) {
    setStatus(s.node.genome.id, 'survivor');
  }
  for (const s of dropped) {
    setStatus(s.node.genome.id, 'pruned');
  }
  return {
    manifest: updated,
    survivors: survivors.map((s) => s.node.genome.id),
    candidates: [],
    pruned: dropped.map((s) => s.node.genome.id),
  };
}

/**
 * Mark `ids` as survivors and prune the other still-`scored` nodes in the same generation(s)
 * (SPEC §7). Available in every pruning mode — the human override.
 */
export function selectSurvivors(manifest: Manifest, ids: string[]): Manifest {
  const selected = new Set(ids);
  const affectedGenerations = new Set<number>();
  for (const id of ids) {
    const node = manifest.nodes[id];
    if (node === undefined) {
      throw new BeamError(`Cannot select unknown node ${id}`);
    }
    affectedGenerations.add(node.generation);
  }

  let updated = manifest;
  for (const [id, node] of Object.entries(manifest.nodes)) {
    if (selected.has(id)) {
      updated = upsertNode(updated, { ...node, status: 'survivor' });
    } else if (affectedGenerations.has(node.generation) && node.status === 'scored') {
      updated = upsertNode(updated, { ...node, status: 'pruned' });
    }
  }
  return updated;
}
