/**
 * Design-system collection (SPEC §9, the DS-adherence inputs). Pure extractors — the testable core
 * of the collectors: parse a repo's design tokens out of CSS custom properties, and extract the
 * literal values + components a variant actually used. The file-walking I/O that feeds these lives
 * in `ds-collect-io.ts` (coverage-excluded). Heuristic by nature; tuned for the high-signal cases
 * (off-system colour/spacing literals), not exhaustive static analysis.
 */

import type { DesignSystem, UsedValues } from './ds-adherence';

/** Categories shared between the design system and the used-value extractor. */
export type TokenCategory = 'color' | 'spacing' | 'radius' | 'fontSize' | 'shadow' | 'other';

const CSS_VAR = /--([\w-]+)\s*:\s*([^;}]+)[;}]/g;

/** Parse `--name: value` CSS custom properties from any block into a name→value map (last wins). */
export function parseCssCustomProperties(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of css.matchAll(CSS_VAR)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      out[name] = value.trim();
    }
  }
  return out;
}

/** Map a token name (without the leading `--`) to a DS category by Tailwind/shadcn conventions. */
export function categorizeToken(name: string): TokenCategory {
  const n = name.toLowerCase();
  if (/radius|rounded/.test(n)) return 'radius';
  if (n.includes('shadow')) return 'shadow';
  if (/(^|-)(spacing|space|gap|size)(-|$)/.test(n)) return 'spacing';
  if (/font|text|leading|tracking|weight/.test(n)) return 'fontSize';
  if (
    /color|background|foreground|primary|secondary|accent|muted|destructive|border|input|ring|card|popover|chart|ink|surface|canvas/.test(
      n,
    )
  ) {
    return 'color';
  }
  return 'other';
}

/** Assemble a {@link DesignSystem} from collected CSS custom properties + component names. */
export function buildDesignSystem(
  customProperties: Record<string, string>,
  components: string[],
): DesignSystem {
  const tokens: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(customProperties)) {
    const category = categorizeToken(name);
    const bucket = (tokens[category] ??= []);
    if (!bucket.includes(value)) {
      bucket.push(value);
    }
  }
  return { tokens, components: [...new Set(components)] };
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/g;
const LENGTH_LITERAL = /\b\d*\.?\d+(?:px|rem|em)\b/g;
const IMPORT_STMT = /import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/g;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v !== ''))];
}

/**
 * Extract the literal values + imported components a variant's code used (SPEC §9). Colour and
 * length literals are the off-system signal — in a token-driven repo, on-system values come through
 * utility classes / `var(--token)` (not literals), so a raw `#ff00ff` or `13px` is what gets flagged.
 * Imported PascalCase identifiers are treated as used components.
 */
export function extractUsedValues(code: string): UsedValues {
  const colors = dedupe(code.match(COLOR_LITERAL) ?? []);
  const spacing = dedupe(code.match(LENGTH_LITERAL) ?? []);

  const components: string[] = [];
  for (const stmt of code.matchAll(IMPORT_STMT)) {
    const clause = stmt[1] ?? '';
    for (const id of clause.match(IDENTIFIER) ?? []) {
      if (/^[A-Z]/.test(id) && id !== 'React') {
        components.push(id);
      }
    }
  }

  const values: Record<string, string[]> = {};
  if (colors.length > 0) values.color = colors;
  if (spacing.length > 0) values.spacing = spacing;
  return { values, components: dedupe(components) };
}

/** Merge several {@link UsedValues} (e.g. from multiple files) into one, de-duplicated by category. */
export function mergeUsedValues(parts: UsedValues[]): UsedValues {
  const values: Record<string, string[]> = {};
  const components: string[] = [];
  for (const part of parts) {
    for (const [category, vals] of Object.entries(part.values)) {
      values[category] = dedupe([...(values[category] ?? []), ...vals]);
    }
    components.push(...part.components);
  }
  return { values, components: dedupe(components) };
}
