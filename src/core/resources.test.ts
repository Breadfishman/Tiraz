import { describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import {
  buildResourceView,
  isCapabilityEnabled,
  isSourceEnabled,
  npmUrl,
  setDials,
  setFetchMode,
  setOverlaySkill,
  setPrimarySkill,
  setTasteWeight,
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

  it('surfaces the active skills, modules, dials and fitness weights', () => {
    const view = buildResourceView(config);
    expect(view.skills).toEqual({ primary: config.primary, overlay: config.overlay });
    expect(view.modules).toEqual({ threeD: false, remotion: false });
    expect(view.dials).toEqual(config.dials);
    expect(view.weights).toEqual(config.fitness.weights);
  });

  it('surfaces the genuine-fetch mode + budget', () => {
    const view = buildResourceView(config);
    expect(view.fetchMode).toBe('install');
    expect(view.fetchBudget).toBe(6);
    const off = buildResourceView(
      TirazConfigSchema.parse({
        sources: { bundled: [], fetch: [], aceternity: false, fetchMode: 'signatures' },
      }),
    );
    expect(off.fetchMode).toBe('signatures');
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

describe('setFetchMode', () => {
  it('maps true→install and false→signatures', () => {
    expect(setFetchMode(config, true).sources.fetchMode).toBe('install');
    expect(setFetchMode(config, false).sources.fetchMode).toBe('signatures');
  });

  it('leaves the rest of the sources block intact', () => {
    const next = setFetchMode(config, false);
    expect(next.sources.bundled).toEqual(config.sources.bundled);
    expect(next.sources.fetch).toEqual(config.sources.fetch);
    expect(next.sources.fetchBudget).toBe(config.sources.fetchBudget);
  });
});

describe('setPrimarySkill', () => {
  it('sets a valid primary seed', () => {
    expect(setPrimarySkill(config, 'design-taste-frontend').primary).toBe('design-taste-frontend');
    expect(setPrimarySkill(config, 'redesign-existing-projects').primary).toBe(
      'redesign-existing-projects',
    );
  });

  it('returns the config unchanged for an unknown id', () => {
    expect(setPrimarySkill(config, 'nope')).toBe(config);
    expect(setPrimarySkill(config, 'none')).toBe(config); // "none" is an overlay, not a primary
  });
});

describe('setOverlaySkill', () => {
  it('sets a valid overlay (including clearing to none)', () => {
    expect(setOverlaySkill(config, 'brutalist').overlay).toBe('brutalist');
    expect(setOverlaySkill(setOverlaySkill(config, 'soft'), 'none').overlay).toBe('none');
  });

  it('returns the config unchanged for an unknown overlay', () => {
    expect(setOverlaySkill(config, 'impeccable')).toBe(config); // a primary id is not an overlay
    expect(setOverlaySkill(config, 'nope')).toBe(config);
  });
});

describe('setDials', () => {
  it('overrides only the provided dials', () => {
    const next = setDials(config, { variance: 8 });
    expect(next.dials).toEqual({ variance: 8, motion: 5, density: 5 });
  });

  it('clamps and rounds out-of-range / non-finite values into 1..10', () => {
    expect(setDials(config, { variance: 99 }).dials.variance).toBe(10);
    expect(setDials(config, { motion: 0 }).dials.motion).toBe(1);
    expect(setDials(config, { density: -5 }).dials.density).toBe(1);
    expect(setDials(config, { variance: 7.6 }).dials.variance).toBe(8);
    expect(setDials(config, { motion: Number.NaN }).dials.motion).toBe(1);
  });

  it('leaves all dials intact for an empty patch', () => {
    expect(setDials(config, {}).dials).toEqual(config.dials);
  });
});

describe('setTasteWeight', () => {
  it('sets taste and dsAdherence so they sum to 1', () => {
    const next = setTasteWeight(config, 0.7);
    expect(next.fitness.weights).toEqual({ taste: 0.7, dsAdherence: 0.30000000000000004 });
    expect(next.fitness.weights.taste + next.fitness.weights.dsAdherence).toBeCloseTo(1);
  });

  it('clamps the taste weight into 0..1', () => {
    expect(setTasteWeight(config, 2).fitness.weights).toEqual({ taste: 1, dsAdherence: 0 });
    expect(setTasteWeight(config, -1).fitness.weights).toEqual({ taste: 0, dsAdherence: 1 });
    expect(setTasteWeight(config, Number.NaN).fitness.weights.taste).toBe(0);
  });
});
