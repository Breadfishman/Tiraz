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
  sources: ResourceSourceView[];
  capabilities: ResourceCapabilityView[];
}

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
