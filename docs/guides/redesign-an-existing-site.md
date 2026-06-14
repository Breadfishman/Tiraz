# Redesign an existing site with Tiraz

**Goal:** take a site you already have, keep its brand (theme colors, logos, real assets), throw away
the old design, and let Tiraz breed a better one inside the same repo, then ship it as a pull request.

This is the most common real use of Tiraz. Read it top to bottom the first time; after that, the
command cheat sheet in [running-the-loop.md](./running-the-loop.md) is enough.

> **Heads up: this is a developer tool.** It drives a coding agent over a real codebase from the
> command line. You do not need to be an expert, but you will be running terminal commands, and a few
> steps (tokenizing colors, adding a render surface) are genuinely easier with a developer's help. The
> guide flags those.

## Two directories are in play

Keep these straight; it is the most common source of confusion:

- **The Tiraz clone** (for example `~/Tiraz`): where you build the CLI. You only run setup commands
  here.
- **Your site's repo**: where you run everything else (`adopt`, `gen`, `score`, `dashboard`, ...).

Every command below notes which directory it runs in.

## Should you adopt the repo or start fresh?

| Your situation                                                      | Use                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| The code/stack is fine, only the **design** is ugly                 | **Adopt** the repo (this guide)                                   |
| The **codebase itself** is a mess you want gone, but keep the brand | The hybrid at the bottom of this guide                            |
| Brand-new product, no existing site                                 | [Running the loop](./running-the-loop.md), the greenfield section |

**Default to adopting.** Integration mode is the only mode that keeps your brand for free: Tiraz reads
your theme colors as the design system, and the taste search is then _rewarded_ for using them and
_penalized_ for going off-brand. You do not have to police it.

## Before you start (prerequisites)

- **Node.js >= 22** and **git**.

- **A built Tiraz CLI.** Tiraz is not on npm yet, so clone it and build once (run in `~/` or wherever
  you keep code):

  ```bash
  git clone https://github.com/Breadfishman/Tiraz && cd Tiraz
  npm ci          # exact, tested versions
  npm run build   # produces dist/cli.js
  pwd             # note this absolute path; you need it below
  ```

  > **You will see security warnings during `npm ci`. They are expected and safe to ignore. Do not run
  > `npm audit fix --force`.** The warnings are about build tooling (`esbuild`/`tsup`) and Storybook,
  > none of which is reachable in how you use the CLI. `--force` installs breaking major upgrades and
  > breaks the build. If you already ran it, recover with
  > `git checkout -- package.json package-lock.json && rm -rf node_modules && npm ci`. (If `npm ci`
  > errors about a missing or out-of-date lockfile, use `npm install` instead.)

- **An alias so the examples read cleanly.** From the `pwd` above:

  ```bash
  alias tiraz="node /absolute/path/to/Tiraz/dist/cli.js"
  ```

  This alias lives only in the current terminal. Add the line to `~/.bashrc` or `~/.zshrc` to keep it,
  or just type the full `node /absolute/path/to/Tiraz/dist/cli.js ...` form. The path only works after
  a successful `npm run build` (rebuild after pulling updates).

- **Claude access** (the agent and the taste judge both need it). Either:
  - set an API key: `export ANTHROPIC_API_KEY=sk-...` (get one at `console.anthropic.com`), **or**
  - install Anthropic's **Claude Code** CLI and run `claude login` once; Tiraz falls back to the
    logged-in `claude` binary, no key needed.

- **Playwright browsers** for rendering (run in the Tiraz clone):
  `npx playwright install chromium`.

- **A render surface in your repo.** Tiraz scores by screenshotting your UI, so it needs a preview it
  can build and load. Covered in Step 3; it is the single most common first-run blocker.

- **Only needed for the final `promote` step:** the **GitHub `gh` CLI**, authenticated
  (`gh auth login`), and a git **remote** on your repo. `promote` opens a pull request through `gh`.

## The steps

### 1. In your site's repo, install deps and branch

```bash
cd /path/to/your-site        # your own project, not the Tiraz clone
npm install                  # variants reuse your repo's node_modules to render
git checkout -b redesign-tiraz
```

`git checkout -b` makes an isolated branch to experiment on; your original is untouched. Variants also
get their own throwaway branches.

### 2. Adopt the repo

