# Tiraz

A design-taste engine for AI coding agents. Tiraz sits on top of Claude Code and turns one brief
into a _bred_ population of frontend variants, then converges on the best one through a
fitness-gated beam search — **inside your real codebase and design system**. Its job is to stop
AI-built UIs from looking AI-built, without the integration tax of generate-in-a-vacuum tools.

> **Status: early development.** Phase 0 (skeleton, config, skill registry + install) is complete.
> Phase 1 (single-variant generation) is in progress. See [CHANGELOG](./CHANGELOG.md) for what
> works today and [SPEC.md](./SPEC.md) for the full design.

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

## Quickstart (what works today)

```bash
npm install
npm run build

# Inspect the design skill registry and what's active for your config:
node dist/cli.js skills list

# Toggle the default primary seed / overlay (writes tiraz.config.json):
node dist/cli.js skills use design-taste-frontend
node dist/cli.js skills use minimalist-ui

# Write the resolved active skill set into a project's .claude/skills/:
node dist/cli.js skills sync /path/to/project
```

See [docs/cli.md](./docs/cli.md) for the full command surface, including planned commands.

## License

Apache-2.0. Tiraz vendors third-party design skills under their original licenses — see
[NOTICE](./NOTICE) for attribution and [docs/skills.md](./docs/skills.md) for details.
