import { createReadStream, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Command } from 'commander';
import { z } from 'zod';
import { ClaudeCodeAgent, spawnRunner } from '../core/agent';
import { selectSurvivors } from '../core/beam';
import { describeError, loadConfig } from '../core/config';
import { renderDashboardHtml } from '../core/dashboard';
import { detectHarness } from '../core/detect';
import { loadManifest, saveManifest } from '../core/manifest';
import type { VariantNode } from '../core/manifest';
import { createPlaywrightRenderer, launchServerProcess } from '../core/playwright-io';
import { promoteVariant } from '../core/promote';
import type { ServerProcess } from '../core/playwright-renderer';
import {
  harnessBuildCommand,
  harnessServeCommand,
  resolveRenderUrl,
  resolveRenderUrlAt,
  waitForServer,
} from '../core/render-harness';
import { breedGeneration } from '../core/search';
import { contentTypeFor, safeAssetPath, safeJoin } from '../core/static-serve';
import { assignPort } from '../core/worktree';
import { bundledSkillsDir } from './bundled';
import { openInBrowser } from './open';

interface LiveServer {
  id: string;
  handle: ServerProcess;
}

type JobState =
  | { status: 'running'; message: string }
  | { status: 'done'; message: string }
  | { status: 'error'; error: string };

const SelectBody = z.object({ ids: z.array(z.string()).min(1) });
const PromoteBody = z.object({ id: z.string() });
const BreedBody = z.object({
  ids: z.array(z.string()).min(1),
  factor: z.number().int().min(1).optional(),
});

/** Live render URL for a dev-server variant on a fresh port (reuse its recorded renderUrl). */
function devUrl(node: VariantNode, port: number, harnessKind: string): string | null {
  if (node.renderUrl !== undefined) {
    try {
      const u = new URL(node.renderUrl);
      u.port = String(port);
      return u.toString();
    } catch {
      /* fall through to re-derive */
    }
  }
  try {
    return resolveRenderUrl(
      harnessKind as Parameters<typeof resolveRenderUrl>[0],
      node.genome.target ?? '',
      port,
    );
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw === '' ? {} : (JSON.parse(raw) as unknown));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    req.on('error', reject);
  });
}

