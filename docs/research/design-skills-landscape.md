# Design-skills landscape (October 2026)

This is the evidence behind `src/core/philosophies.ts` (`CROWD_SKILLS`, `PHILOSOPHIES`) and
`src/core/type-library.ts` (`TYPE_LIBRARY`, `OVERUSED_FONTS`).

**Why it exists.** Tiraz output drifts toward Claude's house style: a serif display headline with
one italic word in the brand colour, tiny tracked uppercase labels, "§ 01" numbering, hairline
rules, cream grounds, and Inter / Instrument Serif / Fraunces / Space Grotesk. The popular design
skills each push agents toward their own recognisable look as well. So a site that follows any one
of them closely is itself identifiable. We keep an **index** of those looks so the direction planner
can steer away from the crowd. It is not a set of instructions to follow.

All facts below were read from the primary source (the skill's own `SKILL.md` / reference files /
README) on 2026-10-12 unless marked otherwise. The "tells" are drawn from what each skill
prescribes or lists as the AI cluster. They are **not** measured from a corpus of real outputs.

---

## 1. Crowd skills

### frontend-design (Anthropic)

- Source: <https://github.com/anthropics/skills/tree/main/skills/frontend-design> (`SKILL.md`)
- Stance: a distinctive identity grounded in the subject, with one memorable focal point and
  everything else quiet. Typefaces are chosen deliberately, and the type scale follows _The
  Elements of Typographic Style_. Fonts are not named in the current version.
- It explicitly names the looks AI-generated design "clusters around". This list is the best
  public description of Claude's house style:
  1. a warm cream ground (near `#F4F1EA`), a high-contrast serif display and a terracotta / clay
     accent (near `#D97757`)
  2. a near-black ground with one acid-green or vermilion accent
  3. a broadsheet layout with hairline rules, zero radius and dense newspaper columns
  4. the SaaS-card kit: identical rounded cards, one radius everywhere, the same soft grey shadow,
     and gradient washes
  5. template chrome: tracked ALL-CAPS eyebrows, `A · B · C` meta strings, `WORD — fragment`
     labels, tinted near-black (`#0B0B0B` / `#111`), mono for small data labels, and `→` on links
- Typographic tells it bans: accenting a single headline word, all-caps labels, unnecessary
  labels, `01 / 02 / 03` markers on content that is not a sequence, and fade-and-slide-up on every
  section.

### Impeccable (pbakaus)

- Source: <https://github.com/pbakaus/impeccable>. Read from `.claude/skills/impeccable/SKILL.md`,
  `reference/craft-floor.md` and `reference/new-work.md`. The README shows about 80k stars.
- Stance: commit to an "own world" for each surface and refuse category defaults. It ships a CLI
  with deterministic detector rules (no LLM needed) and 20+ sub-commands (`critique`, `polish`,
  `bolder`, `quieter`, `typeset`, …).
- What it prescribes, and so what Impeccable-built pages share:
  - colour strategies Restrained / Committed (one saturated hue on 30–60% of the surface) / Full
    palette / Drenched, with bolder strategies favoured on persuasive surfaces
  - tinted neutrals, never pure grey. Secondary text on colour is tinted from the hue.
  - no kicker or eyebrow above a heading, as an absolute ban
  - one authored motion moment with exponential ease-out
  - browser surfaces themed from the palette: selection, caret, scrollbars, focus rings,
    underline offset, tabular numerals
  - it refuses gradient text, decorative glass, coloured `border-left` stripes over 1px, hard
    offset shadows outside true neo-brutalism, mono as a "technical" costume, and nested cards
- Its **reflex-font list** (`new-work.md`): Fraunces, Playfair Display, Cormorant, Lora, Crimson,
  Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, Inter-as-display, DM Sans, DM Serif,
  Outfit, Plus Jakarta Sans, Instrument Sans. The README also says "Don't use overused fonts
  (Arial, Inter, system defaults)".
