import type { TirazConfig } from './config';
import type { PriorWeight } from './genome';

/** The functional role a skill plays in the registry (SPEC §4). */
export type SkillRole =
  | 'base'
  | 'primary'
  | 'overlay'
  | 'single-purpose'
  | 'interop'
  | 'imagegen'
  | 'qa';

/** Whether a skill is vendored into Tiraz or installed on demand from upstream. */
export type SkillDisposition = 'vendored' | 'install-time-dep';

/** The `config.primary` values a primary-capable skill can satisfy. */
export type PrimaryKey = 'impeccable' | 'design-taste-frontend' | 'redesign-existing-projects';

/** The `config.overlay` values (excluding `none`) an overlay skill maps to. */
export type OverlayKey = 'minimalist' | 'brutalist' | 'soft';

export interface Skill {
  /** Directory name under both the bundled `skills/` dir and `.claude/skills/`. */
  id: string;
  role: SkillRole;
  /** Upstream repo or URL the skill is vendored / installed from. */
  source: string;
  license: string;
  disposition: SkillDisposition;
  description: string;
  /** Base skill: included in every resolved variant skill set. */
  alwaysOn?: boolean;
  /** Selectable as the active primary via `config.primary` / `skills use`. */
  primaryKey?: PrimaryKey;
  /** Selectable as the active overlay via `config.overlay` / `skills use`. */
  overlayKey?: OverlayKey;
  /** Forced as the active primary whenever `mode === 'integration'` (SPEC §3, §4). */
  integrationPrimary?: boolean;
}

/**
 * The Tiraz skill registry (SPEC §4). Licenses are verified against upstream (SPEC §13).
 * Emil Kowalski's skill is intentionally `install-time-dep` (no stated license — never vendored).
 */
export const SKILLS: readonly Skill[] = [
  {
    id: 'frontend-design',
    role: 'base',
    source: 'github.com/anthropics/skills',
    license: 'Apache-2.0',
    disposition: 'vendored',
    description: 'Base anti-slop design skill — distinctive type, palette, layout, motion.',
    alwaysOn: true,
  },
  {
    id: 'impeccable',
    role: 'primary',
    source: 'github.com/pbakaus/impeccable',
    license: 'Apache-2.0',
    disposition: 'vendored',
    description:
      'Primary A: comprehensive design taste + deterministic detector + command vocabulary.',
    primaryKey: 'impeccable',
  },
  {
    id: 'design-taste-frontend',
    role: 'primary',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Primary B: brief inference, design-system mapping, strict pre-flight checks.',
    primaryKey: 'design-taste-frontend',
  },
  {
    id: 'redesign-existing-projects',
    role: 'single-purpose',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description:
      'Audit and redesign existing UI in place — the forced primary in integration mode.',
    primaryKey: 'redesign-existing-projects',
    integrationPrimary: true,
  },
  {
    id: 'minimalist-ui',
    role: 'overlay',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Overlay: editorial product UI (Notion/Linear), restrained palette.',
    overlayKey: 'minimalist',
  },
  {
    id: 'industrial-brutalist-ui',
    role: 'overlay',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Overlay: hard mechanical language, Swiss type, sharp contrast.',
    overlayKey: 'brutalist',
  },
  {
    id: 'high-end-visual-design',
    role: 'overlay',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Overlay (soft): polished, calm UI with softer contrast and premium fonts.',
    overlayKey: 'soft',
  },
  {
    id: 'full-output-enforcement',
    role: 'single-purpose',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Single-purpose: ensure complete output when the model truncates work.',
  },
  {
    id: 'image-to-code',
    role: 'single-purpose',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Single-purpose: image-first pipeline — generate references, analyze, implement.',
  },
  {
    id: 'stitch-design-taste',
    role: 'interop',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Interop: Google Stitch-compatible rules with optional DESIGN.md export.',
  },
  {
    id: 'imagegen-frontend-web',
    role: 'imagegen',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Imagegen: website comps — hero, landing, multi-section layouts.',
  },
  {
    id: 'brandkit',
    role: 'imagegen',
    source: 'github.com/Leonxlnx/taste-skill',
    license: 'MIT',
    disposition: 'vendored',
    description: 'Imagegen: brand-kit boards — logo, palettes, type, identity.',
  },
  {
    id: 'emilkowalski-skill',
    role: 'qa',
    source: 'emilkowalski/skill',
    license: 'UNLICENSED (no license stated — install-time only)',
    disposition: 'install-time-dep',
    description: 'On-demand motion/polish review (via `tiraz review`). Never vendored (SPEC §13).',
  },
];