/** Register the `dashboard` command: one UI that serves every variant + drives the search live. */
export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description(
      'Serve a centralized UI of every variant; select / breed / promote from it (Ctrl-C to stop).',
    )
    .option('-p, --port <n>', 'Dashboard port', '4317')
    .option('--open', 'Open the dashboard in your browser')
    .option('--dev', 'Use a live dev server per variant instead of static builds')
    .option('--rebuild', 'Force-rebuild cached static sites')
    .action(async (options: { port: string; open?: boolean; dev?: boolean; rebuild?: boolean }) => {
      const cwd = process.cwd();
      const port = Number.parseInt(options.port, 10);
      if (!Number.isInteger(port) || port < 1) {
        console.error(`--port must be a positive integer (got "${options.port}").`);
        process.exitCode = 1;
        return;
      }

      try {
        await runDashboard(cwd, port, options);
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}

async function runDashboard(
  cwd: string,
  port: number,
  options: { open?: boolean; dev?: boolean; rebuild?: boolean },
): Promise<void> {
  const manifest = await loadManifest(cwd);
  if (manifest === null || Object.keys(manifest.nodes).length === 0) {
    console.error('No Tiraz run found here (run `tiraz gen` first).');
    process.exitCode = 1;
    return;
  }
  // Captured non-null fallback for closures (which don't preserve the guard's narrowing).
  const baseManifest = manifest;
  const { config } = await loadConfig(cwd);
  const harness = await detectHarness(cwd, config.harness === 'auto' ? undefined : config.harness);

  const canBuild = harnessBuildCommand(harness.kind, '/probe') !== null;
  const canServe = harnessServeCommand(harness.kind, 0) !== null;
  if (!canBuild && !canServe) {
    console.error(
      `Harness '${harness.kind}' has no playground to embed — the dashboard needs a ` +
        `Storybook / Ladle / Histoire surface.`,
    );
    process.exitCode = 1;
    return;
  }
  const staticMode = options.dev !== true && canBuild;

  // Mutable serving state, shared by the initial mount and any breed-spawned children.
  const staticRoot = path.join(cwd, '.tiraz', 'static');
  const staticMounts = new Map<string, string>();
  const devServers: LiveServer[] = [];
  const endpoints: Record<string, string> = {};
  const usedPorts = new Set<number>([port]);

  const target = (node: VariantNode): string => node.genome.target ?? '';

  /** Build one variant to a cached static dir; `true` if a servable build exists afterwards. */
  async function ensureStaticBuild(node: VariantNode, dir: string): Promise<boolean> {
    const entry = path.join(dir, 'index.html');
    if (options.rebuild !== true && existsSync(entry)) return true;
    if (!existsSync(node.worktree)) return false; // no source to build from (e.g. promoted)
    const cmd = harnessBuildCommand(harness.kind, dir);
    if (cmd === null) return false;
    await rm(dir, { recursive: true, force: true });
    const result = await spawnRunner(cmd.command, cmd.args, { cwd: node.worktree });
    if (result.exitCode !== 0) {
      const tail = result.stderr.trim().split('\n').slice(-2).join(' ');
      console.warn(`  ${node.genome.id} build failed: ${tail}`);
      return false;
    }
    return existsSync(entry);
  }

  /** Mount one variant for serving (static build or dev server) and register its endpoint. */
  async function mountOne(node: VariantNode): Promise<void> {
    const id = node.genome.id;
    if (staticMode) {
      const dir = path.join(staticRoot, id);
      if (!(await ensureStaticBuild(node, dir))) return;
      staticMounts.set(id, dir);
      try {
        endpoints[id] = resolveRenderUrlAt(
          harness.kind,
          target(node),
          `http://localhost:${String(port)}/v/${id}`,
        );
      } catch {
        /* target not resolvable for this harness — shown as not running */
      }
      return;
    }
    const vport = assignPort(usedPorts);
    usedPorts.add(vport);
    const cmd = harnessServeCommand(harness.kind, vport);
    if (cmd === null) return;
    const handle = launchServerProcess(cmd, { cwd: node.worktree });
    devServers.push({ id, handle });
    const url = devUrl(node, vport, harness.kind);
    try {
      await waitForServer(`http://localhost:${String(vport)}`, { attempts: 180 });
      if (url !== null) await waitForServer(url, { attempts: 60 });
      if (url !== null) endpoints[id] = url;
    } catch {
      console.warn(`  ${id} did not become ready (shown as not running)`);
    }
  }

  const servable = (node: VariantNode): boolean =>
    existsSync(node.worktree) ||
    (staticMode && existsSync(path.join(staticRoot, node.genome.id, 'index.html')));
  const toServe = Object.values(manifest.nodes).filter(servable);

  if (staticMode) {
    console.log(
      `Building ${String(toServe.length)} static variant site(s) (first build is slow; cached after)…`,
    );
    let i = 0;
    for (const node of toServe) {
      i += 1;
      console.log(`  [${String(i)}/${String(toServe.length)}] ${node.genome.id}…`);
      await mountOne(node);
    }
  } else {
    console.log(`Booting ${String(toServe.length)} variant dev server(s) (first boot is slow)…`);
    await Promise.all(toServe.map(mountOne));
  }

  // --- breed jobs (long, agent-driven) tracked for the UI to poll ---
  const jobs = new Map<string, JobState>();
  let jobSeq = 0;
  let breedInFlight = false;

  function startBreedJob(ids: string[], factor: number | undefined): string {
    jobSeq += 1;
    const jobId = `job-${String(jobSeq)}`;
    jobs.set(jobId, { status: 'running', message: 'Breeding (running the agent)…' });
    breedInFlight = true;
    void (async () => {
      try {
        const children = await breedGeneration(
          {
            cwd,
            survivors: ids,
            harness: harness.kind,
            ...(factor !== undefined ? { factor } : {}),
          },
          {
            agent: new ClaudeCodeAgent(),
            renderer: createPlaywrightRenderer(),
            skillsSourceDir: bundledSkillsDir(),
          },
        );
        jobs.set(jobId, {
          status: 'running',
          message: `Building ${String(children.length)} new variant(s)…`,
        });
        for (const child of children) await mountOne(child);
        jobs.set(jobId, {
          status: 'done',
          message: `Bred ${String(children.length)} variant(s): ${children
            .map((c) => c.genome.id)
            .join(', ')}`,
        });
      } catch (err) {
        jobs.set(jobId, { status: 'error', error: describeError(err) });
      } finally {
        breedInFlight = false;
      }
    })();
    return jobId;
  }

  // --- request handling ---
  async function handleApi(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    if (url.startsWith('/api/job/')) {
      const jobId = decodeURIComponent(url.slice('/api/job/'.length));
      const state = jobs.get(jobId);
      if (state === undefined) sendJson(res, 404, { error: `Unknown job ${jobId}` });
      else sendJson(res, 200, state);
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    try {
      if (url === '/api/select') {
        const parsed = SelectBody.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Expected { ids: string[] }' });
          return;
        }
        const current = await loadManifest(cwd);
        if (current === null) {
          sendJson(res, 409, { error: 'Manifest disappeared' });
          return;
        }
        await saveManifest(cwd, selectSurvivors(current, parsed.data.ids));
        sendJson(res, 200, { ok: true });
        return;
      }
      if (url === '/api/promote') {
        const parsed = PromoteBody.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Expected { id: string }' });
          return;
        }
        const result = await promoteVariant({ cwd, nodeId: parsed.data.id });
        const message =
          result.mode === 'greenfield'
            ? `Merged ${result.branch} into ${result.base}`
            : `Opened PR${result.prUrl !== undefined ? `: ${result.prUrl}` : ''}`;
        sendJson(res, 200, { ok: true, message });
        return;
      }
      if (url === '/api/breed') {
        const parsed = BreedBody.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Expected { ids: string[], factor?: number }' });
          return;
        }
        if (breedInFlight) {
          sendJson(res, 409, { error: 'A breed job is already running' });
          return;
        }
        const jobId = startBreedJob(parsed.data.ids, parsed.data.factor);
        sendJson(res, 202, { jobId });
        return;
      }
      sendJson(res, 404, { error: 'Unknown action' });
    } catch (err) {
      sendJson(res, 500, { error: describeError(err) });
    }
  }

  function serveAsset(res: ServerResponse, url: string): void {
    const asset = safeAssetPath(url);
    const dir = asset === null ? undefined : staticMounts.get(asset.id);
    const file = asset === null || dir === undefined ? null : safeJoin(dir, asset.relPath);
    if (file === null) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const stream = createReadStream(file);
    stream.on('open', () => {
      res.writeHead(200, { 'content-type': contentTypeFor(file) });
      stream.pipe(res);
    });
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(404);
        res.end('not found');
      }
    });
  }

  async function serveIndex(res: ServerResponse): Promise<void> {
    // Re-read the manifest each load so select/breed/promote changes show on refresh.
    const current = (await loadManifest(cwd)) ?? baseManifest;
    const html = renderDashboardHtml(current, endpoints, { actionsEnabled: true });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    void (async () => {
      try {
        if (method === 'GET' && (url === '/' || url.startsWith('/?'))) await serveIndex(res);
        else if (method === 'GET' && url.startsWith('/v/')) serveAsset(res, url);
        else if (url.startsWith('/api/')) await handleApi(req, res, url.split('?')[0] ?? url);
        else {
          res.writeHead(404);
          res.end('not found');
        }
      } catch {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('internal error');
        }
      }
    })();
  });

  const shutdown = (): void => {
    console.log('\nStopping dashboard…');
    server.close();
    void Promise.all(devServers.map((s) => s.handle.stop())).finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(port, () => {
    const url = `http://localhost:${String(port)}`;
    const mode = staticMode ? 'static builds' : 'dev servers';
    console.log(
      `\nTiraz dashboard → ${url}  (${String(Object.keys(endpoints).length)} live variant(s), ${mode})`,
    );
    console.log('Press Ctrl-C to stop.');
    if (options.open === true) openInBrowser(url);
  });
}
