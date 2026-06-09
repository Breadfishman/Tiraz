import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandRunner } from './agent';
import { REMOTION_LICENSE_WARNING } from './capabilities';
import { loadConfig } from './config';
import { ScaffoldError, scaffoldProject } from './scaffold';

const tmpDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-init-'));
  tmpDirs.push(dir);
  return dir;
}

/** A runner that records every command and succeeds. */
function recordingRunner(): {
  runner: CommandRunner;
  calls: { command: string; args: string[] }[];
} {
  const calls: { command: string; args: string[] }[] = [];
  const runner: CommandRunner = (command, args) => {
    calls.push({ command, args });
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  };
  return { runner, calls };
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('scaffoldProject (astro)', () => {
  it('drives astro + tailwind + shadcn, installs the core stack, and writes greenfield config', async () => {
    const cwd = await tempDir();
    const { runner, calls } = recordingRunner();

    const result = await scaffoldProject(
      { cwd, framework: 'astro', modules: { threeD: false, remotion: false } },
      { runner },
    );

    const joined = calls.map((c) => `${c.command} ${c.args.join(' ')}`);
    expect(joined.some((c) => c.includes('create astro@latest'))).toBe(true);
    expect(joined.some((c) => c.includes('astro add tailwind'))).toBe(true);
    expect(joined.some((c) => c.includes('shadcn@latest init'))).toBe(true);
    // Core stack installed (no modules).
    const install = calls.find((c) => c.command === 'npm' && c.args[0] === 'install');
    expect(install?.args).toEqual(['install', 'gsap', 'motion', 'lenis']);

    expect(result.framework).toBe('astro');
    expect(result.installed).toEqual(['gsap', 'motion', 'lenis']);
    expect(result.warnings).toEqual([]);

    const { config } = await loadConfig(cwd);
    expect(config.mode).toBe('greenfield');
    expect(config.framework).toBe('astro');
    expect(config.modules).toEqual({ threeD: false, remotion: false });
  });

  it('adds the 3D stack and surfaces the Remotion warning when both modules are on', async () => {
    const cwd = await tempDir();
    const { runner, calls } = recordingRunner();

    const result = await scaffoldProject(
      { cwd, framework: 'astro', modules: { threeD: true, remotion: true } },
      { runner },
    );

    const install = calls.find((c) => c.command === 'npm' && c.args[0] === 'install');
    expect(install?.args).toEqual(
      expect.arrayContaining(['three', '@react-three/fiber', 'remotion']),
    );
    expect(result.warnings).toEqual([REMOTION_LICENSE_WARNING]);

    const { config } = await loadConfig(cwd);
    expect(config.modules).toEqual({ threeD: true, remotion: true });
  });
});

describe('scaffoldProject (next)', () => {
  it('uses create-next-app (Tailwind built in) and skips the separate tailwind step', async () => {
    const cwd = await tempDir();
    const { runner, calls } = recordingRunner();

    const result = await scaffoldProject(
      { cwd, framework: 'next', modules: { threeD: false, remotion: false } },
      { runner },
    );

    const joined = calls.map((c) => `${c.command} ${c.args.join(' ')}`);
    expect(joined.some((c) => c.includes('create-next-app@latest'))).toBe(true);
    expect(joined.some((c) => c.includes('astro add tailwind'))).toBe(false);
    expect(result.framework).toBe('next');

    const { config } = await loadConfig(cwd);
    expect(config.framework).toBe('next');
  });
});

describe('scaffoldProject (named project)', () => {
  it('scaffolds into a subdirectory when a name is given', async () => {
    const cwd = await tempDir();
    const { runner, calls } = recordingRunner();

    const result = await scaffoldProject(
      { cwd, framework: 'astro', modules: { threeD: false, remotion: false }, projectName: 'site' },
      { runner },
    );

    expect(result.dir).toBe(path.join(cwd, 'site'));
    // The framework CLI receives the project name as its target arg.
    const create = calls.find((c) => c.args.includes('astro@latest'));
    expect(create?.args).toContain('site');
    // Config lands inside the subdirectory.
    const { config } = await loadConfig(path.join(cwd, 'site'));
    expect(config.mode).toBe('greenfield');
  });
});

describe('scaffoldProject (errors)', () => {
  it('surfaces a failed scaffolder command as a ScaffoldError', async () => {
    const cwd = await tempDir();
    const runner: CommandRunner = () =>
      Promise.resolve({ exitCode: 1, stdout: '', stderr: 'network unreachable' });
    const promise = scaffoldProject(
      { cwd, framework: 'astro', modules: { threeD: false, remotion: false } },
      { runner },
    );
    await expect(promise).rejects.toBeInstanceOf(ScaffoldError);
    await expect(promise).rejects.toThrow(/network unreachable/);
  });
});
