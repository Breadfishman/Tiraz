import type { DesignSystem, DsAdherenceResult, UsedValues } from './ds-adherence';
import { scoreDsAdherence } from './ds-adherence';
import { composeFitness } from './fitness';
import type { TasteResult } from './fitness';
import type { LintResult } from './lint';
import type { SimilarPair } from './diversity';
import { fingerprint, nearDuplicates } from './diversity';
import type { SourceFile, TellReport } from './tells';
import { detectTells } from './tells';
import type { Manifest, TirazConfig, VariantNode } from './manifest';
import { loadManifest, saveManifest, upsertNode } from './manifest';
import type { JudgeCandidate, RankingJudge } from './taste-judge';
import { runTasteRanking } from './taste-judge';

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
  /** The listwise vision judge (one call ranks the whole generation). */
  judge: RankingJudge;
  /** Vision model for the ranking call (`agent.judgeModel`); defaults to `DEFAULT_JUDGE_MODEL`. */
  judgeModel?: string;
  weights: TirazConfig['fitness']['weights'];
  /**
   * Whether a failed lint floor zeroes the composite (`fitness.lintFloorRequired`). Defaults to
   * true here; the CLI passes the config value (false by default — the floor is advisory).
   */
  lintGate?: boolean;
  /**
   * Read a variant's changed UI files. When set, each node gets the "Claude tells" scan (folded into
   * the composite via `tellPenalty`) and the generation is checked for near-duplicates.
   */
  scan?: (node: VariantNode) => Promise<SourceFile[]>;
  /** Brand typefaces exempt from the overused-font tell. */
  exemptFonts?: readonly string[];
  /** Override the overused-font check (the curated type library). */
  isOverusedFont?: (family: string) => boolean;
  /** `fitness.tellPenalty` (default 0.3). */
  tellPenalty?: number;
  /** Called with the generation's near-duplicate pairs (similarity ≥ 0.6), when `scan` is set. */
  onNearDuplicates?: (pairs: SimilarPair[]) => void;
  /** Compact BRAND.md excerpt for the judge (what's unique, what's off-limits). */
  brand?: string;
  /** The owner's taste notes (TASTE.md) for the judge. */
  taste?: string;
  /** Screenshots of reference sites the owner loves, shown to the judge as the bar. */
  referencePaths?: string[];
}

/** `{ tells }` when a report exists (keeps exactOptionalPropertyTypes happy). */
function tellsOption(report: TellReport | undefined): { tells?: TellReport } {
  return report === undefined ? {} : { tells: report };
}

/** A node with no screenshot can't be taste-judged; it gets a zero taste term. */
const ABSENT_TASTE: TasteResult = { rank: 0, derivedScore: 0, panel: [] };

/**
 * Score every variant in a generation (SPEC §9): compute the lint floor and design-system
 * adherence per node, rank the generation with one listwise judge call, assemble each node's
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

  // Lint, DS-adherence, and the tells scan are deterministic and local, so every node is computed
  // in parallel.
  const lintResults = new Map<string, LintResult>();
  const dsResults = new Map<string, DsAdherenceResult>();
  const tellResults = new Map<string, TellReport>();
  const prints: ReturnType<typeof fingerprint>[] = [];
  const brandColors = Object.entries(deps.designSystem.tokens)
    .filter(([category]) => category === 'color')
    .flatMap(([, values]) => values);
  await Promise.all(
    nodes.map(async (node) => {
      const [lintResult, used, files] = await Promise.all([
        deps.lint(node),
        deps.collectUsedValues(node),
        deps.scan?.(node),
      ]);
      if (files !== undefined) {
        const report = detectTells(files, {
          ...(deps.exemptFonts !== undefined ? { exemptFonts: deps.exemptFonts } : {}),
          ...(deps.isOverusedFont !== undefined ? { isOverusedFont: deps.isOverusedFont } : {}),
        });
        tellResults.set(node.genome.id, report);
        // Brand colour tokens are shared by design, so they don't count toward similarity.
        prints.push(fingerprint(node.genome.id, files, report, brandColors));
      }
      lintResults.set(node.genome.id, lintResult);
      dsResults.set(
        node.genome.id,
        scoreDsAdherence(deps.designSystem, used, {
          ...(node.genome.sources !== undefined ? { whitelistedSources: node.genome.sources } : {}),
        }),
      );
    }),
  );

  const candidates: JudgeCandidate[] = [];
  for (const node of nodes) {
    if (node.screenshot !== undefined) {
      // Judge each option against its OWN stated direction (SPEC §9): prefer the per-variant
      // `excellence` line, falling back to its ethos. Absent for variants with no stated direction.
      const direction = node.genome.excellence ?? node.genome.ethos;
      const intent =
        node.genome.signature !== undefined
          ? `${direction ?? ''}${direction !== undefined ? ' ' : ''}Signature: ${node.genome.signature}`
          : direction;
      candidates.push({
        id: node.genome.id,
        screenshotPath: node.screenshot,
        ...(intent !== undefined ? { intent } : {}),
      });
    }
  }
  if (deps.scan !== undefined) {
    prints.sort((p, q) => p.id.localeCompare(q.id));
    deps.onNearDuplicates?.(nearDuplicates(prints));
  }

  const brief = nodes[0]?.genome.brief ?? '';
  const taste = await runTasteRanking(candidates, {
    brief,
    judge: deps.judge,
    ...(deps.judgeModel !== undefined ? { model: deps.judgeModel } : {}),
    ...(deps.brand !== undefined && deps.brand !== '' ? { brand: deps.brand } : {}),
    ...(deps.taste !== undefined && deps.taste !== '' ? { taste: deps.taste } : {}),
    ...(deps.referencePaths !== undefined && deps.referencePaths.length > 0
      ? { references: deps.referencePaths }
      : {}),
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
      {
        lintGate: deps.lintGate ?? true,
        ...tellsOption(tellResults.get(node.genome.id)),
        ...(deps.tellPenalty !== undefined ? { tellPenalty: deps.tellPenalty } : {}),
      },
    );
    updated = upsertNode(updated, { ...node, fitness, status: 'scored' });
  }

  await saveManifest(cwd, updated);
  return updated;
}
