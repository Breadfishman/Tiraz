import { spawn } from 'node:child_process';

/**
 * Best-effort: open a file or URL in the OS default app, trying each launcher until one runs (WSL
 * needs `wslview`/`explorer.exe`, Linux `xdg-open`, macOS `open`). A convenience; never throws.
 */
export function openInBrowser(
  target: string,
  candidates = ['wslview', 'explorer.exe', 'xdg-open', 'open'],
): void {
  const [cmd, ...rest] = candidates;
  if (cmd === undefined) return;
  try {
    const child = spawn(cmd, [target], { stdio: 'ignore', detached: true });
    child.on('error', () => {
      openInBrowser(target, rest);
    });
    child.unref();
  } catch {
    openInBrowser(target, rest);
  }
}
