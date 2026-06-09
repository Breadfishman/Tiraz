import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adoptProject } from './adopt';
import { loadConfig } from './config';

const tmpDirs: string[] = [];

async function repo(packageJson?: unknown, dirs: string[] = []): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-adopt-'));
  tmpDirs.push(dir);
  if (packageJson !== undefined) {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(packageJson), 'utf8');
  }
  for (const d of dirs) {
    await writeFile(path.join(dir, d), '', 'utf8');
  }
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('adoptProject', () => {
  it('writes an integration config with the detected framework + harness', async () => {
    const cwd = await repo({
      dependencies: { next: '^15', react: '^19' },
      devDependencies: { '@storybook/react': '^8' },
    });

    const result = await adoptProject({ cwd });

    expect(result.framework).toBe('next');
    expect(result.harness).toBe('storybook');

    const { config } = await loadConfig(cwd);
    expect(config.mode).toBe('integration');
    expect(config.framework).toBe('next');
    expect(config.harness).toBe('storybook');
  });

  it('honours an explicit harness override', async () => {
    const cwd = await repo({ dependencies: { astro: '^5' } });
    const result = await adoptProject({ cwd, harness: 'histoire' });
    expect(result.harness).toBe('histoire');
    const { config } = await loadConfig(cwd);
    expect(config.harness).toBe('histoire');
  });

  it('leaves the framework default and harness unset when the stack is unrecognized', async () => {
    const cwd = await repo({ dependencies: { lodash: '^4' } });
    const result = await adoptProject({ cwd });

    // No known framework → keeps the config default (astro); no playground → harness stays 'auto'.
    expect(result.framework).toBe('astro');
    expect(result.harness).toBe('scratch');
    const { config } = await loadConfig(cwd);
    expect(config.mode).toBe('integration');
    expect(config.harness).toBe('auto');
  });
});
