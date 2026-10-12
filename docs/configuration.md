# Configuration

Tiraz reads `tiraz.config.json` from the target project root. The schema is defined and validated in
`src/core/config.ts` (the single source of truth). Unknown keys are rejected so typos fail loudly,
and any absent field falls back to the documented default. An absent config file is equivalent to
`{}` (all defaults).

`tiraz skills use` writes to this file, preserving the keys you've set rather than materializing
every default.

## Fields

| Field           | Type / values                                                                    | Default                             | Notes                                                                    |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `mode`          | `"integration"` \| `"greenfield"`                                                | `"integration"`                     | Set automatically by `adopt` / `init`                                    |
| `primary`       | `"impeccable"` \| `"design-taste-frontend"` \| `"redesign-existing-projects"`    | `"impeccable"`                      | Greenfield seed; only installed with `generation.skills: "full"`         |
| `overlay`       | `"none"` \| `"minimalist"` \| `"brutalist"` \| `"soft"`                          | `"none"`                            | 0 or 1 overlay                                                           |
| `dials`         | `{ variance, motion, density }`, each int 1–10                                   | `{ 5, 5, 5 }`                       | Design intensity dials                                                   |
| `beam`          | `{ width, factor, maxDepth }`, positive ints                                     | `{ 2, 3, 3 }`                       | Beam-search knobs                                                        |
| `pruning`       | `"human-only"` \| `"lint-gated"` \| `"auto-beam"`                                | `"lint-gated"`                      | The human can always override                                            |
| `fitness`       | `{ lintFloorRequired, weights: { dsAdherence, taste }, tellPenalty }`            | `{ false, { 0.3, 0.7 }, 0.3 }`      | `weights` must sum to 1; the lint floor only gates when required (below) |
| `sources`       | see [`sources`](#sources-two-tier-component-menu-spec-12)                        | sourcing `fetchMode: "off"`         | Component libraries are opt-in                                           |
| `harness`       | `"auto"` \| `"storybook"` \| `"ladle"` \| `"histoire"` \| `"scratch"` \| `"app"` | `"auto"`                            | Render surface; `app` = your project's own dev server                    |
| `appCommand`    | string with `{port}`                                                             | `"npm run dev -- --port {port}"`    | How the `app` harness boots your dev server in a worktree                |
| `framework`     | string                                                                           | `"astro"`                           | Greenfield default; integration overwrites via detection                 |
| `lintThreshold` | int 0–100                                                                        | `80`                                | Minimum lint score (to pass, or to gate when `lintFloorRequired`)        |
| `modules`       | `{ threeD: bool, remotion: bool }`                                               | `{ false, false }`                  | Optional greenfield capability modules (see below)                       |
| `generation`    | see [`generation`](#generation)                                                  | lean, planned, no self-critique     | How each round is generated                                              |
| `agent`         | see [`agent`](#agent-models-and-session-limits)                                  | Sonnet judge + planner, 60-turn cap | Models, turn caps, and extra permissions for Claude Code                 |

Nested objects are all-or-nothing: omit a block to get its default, or provide it with all required
fields. The `generation`, `agent`, and newer `sources` keys are field-defaulted, so a partial block
(e.g. `{ "agent": { "model": "claude-opus-5-5" } }`) is fine.

## `generation`

| Key            | Values                                       | Default     | What it does                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directions`   | `"planned"` \| `"catalog"`                   | `"planned"` | `planned`: one short, read-only model call writes gen-0 directions tailored to your brief and design system (inside your brand in integration mode). `catalog`: cycle the built-in profiles. A failed plan falls back to the catalog.       |
| `skills`       | `"lean"` \| `"full"`                         | `"lean"`    | `lean` installs only the short base skill (+ the redesign skill in integration, + an overlay when a catalog profile names one). `full` also installs the large opinionated primary (impeccable / design-taste-frontend, up to ~22k tokens). |
| `selfCritique` | bool                                         | `false`     | A second agent pass after the first render. Off because build agents already screenshot and fix their own work in-session; when on, it resumes the same session rather than starting fresh.                                                 |
| `diversity`    | `"conservative"` \| `"diverse"` \| `"alien"` | `"diverse"` | Gen-0 spread. `conservative` gives every variant the same brief with no per-variant direction.                                                                                                                                              |
| `concurrency`  | int 1–16                                     | `4`         | Variants materialized in parallel.                                                                                                                                                                                                          |

## `agent`: models and session limits

| Key            | Default                 | What it does                                                                                                                                                                                           |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `model`        | _(your claude default)_ | Model for build sessions (`claude --model`).                                                                                                                                                           |
| `maxTurns`     | `60`                    | Caps each build session (`--max-turns`). A session that hits the cap keeps the work it committed.                                                                                                      |
| `judgeModel`   | `"claude-sonnet-5-5"`   | The vision model that ranks a whole generation in one call.                                                                                                                                            |
| `plannerModel` | `"claude-sonnet-5-5"`   | The model that writes gen-0 directions.                                                                                                                                                                |
| `allowedTools` | `[]`                    | Extra Claude Code permission rules for build sessions, e.g. `"Bash(pnpm build:*)"`. Built in: `npm run build/typecheck/lint/check`, `npx tsc`, `npx astro check`, `git status/diff`, and `tiraz shot`. |

Build sessions run with `--permission-mode acceptEdits`, so file edits inside the variant's isolated
worktree apply without prompts and shell commands are limited to the rules above. That lets the agent
run your build and screenshot its own render (`tiraz shot`) before it finishes.

## Usage profile

One round of `gen --count 4` costs: 1 planner call + 4 build sessions + (on `score`) 1 judge call. The
lint floor (`impeccable detect`) and DS-adherence are local and free. Earlier versions also ran a
fresh self-critique session per variant and a pairwise judge tournament (every pair × 4 lenses × both
orders: 48 judge sessions for 4 variants, 120 for 6); both are gone from the defaults.

## Lint floor

`score` runs impeccable's deterministic detector (`npx impeccable detect --json`, no model calls) over
the UI files each variant **changed** since its worktree was created (`.html`, `.css`, `.scss`,
`.jsx`, `.tsx`, `.vue`, `.svelte`). Violations are recorded on the variant either way. They only
zero its composite when `fitness.lintFloorRequired` is `true` and the score falls below
`lintThreshold`. If the detector can't run (offline, say), the floor is skipped for that variant and
`score` carries on. `--no-lint` skips it entirely.

## Originality (the tells scan)

`score` scans every variant's changed files for the second-order AI look (see
[`tiraz tells`](./cli.md#tiraz-tells-node-)). The 0–100 originality score scales the composite:
`composite × (1 − tellPenalty × (1 − originality/100))`. At the default `fitness.tellPenalty: 0.3`,
a variant with every tell loses 30%; `0` records tells without penalising. Brand fonts listed in
`BRAND.md` are never flagged.

## Files Tiraz reads

| File                | Who writes it                                  | Read by                      |
| ------------------- | ---------------------------------------------- | ---------------------------- |
| `BRAND.md`          | you (`tiraz brand draft` to start), committed  | planner, build agents, judge |
| `.tiraz/TASTE.md`   | `select`/`cull --why`, the dashboard "Why" box | planner, build agents, judge |
| `.tiraz/refs/*.png` | `tiraz brand refs`                             | planner, build agents, judge |

## Environment

- `ANTHROPIC_API_KEY`: when set, `score` calls the judge through the API (images sent directly);
  otherwise it uses one `claude -p` session.
- `TIRAZ_CHROMIUM_PATH`: point the renderer at an existing Chromium/Chrome when Playwright's own
  browser download is missing or a different version.
- `HTTPS_PROXY` / `HTTP_PROXY`: used by the browser for external pages (reference sites); local
  render servers bypass it.

## `sources`: two-tier component menu (SPEC §12)

Diversity of component sources is itself an anti-slop mechanism, and **each source's license dictates
its tier**:

**Sourcing is off by default** (`sources.fetchMode: "off"`): variants compose from your design system
alone, with no fetching and no per-library prompt text. Set `fetchMode` to `"signatures"` (prompt-only
inspiration from each permitted library) or `"install"` (pre-fetch real components into each worktree,
up to `fetchBudget`) to opt in. The dashboard's "Fetch real components" toggle switches between
`install` and `off`.

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
  "harness": "app",
  "appCommand": "npm run dev -- --port {port}",
  "agent": { "model": "claude-opus-5-5", "maxTurns": 80 },
}
```
