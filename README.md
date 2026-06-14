# Tiraz

A design-taste engine for AI coding agents. Tiraz sits on top of Claude Code and turns one brief
into a _bred_ population of frontend variants, then converges on the best one through a
fitness-gated beam search, **inside your real codebase and design system**. Its job is to stop
AI-built UIs from looking AI-built, without the integration tax of generate-in-a-vacuum tools.

**Live demo:** [tiraz.frf-enterprises.com](https://tiraz.frf-enterprises.com). This landing page was
itself bred by Tiraz from a single brief, then promoted out to a standalone site.

> **Status: end-to-end working.** All build phases (0–7) plus the live adapters (Playwright renderer,
> vision taste judge, DS-adherence collectors) are implemented and verified live. The full
> `gen → score → select → breed → promote` loop runs against a real repo, with a live `dashboard` to
> review variants. Output is "getting there but still lacking" (quality is the active focus). See the
> [CHANGELOG](./CHANGELOG.md) for per-change detail.

## How it works

Tiraz treats UI design as a breeding problem. You give it one brief; it converges on a striking,
on-system result through a fitness-gated [beam search](https://en.wikipedia.org/wiki/Beam_search):

1. **Seed**: the brief becomes a diverse population of _genomes_: reproducible recipes pairing a
   design-taste skill (+ optional overlay), dials for variance / motion / density, a set of component
   sources, and an aesthetic _ethos_. Generation 0 is deliberately varied (different ethos, different
   sources, some entirely homegrown) so the search starts wide instead of converging on one safe look.
2. **Materialize**: each genome is built into real code by a Claude Code agent in its own **git
   worktree** (an isolated branch), optionally fetching real components from 10+ shadcn/registry
   sources and 21st.dev semantic search.
3. **Score**: every variant earns a three-term **fitness**: a lint **floor** (a hard gate),
   **design-system adherence** (penalizes off-system colour/spacing literals; credits genuinely
   fetched components), and a pairwise **vision taste tournament** in which Claude judges rendered
   screenshots head-to-head.
4. **Select & breed**: survivors advance; the strongest are bred and recombined into the next
   generation, with the beam keeping the population focused. Lineage is a DAG in
   `.tiraz/manifest.json`, and a live **dashboard** lets you review, compare side-by-side, heart,
   cull, and breed variants by eye.
5. **Promote**: the winner ships as a branch or PR into your repo (`tiraz promote`).

Crucially, the whole loop runs **inside your real codebase and design system** (variants use your
tokens and components), so the output integrates instead of needing a rewrite.

## Documentation

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

## Quickstart (what runs today)

```bash
npm install
npm run build

# Attach to an existing repo (detect stack + harness, write integration config):
node dist/cli.js adopt

# …or scaffold a greenfield project (Astro + Tailwind + shadcn; add modules):
node dist/cli.js init my-app --3d

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
`promote`) need a live agent + render environment; their controllers are built and tested, and the
live adapters land where they can run. See [docs/cli.md](./docs/cli.md) for the full surface and
per-command status.

## From a bred variant to a shipped page

Tiraz produces **presentation**: the layout, hero, nav, CTAs, footer. It deliberately stops at the
repo boundary: it provides **no deployment infrastructure**, and the bred UI ships with its
**destinations empty on purpose** (CTA/footer links render as labels with no `href`), because where
"Docs", "Features", or the GitHub link _point_ are content/routing decisions, not taste decisions.
Going from a promoted variant to a live page is a small pass, not a backend build-out:

1. `tiraz promote <node>` → a PR (integration) or merged branch (greenfield).
2. If the variant was authored against Storybook, move `stories/*` → `components/` and fix imports.
3. Fill the real destinations in one place: a `config/site.ts` (`siteConfig`) with your `github` /
   `docs` / `features` URLs, and point the bred buttons/labels at it.
4. Merge (your CI/CD deploys it) or, greenfield, push the repo and connect it to **Vercel** or
   **Cloudflare Pages**. Tiraz does not own this step, by design.

See [docs/cli.md](./docs/cli.md#what-promote-does--and-where-tirazs-job-ends) for the full breakdown.

## License & attribution

Tiraz is open source under the [Apache License 2.0](./LICENSE): you're free to use, modify, fork,
and build commercial or hosted products on it. In return, the license requires you to **retain the
copyright notice and reproduce the [`NOTICE`](./NOTICE)** in any redistribution (Apache-2.0 §4), so
credit travels with the code.

**If you fork, build on, or ship anything derived from Tiraz, keep the attribution to Faris
([@Breadfishman](https://github.com/Breadfishman)).** That isn't just courtesy. It's the license.

Tiraz also vendors third-party design _skills_ under their own licenses (Apache-2.0 / MIT); see
[`NOTICE`](./NOTICE) and [docs/skills.md](./docs/skills.md) for per-skill attribution.
