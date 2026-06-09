# Architecture

Tiraz is an **orchestration layer**, not a generator. It drives an underlying coding agent (Claude
Code) while controlling _which design taste is applied_, _how many variants are produced_, and _how
the field is narrowed to a winner_ — all inside the user's existing repo and design system. For the
full design rationale and the exploration engine, see [SPEC.md](../SPEC.md). This document describes
what is implemented and how the modules fit together.

## Layers (SPEC §1)

1. **Taste layer** — a registry of design skills (`SKILL.md` files): two togglable primaries,
   composable overlays, and single-purpose skills.
2. **QA / fitness layer** — a three-term fitness function (lint floor + design-system adherence +
   VLM taste judge). _Phase 2+._
3. **Component sourcing** — a two-tier menu (bundled vs fetch-on-demand) the agent draws from.
4. **Interop adapters** — export/handoff to external design tools. _Phase 6._
5. **Exploration engine** — a beam search over design space (generate → score → select → breed).
   _Phase 3+._

## Module map (`src/core/`)

| Module                   | Responsibility                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `config.ts`              | `TirazConfig` zod schema (single source of truth); load + minimal-diff update           |
| `skills-registry.ts`     | The skill registry; resolve the active set; toggle + diversity helpers                  |
| `skills-install.ts`      | Write the resolved skill set into `<worktree>/.claude/skills/`                          |
| `genome.ts`              | `Genome` / `GraftSpec`; `mutateGenome` + `recombineGenome` breeding operators           |
| `manifest.ts`            | `VariantNode` / `Fitness` / `Manifest` — the DAG of variants, persisted to disk         |
| `agent.ts`               | Swappable `Agent` interface + prompt composition; Claude Code + 21st Magic adapters     |
| `worktree.ts`            | `git worktree` orchestration + dev-server port assignment                               |
| `detect.ts`              | Render-harness detection (Storybook / Ladle / Histoire) + host-framework detection      |
| `adopt.ts`               | `adoptProject` — integration attach: detect stack + harness, write integration config   |
| `render.ts`              | The `Renderer` interface (render a target + screenshot it)                              |
| `render-harness.ts`      | Live-renderer brain: serve command, target→URL resolution, server-readiness poll        |
| `playwright-renderer.ts` | `PlaywrightRenderer` — boot harness → wait → screenshot → teardown (I/O injected)       |
| `playwright-io.ts`       | Real `spawn` + Playwright I/O for the renderer (coverage-excluded glue)                 |
| `gen.ts`                 | `runGen` — the single-variant generation pipeline                                       |
| `lint.ts`                | Lint floor — wraps `impeccable detect`, maps findings → weighted violations             |
| `ds-adherence.ts`        | DS-adherence scorer (used values vs tokens/components; whitelists Tier-2 sources)       |
| `ds-collect.ts`          | DS-adherence collectors (pure): parse repo tokens from CSS vars; extract used literals  |
| `ds-collect-io.ts`       | File-walking for the collectors (coverage-excluded glue)                                |
| `sources.ts`             | Two-tier component-source registry (Tier-1 bundled / Tier-2 fetch) + ToS gating         |
| `capabilities.ts`        | Capability-library registry (animation / scroll / 3D / video, §10) gated by modules     |
| `scaffold.ts`            | Greenfield `init` scaffolder — drives Astro/Next + Tailwind + shadcn + module deps      |
| `export.ts`              | Interop export adapters (§12bis) — Stitch DESIGN.md / v0 prompt / Claude Design brief   |
| `fitness.ts`             | Assembles the three-term `Fitness` composite (lint floor gates, then blend)             |
| `taste-judge.ts`         | Mixed-model pairwise tournament → taste ranking (depends on a `PairwiseJudge`)          |
| `vision-judge.ts`        | Live `PairwiseJudge`: lens prompt + verdict parsing (pure); vision call injected        |
| `anthropic-io.ts`        | Real Anthropic vision call + image reads for the judge (coverage-excluded glue)         |
| `score.ts`               | `runScore` — scores a whole generation (lint + DS-adherence + taste → Fitness)          |
| `beam.ts`                | `pruneGeneration` (3 modes) + `selectSurvivors` — the prune/select decision logic       |
| `tree.ts`                | `renderTree` / `renderStatus` — text rendering of the variant DAG                       |
| `search.ts`              | `seedGenomes` / `generateGeneration` / `breedGeneration` / `recombineVariant` loop      |
| `diff.ts`                | `diffGenomes` / `renderGenomeDiff` — compare the genomes behind two variants            |
| `compare.ts`             | `renderCompareHtml` — one self-contained HTML gallery of all variants for human review  |
| `promote.ts`             | `promoteVariant` — greenfield merge + worktree teardown, or integration PR via `gh`     |
| `review.ts`              | `reviewVariant` — install Emil's skill on demand + run the agent's motion/polish review |

The CLI layer (`src/cli/`) is thin commander wiring over this logic and is exercised by the
built-bin smoke tests rather than unit-covered.

## Boundaries are interfaces

Everything that touches an external process or device sits behind an interface so the logic around
it is testable without the real thing:

- **`Agent`** (`agent.ts`) — the coding-agent backend. `ClaudeCodeAgent` shells out to `claude -p`;
  `MagicAgent` is the opt-in, API-keyed 21st.dev Magic backend (§8). Both go through an injectable
  `CommandRunner`; tests inject a fake runner.
- **`Renderer`** (`render.ts`) — `PlaywrightRenderer` (live) boots the harness dev server + drives
  headless Chromium via injected `launchServer`/`screenshot` boundaries (real impls in
  `playwright-io.ts`); the orchestration is unit-tested with fakes, and running it for real needs a
  browser (`npx playwright install chromium`) + a playground in the target repo.
- **`CommandRunner`** (`agent.ts`) — the one process-spawning primitive, reused by `worktree.ts`,
  `lint.ts` (which shells out to `impeccable detect`), and `promote.ts` (`git` merge / `gh pr`).
- **`PairwiseJudge`** (`taste-judge.ts`) — compares two screenshots for a lens. The live adapter is
  `VisionPairwiseJudge` (`vision-judge.ts`): pure lens-prompt building + verdict parsing around an
  injected vision call, whose real Anthropic implementation lives in `anthropic-io.ts` (needs
  `ANTHROPIC_API_KEY`). The tournament + `runScore` are tested with a deterministic fake.

## State on disk (in the target project)

```
.tiraz/
  manifest.json            # the single source of truth: config + every variant node + lineage
  worktrees/<id>/          # one git worktree per variant (its own branch)
  screenshots/<id>.png     # captured render of each variant
<worktree>/.claude/skills/ # the resolved active skill set, written before each agent run
```

## The `gen` pipeline (Phase 1)

`runGen(opts, deps)` produces a single variant:

1. Load `tiraz.config.json`; load or create the manifest.
2. Resolve the active skill set for the config (base + primary + optional overlay).
3. Build the `Genome` (id `g<gen>-n0`, primary/overlay/dials from config, brief, target, permitted
   sources).
4. Detect the render harness (or use the `--harness` override).
5. Assign a free dev-server port.
6. `git worktree add` a fresh branch (`tiraz/<id>`) under `.tiraz/worktrees/<id>`.
7. Write the resolved skills into the worktree's `.claude/skills/`.
8. Compose the prompt and run the `Agent` in the worktree.
9. Render + screenshot the target via the `Renderer`.
10. Record the `VariantNode` in the manifest and persist it.

The beam search (Phase 3) drives this primitive across a generation and then breeds survivors.
