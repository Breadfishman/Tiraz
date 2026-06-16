import { describe, expect, it } from 'vitest';
import {
  UNIVERSAL_CRAFT_MARKERS,
  UNIVERSAL_SLOP_TELLS,
  antiSlopRubric,
  calibrationAnchors,
  paletteRubric,
  tasteBarSection,
} from './taste-rubric';

describe('universal taste catalogs', () => {
  it('are non-empty and free of obvious duplicates', () => {
    expect(UNIVERSAL_SLOP_TELLS.length).toBeGreaterThan(5);
    expect(UNIVERSAL_CRAFT_MARKERS.length).toBeGreaterThan(3);
    expect(new Set(UNIVERSAL_SLOP_TELLS).size).toBe(UNIVERSAL_SLOP_TELLS.length);
    expect(new Set(UNIVERSAL_CRAFT_MARKERS).size).toBe(UNIVERSAL_CRAFT_MARKERS.length);
  });

  it('keep the floor style-neutral (no style-specific bans that fight a chosen aesthetic)', () => {
    // These are legitimate choices in some directions (vaporwave, Bauhaus, organic), so they must
    // NOT appear as unconditional bans in the universal floor — only as "defaulted, not chosen".
    for (const tell of UNIVERSAL_SLOP_TELLS) {
      expect(tell).not.toMatch(/\bintentional asymmetry\b/);
      expect(tell).not.toMatch(/boringly symmetric/);
    }
  });
});

describe('tasteBarSection', () => {
  it('renders a graded bar: the universal floor plus deferral to the variant direction', () => {
    const text = tasteBarSection().join('\n');
    expect(text).toContain('## Taste bar — clear it (this is graded)');
    expect(text).toContain('universal floor');
    expect(text).toContain('Show these markers of considered design');
    for (const tell of UNIVERSAL_SLOP_TELLS) expect(text).toContain(`- ${tell}`);
    for (const marker of UNIVERSAL_CRAFT_MARKERS) expect(text).toContain(`- ${marker}`);
    // The bar defers "excellent" to the variant's own direction, not one house style.
    expect(text).toContain("THIS variant's aesthetic direction");
    expect(text).toContain('NOT graded against one house style');
  });
});

describe('antiSlopRubric', () => {
  it('is a single concrete string judging commitment + craft, not a preferred aesthetic', () => {
    const rubric = antiSlopRubric();
    expect(rubric).toContain('originality');
    expect(rubric).toContain('not which aesthetic you');
    expect(rubric).toContain(UNIVERSAL_SLOP_TELLS[0] ?? '');
    expect(rubric).toContain(UNIVERSAL_CRAFT_MARKERS[0] ?? '');
    expect(rubric).not.toContain('\n'); // one line, suitable for a judge prompt
  });
});

describe('paletteRubric', () => {
  it('judges colour craft (cohesion + intent), not amount of colour', () => {
    const rubric = paletteRubric();
    expect(rubric).toContain('colour only');
    expect(rubric).toContain('restrained or bold');
    expect(rubric).toContain('Do NOT prefer restrained over saturated');
    expect(rubric).toContain('purple/blue gradient');
    expect(rubric).toContain('contrast');
    expect(rubric).not.toContain('\n'); // one line, suitable for a judge prompt
  });
});

describe('calibrationAnchors', () => {
  it('reuses the universal catalog and states the any-aesthetic rule (no drift)', () => {
    const text = calibrationAnchors().join('\n');
    expect(text).toContain('Calibration');
    expect(text).toContain('ANY aesthetic');
    expect(text).toContain('SLOP');
    expect(text).toContain('CRAFT');
    expect(text).toContain(UNIVERSAL_SLOP_TELLS[0] ?? '');
  });
});
