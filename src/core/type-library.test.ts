import { describe, expect, it } from 'vitest';
import { FONT_ROLES, OVERUSED_FONTS, TYPE_LIBRARY, isOverusedFont, typeMenu } from './type-library';

describe('TYPE_LIBRARY', () => {
  it('has 40–60 unique families with complete fields', () => {
    expect(TYPE_LIBRARY.length).toBeGreaterThanOrEqual(40);
    expect(TYPE_LIBRARY.length).toBeLessThanOrEqual(60);
    const families = TYPE_LIBRARY.map((f) => f.family.toLowerCase());
    expect(new Set(families).size).toBe(TYPE_LIBRARY.length);
    for (const f of TYPE_LIBRARY) {
      expect(f.family.trim()).not.toBe('');
      expect(f.license.trim()).not.toBe('');
      expect(f.note.trim()).not.toBe('');
      expect(FONT_ROLES).toContain(f.role);
    }
  });

  it('covers every role with several fonts', () => {
    for (const role of FONT_ROLES) {
      expect(TYPE_LIBRARY.filter((f) => f.role === role).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('contains no overused font', () => {
    for (const f of TYPE_LIBRARY) expect(isOverusedFont(f.family)).toBe(false);
  });
});

describe('OVERUSED_FONTS', () => {
  it('is lowercase and free of duplicates', () => {
    expect(new Set(OVERUSED_FONTS).size).toBe(OVERUSED_FONTS.length);
    for (const f of OVERUSED_FONTS) expect(f).toBe(f.toLowerCase());
  });
});

describe('isOverusedFont', () => {
  it('matches case-, quote- and whitespace-insensitively', () => {
    expect(isOverusedFont('Inter')).toBe(true);
    expect(isOverusedFont('"Instrument Serif"')).toBe(true);
    expect(isOverusedFont("'Space   Grotesk'")).toBe(true);
    expect(isOverusedFont('  FRAUNCES ')).toBe(true);
    expect(isOverusedFont('Young Serif')).toBe(false);
    expect(isOverusedFont('Interstate')).toBe(false);
    expect(isOverusedFont('')).toBe(false);
  });
});

describe('typeMenu', () => {
  const roleOf = (line: string) => line.split(' — ')[1];

  it('is deterministic per seed and varies across seeds', () => {
    expect(typeMenu(7)).toEqual(typeMenu(7));
    expect(typeMenu(1)).not.toEqual(typeMenu(2));
  });

  it('returns count lines of the form family — role — note, without duplicates', () => {
    const menu = typeMenu(3, 10);
    expect(menu).toHaveLength(10);
    expect(new Set(menu).size).toBe(10);
    for (const line of menu) expect(line.split(' — ')).toHaveLength(3);
  });

  it('includes at least one font per role when count allows', () => {
    for (const seed of [0, 1, 5, 42, -3, 1e9]) {
      const roles = new Set(typeMenu(seed, FONT_ROLES.length).map(roleOf));
      expect(roles.size).toBe(FONT_ROLES.length);
    }
  });

  it('clamps count to the library size and handles zero', () => {
    expect(typeMenu(0, 0)).toEqual([]);
    expect(typeMenu(0, 999)).toHaveLength(TYPE_LIBRARY.length);
  });
});
