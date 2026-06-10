/**
 * Pure helpers for serving every variant's prebuilt static site from one dashboard server. Each
 * variant is mounted under `/v/<id>/…`; this module maps a request URL to a variant id + a sanitized
 * relative path (rejecting traversal) and picks a content type by extension. The fs read/stream is
 * the CLI's thin I/O on top — all the safety-critical decisions live here so they are unit-tested.
 */

import path from 'node:path';

/** Where each variant's static build is mounted in the dashboard URL space. */
export const VARIANT_MOUNT_PREFIX = '/v/';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
};

/** Content type for a file by extension; `application/octet-stream` when unknown. */
export function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** A request resolved to a variant's static build: its id and a safe relative path within it. */
export interface AssetRequest {
  id: string;
  /** POSIX-style path relative to the variant's static root, guaranteed not to escape it. */
  relPath: string;
}

/**
 * Map a request URL to a variant asset, or `null` when it is not a variant asset request or is
 * unsafe. Strips the query/hash, requires the `/v/<id>/…` shape, URL-decodes each segment, and
 * rejects any `.`/`..`/empty/separator-bearing segment so a request can never escape its mount.
 * An empty trailing path defaults to `index.html`.
 */
export function safeAssetPath(urlPath: string): AssetRequest | null {
  const noQuery = urlPath.split(/[?#]/, 1)[0] ?? '';
  if (!noQuery.startsWith(VARIANT_MOUNT_PREFIX)) {
    return null;
  }
  const rawSegments = noQuery.slice(VARIANT_MOUNT_PREFIX.length).split('/');
  const id = decodeSegment(rawSegments[0]);
  if (id === null) {
    return null;
  }
  const restSegments: string[] = [];
  for (const raw of rawSegments.slice(1)) {
    if (raw === '') {
      continue; // collapse `//` and ignore a trailing slash
    }
    const seg = decodeSegment(raw);
    if (seg === null) {
      return null;
    }
    restSegments.push(seg);
  }
  const relPath = restSegments.length > 0 ? restSegments.join('/') : 'index.html';
  return { id, relPath };
}

/** Decode one path segment and reject anything that could traverse or break the join. */
function decodeSegment(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\0')) {
    return null;
  }
  return decoded;
}

/**
 * Join `relPath` onto `root`, returning the absolute file path only if it stays inside `root`.
 * Defense in depth over {@link safeAssetPath}: even a path that slipped through is contained here.
 */
export function safeJoin(root: string, relPath: string): string | null {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, relPath);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return candidate;
}
