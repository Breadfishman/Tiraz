# Changelog

All notable changes to Tiraz are documented here. Progress is tracked against the build phases in
[SPEC.md §16](./SPEC.md). The format loosely follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Phase 5 — Component sourcing (in progress)

- **Source registry** (`core/sources.ts`): the two-tier menu (SPEC §12) as typed data — Tier-1
  bundled (Magic UI, MIT) and Tier-2 fetch-only (React Bits, 21st registry, Aceternity), each with
  its verified license. `resolveSources` splits bundled vs permitted fetch and gates the restricted
  Aceternity behind its own toggle, surfacing its ToS warning when enabled. `isFromPermittedSource`
  recognizes a fetched component by its `source/Component` prefix.
- **Linter whitelisting** (`core/ds-adherence.ts`): `scoreDsAdherence` takes the variant's permitted
  Tier-2 sources and treats components fetched from them as on-system — so an intentionally-pulled
  Tier-2 component isn't penalized as off-system slop (SPEC §9/§12). `score.ts` passes each node's
  `genome.sources` through.
- **Wiring**: `seedGenomes` / `runGen` record the resolved permitted sources on each genome (was the
  raw `config.sources.fetch`), so the Aceternity toggle and validation flow through.
- **CLI**: `tiraz sources list | enable <id> | disable <id>` — inspect the menu and toggle the
  restricted source, with the ToS warning printed on enable. Wired and runnable today.

### Phase 4 — Recombination, diff & promote (in progress)

- **Recombination** (`core/genome.ts` + `core/search.ts`): `recombineGenome` grafts two parents
  into one child — human-directed (SPEC §7), where the natural-language `instructions` are the
  source of truth and `extracted` is assist-only. The child inherits parentA's base, records both
  parents + the `GraftSpec`, and combines parent seeds. `recombineVariant` loads the manifest,
  validates the parents + a non-empty graft instruction, then materializes + persists the child as
  a new generation over the injected agent/renderer. Tested with real git + manifest and fakes.
- **Diff** (`core/diff.ts`): `diffGenomes` returns one entry per differing genome field;
  `renderGenomeDiff` formats it as readable text. Compares the reproducible inputs that produced two
  variants (outputs are compared visually by the human).
- **Promote** (`core/promote.ts`): `promoteVariant` ships the winning variant. Greenfield merges the
  variant branch into the base (`--base`, default `main`) and tears down its worktree; integration
  pushes the branch and opens a PR via `gh` for review (no merge). The node is marked `promoted` and
  recorded as the manifest's `final`. All process work goes through the injected `CommandRunner` —
  tested greenfield with real git + worktree teardown, integration with a recording fake runner.
- **CLI**: `tiraz diff <a> <b>` and `tiraz promote <node> [--base]` are wired and runnable today
  (verified end-to-end).

  _Remaining:_ the `tiraz recombine` CLI depends on the live `Renderer` (deferred); the
  `recombineVariant` controller it calls is done + tested.

### Phase 3 — Beam search (in progress)

- **Mutation** (`core/genome.ts`): `mutateGenome` applies one small deterministic perturbation
  (nudge a dial or append a command) and records the parent — the breeding operator (SPEC §7).
- **Prune + select** (`core/beam.ts`): `pruneGeneration` implements all three modes — `human-only`
  (annotate only), `lint-gated` (drop lint failures, rank the rest), `auto-beam` (keep top `width`
  passing) — with the lint floor as a hard gate; `selectSurvivors` is the human override.
- **DAG rendering** (`core/tree.ts`): `renderTree` (lineage + composite/taste/lint per node) and
  `renderStatus` (per-status summary) for the `tree` / `status` commands.
- **Search controller** (`core/search.ts` + `gen.ts` refactor): `generateVariant` extracted as the
  per-genome primitive; `seedGenomes` (round-0 diversity spanning both primaries), and
  `generateGeneration` / `breedGeneration` (mutate survivors → children) materialize and persist a
  generation over the injected agent/renderer. Tested with real git + manifest and fakes.
- **CLI**: `tiraz tree`, `tiraz status`, and `tiraz select <nodes…>` are wired and runnable today
  (manifest-only — verified end-to-end against a real manifest).

  _Remaining:_ the `tiraz gen --factor` / `tiraz breed` CLI commands depend on the live `Renderer`
  (deferred to a browser-capable environment); the controller functions they call are done + tested.

### Phase 2 — Three-term fitness (in progress)

- **Lint floor** (`core/lint.ts`): wraps `impeccable detect --json` (via an injectable
  `CommandRunner`), defensively validates the findings array, maps severities to weighted
  violations, and gates pass/fail against `config.lintThreshold`.
- **Design-system adherence** (`core/ds-adherence.ts`): pure scorer diffing a variant's used
  values + components against the repo's design system → 0–100 + off-system list (Tier-2 registry
  components are whitelisted).
- **Composite** (`core/fitness.ts`): assembles the three-term `Fitness`; the lint floor gates
  (fail → composite 0), otherwise a configured weighted blend of DS-adherence + taste.
- **Taste judge** (`core/taste-judge.ts`): a mixed-model pairwise tournament (SPEC §9) — every pair
  judged by every lens in both orders (cancels position bias), tallied into a ranking + derived
  score. Depends only on a `PairwiseJudge` interface (default 3-lens panel: 2× Opus, 1× Sonnet).
- **Scoring** (`core/score.ts`): `runScore` computes the lint floor + DS-adherence per node, runs
  the taste tournament across a generation, assembles each node's composite, marks it `scored`, and
  persists the manifest — satisfying Phase 2's "done when".

  _Deferred external adapters_ (behind the injected interfaces, to be built where they can run):
  the live `PairwiseJudge` (Anthropic vision API), and the design-system / used-value collectors
  that feed DS-adherence. Plus the `tiraz lint` / `tiraz score` CLI wiring.

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
