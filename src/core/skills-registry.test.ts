import { describe, expect, it } from 'vitest';
import type { TirazConfig } from './config';
import {
  SKILLS,
  getSkill,
  resolveActiveSkills,
  resolveToggle,
  seedPrimaries,
} from './skills-registry';

describe('registry invariants', () => {
  it('has unique skill ids', () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares exactly one always-on base skill', () => {
    const base = SKILLS.filter((s) => s.alwaysOn === true);
    expect(base.map((s) => s.id)).toEqual(['frontend-design']);
  });

  it('exposes exactly two toggleable primaries plus one integration primary', () => {
    expect(SKILLS.filter((s) => s.role === 'primary').map((s) => s.id)).toEqual([
      'impeccable',
      'design-taste-frontend',
    ]);
    expect(SKILLS.filter((s) => s.integrationPrimary === true).map((s) => s.id)).toEqual([
      'redesign-existing-projects',
    ]);
  });

  it('maps the three overlays to distinct overlay keys', () => {
    const overlays = SKILLS.filter((s) => s.role === 'overlay');
    expect(overlays.map((s) => s.overlayKey)).toEqual(['minimalist', 'brutalist', 'soft']);
  });

  it('keeps Emil as an install-time dependency, never vendored', () => {
    const emil = getSkill('emilkowalski-skill');
    expect(emil?.disposition).toBe('install-time-dep');
  });
});

describe('getSkill', () => {
  it('finds a skill by id', () => {
    expect(getSkill('impeccable')?.role).toBe('primary');
  });

  it('returns undefined for an unknown id', () => {
    expect(getSkill('does-not-exist')).toBeUndefined();
  });
});

describe('resolveActiveSkills', () => {
  it('selects base + the seeded primary with no overlay (greenfield)', () => {
    const resolved = resolveActiveSkills({
      mode: 'greenfield',
      primary: 'impeccable',
      overlay: 'none',
    });
    expect(resolved.base.id).toBe('frontend-design');
    expect(resolved.primary.id).toBe('impeccable');
    expect(resolved.overlay).toBeNull();
    expect(resolved.all.map((s) => s.id)).toEqual(['frontend-design', 'impeccable']);
  });

  it('composes an overlay when one is active', () => {
    const resolved = resolveActiveSkills({
      mode: 'greenfield',
      primary: 'design-taste-frontend',
      overlay: 'minimalist',
    });
    expect(resolved.overlay?.id).toBe('minimalist-ui');
    expect(resolved.all.map((s) => s.id)).toEqual([
      'frontend-design',
      'design-taste-frontend',
      'minimalist-ui',
    ]);
  });

  it('resolves the soft overlay to high-end-visual-design', () => {
    const resolved = resolveActiveSkills({
      mode: 'greenfield',
      primary: 'impeccable',
      overlay: 'soft',
    });
    expect(resolved.overlay?.id).toBe('high-end-visual-design');
  });

  it('forces the primary to redesign-existing-projects in integration mode', () => {
    const resolved = resolveActiveSkills({
      mode: 'integration',
      // Seed says impeccable, but integration mode overrides it.
      primary: 'impeccable',
      overlay: 'none',
    });
    expect(resolved.primary.id).toBe('redesign-existing-projects');
  });

  it('always yields exactly one primary (single-primary invariant)', () => {
    const resolved = resolveActiveSkills({
      mode: 'greenfield',
      primary: 'impeccable',
      overlay: 'brutalist',
    });
    expect(resolved.all.filter((s) => s === resolved.primary)).toHaveLength(1);
    expect(resolved.base).not.toBe(resolved.primary);
  });

  it('throws if asked for a primary the registry does not define', () => {
    // Force an out-of-enum value to exercise the registry-invariant guard.
    const bogusPrimary = 'no-such-primary' as unknown as TirazConfig['primary'];
    expect(() =>
      resolveActiveSkills({ mode: 'greenfield', primary: bogusPrimary, overlay: 'none' }),
    ).toThrow(/no primary skill/);
  });

  it('throws if asked for an overlay the registry does not define', () => {
    const bogusOverlay = 'no-such-overlay' as unknown as TirazConfig['overlay'];
    expect(() =>
      resolveActiveSkills({ mode: 'greenfield', primary: 'impeccable', overlay: bogusOverlay }),
    ).toThrow(/no overlay skill/);
  });
});

describe('seedPrimaries', () => {
  it('spans both toggleable primaries in greenfield', () => {
    expect(seedPrimaries('greenfield').map((s) => s.id)).toEqual([
      'impeccable',
      'design-taste-frontend',
    ]);
  });

  it('returns only the forced primary in integration mode', () => {
    expect(seedPrimaries('integration').map((s) => s.id)).toEqual(['redesign-existing-projects']);
  });
});

describe('resolveToggle', () => {
  it('treats "none" as clearing the overlay', () => {
    expect(resolveToggle('none')).toEqual({ kind: 'overlay', value: 'none' });
  });

  it('resolves a primary skill id', () => {
    expect(resolveToggle('impeccable')).toEqual({ kind: 'primary', value: 'impeccable' });
  });

  it('resolves the integration primary skill id', () => {
    expect(resolveToggle('redesign-existing-projects')).toEqual({
      kind: 'primary',
      value: 'redesign-existing-projects',
    });
  });

  it('resolves an overlay skill id', () => {
    expect(resolveToggle('minimalist-ui')).toEqual({ kind: 'overlay', value: 'minimalist' });
  });

  it('returns null for a non-toggleable (single-purpose) skill', () => {
    expect(resolveToggle('full-output-enforcement')).toBeNull();
  });

  it('returns null for an unknown name', () => {
    expect(resolveToggle('nope')).toBeNull();
  });
});
