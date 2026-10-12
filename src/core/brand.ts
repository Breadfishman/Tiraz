/**
 * The brand file (`BRAND.md`): the specific, human-supplied material that makes a design belong to
 * one company instead of averaging into the model's defaults. Generic inputs produce generic output —
 * a brief plus four colour tokens leaves every gap to be filled by the model's house style. BRAND.md
 * gives the planner, every build agent, and the judge the same concrete facts: what only this
 * company can say, its real voice and proof, sites the owner loves and hates, and real assets.
 *
 * It lives at the repo root (committed, so every variant worktree sees it too). Parsing is lenient
 * markdown: `## ` headings map to known sections by keyword; HTML comments (the template's hints)
 * are ignored so an untouched template reads as empty. Pure, except {@link loadBrand}.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isErrnoException } from './config';

export const BRAND_FILE = 'BRAND.md';

export type BrandKey =
  | 'onlyUs'
  | 'audience'
  | 'voice'
  | 'proof'
  | 'loves'
  | 'hates'
  | 'never'
  | 'assets'
  | 'type';

export interface BrandSectionSpec {
  key: BrandKey;
  title: string;
  /** Lowercase keywords that identify this section's heading (first match wins, in order). */
  match: readonly string[];
  hint: string;
  /** Only the owner can answer this one (a draft leaves it as a TODO). */
  ownerOnly?: boolean;
}

export const BRAND_SECTIONS: readonly BrandSectionSpec[] = [
  {
    key: 'onlyUs',
    title: 'The one thing only we can say',
    match: ['only we', 'only us', 'one thing', 'unique'],
    hint: 'What is true of this company and of no competitor? A specific fact, belief, or way of working — not "quality" or "innovation".',
  },
  {
    key: 'audience',
    title: "Who it's for",
    match: ['who it', 'audience', 'customer'],
    hint: 'Who visits this site, what they already know, and what they need to believe before they act.',
  },
  {
    key: 'voice',
    title: 'Voice',
    match: ['voice', 'tone'],
    hint: 'Three real sentences the company has written (site, emails, socials) that sound like it, plus words it would never use.',
  },
  {
    key: 'proof',
    title: 'Proof',
    match: ['proof', 'facts', 'numbers'],
    hint: 'Real numbers, customers, awards, dates, product details. The design should show these, not invent placeholder stats.',
  },
  {
    key: 'loves',
    title: 'Sites we love',
    match: ['love', 'admire', 'inspiration'],
    hint: 'Two or three URLs and what exactly you love about each (the type? the pacing? the photography?).',
    ownerOnly: true,
  },
  {
    key: 'hates',
    title: 'Sites we hate',
    match: ['hate', 'dislike'],
    hint: 'URLs or descriptions of what you never want to resemble, and why.',
    ownerOnly: true,
  },
  {
    key: 'never',
    title: 'Never look like',
    match: ['never', 'avoid', 'not us'],
    hint: 'Aesthetics, clichés, or competitor looks that are off-limits.',
    ownerOnly: true,
  },
  {
    key: 'assets',
    title: 'Assets',
    match: ['asset', 'image', 'photo', 'logo'],
    hint: 'Repo-relative paths to the logo, real photography, illustrations, icons. Use these instead of invented imagery.',
  },
  {
    key: 'type',
    title: 'Brand type',
    match: ['type', 'font', 'typography'],
    hint: 'Brand typefaces, if any (comma-separated family names). Leave empty to let each direction choose.',
  },
];

export interface Brand {
  raw: string;
  sections: Partial<Record<BrandKey, string>>;
  /** Owner-added sections with other headings (e.g. "Constraints"), kept verbatim, in order. */
  extra: { title: string; body: string }[];
}

/** The starter BRAND.md written by `tiraz brand init`. */
export function brandTemplate(): string {
  const lines = [
    '# Brand',
    '',
    '<!-- Tiraz reads this file before planning, building, and judging every variant. Specific beats',
    '     polished: real facts, real sentences, real images. Delete these comments as you fill it in. -->',
    '',
  ];
  for (const section of BRAND_SECTIONS) {
    lines.push(`## ${section.title}`, '', `<!-- ${section.hint} -->`, '');
  }
  return lines.join('\n');
}

/** Drop the template's hint comments and unanswered `TODO(owner)` lines from a draft. */
function stripComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => !/^\s*(?:[-*]\s*)?TODO\(owner\)/i.test(line))
    .join('\n');
}

function sectionKeyFor(heading: string): BrandKey | undefined {
  const h = heading.toLowerCase();
  return BRAND_SECTIONS.find((s) => s.match.some((m) => h.includes(m)))?.key;
}

