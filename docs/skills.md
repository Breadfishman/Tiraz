# Skills

Tiraz's taste layer is a registry of design **skills**: `SKILL.md` files (some with supporting
`reference/` material) that guide the coding agent. The registry is defined as typed data in
`src/core/skills-registry.ts`; the vendored content lives in `skills/`.

## Roles & toggling (SPEC §4)

| Role                | Skills                                                               | Active when                                             |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| **base**            | `frontend-design`                                                    | Always, in every resolved variant                       |
| **primary**         | `impeccable`, `design-taste-frontend`                                | Exactly one per variant (mutually exclusive)            |
| integration primary | `redesign-existing-projects`                                         | Forced as the primary whenever `mode = integration`     |
| **overlay**         | `minimalist-ui`, `industrial-brutalist-ui`, `high-end-visual-design` | 0 or 1, composes with the primary                       |
| single-purpose      | `full-output-enforcement`, `image-to-code`                           | Invoked per-command, never always-on                    |
| interop             | `stitch-design-taste`                                                | Per-command (export)                                    |
| imagegen            | `imagegen-frontend-web`, `brandkit`                                  | Per-command                                             |
| QA (on-demand)      | `emilkowalski-skill`                                                 | Only via `tiraz review`; **never vendored** (see below) |

**Single-primary invariant.** `resolveActiveSkills` always selects exactly one primary. `primary`
in config is the default _seed_; in integration mode the active primary is forced to
`redesign-existing-projects`. Round-0 generation spans both togglable primaries for diversity
(`seedPrimaries`).

The resolved active set for a variant is `[base, primary, overlay?]`. `tiraz skills sync` writes it
into `<worktree>/.claude/skills/`, removing previously-installed registry skills while leaving the
user's own skills in place.

## Component sourcing (two tiers, SPEC §12)

Diversity of component sources is an anti-slop mechanism. The license of each source dictates its
tier. This is not a free choice.

- **Tier 1: bundled** (vendored, MIT/Apache): e.g. Magic UI. Shipped with Tiraz.
- **Tier 2: fetch-on-demand** (restrictive or use-only licenses): React Bits, the 21st.dev
  registry. The agent pulls these into _your_ repo on demand; Tiraz never redistributes them.
- **Aceternity** is off by default and gated behind a ToS warning (fine for personal use, risky for
  commercial). See [docs/configuration.md](./configuration.md).

## Vendoring & licensing (SPEC §13/§14)

The `skills/` directory holds upstream skill content **preserved verbatim**, each with its original
license alongside it (`skills/<name>/LICENSE` or `LICENSE.txt`). It is never linted, formatted, or
hand-edited. The combined work is Apache-2.0; full attribution is in [NOTICE](../NOTICE).

| Skill                                                                                                                                                                         | Source               | License    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| `frontend-design`                                                                                                                                                             | anthropics/skills    | Apache-2.0 |
| `impeccable` (SKILL.md + `reference/` only)                                                                                                                                   | pbakaus/impeccable   | Apache-2.0 |
| `design-taste-frontend`, `redesign-existing-projects`, the 3 overlays, `full-output-enforcement`, `image-to-code`, `stitch-design-taste`, `imagegen-frontend-web`, `brandkit` | Leonxlnx/taste-skill | MIT        |

- **impeccable's detector** (its `scripts/`) is intentionally **not** vendored. Tiraz consumes it
  via `npx impeccable detect` in Phase 2 (SPEC §9). Vendoring the skill keeps only the design
  guidance.
- **Emil Kowalski's skill** has no stated license, so it is **never vendored**. It is installed on
  demand (`npx skills add emilkowalski/skill`) and invoked only via `tiraz review`.
- Excluded upstream variants (SPEC §4): `design-taste-frontend-v1`, `gpt-taste`,
  `imagegen-frontend-mobile`.
