/**
 * The "Claude tells" detector: a free, deterministic scan for the second-order AI look. Told to
 * avoid the generic centred-hero template, current models reliably land on a different default —
 * a serif display headline with one italic word in the brand colour, tiny letter-spaced uppercase
 * labels, "§ 01" / "No. 01" section numbering, hairline rules, cream paper, drop caps, glow orbs, a
 * "Scroll" cue. Each move is fine on its own; together they are a signature that reads as
 * machine-made. The impeccable linter (lint.ts) catches the first-order slop; this catches the next
 * layer, and is meant to be updated as model habits drift.
 *
 * The list draws on what the popular design skills themselves name as the AI cluster (see
 * docs/research/design-skills-landscape.md). Pure: callers pass file contents. A finding fires when a rule's count across the variant's changed
 * files reaches its threshold; the 0–100 score subtracts each fired rule's weight.
 */

import { isOverusedFont as libraryIsOverused } from './type-library';

export interface SourceFile {
  path: string;
  content: string;
}

export interface TellRule {
  id: string;
  /** What the tell is, phrased for both the report and the agent prompt. */
  label: string;
  weight: number;
  /** Minimum total count (across files) before the rule fires. */
  threshold: number;
  count: (file: SourceFile, ctx: TellContext) => number;
}

export interface TellContext {
  /** Lowercased font families exempt from the overused-font rule (the brand's own type). */
  exemptFonts: ReadonlySet<string>;
  isOverusedFont: (family: string) => boolean;
}

export interface TellFinding {
  id: string;
  label: string;
  count: number;
  files: string[];
}

export interface TellReport {
  /** 100 = none of the tells; each fired rule subtracts its weight (floored at 0). */
  score: number;
  findings: TellFinding[];
}

const normalizeFamily = (family: string): string =>
  family.replace(/["'`]/g, '').replace(/[+_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const countMatches = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

/** Font families a file declares or loads (CSS, Google Fonts URLs, next/font imports, Tailwind). */
export function declaredFonts(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    out.push(...(m[1] ?? '').split(','));
  }
  for (const m of content.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s)]+)/gi)) {
    for (const fam of (m[1] ?? '').matchAll(/family=([^:&]+)/g)) out.push(fam[1] ?? '');
  }
  for (const m of content.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"](?:next\/font\/google|@fontsource[^'"]*)['"]/g,
  )) {
    out.push(...(m[1] ?? '').split(',').map((n) => n.replace(/_/g, ' ')));
  }
  for (const m of content.matchAll(/@fontsource(?:-variable)?\/([a-z0-9-]+)/g)) {
    out.push((m[1] ?? '').replace(/-/g, ' '));
  }
  for (const m of content.matchAll(/fontFamily\s*:\s*\{([\s\S]*?)\}/g)) {
    for (const q of (m[1] ?? '').matchAll(/['"]([^'"]+)['"]/g)) out.push(q[1] ?? '');
  }
  const generic = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'cursive',
    'inherit',
    'initial',
  ]);
  return [
    ...new Set(
      out
        .map(normalizeFamily)
        .filter(
          (f) => /[a-z]/.test(f) && !generic.has(f) && !f.startsWith('var(') && !f.startsWith('-'),
        ),
    ),
  ];
}

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [0, 1, 2].map((i) => parseInt((h[i] ?? '0').repeat(2), 16)) as [number, number, number];
  }
  if (h.length === 6 || h.length === 8) {
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  return null;
}

/** A warm off-white "paper" colour (the cream ground of the AI-editorial look). */
export function isCream(hex: string): boolean {
  const rgb = parseHex(hex);
  if (rgb === null) return false;
  const [r, g, b] = rgb;
  return r >= 0xf0 && g >= 0xe4 && b >= 0xcc && r - b >= 8 && r - b <= 45 && r >= g;
}

const HEADING_BLOCK = /<h[12]\b[^>]*>[\s\S]*?<\/h[12]>/gi;

