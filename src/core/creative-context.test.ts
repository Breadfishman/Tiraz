import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REFS_DIR, listReferenceShots, loadCreativeContext } from './creative-context';

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length > 0) await rm(dirs.pop()!, { recursive: true, force: true });
});

describe('loadCreativeContext', () => {
  it('is empty for a bare project', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-cc-'));
    dirs.push(dir);
    expect(await loadCreativeContext(dir)).toEqual({ brand: null, taste: '', references: [] });
  });

  it('loads BRAND.md, TASTE.md, and sorted reference images only', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-cc-'));
    dirs.push(dir);
    await writeFile(path.join(dir, 'BRAND.md'), '## Voice\nPlainspoken.\n', 'utf8');
    await mkdir(path.join(dir, '.tiraz'), { recursive: true });
    await writeFile(
      path.join(dir, '.tiraz', 'TASTE.md'),
      '- liked g0-n1: the roast curve\n',
      'utf8',
    );
    await mkdir(path.join(dir, REFS_DIR), { recursive: true });
    for (const name of ['love-2.png', 'love-1.jpg', 'notes.txt']) {
      await writeFile(path.join(dir, REFS_DIR, name), 'x', 'utf8');
    }
    const ctx = await loadCreativeContext(dir);
    expect(ctx.brand?.sections.voice).toBe('Plainspoken.');
    expect(ctx.taste).toContain('the roast curve');
    expect(ctx.references).toEqual([
      path.join(dir, REFS_DIR, 'love-1.jpg'),
      path.join(dir, REFS_DIR, 'love-2.png'),
    ]);
    expect(await listReferenceShots(path.join(dir, 'missing'))).toEqual([]);
  });
});
