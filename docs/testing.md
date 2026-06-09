# Testing

Tiraz is tested in tiers, from a fast hermetic gate up to full live runs. Lower tiers run anywhere
with no external services; higher tiers need real tools (a browser, an API key, the `claude` CLI).

## Tier 1 — The unit gate (hermetic, always run)

```bash
npm run check
```

`format:check → lint → typecheck → test:cov → build → bin smoke`. Every external boundary (the coding
`Agent`, the `Renderer`, the `PairwiseJudge`, the `CommandRunner`, the DS collectors) is behind an
interface, so the **logic** is unit-tested with injected fakes — no browser, no network, no API key.
Coverage thresholds: lines 90 / branches 85 / functions 90 / statements 90.

The raw I/O glue that _can't_ be unit-tested (`playwright-io.ts`, `anthropic-io.ts`,
`ds-collect-io.ts`, and the CLI layer) is intentionally excluded from coverage and exercised by the
tiers below.

## Tier 2 — Manifest CLI pipeline (no external deps)

Everything that reads/writes the manifest works without the live stack: `adopt`, `init`\* `skills`,
`sources`, `tree`/`status`, `select`, `diff`, `export`, `promote`. A quick end-to-end check:

```bash
npm run build
cd "$(mktemp -d)" && git init -q
printf '{"devDependencies":{"@storybook/react":"^8"}}' > package.json
node /path/to/tiraz/dist/cli.js adopt           # detect stack → integration config
node /path/to/tiraz/dist/cli.js sources list    # the source + capability menus
# (with a .tiraz/manifest.json present:)
node /path/to/tiraz/dist/cli.js tree
node /path/to/tiraz/dist/cli.js diff g0-n0 g0-n1
node /path/to/tiraz/dist/cli.js select g0-n0
node /path/to/tiraz/dist/cli.js export --target stitch --node g0-n0
```

\*`init` shells out to `npm create astro` / `create-next-app`, so it needs network.

## Tier 3 — Live renderer (needs a browser)

The real Playwright path (`playwrightScreenshot`) has a committed e2e test, skipped in the normal
gate. To run it:

```bash
npx playwright install chromium
TIRAZ_E2E=1 npx vitest run src/core/playwright-io.e2e.test.ts
```

It serves a static page, screenshots it with headless Chromium via the real adapter, and asserts a
valid PNG is written.

## Tier 4 — Full live loop (browser + API key + `claude` + a playground)

The agent-driven commands (`gen`, `breed`, `recombine`, `score`, `review`, `promote`) need the full
stack. To exercise the whole loop against a real repo that has a **Storybook**:

```bash
export ANTHROPIC_API_KEY=sk-...        # the vision taste judge
npx playwright install chromium        # the renderer
# `claude` on PATH (the coding agent) and `npx impeccable` (the lint floor)

cd your-repo-with-storybook
tiraz adopt
tiraz gen --brief "A pricing section" --target story:pricing--default --count 3
tiraz score                            # lint floor + DS-adherence + vision judge → composites
tiraz tree                             # inspect the ranked generation
tiraz select g0-n0                     # keep the winner, prune the rest
tiraz breed g0-n0 --factor 3           # mutate it into the next generation
tiraz promote g0-n0                    # open a PR (integration) / merge (greenfield)
```

Each `gen`/`breed`/`recombine` variant runs in its own git worktree under `.tiraz/worktrees/`, so the
host working tree is never touched, and `.tiraz/` + `tiraz.config.json` are gitignored.
