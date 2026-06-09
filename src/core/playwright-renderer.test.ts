import { describe, expect, it } from 'vitest';
import type { DetectedHarness, HarnessKind } from './detect';
import type { RenderRequest } from './render';
import {
  PlaywrightRenderer,
  type ScreenshotOptions,
  type ServerProcess,
} from './playwright-renderer';
import { RenderHarnessError } from './render-harness';

interface Recorder {
  events: string[];
  screenshots: { url: string; path: string; opts: ScreenshotOptions }[];
  stopped: number;
}

function request(harness: HarnessKind, target: string): RenderRequest {
  const detected: DetectedHarness = { kind: harness, reason: 'test' };
  return {
    worktreeDir: '/wt/g0-n0',
    harness: detected,
    target,
    port: 41000,
    screenshotPath: '/shots/g0-n0.png',
  };
}

/** A renderer wired to fakes that record the orchestration order. */
function fakeRenderer(opts: { screenshotFails?: boolean } = {}): {
  renderer: PlaywrightRenderer;
  rec: Recorder;
} {
  const rec: Recorder = { events: [], screenshots: [], stopped: 0 };
  const server: ServerProcess = {
    stop: () => {
      rec.events.push('stop');
      rec.stopped += 1;
      return Promise.resolve();
    },
  };
  const renderer = new PlaywrightRenderer({
    launchServer: (_cmd, o) => {
      rec.events.push(`launch:${o.cwd}`);
      return server;
    },
    waitForServer: (origin) => {
      rec.events.push(`wait:${origin}`);
      return Promise.resolve();
    },
    screenshot: (url, path, sOpts) => {
      rec.events.push('screenshot');
      rec.screenshots.push({ url, path, opts: sOpts });
      return opts.screenshotFails ? Promise.reject(new Error('shot failed')) : Promise.resolve();
    },
  });
  return { renderer, rec };
}

describe('PlaywrightRenderer', () => {
  it('boots, waits, screenshots the resolved URL, then tears down — in order', async () => {
    const { renderer, rec } = fakeRenderer();

    const result = await renderer.render(request('storybook', 'story:button--primary'));

    expect(rec.events).toEqual([
      'launch:/wt/g0-n0',
      'wait:http://localhost:41000',
      'screenshot',
      'stop',
    ]);
    expect(result).toEqual({
      renderUrl: 'http://localhost:41000/iframe.html?id=button--primary&viewMode=story',
      screenshotPath: '/shots/g0-n0.png',
    });
    expect(rec.screenshots[0]?.url).toBe(result.renderUrl);
    expect(rec.screenshots[0]?.opts).toEqual({
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      timeoutMs: 30_000,
    });
  });

  it('tears the server down even when the screenshot fails', async () => {
    const { renderer, rec } = fakeRenderer({ screenshotFails: true });
    await expect(renderer.render(request('storybook', 'story:x'))).rejects.toThrow('shot failed');
    expect(rec.stopped).toBe(1);
    expect(rec.events.at(-1)).toBe('stop');
  });

  it('rejects an unsupported harness before launching anything', async () => {
    const { renderer, rec } = fakeRenderer();
    await expect(renderer.render(request('scratch', 'story:x'))).rejects.toBeInstanceOf(
      RenderHarnessError,
    );
    expect(rec.events).toEqual([]);
  });

  it('honours a custom viewport + timeout', async () => {
    const rec: Recorder = { events: [], screenshots: [], stopped: 0 };
    const renderer = new PlaywrightRenderer({
      launchServer: () => ({
        stop: () => Promise.resolve(),
      }),
      waitForServer: () => Promise.resolve(),
      screenshot: (_u, _p, o) => {
        rec.screenshots.push({ url: _u, path: _p, opts: o });
        return Promise.resolve();
      },
      viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
      timeoutMs: 5_000,
    });
    await renderer.render(request('storybook', 'story:x'));
    expect(rec.screenshots[0]?.opts).toEqual({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      timeoutMs: 5_000,
    });
  });
});
