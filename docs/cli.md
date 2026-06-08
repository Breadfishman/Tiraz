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

## Planned

| Command                        | Status | Phase | Notes                                                                                |
| ------------------------------ | ------ | ----- | ------------------------------------------------------------------------------------ |
| `tiraz gen`                    | 🚧     | 1     | Single-variant pipeline exists as `core/gen.ts`; CLI command + live renderer pending |
| `tiraz adopt` / `tiraz init`   | 📋     | 1 / 6 | Attach to an existing repo (core) / scaffold a greenfield project                    |
| `tiraz lint` / `tiraz score`   | 🚧     | 2     | Lint floor + DS-adherence + composite done in core; VLM taste judge + CLI pending    |
| `tiraz tree` / `tiraz status`  | 📋     | 3     | Render the variant DAG: lineage, scores, status                                      |
| `tiraz select` / `tiraz breed` | 📋     | 3 / 4 | Mark survivors / mutate + recombine into the next generation                         |
| `tiraz diff`                   | 📋     | 4     | Compare two variants' genomes + outputs                                              |
| `tiraz promote`                | 📋     | 4     | Integration: open a PR. Greenfield: merge to main.                                   |
| `tiraz review`                 | 📋     | 7     | Invoke Emil's skill for motion/polish review                                         |
| `tiraz export`                 | 📋     | 6     | Emit handoff artifacts (Stitch / v0 / Claude Design)                                 |

See [SPEC.md §5](../SPEC.md) for the full intended command surface and options.
