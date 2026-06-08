import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getSkill } from './skills-registry';
import type { Skill } from './skills-registry';
import { SKILLS_SUBDIR, SkillInstallError, installResolvedSkills } from './skills-install';

const tmpDirs: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Build a fake bundled-skills source dir containing the given skill ids. */
async function fakeSource(ids: string[]): Promise<string> {
  const dir = await tempDir('tiraz-src-');
  for (const id of ids) {
    await mkdir(path.join(dir, id), { recursive: true });
    await writeFile(path.join(dir, id, 'SKILL.md'), `# ${id}\n`, 'utf8');
  }
  return dir;
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (!found) throw new Error(`test setup error: unknown skill ${id}`);
  return found;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('installResolvedSkills', () => {
  it('copies the resolved skills into <worktree>/.claude/skills/ and returns their ids', async () => {
    const sourceDir = await fakeSource(['frontend-design', 'impeccable']);
    const worktreeDir = await tempDir('tiraz-wt-');

    const installed = await installResolvedSkills([skill('frontend-design'), skill('impeccable')], {
      sourceDir,
      worktreeDir,
    });

    expect(installed).toEqual(['frontend-design', 'impeccable']);
    const dest = path.join(worktreeDir, SKILLS_SUBDIR);
    expect(await exists(path.join(dest, 'frontend-design', 'SKILL.md'))).toBe(true);
    expect(await exists(path.join(dest, 'impeccable', 'SKILL.md'))).toBe(true);
  });

  it("removes stale registry skills but preserves the user's own skills (clean toggle)", async () => {
    const sourceDir = await fakeSource(['frontend-design']);
    const worktreeDir = await tempDir('tiraz-wt-');
    const dest = path.join(worktreeDir, SKILLS_SUBDIR);

    // A previously-installed registry skill (now inactive) and a user-authored skill.
    await mkdir(path.join(dest, 'design-taste-frontend'), { recursive: true });
    await mkdir(path.join(dest, 'my-custom-skill'), { recursive: true });

    await installResolvedSkills([skill('frontend-design')], { sourceDir, worktreeDir });

    expect(await exists(path.join(dest, 'design-taste-frontend'))).toBe(false);
    expect(await exists(path.join(dest, 'my-custom-skill'))).toBe(true);
    expect(await exists(path.join(dest, 'frontend-design'))).toBe(true);
  });

  it('throws SkillInstallError when a vendored source is missing', async () => {
    const sourceDir = await fakeSource([]); // empty — no skill folders
    const worktreeDir = await tempDir('tiraz-wt-');

    await expect(
      installResolvedSkills([skill('frontend-design')], { sourceDir, worktreeDir }),
    ).rejects.toBeInstanceOf(SkillInstallError);
  });

  it('refuses to vendor an install-time-dependency skill', async () => {
    const sourceDir = await fakeSource(['emilkowalski-skill']);
    const worktreeDir = await tempDir('tiraz-wt-');

    await expect(
      installResolvedSkills([skill('emilkowalski-skill')], { sourceDir, worktreeDir }),
    ).rejects.toThrow(/install-time dependency/);
  });

  it('leaves the destination untouched when pre-flight validation fails', async () => {
    // Only the base skill has a source; the second active skill's source is missing.
    const sourceDir = await fakeSource(['frontend-design']);
    const worktreeDir = await tempDir('tiraz-wt-');
    const dest = path.join(worktreeDir, SKILLS_SUBDIR);

    // A previously-installed registry skill that a naive implementation would delete
    // before discovering the missing source.
    await mkdir(path.join(dest, 'design-taste-frontend'), { recursive: true });

    await expect(
      installResolvedSkills([skill('frontend-design'), skill('impeccable')], {
        sourceDir,
        worktreeDir,
      }),
    ).rejects.toBeInstanceOf(SkillInstallError);

    // No destructive write happened: the stale skill survives, the partial one was never created.
    expect(await exists(path.join(dest, 'design-taste-frontend'))).toBe(true);
    expect(await exists(path.join(dest, 'frontend-design'))).toBe(false);
  });
});
