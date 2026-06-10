import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeFor, safeAssetPath, safeJoin } from './static-serve';

describe('contentTypeFor', () => {
  it('maps known extensions case-insensitively', () => {
    expect(contentTypeFor('iframe.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('a/b/main.JS')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('style.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('font.woff2')).toBe('font/woff2');
    expect(contentTypeFor('logo.svg')).toBe('image/svg+xml');
  });

  it('falls back to octet-stream for unknown/extensionless files', () => {
    expect(contentTypeFor('data.bin')).toBe('application/octet-stream');
    expect(contentTypeFor('LICENSE')).toBe('application/octet-stream');
  });
});

describe('safeAssetPath', () => {
  it('resolves a variant asset and strips the query', () => {
    expect(safeAssetPath('/v/g0-n0/iframe.html?id=hero--default&viewMode=story')).toEqual({
      id: 'g0-n0',
      relPath: 'iframe.html',
    });
    expect(safeAssetPath('/v/g0-n1/assets/preview-abc.js')).toEqual({
      id: 'g0-n1',
      relPath: 'assets/preview-abc.js',
    });
  });

  it('defaults an empty path to index.html and collapses extra slashes', () => {
    expect(safeAssetPath('/v/g0-n0/')).toEqual({ id: 'g0-n0', relPath: 'index.html' });
    expect(safeAssetPath('/v/g0-n0/a//b')).toEqual({ id: 'g0-n0', relPath: 'a/b' });
  });

  it('decodes percent-encoded segments', () => {
    expect(safeAssetPath('/v/g0-n0/sb-preview/runtime%2Ejs')).toEqual({
      id: 'g0-n0',
      relPath: 'sb-preview/runtime.js',
    });
  });

  it('returns null for non-variant requests', () => {
    expect(safeAssetPath('/')).toBeNull();
    expect(safeAssetPath('/api/select')).toBeNull();
    expect(safeAssetPath('/v/')).toBeNull();
  });

  it('rejects traversal attempts', () => {
    expect(safeAssetPath('/v/g0-n0/../../etc/passwd')).toBeNull();
    expect(safeAssetPath('/v/g0-n0/%2e%2e/secret')).toBeNull();
    expect(safeAssetPath('/v/../manifest.json')).toBeNull();
    expect(safeAssetPath('/v/g0-n0/a/%2e%2e/b')).toBeNull();
  });

  it('rejects malformed percent-encoding', () => {
    expect(safeAssetPath('/v/g0-n0/%zz')).toBeNull();
  });
});

describe('safeJoin', () => {
  const root = '/repo/.tiraz/static/g0-n0';

  it('joins a contained path', () => {
    expect(safeJoin(root, 'assets/main.js')).toBe(path.resolve(root, 'assets/main.js'));
    expect(safeJoin(root, 'iframe.html')).toBe(path.resolve(root, 'iframe.html'));
  });

  it('allows the root itself', () => {
    expect(safeJoin(root, '')).toBe(path.resolve(root));
  });

  it('rejects escapes', () => {
    expect(safeJoin(root, '../g0-n1/secret')).toBeNull();
    expect(safeJoin(root, '../../../../etc/passwd')).toBeNull();
  });

  it('does not treat a sibling prefix as contained', () => {
    // `/repo/.tiraz/static/g0-n0-evil` shares the string prefix but is a different dir.
    expect(safeJoin('/repo/static/g0', '../g0-evil/x')).toBeNull();
  });
});
