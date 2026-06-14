# Running the loop: the command cheat sheet

The full `gen -> score -> select -> breed -> promote` loop, command by command, for both modes. This
is the reference you keep open once you know the shape. **New to Tiraz? Start with the narrated
[redesign-an-existing-site.md](./redesign-an-existing-site.md)**, which covers setup (building the CLI,
the `tiraz` alias, Claude access, the render surface) that this page assumes.

All examples assume the alias `alias tiraz="node /absolute/path/to/Tiraz/dist/cli.js"` and use
**illustrative variant ids** like `g0-n2`; substitute your real ids from `tiraz tree`.

## What you need running

- The built CLI and the `tiraz` alias (see the redesign guide's prerequisites; install with `npm ci`,
  and do **not** run `npm audit fix --force`).
- **Claude access:** `export ANTHROPIC_API_KEY=sk-...`, or be logged in to the `claude` CLI
  (`claude login`). Both `gen` and `score` need it.
- **Playwright browsers:** `npx playwright install chromium`.
- **Your target repo's dependencies installed** (`npm install` in that repo): variants render by
  reusing its `node_modules` and booting its harness.
- **A render surface** in the target repo: a Storybook (recommended), Ladle, or Histoire story. The
  `app` and `scratch` harnesses are detected but not yet wired to render (v2), so use a real playground.
  Without one, `gen` has nothing to render and cannot score (the most common first-run blocker). The
  story id you target is the lowercased `title--export`, for example a `title: "Hero"` /
  `export const Default` story is `hero--default`.
- **For `promote` only:** the `gh` CLI authenticated (`gh auth login`) and a git remote.

## Pick a mode for setup

### Greenfield: a brand-new site

```bash
# init scaffolds Astro+Tailwind+shadcn by default; add --next for Next.js (the React examples assume Next).
tiraz init my-site --next
cd my-site
npx storybook@latest init --yes
#   add a component + story, e.g. stories/Hero.tsx + Hero.stories.tsx with title "Hero" (id: hero--default)
git add -A && git commit -m "baseline"   # variants branch from HEAD
```

### Integration: an existing repo

```bash
cd your-existing-repo
npm install                  # variants reuse these node_modules
git checkout -b redesign-tiraz
tiraz adopt                  # detects stack + harness, prints what it found, writes integration config
#   add a Storybook story; if you add it AFTER adopt, pass --harness storybook to gen (or re-run adopt)
git add -A && git commit -m "tiraz setup"
```

In integration mode the primary skill is forced to `redesign-existing-projects`, and your repo's theme
tokens become the design system the search is scored against. See the redesign guide for brand-keeping
details.

## The loop

Run these one at a time and read the output between them; this is a decision loop, not a script to
paste wholesale.

```bash
# Generate a round of variants for one target.
tiraz gen --brief "A striking hero for ..." --target story:hero--default --harness storybook --count 4
#   takes several minutes per variant and uses paid agent time; when done, `tiraz tree` lists g0-n0..g0-n3

# Score the round: lint floor + design-system adherence + pairwise taste tournament.
tiraz score                 # add --no-lint so rough early variants still get a taste/DS score

# Review (two distinct commands).
tiraz tree                  # the ranked variant DAG (every id, lineage, scores)
tiraz status                # a per-status summary of the run (counts by generation)
tiraz dashboard --open      # live cockpit at http://localhost:4317 (Ctrl-C to quit): flip, Compare, heart, cull
```

Then **pick one** refinement path with your real ids:

```bash
# Refine a single survivor:
tiraz select g0-n2                      # keep it, prune the rest of its generation
tiraz breed  g0-n2 --factor 2           # next generation; -m "make the hero bolder" for directed breeding

# OR blend two parents (do NOT select first; that prunes one of them):
tiraz recombine g0-n1 g0-n2 -g "take n2's hero, n1's palette"
```

Checkpoint anytime (revertible; it only snapshots the manifest):

```bash
tiraz snapshot save "liked these"
tiraz snapshot list
tiraz snapshot restore <id>
```

Ship the winner:

```bash
tiraz promote g2-n0          # integration: opens a PR. greenfield: MERGES into main by default.
```

> In **greenfield** mode `promote` merges straight into your base branch (`main` unless you pass
> `--base <branch>`). Snapshot first, or promote against a throwaway base, if you are not ready to move
> main. In **integration** mode it is the safer PR.

## Command reference

Per-command flags and status live in [../cli.md](../cli.md). The high-frequency ones:

| Command                               | What it does                                                    |
| ------------------------------------- | --------------------------------------------------------------- |
| `tiraz gen`                           | Generate a round of variants for `--target` (`-c`/`--count` N)  |
| `tiraz score`                         | Grade the latest generation (`--no-lint` to skip the lint gate) |
| `tiraz tree`                          | Ranked variant DAG (every id, lineage, scores)                  |
| `tiraz status`                        | Per-status summary of the run (a different view from `tree`)    |
| `tiraz dashboard --open`              | The live cockpit: review, compare, and drive the search         |
| `tiraz select` / `cull`               | Keep survivors / kill variants (`cull --lineage` for a chain)   |
| `tiraz breed` / `recombine`           | Refine a survivor (`-m` directed) / blend two parents           |
| `tiraz snapshot save\|list\|restore`  | Revertible session checkpoints                                  |
| `tiraz promote <node>`                | Ship the winner (PR in integration, merge in greenfield)        |
| `tiraz sources list\|enable\|disable` | Inspect sources; `disable` only toggles restricted ones         |
| `tiraz skills list\|use`              | Inspect and set the design-taste skills (run from your project) |

## When something stalls

- **`gen` renders nothing:** no render surface, or the target repo's `node_modules` are not installed.
  Add a Storybook story and run `npm install` in your repo.
- **A restricted source's fetch hangs:** `tiraz sources disable aceternity` (only `aceternity` and
  `skiper-ui` are toggleable; others live in the `sources.fetch` list / dashboard Config panel).
- **Scores look off:** review by eye in the dashboard. The fitness function is a pre-filter, not the
  final judge; your taste is.
