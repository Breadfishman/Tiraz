import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIG_FILENAME,
  ConfigError,
  TirazConfigSchema,
  describeError,
  isErrnoException,
  loadConfig,
  updateConfig,
} from './config';

const tmpDirs: string[] = [];

async function makeProject(configContents?: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-config-'));
  tmpDirs.push(dir);
  if (configContents !== undefined) {
    await writeFile(path.join(dir, CONFIG_FILENAME), configContents, 'utf8');
  }
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('TirazConfigSchema', () => {
  it('resolves an empty object to the documented defaults', () => {
    const config = TirazConfigSchema.parse({});
    expect(config.mode).toBe('integration');
    expect(config.primary).toBe('impeccable');
    expect(config.pruning).toBe('lint-gated');
    expect(config.dials).toEqual({ variance: 5, motion: 5, density: 5 });
    expect(config.beam).toEqual({ width: 2, factor: 3, maxDepth: 3 });
    expect(config.fitness.weights).toEqual({ dsAdherence: 0.5, taste: 0.5 });
    expect(config.sources).toEqual({
      bundled: ['magic-ui'],
      fetch: [
        'react-bits',
        '21st-registry',
        'cult-ui',
        'motion-primitives',
        'kokonut-ui',
        'smoothui',
        'eldora-ui',
      ],
      aceternity: false,
      // Genuine component fetching defaults on, with a 6-component-per-variant budget (SPEC §12).
      fetchMode: 'install',
      fetchBudget: 6,
    });
    expect(config.framework).toBe('astro');
    expect(config.lintThreshold).toBe(80);
    expect(config.modules).toEqual({ threeD: false, remotion: false });
    // Self-critique-and-revise second pass is on by default (the headline anti-slop lever); a round
    // materializes up to `concurrency` variants in parallel.
    expect(config.generation).toEqual({ selfCritique: true, concurrency: 4 });
  });

  it('rejects unknown top-level keys (catches config typos)', () => {
    expect(TirazConfigSchema.safeParse({ pruningg: 'lint-gated' }).success).toBe(false);
  });

  it('rejects an out-of-range dial', () => {
    expect(
      TirazConfigSchema.safeParse({ dials: { variance: 11, motion: 5, density: 5 } }).success,
    ).toBe(false);
  });

  it('rejects an invalid enum value', () => {
    expect(TirazConfigSchema.safeParse({ pruning: 'nonsense' }).success).toBe(false);
  });

  it('rejects fitness weights that do not sum to 1', () => {
    const result = TirazConfigSchema.safeParse({
      fitness: { lintFloorRequired: true, weights: { dsAdherence: 0.7, taste: 0.7 } },
    });
    expect(result.success).toBe(false);
  });

  it('defaults fetchMode/fetchBudget for an existing sources block that lacks them (guards demo configs)', () => {
    // An existing-style sources block written before genuine fetching existed: no fetchMode/fetchBudget.
    const result = TirazConfigSchema.safeParse({
      sources: { bundled: ['magic-ui'], fetch: ['cult-ui'], aceternity: false },
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sources.fetchMode).toBe('install');
    expect(result.success && result.data.sources.fetchBudget).toBe(6);
  });

  it('accepts an explicit signatures fetchMode and a custom budget', () => {
    const result = TirazConfigSchema.safeParse({
      sources: {
        bundled: ['magic-ui'],
        fetch: [],
        aceternity: false,
        fetchMode: 'signatures',
        fetchBudget: 0,
      },
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sources.fetchMode).toBe('signatures');
    expect(result.success && result.data.sources.fetchBudget).toBe(0);
  });

  it('rejects an out-of-range fetchBudget', () => {
    expect(
      TirazConfigSchema.safeParse({
        sources: { bundled: [], fetch: [], aceternity: false, fetchBudget: 21 },
      }).success,
    ).toBe(false);
  });

  it('accepts fitness weights that sum to 1', () => {
    const result = TirazConfigSchema.safeParse({
      fitness: { lintFloorRequired: false, weights: { dsAdherence: 0.7, taste: 0.3 } },
    });
    expect(result.success).toBe(true);
  });
});

describe('loadConfig', () => {
  it('returns defaults with a null path when no config file exists', async () => {
    const dir = await makeProject();
    const { config, path: foundPath } = await loadConfig(dir);
    expect(foundPath).toBeNull();
    expect(config.mode).toBe('integration');
  });

  it('reads and validates an existing config file', async () => {
    const dir = await makeProject(JSON.stringify({ mode: 'greenfield', overlay: 'brutalist' }));
    const { config, path: foundPath } = await loadConfig(dir);
    expect(foundPath).toBe(path.join(dir, CONFIG_FILENAME));
    expect(config.mode).toBe('greenfield');
    expect(config.overlay).toBe('brutalist');
    // Untouched fields still resolve to defaults.
    expect(config.primary).toBe('impeccable');
  });

  it('throws ConfigError on malformed JSON', async () => {
    const dir = await makeProject('{ not valid json ');
    await expect(loadConfig(dir)).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError with a readable, field-located message on schema violation', async () => {
    const dir = await makeProject(JSON.stringify({ pruning: 'nope' }));
    await expect(loadConfig(dir)).rejects.toThrow(/pruning/);
  });

  it('reports unknown keys as a root-level issue', async () => {
    const dir = await makeProject(JSON.stringify({ totallyBogus: 1 }));
    await expect(loadConfig(dir)).rejects.toThrow(/\(root\)/);
  });

  it('re-throws non-ENOENT filesystem errors unchanged', async () => {
    const dir = await makeProject();
    // A directory where the config file should be → readFile yields EISDIR, not ENOENT.
    await mkdir(path.join(dir, CONFIG_FILENAME));
    await expect(loadConfig(dir)).rejects.not.toBeInstanceOf(ConfigError);
  });

  it('attaches the offending config path to ConfigError', async () => {
    const dir = await makeProject('{ bad ');
    await expect(loadConfig(dir)).rejects.toMatchObject({
      configPath: path.join(dir, CONFIG_FILENAME),
    });
  });
});

describe('describeError', () => {
  it('returns the message of an Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('returns a string value verbatim', () => {
    expect(describeError('raw string')).toBe('raw string');
  });

  it('falls back for non-Error, non-string values', () => {
    expect(describeError(42)).toBe('unknown error');
  });
});

describe('isErrnoException', () => {
  it('is true for an Error with a string code', () => {
    const err = Object.assign(new Error('nope'), { code: 'ENOENT' });
    expect(isErrnoException(err)).toBe(true);
  });

  it('is false for an Error without a code', () => {
    expect(isErrnoException(new Error('plain'))).toBe(false);
  });

  it('is false for an Error whose code is not a string', () => {
    const err = Object.assign(new Error('numeric'), { code: 123 });
    expect(isErrnoException(err)).toBe(false);
  });

  it('is false for non-Error values', () => {
    expect(isErrnoException('ENOENT')).toBe(false);
  });
});

describe('updateConfig', () => {
  async function readRaw(dir: string): Promise<unknown> {
    return JSON.parse(await readFile(path.join(dir, CONFIG_FILENAME), 'utf8')) as unknown;
  }

  it('creates the config file when none exists', async () => {
    const dir = await makeProject();
    const { config, path: writtenPath } = await updateConfig(dir, (c) => {
      c.overlay = 'soft';
    });
    expect(writtenPath).toBe(path.join(dir, CONFIG_FILENAME));
    expect(config.overlay).toBe('soft');
    expect(await readRaw(dir)).toEqual({ overlay: 'soft' });
  });

  it('preserves existing keys and only patches the requested field', async () => {
    const dir = await makeProject(JSON.stringify({ mode: 'greenfield' }));
    await updateConfig(dir, (c) => {
      c.primary = 'design-taste-frontend';
    });
    expect(await readRaw(dir)).toEqual({ mode: 'greenfield', primary: 'design-taste-frontend' });
  });

  it('throws ConfigError and leaves the file untouched on an invalid patch', async () => {
    const original = JSON.stringify({ mode: 'greenfield' });
    const dir = await makeProject(original);
    await expect(
      updateConfig(dir, (c) => {
        c.pruning = 'nonsense';
      }),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(await readFile(path.join(dir, CONFIG_FILENAME), 'utf8')).toBe(original);
  });

  it('throws ConfigError on malformed existing JSON', async () => {
    const dir = await makeProject('{ broken ');
    await expect(updateConfig(dir, () => undefined)).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when the existing config is not a JSON object', async () => {
    const dir = await makeProject(JSON.stringify([1, 2, 3]));
    await expect(updateConfig(dir, () => undefined)).rejects.toThrow(/must contain a JSON object/);
  });

  it('re-throws non-ENOENT filesystem errors unchanged', async () => {
    const dir = await makeProject();
    await mkdir(path.join(dir, CONFIG_FILENAME));
    await expect(updateConfig(dir, () => undefined)).rejects.not.toBeInstanceOf(ConfigError);
  });
});
