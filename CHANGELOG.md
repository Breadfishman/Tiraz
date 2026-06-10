# Changelog

All notable changes to Tiraz are documented here. Progress is tracked against the build phases in
[SPEC.md §16](./SPEC.md). The format loosely follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Live adapters (in progress)

- **Snapshots — revertible checkpoints of a session** (`core/snapshot.ts`, `cli/snapshot.ts`,
  `dashboard`). Save a named checkpoint you can revert to. The insight that makes it cheap: every
  variant's _code_ is already immutable on its own committed `tiraz/<id>` branch (heart/cull change
  status, never code; cull never deletes a branch), so a snapshot is just a saved copy of the
  **manifest** (the decision state) and reverting restores it — the branches it points at are all
  still on disk. Stored under `.tiraz/snapshots/`. `restoreSnapshot` auto-checkpoints the current
  state first, so a revert is itself reversible. New `tiraz snapshot save <label> | list | restore
<id>`, and a 📸 Snapshot button + restore dropdown in the dashboard cockpit (`/api/snapshot`,
  `/api/snapshot-restore`).

- **Human-steered evolution — cull lineages + the dashboard cockpit** (`core/beam.ts`, `genome`/
  `agent`/`gen`/`search`, `core/dashboard.ts`, `cli/{cull,breed,dashboard}.ts`). The dashboard is now
  the cockpit for steering the population, not just viewing it:
  - **Cull (negative selection)** — `cull(manifest, ids, {cascade})` marks variants `pruned`; with
    cascade it kills the whole **lineage** (`lineageClosure`) — DAG-aware, so a grafted child with a
    still-living parent survives. New `tiraz cull <nodes…> [--lineage]`. Culled variants stay in the
    manifest (greyed) but are **skipped when building/serving** — pruning a doomed chain saves the
    agent time it would spend breeding it.
  - **Heart (favorite)** — `favorite(manifest, ids)` marks survivors **without** pruning siblings
    (unlike the exclusive `selectSurvivors`), so you can like several styles and cull the rest.
  - **Directed breeding** — `breed`/the dashboard take a free-text directive ("what to improve"),
    threaded through `composePrompt` as a high-priority "Requested changes" section (one-shot: shapes
    the child, not its descendants). New `tiraz breed -m/--note <text>`.
  - **Dashboard cockpit** — action bar gains ♥ Heart, ✕ Cull, ⊘ Cull lineage, ◎ Focus (keep one,
    prune the rest), a Breed box with the directive, and **Combine** (pick two + "what to take/discard"
    → the existing human-directed `recombine`, run as a polled background job). Sidebar is grouped by
    generation with parent annotations (a lineage view). New action API: `/api/{favorite,cull,
recombine}` + directive on `/api/breed`.

- **Taste quality — one shared rubric for generator and judge** (`core/taste-rubric.ts`, `agent.ts`,
  `vision-judge.ts`). The biggest lever on "still looks like AI-slop" was that the two sides of the
  loop spoke in generalities: the agent was told to have "non-generic taste" but never what slop _is_,
  and the judge's anti-slop lens was a single vague sentence — so neither generation nor selection
  pushed hard against the AI-default look. New `taste-rubric.ts` is a single, concrete source of
  truth: a catalog of **slop tells** (centered single-column hero + two pill buttons; purple/blue
  gradients + glassmorphism; a symmetric row of three equal emoji cards; framework-default
  spacing/radii; timid type scale; stock section order; decorative blur blobs; no signature element)
  and **excellence markers** (confident wide type scale + font pairing; committed restrained palette;
  intentional asymmetry/negative space; one signature element; detail craft; choreographed restraint).
  `composePrompt` now injects this as a high-priority **"Taste bar — clear it"** directive, and the
  judge's `generic-feel` lens grades against the **same** catalog (`antiSlopRubric()`) — so a variant
  is built against the exact bar it is scored on, with no drift. Tuning the catalog moves both
  generation and selection at once. _Iteration 1; effectiveness is best judged live (A/B a round
  before/after)._ Next levers: a self-critique-and-revise pass during generation, a dedicated palette
  lens, and reference exemplars for the judge.

