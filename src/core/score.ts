import type { DesignSystem, DsAdherenceResult, UsedValues } from './ds-adherence';
import { scoreDsAdherence } from './ds-adherence';
import { composeFitness } from './fitness';
import type { TasteResult } from './fitness';
import type { LintResult } from './lint';
import type { Manifest, TirazConfig, VariantNode } from './manifest';
import { loadManifest, saveManifest, upsertNode } from './manifest';
import type { JudgeCandidate, LensConfig, PairwiseJudge } from './taste-judge';
import { runTasteTournament } from './taste-judge';

export class ScoreError extends Error {
  override readonly name = 'ScoreError';
}

export interface ScoreDeps {
  /** Run the lint floor for a node (wraps `core/lint.ts` with a runner + threshold). */
  lint: (node: VariantNode) => Promise<LintResult>;
  /** The repo's design system (token + component allowlist). */
  designSystem: DesignSystem;
  /** Collect the values a variant actually used (an adapter over its render/code). */
  collectUsedValues: (node: VariantNode) => Promise<UsedValues>;
  /** The pairwise VLM judge. */
  judge: PairwiseJudge;
  weights: TirazConfig['fitness']['weights'];
  lenses?: readonly LensConfig[];
}

/** A node with no screenshot can't be taste-judged; it gets a zero taste term. */
const ABSENT_TASTE: TasteResult = { rank: 0, derivedScore: 0, panel: [] };

/**
 * Score every variant in a generation (SPEC §9): compute the lint floor and design-system
 * adherence per node, run the taste tournament across the generation, assemble each node's
 * three-term {@link composeFitness}, mark it `scored`, and persist the manifest. Returns the
 * updated manifest.
 */
export async function runScore(
  cwd: string,
  generationIndex: number,
  deps: ScoreDeps,
): Promise<Manifest> {
  const manifest = await loadManifest(cwd);
  if (manifest === null) {
    throw new ScoreError(`No Tiraz manifest found in ${cwd}`);
  }
  const ids = manifest.generations[generationIndex];
  if (ids === undefined) {
    throw new ScoreError(`Generation ${String(generationIndex)} does not exist`);
  }

  const nodes = ids.map((id) => {
    const node = manifest.nodes[id];
    if (node === undefined) {
      throw new ScoreError(
        `Node ${id} referenced by generation ${String(generationIndex)} is missing`,
      );
    }
    return node;
  });

  const lintResults = new Map<string, LintResult>();
  const dsResults = new Map<string, DsAdherenceResult>();
  for (const node of nodes) {
    lintResults.set(node.genome.id, await deps.lint(node));
    dsResults.set(
      node.genome.id,
      scoreDsAdherence(deps.designSystem, await deps.collectUsedValues(node), {
        ...(node.genome.sources !== undefined ? { whitelistedSources: node.genome.sources } : {}),
      }),
    );
  }

  const candidates: JudgeCandidate[] = [];
  for (const node of nodes) {
    if (node.screenshot !== undefined) {
      candidates.push({ id: node.genome.id, screenshotPath: node.screenshot });
    }
  }
  const brief = nodes[0]?.genome.brief ?? '';
  const taste = await runTasteTournament(candidates, {
    brief,
    judge: deps.judge,
    ...(deps.lenses !== undefined ? { lenses: deps.lenses } : {}),
  });

  let updated = manifest;
  for (const node of nodes) {
    const lintResult = lintResults.get(node.genome.id);
    const dsResult = dsResults.get(node.genome.id);
    if (lintResult === undefined || dsResult === undefined) {
      throw new ScoreError(`Internal: missing computed terms for ${node.genome.id}`);
    }
    const fitness = composeFitness(
      lintResult,
      dsResult,
      taste[node.genome.id] ?? ABSENT_TASTE,
      deps.weights,
    );
    updated = upsertNode(updated, { ...node, fitness, status: 'scored' });
  }

  await saveManifest(cwd, updated);
  return updated;
}
