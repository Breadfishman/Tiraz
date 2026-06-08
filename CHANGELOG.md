# Changelog

All notable changes to Tiraz are documented here. Progress is tracked against the build phases in
[SPEC.md §16](./SPEC.md). The format loosely follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Phase 2 — Three-term fitness (in progress)

- **Lint floor** (`core/lint.ts`): wraps `impeccable detect --json` (via an injectable
  `CommandRunner`), defensively validates the findings array, maps severities to weighted
  violations, and gates pass/fail against `config.lintThreshold`.
- **Design-system adherence** (`core/ds-adherence.ts`): pure scorer diffing a variant's used
  values + components against the repo's design system → 0–100 + off-system list (Tier-2 registry
  components are whitelisted).
- **Composite** (`core/fitness.ts`): assembles the three-term `Fitness`; the lint floor gates
  (fail → composite 0), otherwise a configured weighted blend of DS-adherence + taste.

  _Next in this phase:_ the VLM **taste judge** (mixed-model pairwise tournament → ranking, SPEC
  §9) and the `score` orchestration that writes `Fitness` across a generation.

### Phase 1 — Agent + single variant (in progress)

- **Data model** (`core/genome.ts`, `core/manifest.ts`): `Genome` / `GraftSpec` and
  `VariantNode` / `Fitness` / `Manifest` zod schemas (SPEC §6); validated `.tiraz/manifest.json`
  load/save with pure update helpers.
- **Agent contract** (`core/agent.ts`): swappable `Agent` interface (SPEC §8), deterministic
  `composePrompt`, and `ClaudeCodeAgent` (headless `claude -p`) with an injectable `CommandRunner`.
- **Worktree orchestration** (`core/worktree.ts`): `git worktree` add/list/remove and port
  assignment.
- **Harness detection** (`core/detect.ts`): Storybook → Ladle → Histoire detection, with a
  `scratch` fallback (a v2 stretch goal, SPEC §11).
- **Generation** (`core/gen.ts`): `runGen` wires the single-variant pipeline — worktree → resolved
  skills → agent → render → screenshot → manifest node — around the `Agent`/`Renderer` interfaces.

  _Not yet done in this phase:_ the live `Renderer` adapter (Playwright + a booted harness server)
  and the `tiraz gen` CLI command. The orchestration is fully tested with injected agent/renderer;
  the live browser+harness path requires a browser environment and lands next.

### Phase 0 — Skeleton & registry (complete)

- Repo, strict TypeScript toolchain, and the `npm run check` QA gate.
- `core/config.ts`: full `TirazConfig` zod schema (SPEC §6) as the single source of truth;
  `loadConfig` + minimal-diff `updateConfig`.
- `core/skills-registry.ts`: the SPEC §4 registry as typed data; `resolveActiveSkills`
  (single-primary invariant; integration forces `redesign-existing-projects`; overlay composition),
  `seedPrimaries`, `resolveToggle`.
- `core/skills-install.ts`: writes the resolved skill set into `<worktree>/.claude/skills/` with
  clean toggling and pre-flight validation (no half-updated state on failure).
- CLI: `tiraz skills list | use | sync`.
- **Vendored skill content**: 12 skills vendored from upstream with preserved licenses + a
  top-level Apache-2.0 `LICENSE` and `NOTICE` (SPEC §13/§14). impeccable's `scripts/` detector is
  intentionally not vendored — it is consumed via `npx impeccable detect` in Phase 2 (SPEC §9).