- **Dashboard now drives the search + serves static builds at scale** (`cli/dashboard.ts`,
  `core/dashboard.ts`, `core/static-serve.ts`, `core/render-harness.ts`). Two backlog items landed:
  - **Static builds (scale).** Instead of booting one dev server per variant (resource-heavy, the
    source of transient render flakiness), `tiraz dashboard` now compiles each variant's playground to
    a **static site once** (`harnessBuildCommand` → `storybook build` / `ladle build`) and serves them
    all from the **single** dashboard server, each mounted at `/v/<id>/` (new `static-serve.ts`:
    content-type + traversal-safe path resolution; `resolveRenderUrlAt` renders a story under a
    mount-prefixed base). Builds are cached under `.tiraz/static/<id>` (reused unless `--rebuild`), so
    relaunches are fast; `--dev` keeps the per-variant dev-server path for harnesses with no targetable
    static build (e.g. Histoire). Serving is now decoupled from worktree lifecycle — a promoted
    greenfield variant (worktree torn down) still serves from its cached build.
  - **Dashboard actions.** The UI is no longer view-only: a top action bar **selects** a survivor,
    **breeds** the variant into a new generation (long, agent-driven — kicked off as a background job
    the page polls, then reloads with the new variants), and **promotes** it (merge / PR), all via a
    small JSON action API on the dashboard server (`/api/select|breed|promote`, `/api/job/<id>`;
    request bodies validated with zod). Sidebar items now mark survivor ✓ / promoted ⬆ / pruned.

- **Anti-slop blend palette — understand components across sources** (`sources.ts`, `agent.ts`). Each
  source now catalogs its **signature effects** (e.g. Aceternity: aurora/spotlight/3D cards/meteors;
  Magic UI: marquee/bento/animated beam; Cult UI: dynamic island/texture cards; Motion Primitives:
  morphing dialog/shimmer text). `signaturesFor(sources)` gathers the palette for a variant's
  permitted sources, and `composePrompt` now feeds it as a **"blend distinctively — do not copy one
  library"** directive: combine elements from several sources into one cohesive, original composition
  that couldn't be mistaken for any single library's demo. Uniqueness via cross-pollination, not
  monoculture (SPEC §12 — the "slop treadmill").

- **More options at the start + reliable rendering** (feedback-driven). (1) `seedGenomes` now gives
  each round-0 variant a distinct **overlay + dial profile** (balanced / calm-minimalist /
  bold-brutalist / kinetic-soft / high-variance editorial) on top of the primary span — so a round
  offers genuinely different options instead of near-duplicates. (2) `tiraz dashboard` now **warms
  each variant's story URL** before serving (Storybook/Vite compile stories lazily on first request,
  which showed a blank frame on first click). (3) the generation prompt now tells the agent **not to
  reference external/asset URLs that may 404**, so sub-features actually render.

- **Breeding now refines the parent (commit variants + branch children off them)** (`gen.ts`,
  `search.ts`, `agent.ts`). Two linked fixes: (1) `generateVariant` now **commits the agent's work**
  onto the variant's branch — previously a variant's design was left uncommitted, so its branch was
  empty (which also meant `promote` merged nothing). (2) `breed`/`recombine` base each child's
  worktree on the **parent's branch** (not HEAD), and `composePrompt` adds a _"refine — do not
  restart"_ directive when a genome has parents — so bred children start from the winner's actual
  design and improve it, rather than regenerating from the baseline. This makes "breed the winner"
  mean what it says, and lets the search converge.

- **Fix: DS-adherence now credits design-system _usage_, not just literal matches** (`ds-adherence.ts`,
  `ds-collect.ts`). The first anti-slop re-run exposed a measurement bug: a properly token-driven
  variant still scored ≈1/100 because the scorer only credited a literal value that exactly equalled a
  token, giving **zero credit for `var(--token)` or token utility classes** (how you actually consume a
  design system) while still counting every literal as off-system. `extractUsedValues` now also
  captures `systemRefs` (var() + shadcn/Tailwind token classes like `bg-primary`), and
  `scoreDsAdherence` counts each as on-system: score = on-system (refs + matched) / (on-system +
  hardcoded literals + off-system components). Now token-heavy variants score high and hardcoded ones
  score low — the metric finally reflects "builds within the design system".

- **Anti-slop: feed the agent the repo's design system** (`core/agent.ts` + gen pipeline): the first
  live run scored DS-adherence ≈1/100 because the prompt never told the agent the repo _has_ a design
  system or what its tokens are — so it hardcoded colours/px. `composePrompt` now includes a **design
  system section** (token categories + sample values + components) with a directive to build within it
  and that off-system literals are penalized; `generateVariant`/`runGen`/`materialize` collect the
  system via `collectDesignSystem` and pass it through. This is the integration-first core (SPEC §3/§9)
  — the agent now sees the real tokens to use instead of inventing values.

