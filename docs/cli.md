# CLI reference

The binary is `tiraz`. During development, run the built bundle directly:

```bash
npm run build
node dist/cli.js <command> [options]
```

Status legend: ✅ implemented · 🚧 partial · 📋 planned (with the phase it lands in).

## Implemented

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

## Planned

| Command                      | Status | Phase | Notes                                                                                |
| ---------------------------- | ------ | ----- | ------------------------------------------------------------------------------------ |
| `tiraz adopt`                | 📋     | 6     | Attach to an existing repo: detect stack + write integration config                  |
| `tiraz lint` / `tiraz score` | 🚧     | 2     | Lint floor + DS-adherence + composite done in core; VLM taste judge + CLI pending    |
| `tiraz gen` / `tiraz breed`  | 🚧     | 1 / 3 | Controller done + tested in core (`gen.ts`/`search.ts`); CLI needs the live renderer |
| `tiraz recombine`            | 🚧     | 4     | `recombineVariant` done + tested in core (`search.ts`); CLI needs the live renderer  |
| `tiraz review`               | 📋     | 7     | Invoke Emil's skill for motion/polish review                                         |

See [SPEC.md §5](../SPEC.md) for the full intended command surface and options.
