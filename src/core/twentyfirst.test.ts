import { describe, expect, it } from 'vitest';
import type { DesignSystem } from './ds-adherence';
import type { Genome } from './genome';
import {
  TWENTYFIRST_API_KEY_ENV,
  TWENTYFIRST_BASE_URL,
  TWENTYFIRST_FETCH_UI_PATH,
  TWENTYFIRST_SOURCE_ID,
  buildFetchUiRequest,
  composePlanningPrompt,
  parseFetchUiResponse,
  parsePlannedQueries,
  pickTopComponent,
  slugifyComponentName,
} from './twentyfirst';

const genome: Genome = {
  id: 'g0-n0',
  parents: [],
  primary: 'impeccable',
  overlay: 'none',
  dials: { variance: 5, motion: 5, density: 5 },
  commands: [],
  seed: 0,
  brief: 'A bold animated hero for a developer-tools landing page',
  createdAt: '2026-06-12T00:00:00.000Z',
  target: 'story:hero--default',
};

describe('constants', () => {
  it('point at the real fetch-ui endpoint and standard key env', () => {
    expect(TWENTYFIRST_BASE_URL).toBe('https://magic.21st.dev');
    expect(TWENTYFIRST_FETCH_UI_PATH).toBe('/api/fetch-ui');
    expect(TWENTYFIRST_API_KEY_ENV).toBe('TWENTY_FIRST_API_KEY');
    // Recorded under the same id as the sources.ts entry so provenance/permitted-source logic lines up.
    expect(TWENTYFIRST_SOURCE_ID).toBe('21st-registry');
  });
});

describe('composePlanningPrompt', () => {
  it('includes the brief, target, strict JSON instruction, and the budget cap', () => {
    const prompt = composePlanningPrompt(genome, undefined, 3);
    expect(prompt).toContain(genome.brief);
    expect(prompt).toContain('story:hero--default');
    expect(prompt).toContain('JSON array of at most 3');
    expect(prompt).toContain('output exactly: []');
  });

  it('adds a design-context line when the system has a palette / components', () => {
    const system: DesignSystem = {
      tokens: { color: ['var(--primary)', 'var(--accent)'] },
      components: ['Button', 'Card'],
    };
    const prompt = composePlanningPrompt(genome, system, 2);
    expect(prompt).toContain('Design context');
    expect(prompt).toContain('var(--primary)');
    expect(prompt).toContain('Button');
  });

  it('omits the design-context section for an empty design system', () => {
    const prompt = composePlanningPrompt(genome, { tokens: {}, components: [] }, 2);
    expect(prompt).not.toContain('Design context');
  });
});

describe('parsePlannedQueries', () => {
  it('parses a bare JSON array', () => {
    expect(parsePlannedQueries('["animated hero", "pricing table"]', { max: 5 })).toEqual([
      'animated hero',
      'pricing table',
    ]);
  });

  it('extracts the array from surrounding prose / markdown fences', () => {
    const out =
      'Sure! Here are my picks:\n```json\n["bento grid", "marquee"]\n```\nHope that helps.';
    expect(parsePlannedQueries(out, { max: 5 })).toEqual(['bento grid', 'marquee']);
  });

  it('trims, collapses whitespace, drops empties, and dedupes case-insensitively', () => {
    const out = '["  Animated   Hero ", "animated hero", "", "Marquee"]';
    expect(parsePlannedQueries(out, { max: 5 })).toEqual(['Animated Hero', 'Marquee']);
  });

  it('caps at the budget', () => {
    expect(parsePlannedQueries('["a", "b", "c", "d"]', { max: 2 })).toEqual(['a', 'b']);
  });

  it('returns [] for unparseable output, an empty array, or a non-positive budget', () => {
    expect(parsePlannedQueries('no json here', { max: 5 })).toEqual([]);
    expect(parsePlannedQueries('[]', { max: 5 })).toEqual([]);
    expect(parsePlannedQueries('["a"]', { max: 0 })).toEqual([]);
  });

  it('tolerantly recovers a string array even when wrapped in an object', () => {
    // Defensive: if the agent returns `{ "queries": [...] }` instead of a bare array, still recover it.
    expect(parsePlannedQueries('{"queries": ["a", "b"]}', { max: 5 })).toEqual(['a', 'b']);
  });
});

describe('parseFetchUiResponse', () => {
  const body = (components: unknown[]): { text: string } => ({ text: JSON.stringify(components) });

  it('unwraps { text } and validates each component', () => {
    const out = parseFetchUiResponse(
      body([
        {
          componentName: 'Hero Animated',
          componentCode: 'export const Hero = () => null;',
          similarity: 0.9,
        },
        {
          componentName: 'Shape Hero',
          componentCode: 'export const Shape = () => null;',
          demoCode: 'demo',
        },
      ]),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      componentName: 'Hero Animated',
      componentCode: 'export const Hero = () => null;',
      similarity: 0.9,
    });
    expect(out[1]?.demoCode).toBe('demo');
  });

  it('drops records missing a name or code', () => {
    const out = parseFetchUiResponse(
      body([
        { componentName: '', componentCode: 'x' },
        { componentName: 'Ok', componentCode: '   ' },
        { componentName: 'Good', componentCode: 'real code' },
      ]),
    );
    expect(out).toEqual([{ componentName: 'Good', componentCode: 'real code' }]);
  });

  it('accepts a bare JSON string body as well as { text }', () => {
    const raw = JSON.stringify([{ componentName: 'A', componentCode: 'c' }]);
    expect(parseFetchUiResponse(raw)).toHaveLength(1);
  });

  it('returns [] for malformed / missing / non-array payloads', () => {
    expect(parseFetchUiResponse({ text: 'not json' })).toEqual([]);
    expect(parseFetchUiResponse({ text: '{"not":"array"}' })).toEqual([]);
    expect(parseFetchUiResponse({})).toEqual([]);
    expect(parseFetchUiResponse(null)).toEqual([]);
    expect(parseFetchUiResponse(42)).toEqual([]);
  });
});

describe('pickTopComponent', () => {
  it('picks the highest similarity, falling back to order when absent', () => {
    expect(
      pickTopComponent([
        { componentName: 'B', componentCode: 'b', similarity: 0.3 },
        { componentName: 'A', componentCode: 'a', similarity: 0.8 },
      ])?.componentName,
    ).toBe('A');
    expect(
      pickTopComponent([
        { componentName: 'first', componentCode: 'x' },
        { componentName: 'second', componentCode: 'y' },
      ])?.componentName,
    ).toBe('first');
    expect(pickTopComponent([])).toBeNull();
  });
});

describe('slugifyComponentName', () => {
  it('kebab-cases, strips punctuation, and falls back for empties', () => {
    expect(slugifyComponentName('Shape Landing Hero')).toBe('shape-landing-hero');
    expect(slugifyComponentName('ruixen-ui-hero')).toBe('ruixen-ui-hero');
    expect(slugifyComponentName('  Fancy!! Button (v2) ')).toBe('fancy-button-v2');
    expect(slugifyComponentName('***')).toBe('component');
  });
});

describe('buildFetchUiRequest', () => {
  it('builds the authed POST with the x-api-key header and JSON body', () => {
    const req = buildFetchUiRequest('animated hero', 'build a hero', 'secret-key');
    expect(req).toEqual({
      url: 'https://magic.21st.dev/api/fetch-ui',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'secret-key' },
      body: JSON.stringify({ message: 'build a hero', searchQuery: 'animated hero' }),
    });
  });
});
