# Contributing to Tiraz

## Setup

```bash
npm install
```

Requires Node.js >= 22 and git.

## The QA gate

Every phase ends green on the single command that **is** our quality bar:

```bash
npm run check
```

It runs, in order, and fails on the first problem:

| Stage          | Command                      | Enforces                                                                  |
| -------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `format:check` | `prettier --check .`         | Consistent formatting (vendored `skills/` and `SPEC.md` excluded)         |
| `lint`         | `eslint . --max-warnings 0`  | Type-aware lint rules; **warnings fail the build**                        |
| `typecheck`    | `tsc --noEmit`               | Strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …)   |
| `test:cov`     | `vitest run --coverage`      | Tests pass and coverage stays above thresholds (90% lines / 85% branches) |
| `build`        | `tsup`                       | The CLI bundles to `dist/cli.js`                                          |
| smoke          | `node dist/cli.js --version` | The built bin runs                                                        |

Useful sub-commands: `npm test`, `npm run test:watch`, `npm run typecheck`, `npm run lint`,
`npm run format`.

## Conventions

- **No bandaid fixes.** When something fails, fix the root cause. No `as any`, no `@ts-ignore`,
  no `// eslint-disable` to dodge a real warning, no `.skip` to hide a failing test, no swallowed
  errors. If the proper fix is large, do the proper fix.
- **Strict typing.** The tsconfig is strict on purpose. Prefer precise types and zod schemas over
  `any`/casts. Index access is checked. Handle `undefined`.
- **Validate at the boundary.** Anything read from disk or the outside world (config, manifest,
  package.json) is validated with a zod schema; invalid input fails loudly with a readable message.
- **Decouple from external processes.** Things that spawn processes or drive browsers (the agent,
  the renderer, git) sit behind interfaces / injectable runners so the logic around them is
  unit-testable without the real service. See `Agent`, `Renderer`, and `CommandRunner`.
- **Test the acceptance criteria.** Each phase's "done when" (SPEC §16) should be covered by tests,
  not just happy paths.
- **Vendored content is sacrosanct.** `skills/` holds third-party skill content preserved verbatim
  with its upstream license; it is never linted, formatted, or hand-edited. See
  [docs/skills.md](./docs/skills.md).

## Project layout

```
src/
  cli.ts            # bin entry; registers commands
  cli/              # thin commander wiring per command group (not unit-covered)
  core/             # all the logic (unit-tested); see docs/architecture.md
    *.test.ts       # colocated unit tests
skills/             # vendored third-party design skills (+ per-skill LICENSE)
docs/               # usage & architecture docs
dist/               # build output (gitignored)
```

Tests are colocated as `*.test.ts` next to the module they cover.