- **Scoring runs without an API key — claude-CLI judge + first live score** (`core/claude-judge-io.ts`,
  `cli/score.ts`): a second `PairwiseJudge` backend, `createClaudeCliJudge`, drives the
  already-authenticated `claude` binary (it reads the screenshots with its own tools) — reusing the
  tested `buildJudgePrompt`/`parseVerdict`, so no `ANTHROPIC_API_KEY` is needed. `tiraz score` now
  auto-picks the backend (`api` if a key is set, else `claude-cli`; `--judge` overrides) and gained
  `--no-lint` to score DS-adherence + taste only. **First live score** (the demo greenfield run)
  ranked the two variants with real per-lens rationales and surfaced the key signal: DS-adherence ≈
  1–6/100 — the variants hardcode off-system values instead of using the design tokens (the
  measurable "slop"). Score writes composites to the manifest, which the dashboard/compare views show.
- **`tiraz dashboard` — centralized live UI** (`core/dashboard.ts` + `cli/dashboard.ts`): one page
  that embeds every variant **live and interactive**, not as screenshots. Tiraz boots a render server
  per variant (reusing the renderer's harness machinery — `harnessServeCommand` / `launchServerProcess`
  / `waitForServer`) and serves a single dashboard: a sidebar of all variants (genome + fitness, best
  flagged) + an iframe stage that loads the selected variant; click or ↑/↓ to switch. Pure
  `renderDashboardHtml(manifest, endpoints)` (tested: sidebar, embedded endpoints, not-running state,
  best-flag, escaping); the CLI orchestrates the servers + an HTTP server with graceful Ctrl-C
  teardown. `openInBrowser` shared via `cli/open.ts`.
- **`tiraz compare` — variant comparison gallery** (`core/compare.ts` + `cli/compare.ts`): human
  review is the real bottleneck, so this generates one self-contained HTML page of all variants —
  every screenshot grouped by generation with its genome + fitness, the best-composite per generation
  flagged, and a click-to-zoom lightbox you arrow through. No Storybook/server/hand-assembly. Pure
  `renderCompareHtml(manifest)` (fully tested: cards, relative srcs, fitness, HTML-escaping, missing
  screenshots); the CLI writes `.tiraz/compare.html` (`--open` to launch it). Prompted by the live
  run: per-worktree Storybooks were a poor compare UX, and Storybook is a render harness, not a
  cross-variant viewer.
- **First real Tier-4 run — two product bugs fixed.** Ran the full greenfield flow live
  (`tiraz init --next` → add Storybook + a Hero story → `tiraz gen --count 2`) and it bred two
  genuinely distinct, designed hero variants, each rendered + screenshotted by the live Playwright
  renderer. Two bugs surfaced and were fixed:
  - **scaffold** (`fix(scaffold)`): `init` hung because `shadcn init` ran before `npm install` (no
    `node_modules`) and could prompt — now deps install first and shadcn runs `--defaults --yes`.
  - **agent** (`core/agent.ts`): headless `claude -p` made no edits (no TTY to approve them), so
    variants came back unchanged. `ClaudeCodeAgent` now passes `--permission-mode acceptEdits`
    (configurable via `permissionMode`) so the agent applies edits in its isolated worktree.
- **`breed` + `recombine` CLI wired live** (`cli/breed.ts`, `cli/recombine.ts`): `tiraz breed
<survivors…> [--factor n]` mutates survivors into the next generation; `tiraz recombine <a> <b>
--graft "<text>" [--axes …]` does the human-directed two-parent graft. Both drive the real agent +
  renderer (their `breedGeneration` / `recombineVariant` controllers were already tested). This
  completes the CLI surface for the gen → score → select → breed/recombine → promote loop.
- **Testing tiers** (`docs/testing.md` + `playwright-io.e2e.test.ts`): documented the four test tiers
  (hermetic unit gate → manifest CLI pipeline → live renderer → full live loop). Added a committed
  e2e test that drives the **real** `playwrightScreenshot` against a static page (skipped in the
  normal gate; run with `TIRAZ_E2E=1` after `npx playwright install chromium`) — verified producing a
  valid PNG. The manifest-backed CLI pipeline (adopt → tree → diff → select → export) was verified
  end-to-end against the built binary.
