import { describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import {
  buildResourceView,
  isCapabilityEnabled,
  isSourceEnabled,
  npmUrl,
  toggleModule,
  toggleSource,
} from './resources';

const config = TirazConfigSchema.parse({});

describe('npmUrl', () => {
  it('points at the package page', () => {
    expect(npmUrl('gsap')).toBe('https://www.npmjs.com/package/gsap');
  });
});

describe('buildResourceView', () => {
  it('lists every source with a url and its enabled/restricted state', () => {
    const view = buildResourceView(config);
    const magic = view.sources.find((s) => s.id === 'magic-ui');
    expect(magic).toMatchObject({
      enabled: true,
      restricted: false,
      url: 'https://magicui.design',
    });
    const aceternity = view.sources.find((s) => s.id === 'aceternity');
    expect(aceternity).toMatchObject({ enabled: false, restricted: true });
    expect(aceternity?.warning).toBeDefined();
    // A default-fetch source is enabled; an unlisted clean source is not.
    expect(view.sources.find((s) => s.id === 'react-bits')?.enabled).toBe(true);
    expect(view.sources.find((s) => s.id === 'origin-ui')?.enabled).toBe(false);
  });

  it('marks capability libraries by module + carries an npm url', () => {
    const view = buildResourceView(config);
    const gsap = view.capabilities.find((c) => c.id === 'gsap');
    expect(gsap).toMatchObject({
      module: 'core',
      enabled: true,
      url: 'https://www.npmjs.com/package/gsap',
    });
    expect(view.capabilities.find((c) => c.id === 'three')?.enabled).toBe(false); // threeD off by default
    const withThreeD = buildResourceView(
      TirazConfigSchema.parse({ modules: { threeD: true, remotion: false } }),
    );
    expect(withThreeD.capabilities.find((c) => c.id === 'three')?.enabled).toBe(true);
  });

  it('surfaces the active skills and modules', () => {
    const view = buildResourceView(config);
    expect(view.skills).toEqual({ primary: config.primary, overlay: config.overlay });
    expect(view.modules).toEqual({ threeD: false, remotion: false });
  });
});

describe('isSourceEnabled / isCapabilityEnabled', () => {
  it('reads source membership and the aceternity toggle', () => {
    const magic = { id: 'magic-ui', tier: 'bundled', restricted: false } as never;
    expect(isSourceEnabled(magic, config.sources)).toBe(true);
    const ace = { id: 'aceternity', tier: 'fetch', restricted: true } as never;
    expect(isSourceEnabled(ace, { ...config.sources, aceternity: true })).toBe(true);
    expect(isSourceEnabled(ace, config.sources)).toBe(false);
  });

  it('gates capabilities by module', () => {
    expect(isCapabilityEnabled('core', config.modules)).toBe(true);
    expect(isCapabilityEnabled('threeD', config.modules)).toBe(false);
    expect(isCapabilityEnabled('remotion', { threeD: false, remotion: true })).toBe(true);
  });
});

describe('toggleSource', () => {
  it('adds and removes a fetch source', () => {
    const on = toggleSource(config, 'origin-ui', true);
    expect(on.sources.fetch).toContain('origin-ui');
    const off = toggleSource(on, 'react-bits', false);
    expect(off.sources.fetch).not.toContain('react-bits');
  });

  it('flips the restricted aceternity boolean and ignores unknown ids', () => {
    expect(toggleSource(config, 'aceternity', true).sources.aceternity).toBe(true);
    expect(toggleSource(config, 'nope', true)).toBe(config);
  });

  it('does not duplicate an already-enabled source', () => {
    expect(
      toggleSource(config, 'react-bits', true).sources.fetch.filter((x) => x === 'react-bits'),
    ).toHaveLength(1);
  });
});

describe('toggleModule', () => {
  it('flips a module flag', () => {
    expect(toggleModule(config, 'threeD', true).modules.threeD).toBe(true);
    expect(toggleModule(config, 'remotion', true).modules).toEqual({
      threeD: false,
      remotion: true,
    });
  });
});
