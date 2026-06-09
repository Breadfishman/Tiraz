import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Locate the bundled `skills/` directory relative to the running module (src or dist). */
export function bundledSkillsDir(): string {
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