/** Parse BRAND.md leniently. Unknown headings are kept in `raw` but not keyed. */
export function parseBrand(text: string): Brand {
  const sections: Partial<Record<BrandKey, string>> = {};
  const clean = stripComments(text);
  const parts = clean.split(/^##[ \t]+(.+)$/m);
  // parts = [preamble, heading1, body1, heading2, body2, ...]
  const extra: { title: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const title = (parts[i] ?? '').trim();
    const key = sectionKeyFor(title);
    const body = (parts[i + 1] ?? '').trim();
    if (body === '') continue;
    if (key === undefined) extra.push({ title, body });
    else sections[key] ??= body;
  }
  return { raw: text, sections, extra };
}

/** Section keys that are still empty. */
export function missingSections(brand: Brand): BrandKey[] {
  return BRAND_SECTIONS.filter((s) => brand.sections[s.key] === undefined).map((s) => s.key);
}

/** True when nothing useful has been filled in yet. */
export function isEmptyBrand(brand: Brand): boolean {
  return Object.keys(brand.sections).length === 0 && brand.extra.length === 0;
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive']);

/** Brand typeface family names from the `type` section (comma / newline / bullet separated). */
export function brandFonts(brand: Brand): string[] {
  const body = brand.sections.type;
  if (body === undefined) return [];
  return (
    body
      .split(/[,\n]/)
      .map((part) =>
        part
          .replace(/^[\s*-]+/, '')
          .replace(/\(.*?\)/g, '')
          .replace(/["'`]/g, '')
          .trim(),
      )
      // A family name is a few words with no sentence punctuation ("GT Alpina", "Söhne Mono") — prose
      // like "No fixed typeface — choose per direction." is not a font.
      .filter(
        (name) =>
          name !== '' &&
          name.split(/\s+/).length <= 4 &&
          !/[—–.!?:;]/.test(name) &&
          !GENERIC_FAMILIES.has(name.toLowerCase()),
      )
  );
}

/** URLs listed in a section (e.g. `loves` / `hates`), in order, de-duplicated. */
export function brandUrls(brand: Brand, key: BrandKey): string[] {
  const body = brand.sections[key] ?? '';
  const urls = body.match(/https?:\/\/[^\s)>\]"']+/g) ?? [];
  return [...new Set(urls.map((u) => u.replace(/[.,;:]+$/, '')))];
}

function cap(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars).trimEnd()}\n…(truncated)`;
}

/**
 * Build-prompt section: the filled-in brand material, verbatim (capped), with instructions to build
 * FROM it. Empty when the brand file is absent or untouched.
 */
export function brandPromptSection(brand: Brand | null, maxChars = 6000): string[] {
  if (brand === null || isEmptyBrand(brand)) return [];
  const body = [
    ...BRAND_SECTIONS.flatMap((s) => {
      const text = brand.sections[s.key];
      return text === undefined ? [] : [`### ${s.title}`, text, ''];
    }),
    ...brand.extra.flatMap((e) => [`### ${e.title}`, e.body, '']),
  ].join('\n');
  return [
    '## The brand (BRAND.md) — build FROM this, not from your defaults',
    'This is what makes this site belong to this company. Use the real voice, proof, and assets below;',
    'derive type, colour, imagery, and the signature element from them. Anything listed under "Never',
    'look like" or "Sites we hate" is off-limits. Do not invent stats, quotes, or stock imagery.',
    '',
    cap(body.trim(), maxChars),
    '',
  ];
}

/** A compact brand excerpt for the planner and judge (what's unique + what's off-limits). */
export function brandBrief(brand: Brand | null, maxChars = 1500): string {
  if (brand === null) return '';
  const pick: [BrandKey, string][] = [
    ['onlyUs', 'Only true of us'],
    ['audience', 'Audience'],
    ['voice', 'Voice'],
    ['loves', 'Loves'],
    ['hates', 'Hates'],
    ['never', 'Never look like'],
  ];
  const lines = pick.flatMap(([key, label]) => {
    const text = brand.sections[key];
    return text === undefined ? [] : [`${label}: ${text.replace(/\s+/g, ' ').trim()}`];
  });
  return cap(lines.join('\n'), maxChars);
}

/** Read `<cwd>/BRAND.md`, or `null` when absent. */
export async function loadBrand(cwd: string): Promise<Brand | null> {
  try {
    return parseBrand(await readFile(path.join(cwd, BRAND_FILE), 'utf8'));
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Prompt for `tiraz brand draft`: a read-only agent studies the existing site and drafts BRAND.md,
 * leaving owner-only sections as explicit TODOs instead of guessing.
 */
export function composeBrandDraftPrompt(): string {
  const ownerOnly = BRAND_SECTIONS.filter((s) => s.ownerOnly === true).map((s) => s.title);
  return [
    "Draft a BRAND.md for this repository's company by reading the existing site: pages, copy,",
    'components, public assets, README, package.json. Do not edit any files; reply with the markdown only.',
    '',
    'Use exactly these sections, in order, as `## ` headings:',
    ...BRAND_SECTIONS.map((s) => `- ${s.title}: ${s.hint}`),
    '',
    'Rules:',
    '- Quote real copy verbatim for Voice; cite real facts for Proof; list real asset paths that exist.',
    '- Be specific. If the site does not say something, write `TODO(owner): <question>` rather than guess.',
    `- These sections are the owner's call: ${ownerOnly.join(', ')}. Write only TODO(owner) prompts there.`,
    '- Start with `# Brand`. No preamble, no code fences.',
  ].join('\n');
}

/** Strip a stray code fence / preamble from a drafted BRAND.md reply. */
export function cleanDraft(text: string): string {
  let out = text.trim();
  const fenced = /```(?:markdown|md)?\n([\s\S]*?)```/.exec(out);
  if (fenced?.[1] !== undefined) out = fenced[1].trim();
  const start = out.indexOf('# Brand');
  if (start > 0) out = out.slice(start);
  return `${out}\n`;
}
