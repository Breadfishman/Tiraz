import { describe, expect, it } from 'vitest';
import type { TirazConfig } from './config';
import { TirazConfigSchema } from './config';
import {
  ACETERNITY_TOS_WARNING,
  SourceError,
  getSource,
  isFromPermittedSource,
  resolveSources,
  sourcePrefix,
} from './sources';

function sourcesConfig(patch: Record<string, unknown> = {}): TirazConfig['sources'] {
  return TirazConfigSchema.parse({
    sources: { bundled: ['magic-ui'], fetch: [], aceternity: false, ...patch },
  }).sources;
}

describe('getSource', () => {
  it('finds a known source and rejects unknown', () => {
    expect(getSource('magic-ui')?.tier).toBe('bundled');
    expect(getSource('react-bits')?.tier).toBe('fetch');
    expect(getSource('nope')).toBeUndefined();
  });
});

describe('resolveSources', () => {
  it('splits bundled vs fetch and lists permitted Tier-2 ids', () => {
    const resolved = resolveSources(sourcesConfig({ fetch: ['react-bits', '21st-registry'] }));
    expect(resolved.bundled.map((s) => s.id)).toEqual(['magic-ui']);
    expect(resolved.permittedIds).toEqual(['react-bits', '21st-registry']);
    expect(resolved.warnings).toEqual([]);
  });

  it('keeps a restricted source out unless its toggle is on', () => {
    const off = resolveSources(sourcesConfig({ fetch: ['react-bits'], aceternity: false }));
    expect(off.permittedIds).not.toContain('aceternity');
    expect(off.warnings).toEqual([]);

    const on = resolveSources(sourcesConfig({ fetch: ['react-bits'], aceternity: true }));
    expect(on.permittedIds).toContain('aceternity');
    expect(on.warnings).toEqual([ACETERNITY_TOS_WARNING]);
  });

  it('throws on an unknown configured source', () => {
    // Bypass schema validation (it permits arbitrary strings) to test the registry guard.
    const cfg = { bundled: ['magic-ui'], fetch: ['bogus-source'], aceternity: false };
    expect(() => resolveSources(cfg)).toThrow(SourceError);
  });
});

describe('sourcePrefix / isFromPermittedSource', () => {
  it('extracts the source id from a fetched component identifier', () => {
    expect(sourcePrefix('react-bits/SplitText')).toBe('react-bits');
    expect(sourcePrefix('21st-registry:Hero')).toBe('21st-registry');
    expect(sourcePrefix('Button')).toBeNull();
  });

  it('matches only components from a permitted source', () => {
    const permitted = ['react-bits'];
    expect(isFromPermittedSource('react-bits/SplitText', permitted)).toBe(true);
    expect(isFromPermittedSource('aceternity/Spotlight', permitted)).toBe(false);
    expect(isFromPermittedSource('Button', permitted)).toBe(false);
  });
});
