import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Agent } from './agent';
import { spawnRunner } from './agent';
import type { GenDeps } from './gen';
import type { Renderer } from './render';
import {
  SearchError,
  breedGeneration,
  generateGeneration,
  recombineVariant,
  seedGenomes,
} from './search';
import { TirazConfigSchema } from './config';
import { loadManifest } from './manifest';

const tmpDirs: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** A greenfield git repo so round-0 spans both primaries. */
async function initRepo(): Promise<string> {
  const dir = await tempDir('tiraz-search-');
  await spawnRunner('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await spawnRunner('git', ['config', 'user.email', 'test@tiraz.dev'], { cwd: dir });
  await spawnRunner('git', ['config', 'user.name', 'Tiraz Test'], { cwd: dir });
  await writeFile(
    path.join(dir, 'tiraz.config.json'),
    JSON.stringify({ mode: 'greenfield' }),
    'utf8',
  );
  await writeFile(path.join(dir, 'README.md'), '# fixture\n', 'utf8');
  await spawnRunner('git', ['add', '-A'], { cwd: dir });
  await spawnRunner('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

async function skillsSource(): Promise<string> {
  const dir = await tempDir('tiraz-skills-');
  // Includes the overlay skills the diverse seed profiles resolve to (minimalist/brutalist/soft).
  for (const id of [
    'frontend-design',
    'impeccable',
    'design-taste-frontend',
    'minimalist-ui',
    'industrial-brutalist-ui',
    'high-end-visual-design',
  ]) {
    await mkdir(path.join(dir, id), { recursive: true });
    await writeFile(path.join(dir, id, 'SKILL.md'), `# ${id}\n`, 'utf8');
  }
  return dir;
}

const okAgent: Agent = { run: () => Promise.resolve({ ok: true, exitCode: 0, output: 'done' }) };
const fakeRenderer: Renderer = {
  render: async (req) => {
    await writeFile(req.screenshotPath, 'png', 'utf8');
    return {
      renderUrl: `http://localhost:${String(req.port)}/`,
      screenshotPath: req.screenshotPath,
    };
  },
};

async function deps(): Promise<GenDeps> {
  return {
    agent: okAgent,
    renderer: fakeRenderer,
    skillsSourceDir: await skillsSource(),
    runner: spawnRunner,
    now: () => '2026-06-08T00:00:00.000Z',
  };
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('seedGenomes', () => {
  it('spans both primaries and gives each variant a distinct overlay+dial profile', () => {
    const config = TirazConfigSchema.parse({ mode: 'greenfield' });
    const genomes = seedGenomes(config, 5, {
      brief: 'b',
      createdAt: '2026-06-08T00:00:00.000Z',
      generation: 0,
    });
    expect(genomes.map((g) => g.id)).toEqual(['g0-n0', 'g0-n1', 'g0-n2', 'g0-n3', 'g0-n4']);
    expect(genomes[0]?.primary).toBe('impeccable');
    expect(genomes[1]?.primary).toBe('design-taste-frontend');
    // A round of 5 must use all 5 distinct profiles — every overlay+dial profile is unique (a
    // regression guard: the old offset collapsed this to 3 profiles, skipping minimalist + soft).
    const profiles = genomes.map((g) => `${g.overlay}|${JSON.stringify(g.dials)}`);
    expect(new Set(profiles).size).toBe(5);
  });
});

describe('generateGeneration', () => {
  it('produces a generation of diverse variants and records it', async () => {
    const repo = await initRepo();
    const nodes = await generateGeneration(
      { cwd: repo, brief: 'A landing page', count: 2, harness: 'storybook' },
      await deps(),
    );

    expect(nodes.map((n) => n.genome.id)).toEqual(['g0-n0', 'g0-n1']);
    expect(nodes.map((n) => n.genome.primary)).toEqual(['impeccable', 'design-taste-frontend']);
    expect(nodes.map((n) => n.devPort)).toEqual([41000, 41001]);
    expect(await exists(nodes[0]!.worktree)).toBe(true);

    const manifest = await loadManifest(repo);
    expect(manifest?.generations).toEqual([['g0-n0', 'g0-n1']]);
    expect(Object.keys(manifest?.nodes ?? {}).sort()).toEqual(['g0-n0', 'g0-n1']);
  });

  it('rejects a count below 1', async () => {
    const repo = await initRepo();
    await expect(
      generateGeneration({ cwd: repo, brief: 'b', count: 0, harness: 'storybook' }, await deps()),
    ).rejects.toBeInstanceOf(SearchError);
  });
});

describe('breedGeneration', () => {
  it('mutates a survivor into a new generation of children', async () => {
    const repo = await initRepo();
    const d = await deps();
    await generateGeneration({ cwd: repo, brief: 'b', count: 1, harness: 'storybook' }, d);

    const children = await breedGeneration(
      { cwd: repo, survivors: ['g0-n0'], factor: 2, harness: 'storybook' },
      d,
    );

    expect(children.map((c) => c.genome.id)).toEqual(['g1-n0', 'g1-n1']);
    expect(children.every((c) => c.genome.parents[0] === 'g0-n0')).toBe(true);
    // Distinct mutations from index 0 and 1.
    expect(children[0]?.genome.dials).not.toEqual(children[1]?.genome.dials);

    const manifest = await loadManifest(repo);
    expect(manifest?.generations).toEqual([['g0-n0'], ['g1-n0', 'g1-n1']]);
  });

  it('throws with no survivors', async () => {
    const repo = await initRepo();
    await expect(
      breedGeneration({ cwd: repo, survivors: [], harness: 'storybook' }, await deps()),
    ).rejects.toBeInstanceOf(SearchError);
  });

  it('throws when a survivor id is unknown', async () => {
    const repo = await initRepo();
    const d = await deps();
    await generateGeneration({ cwd: repo, brief: 'b', count: 1, harness: 'storybook' }, d);
    await expect(
      breedGeneration({ cwd: repo, survivors: ['nope'], harness: 'storybook' }, d),
    ).rejects.toBeInstanceOf(SearchError);
  });
});

describe('recombineVariant', () => {
  it('grafts two parents into a single child of a new generation', async () => {
    const repo = await initRepo();
    const d = await deps();
    await generateGeneration({ cwd: repo, brief: 'b', count: 2, harness: 'storybook' }, d);

    const child = await recombineVariant(
      {
        cwd: repo,
        parentA: 'g0-n0',
        parentB: 'g0-n1',
        instructions: "A's structure with B's typography",
        axes: ['typography'],
        harness: 'storybook',
      },
      d,
    );

    expect(child.genome.id).toBe('g1-n0');
    expect(child.genome.parents).toEqual(['g0-n0', 'g0-n1']);
    expect(child.genome.graft?.instructions).toBe("A's structure with B's typography");
    expect(child.genome.graft?.axes).toEqual(['typography']);

    const manifest = await loadManifest(repo);
    expect(manifest?.generations).toEqual([['g0-n0', 'g0-n1'], ['g1-n0']]);
  });

  it('rejects an empty graft instruction', async () => {
    const repo = await initRepo();
    const d = await deps();
    await generateGeneration({ cwd: repo, brief: 'b', count: 2, harness: 'storybook' }, d);
    await expect(
      recombineVariant({ cwd: repo, parentA: 'g0-n0', parentB: 'g0-n1', instructions: '   ' }, d),
    ).rejects.toBeInstanceOf(SearchError);
  });

  it('throws when a parent is unknown', async () => {
    const repo = await initRepo();
    const d = await deps();
    await generateGeneration({ cwd: repo, brief: 'b', count: 1, harness: 'storybook' }, d);
    await expect(
      recombineVariant({ cwd: repo, parentA: 'g0-n0', parentB: 'nope', instructions: 'graft' }, d),
    ).rejects.toBeInstanceOf(SearchError);
  });
});
