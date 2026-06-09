import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { playwrightScreenshot } from './playwright-io';

const PNG_MAGIC = '89504e470d0a1a0a';

/**
 * Live proof that the real `playwrightScreenshot` boundary works (Playwright + headless Chromium).
 * Skipped by default — it needs a browser (`npx playwright install chromium`). Run with:
 *   TIRAZ_E2E=1 npx vitest run src/core/playwright-io.e2e.test.ts
 */
describe.skipIf(process.env.TIRAZ_E2E !== '1')('playwrightScreenshot (live)', () => {
  let server: Server;
  let url = '';
  let dir = '';

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><body style="background:#10b981"><h1>Tiraz</h1></body></html>');
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://localhost:${String((server.address() as AddressInfo).port)}/`;
    dir = await mkdtemp(path.join(tmpdir(), 'tiraz-shot-'));
  });

  afterAll(async () => {
    server.close();
    if (dir !== '') await rm(dir, { recursive: true, force: true });
  });

  it('navigates a real headless browser to a page and writes a valid PNG', async () => {
    const out = path.join(dir, 'shot.png');
    await playwrightScreenshot(url, out, {
      width: 800,
      height: 600,
      deviceScaleFactor: 1,
      timeoutMs: 15_000,
    });
    expect((await stat(out)).size).toBeGreaterThan(0);
    const header = (await readFile(out)).subarray(0, 8).toString('hex');
    expect(header).toBe(PNG_MAGIC);
  }, 60_000);
});