- **DS-adherence collectors + `tiraz score` wired live** (`core/ds-collect.ts`,
  `core/ds-collect-io.ts`, `cli/score.ts`): pure extractors — `parseCssCustomProperties` +
  `categorizeToken` + `buildDesignSystem` (repo design tokens from CSS custom properties) and
  `extractUsedValues` + `mergeUsedValues` (a variant's off-system colour/spacing literals + imported
  components) — are fully tested; the bounded repo/worktree file-walk that feeds them lives in
  `ds-collect-io.ts` (coverage-excluded). `tiraz score [--generation n]` assembles the full
  three-term fitness: the `impeccable` lint floor, DS-adherence (collected system vs used), and the
  live vision taste judge → each node's composite in the manifest. This closes the
  gen → score → select → breed loop. Needs `ANTHROPIC_API_KEY` + `npx impeccable`.
- **Live taste judge — vision `PairwiseJudge`** (`core/vision-judge.ts` + `core/anthropic-io.ts`):
  `VisionPairwiseJudge` implements the `PairwiseJudge` interface (SPEC §9). `buildJudgePrompt`
  (lens-scoped rubric, brief, neutral A/B labels so ids never leak) and `parseVerdict` (extract JSON
  from model prose, zod-validate, map A/B → ids, default to A on garbage) are pure + fully tested,
  including a full `runTasteTournament` run over a fake completion. The real Anthropic vision call +
  image-file reads live in `anthropic-io.ts` (lazy-imports the optional `@anthropic-ai/sdk`, needs
  `ANTHROPIC_API_KEY`; coverage-excluded, external in the bundle). `createVisionJudge()` wires it up.
- **Live renderer — harness brain** (`core/render-harness.ts`): the pure, fully-tested foundation the
  Playwright renderer builds on — `harnessServeCommand` (boot Storybook / Ladle / Histoire on a
  port), `parseTarget` + `resolveRenderUrl` (a scoped `--target` → the URL it renders at; Storybook
  story → isolated iframe, routes → origin), and `waitForServer` (readiness poll, injectable fetch).
  Unsupported combinations throw `RenderHarnessError`. The process/browser I/O lands next on top.
- **Live renderer — Playwright adapter** (`core/playwright-renderer.ts` + `core/playwright-io.ts`):
  `PlaywrightRenderer` orchestrates boot → wait → screenshot → teardown, with the `launchServer` /
  `screenshot` boundaries injected so the orchestration (incl. teardown-on-failure) is unit-tested
  with fakes. The real `spawn` (detached process group) + headless-Chromium I/O lives in
  `playwright-io.ts` (lazy-imports the optional `playwright` dep; coverage-excluded glue, external in
  the bundle).
- **`tiraz gen` wired live** (`cli/gen.ts`): seeds a generation and drives the real `ClaudeCodeAgent`
  together with `PlaywrightRenderer`. To make a fresh variant worktree runnable, `generateVariant`
  now symlinks the repo's `node_modules` into it (`worktree.linkNodeModules`) so the harness server
  can boot. Needs a live env (the `claude` binary, a target-repo playground, and
  `npx playwright install chromium`); the orchestration is fully tested.

### Phase 7 — Polish (in progress)

- **Motion/polish review** (`core/review.ts` + `tiraz review [node]`): `reviewVariant` installs Emil
  Kowalski's skill on demand (via the agent-skills CLI into the variant's worktree — **never
  vendored**, no stated license, SPEC §13) and runs the agent there with it active to critique
  motion + craft. Defaults to the run's `final` variant (else most recent). Orchestration tested with
  injected agent/runner (install + node-selection + failure paths); the live `claude` run is deferred.
- **Capabilities advertised to the agent** (`core/agent.ts`): `composePrompt` now lists the available
  capability libraries (resolved from `config.modules`, SPEC §10) so a variant knows what animation /
  3D / video tools it may use. Threaded through `generateVariant` / `runGen` / the search
  `materialize` step (which now takes the full config to resolve them).
- **Packaging** (`package.json`): publish metadata (keywords, repository, homepage, bugs), a
  `prepublishOnly` gate that runs `npm run check`, and version `0.1.0` (CLI `--version` kept in sync).
  `npm pack` ships `dist/`, the vendored `skills/`, `LICENSE`, `NOTICE`, and `README`; Tier-2 sources
  and Emil's skill are never bundled. README quickstart updated to the runnable surface.

