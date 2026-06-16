/**
 * Real process + browser I/O for the live renderer (SPEC §7). Excluded from unit coverage — it can
 * only be exercised with a real harness server + a Playwright browser — so it is kept thin: every
 * decision lives in the tested {@link PlaywrightRenderer} / `render-harness.ts`. Playwright is an
 * optional dependency; install browsers with `npx playwright install chromium`.
 */

import { spawn } from 'node:child_process';
import { PlaywrightRenderer } from './playwright-renderer';
import type { Screenshotter, ServerLauncher } from './playwright-renderer';

/** Boot a harness dev server as a detached process group so its whole tree can be killed. */
export const launchServerProcess: ServerLauncher = (cmd, opts) => {
  const child = spawn(cmd.command, cmd.args, { cwd: opts.cwd, detached: true, stdio: 'ignore' });
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        const pid = child.pid;
        if (pid === undefined) {
          resolve();
          return;
        }
        child.once('exit', () => {
          resolve();
        });
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          resolve();
          return;
        }
        setTimeout(() => {
          resolve();
        }, 3_000).unref();
      }),
  };
};

/** Screenshot `url` with headless Chromium via Playwright (lazy-imported; optional dependency). */
export const playwrightScreenshot: Screenshotter = async (url, screenshotPath, opts) => {
  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch {
    throw new Error(
      'Playwright is not installed. Run `npm install playwright && npx playwright install chromium`.',
    );
  }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: opts.deviceScaleFactor,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: opts.timeoutMs });
    // Storybook shows a loading spinner until the story finishes preparing; `networkidle` can fire
    // before the story actually paints, so a naive screenshot captures a blank/spinner frame. Wait
    // for the story root to hold real content, then give fonts + entry animations a beat to settle
    // before capturing. Best-effort: a genuinely broken story still yields a (blank) frame after the
    // timeout, so this only fixes false-blanks — it never masks real breakage. The predicate runs in
    // the browser, so it is passed as a string (not typechecked against Node's libs / no DOM lib).
    await page
      .waitForFunction(
        "(() => { const r = document.querySelector('#storybook-root') || document.querySelector('#root'); return !!r && r.children.length > 0 && r.getBoundingClientRect().height > 120; })()",
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => undefined);
    await page.waitForTimeout(3_500);
    await page.screenshot({ path: screenshotPath });
  } finally {
    await browser.close();
  }
};

/** Build a live {@link PlaywrightRenderer} wired to the real process + browser I/O. */
export function createPlaywrightRenderer(): PlaywrightRenderer {
  return new PlaywrightRenderer({
    launchServer: launchServerProcess,
    screenshot: playwrightScreenshot,
  });
}
