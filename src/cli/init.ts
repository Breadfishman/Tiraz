import type { Command } from 'commander';
import { describeError } from '../core/config';
import { scaffoldProject } from '../core/scaffold';

interface InitOptions {
  next?: boolean;
  '3d'?: boolean;
  remotion?: boolean;
}

/** Register the `init` command (SPEC §5/§10): scaffold a greenfield project. */
export function registerInitCommand(program: Command): void {
  program
    .command('init [name]')
    .description('Scaffold a greenfield project (Astro + Tailwind + shadcn) with optional modules.')
    .option('--next', 'Use Next.js instead of Astro (also required for v0 interop)')
    .option('--3d', 'Add the 3D capability module (React Three Fiber + drei + Lenis)')
    .option('--remotion', 'Add the Remotion video module (non-OSI license — see warning)')
    .action(async (name: string | undefined, options: InitOptions) => {
      try {
        const result = await scaffoldProject({
          cwd: process.cwd(),
          framework: options.next === true ? 'next' : 'astro',
          modules: { threeD: options['3d'] === true, remotion: options.remotion === true },
          ...(name !== undefined ? { projectName: name } : {}),
        });

        console.log(`Scaffolded ${result.framework} project at ${result.dir}`);
        if (result.installed.length > 0) {
          console.log(`Installed capability stack: ${result.installed.join(', ')}`);
        }
        for (const warning of result.warnings) {
          console.warn(`\n⚠  ${warning}`);
        }
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
