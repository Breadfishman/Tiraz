import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectHarness } from './detect';

const tmpDirs: string[] = [];

async function project(files: {
  packageJson?: unknown;
  dirs?: string[];
  touch?: string[];
}): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-detect-'));
  tmpDirs.push(dir);
  if (files.packageJson !== undefined) {
    const contents =
      typeof files.packageJson === 'string' ? files.packageJson : JSON.stringify(files.packageJson);
    await writeFile(path.join(dir, 'package.json'), contents, 'utf8');
  }
  for (const d of files.dirs ?? []) {
    await mkdir(path.join(dir, d), { recursive: true });
  }
  for (const f of files.touch ?? []) {
    await writeFile(path.join(dir, f), '', 'utf8');
  }
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('detectHarness', () => {
  it('honours an explicit override', async () => {
    const dir = await project({});
    expect(await detectHarness(dir, 'app')).toEqual({
      kind: 'app',
      reason: 'explicit --harness override',
    });
  });

  it('detects Storybook from a .storybook directory', async () => {
    const dir = await project({ dirs: ['.storybook'] });
    expect((await detectHarness(dir)).kind).toBe('storybook');
  });

  it('detects Storybook from a @storybook dependency', async () => {
    const dir = await project({ packageJson: { devDependencies: { '@storybook/react': '^8' } } });
    expect((await detectHarness(dir)).kind).toBe('storybook');
  });

  it('detects Ladle from a dependency', async () => {
    const dir = await project({ packageJson: { dependencies: { '@ladle/react': '^4' } } });
    expect((await detectHarness(dir)).kind).toBe('ladle');
  });

  it('detects Histoire from a config file', async () => {
    const dir = await project({ touch: ['histoire.config.ts'] });
    expect((await detectHarness(dir)).kind).toBe('histoire');
  });

  it('falls back to scratch when no playground is present', async () => {
    const dir = await project({ packageJson: { dependencies: { react: '^19' } } });
    expect((await detectHarness(dir)).kind).toBe('scratch');
  });

  it('treats a missing package.json as no dependencies', async () => {
    const dir = await project({});
    expect((await detectHarness(dir)).kind).toBe('scratch');
  });

  it('treats a malformed package.json as no dependencies', async () => {
    const dir = await project({ packageJson: '{ not json' });
    expect((await detectHarness(dir)).kind).toBe('scratch');
  });
});
