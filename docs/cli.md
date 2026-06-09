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

Inspect and toggle the two-tier component-source menu (SPEC §12).

- `tiraz sources list` — print the registry, marking which sources are available to variants for the
  current config (Tier-1 bundled are always available; Tier-2 fetch as configured) and flagging
  restricted sources.
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

## Planned

| Command                      | Status | Phase | Notes                                                                                |
| ---------------------------- | ------ | ----- | ------------------------------------------------------------------------------------ |
| `tiraz adopt` / `tiraz init` | 📋     | 1 / 6 | Attach to an existing repo (core) / scaffold a greenfield project                    |
| `tiraz lint` / `tiraz score` | 🚧     | 2     | Lint floor + DS-adherence + composite done in core; VLM taste judge + CLI pending    |
| `tiraz gen` / `tiraz breed`  | 🚧     | 1 / 3 | Controller done + tested in core (`gen.ts`/`search.ts`); CLI needs the live renderer |
| `tiraz recombine`            | 🚧     | 4     | `recombineVariant` done + tested in core (`search.ts`); CLI needs the live renderer  |
| `tiraz review`               | 📋     | 7     | Invoke Emil's skill for motion/polish review                                         |
| `tiraz export`               | 📋     | 6     | Emit handoff artifacts (Stitch / v0 / Claude Design)                                 |

See [SPEC.md §5](../SPEC.md) for the full intended command surface and options.
