/**
 * Capability libraries (SPEC §10) — the animation / scroll / 3D / video stack that powers the
 * "impressive features" a variant can reach for. Distinct from component *sources* (§12, see
 * `sources.ts`): these are npm dependencies installed into the project, not components fetched from
 * a registry. Core capabilities are always part of the greenfield stack; 3D and video are opt-in
 * modules (`config.modules`). Licenses verified against live sources (2026).
 */

import type { TirazConfig } from './config';

export type CapabilityCategory = 'animation' | 'scroll' | '3d' | 'video';

/** Which module gates a capability: `core` is always available; the rest are opt-in (SPEC §10). */
export type CapabilityModule = 'core' | 'threeD' | 'remotion';

export interface CapabilityLibrary {
  id: string;
  name: string;
  category: CapabilityCategory;
  module: CapabilityModule;
  /** npm package(s) that deliver this capability. */
  npm: string[];
  license: string;
  /** A hard-gated, non-OSI/commercially-restricted library — surfaces {@link warning} when enabled. */
  restricted: boolean;
  /**
   * Whether `tiraz init` installs this by default for its module (SPEC §10's pinned stack). `false`
   * = available to the agent but not auto-installed (advanced escape hatch / no-code alternative).
   */
  scaffold: boolean;
  /** Surfaced when a restricted capability's module is enabled (SPEC §10/§13). */
  warning?: string;
  notes: string;
}

/** Warning surfaced when the video (Remotion) module is enabled — Remotion is not OSI-licensed. */
export const REMOTION_LICENSE_WARNING =
  'Remotion uses a custom, non-open-source license. It is free for individuals, non-profits, and ' +
  'for-profit companies with up to 3 employees; larger companies need a paid Company License ' +
  '(remotion.pro). You also may not sell a derivative of Remotion itself. Enable the video module ' +
  'only if your use case fits these terms.';

/**
 * The capability stack (SPEC §10). `core` libraries ship in the greenfield scaffold and are always
 * advertised to the agent; `threeD` / `remotion` are gated behind their module toggles. Soft
 * license caveats (GSAP's Webflow-competition clause, Theatre's AGPL studio, Spline's undeclared
 * runtime license) live in `notes`; only a hard commercial restriction sets `restricted`.
 */