```bash
tiraz adopt                  # run in your repo
```

This detects your framework and render harness and writes a `tiraz.config.json` with
`mode: integration`, and it prints what it found (for example "framework: next, harness: storybook").
In this mode the primary design skill is forced to `redesign-existing-projects` (built for exactly
this). If it reports no harness, that is fine, you add one next; just remember to tell `gen` about it
with `--harness` (Step 6) or re-run `adopt` after Step 3.

### 3. Give Tiraz something to render

A **render surface** is a tiny preview page Tiraz can build and screenshot. Storybook is the easiest.

```bash
npx storybook@latest init --yes     # if you do not already have it
```

> Note: `storybook init` only scaffolds example `Button` / `Header` / `Page` stories. It does **not**
> create a story for your hero. Add one for the section you want to redesign:

```tsx
// stories/Hero.tsx  (a placeholder is fine; Tiraz will redesign it)
export function Hero() {
  return <section>hero</section>;
}

// stories/Hero.stories.tsx
import { Hero } from './Hero';
export default { title: 'Hero', component: Hero };
export const Default = {};
```

**The story id is the `--target` you pass to `gen`.** It is the lowercased title plus the lowercased
export, joined by `--`: title `Hero` + export `Default` becomes **`hero--default`**. You can also read
any story's id straight from its URL in Storybook (`?path=/story/hero--default`).

Want to redesign a whole page, not just a section? Put the page (or a stand-in composition of it) in a
single story and target that. **Storybook, Ladle, and Histoire are the render surfaces that work
today**; the `app` and `scratch` harnesses are detected but not yet wired to render (v2), so do not
rely on them.

### 4. Tokenize your brand colors

This is the step that makes "keep the theme colors" actually work. Tiraz reads colors from **CSS
custom properties / your Tailwind theme** and treats them as the design system. Off-system raw hex
gets penalized; tokens get rewarded, so tokenizing is what steers every variant onto your palette.

**Quick check:** open `globals.css` (or your Tailwind config). If you see named tokens, you are set:

```css
:root {
  --brand: #1d4ed8;
  --accent: #f0503d;
}
```

If instead your components are full of raw inline values like `style={{ color: "#1d4ed8" }}`,
consolidate those into tokens first. This part is real code work; if you are not a developer, this is
the step to hand off.

### 5. Stage the assets you want to keep

Put the partner logos and any images you are keeping somewhere stable (for example `public/logos/`).
Tiraz deliberately will not invent asset URLs (it avoids 404s), so it only uses assets you point it at
in the brief, by their repo-relative path (`public/logos/...`).

### 6. Commit, then write the brief and generate

Commit your render-surface and token changes first, because **variants branch from your current
`HEAD`**, so uncommitted setup is invisible to them:

```bash
git add -A && git commit -m "tiraz setup: hero story + brand tokens"
```

The brief is your main steering wheel. Be specific:

```bash
tiraz gen \
  --brief "Redesign the numu landing page. Keep the brand palette (it is in the design tokens) and use the real partner logos in public/logos for the partners strip. Replace the existing layout and components entirely; do not reuse them. Sections: hero, partner logos, three feature blocks, CTA. Tone: confident, modern, lots of whitespace." \
  --target story:hero--default \
  --harness storybook \
  --count 4
```

Brief tips:

- Say **"replace the existing components, do not reuse them"** so it does not inherit the ugly layout.
- **Name the sections** you want.
- **Point at the real assets** by repo-relative path.
- Describe a **vibe/ethos**, not just a structure. Tiraz rewards committing to a look.

**What to expect:** `gen` runs the Claude Code agent in a fresh worktree per variant and renders each
one, so a round of 4 takes several minutes and consumes API credits (or your Claude-CLI quota). When
it finishes, the next step should list `g0-n0` through `g0-n3`.

### 7. Score, then review with your own eyes

```bash
tiraz score          # grade the round (needs the same Claude access as gen)
tiraz tree           # ranked lineage; lists every variant id
tiraz dashboard --open
```

**Reading variant ids:** each variant is `g<generation>-n<number>`, so `g0-n2` is generation 0,
variant 2. `tiraz tree` and the dashboard sidebar list your real ids; use those in the commands below
(the ids here are examples). `tiraz tree` prints something like:

