import { describe, expect, it } from 'vitest';
import type { TirazConfig } from './config';
import { TirazConfigSchema } from './config';
import {
  ACETERNITY_TOS_WARNING,
  EXCLUDED_SOURCES,
  SOURCES,
  SourceError,
  getSource,
  isFromPermittedSource,
  resolveSources,
  signaturesFor,
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

describe('SOURCES registry', () => {
  it('covers the verified ecosystem with exactly one restricted source carrying a warning', () => {
    const restricted = SOURCES.filter((s) => s.restricted);
    expect(restricted.map((s) => s.id)).toEqual(['aceternity']);
    expect(restricted.every((s) => s.warning !== undefined && s.warning.length > 0)).toBe(true);
    // The expanded menu includes the clean-MIT additions.
    const ids = SOURCES.map((s) => s.id);
    for (const id of ['cult-ui', 'motion-primitives', 'kokonut-ui', 'smoothui', 'eldora-ui']) {
      expect(ids).toContain(id);
    }
  });

  it('records why license-incompatible sources are excluded rather than dropping them silently', () => {
    expect(EXCLUDED_SOURCES.map((s) => s.id)).toEqual(['hover-dev', 'skiper-ui']);
    expect(EXCLUDED_SOURCES.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('catalogs signature effects per source (the blend palette)', () => {
    expect(SOURCES.every((s) => s.signatures.length > 0)).toBe(true);
    expect(getSource('aceternity')?.signatures).toEqual(
      expect.arrayContaining(['aurora background']),
    );
    expect(getSource('magic-ui')?.signatures).toEqual(expect.arrayContaining(['bento grid']));
  });

  it('signaturesFor gathers the palette across permitted sources', () => {
    const palette = signaturesFor(['react-bits', 'cult-ui', 'nope']);
    expect(palette.map((p) => p.id)).toEqual(['react-bits', 'cult-ui']); // unknown id dropped
    expect(palette[0]?.signatures.length).toBeGreaterThan(0);
  });
});

describe('default config sources', () => {
  it('permits a diverse clean-MIT fetch set by default, with Aceternity off', () => {
    const resolved = resolveSources(TirazConfigSchema.parse({}).sources);
    expect(resolved.permittedIds).toEqual([
      'react-bits',
      '21st-registry',
      'cult-ui',
      'motion-primitives',
      'kokonut-ui',
      'smoothui',
      'eldora-ui',
    ]);
    expect(resolved.permittedIds).not.toContain('aceternity');
    expect(resolved.warnings).toEqual([]);
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
    const cfg = {
      bundled: ['magic-ui'],
      fetch: ['bogus-source'],
      aceternity: false,
      fetchMode: 'install' as const,
      fetchBudget: 6,
      twentyFirst: false,
      twentyFirstBudget: 3,
    };
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
