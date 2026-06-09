import { describe, expect, it } from 'vitest';
import type { TirazConfig } from './config';
import { TirazConfigSchema } from './config';
import {
  CAPABILITIES,
  REMOTION_LICENSE_WARNING,
  getCapability,
  resolveCapabilities,
} from './capabilities';

function modules(patch: Record<string, unknown> = {}): TirazConfig['modules'] {
  return TirazConfigSchema.parse({ modules: { threeD: false, remotion: false, ...patch } }).modules;
}

describe('CAPABILITIES registry', () => {
  it('exposes the verified §10 stack with every entry carrying npm packages + a license', () => {
    expect(CAPABILITIES.every((c) => c.npm.length > 0 && c.license.length > 0)).toBe(true);
    const ids = CAPABILITIES.map((c) => c.id);
    for (const id of [
      'gsap',
      'motion',
      'lenis',
      'three',
      'react-three-fiber',
      'spline',
      'remotion',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('marks only the non-OSI commercial library (Remotion) as restricted, with a warning', () => {
    const restricted = CAPABILITIES.filter((c) => c.restricted);
    expect(restricted.map((c) => c.id)).toEqual(['remotion']);
    expect(restricted[0]?.warning).toBe(REMOTION_LICENSE_WARNING);
  });

  it('finds a capability and rejects unknown', () => {
    expect(getCapability('gsap')?.category).toBe('animation');
    expect(getCapability('nope')).toBeUndefined();
  });
});

describe('resolveCapabilities', () => {
  it('exposes core animation/scroll libraries with no modules enabled', () => {
    const resolved = resolveCapabilities(modules());
    const ids = resolved.libraries.map((c) => c.id);
    expect(ids).toContain('gsap');
    expect(ids).toContain('lenis');
    // 3D / video stay out until their module is on.
    expect(ids).not.toContain('three');
    expect(ids).not.toContain('remotion');
    expect(resolved.warnings).toEqual([]);
  });

  it('adds the 3D stack when the threeD module is enabled', () => {
    const ids = resolveCapabilities(modules({ threeD: true })).libraries.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['three', 'react-three-fiber', 'drei', 'spline']));
    expect(ids).not.toContain('remotion');
  });

  it('adds Remotion and surfaces its license warning when the video module is enabled', () => {
    const resolved = resolveCapabilities(modules({ remotion: true }));
    expect(resolved.libraries.map((c) => c.id)).toContain('remotion');
    expect(resolved.warnings).toEqual([REMOTION_LICENSE_WARNING]);
  });
});