/** Look up a skill by its `id`. */
export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

/** Find the single skill matching `pred`, or throw if the registry violates its invariant. */
function requireSkill(pred: (skill: Skill) => boolean, what: string): Skill {
  const skill = SKILLS.find(pred);
  if (!skill) {
    throw new Error(`Tiraz registry invariant violated: ${what}`);
  }
  return skill;
}

/**
 * The taste skills resolved for a single variant. The `prior` weight (SPEC §4) governs how many are
 * applied: `full` = base + primary (+ overlay); `light` drops the opinionated primary (base +
 * overlay); `feral` drops the base too (overlay only, often none) so the agent invents freely. Hence
 * `base` and `primary` are nullable.
 */
export interface ResolvedSkillSet {
  base: Skill | null;
  primary: Skill | null;
  overlay: Skill | null;
  /** Ordered set to install: `[base?, primary?, overlay?]` (may be empty under a feral prior). */
  all: Skill[];
}

/** The slice of config that determines the active skill set, plus the per-variant prior weight. */
export type ResolveInput = Pick<TirazConfig, 'mode' | 'primary' | 'overlay'> & {
  /** Anti-homogenisation lever (SPEC §4); absent → `full`. Integration always resolves to `full`. */
  prior?: PriorWeight;
};

/**
 * Resolve the taste skill set for a variant (SPEC §4). The single-primary invariant is enforced
 * structurally — at most one primary is ever selected. In integration mode the primary is forced to
 * `redesign-existing-projects` and the prior is pinned to `full` so brand keeping is never weakened;
 * otherwise the prior weight controls how much prescriptive taste doctrine applies (see
 * {@link ResolvedSkillSet}). Single-purpose / interop / imagegen / QA skills are invoked per-command.
 */
export function resolveActiveSkills(config: ResolveInput): ResolvedSkillSet {
  // Integration mode keeps the full, brand-respecting stack regardless of any requested prior.
  const prior: PriorWeight = config.mode === 'integration' ? 'full' : (config.prior ?? 'full');

  // `feral` installs no anti-slop base; `light`/`full` keep it.
  const base =
    prior === 'feral'
      ? null
      : requireSkill((s) => s.alwaysOn === true, 'missing always-on base skill');

  // Only `full` installs the opinionated primary taste skill (the main source of one-house-style pull).
  const primary =
    prior !== 'full'
      ? null
      : config.mode === 'integration'
        ? requireSkill((s) => s.integrationPrimary === true, 'missing integration primary')
        : requireSkill(
            (s) => s.primaryKey === config.primary,
            `no primary skill for "${config.primary}"`,
          );

  // The overlay (the variant's chosen aesthetic lane) is kept under every prior — it reinforces the
  // ethos rather than imposing a generic house style.
  const overlay =
    config.overlay === 'none'
      ? null
      : requireSkill(
          (s) => s.overlayKey === config.overlay,
          `no overlay skill for "${config.overlay}"`,
        );

  const all = [base, primary, overlay].filter((s): s is Skill => s !== null);
  return { base, primary, overlay, all };
}

/**
 * The primaries to span in round-0 generation for genetic diversity (SPEC §4, §7).
 * Greenfield spans both toggleable primaries; integration is forced to its single primary.
 */
export function seedPrimaries(mode: TirazConfig['mode']): Skill[] {
  if (mode === 'integration') {
    return [requireSkill((s) => s.integrationPrimary === true, 'missing integration primary')];
  }
  return SKILLS.filter((s) => s.role === 'primary' && s.primaryKey !== undefined);
}

/** What a `skills use <name>` toggle resolves to (or `null` if the name is not toggleable). */
export type ToggleTarget =
  | { kind: 'primary'; value: PrimaryKey }
  | { kind: 'overlay'; value: TirazConfig['overlay'] };

/**
 * Resolve a `skills use <name>` argument to a config mutation. Accepts a primary or overlay
 * skill id, or the literal `none` to clear the overlay. Returns `null` for unknown or
 * non-toggleable names (e.g. single-purpose skills, which are invoked per-command).
 */
export function resolveToggle(name: string): ToggleTarget | null {
  if (name === 'none') {
    return { kind: 'overlay', value: 'none' };
  }
  const skill = getSkill(name);
  if (skill?.primaryKey !== undefined) {
    return { kind: 'primary', value: skill.primaryKey };
  }
  if (skill?.overlayKey !== undefined) {
    return { kind: 'overlay', value: skill.overlayKey };
  }
  return null;
}
