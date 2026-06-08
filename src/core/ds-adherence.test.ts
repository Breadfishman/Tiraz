import { describe, expect, it } from 'vitest';
import type { DesignSystem } from './ds-adherence';
import { scoreDsAdherence } from './ds-adherence';

const system: DesignSystem = {
  tokens: {
    color: ['#1a1a1a', '#f4f1ea'],
    spacing: ['4px', '8px', '16px'],
  },
  components: ['Button', 'Card'],
};

describe('scoreDsAdherence', () => {
  it('scores 100 when every used value is on-system', () => {
    const result = scoreDsAdherence(system, {
      values: { color: ['#1a1a1a'], spacing: ['8px', '16px'] },
      components: ['Button'],
    });
    expect(result.score).toBe(100);
    expect(result.offSystemValues).toEqual([]);
  });

  it('scores the share of on-system values and lists the off-system ones', () => {
    const result = scoreDsAdherence(system, {
      // 2 of 4 on-system → 50.
      values: { color: ['#1a1a1a', '#ff00ff'], spacing: ['8px', '13px'] },
      components: [],
    });
    expect(result.score).toBe(50);
    expect(result.offSystemValues).toEqual(['color:#ff00ff', 'spacing:13px']);
  });

  it('whitelists blessed components and flags unknown ones', () => {
    const result = scoreDsAdherence(system, {
      values: {},
      components: ['Card', 'RandomDiv'],
    });
    expect(result.score).toBe(50);
    expect(result.offSystemValues).toEqual(['component:RandomDiv']);
  });

  it('normalizes case when comparing values', () => {
    const result = scoreDsAdherence(system, { values: { color: ['#1A1A1A'] }, components: [] });
    expect(result.score).toBe(100);
  });

  it('treats an unknown category as fully off-system', () => {
    const result = scoreDsAdherence(system, { values: { shadow: ['0 1px 2px'] }, components: [] });
    expect(result.score).toBe(0);
    expect(result.offSystemValues).toEqual(['shadow:0 1px 2px']);
  });

  it('scores 100 when nothing was used', () => {
    expect(scoreDsAdherence(system, { values: {}, components: [] }).score).toBe(100);
  });
});
