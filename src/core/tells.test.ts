import { describe, expect, it } from 'vitest';
import type { SourceFile } from './tells';
import {
  CLAUDE_TELLS,
  declaredFonts,
  detectTells,
  isCream,
  summarizeTells,
  tellsPromptSection,
} from './tells';

const file = (content: string, path = 'index.html'): SourceFile => ({ path, content });

/** The AI-editorial look from a real Tiraz run (abridged). */
const ledger = [
  file(`<h1>Small-batch coffee, roasted in <em>Portland</em>.</h1>
<p class="drop">Single origins</p><span>§ 00</span><span>§ 01</span><p>No. 01</p>
<div>Scroll — the roasting room</div><hr><hr><hr>`),
  file(
    `:root { --paper: #f6efe6; } body { font-family: Georgia, serif; background: var(--paper); }
.label { text-transform: uppercase; letter-spacing: .2em; }
.kicker { text-transform: uppercase; letter-spacing: 0.14em; }
nav a { font-variant-caps: all-small-caps; letter-spacing: .18em; }
.drop::first-letter { font-size: 4em; }
section { border-top: 1px solid; } .row { border-bottom: 1px solid; } .x { border-top: 1px solid; }
.orb { filter: blur(80px); } .orb2 { filter: blur(120px); }`,
    'styles.css',
  ),
];

describe('detectTells', () => {
  it('flags the second-order AI look and scores it down', () => {
    const report = detectTells(ledger);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'italic-accent-headline',
        'tracked-uppercase-labels',
        'section-numbering',
        'overused-fonts',
        'cream-paper',
        'drop-cap',
        'glow-orbs',
        'scroll-cue',
        'hairline-rules',
      ]),
    );
    expect(report.score).toBe(0);
    expect(report.findings.find((f) => f.id === 'drop-cap')?.files).toEqual(['styles.css']);
  });

  it('passes clean, committed work', () => {
    const report = detectTells([
      file('<h1>Coffee you can taste the week in</h1><p>Roasted Tuesdays.</p>'),
      file('body { font-family: "GT Alpina", system-ui; background: #10100e; }', 'a.css'),
    ]);
    expect(report).toEqual({ score: 100, findings: [] });
  });

  it('respects thresholds (one label or one § is fine)', () => {
    const report = detectTells([
      file('<span class="uppercase tracking-widest">One</span><span>§ 1</span>'),
    ]);
    expect(report.findings).toEqual([]);
  });

  it('counts Tailwind eyebrow labels and italic classes in headings', () => {
    const tw = Array.from(
      { length: 3 },
      () => '<p className="text-xs uppercase tracking-[0.2em]">x</p>',
    ).join('');
    const report = detectTells([
      file(`<h2 class="text-6xl">A <span class="italic">b</span></h2>${tw}`),
    ]);
    expect(report.findings.map((f) => f.id)).toEqual([
      'italic-accent-headline',
      'tracked-uppercase-labels',
    ]);
  });

  it('judges only the primary family of a stack (fallbacks like Georgia are fine)', () => {
    const css = [
      file(
        ':root { --display: "Young Serif", Georgia, serif; } a { font-family: Inter, sans-serif }',
        'a.css',
      ),
    ];
    const finding = detectTells(css).findings.find((f) => f.id === 'overused-fonts');
    expect(finding?.count).toBe(1); // Inter, not Georgia
    expect(declaredFonts(css[0]!.content, { primaryOnly: true }).sort()).toEqual([
      'inter',
      'young serif',
    ]);
  });

  it('exempts brand fonts and accepts a custom overused list', () => {
    const css = [file('h1 { font-family: "Inter", sans-serif; }', 'a.css')];
    expect(detectTells(css).findings.map((f) => f.id)).toEqual(['overused-fonts']);
    expect(detectTells(css, { exemptFonts: ['Inter'] }).findings).toEqual([]);
    expect(detectTells(css, { isOverusedFont: () => false }).findings).toEqual([]);
  });

  it('runs a custom rule set', () => {
    const report = detectTells([file('xx')], {
      rules: [{ id: 'x', label: 'x', weight: 50, threshold: 2, count: (f) => f.content.length }],
    });
    expect(report).toEqual({
      score: 50,
      findings: [{ id: 'x', label: 'x', count: 2, files: ['index.html'] }],
    });
  });
});

describe('research-backed template chrome', () => {
  it('flags middle-dot meta strings and arrows on every link', () => {
    const report = detectTells([
      file(
        '<p>Portland · Est. 2011 · Weekly</p><p>A · B</p><a>Shop →</a><a>Visit &rarr;</a><a>More →</a>',
      ),
    ]);
    expect(report.findings.map((f) => f.id)).toEqual(['meta-dot-strings', 'arrow-links']);
  });
});

describe('declaredFonts', () => {
  it('reads CSS, Google Fonts URLs, next/font, fontsource, and Tailwind config', () => {
    const content = `
      a { font-family: 'Fraunces', var(--x), serif; }
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400&family=Inter&display=swap">
      import { Instrument_Serif, Inter } from 'next/font/google';
      import '@fontsource/dm-sans';
      fontFamily: { display: ['"Playfair Display"', 'serif'] }`;
    expect(declaredFonts(content).sort()).toEqual(
      [
        'dm sans',
        'fraunces',
        'instrument serif',
        'inter',
        'playfair display',
        'space grotesk',
      ].sort(),
    );
  });
});

describe('declaredFonts — custom properties', () => {
  it('reads font stacks held in CSS variables, ignoring non-font vars', () => {
    const content = `:root {
      --font: "Host Grotesk", "Helvetica Neue", Arial, sans-serif;
      --display: 'Young Serif', Georgia, serif;
      --brand: #6b3e26;
      --label-text: "Fig. 1";
      --gap: 1rem, 2rem;
    }`;
    expect(declaredFonts(content).sort()).toEqual(
      ['arial', 'georgia', 'helvetica neue', 'host grotesk', 'young serif'].sort(),
    );
  });
});

describe('isCream', () => {
  it('recognises warm off-whites only', () => {
    expect(isCream('#f6efe6')).toBe(true);
    expect(isCream('#fdf6e3')).toBe(true);
    expect(isCream('#ffffff')).toBe(false);
    expect(isCream('#fff')).toBe(false);
    expect(isCream('#1d1a17')).toBe(false);
    expect(isCream('#e6f0f6')).toBe(false);
    expect(isCream('#f6efe6ff')).toBe(true);
    expect(isCream('#zz')).toBe(false);
  });
});

describe('prompt + summary helpers', () => {
  it('lists every tell for the agent', () => {
    const text = tellsPromptSection().join('\n');
    for (const rule of CLAUDE_TELLS) expect(text).toContain(rule.label);
  });

  it('summarises a report', () => {
    expect(summarizeTells({ score: 100, findings: [] })).toBe('100 (none)');
    expect(
      summarizeTells({ score: 65, findings: [{ id: 'a', label: '', count: 1, files: [] }] }),
    ).toBe('65 (a)');
  });
});
