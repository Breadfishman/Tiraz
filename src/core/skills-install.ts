import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Skill } from './skills-registry';
import { SKILLS } from './skills-registry';

/** Where resolved skills are written inside a target project / worktree. */
export const SKILLS_SUBDIR = path.join('.claude', 'skills');

export interface InstallOptions {
  /** Directory holding the bundled vendored skill folders (each `<id>/SKILL.md`). */
  sourceDir: string;
  /** Target project / worktree root; skills land in `<worktreeDir>/.claude/skills/`. */
  worktreeDir: string;
}

export class SkillInstallError extends Error {
  override readonly name = 'SkillInstallError';
  readonly skillId: string;

  constructor(message: string, skillId: string) {
    super(message);
    this.skillId = skillId;
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write the resolved active skill set into `<worktreeDir>/.claude/skills/` (SPEC §4, §7).
 *
 * Clean and idempotent: every registry-managed skill directory is removed first, so a re-run
 * after toggling never leaves a stale (now-inactive) skill behind. Directories that don't
 * correspond to a registry skill (the user's own) are left untouched.
 *
 * Throws {@link SkillInstallError} if asked to vendor an install-time-dependency skill, or if
 * a vendored skill's source is missing (i.e. the build-time vendor step hasn't run).
 *
 * @returns the ids actually installed, in order.
 */
export async function installResolvedSkills(
  skills: readonly Skill[],
  opts: InstallOptions,
): Promise<string[]> {
  // Pre-flight: validate every input before touching the destination, so a bad skill
  // (install-time dependency, or a missing vendored source) can never leave
  // `.claude/skills/` half-updated.
  const plan: { id: string; src: string }[] = [];
  for (const skill of skills) {
    if (skill.disposition !== 'vendored') {
      throw new SkillInstallError(
        `Skill "${skill.id}" is an install-time dependency and cannot be vendored. ` +
          `Install it on demand with: npx skills add ${skill.source}`,
        skill.id,
      );
    }

    const src = path.join(opts.sourceDir, skill.id);
    if (!(await pathExists(src))) {
      throw new SkillInstallError(
        `Vendored source for skill "${skill.id}" not found at ${src}. ` +
          `Run the build-time vendor step (SPEC §13/§14).`,
        skill.id,
      );
    }

    plan.push({ id: skill.id, src });
  }

  const destRoot = path.join(opts.worktreeDir, SKILLS_SUBDIR);
  await mkdir(destRoot, { recursive: true });

  // Clean toggle: drop any previously-installed registry skills before writing the active set.
  await Promise.all(
    SKILLS.map((skill) => rm(path.join(destRoot, skill.id), { recursive: true, force: true })),
  );

  for (const { id, src } of plan) {
    await cp(src, path.join(destRoot, id), { recursive: true });
  }

  return plan.map((entry) => entry.id);
}
