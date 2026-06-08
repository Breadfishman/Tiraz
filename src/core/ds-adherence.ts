/**
 * Design-system adherence (SPEC §9): how much of what a variant actually used comes from the
 * repo's real design system, vs invented off-system values — the #1 reason AI output "doesn't
 * fit". This module is the pure scorer; collecting `UsedValues` from a rendered variant and the
 * `DesignSystem` from the repo are adapters layered on top.
 */

/** The repo's allowed on-system values, by category, plus a blessed component allowlist. */
export interface DesignSystem {
  /** Category (e.g. "color", "spacing", "radius", "fontSize") → allowed values. */
  tokens: Record<string, string[]>;
  /** Allowed component identifiers — includes whitelisted Tier-2 registry components (SPEC §12). */
  components: string[];
}

/** The values a variant actually used, by the same categories, plus components it imported. */
export interface UsedValues {
  values: Record<string, string[]>;
  components: string[];
}

export interface OffSystemValue {
  category: string;
  value: string;
}

export interface DsAdherenceResult {
  /** 0–100: share of used values that are on-system. 100 when nothing was used. */
  score: number;
  /** Flat `"category:value"` list (matches the manifest shape). */
  offSystemValues: string[];
  /** Structured off-system values, for tooling. */
  details: OffSystemValue[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Score a variant's design-system adherence by diffing used values against the system. */
export function scoreDsAdherence(system: DesignSystem, used: UsedValues): DsAdherenceResult {
  const off: OffSystemValue[] = [];
  let total = 0;
  let onSystem = 0;

  for (const [category, values] of Object.entries(used.values)) {
    const allowed = new Set((system.tokens[category] ?? []).map(normalize));
    for (const value of values) {
      total += 1;
      if (allowed.has(normalize(value))) {
        onSystem += 1;
      } else {
        off.push({ category, value });
      }
    }
  }

  const allowedComponents = new Set(system.components.map(normalize));
  for (const component of used.components) {
    total += 1;
    if (allowedComponents.has(normalize(component))) {
      onSystem += 1;
    } else {
      off.push({ category: 'component', value: component });
    }
  }

  const score = total === 0 ? 100 : Math.round((onSystem / total) * 100);
  return { score, offSystemValues: off.map((o) => `${o.category}:${o.value}`), details: off };
}
