/**
 * The resource/config view for the dashboard cockpit — a single structured snapshot of what the run
 * is configured to draw on: the component sources and capability libraries (each with a reference
 * URL + enabled/restricted state) plus the active skills and modules. Pure: config in, view out, so
 * the dashboard can render the panel and its toggles deterministically. Toggling writes back to
 * `tiraz.config.json` via the CLI; the catalogs and `resolve*` semantics live in sources.ts /
 * capabilities.ts.
 */

import type { CapabilityCategory, CapabilityModule } from './capabilities';
import { CAPABILITIES } from './capabilities';
import type { TirazConfig } from './config';
import type { ComponentSource, SourceTier } from './sources';
import { SOURCES } from './sources';

export interface ResourceSourceView {
  id: string;
  name: string;
  tier: SourceTier;
  url: string;
  license: string;
  enabled: boolean;
  restricted: boolean;
  warning?: string;
}

export interface ResourceCapabilityView {
  id: string;
  name: string;
  category: CapabilityCategory;
  module: CapabilityModule;
  url: string;
  license: string;
  /** Available this run (its module is on, or it is a core library). */
  enabled: boolean;
  restricted: boolean;
  warning?: string;
}

export interface ResourceView {
  skills: { primary: string; overlay: string };
  modules: { threeD: boolean; remotion: boolean };
  dials: { variance: number; motion: number; density: number };
  weights: { dsAdherence: number; taste: number };
  sources: ResourceSourceView[];
  capabilities: ResourceCapabilityView[];
}

/** The `config.primary` values selectable as the default primary seed. */
const PRIMARY_VALUES: readonly TirazConfig['primary'][] = [
  'impeccable',
  'design-taste-frontend',
  'redesign-existing-projects',
];

/** The `config.overlay` values selectable as the active overlay. */
const OVERLAY_VALUES: readonly TirazConfig['overlay'][] = [
  'none',
  'minimalist',
  'brutalist',
  'soft',
];

/** The three design dials, used to clamp/validate partial updates. */
const DIAL_KEYS = ['variance', 'motion', 'density'] as const;
type DialKey = (typeof DIAL_KEYS)[number];

/** npmjs page for a package — always valid and links onward to homepage/repo. */
export function npmUrl(pkg: string): string {
  return `https://www.npmjs.com/package/${pkg}`;
}

/** Whether a source is currently permitted by the config (restricted sources via their own toggle). */
export function isSourceEnabled(source: ComponentSource, cfg: TirazConfig['sources']): boolean {
  if (source.restricted) {
    return source.id === 'aceternity' ? cfg.aceternity : false;
  }
  return cfg.bundled.includes(source.id) || cfg.fetch.includes(source.id);
}

/** Whether a capability library is available given the enabled modules (core is always on). */
export function isCapabilityEnabled(
  module: CapabilityModule,
  modules: TirazConfig['modules'],
): boolean {
  if (module === 'core') return true;
  if (module === 'threeD') return modules.threeD;
  return modules.remotion;
}

/** Assemble the dashboard's config/resources view from the resolved config. */
export function buildResourceView(config: TirazConfig): ResourceView {
  const sources: ResourceSourceView[] = SOURCES.map((s) => ({
    id: s.id,
    name: s.name,
    tier: s.tier,
    url: s.url,
    license: s.license,
    enabled: isSourceEnabled(s, config.sources),
    restricted: s.restricted,
    ...(s.warning !== undefined ? { warning: s.warning } : {}),
  }));

  const capabilities: ResourceCapabilityView[] = CAPABILITIES.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    module: c.module,
    url: npmUrl(c.npm[0] ?? c.id),
    license: c.license,
    enabled: isCapabilityEnabled(c.module, config.modules),
    restricted: c.restricted,
    ...(c.warning !== undefined ? { warning: c.warning } : {}),
  }));

  return {
    skills: { primary: config.primary, overlay: config.overlay },
    modules: { threeD: config.modules.threeD, remotion: config.modules.remotion },
    dials: { ...config.dials },
    weights: { ...config.fitness.weights },
    sources,
    capabilities,
  };
}

/**
 * Return a copy of `config` with a component source toggled on/off. Non-restricted sources move in/out
 * of the `bundled`/`fetch` list by tier; the restricted Aceternity flips its dedicated boolean.
 * Unknown ids are returned unchanged.
 */
export function toggleSource(config: TirazConfig, id: string, enabled: boolean): TirazConfig {
  const source = SOURCES.find((s) => s.id === id);
  if (source === undefined) return config;
  if (source.restricted) {
    if (id !== 'aceternity') return config;
    return { ...config, sources: { ...config.sources, aceternity: enabled } };
  }
  const key = source.tier === 'bundled' ? 'bundled' : 'fetch';
  const present = config.sources[key];
  const next = enabled
    ? present.includes(id)
      ? present
      : [...present, id]
    : present.filter((x) => x !== id);
  return { ...config, sources: { ...config.sources, [key]: next } };
}

/** Return a copy of `config` with a capability module toggled on/off. */
export function toggleModule(
  config: TirazConfig,
  module: 'threeD' | 'remotion',
  enabled: boolean,
): TirazConfig {
  return { ...config, modules: { ...config.modules, [module]: enabled } };
}

/**
 * Return a copy of `config` with its default primary *seed* set to `id`. Mirrors `tiraz skills use`:
 * this persists the chosen seed for greenfield / diversity; in integration mode the *active* primary
 * is still forced to `redesign-existing-projects` by `resolveActiveSkills`. Unknown ids are returned
 * unchanged (matching `toggleSource`'s contract).
 */
export function setPrimarySkill(config: TirazConfig, id: string): TirazConfig {
  const next = PRIMARY_VALUES.find((p) => p === id);
  if (next === undefined) return config;
  return { ...config, primary: next };
}

/** Return a copy of `config` with the active overlay set to `overlay`. Unknown values unchanged. */
export function setOverlaySkill(config: TirazConfig, overlay: string): TirazConfig {
  const next = OVERLAY_VALUES.find((o) => o === overlay);
  if (next === undefined) return config;
  return { ...config, overlay: next };
}

/** Clamp a number to the inclusive design-dial range [1, 10], rounding to an integer. */
function clampDial(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(10, Math.max(1, Math.round(value)));
}

/**
 * Return a copy of `config` with the provided design dials overridden (each clamped to 1..10).
 * Only the dials present in `partial` are changed; omitted dials keep their current value. A
 * non-finite or out-of-range value is clamped rather than rejected.
 */
export function setDials(
  config: TirazConfig,
  partial: Partial<Record<DialKey, number>>,
): TirazConfig {
  const dials = { ...config.dials };
  for (const key of DIAL_KEYS) {
    const value = partial[key];
    if (value !== undefined) dials[key] = clampDial(value);
  }
  return { ...config, dials };
}

/** Clamp a number to the inclusive [0, 1] range; non-finite values fall back to 0. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Return a copy of `config` whose fitness weights set `taste` to the clamped `taste01` and
 * `dsAdherence` to its complement, so the two always sum to 1 (the schema's refine invariant).
 */
export function setTasteWeight(config: TirazConfig, taste01: number): TirazConfig {
  const taste = clamp01(taste01);
  return {
    ...config,
    fitness: { ...config.fitness, weights: { taste, dsAdherence: 1 - taste } },
  };
}