```
generation 0
  g0-n0  score 71  ★
  g0-n1  score 58
  g0-n2  score 64
  g0-n3  score 40  (lint floor failed)
```

`tiraz score` runs a hard **lint floor**, **design-system adherence**, and a **taste tournament**.
The lint floor can zero a rough variant; pass `--no-lint` while iterating so early drafts still get a
taste/DS read. The fitness score is a **pre-filter, not the judge**. The dashboard (a local server at
`http://localhost:4317`, `Ctrl-C` to quit, visit the URL manually if `--open` does not launch a
browser) is where you actually decide: flip through variants live, use **Compare** side-by-side,
**heart** the keepers, **cull** the duds.

### 8. Refine the one you like (use your real ids)

```bash
tiraz select g0-n2            # keep one survivor, prune the rest of its generation
tiraz breed g0-n2 --factor 2  # refine it into the next generation (runs the paid agent again)
```

To **blend two** variants instead, do not `select` first (that prunes siblings). Heart both, then:

```bash
tiraz recombine g0-n1 g0-n2 -g "take n2's hero, n1's color use"
```

Repeat score / review / breed until you have a champion; two or three generations is typical. Snapshot
before anything risky: `tiraz snapshot save "liked these"`.

### 9. Promote it

```bash
tiraz promote g2-n0           # use the id of your actual champion
```

In integration mode this pushes the variant's branch and **opens a pull request** (via `gh`, see
prerequisites) against your base branch. A PR is just a proposed change you review and merge yourself;
**nothing is merged or deployed automatically.**

### 10. Ship it

A promoted variant is presentation, not a deployed site. Finishing the job (wiring real link
destinations, deploying) is a short, separate pass documented in the README under
[From a bred variant to a shipped page](../../README.md#from-a-bred-variant-to-a-shipped-page). The
`stories/ -> components/` move in that section applies to Storybook-authored variants (which is the
supported path today).

## Tips and best practices

- **Colors as tokens is the whole game.** It is the one step that makes brand-keeping automatic.
- **Your eye is the judge.** Use the dashboard Compare view; do not just trust the composite score.
- **Explore wide, then converge.** Leave gen-0 diversity on `diverse` (or `alien`) to see range, then
  breed the look you want. Toggle it in the dashboard Config panel.
- **Snapshot before risky moves**, so any decision is revertible.
- **A specific brief beats a vague one.** Sections, tone, and "replace, do not reuse" pay off most.

## Troubleshooting

- **`gen` produces nothing / cannot render:** either no render surface (Step 3), or your repo's
  dependencies are not installed (`npm install` in your repo, Step 1). Confirm `gen` is using
  `--harness storybook` (Storybook/Ladle/Histoire are the surfaces that render today).
- **`adopt` reports `harness: scratch`:** that means no render surface was detected. Add Storybook
  (Step 3) and re-run `adopt`, or pass `--harness storybook` to `gen`. The `scratch` and `app`
  harnesses are not yet wired to render (v2).
- **Variants ignore your brand colors:** your colors are not tokens yet (Step 4). Consolidate them
  into CSS variables / the Tailwind theme.
- **A restricted source's fetch hangs:** only the restricted sources can be toggled off, by name, for
  example `tiraz sources disable aceternity` (the restricted ones are `aceternity` and `skiper-ui`).
  Other sources are configured via the `sources.fetch` list or the dashboard Config panel, or turned
  off wholesale with its "Fetch real components" toggle. Run `tiraz sources list` (from your repo) for
  valid ids.
- **It reuses the old ugly layout:** strengthen the brief ("replace the existing components, do not
  reuse them") and confirm `redesign-existing-projects` is the active primary with `tiraz skills list`
  (run it **from your repo**, since it reads the local `tiraz.config.json`).

## The hybrid: scrap the codebase too, keep only the brand

If the old repo's stack is part of what you are throwing away (run in the Tiraz clone or wherever you
keep code):

```bash
tiraz init numu-site --next     # clean Next + Tailwind + shadcn base (omit --next for the Astro default)
```

Then copy just two things into the new project: the **brand color tokens** into `globals.css`, and the
**logo/asset files** into `public/`. Now run the same loop (Steps 3 onward) greenfield, against a clean
codebase that still carries your brand. This is the most literal "scrap it, keep only colors and
assets," at the cost of re-porting those two things by hand.
