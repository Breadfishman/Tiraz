import { describe, expect, it } from 'vitest';
import {
  RenderHarnessError,
  harnessBuildCommand,
  harnessServeCommand,
  parseTarget,
  resolveRenderUrl,
  resolveRenderUrlAt,
  waitForServer,
} from './render-harness';

describe('parseTarget', () => {
  it('parses the prefixed forms', () => {
    expect(parseTarget('story:button--primary')).toEqual({
      kind: 'story',
      value: 'button--primary',
    });
    expect(parseTarget('route:/pricing')).toEqual({ kind: 'route', value: '/pricing' });
    expect(parseTarget('component:src/Hero.tsx')).toEqual({
      kind: 'component',
      value: 'src/Hero.tsx',
    });
    expect(parseTarget('dir:src/ui')).toEqual({ kind: 'dir', value: 'src/ui' });
  });

  it('falls back to a bare path for unknown/absent prefixes', () => {
    expect(parseTarget('src/Hero.tsx')).toEqual({ kind: 'path', value: 'src/Hero.tsx' });
    expect(parseTarget('https://x/y')).toEqual({ kind: 'path', value: 'https://x/y' });
  });
});

describe('harnessServeCommand', () => {
  it('boots each playground on the given port', () => {
    expect(harnessServeCommand('storybook', 41000)).toEqual({
      command: 'npx',
      args: ['storybook', 'dev', '-p', '41000', '--no-open', '--quiet'],
    });
    expect(harnessServeCommand('ladle', 41001)?.args).toEqual([
      'ladle',
      'serve',
      '--port',
      '41001',
    ]);
    expect(harnessServeCommand('histoire', 41002)?.args).toEqual([
      'histoire',
      'dev',
      '--port',
      '41002',
    ]);
  });

  it('returns null for harnesses with no managed server', () => {
    expect(harnessServeCommand('scratch', 41000)).toBeNull();
    expect(harnessServeCommand('app', 41000)).toBeNull();
  });
});

describe('harnessBuildCommand', () => {
  it('compiles Storybook and Ladle to an output directory', () => {
    expect(harnessBuildCommand('storybook', '/out/g0-n0')).toEqual({
      command: 'npx',
      args: ['storybook', 'build', '-o', '/out/g0-n0', '--quiet'],
    });
    expect(harnessBuildCommand('ladle', '/out/g0-n0')?.args).toEqual([
      'ladle',
      'build',
      '--outDir',
      '/out/g0-n0',
    ]);
  });

  it('returns null for harnesses with no targetable static build', () => {
    expect(harnessBuildCommand('histoire', '/out')).toBeNull();
    expect(harnessBuildCommand('scratch', '/out')).toBeNull();
    expect(harnessBuildCommand('app', '/out')).toBeNull();
  });
});

describe('resolveRenderUrl', () => {
  it('renders a Storybook story in its isolated iframe', () => {
    expect(resolveRenderUrl('storybook', 'story:button--primary', 41000)).toBe(
      'http://localhost:41000/iframe.html?id=button--primary&viewMode=story',
    );
  });

  it('maps a route/path onto the origin', () => {
    expect(resolveRenderUrl('storybook', 'route:/pricing', 41000)).toBe(
      'http://localhost:41000/pricing',
    );
    expect(resolveRenderUrl('app', 'route:/x', 41000)).toBe('http://localhost:41000/x');
    expect(resolveRenderUrl('app', '', 41000)).toBe('http://localhost:41000');
  });

  it('builds Ladle and Histoire story URLs', () => {
    expect(resolveRenderUrl('ladle', 'story:hero--default', 41000)).toBe(
      'http://localhost:41000/?story=hero--default&mode=preview',
    );
    expect(resolveRenderUrl('histoire', 'story:src/Hero.story.vue', 41000)).toBe(
      'http://localhost:41000/story/src/Hero.story.vue',
    );
  });

  it('rejects combinations that cannot be resolved', () => {
    expect(() => resolveRenderUrl('storybook', 'component:src/Hero.tsx', 41000)).toThrow(
      RenderHarnessError,
    );
    expect(() => resolveRenderUrl('ladle', 'route:/x', 41000)).toThrow(RenderHarnessError);
    expect(() => resolveRenderUrl('scratch', 'story:x', 41000)).toThrow(RenderHarnessError);
  });
});

describe('resolveRenderUrlAt', () => {
  it('renders a story under a mount-prefixed base on one server', () => {
    expect(
      resolveRenderUrlAt('storybook', 'story:hero--default', 'http://localhost:4317/v/g0-n0'),
    ).toBe('http://localhost:4317/v/g0-n0/iframe.html?id=hero--default&viewMode=story');
  });

  it('tolerates a trailing slash on the base', () => {
    expect(
      resolveRenderUrlAt('storybook', 'story:hero--default', 'http://localhost:4317/v/g0-n0/'),
    ).toBe('http://localhost:4317/v/g0-n0/iframe.html?id=hero--default&viewMode=story');
  });
});

describe('waitForServer', () => {
  it('resolves as soon as a request completes', async () => {
    let calls = 0;
    await waitForServer('http://localhost:41000', {
      fetchImpl: () => {
        calls += 1;
        if (calls < 3) {
          return Promise.reject(new Error('ECONNREFUSED'));
        }
        return Promise.resolve({ ok: false, status: 404 });
      },
      delayMs: 0,
      sleep: () => Promise.resolve(),
    });
    expect(calls).toBe(3);
  });

  it('throws after exhausting attempts', async () => {
    await expect(
      waitForServer('http://localhost:41000', {
        fetchImpl: () => Promise.reject(new Error('down')),
        attempts: 3,
        delayMs: 0,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toBeInstanceOf(RenderHarnessError);
  });
});
