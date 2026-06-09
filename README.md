# Tiraz

A design-taste engine for AI coding agents. Tiraz sits on top of Claude Code and turns one brief
into a _bred_ population of frontend variants, then converges on the best one through a
fitness-gated beam search — **inside your real codebase and design system**. Its job is to stop
AI-built UIs from looking AI-built, without the integration tax of generate-in-a-vacuum tools.

> **Status: all build phases (0–7) implemented.** The full orchestration is in place — skills,
> three-term fitness, beam search, recombination/diff/promote, the two-tier component sourcing +
> capability stack, greenfield `init`, integration `adopt`, interop `export`, and Emil's `review`.
> The remaining work is the **live external adapters** (Playwright renderer, the Anthropic vision
> taste judge, DS-adherence collectors, and the `claude`/Magic agent runs) — all behind tested
> interfaces, pending a browser + API-key environment. See [CHANGELOG](./CHANGELOG.md) for the
> per-phase detail and [SPEC.md](./SPEC.md) for the full design.

## Documentation

| Doc                                              | What it covers                                          |
| ------------------------------------------------ | ------------------------------------------------------- |
| [SPEC.md](./SPEC.md)                             | The full design spec (vision, all resolved decisions)   |
| [docs/architecture.md](./docs/architecture.md)   | How the pieces fit: layers, modules, the `gen` pipeline |
| [docs/cli.md](./docs/cli.md)                     | Command reference, with implementation status           |
| [docs/configuration.md](./docs/configuration.md) | `tiraz.config.json` reference                           |
| [docs/skills.md](./docs/skills.md)               | The skill registry, toggling, vendoring + licensing     |
| [CONTRIBUTING.md](./CONTRIBUTING.md)             | Dev setup, the QA gate, and code conventions            |

`SPEC.md` is the design intent (the whole vision); the `docs/` describe what is actually
implemented today.

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

## License

Apache-2.0. Tiraz vendors third-party design skills under their original licenses — see
[NOTICE](./NOTICE) for attribution and [docs/skills.md](./docs/skills.md) for details.
