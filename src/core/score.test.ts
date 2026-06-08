import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import type { DesignSystem } from './ds-adherence';
import type { LintResult } from './lint';
import type { Manifest, VariantNode } from './manifest';
import { createManifest, recordGeneration, saveManifest, upsertNode } from './manifest';
import { ScoreError, runScore } from './score';
import type { PairwiseJudge } from './taste-judge';

const tmpDirs: string[] = [];
const config = TirazConfigSchema.parse({});
const weights = config.fitness.weights;

const designSystem: DesignSystem = { tokens: { color: ['#111'] }, components: ['Button'] };

const passingLint: LintResult = { passed: true, score: 100, violations: [] };

const preferAJudge: PairwiseJudge = {
  compare: (a, b) => Promise.resolve({ winner: a.id === 'g0-n0' ? a.id : b.id, rationale: 'r' }),
};

function node(id: string): VariantNode {
  return {
    genome: {
      id,
      parents: [],
      primary: 'impeccable',
      overlay: 'none',
      dials: { variance: 5, motion: 5, density: 5 },
      commands: [],
      seed: 0,
      brief: 'hero',
      createdAt: '2026-06-08T00:00:00.000Z',
    },
    generation: 0,
    branch: `tiraz/${id}`,
    worktree: `/wt/${id}`,
    screenshot: `/wt/${id}/shot.png`,
    fitness: null,
    status: 'generated',
  };
}

async function seedManifest(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-score-'));
  tmpDirs.push(dir);
  let m: Manifest = createManifest('demo', 'integration', config);
  m = upsertNode(m, node('g0-n0'));
  m = upsertNode(m, node('g0-n1'));
  m = recordGeneration(m, ['g0-n0', 'g0-n1']);
  await saveManifest(dir, m);
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('runScore', () => {
  it('writes a complete three-term fitness onto every node in the generation', async () => {
    const dir = await seedManifest();
    const updated = await runScore(dir, 0, {
      lint: () => Promise.resolve(passingLint),
      designSystem,
      collectUsedValues: () =>
        Promise.resolve({ values: { color: ['#111'] }, components: ['Button'] }),
      judge: preferAJudge,
      weights,
    });

    for (const id of ['g0-n0', 'g0-n1']) {
      const n = updated.nodes[id];
      expect(n?.status).toBe('scored');
      expect(n?.fitness).not.toBeNull();
      expect(n?.fitness?.lintFloor.passed).toBe(true);
      expect(n?.fitness?.dsAdherence.score).toBe(100); // all used values on-system
      expect(typeof n?.fitness?.taste.derivedScore).toBe('number');
      expect(typeof n?.fitness?.composite).toBe('number');
    }
    // g0-n0 is consistently preferred → better taste rank.
    expect(updated.nodes['g0-n0']?.fitness?.taste.rank).toBe(1);
    expect(updated.nodes['g0-n1']?.fitness?.taste.rank).toBe(2);
  });

  it('zeroes the composite for a variant that fails the lint floor', async () => {
    const dir = await seedManifest();
    const failing: LintResult = {
      passed: false,
      score: 40,
      violations: [{ rule: 'x', severity: 25, detail: 'bad' }],
    };
    const updated = await runScore(dir, 0, {
      lint: (n) => Promise.resolve(n.genome.id === 'g0-n1' ? failing : passingLint),
      designSystem,
      collectUsedValues: () => Promise.resolve({ values: {}, components: [] }),
      judge: preferAJudge,
      weights,
    });
    expect(updated.nodes['g0-n1']?.fitness?.composite).toBe(0);
    expect(updated.nodes['g0-n1']?.fitness?.lintFloor.passed).toBe(false);
    expect(updated.nodes['g0-n0']?.fitness?.composite).not.toBe(0);
  });

  it('throws ScoreError when there is no manifest', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-score-empty-'));
    tmpDirs.push(dir);
    await expect(
      runScore(dir, 0, {
        lint: () => Promise.resolve(passingLint),
        designSystem,
        collectUsedValues: () => Promise.resolve({ values: {}, components: [] }),
        judge: preferAJudge,
        weights,
      }),
    ).rejects.toBeInstanceOf(ScoreError);
  });

  it('throws ScoreError for a non-existent generation', async () => {
    const dir = await seedManifest();
    await expect(
      runScore(dir, 5, {
        lint: () => Promise.resolve(passingLint),
        designSystem,
        collectUsedValues: () => Promise.resolve({ values: {}, components: [] }),
        judge: preferAJudge,
        weights,
      }),
    ).rejects.toBeInstanceOf(ScoreError);
  });
});
