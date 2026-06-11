import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Agent } from './agent';
import { spawnRunner } from './agent';
import { updateConfig } from './config';
import { GenError, runGen } from './gen';
import { loadManifest } from './manifest';
import type { Renderer } from './render';

const tmpDirs: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

async function initRepo(): Promise<string> {
  const dir = await tempDir('tiraz-gen-');
  await spawnRunner('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await spawnRunner('git', ['config', 'user.email', 'test@tiraz.dev'], { cwd: dir });
  await spawnRunner('git', ['config', 'user.name', 'Tiraz Test'], { cwd: dir });
  await writeFile(path.join(dir, 'README.md'), '# fixture\n', 'utf8');
  await spawnRunner('git', ['add', '-A'], { cwd: dir });
  await spawnRunner('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

/** A bundled-skills source dir with the skills integration mode resolves to. */
async function skillsSource(): Promise<string> {
  const dir = await tempDir('tiraz-skills-');
  for (const id of ['frontend-design', 'redesign-existing-projects']) {
    await mkdir(path.join(dir, id), { recursive: true });
    await writeFile(path.join(dir, id, 'SKILL.md'), `# ${id}\n`, 'utf8');
  }
  return dir;
}

const okAgent: Agent = {
  run: () => Promise.resolve({ ok: true, exitCode: 0, output: 'done' }),
};

const fakeRenderer: Renderer = {
  render: async (req) => {
    await writeFile(req.screenshotPath, 'fake-png', 'utf8');
    return {
      renderUrl: `http://localhost:${String(req.port)}/`,
      screenshotPath: req.screenshotPath,
    };
  },
};

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

describe('runGen', () => {
  it('produces a worktree with installed skills, a screenshot, and a manifest node', async () => {
    const repo = await initRepo();
    const skillsSourceDir = await skillsSource();

    const node = await runGen(
      {
        cwd: repo,
        brief: 'A hero section',
        target: 'component:src/Hero.tsx',
        harness: 'storybook',
      },
      {
        agent: okAgent,
        renderer: fakeRenderer,
        skillsSourceDir,
        now: () => '2026-06-08T00:00:00.000Z',
      },
    );

    // Node shape
    expect(node.genome.id).toBe('g0-n0');
    expect(node.status).toBe('generated');
    expect(node.branch).toBe('tiraz/g0-n0');
    expect(node.devPort).toBe(41000);
    expect(node.renderUrl).toBe('http://localhost:41000/');
    expect(node.genome.target).toBe('component:src/Hero.tsx');
    // Integration mode forces the redesign primary.
    expect(node.genome.primary).toBe('redesign-existing-projects');

    // Worktree created and resolved skills installed into it.
    expect(await exists(node.worktree)).toBe(true);
    const skillsDir = path.join(node.worktree, '.claude', 'skills');
    expect(await exists(path.join(skillsDir, 'frontend-design', 'SKILL.md'))).toBe(true);
    expect(await exists(path.join(skillsDir, 'redesign-existing-projects', 'SKILL.md'))).toBe(true);

    // Screenshot captured.
    expect(await exists(node.screenshot ?? '')).toBe(true);

    // Manifest persisted with the node and a recorded generation.
    const manifest = await loadManifest(repo);
    expect(manifest?.nodes['g0-n0']?.status).toBe('generated');
    expect(manifest?.generations).toEqual([['g0-n0']]);
  });

  it('passes the configured Tier-2 sources to the genome', async () => {
    const repo = await initRepo();
    const skillsSourceDir = await skillsSource();
    const node = await runGen(
      { cwd: repo, brief: 'b', harness: 'storybook' },
      {
        agent: okAgent,
        renderer: fakeRenderer,
        skillsSourceDir,
        now: () => '2026-06-08T00:00:00.000Z',
      },
    );
    expect(node.genome.sources).toEqual([
      'react-bits',
      '21st-registry',
      'cult-ui',
      'motion-primitives',
      'kokonut-ui',
      'smoothui',
      'eldora-ui',
    ]);
  });

  it('increments the generation and assigns a fresh port on a second run', async () => {
    const repo = await initRepo();
    const skillsSourceDir = await skillsSource();
    const deps = {
      agent: okAgent,
      renderer: fakeRenderer,
      skillsSourceDir,
      runner: spawnRunner,
      now: () => '2026-06-08T00:00:00.000Z',
    };

    const first = await runGen({ cwd: repo, brief: 'one', harness: 'storybook' }, deps);
    const second = await runGen({ cwd: repo, brief: 'two', harness: 'storybook' }, deps);

    expect(first.genome.id).toBe('g0-n0');
    expect(second.genome.id).toBe('g1-n0');
    expect(first.devPort).toBe(41000);
    expect(second.devPort).toBe(41001);

    const manifest = await loadManifest(repo);
    expect(manifest?.generations).toEqual([['g0-n0'], ['g1-n0']]);
    expect(Object.keys(manifest?.nodes ?? {}).sort()).toEqual(['g0-n0', 'g1-n0']);
  });

  it('runs a second self-critique agent pass + re-render when generation.selfCritique is on', async () => {
    const repo = await initRepo();
    const skillsSourceDir = await skillsSource();

    let agentCalls = 0;
    const prompts: string[] = [];
    const countingAgent: Agent = {
      run: (opts) => {
        agentCalls += 1;
        prompts.push(opts.prompt);
        return Promise.resolve({ ok: true, exitCode: 0, output: 'done' });
      },
    };
    let renderCalls = 0;
    const countingRenderer: Renderer = {
      render: async (req) => {
        renderCalls += 1;
        await writeFile(req.screenshotPath, 'fake-png', 'utf8');
        return {
          renderUrl: `http://localhost:${String(req.port)}/`,
          screenshotPath: req.screenshotPath,
        };
      },
    };

    // Default config has selfCritique on.
    await runGen(
      { cwd: repo, brief: 'A hero section', harness: 'storybook' },
      {
        agent: countingAgent,
        renderer: countingRenderer,
        skillsSourceDir,
        runner: spawnRunner,
        now: () => '2026-06-08T00:00:00.000Z',
      },
    );

    expect(agentCalls).toBe(2);
    expect(renderCalls).toBe(2);
    // The second pass is the self-critique prompt, not a rebuild.
    expect(prompts[1]).toContain('# Tiraz self-critique pass');
    expect(prompts[1]).toContain('## Taste bar — clear it (this is graded)');
  });

  it('runs exactly one agent pass + one render when generation.selfCritique is off', async () => {
    const repo = await initRepo();
    const skillsSourceDir = await skillsSource();
    await updateConfig(repo, (raw) => {
      raw.generation = { selfCritique: false };
    });

    let agentCalls = 0;
    const countingAgent: Agent = {
      run: () => {
        agentCalls += 1;
        return Promise.resolve({ ok: true, exitCode: 0, output: 'done' });
      },
    };
    let renderCalls = 0;
    const countingRenderer: Renderer = {
      render: async (req) => {
        renderCalls += 1;
        await writeFile(req.screenshotPath, 'fake-png', 'utf8');
        return {
          renderUrl: `http://localhost:${String(req.port)}/`,
          screenshotPath: req.screenshotPath,
        };
      },
    };

    await runGen(
      { cwd: repo, brief: 'A hero section', harness: 'storybook' },
      {
        agent: countingAgent,
        renderer: countingRenderer,
        skillsSourceDir,
        runner: spawnRunner,
        now: () => '2026-06-08T00:00:00.000Z',
      },
    );

    expect(agentCalls).toBe(1);
    expect(renderCalls).toBe(1);
  });

  it('keeps the first render when the self-critique pass fails (variant not discarded)', async () => {
    const repo = await initRepo();
    const skillsSourceDir = await skillsSource();

    let agentCalls = 0;
    const flakyAgent: Agent = {
      run: () => {
        agentCalls += 1;
        // First pass succeeds; the self-critique pass fails.
        return Promise.resolve(
          agentCalls === 1
            ? { ok: true, exitCode: 0, output: 'done' }
            : { ok: false, exitCode: 1, output: 'critique boom' },
        );
      },
    };
    let renderCalls = 0;
    const countingRenderer: Renderer = {
      render: async (req) => {
        renderCalls += 1;
        await writeFile(req.screenshotPath, 'fake-png', 'utf8');
        return {
          renderUrl: `http://localhost:${String(req.port)}/`,
          screenshotPath: req.screenshotPath,
        };
      },
    };

    const node = await runGen(
      { cwd: repo, brief: 'A hero section', harness: 'storybook' },
      {
        agent: flakyAgent,
        renderer: countingRenderer,
        skillsSourceDir,
        runner: spawnRunner,
        now: () => '2026-06-08T00:00:00.000Z',
      },
    );

    // Critique pass ran but failed → no re-commit, no re-render; the first render is kept.
    expect(agentCalls).toBe(2);
    expect(renderCalls).toBe(1);
    expect(node.status).toBe('generated');
    expect(await exists(node.screenshot ?? '')).toBe(true);
  });

  it('throws GenError when the agent fails', async () => {
    const repo = await initRepo();
    const skillsSourceDir = await skillsSource();
    const failAgent: Agent = {
      run: () => Promise.resolve({ ok: false, exitCode: 1, output: 'boom' }),
    };

    await expect(
      runGen(
        { cwd: repo, brief: 'A hero section', harness: 'storybook' },
        {
          agent: failAgent,
          renderer: fakeRenderer,
          skillsSourceDir,
          now: () => '2026-06-08T00:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(GenError);
  });
});
