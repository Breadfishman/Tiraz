# CLI reference

The binary is `tiraz`. During development, run the built bundle directly:

```bash
npm run build
node dist/cli.js <command> [options]
```

Status legend: ✅ implemented · 🚧 partial · 📋 planned (with the phase it lands in).

## Implemented

### `tiraz adopt` ✅

Attach Tiraz to an existing repo in **integration mode** (SPEC §3). Detects the host framework (from
`package.json`) and the render harness (Storybook → Ladle → Histoire), then writes a
`tiraz.config.json` with `mode: integration` — conforming to the existing stack, never imposing one.
An unrecognized framework leaves the configured default untouched.

- `--harness <kind>` — override harness detection (`storybook` | `ladle` | `histoire` | `scratch` |
  `app`).

### `tiraz skills list` ✅

Print the skill registry and mark which skills are active for the current `tiraz.config.json`
(resolved base + primary + overlay). Run from the target project directory.

### `tiraz skills use <name>` ✅

Set the default **primary seed** or **overlay** and persist it to `tiraz.config.json` (creating the
file if needed, preserving existing keys). Enforces a single primary.

- `<name>` is a primary skill id (`impeccable`, `design-taste-frontend`,
  `redesign-existing-projects`), an overlay skill id (`minimalist-ui`, `industrial-brutalist-ui`,
  `high-end-visual-design`), or `none` to clear the overlay.
- In integration mode the active primary is forced to `redesign-existing-projects`; the seed you
  set applies to greenfield / diversity (the command tells you this).
- Unknown or non-toggleable names exit non-zero with guidance.

### `tiraz skills sync [worktree]` ✅

Write the resolved active skill set into `<worktree>/.claude/skills/` (defaults to the current
directory). Removes previously-installed registry skills (clean toggle) while leaving the user's own
skills untouched.

### `tiraz sources list|enable|disable` ✅

Inspect and toggle the component-source menu (SPEC §12) and view the capability stack (SPEC §10).

- `tiraz sources list` — print **both** menus resolved against the current config: the component
  sources (Tier-1 bundled always available; Tier-2 fetch as configured; restricted sources flagged)
  and the capability libraries (animation/scroll always available; 3D / video gated behind their
  `--3d` / `--remotion` modules; the Remotion commercial license flagged).
- `tiraz sources enable <id>` / `disable <id>` — toggle a **restricted** Tier-2 source (currently
  `aceternity`) and persist it to `tiraz.config.json`. Enabling prints the source's ToS warning.
  Non-restricted sources are configured via the `sources.fetch` list, not this toggle.

### `tiraz tree` / `tiraz status` ✅

Render the variant DAG (lineage, scores, status) and a per-status summary of the current run.
Manifest-only — runnable today.

### `tiraz select <nodes...>` ✅

Mark the given nodes as survivors and prune the rest of their generation. Manifest-only.

### `tiraz cull <nodes...>` ✅

Negative selection — the human's "nip it in the bud". Marks the given nodes `pruned`. With
`--lineage`, also culls every descendant whose **whole** ancestry runs through the culled set (kills
a doomed chain in one move); it is DAG-aware, so a grafted child with another living parent survives.
Culled variants stay in the manifest (greyed in the dashboard) but are skipped when building/serving
and never bred — that is the resource save. Manifest-only.

### `tiraz compare` ✅

Build a **single self-contained HTML gallery** of every variant for human review — the comparison
surface (review is the real bottleneck; the fitness function is the pre-filter). Each variant's
screenshot is shown in one page, grouped by generation, with its genome (primary, overlay, dials,
lineage), status, and fitness (composite / lint / DS / taste) when scored; the best-composite variant
per generation is flagged. Click any screenshot for a full-screen lightbox and use ←/→ to flip
between variants. No Storybook or dev server needed — just open the file. Manifest-only.

- `-o, --out <file>` — output path (default `.tiraz/compare.html`).
- `--open` — open it in your browser after writing (WSL / Linux / macOS).

### `tiraz dashboard` ✅ (live)

The centralized Tiraz UI: serves **one page** that embeds every variant **live and interactive** and
lets you **drive the search from the UI**. By default Tiraz compiles each variant's playground to a
**static site once** and serves them all from the single dashboard server (mounted at `/v/<id>/`) —
this scales past the old "N concurrent dev servers" approach, which was resource-heavy and the source
of transient render flakiness. The page is a sidebar of all variants (genome + fitness, best flagged,
survivor ♥ / promoted ⬆ marked, culled greyed) with a stage that loads the selected variant in an
iframe. Click or use ↑/↓ to switch; you interact with the real running component (not a screenshot).
The sidebar is **grouped by generation with parent annotations** — a lineage view.

It's the cockpit for human-steered evolution; the top action bar calls back into the engine:

- **♥ Heart** — favorite a variant (keep it; no siblings pruned) — `tiraz select`'s gentler sibling.
- **✕ Cull** / **⊘ Cull lineage** — kill a variant, or it plus its whole descendant chain (DAG-aware;
  a grafted child with a surviving parent lives). Culled variants are skipped when building/serving —
  the resource save (`tiraz cull [--lineage]`).
- **◎ Focus** — keep only this variant and prune the rest of its generation (`tiraz select`).
- **Breed** — refine into a new generation, with a **"what to improve" box** for directed breeding
  (runs the agent — minutes; polled, page reloads when done) (`tiraz breed [-m <note>]`).
- **⧉ Combine** — pick a second variant + describe **what to take from each / what to discard** →
  human-directed graft (`tiraz recombine`), run as a polled background job.
- **⬆ Promote** — greenfield merges to base; integration opens a PR (`tiraz promote`). Confirmed first.