- Its own calibration list of AI looks: (a) cream + serif display + terracotta/signal red,
  (b) near-black + one neon accent with glowing edges, (c) broadsheet hairlines + italic display
  serif + small tracked mono labels, (d) flat saturated ink + black boxes + hard offset shadows +
  heavy condensed display. It singles out cream, serif and italic accents as the measured default
  rendition for warm or bookish subjects.

### Taste Skill / design-taste-frontend (Leonxlnx)

- Source: <https://github.com/Leonxlnx/taste-skill>. Read from the README and
  `skills/taste-skill/SKILL.md`. The README shows about 95k stars and MIT licence. Sub-skills
  include `high-end-visual-design`, `minimalist-ui`, `industrial-brutalist-ui`, `gpt-taste`,
  `redesign-existing-projects` and `stitch-design-taste`.
- Stance: "anti-slop" premium frontend, tuned by variance / motion / density dials and backed by
  long hard-ban lists.
- What it prescribes:
  - Sans first: Geist, Outfit, Cabinet Grotesk, Satoshi. Pairings are Geist + Geist Mono,
    Satoshi + JetBrains Mono, Cabinet Grotesk + Inter Tight, and GT America + IBM Plex Mono.
  - Inter is discouraged as a default. Fraunces and Instrument Serif are "specifically BANNED as
    defaults". Serif is discouraged unless the brief is editorial or luxury, and then it draws
    from a rotation pool that includes Playfair Display, Cormorant Garamond and EB Garamond.
  - Zinc / Slate / Stone neutrals with exactly one accent (emerald, electric blue, deep rose,
    burnt orange). The cream / brass "premium consumer" palette is banned by hex.
  - bento grids with tinted or imaged cells; asymmetric or split heroes; equal three-card rows
    banned; at most one eyebrow per three sections
  - spring motion (Motion / Framer), transform and opacity only, `min-h-[100dvh]`
  - Phosphor / HugeIcons / Radix / Tabler icons over default Lucide; em dashes completely banned

### apple-design (emilkowalski/skills)

- Source: <https://github.com/emilkowalski/skills> (`skills/apple-design/SKILL.md`). This is
  probably the "Apple design skill" people remember. A third-party listing reports about 30k stars
  for the repo; that figure is not verified on GitHub.
- Stance: Apple's WWDC fluid-interface talks (chiefly _Designing Fluid Interfaces_, 2018)
  translated to the web. Respond on pointer-down, track 1:1, use interruptible velocity-aware
  springs, and add depth through translucent materials.
- What it prescribes: `:active { transform: scale(0.97) }`, critically damped springs by default
  (`bounce: 0`), translucent bars with `backdrop-filter: blur(20px) saturate(180%)`, scroll-edge
  blur masks instead of 1px dividers, and the `system-ui` font with optical sizing as the default.
- Other Apple-HIG skills exist but have less verified traction: raintree-technology/apple-hig-skills
  (14 HIG skills), ebuntario/apple-hig, and dickwu/apple-design-skill (a HIG reviewer).

### UI UX Pro Max (nextlevelbuilder)

- Source: <https://github.com/nextlevelbuilder/ui-ux-pro-max-skill>. Read from the README, `SKILL.md`
  and `data/typography.csv`.
- Stance: a searchable database (79 styles with 50 active, 192 palettes, 74 font pairings) that
  matches a style, palette and type pairing to the product category.
- Tells: a named style preset applied whole (glassmorphism, claymorphism, neumorphism, bento), and
  stock pairings. Its first rows are Playfair Display + Inter, Poppins + Open Sans, Space Grotesk +
  DM Sans, and Inter + Inter. Inter appears in 9 of its 74 pairings. Palettes are looked up by
  industry, so the colour can be predicted from the category alone.

### Also mentioned with traction (not indexed)