export const CLAUDE_TELLS: readonly TellRule[] = [
  {
    id: 'italic-accent-headline',
    label:
      'a display headline with one word or phrase set in italic (usually in the accent colour) for emphasis',
    weight: 20,
    threshold: 1,
    count: (f) =>
      (f.content.match(HEADING_BLOCK) ?? []).filter((h) =>
        /<em\b|<i\b|font-style\s*:\s*italic|\bitalic\b/i.test(h),
      ).length,
  },
  {
    id: 'tracked-uppercase-labels',
    label:
      'tiny uppercase / small-caps letter-spaced "eyebrow" labels and captions scattered through the page',
    weight: 15,
    threshold: 3,
    count: (f) => {
      const cssBlocks = (f.content.match(/\{[^{}]*\}/g) ?? []).filter(
        (block) =>
          /text-transform\s*:\s*uppercase|font-variant(?:-caps)?\s*:\s*(?:all-)?small-caps/i.test(
            block,
          ) && /letter-spacing\s*:\s*(?:0?\.\d*[1-9]\d*|[1-9][\d.]*)\s*(?:em|rem|px)/i.test(block),
      ).length;
      const classLists = (
        f.content.match(/class(?:Name)?\s*=\s*["'`{][^"'`}]*["'`}]/g) ?? []
      ).filter(
        (cls) =>
          /\b(?:uppercase|small-caps)\b/.test(cls) &&
          /\btracking-(?:wide|wider|widest|\[)/.test(cls),
      ).length;
      return cssBlocks + classLists;
    },
  },
  {
    id: 'section-numbering',
    label: 'editorial section numbering — "§ 01", "No. 01", "02 / The Room", "(01)"',
    weight: 15,
    threshold: 2,
    count: (f) =>
      countMatches(f.content, /§/g) +
      countMatches(f.content, /\bNo\.\s?0\d\b/g) +
      countMatches(f.content, /\b0[1-9]\s*(?:\/|—|–)\s*[A-Za-z]/g) +
      countMatches(f.content, /\(0[1-9]\)/g),
  },
  {
    id: 'overused-fonts',
    label:
      'a model-default typeface (Inter, Instrument Serif, Fraunces, Space Grotesk, Playfair, Geist, DM Sans…)',
    weight: 15,
    threshold: 1,
    count: (f, ctx) =>
      declaredFonts(f.content).filter((fam) => !ctx.exemptFonts.has(fam) && ctx.isOverusedFont(fam))
        .length,
  },
  {
    id: 'cream-paper',
    label: 'a warm cream "paper" background paired with serif type (the AI-editorial look)',
    weight: 10,
    threshold: 1,
    count: (f) => {
      const creamBg = [
        ...f.content.matchAll(/background(?:-color)?\s*:\s*[^;}]*?(#[0-9a-f]{3,8})\b/gi),
      ].some((m) => isCream(m[1] ?? ''));
      const creamToken = [
        ...f.content.matchAll(
          /--[\w-]*(?:cream|paper|bg|background|surface)[\w-]*\s*:\s*(#[0-9a-f]{3,8})\b/gi,
        ),
      ].some((m) => isCream(m[1] ?? ''));
      const serif =
        /font-family\s*:[^;}]*\bserif\b/i.test(f.content.replace(/sans-serif/gi, '')) ||
        /\bfont-serif\b/.test(f.content);
      return (creamBg || creamToken) && serif ? 1 : 0;
    },
  },
  {
    id: 'drop-cap',
    label: 'a decorative drop cap on the first paragraph',
    weight: 10,
    threshold: 1,
    count: (f) => countMatches(f.content, /::?first-letter|\bfirst-letter:/g),
  },
  {
    id: 'glow-orbs',
    label: 'large blurred gradient "orbs" or glows floating behind content',
    weight: 10,
    threshold: 2,
    count: (f) =>
      [...f.content.matchAll(/blur\(\s*(\d+)px\s*\)/g)].filter((m) => Number(m[1]) >= 40).length +
      countMatches(f.content, /\bblur-(?:2xl|3xl)\b/g),
  },
  {
    id: 'scroll-cue',
    label: 'a "Scroll" / "Scroll to explore" cue',
    weight: 5,
    threshold: 1,
    count: (f) =>
      countMatches(f.content, />[^<]{0,12}\bscroll(?:\s+(?:down|to explore))?\b[^<]{0,40}</gi),
  },
  {
    id: 'meta-dot-strings',
    label: 'meta strings joined with middle dots ("Portland · Est. 2011 · Roasted weekly")',
    weight: 5,
    threshold: 3,
    count: (f) => countMatches(f.content, /[^\s<>]\s+·\s+[^\s<>]/g),
  },
  {
    id: 'arrow-links',
    label: 'an arrow "→" tacked onto every link and button label',
    weight: 5,
    threshold: 3,
    count: (f) => countMatches(f.content, /→|&rarr;|&#8594;/g),
  },
  {
    id: 'hairline-rules',
    label: 'thin 1px rules dividing every section and row',
    weight: 5,
    threshold: 6,
    count: (f) =>
      countMatches(f.content, /border-(?:top|bottom)(?:-width)?\s*:\s*1px/gi) +
      countMatches(f.content, /<hr\b/gi),
  },
];

export interface DetectTellsOptions {
  /** Brand typefaces (from BRAND.md) — never flagged as overused. */
  exemptFonts?: readonly string[];
  /** Override the overused-font check (e.g. the curated type library's list). */
  isOverusedFont?: (family: string) => boolean;
  rules?: readonly TellRule[];
}

/** Scan a variant's files for the second-order AI tells. */
export function detectTells(
  files: readonly SourceFile[],
  opts: DetectTellsOptions = {},
): TellReport {
  const ctx: TellContext = {
    exemptFonts: new Set((opts.exemptFonts ?? []).map(normalizeFamily)),
    isOverusedFont: opts.isOverusedFont ?? libraryIsOverused,
  };
  const findings: TellFinding[] = [];
  for (const rule of opts.rules ?? CLAUDE_TELLS) {
    let total = 0;
    const hitFiles: string[] = [];
    for (const file of files) {
      const n = rule.count(file, ctx);
      if (n > 0) {
        total += n;
        hitFiles.push(file.path);
      }
    }
    if (total >= rule.threshold) {
      findings.push({ id: rule.id, label: rule.label, count: total, files: hitFiles });
    }
  }
  const penalty = findings.reduce(
    (sum, f) => sum + ((opts.rules ?? CLAUDE_TELLS).find((r) => r.id === f.id)?.weight ?? 0),
    0,
  );
  return { score: Math.max(0, 100 - penalty), findings };
}

/** Prompt lines describing the tells, so agents avoid them up front (unless BRAND.md asks for one). */
export function tellsPromptSection(): string[] {
  return [
    '## The second-order AI look — avoid it',
    'Avoiding the obvious template is not enough: models now fall into a second default that is just as',
    'recognisable. Do not reach for these unless BRAND.md specifically calls for one; a scanner flags them:',
    ...CLAUDE_TELLS.map((rule) => `- ${rule.label}`),
    '',
  ];
}

/** One-line human summary of a report, e.g. `82 (italic-accent-headline, section-numbering)`. */
export function summarizeTells(report: TellReport): string {
  return report.findings.length === 0
    ? `${String(report.score)} (none)`
    : `${String(report.score)} (${report.findings.map((f) => f.id).join(', ')})`;
}
