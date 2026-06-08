import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { loadConfig, updateConfig } from '../core/config';
import { SKILLS, resolveActiveSkills, resolveToggle } from '../core/skills-registry';
import { installResolvedSkills } from '../core/skills-install';

/** Locate the bundled `skills/` directory relative to the running module (src or dist). */
function bundledSkillsDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, 'package.json')) && existsSync(path.join(dir, 'skills'))) {
      return path.join(dir, 'skills');
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback to the built layout: <pkg>/dist/cli.js → <pkg>/skills.
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');
}

/** Register the `tiraz skills` command group (SPEC §5). */
export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('Inspect and toggle the design skill registry.');

  skills
    .command('list')
    .description('Show the registry and which skills are active for the current config.')
    .action(async () => {
      const { config } = await loadConfig();
      const active = resolveActiveSkills(config);
      const activeIds = new Set(active.all.map((s) => s.id));

      for (const skill of SKILLS) {
        const marker = activeIds.has(skill.id) ? '●' : ' ';
        console.log(`${marker} ${skill.id.padEnd(28)} ${skill.role.padEnd(14)} ${skill.license}`);
      }

      const overlayNote = active.overlay ? `, overlay=${active.overlay.id}` : '';
      console.log(`\nActive: primary=${active.primary.id}${overlayNote} (mode=${config.mode})`);
    });

  skills
    .command('use <name>')
    .description('Set the default primary seed or overlay (enforces a single primary).')
    .action(async (name: string) => {
      const target = resolveToggle(name);
      if (!target) {
        const primaries = SKILLS.filter((s) => s.primaryKey !== undefined).map((s) => s.id);
        const overlays = SKILLS.filter((s) => s.overlayKey !== undefined).map((s) => s.id);
        console.error(`Unknown or non-toggleable skill: "${name}".`);
        console.error(`  primaries: ${primaries.join(', ')}`);
        console.error(`  overlays:  ${overlays.join(', ')} (or "none" to clear the overlay)`);
        process.exitCode = 1;
        return;
      }

      const { config } = await updateConfig(process.cwd(), (current) => {
        if (target.kind === 'primary') {
          current.primary = target.value;
        } else {
          current.overlay = target.value;
        }
      });

      if (target.kind === 'primary') {
        console.log(`Default primary seed → ${target.value}`);
        if (config.mode === 'integration') {
          console.log(
            'Note: in integration mode the active primary is forced to ' +
              'redesign-existing-projects; this seed applies to greenfield / diversity.',
          );
        }
      } else {
        console.log(`Overlay → ${target.value}`);
      }
    });

  skills
    .command('sync [worktree]')
    .description('Write the resolved active skill set into <worktree>/.claude/skills/.')
    .action(async (worktree?: string) => {
      const cwd = process.cwd();
      const target = worktree === undefined ? cwd : path.resolve(cwd, worktree);
      const { config } = await loadConfig(cwd);
      const active = resolveActiveSkills(config);

      const installed = await installResolvedSkills(active.all, {
        sourceDir: bundledSkillsDir(),
        worktreeDir: target,
      });

      const dest = path.join(target, '.claude', 'skills');
      console.log(`Installed ${String(installed.length)} skill(s) into ${dest}:`);
      for (const id of installed) {
        console.log(`  • ${id}`);
      }
    });
}
