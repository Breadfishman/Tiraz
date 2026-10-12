import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TirazConfigSchema } from './config';
import type { VariantNode } from './manifest';
import { createManifest, upsertNode } from './manifest';
import {
  TASTE_FILE,
  appendTasteNote,
  formatTasteNote,
  readTasteNotes,
  recordTaste,
  tastePath,
  tasteSection,
} from './taste-memory';
import type { TasteNote } from './taste-memory';

const tmpDirs: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tiraz-taste-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const AT = '2026-10-12T09:30:00.000Z';

function note(overrides: Partial<TasteNote> = {}): TasteNote {
  return { verdict: 'liked', nodeId: 'g0-n2', why: 'feels like us', at: AT, ...overrides };
}

function node(id: string, ethos?: string): VariantNode {
  return {
    genome: {
      id,
      parents: [],
      primary: 'impeccable',
      overlay: 'none',
      dials: { variance: 5, motion: 5, density: 5 },
      commands: [],
      seed: 0,
      brief: 'b',
      createdAt: AT,
      ...(ethos !== undefined ? { ethos } : {}),
    },
    generation: 0,
    branch: `tiraz/${id}`,
    worktree: `/tmp/${id}`,
    fitness: null,
    status: 'scored',
  };
}

describe('formatTasteNote', () => {
  it('formats a liked note with its direction', () => {
    expect(
      formatTasteNote(
        note({ direction: 'Ink and paper', why: 'the hand-drawn roast curve feels like us' }),
      ),
    ).toBe('- 2026-10-12 liked g0-n2 ("Ink and paper"): the hand-drawn roast curve feels like us');
  });

  it('omits a missing or blank direction', () => {
    expect(formatTasteNote(note({ verdict: 'rejected', nodeId: 'g1-n0' }))).toBe(
      '- 2026-10-12 rejected g1-n0: feels like us',
    );
    expect(formatTasteNote(note({ direction: '   ' }))).toBe(
      '- 2026-10-12 liked g0-n2: feels like us',
    );
  });

  it('collapses newlines, trims and caps the reason at 300 chars', () => {
    expect(formatTasteNote(note({ why: '  too\n\nbusy\r\n  here ', direction: 'A\nB' }))).toBe(
      '- 2026-10-12 liked g0-n2 ("A B"): too busy here',
    );
    const line = formatTasteNote(note({ why: 'x'.repeat(500) }));
    const why = line.slice(line.indexOf(': ') + 2);
    expect(why.length).toBe(300);
    expect(why.endsWith('…')).toBe(true);
  });
});

describe('appendTasteNote / readTasteNotes', () => {
  it('creates the file with a header and appends lines', async () => {
    const cwd = await tempProject();
    await appendTasteNote(cwd, note({ why: 'first' }));
    await appendTasteNote(cwd, note({ verdict: 'rejected', nodeId: 'g0-n3', why: 'second' }));
    expect(tastePath(cwd)).toBe(path.join(cwd, '.tiraz', TASTE_FILE));
    const raw = await readFile(tastePath(cwd), 'utf8');
    expect(raw.startsWith('# Taste memory')).toBe(true);
    expect(raw).toContain('by hand');
    expect(await readTasteNotes(cwd)).toBe(
      '- 2026-10-12 liked g0-n2: first\n- 2026-10-12 rejected g0-n3: second',
    );
  });

  it('is a no-op for a blank reason', async () => {
    const cwd = await tempProject();
    await appendTasteNote(cwd, note({ why: ' \n ' }));
    expect(await readTasteNotes(cwd)).toBe('');
  });

  it('returns empty when the file is missing', async () => {
    expect(await readTasteNotes(await tempProject())).toBe('');
  });

  it('appends cleanly to a hand-edited file without a trailing newline or header', async () => {
    const cwd = await tempProject();
    await mkdir(path.join(cwd, '.tiraz'), { recursive: true });
    await writeFile(tastePath(cwd), '- my own note', 'utf8');
    await appendTasteNote(cwd, note({ why: 'next' }));
    expect(await readTasteNotes(cwd)).toBe('- my own note\n- 2026-10-12 liked g0-n2: next');
  });

  it('appends to an empty existing file without a header', async () => {
    const cwd = await tempProject();
    await mkdir(path.join(cwd, '.tiraz'), { recursive: true });
    await writeFile(tastePath(cwd), '', 'utf8');
    await appendTasteNote(cwd, note({ why: 'only' }));
    expect(await readFile(tastePath(cwd), 'utf8')).toBe('- 2026-10-12 liked g0-n2: only\n');
  });

  it('keeps the most recent whole lines when over maxChars', async () => {
    const cwd = await tempProject();
    for (const why of ['one', 'two', 'three']) await appendTasteNote(cwd, note({ why }));
    const all = await readTasteNotes(cwd);
    const lines = all.split('\n');
    expect(lines).toHaveLength(3);
    const lastTwo = lines.slice(1).join('\n');
    expect(await readTasteNotes(cwd, lastTwo.length)).toBe(lastTwo);
    expect(await readTasteNotes(cwd, lastTwo.length - 1)).toBe(lines[2]);
    expect(await readTasteNotes(cwd, 3)).toBe('');
  });
});

describe('tasteSection', () => {
  it('returns nothing for empty notes', () => {
    expect(tasteSection('')).toEqual([]);
    expect(tasteSection(' \n ')).toEqual([]);
  });

  it('wraps notes in a prompt section', () => {
    expect(tasteSection('- a\n- b')).toEqual([
      "## The owner's taste so far (from their reviews)",
      'Liked and rejected variants, with their reasons. Lean toward what they liked; never repeat what they rejected.',
      '- a',
      '- b',
      '',
    ]);
  });
});

describe('recordTaste', () => {
  it('records one note per node with the genome ethos as direction', async () => {
    const cwd = await tempProject();
    let m = createManifest('demo', 'greenfield', TirazConfigSchema.parse({}));
    m = upsertNode(m, node('g0-n0', 'Ink and paper'));
    m = upsertNode(m, node('g0-n1'));
    await recordTaste(cwd, m, ['g0-n0', 'g0-n1', 'ghost'], 'rejected', 'too loud', new Date(AT));
    expect(await readTasteNotes(cwd)).toBe(
      [
        '- 2026-10-12 rejected g0-n0 ("Ink and paper"): too loud',
        '- 2026-10-12 rejected g0-n1: too loud',
        '- 2026-10-12 rejected ghost: too loud',
      ].join('\n'),
    );
  });

  it('records nothing without a reason', async () => {
    const cwd = await tempProject();
    const m = createManifest('demo', 'greenfield', TirazConfigSchema.parse({}));
    await recordTaste(cwd, m, ['g0-n0'], 'liked', undefined);
    await recordTaste(cwd, m, ['g0-n0'], 'liked', '  ');
    expect(await readTasteNotes(cwd)).toBe('');
  });

  it('defaults the timestamp to now', async () => {
    const cwd = await tempProject();
    const m = createManifest('demo', 'greenfield', TirazConfigSchema.parse({}));
    await recordTaste(cwd, m, ['g0-n0'], 'liked', 'nice');
    expect(await readTasteNotes(cwd)).toMatch(/^- \d{4}-\d{2}-\d{2} liked g0-n0: nice$/);
  });
});
