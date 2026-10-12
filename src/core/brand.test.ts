import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BRAND_FILE,
  BRAND_SECTIONS,
  brandBrief,
  brandFonts,
  brandPromptSection,
  brandTemplate,
  brandUrls,
  cleanDraft,
  composeBrandDraftPrompt,
  isEmptyBrand,
  loadBrand,
  missingSections,
  parseBrand,
} from './brand';

const filled = `# Brand

## The one thing only we can say
We roast on a 1952 Probat we rebuilt ourselves.

## Who it's for
Home brewers in Portland.

## Voice
"Roasted weekly, written down always."
TODO(owner): more examples

## Sites we love
- https://example.com/one — the pacing
- https://example.org/two. the type
- https://example.com/one again

## Sites we hate
TODO(owner): which ones?

## Never look like
A Starbucks clone.

## Brand type
"GT Alpina" (display), Söhne, serif
- Berkeley Mono

## Something custom
Ignored heading.
`;

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length > 0) await rm(dirs.pop()!, { recursive: true, force: true });
});

describe('brandTemplate / parseBrand', () => {
  it('has every section, and an untouched template parses as empty', () => {
    const template = brandTemplate();
    for (const section of BRAND_SECTIONS) expect(template).toContain(`## ${section.title}`);
    const parsed = parseBrand(template);
    expect(isEmptyBrand(parsed)).toBe(true);
    expect(parsed.extra).toEqual([]);
    expect(missingSections(parsed)).toHaveLength(BRAND_SECTIONS.length);
  });

  it('maps headings by keyword and drops unanswered TODO(owner) lines', () => {
    const brand = parseBrand(filled);
    expect(brand.sections.onlyUs).toBe('We roast on a 1952 Probat we rebuilt ourselves.');
    expect(brand.sections.voice).toBe('"Roasted weekly, written down always."');
    expect(brand.sections.hates).toBeUndefined();
    expect(brand.sections.never).toBe('A Starbucks clone.');
    expect(missingSections(brand)).toEqual(['proof', 'hates', 'assets']);
    expect(isEmptyBrand(brand)).toBe(false);
  });

  it('extracts brand fonts and de-duplicated URLs', () => {
    const brand = parseBrand(filled);
    expect(brandFonts(brand)).toEqual(['GT Alpina', 'Söhne', 'Berkeley Mono']);
    expect(brandUrls(brand, 'loves')).toEqual([
      'https://example.com/one',
      'https://example.org/two',
    ]);
    expect(brandUrls(brand, 'hates')).toEqual([]);
    expect(brandFonts(parseBrand('## Voice\nhi'))).toEqual([]);
    expect(
      brandFonts(parseBrand('## Brand type\nNo fixed brand typeface — choose one per direction.')),
    ).toEqual([]);
  });
});

describe('brandPromptSection / brandBrief', () => {
  it('renders the filled sections with build-from-this instructions, capped', () => {
    const lines = brandPromptSection(parseBrand(filled)).join('\n');
    expect(lines).toContain('## The brand (BRAND.md) — build FROM this');
    expect(lines).toContain('### The one thing only we can say');
    // Owner-added sections are kept and passed through.
    expect(lines).toContain('### Something custom');
    expect(lines).toContain('Ignored heading.');
    expect(brandPromptSection(parseBrand(filled), 40).join('\n')).toContain('…(truncated)');
  });

  it('is empty without a brand or with an untouched template', () => {
    expect(brandPromptSection(null)).toEqual([]);
    expect(brandPromptSection(parseBrand(brandTemplate()))).toEqual([]);
    expect(brandBrief(null)).toBe('');
  });

  it('gives the planner/judge a compact one-line-per-section excerpt', () => {
    const brief = brandBrief(parseBrand(filled));
    expect(brief).toContain('Only true of us: We roast on a 1952 Probat');
    expect(brief).toContain('Never look like: A Starbucks clone.');
    expect(brief).not.toContain('Brand type');
  });
});

describe('drafting', () => {
  it('asks a read-only agent for every section, leaving owner-only ones as TODOs', () => {
    const prompt = composeBrandDraftPrompt();
    for (const section of BRAND_SECTIONS) expect(prompt).toContain(section.title);
    expect(prompt).toContain('Do not edit any files');
    expect(prompt).toContain('TODO(owner)');
  });

  it('cleans fences and preambles from the reply', () => {
    expect(cleanDraft('Here you go:\n```markdown\n# Brand\n## Voice\nhi\n```')).toBe(
      '# Brand\n## Voice\nhi\n',
    );
    expect(cleanDraft('Sure! # Brand\nx')).toBe('# Brand\nx\n');
    expect(cleanDraft('# Brand')).toBe('# Brand\n');
  });
});

describe('loadBrand', () => {
  it('reads BRAND.md from the project root, or null when absent', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-brand-'));
    dirs.push(dir);
    expect(await loadBrand(dir)).toBeNull();
    await writeFile(path.join(dir, BRAND_FILE), filled, 'utf8');
    expect((await loadBrand(dir))?.sections.audience).toBe('Home brewers in Portland.');
  });

  it('rethrows non-ENOENT errors', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-brand-'));
    dirs.push(dir);
    await writeFile(path.join(dir, 'x'), '', 'utf8');
    // A file where a directory is expected → ENOTDIR, not ENOENT.
    await expect(loadBrand(path.join(dir, 'x'))).rejects.toThrow();
  });
});
