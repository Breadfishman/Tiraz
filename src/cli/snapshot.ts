import type { Command } from 'commander';
import { describeError } from '../core/config';
import { listSnapshots, restoreSnapshot, saveSnapshot } from '../core/snapshot';

/** Register the `snapshot` command group: checkpoint / list / revert the evolution session. */
export function registerSnapshotCommand(program: Command): void {
  const snapshot = program
    .command('snapshot')
    .description('Save, list, and revert to named checkpoints of the run (the manifest state).');

  snapshot
    .command('save <label...>')
    .description('Checkpoint the current state under a label.')
    .action(async (label: string[]) => {
      try {
        const meta = await saveSnapshot(process.cwd(), label.join(' '));
        console.log(`Saved snapshot '${meta.id}' (${String(meta.nodes)} variants).`);
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });

  snapshot
    .command('list')
    .description('List saved snapshots, newest last.')
    .action(async () => {
      try {
        const snaps = await listSnapshots(process.cwd());
        if (snaps.length === 0) {
          console.log('No snapshots yet. Save one with `tiraz snapshot save <label>`.');
          return;
        }
        for (const s of snaps) {
          console.log(
            `${s.id.padEnd(28)} ${s.createdAt}  ${String(s.nodes)} variants · ${String(s.generations)} gen — ${s.label}`,
          );
        }
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });

  snapshot
    .command('restore <id>')
    .description('Revert the run to a snapshot (the current state is auto-saved first).')
    .action(async (id: string) => {
      try {
        const restored = await restoreSnapshot(process.cwd(), id);
        console.log(
          `Restored snapshot '${id}' (${String(Object.keys(restored.nodes).length)} variants). ` +
            `Previous state auto-saved as 'auto-before-restore'.`,
        );
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });
}
