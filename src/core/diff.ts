import type { Genome } from './genome';

export interface GenomeDiffEntry {
  field: string;
  a: string;
  b: string;
}

function show(value: string[] | undefined): string {
  return value === undefined || value.length === 0 ? '—' : value.join(', ');
}

/**
 * Structured diff of the reproducible inputs of two genomes (SPEC §5 `diff`). Returns one entry
 * per field that differs. Outputs (rendered screenshots) are compared visually by the human; this
 * compares the genomes that produced them.
 */
export function diffGenomes(a: Genome, b: Genome): GenomeDiffEntry[] {
  const fields: { field: string; a: string; b: string }[] = [
    { field: 'primary', a: a.primary, b: b.primary },
    { field: 'overlay', a: a.overlay, b: b.overlay },
    { field: 'variance', a: String(a.dials.variance), b: String(b.dials.variance) },
    { field: 'motion', a: String(a.dials.motion), b: String(b.dials.motion) },
    { field: 'density', a: String(a.dials.density), b: String(b.dials.density) },
    { field: 'commands', a: show(a.commands), b: show(b.commands) },
    { field: 'sources', a: show(a.sources), b: show(b.sources) },
    { field: 'parents', a: show(a.parents), b: show(b.parents) },
    { field: 'graft', a: a.graft?.instructions ?? '—', b: b.graft?.instructions ?? '—' },
  ];
  return fields.filter((entry) => entry.a !== entry.b);
}

/** Render the genome diff between two nodes as readable text. */
export function renderGenomeDiff(idA: string, a: Genome, idB: string, b: Genome): string {
  const entries = diffGenomes(a, b);
  if (entries.length === 0) {
    return `${idA} and ${idB} have identical genomes.`;
  }
  const lines = [`diff ${idA} ↔ ${idB}`];
  for (const entry of entries) {
    lines.push(`  ${entry.field.padEnd(10)} ${idA}: ${entry.a}   ${idB}: ${entry.b}`);
  }
  return lines.join('\n');
}
