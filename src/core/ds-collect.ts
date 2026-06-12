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
/** Design-system references: `var(--token)` and shadcn/Tailwind token utility classes. */
const CSS_VAR_REF = /var\(\s*--[\w-]+\s*\)/g;
const TOKEN_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|accent|caret|decoration|shadow|ring-offset)-(?:primary|secondary|accent|muted|destructive|foreground|background|card|popover|border|input|ring|chart-[1-5])\b/g;

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v !== ''))];
}

/**
 * Extract what a variant's code used (SPEC §9), split into the two adherence signals:
 * - **off-system literals** — raw `#ff00ff` colours and `13px` lengths that bypass the system;
 * - **system references** — `var(--token)` and token utility classes (`bg-primary`), i.e. using the
 *   design system the intended way (each scored on-system).
 * Plus imported PascalCase components.
 */
export function extractUsedValues(code: string): UsedValues {
  const colors = dedupe(code.match(COLOR_LITERAL) ?? []);
  const spacing = dedupe(code.match(LENGTH_LITERAL) ?? []);
  const systemRefs = dedupe([
    ...(code.match(CSS_VAR_REF) ?? []),
    ...(code.match(TOKEN_CLASS) ?? []),
  ]);

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
  return { values, components: dedupe(components), systemRefs };
}

const EXPORT_DECL =
  /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST = /export\s*\{([^}]*)\}/g;

/**
 * Extract the PascalCase component identifiers a file EXPORTS (Phase 1.5). Used on fetched library
 * files so DS-adherence can drop the agent's imports of those components from its authored-choices
 * score — composing a permitted fetched component is not off-system slop (SPEC §12).
 */
export function extractExportedComponents(code: string): string[] {
  const names = new Set<string>();
  for (const match of code.matchAll(EXPORT_DECL)) {
    const id = match[1];
    if (id !== undefined && /^[A-Z]/.test(id)) names.add(id);
  }
  for (const match of code.matchAll(EXPORT_LIST)) {
    for (const part of (match[1] ?? '').split(',')) {
      // `export { Inner as Marquee }` re-exports under the trailing name.
      const id = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (id !== undefined && /^[A-Z][\w$]*$/.test(id)) names.add(id);
    }
  }
  return [...names];
}

/** Drop the given component names from a {@link UsedValues} (e.g. imports of fetched components). */
export function dropComponents(used: UsedValues, names: readonly string[]): UsedValues {
  if (names.length === 0) return used;
  const drop = new Set(names);
  return { ...used, components: used.components.filter((c) => !drop.has(c)) };
}

/** Merge several {@link UsedValues} (e.g. from multiple files) into one, de-duplicated by category. */
export function mergeUsedValues(parts: UsedValues[]): UsedValues {
  const values: Record<string, string[]> = {};
  const components: string[] = [];
  const systemRefs: string[] = [];
  for (const part of parts) {
    for (const [category, vals] of Object.entries(part.values)) {
      values[category] = dedupe([...(values[category] ?? []), ...vals]);
    }
    components.push(...part.components);
    systemRefs.push(...(part.systemRefs ?? []));
  }
  return { values, components: dedupe(components), systemRefs: dedupe(systemRefs) };
}
