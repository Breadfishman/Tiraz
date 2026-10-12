/**
 * Measured diversity (SPEC §4). Asking for "genuinely different directions" isn't enough — two
 * variants with different names can share a type system, palette, and the same habits. This builds a
 * cheap fingerprint per variant from its changed files (font families, colour literals, fired tells)
 * and flags pairs whose fingerprints overlap heavily, so a round's near-duplicates are visible and
 * the next planning call can be told what's already been tried. Pure.
 */

import type { SourceFile, TellReport } from './tells';
import { declaredFonts } from './tells';

export interface Fingerprint {
  id: string;
  fonts: string[];
  colors: string[];
  tells: string[];
}

/** Normalise a hex colour to 6-digit lowercase, quantised so near-identical shades match. */
function quantizeHex(hex: string): string | null {
  let h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
  if (h.length === 8) h = h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  // 16 levels per channel: shades within ~6% collapse together.
  return [0, 2, 4]
    .map((i) =>
      (Math.round(parseInt(h.slice(i, i + 2), 16) / 17) * 17).toString(16).padStart(2, '0'),
    )
    .join('');
}

/** Fingerprint a variant from its changed files and its tell report. */
export function fingerprint(
  id: string,
  files: readonly SourceFile[],
  tells?: TellReport,
  /** Colours to ignore — the brand's own tokens, which every on-brand variant should share. */
  ignoreColors: readonly string[] = [],
): Fingerprint {
  const ignored = new Set(ignoreColors.map(quantizeHex).filter((c): c is string => c !== null));
  const fonts = new Set<string>();
  const colors = new Set<string>();
  for (const file of files) {
    for (const fam of declaredFonts(file.content)) fonts.add(fam);
    for (const m of file.content.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const q = quantizeHex(m[0]);
      if (q !== null && !ignored.has(q)) colors.add(q);
    }
  }
  return {
    id,
    fonts: [...fonts].sort(),
    colors: [...colors].sort(),
    tells: (tells?.findings ?? []).map((f) => f.id).sort(),
  };
}

function jaccard(a: readonly string[], b: readonly string[]): number | null {
  if (a.length === 0 && b.length === 0) return null;
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / new Set([...a, ...b]).size;
}

/**
 * 0–1 similarity: the mean Jaccard overlap of fonts, colours, and tells (dimensions empty on both
 * sides are skipped). Type and palette carry most of a page's identity, so they're weighted double.
 */
export function similarity(a: Fingerprint, b: Fingerprint): number {
  const parts: [number | null, number][] = [
    [jaccard(a.fonts, b.fonts), 2],
    [jaccard(a.colors, b.colors), 2],
    [jaccard(a.tells, b.tells), 1],
  ];
  let sum = 0;
  let weight = 0;
  for (const [value, w] of parts) {
    if (value === null) continue;
    sum += value * w;
    weight += w;
  }
  return weight === 0 ? 0 : sum / weight;
}

export interface SimilarPair {
  a: string;
  b: string;
  similarity: number;
}

/** Pairs at or above `threshold` similarity, most similar first. */
export function nearDuplicates(prints: readonly Fingerprint[], threshold = 0.6): SimilarPair[] {
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < prints.length; i += 1) {
    for (let j = i + 1; j < prints.length; j += 1) {
      const a = prints[i];
      const b = prints[j];
      if (a === undefined || b === undefined) continue;
      const s = similarity(a, b);
      if (s >= threshold) pairs.push({ a: a.id, b: b.id, similarity: Math.round(s * 100) / 100 });
    }
  }
  return pairs.sort((p, q) => q.similarity - p.similarity);
}
