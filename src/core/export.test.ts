import { describe, expect, it } from 'vitest';
import type { ExportContext } from './export';
import { ExportError, exportArtifact } from './export';

const base: ExportContext = {
  brief: 'A hero section for a coffee roaster.',
  dials: { variance: 7, motion: 3, density: 6 },
  primary: 'design-taste-frontend',
  overlay: 'minimalist',
  framework: 'astro',
};

/** A minimal stand-in for the vendored DESIGN.md Configuration table. */
const TEMPLATE = [
  '## Configuration — Set Your Style',
  '',
  '| Dial | Level | Description |',
  '|------|-------|-------------|',
  '| **Creativity** | `8` | ... |',
  '| **Density** | `4` | ... |',
  '| **Variance** | `8` | ... |',
  '| **Motion Intent** | `6` | ... |',
  '',
  '## 1. Visual Theme',
  'body...',
].join('\n');

describe('exportArtifact — stitch', () => {
  it('patches the DESIGN.md dials from the genome and prepends the brief', () => {
    const artifact = exportArtifact('stitch', { ...base, designTemplate: TEMPLATE });
    expect(artifact.filename).toBe('DESIGN.md');
    // Dials mapped: Creativity & Variance ← variance(7), Density ← density(6), Motion ← motion(3).
    expect(artifact.content).toContain('| **Creativity** | `7` |');
    expect(artifact.content).toContain('| **Variance** | `7` |');
    expect(artifact.content).toContain('| **Density** | `6` |');
    expect(artifact.content).toContain('| **Motion Intent** | `3` |');
    // Brief + design direction prepended; original body preserved.
    expect(artifact.content).toContain('## Project Brief');
    expect(artifact.content).toContain('A hero section for a coffee roaster.');
    expect(artifact.content).toContain('## 1. Visual Theme');
  });

  it('throws without the DESIGN.md template', () => {
    expect(() => exportArtifact('stitch', base)).toThrow(ExportError);
  });
});

describe('exportArtifact — v0', () => {
  it('emits a Next.js/Tailwind/shadcn prompt carrying the brief and dials', () => {
    const artifact = exportArtifact('v0', { ...base, target: 'component:src/Hero.tsx' });
    expect(artifact.filename).toBe('v0-prompt.md');
    expect(artifact.content).toContain('Next.js + Tailwind CSS + shadcn/ui');
    expect(artifact.content).toContain('A hero section for a coffee roaster.');
    expect(artifact.content).toContain('Variance (distance from conventional): 7/10');
    expect(artifact.content).toContain('component:src/Hero.tsx');
  });
});

describe('exportArtifact — claude-design', () => {
  it('emits a codebase-aware handoff brief', () => {
    const artifact = exportArtifact('claude-design', base);
    expect(artifact.filename).toBe('claude-design-brief.md');
    expect(artifact.content).toContain('Codebase-aware');
    expect(artifact.content).toContain('Framework: astro');
    expect(artifact.content).toContain('A hero section for a coffee roaster.');
  });

  it('handles an empty brief with a placeholder', () => {
    const artifact = exportArtifact('claude-design', { ...base, brief: '   ' });
    expect(artifact.content).toContain('(describe the section to design)');
  });
});