Long-running — Ctrl-C stops the dashboard (and any dev servers). Needs a playground harness; the
variants' worktrees (or cached static builds) to serve.

- `-p, --port <n>` — dashboard port (default `4317`).
- `--open` — open it in your browser once it's up.
- `--dev` — use a live dev server per variant instead of static builds (fallback for harnesses with
  no targetable static build, e.g. Histoire).
- `--rebuild` — force-rebuild cached static sites (otherwise an existing `.tiraz/static/<id>` is
  reused, so re-launching the dashboard is fast).

### `tiraz diff <a> <b>` ✅

Compare two variants by their **genomes** — the reproducible inputs (primary, overlay, dials,
commands, sources, parents, graft instruction) that produced each. Prints one line per differing
field, or reports that the genomes are identical. Outputs (rendered screenshots) are compared
visually by the human; this compares what generated them. Manifest-only — runnable today.

### `tiraz promote <node>` ✅

Ship the winning variant (SPEC §5). In **greenfield** mode it merges the variant's branch into the
base (`--base`, default `main`) and tears down its worktree; in **integration** mode it pushes the
branch and opens a pull request via `gh` for human review (no merge). The node is marked `promoted`
and recorded as the run's `final`. Runs real `git` / `gh` — needs a repo (and, for integration, a
remote + the `gh` CLI authenticated).

- `--base <branch>` — branch to merge into / open the PR against (default `main`).

### `tiraz init [name]` ✅

Scaffold a greenfield project (SPEC §10). Drives the official CLIs — Astro + Tailwind (or Next.js
with Tailwind built in via `--next`), then shadcn/ui — installs the pinned capability stack for the
chosen modules, and writes a `tiraz.config.json` (`mode: greenfield`). With no `name`, scaffolds into
the current directory; otherwise into `<name>/`. Runs real `npm` / `npx` — needs network.

- `--next` — use Next.js instead of Astro (also makes v0 output paste-compatible).
- `--3d` — add the 3D module (Three.js + React Three Fiber + drei).
- `--remotion` — add the Remotion video module (prints its non-OSI license warning).

### `tiraz export --target stitch|v0|claude-design` ✅

Emit a handoff artifact for an external tool (SPEC §12bis):

- **`stitch`** → `DESIGN.md` — patches the vendored `stitch-design-taste` design system with the
  variant's dials and prepends the brief / design direction.
- **`v0`** → `v0-prompt.md` — a Next.js + Tailwind + shadcn prompt (pair with `init --next`).
- **`claude-design`** → `claude-design-brief.md` — a codebase-aware, integration-first handoff brief.

Options: `--node <id>` sources the design intent from a manifest variant (else config defaults);
`--brief <text>` overrides the embedded brief; `--out <file>` overrides the output path.

### `tiraz review [node]` ✅

Review a variant's **motion + polish** using Emil Kowalski's skill (SPEC §9). Emil's skill has no
stated license, so it is **never vendored** — `review` installs it on demand (via the agent-skills
CLI) into the variant's worktree, then runs the agent there with it active and prints the critique.
Defaults to the run's `final` variant (else the most recent). Runs the real agent — deferred to an
environment with `claude` + network.

### `tiraz gen` ✅ (live)

Generate a round of variants (SPEC §7): seeds diverse genomes, then for each one creates a git
worktree, links the repo's `node_modules`, runs the coding agent (`claude`), and renders + screenshots
the target with the live Playwright renderer (boots the detected Storybook/Ladle/Histoire server,
captures, tears it down). Wired and runnable; needs a live environment — the `claude` binary, a
component playground in the target repo, and Playwright browsers (`npx playwright install chromium`).

- `-b, --brief <text>` (required) · `-c, --count <n>` (default 3) · `-t, --target <scope>` ·
  `--harness <kind>`.

### `tiraz score` ✅ (live)

Score a generation with the full three-term fitness (SPEC §9): the **lint floor** (`impeccable
detect`, a gate), **DS-adherence** (the variant's used colour/spacing literals + components vs the
repo's CSS-variable tokens — Tier-2 sources whitelisted), and the **vision taste judge** (the
mixed-model pairwise tournament). Writes each node's composite to the manifest. Wired and runnable;
needs a vision judge (see `--judge`) and, unless `--no-lint`, `npx impeccable` for the lint floor.

- `-g, --generation <n>` — generation to score (default: the latest).
- `-j, --judge <kind>` — taste-judge backend: `api` (Anthropic, needs `ANTHROPIC_API_KEY`) or
  `claude-cli` (reuses the logged-in `claude` binary — no key). Default: auto (api if a key is set,
  else claude-cli).
- `--no-lint` — skip the lint floor and score DS-adherence + taste only.

### `tiraz breed <survivors...>` ✅ (live)

Breed the next generation by mutating each survivor (SPEC §7) — drives the agent + renderer like
`gen`. `-f, --factor <n>` sets children per survivor (default `config.beam.factor`); `--harness`
overrides detection.

### `tiraz recombine <parentA> <parentB>` ✅ (live)

Human-directed two-parent graft (SPEC §7): `-g, --graft "<instruction>"` (required) drives the
recombination; `--axes <list>` optionally scopes it (`typography,palette,motion,layout,spacing`).
Drives the agent + renderer.

## Planned

| Command      | Status | Phase | Notes                                                                        |
| ------------ | ------ | ----- | ---------------------------------------------------------------------------- |
| `tiraz lint` | 🚧     | 2     | Lint floor runs inside `score`; a standalone `tiraz lint` command is pending |

See [SPEC.md §5](../SPEC.md) for the full intended command surface and options.
