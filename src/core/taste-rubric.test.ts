import { describe, expect, it } from 'vitest';
import {
  EXCELLENCE_MARKERS,
  SLOP_TELLS,
  antiSlopRubric,
  calibrationAnchors,
  paletteRubric,
  tasteBarSection,
} from './taste-rubric';

describe('taste rubric catalogs', () => {
  it('are non-empty and free of obvious duplicates', () => {
    expect(SLOP_TELLS.length).toBeGreaterThan(5);
    expect(EXCELLENCE_MARKERS.length).toBeGreaterThan(3);
    expect(new Set(SLOP_TELLS).size).toBe(SLOP_TELLS.length);
    expect(new Set(EXCELLENCE_MARKERS).size).toBe(EXCELLENCE_MARKERS.length);
  });
});

describe('tasteBarSection', () => {
  it('renders a graded bar listing every tell and marker', () => {
    const lines = tasteBarSection();
    const text = lines.join('\n');
    expect(text).toContain('## Taste bar — clear it (this is graded)');
    expect(text).toContain('Avoid these slop tells');
    expect(text).toContain('Show these markers of considered design');
    for (const tell of SLOP_TELLS) expect(text).toContain(`- ${tell}`);
    for (const marker of EXCELLENCE_MARKERS) expect(text).toContain(`- ${marker}`);
  });
});

describe('antiSlopRubric', () => {
  it('is a single concrete string enumerating tells and markers', () => {
    const rubric = antiSlopRubric();
    expect(rubric).toContain('originality');
    expect(rubric).toContain(SLOP_TELLS[0] ?? '');
    expect(rubric).toContain(EXCELLENCE_MARKERS[0] ?? '');
    expect(rubric).not.toContain('\n'); // one line, suitable for a judge prompt
  });
});

describe('paletteRubric', () => {
  it('is a one-line rubric rewarding restraint and penalising the stock gradient', () => {
    const rubric = paletteRubric();
    expect(rubric).toContain('colour only');
    expect(rubric).toContain('committed, restrained palette');
    expect(rubric).toContain('purple/blue gradient');
    expect(rubric).toContain('contrast');
    expect(rubric).not.toContain('\n'); // one line, suitable for a judge prompt
  });
});

describe('calibrationAnchors', () => {
  it('reuses shared catalog strings to anchor the bar (no drift)', () => {
    const anchors = calibrationAnchors();
    const text = anchors.join('\n');
    expect(text).toContain('Calibration anchors');
    expect(text).toContain('SLOP:');
    expect(text).toContain('TASTE:');
    expect(text).toContain(SLOP_TELLS[0] ?? '');
    expect(text).toContain(EXCELLENCE_MARKERS[0] ?? '');
  });
});