export const CAPABILITIES: readonly CapabilityLibrary[] = [
  // — Animation (core) —
  {
    id: 'gsap',
    name: 'GSAP',
    category: 'animation',
    module: 'core',
    npm: ['gsap'],
    license: "GSAP Standard 'No Charge' License (free, all plugins included)",
    restricted: false,
    scaffold: true,
    notes:
      'Gold-standard timelines + the strongest plugin set (SplitText, MorphSVG, ScrollTrigger, ' +
      'ScrollSmoother), all free post-Webflow. Custom-but-free license; the only prohibition — ' +
      'embedding in a visual no-code animation builder competing with Webflow — does not apply to ' +
      'code generation.',
  },
  {
    id: 'motion',
    name: 'Motion',
    category: 'animation',
    module: 'core',
    npm: ['motion'],
    license: 'MIT',
    restricted: false,
    scaffold: true,
    notes:
      'Formerly Framer Motion. Declarative spring/layout/gesture animation with a hybrid WAAPI+JS ' +
      'engine; standout shared-layout (`layoutId`) transitions. Import from `motion/react`.',
  },
  {
    id: 'animejs',
    name: 'Anime.js',
    category: 'animation',
    module: 'core',
    npm: ['animejs'],
    license: 'MIT',
    restricted: false,
    scaffold: false,
    notes:
      'Tiny dependency-free engine for CSS/SVG/DOM/JS; v4 adds a modular API + scroll observer.',
  },
  {
    id: 'auto-animate',
    name: 'AutoAnimate',
    category: 'animation',
    module: 'core',
    npm: ['@formkit/auto-animate'],
    license: 'MIT',
    restricted: false,
    scaffold: false,
    notes:
      'Zero-config one-liner that animates add/remove/reorder of DOM children; framework-agnostic.',
  },
  {
    id: 'theatre',
    name: 'Theatre.js',
    category: 'animation',
    module: 'core',
    npm: ['@theatre/core', '@theatre/studio'],
    license: 'Apache-2.0 (core) / AGPL-3.0 (studio)',
    restricted: false,
    scaffold: false,
    notes:
      'In-browser keyframe motion editor (After-Effects-like) for any JS object incl. R3F scenes. ' +
      'The shipped runtime `@theatre/core` is Apache-2.0; keep the AGPL-3.0 `@theatre/studio` editor ' +
      'as a dev-only dependency. Advanced — not scaffolded by default.',
  },
  // — Scroll (core) —
  {
    id: 'lenis',
    name: 'Lenis',
    category: 'scroll',
    module: 'core',
    npm: ['lenis'],
    license: 'MIT',
    restricted: false,
    scaffold: true,
    notes:
      'High-fidelity smooth-scroll normalization across input devices; pairs with GSAP ScrollTrigger.',
  },
  // — 3D (--3d module) —
  {
    id: 'three',
    name: 'Three.js',
    category: '3d',
    module: 'threeD',
    npm: ['three'],
    license: 'MIT',
    restricted: false,
    scaffold: true,
    notes:
      'The de-facto WebGL/WebGPU engine: scene graph, PBR materials, glTF — the 3D foundation.',
  },
  {
    id: 'react-three-fiber',
    name: 'React Three Fiber',
    category: '3d',
    module: 'threeD',
    npm: ['@react-three/fiber'],
    license: 'MIT',
    restricted: false,
    scaffold: true,
    notes: 'Declarative React renderer for Three.js — 3D scenes as JSX, no manual render loop.',
  },
  {
    id: 'drei',
    name: 'drei',
    category: '3d',
    module: 'threeD',
    npm: ['@react-three/drei'],
    license: 'MIT',
    restricted: false,
    scaffold: true,
    notes:
      'R3F helper grab-bag: cameras, controls, loaders, environments, text, instancing, shaders.',
  },
  {
    id: 'react-three-postprocessing',
    name: 'React Three Postprocessing',
    category: '3d',
    module: 'threeD',
    npm: ['@react-three/postprocessing'],
    license: 'MIT',
    restricted: false,
    scaffold: false,
    notes: 'Composable post-FX for R3F: bloom, depth-of-field, SSAO, glitch, tone-mapping.',
  },
  {
    id: 'react-three-uikit',
    name: 'pmndrs uikit',
    category: '3d',
    module: 'threeD',
    npm: ['@react-three/uikit'],
    license: 'MIT',
    restricted: false,
    scaffold: false,
    notes:
      'GPU-rendered flexbox UI inside 3D/WebGL scenes (yoga layout) — for VR/AR/3D interfaces.',
  },
  {
    id: 'spline',
    name: 'Spline',
    category: '3d',
    module: 'threeD',
    npm: ['@splinetool/react-spline', '@splinetool/runtime'],
    license: 'MIT (react-spline) / undeclared (runtime)',
    restricted: false,
    scaffold: false,
    notes:
      'Drop a designer-authored interactive 3D scene in with one component (no manual Three.js). ' +
      'Caveat: the `@splinetool/react-spline` wrapper is MIT, but `@splinetool/runtime` ships no ' +
      'explicit license grant and scenes load from Spline’s hosted CDN (its ToS applies).',
  },
  // — Video (--remotion module) —
  {
    id: 'remotion',
    name: 'Remotion',
    category: 'video',
    module: 'remotion',
    npm: ['remotion', '@remotion/cli', '@remotion/player'],
    license: 'Remotion License (non-OSI; free ≤3-employee for-profits)',
    restricted: true,
    scaffold: true,
    warning: REMOTION_LICENSE_WARNING,
    notes:
      'Programmatic video: render real MP4 frame-by-frame from React for data-driven/parametric video.',
  },
] as const;

/** Look up a capability by id, or `undefined` if unknown. */
export function getCapability(id: string): CapabilityLibrary | undefined {
  return CAPABILITIES.find((capability) => capability.id === id);
}

export interface ResolvedCapabilities {
  /** The capability libraries available given the enabled modules. */
  libraries: CapabilityLibrary[];
  /** Warnings to surface for any restricted capability that is now enabled. */
  warnings: string[];
}

/**
 * Resolve which capability libraries are available for a run (SPEC §10). `core` libraries are
 * always included; `threeD` and `remotion` libraries are included only when their module is on.
 * Returns the warning of any restricted capability that ends up enabled (e.g. Remotion).
 */
export function resolveCapabilities(modules: TirazConfig['modules']): ResolvedCapabilities {
  const libraries = CAPABILITIES.filter((capability) => {
    switch (capability.module) {
      case 'core':
        return true;
      case 'threeD':
        return modules.threeD;
      case 'remotion':
        return modules.remotion;
    }
  });

  const warnings = libraries.flatMap((capability) =>
    capability.restricted && capability.warning !== undefined ? [capability.warning] : [],
  );

  return { libraries, warnings };
}

/**
 * The npm packages `tiraz init` installs for the enabled modules (SPEC §10's pinned stack): the
 * `scaffold: true` capabilities among those {@link resolveCapabilities} makes available. Advanced
 * escape hatches and no-code alternatives (uikit, postprocessing, Spline, Theatre, …) are available
 * to the agent but not auto-installed.
 */
export function scaffoldPackages(modules: TirazConfig['modules']): string[] {
  return resolveCapabilities(modules)
    .libraries.filter((capability) => capability.scaffold)
    .flatMap((capability) => capability.npm);
}
