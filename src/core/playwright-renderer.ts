/**
 * The live {@link Renderer} (SPEC §7 step 1c–1d): boot the harness dev server in a variant's
 * worktree, wait for it, screenshot the scoped target, tear the server down. The process/browser
 * boundaries (`launchServer`, `screenshot`) are injected so this orchestration is fully unit-tested
 * with fakes; the real `spawn` + Playwright implementations live in `playwright-io.ts` (excluded
 * from coverage, like the CLI glue) and are wired by `createPlaywrightRenderer`.
 */

import type { Renderer, RenderRequest, RenderResult } from './render';
import type { ServeCommand } from './render-harness';
import {
  RenderHarnessError,
  harnessServeCommand,
  resolveRenderUrl,
  waitForServer,
} from './render-harness';

/** A running harness dev server that can be stopped. */
export interface ServerProcess {
  stop(): Promise<void>;
}

/** Boots a harness dev server from `cmd` in `opts.cwd` and returns a handle to stop it. */
export type ServerLauncher = (cmd: ServeCommand, opts: { cwd: string }) => ServerProcess;

export interface ScreenshotOptions {
  width: number;
  height: number;
  deviceScaleFactor: number;
  timeoutMs: number;
}

/** Navigates a headless browser to `url` and writes a screenshot to `screenshotPath`. */
export type Screenshotter = (
  url: string,
  screenshotPath: string,
  opts: ScreenshotOptions,
) => Promise<void>;

export interface PlaywrightRendererOptions {
  launchServer: ServerLauncher;
  screenshot: Screenshotter;
  /** Server-readiness poll; defaults to {@link waitForServer} with its defaults. */
  waitForServer?: (origin: string) => Promise<void>;
  viewport?: { width: number; height: number; deviceScaleFactor: number };
  /** Navigation timeout (ms). */
  timeoutMs?: number;
}

const DEFAULT_VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Renders a variant by driving its harness dev server + a headless browser. The actual spawning and
 * browser control are injected (`launchServer` / `screenshot`); the server is always torn down, even
 * if the screenshot fails.
 */
export class PlaywrightRenderer implements Renderer {
  private readonly opts: PlaywrightRendererOptions;

  constructor(opts: PlaywrightRendererOptions) {
    this.opts = opts;
  }

  async render(request: RenderRequest): Promise<RenderResult> {
    const cmd = harnessServeCommand(request.harness.kind, request.port);
    if (cmd === null) {
      throw new RenderHarnessError(
        `No managed dev server for the '${request.harness.kind}' harness (SPEC §11)`,
      );
    }
    const renderUrl = resolveRenderUrl(request.harness.kind, request.target, request.port);
    const origin = `http://localhost:${String(request.port)}`;
    const viewport = this.opts.viewport ?? DEFAULT_VIEWPORT;
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const wait = this.opts.waitForServer ?? ((o: string) => waitForServer(o));

    const server = this.opts.launchServer(cmd, { cwd: request.worktreeDir });
    try {
      await wait(origin);
      await this.opts.screenshot(renderUrl, request.screenshotPath, { ...viewport, timeoutMs });
    } finally {
      await server.stop();
    }

    return { renderUrl, screenshotPath: request.screenshotPath };
  }
}
