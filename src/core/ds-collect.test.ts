import { describe, expect, it } from 'vitest';
import {
  buildDesignSystem,
  categorizeToken,
  dropComponents,
  extractExportedComponents,
  extractUsedValues,
  mergeUsedValues,
  parseCssCustomProperties,
} from './ds-collect';

describe('parseCssCustomProperties', () => {
  it('extracts custom properties from any block (last value wins)', () => {
    const css = `
      :root { --background: #f9fafb; --primary: 222 47% 11%; --radius: 0.5rem; }
      @theme { --color-accent: #10b981; --spacing-4: 1rem; }
      .x { --primary: #18181b; }
    `;
    const props = parseCssCustomProperties(css);
    expect(props.background).toBe('#f9fafb');
    expect(props['color-accent']).toBe('#10b981');
    expect(props['spacing-4']).toBe('1rem');
    expect(props.primary).toBe('#18181b'); // later declaration wins
  });
});

describe('categorizeToken', () => {
  it('maps token names to categories by convention', () => {
    expect(categorizeToken('color-accent')).toBe('color');
    expect(categorizeToken('primary')).toBe('color');
    expect(categorizeToken('background')).toBe('color');
    expect(categorizeToken('radius')).toBe('radius');
    expect(categorizeToken('spacing-4')).toBe('spacing');
    expect(categorizeToken('font-sans')).toBe('fontSize');
    expect(categorizeToken('shadow-lg')).toBe('shadow');
    expect(categorizeToken('z-index')).toBe('other');
  });
});

describe('buildDesignSystem', () => {
  it('groups token values by category and dedupes components', () => {
    const system = buildDesignSystem(
      { background: '#f9fafb', 'color-accent': '#10b981', radius: '0.5rem', 'spacing-2': '0.5rem' },
      ['Button', 'Card', 'Button'],
    );
    expect(system.tokens.color).toEqual(['#f9fafb', '#10b981']);
    expect(system.tokens.radius).toEqual(['0.5rem']);
    expect(system.tokens.spacing).toEqual(['0.5rem']);
    expect(system.components).toEqual(['Button', 'Card']);
  });
});

describe('extractUsedValues', () => {
  it('pulls colour + length literals and imported PascalCase components', () => {
    const code = `
      import { Button, Card as Panel } from '@/components/ui';
      import { cn } from '@/lib/utils';
      export function Hero() {
        return <div className="bg-[#ff00ff] p-[13px]" style={{ color: 'rgb(10,20,30)', gap: '8px' }}>
          <Button /><Panel />
        </div>;
      }
    `;
    const used = extractUsedValues(code);
    expect(used.values.color).toEqual(expect.arrayContaining(['#ff00ff', 'rgb(10,20,30)']));
    expect(used.values.spacing).toEqual(expect.arrayContaining(['13px', '8px']));
    // PascalCase imports become components; lowercase utils (cn) and React are excluded.
    expect(used.components).toEqual(expect.arrayContaining(['Button', 'Card', 'Panel']));
    expect(used.components).not.toContain('cn');
  });

  it('omits empty categories', () => {
    const used = extractUsedValues('const x = 1;');
    expect(used.values).toEqual({});
    expect(used.components).toEqual([]);
  });

  it('captures design-system references (var() + token utility classes) as systemRefs', () => {
    const code = `
      <div className="bg-primary text-foreground border-border" style={{ color: 'var(--accent)' }}>
        <span className="bg-[#ff00ff]" style={{ background: 'var(--primary)' }} />
      </div>`;
    const used = extractUsedValues(code);
    expect(used.systemRefs).toEqual(
      expect.arrayContaining(['var(--accent)', 'var(--primary)', 'bg-primary', 'text-foreground']),
    );
    // the raw bracket hex is still flagged off-system
    expect(used.values.color).toContain('#ff00ff');
  });
});

describe('mergeUsedValues', () => {
  it('combines and dedupes across files (incl. systemRefs)', () => {
    const merged = mergeUsedValues([
      { values: { color: ['#fff'] }, components: ['Button'], systemRefs: ['var(--primary)'] },
      {
        values: { color: ['#fff', '#000'], spacing: ['8px'] },
        components: ['Button', 'Card'],
        systemRefs: ['var(--primary)', 'bg-accent'],
      },
    ]);
    expect(merged.values.color).toEqual(['#fff', '#000']);
    expect(merged.values.spacing).toEqual(['8px']);
    expect(merged.components).toEqual(['Button', 'Card']);
    expect(merged.systemRefs).toEqual(['var(--primary)', 'bg-accent']);
  });
});

describe('extractExportedComponents', () => {
  it('finds PascalCase exports from declarations and export lists (Phase 1.5)', () => {
    const code = [
      'export function Marquee() {}',
      'export const BentoGrid = () => null;',
      'export default function HeroGeometric() {}',
      'const inner = 1; export { inner as ShiftCard };',
      'export const helper = 2;', // lowercase → not a component
      'export class CardStack {}',
    ].join('\n');
    expect(extractExportedComponents(code).sort()).toEqual([
      'BentoGrid',
      'CardStack',
      'HeroGeometric',
      'Marquee',
      'ShiftCard',
    ]);
  });

  it('returns [] when nothing is exported', () => {
    expect(extractExportedComponents('const x = 1;')).toEqual([]);
  });
});

describe('dropComponents', () => {
  it('removes the named components (e.g. imports of fetched library code)', () => {
    const used = {
      values: { color: ['#fff'] },
      components: ['Hero', 'Marquee', 'ShiftCard'],
      systemRefs: ['var(--primary)'],
    };
    expect(dropComponents(used, ['Marquee', 'ShiftCard']).components).toEqual(['Hero']);
    // Values + refs are untouched.
    expect(dropComponents(used, ['Marquee']).values).toEqual({ color: ['#fff'] });
  });

  it('is a no-op for an empty name list', () => {
    const used = { values: {}, components: ['Hero'], systemRefs: [] };
    expect(dropComponents(used, [])).toBe(used);
  });
});
