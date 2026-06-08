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

| Module               | Responsibility                                                                  |
| -------------------- | ------------------------------------------------------------------------------- |
| `config.ts`          | `TirazConfig` zod schema (single source of truth); load + minimal-diff update   |
| `skills-registry.ts` | The skill registry; resolve the active set; toggle + diversity helpers          |
| `skills-install.ts`  | Write the resolved skill set into `<worktree>/.claude/skills/`                  |
| `genome.ts`          | `Genome` / `GraftSpec` — the reproducible inputs that produced a variant        |
| `manifest.ts`        | `VariantNode` / `Fitness` / `Manifest` — the DAG of variants, persisted to disk |
| `agent.ts`           | The swappable `Agent` interface, prompt composition, the Claude Code adapter    |
| `worktree.ts`        | `git worktree` orchestration + dev-server port assignment                       |
| `detect.ts`          | Render-harness detection (Storybook / Ladle / Histoire)                         |
| `render.ts`          | The `Renderer` interface (render a target + screenshot it)                      |
| `gen.ts`             | `runGen` — the single-variant generation pipeline                               |
| `lint.ts`            | Lint floor — wraps `impeccable detect`, maps findings → weighted violations     |
| `ds-adherence.ts`    | Design-system adherence scorer (used values vs the repo's tokens/components)    |
| `fitness.ts`         | Assembles the three-term `Fitness` composite (lint floor gates, then blend)     |
| `taste-judge.ts`     | Mixed-model pairwise tournament → taste ranking (depends on a `PairwiseJudge`)  |
| `score.ts`           | `runScore` — scores a whole generation (lint + DS-adherence + taste → Fitness)  |

The CLI layer (`src/cli/`) is thin commander wiring over this logic and is exercised by the
built-bin smoke tests rather than unit-covered.

## Boundaries are interfaces

Everything that touches an external process or device sits behind an interface so the logic around
it is testable without the real thing:

- **`Agent`** (`agent.ts`) — the coding-agent backend. `ClaudeCodeAgent` shells out to `claude -p`
  via an injectable `CommandRunner`; tests inject a fake runner.
- **`Renderer`** (`render.ts`) — renders a variant's target and captures a screenshot. The live
  adapter (Playwright + a booted harness server) needs a browser; `runGen` is tested with a fake.
- **`CommandRunner`** (`agent.ts`) — the one process-spawning primitive, reused by `worktree.ts`
  and `lint.ts` (which shells out to `impeccable detect`).
- **`PairwiseJudge`** (`taste-judge.ts`) — compares two screenshots for a lens. The live adapter is
  an Anthropic vision model; the tournament + `runScore` are tested with a deterministic fake.

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
