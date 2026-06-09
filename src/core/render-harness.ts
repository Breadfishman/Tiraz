/**
 * Harness resolution for the live renderer (SPEC §11) — the pure "brain" the Playwright adapter
 * builds on: which command boots each playground, what URL a scoped target renders at, and a
 * readiness poll. Kept dependency-free and fully testable; the process/browser I/O lives in the
 * live `PlaywrightRenderer` on top of this.
 */

import type { HarnessKind } from './detect';

export class RenderHarnessError extends Error {
  override readonly name = 'RenderHarnessError';
}

/** The four scoped-target forms (SPEC §5) plus a bare path fallback. */
export type TargetKind = 'component' | 'route' | 'dir' | 'story' | 'path';

export interface ParsedTarget {
  kind: TargetKind;
  value: string;
}

const PREFIXES: readonly TargetKind[] = ['component', 'route', 'dir', 'story'];

/** Parse a `--target` (e.g. `story:button--primary`, `route:/pricing`, or a bare path). */
export function parseTarget(target: string): ParsedTarget {
  const idx = target.indexOf(':');
  if (idx > 0) {
    const prefix = target.slice(0, idx);
    if ((PREFIXES as readonly string[]).includes(prefix)) {
      return { kind: prefix as TargetKind, value: target.slice(idx + 1) };
    }
  }
  return { kind: 'path', value: target };
}

export interface ServeCommand {
  command: string;
  args: string[];
}

/**
 * The command that boots a harness dev server on `port` (run in the variant's worktree). Returns
 * `null` for harnesses with no managed server (`scratch` is a v2-stretch fallback; `app` boots the
 * host's own dev server, which is project-specific and out of scope here).
 */
export function harnessServeCommand(harness: HarnessKind, port: number): ServeCommand | null {
  const p = String(port);
  switch (harness) {
    case 'storybook':
      return { command: 'npx', args: ['storybook', 'dev', '-p', p, '--no-open', '--quiet'] };
    case 'ladle':
      return { command: 'npx', args: ['ladle', 'serve', '--port', p] };
    case 'histoire':
      return { command: 'npx', args: ['histoire', 'dev', '--port', p] };
    case 'scratch':
    case 'app':
      return null;
  }
}

function ensureLeadingSlash(p: string): string {
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * The URL a scoped target renders at on `http://localhost:<port>`. Storybook is the v1-supported
 * surface (SPEC §11): a `story:<id>` renders isolated in its iframe. Throws
 * {@link RenderHarnessError} for combinations that can't be resolved (e.g. a component path in a
 * playground, which would need story-id introspection).
 */
export function resolveRenderUrl(harness: HarnessKind, target: string, port: number): string {
  const origin = `http://localhost:${String(port)}`;
  const { kind, value } = parseTarget(target);

  switch (harness) {
    case 'storybook':
      if (kind === 'story') {
        return `${origin}/iframe.html?id=${encodeURIComponent(value)}&viewMode=story`;
      }
      if (kind === 'route' || kind === 'path') {
        return `${origin}${ensureLeadingSlash(value)}`;
      }
      throw new RenderHarnessError(
        `Storybook needs a story target (story:<id>); got ${kind}:${value}`,
      );
    case 'ladle':
      if (kind === 'story') {
        return `${origin}/?story=${encodeURIComponent(value)}&mode=preview`;
      }
      throw new RenderHarnessError(`Ladle needs a story target (story:<id>); got ${kind}:${value}`);
    case 'histoire':
      if (kind === 'story') {
        return `${origin}/story/${value.split('/').map(encodeURIComponent).join('/')}`;
      }
      throw new RenderHarnessError(
        `Histoire needs a story target (story:<id>); got ${kind}:${value}`,
      );
    case 'app':
      if (kind === 'route' || kind === 'path') {
        return value === '' ? origin : `${origin}${ensureLeadingSlash(value)}`;
      }
      throw new RenderHarnessError(
        `App mode needs a route target (route:/path); got ${kind}:${value}`,
      );
    case 'scratch':
      throw new RenderHarnessError(
        'The scratch-route harness is not yet supported (SPEC §11, v2-stretch)',
      );
  }
}

export interface WaitForServerOptions {
  /** Fetch implementation (injectable for tests); defaults to global `fetch`. */
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number }>;
  /** Max attempts before giving up. */
  attempts?: number;
  /** Delay between attempts (ms). */
  delayMs?: number;
  /** Sleep implementation (injectable for tests). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Poll `url` until it responds (any HTTP status counts as "server is up"), or throw
 * {@link RenderHarnessError} once `attempts` are exhausted. Dev servers often return non-200 on `/`
 * while still being ready to serve, so a completed request — not its status — is the readiness
 * signal.
 */
export async function waitForServer(
  url: string,
  options: WaitForServerOptions = {},
): Promise<void> {
  const fetchImpl =
    options.fetchImpl ??
    (async (u: string) => {
      const res = await fetch(u);
      return { ok: res.ok, status: res.status };
    });
  const attempts = options.attempts ?? 60;
  const delayMs = options.delayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;

  for (let i = 0; i < attempts; i += 1) {
    try {
      await fetchImpl(url);
      return;
    } catch {
      await sleep(delayMs);
    }
  }
  throw new RenderHarnessError(
    `Harness server at ${url} did not become ready after ${String(attempts)} attempts`,
  );
}
