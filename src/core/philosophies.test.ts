import { describe, expect, it } from 'vitest';
import { CROWD_SKILLS, PHILOSOPHIES, crowdTells, philosophyMenu } from './philosophies';

describe('PHILOSOPHIES', () => {
  it('has unique ids and names', () => {
    expect(PHILOSOPHIES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PHILOSOPHIES.map((p) => p.id)).size).toBe(PHILOSOPHIES.length);
    expect(new Set(PHILOSOPHIES.map((p) => p.name)).size).toBe(PHILOSOPHIES.length);
  });

  it('gives every entry kebab-case id, a name, 3–5 checkable constraints and a lazy failure', () => {
    for (const p of PHILOSOPHIES) {
      expect(p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.name.trim()).not.toBe('');
      expect(p.lazyFailure.trim()).not.toBe('');
      expect(p.constraints.length).toBeGreaterThanOrEqual(3);
      expect(p.constraints.length).toBeLessThanOrEqual(5);
      for (const c of p.constraints) expect(c.trim()).not.toBe('');
      expect(new Set(p.constraints).size).toBe(p.constraints.length);
    }
  });
});

describe('CROWD_SKILLS', () => {
  it('has unique ids and complete entries with https sources', () => {
    expect(CROWD_SKILLS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(CROWD_SKILLS.map((s) => s.id)).size).toBe(CROWD_SKILLS.length);
    for (const s of CROWD_SKILLS) {
      expect(s.name.trim()).not.toBe('');
      expect(s.stance.trim()).not.toBe('');
      expect(s.source).toMatch(/^https:\/\//);
      expect(s.tells.length).toBeGreaterThan(0);
      for (const t of s.tells) expect(t.trim()).not.toBe('');
      expect(new Set(s.tells).size).toBe(s.tells.length);
    }
  });
});

describe('philosophyMenu', () => {
  it('renders one compact line per philosophy, deterministically', () => {
    const menu = philosophyMenu();
    expect(menu).toHaveLength(PHILOSOPHIES.length);
    expect(philosophyMenu()).toEqual(menu);
    PHILOSOPHIES.forEach((p, i) => {
      expect(menu[i]).toBe(`${p.id}: ${p.name} — ${p.constraints.join('; ')}`);
    });
    for (const line of menu) expect(line).not.toContain('\n');
  });
});

describe('crowdTells', () => {
  it('is de-duplicated, covers every skill tell and is deterministic', () => {
    const tells = crowdTells();
    const keys = tells.map((t) => t.toLowerCase());
    expect(new Set(keys).size).toBe(tells.length);
    for (const s of CROWD_SKILLS) {
      for (const t of s.tells) expect(keys).toContain(t.trim().toLowerCase());
    }
    expect(crowdTells()).toEqual(tells);
  });

  it('collapses a tell shared by several skills to a single entry', () => {
    const all = CROWD_SKILLS.flatMap((s) => s.tells);
    expect(crowdTells().length).toBeLessThan(all.length);
  });
});
