import type { Command } from 'commander';
import { resolveCapabilities } from '../core/capabilities';
import { CAPABILITIES } from '../core/capabilities';
import { loadConfig, updateConfig } from '../core/config';
import { ACETERNITY_TOS_WARNING, SOURCES, getSource, resolveSources } from '../core/sources';

/** Register the `tiraz sources` command group (SPEC §12 component menu + §10 capability stack). */
export function registerSourcesCommand(program: Command): void {
  const sources = program
    .command('sources')
    .description('Inspect and toggle component sources (§12) and the capability stack (§10).');

  sources
    .command('list')
    .description('Show the component-source registry + capability stack for the current config.')
    .action(async () => {
      const { config } = await loadConfig();
      const permitted = new Set(resolveSources(config.sources).permittedIds);

      console.log('Component sources (SPEC §12) — registries the agent fetches components from:');
      for (const source of SOURCES) {
        const bundled = source.tier === 'bundled';
        const active = bundled || permitted.has(source.id);
        const marker = active ? '●' : ' ';
        const tier = bundled ? 'tier-1 bundled' : 'tier-2 fetch  ';
        const flag = source.restricted ? ' ⚠ restricted ToS' : '';
        console.log(`  ${marker} ${source.id.padEnd(18)} ${tier}  ${source.license}${flag}`);
      }

      const available = new Set(resolveCapabilities(config.modules).libraries.map((c) => c.id));
      console.log('\nCapability libraries (SPEC §10) — the animation / 3D / video stack:');
      for (const cap of CAPABILITIES) {
        const marker = available.has(cap.id) ? '●' : ' ';
        const gate = cap.module === 'core' ? 'core      ' : `--${cap.module.padEnd(8)}`;
        const flag = cap.restricted ? ' ⚠ commercial license' : '';
        console.log(
          `  ${marker} ${cap.id.padEnd(18)} ${cap.category.padEnd(9)} ${gate} ${cap.license}${flag}`,
        );
      }
      console.log(
        '\n● = available to variants. Sources are fetched sparingly (anti-monoculture, §12); ' +
          'capability modules are toggled via `tiraz init --3d/--remotion` (greenfield).',
      );
    });

  sources
    .command('enable <id>')
    .description('Enable a restricted Tier-2 source (e.g. aceternity); prints its ToS warning.')
    .action(async (id: string) => {
      await toggleRestricted(id, true);
    });

  sources
    .command('disable <id>')
    .description('Disable a restricted Tier-2 source (e.g. aceternity).')
    .action(async (id: string) => {
      await toggleRestricted(id, false);
    });
}

/** Toggle a restricted source on/off. Only restricted sources are gated this way (SPEC §12). */
async function toggleRestricted(id: string, enable: boolean): Promise<void> {
  const source = getSource(id);
  if (!source?.restricted) {
    const restricted = SOURCES.filter((s) => s.restricted).map((s) => s.id);
    console.error(`"${id}" is not a toggleable restricted source.`);
    console.error(`  restricted sources: ${restricted.join(', ') || '(none)'}`);
    process.exitCode = 1;
    return;
  }

  if (id === 'aceternity') {
    // `sources` is a strict object (all keys required), so write the full resolved set with the
    // toggle flipped rather than a partial patch.
    const { config } = await loadConfig(process.cwd());
    await updateConfig(process.cwd(), (current) => {
      current.sources = { ...config.sources, aceternity: enable };
    });
  }

  if (enable) {
    console.log(`Enabled ${source.name}.`);
    if (id === 'aceternity') {
      console.warn(`\n⚠  ${ACETERNITY_TOS_WARNING}`);
    }
  } else {
    console.log(`Disabled ${source.name}.`);
  }
}
