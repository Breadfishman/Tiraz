# Tiraz

**A design-taste engine for AI coding agents.** Tiraz sits on top of Claude Code and treats UI
design as evolution: from one brief it breeds a whole population of frontend variants, then
converges on the most striking one through a fitness-gated beam search, all **inside your real
codebase and design system**.

It exists to solve two failures at once. AI-built UIs look AI-built: they collapse toward the same
safe, centered, generic layout. And the tools bold enough to escape that generate in a vacuum,
handing you something you then pay an integration tax to graft back into your stack. Tiraz refuses
both. Variants are written against your own tokens and components, scored on a three-term fitness (a
free local lint pass, design-system adherence, and a single-call vision ranking judged by Claude), and
steered by you from a live dashboard. What survives is UI with real taste that drops into your
project instead of fighting it.

**Live demo:** [tiraz.frf-enterprises.com](https://tiraz.frf-enterprises.com). This landing page was
itself bred by Tiraz from a single brief, then promoted out to a standalone site.

> **Status: end-to-end working, verified live.** The full
> `gen -> score -> select -> breed -> promote` loop runs against a real repo, rendering either your
> actual site (the `app` harness) or a Storybook/Ladle/Histoire story, with a live `dashboard` to
> review variants. The loop was recently slimmed down for current models: a round of 4 variants plus
> scoring costs **6 Claude sessions** (it used to be ~56). See the [CHANGELOG](./CHANGELOG.md).

## How it works

In plain terms: Tiraz generates several versions of your UI, automatically grades them on look and
on-brand-ness, and lets you pick and refine the best, all inside your own repo. Under the hood it
treats UI design as a breeding problem and converges on a striking, on-system result through a
fitness-gated [beam search](https://en.wikipedia.org/wiki/Beam_search):

1. **Seed**: one short planning call turns the brief into a set of genuinely different design
   directions tailored to your design system (kept inside your brand when redesigning). Each becomes
   a reproducible _genome_: the direction, what "excellent" means for it, and dials for variance /
   motion / density.
2. **Materialize**: each genome is built into real code by one Claude Code session in its own **git
   worktree** (an isolated branch). The agent runs your build and screenshots its own render
   (`tiraz shot`) to fix what it sees before finishing. Component libraries (10+ shadcn registries,
   21st.dev) are opt-in.
3. **Score**: one vision call ranks every variant's full-page screenshot, with a critique each.
   Two free local checks back it up: **design-system adherence** (off-system colour/spacing literals)
   and impeccable's **lint** over the files each variant changed.
4. **Select & breed**: survivors advance; the strongest are bred and recombined into the next
   generation, with the beam keeping the population focused. Lineage is a DAG in
   `.tiraz/manifest.json`, and a live **dashboard** lets you review, compare side-by-side, heart,
   cull, and breed variants by eye.
5. **Extend & promote**: carry the winning design to the site's other pages (`tiraz gen --from`),
   then ship each as a branch or PR into your repo (`tiraz promote`).

Crucially, the whole loop runs **inside your real codebase and design system** (variants use your
tokens and components), so the output integrates instead of needing a rewrite.

## Guides (start here to use it)

| Guide                                                                   | What it walks you through                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Redesign an existing site](./docs/guides/redesign-an-existing-site.md) | The most common task: keep your brand, rebreed the design, ship a PR          |
| [Running the loop](./docs/guides/running-the-loop.md)                   | The full `gen -> score -> select -> breed -> promote` cheat sheet, both modes |

## Reference docs

| Doc                                              | What it covers                                          |
| ------------------------------------------------ | ------------------------------------------------------- |
| [docs/architecture.md](./docs/architecture.md)   | How the pieces fit: layers, modules, the `gen` pipeline |
| [docs/cli.md](./docs/cli.md)                     | Command reference, with implementation status           |
| [docs/configuration.md](./docs/configuration.md) | `tiraz.config.json` reference                           |
| [docs/testing.md](./docs/testing.md)             | The four test tiers, incl. the live runbook             |
| [docs/skills.md](./docs/skills.md)               | The skill registry, toggling, vendoring + licensing     |
| [CONTRIBUTING.md](./CONTRIBUTING.md)             | Dev setup, the QA gate, and code conventions            |

The `docs/` describe what is actually implemented today.

## Requirements

- Node.js >= 22
- git (Tiraz isolates variants in git worktrees)
- For the agent-driven commands: the [`claude`](https://claude.com/claude-code) CLI, logged in, and a
  Playwright Chromium (`npx playwright install chromium`, or point `TIRAZ_CHROMIUM_PATH` at an
  existing Chrome/Chromium). `ANTHROPIC_API_KEY` is optional (the judge then uses the API directly).
- For `promote` in integration mode: the `gh` CLI, authenticated.

## Quickstart: redesign a website

```bash
npm ci && npm run build && npm link       # in the Tiraz clone; puts `tiraz` on your PATH
cd ../your-site && npm install            # variants reuse your node_modules
tiraz adopt                               # detects your stack; no Storybook → renders your dev server
tiraz brand draft                         # drafts BRAND.md from your site — then answer its TODOs
tiraz brand refs                          # screenshots the sites you love (the bar for the judge)
git add -A && git commit -m "tiraz setup" # variants branch from HEAD
tiraz gen --brief "Redesign our homepage: ..." --target route:/ --count 4
tiraz score                               # one judge call ranks all 4
tiraz dashboard --open                    # compare; heart / cull with a reason; breed with notes
tiraz gen --from g0-n2 --target route:/about --count 2 --brief "About page: ..."
tiraz promote g0-n2                       # opens a PR
```

Next.js sites: set `"appCommand": "npx next dev --webpack -p {port}"` in `tiraz.config.json` first
(Turbopack rejects the symlinked `node_modules` in variant worktrees). The full walkthrough is the
[redesign guide](./docs/guides/redesign-an-existing-site.md).

## Making it yours, not "AI design"

Models avoid the obvious template now, but fall into a second default that's just as recognisable:
a serif headline with one italic word in the accent colour, tiny letter-spaced uppercase labels,
"§ 01" numbering, hairline rules on cream paper, the same handful of fonts. Tiraz pushes back on
several fronts:

- **`BRAND.md`**: what only your company can say, its real voice and proof, sites you love and hate,
  what to never look like, real assets. Every direction grows out of it, every agent builds from it,
  and the judge grades against it. `tiraz brand draft` starts it from your site.
- **A signature element per direction**: one ownable thing drawn from your brand or product, built
  around and checked by the judge.
- **A different philosophy backbone per direction** (Swiss, Rams, Bauhaus, information design, …)
  and typefaces from a curated library instead of the model defaults. Directions must also avoid the
  crowd looks of the popular AI design skills ([research](./docs/research/design-skills-landscape.md)).
- **A tells scan** (`tiraz tells`): a free check for the AI house style that agents run on their own
  work and that lowers a variant's score.
- **Your taste, remembered**: give a reason when you heart or cull (`--why`, or the dashboard box);
  it lands in `.tiraz/TASTE.md` and steers every later round.
- **Reference sites**: the sites you love are shown to the judge as the bar.
- **Measured diversity**: near-duplicate variants are flagged, and new rounds are told what's already
  been tried.

## What a round costs

| Step                      | Claude usage                                                          |
| ------------------------- | --------------------------------------------------------------------- |
| `gen --count N`           | 1 short planning call + N build sessions (capped by `agent.maxTurns`) |
| `gen --from <node>`       | N build sessions (no planning)                                        |
| `breed` / `recombine`     | 1 build session per child                                             |
| `score`                   | 1 vision call for the whole generation; lint + DS checks are local    |
| `generation.selfCritique` | +1 resumed session per variant (off by default)                       |

Choose the build model with `agent.model` and the judge/planner models with `agent.judgeModel` /
`agent.plannerModel` ([configuration](./docs/configuration.md#agent-models-and-session-limits)).

## More commands

> Install with `npm ci` (exact, tested versions). You will see audit warnings about dev build tooling
> (`esbuild`/`tsup`, Storybook); they are transitive dev dependencies, are not part of the CLI, and
> are safe to ignore. Do **not** run `npm audit fix --force`, which forces breaking upgrades.

```bash
npm ci
npm run build

# Attach to an existing repo (detect stack + harness, write integration config):
node dist/cli.js adopt

# …or scaffold a greenfield project (Astro + Tailwind + shadcn + a Storybook render surface):
node dist/cli.js init my-app --3d   # ready to `gen` against story:hero--default (--no-storybook to skip)

# Inspect the skill registry, the component-source menu, and the capability stack:
node dist/cli.js skills list
node dist/cli.js sources list

# Toggle a primary/overlay seed or a restricted source (writes tiraz.config.json):
node dist/cli.js skills use design-taste-frontend
node dist/cli.js sources enable aceternity   # prints its ToS warning

# Inspect a run's variant DAG, select survivors, diff two variants:
node dist/cli.js tree
node dist/cli.js select g1-n0
node dist/cli.js diff g1-n0 g1-n1

# Hand off to an external tool:
node dist/cli.js export --target stitch --brief "A pricing page"
```

Commands that drive the coding agent / a browser (`gen`, `breed`, `recombine`, `score`, `review`,
`shot`) need the `claude` CLI and a Playwright browser. Render your real site with the `app` harness
(your own dev server, routes as targets) or a Storybook/Ladle/Histoire story. Models, turn caps, and
what each round costs are in [docs/configuration.md](./docs/configuration.md). See
[docs/cli.md](./docs/cli.md) for the full surface.

**New here?** The [Guides](#guides-start-here-to-use-it) walk the whole thing end to end. Start with
**Redesign an existing site** for the common task, or **Running the loop** for the command-by-command
reference.

## From a bred variant to a shipped page

Tiraz produces **presentation**: the layout, hero, nav, CTAs, footer. It deliberately stops at the
repo boundary: it provides **no deployment infrastructure**, and the bred UI ships with its
**destinations empty on purpose** (CTA/footer links render as labels with no `href`), because where
"Docs", "Features", or the GitHub link _point_ are content/routing decisions, not taste decisions.
Going from a promoted variant to a live page is a small pass, not a backend build-out:

1. `tiraz promote <node>` -> a PR (integration) or merged branch (greenfield).
2. If the variant was authored against Storybook, move `stories/*` -> `components/` and fix imports.
   Variants rendered with the `app` harness are already edits to your real pages.
3. Fill the real destinations in one place: a `config/site.ts` (`siteConfig`) with your `github` /
   `docs` / `features` URLs, and point the bred buttons/labels at it.
4. Merge (your CI/CD deploys it) or, greenfield, push the repo and connect it to **Vercel** or
   **Cloudflare Pages**. Tiraz does not own this step, by design.

See [docs/cli.md](./docs/cli.md#what-promote-does-and-where-tirazs-job-ends) for the full breakdown.

## License & attribution

Tiraz is open source under the [Apache License 2.0](./LICENSE): you're free to use, modify, fork,
and build commercial or hosted products on it. In return, the license requires you to **retain the
copyright notice and reproduce the [`NOTICE`](./NOTICE)** in any redistribution (Apache-2.0 §4), so
credit travels with the code.

**If you fork, build on, or ship anything derived from Tiraz, keep the attribution to Faris
([@Breadfishman](https://github.com/Breadfishman)).** That isn't just courtesy. It's the license.

Tiraz also vendors third-party design _skills_ under their own licenses (Apache-2.0 / MIT); see
[`NOTICE`](./NOTICE) and [docs/skills.md](./docs/skills.md) for per-skill attribution.