### Phase 6 — Greenfield mode + modules + interop (in progress)

- **21st Magic agent backend** (`core/agent.ts`): `MagicAgent` implements the `Agent` interface as an
  opt-in, API-keyed 21st.dev "Magic" backend (SPEC §8) — fails fast with guidance when
  `TWENTY_FIRST_API_KEY` is absent (never spawns), otherwise shells out via the injected
  `CommandRunner`. Tested for the key-present / key-absent / arg-shape paths; the exact live CLI
  invocation is provisional (deferred to an environment with a key), but the backend is swappable in
  behind the interface today.
- **Integration attach** (`core/adopt.ts` + `tiraz adopt`): `adoptProject` detects the host framework
  (new `detectFramework` in `detect.ts` — Next / Astro / Remix / Nuxt / SvelteKit / Gatsby / Vue /
  Svelte / Vite / React, most-specific-first) and the render harness, then writes an integration
  `tiraz.config.json` (`mode: integration`) — conforming to the existing stack, never imposing one.
  An unrecognized framework leaves the configured default untouched. Tested + verified end-to-end.

- **Greenfield scaffolder** (`core/scaffold.ts` + `tiraz init`): `scaffoldProject` drives the
  official CLIs through the injected `CommandRunner` — Astro + Tailwind (or Next.js via `--next`,
  Tailwind built in), then shadcn/ui — installs the pinned capability stack for the enabled modules,
  and writes a `tiraz.config.json` (`mode: greenfield`, framework, modules). `--3d` adds the Three.js
  / R3F / drei stack; `--remotion` adds Remotion and prints its non-OSI license warning. Tested with
  a recording fake runner (Astro / Next / named-subdir / failure paths) writing real config.
- **Capability scaffolding** (`core/capabilities.ts`): each library gained a `scaffold` flag marking
  SPEC §10's _pinned_ stack (GSAP + Motion + Lenis core; Three.js + R3F + drei for `--3d`; Remotion
  for `--remotion`) vs. merely-available escape hatches (uikit, postprocessing, Spline, Theatre.js).
  `scaffoldPackages(modules)` returns the npm packages `init` installs.
- **CLI**: `tiraz init [name] [--next] [--3d] [--remotion]` is wired and runnable today.
- **Interop export adapters** (`core/export.ts` + `tiraz export`): `exportArtifact(target, ctx)` emits
  a handoff artifact (SPEC §12bis). `stitch` patches the vendored `stitch-design-taste` DESIGN.md
  dials from the variant and prepends the brief; `v0` emits a Next/Tailwind/shadcn prompt;
  `claude-design` emits a codebase-aware, integration-first handoff brief. `tiraz export --target
<tool> [--node <id>] [--brief <text>] [--out <file>]` is wired and runnable today (sources the
  design intent from a manifest node or config defaults). The bundled-skills locator moved to
  `cli/bundled.ts`, shared by `skills` and `export`.

### Phase 5 — Component sourcing (in progress)

- **Expanded source menu + capability stack** (`core/sources.ts`, `core/capabilities.ts`): rounded
  out the sourcing layer against verified-2026 licenses so no impressive features are left out.
  - Component sources grew from 4 to the full vetted ecosystem — added Cult UI, Motion Primitives,
    Kokonut UI, SmoothUI, Eldora UI, Indie UI (clean MIT), Animate UI (MIT + Commons Clause), and
    Origin UI (MIT components / AGPL repo). The default permitted `fetch` set now spans a diverse
    clean-MIT selection (anti-monoculture, §12). `EXCLUDED_SOURCES` records why Hover.dev and Skiper
    UI are deliberately not auto-fetched. Per-source `warning` replaces the single hardcoded ToS
    string.
  - New `core/capabilities.ts` is the §10 capability stack as a typed, license-verified registry —
    GSAP, Motion, Anime.js, AutoAnimate, Theatre.js, Lenis (core); Three.js, R3F, drei,
    postprocessing, pmndrs uikit, Spline (`--3d`); Remotion (`--remotion`). `resolveCapabilities`
    returns the libraries available for the enabled modules and surfaces Remotion's non-OSI
    commercial-license warning. License caveats (GSAP's Webflow clause, Theatre's AGPL studio,
    Spline's undeclared runtime) are recorded per entry.
  - `tiraz sources list` now shows both menus resolved against the current config.

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
