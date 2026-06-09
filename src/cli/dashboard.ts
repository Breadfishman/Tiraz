import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Command } from 'commander';
import { describeError, loadConfig } from '../core/config';
import { renderDashboardHtml } from '../core/dashboard';
import { detectHarness } from '../core/detect';
import { loadManifest } from '../core/manifest';
import type { VariantNode } from '../core/manifest';
import { launchServerProcess } from '../core/playwright-io';
import type { ServerProcess } from '../core/playwright-renderer';
import { harnessServeCommand, resolveRenderUrl, waitForServer } from '../core/render-harness';
import { assignPort } from '../core/worktree';
import { openInBrowser } from './open';

interface LiveServer {
  id: string;
  handle: ServerProcess;
  origin: string;
  url: string | null;
  ready: boolean;
}

/** Live render URL for a variant on a fresh port: reuse its recorded renderUrl (port-swapped). */
function liveUrl(node: VariantNode, port: number, harnessKind: string): string | null {
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

/** Register the `dashboard` command: serve one UI that embeds every variant live + interactive. */
export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Serve a centralized UI with every variant live and interactive (Ctrl-C to stop).')
    .option('-p, --port <n>', 'Dashboard port', '4317')
    .option('--open', 'Open the dashboard in your browser')
    .action(async (options: { port: string; open?: boolean }) => {
      const cwd = process.cwd();
      const port = Number.parseInt(options.port, 10);
      if (!Number.isInteger(port) || port < 1) {
        console.error(`--port must be a positive integer (got "${options.port}").`);
        process.exitCode = 1;
        return;
      }

      try {
        const manifest = await loadManifest(cwd);
        if (manifest === null || Object.keys(manifest.nodes).length === 0) {
          console.error('No Tiraz run found here (run `tiraz gen` first).');
          process.exitCode = 1;
          return;
        }
        const { config } = await loadConfig(cwd);
        const harness = await detectHarness(
          cwd,
          config.harness === 'auto' ? undefined : config.harness,
        );
        if (harnessServeCommand(harness.kind, 0) === null) {
          console.error(
            `Harness '${harness.kind}' has no dev server to embed — the dashboard needs a ` +
              `Storybook / Ladle / Histoire playground.`,
          );
          process.exitCode = 1;
          return;
        }

        const toServe = Object.values(manifest.nodes).filter((n) => existsSync(n.worktree));
        console.log(
          `Booting ${String(toServe.length)} variant render server(s) (first boot is slow)…`,
        );

        const used = new Set<number>([port]);
        const servers: LiveServer[] = [];
        for (const node of toServe) {
          const vport = assignPort(used);
          used.add(vport);
          const cmd = harnessServeCommand(harness.kind, vport);
          if (cmd === null) continue;
          servers.push({
            id: node.genome.id,
            handle: launchServerProcess(cmd, { cwd: node.worktree }),
            origin: `http://localhost:${String(vport)}`,
            url: liveUrl(node, vport, harness.kind),
            ready: false,
          });
        }

        await Promise.all(
          servers.map(async (s) => {
            try {
              await waitForServer(s.origin, { attempts: 180 });
              // Warm the actual story URL so its bundle is pre-compiled — Storybook/Vite build the
              // story lazily on first request, so without this the first view shows a blank frame.
              if (s.url !== null) {
                await waitForServer(s.url, { attempts: 60 });
              }
              s.ready = true;
            } catch {
              console.warn(`  ${s.id} did not become ready (shown as not running)`);
            }
          }),
        );

        const endpoints: Record<string, string> = {};
        for (const s of servers) {
          if (s.ready && s.url !== null) endpoints[s.id] = s.url;
        }

        const html = renderDashboardHtml(manifest, endpoints);
        const server = createServer((req, res) => {
          if (req.url === '/' || (req.url ?? '').startsWith('/?')) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
          } else {
            res.writeHead(404);
            res.end('not found');
          }
        });

        const shutdown = (): void => {
          console.log('\nStopping dashboard + variant servers…');
          server.close();
          void Promise.all(servers.map((s) => s.handle.stop())).finally(() => process.exit(0));
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        server.listen(port, () => {
          const url = `http://localhost:${String(port)}`;
          console.log(
            `\nTiraz dashboard → ${url}  (${String(Object.keys(endpoints).length)} live variant(s))`,
          );
          console.log('Press Ctrl-C to stop.');
          if (options.open === true) openInBrowser(url);
        });
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
