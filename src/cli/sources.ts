import type { Command } from 'commander';
import { loadConfig, updateConfig } from '../core/config';
import { ACETERNITY_TOS_WARNING, SOURCES, getSource, resolveSources } from '../core/sources';

/** Register the `tiraz sources` command group (SPEC §12). */
export function registerSourcesCommand(program: Command): void {
  const sources = program
    .command('sources')
    .description('Inspect and toggle the component-source menu (Tier-1 bundled / Tier-2 fetch).');

  sources
    .command('list')
    .description('Show the source registry and which are permitted for the current config.')
    .action(async () => {
      const { config } = await loadConfig();
      const permitted = new Set(resolveSources(config.sources).permittedIds);

      for (const source of SOURCES) {
        const bundled = source.tier === 'bundled';
        const active = bundled || permitted.has(source.id);
        const marker = active ? '●' : ' ';
        const tier = bundled ? 'tier-1 bundled' : 'tier-2 fetch  ';
        const flag = source.restricted ? ' ⚠ restricted ToS' : '';
        console.log(`${marker} ${source.id.padEnd(14)} ${tier}  ${source.license}${flag}`);
      }
      console.log('\n● = available to variants. Tier-2 usage is sparing by design (SPEC §12).');
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