Roundups (e.g. <https://composio.dev/blog/top-design-skills>,
<https://superdesign.dev/blog/best-claude-code-skills>) also name Vercel's agent skills / web
interface guidelines and "Hallmark". They were not verified from primary sources, so they are not
in `CROWD_SKILLS`.

---

## 2. Design philosophies (`PHILOSOPHIES`)

These are well-established movements and schools, summarised from standard design-history
knowledge rather than from one source. Each entry in code has 3–5 checkable constraints and a
lazy-AI failure mode. Two of the failure modes come straight from the skills above: the
editorial failure is the frontend-design cluster, and the brutalism failure is Impeccable's
"hard offset shadow costume".

| id                    | Backbone                                               | Lazy-AI failure                                   |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `swiss`               | modular grid, one neo-grotesk, flush-left, no ornament | Helvetica look with no real grid                  |
| `rams`                | function only, neutral greys, one functional accent    | empty white page mistaken for reduction           |
| `apple-hig`           | clarity / deference / depth, springs, materials        | keynote cosplay: blanket blur, fade-ups           |
| `bauhaus`             | primitives, primaries, flat planes                     | primary circles behind a SaaS layout              |
| `brutalism`           | raw structure, harsh contrast, hard edges              | neo-brutal card template with offset shadows      |
| `memphis`             | clashing brights, pattern as surface                   | squiggle stickers on a neutral page               |
| `editorial`           | display + text faces, varied spreads, art direction    | Claude's house style (cream, italic accent, § 01) |
| `japanese-ma`         | negative space, asymmetric balance, muted naturals     | orientalist decoration                            |
| `neo-grotesk-product` | one tight grotesk, real product UI, strict spacing     | purple glow + three cards                         |
| `scandinavian`        | natural tints, humanist sans, calm fields              | beige plus a plant photo                          |
| `art-deco`            | stepped symmetry, condensed caps, metallic accents     | casino-flyer gold gradient                        |
| `constructivism`      | diagonals, red/black/off-white, montage                | slogan pastiche with no tension                   |
| `organic-craft`       | hand-made shapes, material palette, human type         | blob SVGs and a handwriting font                  |
| `retro-futurism`      | chrome / iridescence, techno display, electric palette | generic neon "cyber"                              |
| `information-design`  | data-ink, small multiples, meaning-only colour         | fake sparklines as decoration                     |

---

## 3. Type library

**Overused (`OVERUSED_FONTS`).** This is the union of the reflex and default lists above:

- Impeccable: Fraunces, Playfair, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk/Mono,
  IBM Plex, Inter, DM Sans/Serif, Outfit, Plus Jakarta Sans, Instrument Sans, Arial
- Taste Skill: Inter, Fraunces and Instrument Serif are banned or discouraged. Its own recommended
  defaults (Geist, Satoshi, Cabinet Grotesk, JetBrains Mono, Inter Tight) are also included,
  because they are what Taste-built pages share.
- UI UX Pro Max's most frequent pairings: Poppins, Open Sans, Roboto, EB Garamond
- Task-supplied defaults: Manrope, Georgia, Helvetica and `system-ui`. These were not found named
  in the skills above but are kept as common model reflexes.

**Library (`TYPE_LIBRARY`, 51 families).** There are 8–9 families for each of six roles:
display serif, text serif, grotesk, humanist sans, mono and expressive. Every family was checked to
exist under `ofl/<family>/METADATA.pb` in <https://github.com/google/fonts>, which means SIL OFL 1.1.
"Big Shoulders" uses the merged family name (formerly Big Shoulders Display/Text). The one-line
character notes are editorial judgement.

`typeMenu(seed, count)` rotates each role's list by the seed and interleaves the roles, so a
direction gets a reproducible, varied sample that includes every role once `count >= 6`.

---

## Not verified

- Star counts other than the ones read from a repo README badge or page are snapshots from
  third-party listings.
- Third-party write-ups claim that Impeccable's detector also flags Geist, Mona Sans and Recoleta.
  The primary source could not be fetched (DNS failure), so those claims are not used.
- The tells describe what each skill **prescribes**. No corpus of real outputs was sampled to
  confirm how often they show up in practice.
