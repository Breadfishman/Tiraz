# Configuration

Tiraz reads `tiraz.config.json` from the target project root. The schema is defined and validated in
`src/core/config.ts` (the single source of truth). Unknown keys are rejected so typos fail loudly,
and any absent field falls back to the documented default. An absent config file is equivalent to
`{}` (all defaults).

`tiraz skills use` writes to this file, preserving the keys you've set rather than materializing
every default.

## Fields

| Field           | Type / values                                                                    | Default                                                                    | Notes                                                             |
| --------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `mode`          | `"integration"` \| `"greenfield"`                                                | `"integration"`                                                            | Set automatically by `adopt` / `init`                             |
| `primary`       | `"impeccable"` \| `"design-taste-frontend"` \| `"redesign-existing-projects"`    | `"impeccable"`                                                             | Default _seed_ only; integration mode forces the redesign primary |
| `overlay`       | `"none"` \| `"minimalist"` \| `"brutalist"` \| `"soft"`                          | `"none"`                                                                   | 0 or 1 overlay composes with the primary                          |
| `dials`         | `{ variance, motion, density }`, each int 1–10                                   | `{ 5, 5, 5 }`                                                              | Design intensity dials                                            |
| `beam`          | `{ width, factor, maxDepth }`, positive ints                                     | `{ 2, 3, 3 }`                                                              | Beam-search knobs (Phase 3)                                       |
| `pruning`       | `"human-only"` \| `"lint-gated"` \| `"auto-beam"`                                | `"lint-gated"`                                                             | All modes toggleable; the human can always override               |
| `fitness`       | `{ lintFloorRequired: bool, weights: { dsAdherence, taste } }`                   | `{ true, { 0.5, 0.5 } }`                                                   | `weights` must sum to 1                                           |
| `sources`       | `{ bundled: string[], fetch: string[], aceternity: bool }`                       | bundled `["magic-ui"]`; fetch = 6 clean-MIT registries; `aceternity:false` | Two-tier component sourcing (see below)                           |
| `harness`       | `"auto"` \| `"storybook"` \| `"ladle"` \| `"histoire"` \| `"scratch"` \| `"app"` | `"auto"`                                                                   | Render surface for integration mode                               |
| `framework`     | string                                                                           | `"astro"`                                                                  | Greenfield default; integration overwrites via detection          |
| `lintThreshold` | int 0–100                                                                        | `80`                                                                       | Minimum lint-floor score                                          |
| `modules`       | `{ threeD: bool, remotion: bool }`                                               | `{ false, false }`                                                         | Optional greenfield capability modules (see below)                |

Nested objects are all-or-nothing: omit a block to get its default, or provide it with all required
fields.

## `sources`: two-tier component menu (SPEC §12)

Diversity of component sources is itself an anti-slop mechanism, and **each source's license dictates
its tier**:

- **Tier-1 `bundled`**: vendored into Tiraz, always available. `magic-ui` (MIT).
- **Tier-2 `fetch`**: the agent copies components into _your_ repo on demand (never redistributed
  by Tiraz). The default permitted set is a diverse clean-MIT selection: `react-bits`,
  `21st-registry`, `cult-ui`, `motion-primitives`, `kokonut-ui`, `smoothui`, `eldora-ui`. Also in
  the registry (not default-permitted): `indie-ui`, `animate-ui` (MIT + Commons Clause), `origin-ui`
  (MIT components only). Usage is sparing by design: a way out of a local optimum, not a default
  crutch. A genome records the permitted Tier-2 sources it may draw from, and the DS-adherence term
  whitelists components fetched from them so they aren't flagged as off-system. Hover.dev and Skiper
  UI are deliberately excluded for license reasons.

Inspect and toggle the menu with [`tiraz sources`](./cli.md#tiraz-sources-listenabledisable-).

## `sources.aceternity`

Off by default. Aceternity is a Tier-2 source gated behind its own toggle (not the `fetch` list)
because its terms are restrictive. Enabling it, via `tiraz sources enable aceternity` or setting
this flag, surfaces a Terms-of-Service warning: fine for personal / non-distributed projects, risky
for enterprise/commercial work. Tiraz never bundles it; components are only fetched into your repo on
demand. See [docs/skills.md](./skills.md) and [SPEC.md §12/§13](../SPEC.md).

## `modules`: the capability stack (SPEC §10)

Separate from component sources, the **capability libraries** are the animation / scroll / 3D / video
stack a variant can reach for (the "impressive features"). They are npm dependencies, not fetched
components, and live in a license-verified registry (`core/capabilities.ts`):

- **Core (always available):** GSAP + Motion (animation), Anime.js, AutoAnimate, Theatre.js, and
  Lenis (smooth scroll). All MIT except GSAP (custom-but-free) and Theatre's `studio` (AGPL: keep
  dev-only).
- **`modules.threeD`** (`tiraz init --3d`): Three.js, React Three Fiber, drei,
  `@react-three/postprocessing`, `@react-three/uikit`, and Spline (all MIT; Spline's runtime is a
  flagged caveat).
- **`modules.remotion`** (`tiraz init --remotion`): Remotion, programmatic video. **Non-OSI
  license**: free for individuals / non-profits / ≤3-employee for-profits, paid Company License
  above. Enabling the module surfaces this warning.

Run [`tiraz sources list`](./cli.md#tiraz-sources-listenabledisable-) to see both menus resolved
against your config.

## Example

```jsonc
{
  "mode": "integration",
  "primary": "design-taste-frontend", // seed for greenfield / diversity
  "overlay": "minimalist",
  "dials": { "variance": 7, "motion": 4, "density": 5 },
  "pruning": "lint-gated",
  "fitness": { "lintFloorRequired": true, "weights": { "dsAdherence": 0.6, "taste": 0.4 } },
}
```
