import { describe, expect, it } from 'vitest';
import { fingerprint, nearDuplicates, similarity } from './diversity';

const css = (content: string) => [{ path: 'a.css', content }];

describe('fingerprint', () => {
  it('collects fonts, quantised colours, and fired tells', () => {
    const print = fingerprint(
      'g0-n0',
      css(
        'a { font-family: "Inter"; color: #F0E8DC; background: #f1e9dd; border: #abc; x: #12345678 }',
      ),
      { score: 80, findings: [{ id: 'drop-cap', label: '', count: 1, files: [] }] },
    );
    expect(print.fonts).toEqual(['inter']);
    // #f0e8dc and #f1e9dd collapse to one quantised shade.
    expect(print.colors).toHaveLength(3);
    expect(print.tells).toEqual(['drop-cap']);
    expect(fingerprint('x', css('#zzzzzz')).colors).toEqual([]);
  });
});

describe('similarity / nearDuplicates', () => {
  const a = fingerprint('a', css('x { font-family: Inter; color: #111111; background: #f6efe6 }'));
  const b = fingerprint('b', css('y { font-family: Inter; color: #111111; background: #f6efe6 }'));
  const c = fingerprint('c', css('z { font-family: "GT Alpina"; color: #ff3300 }'));

  it('is 1 for identical systems and 0 for disjoint ones', () => {
    expect(similarity(a, b)).toBe(1);
    expect(similarity(a, c)).toBe(0);
    expect(similarity(fingerprint('e', []), fingerprint('f', []))).toBe(0);
  });

  it('reports pairs above the threshold, most similar first', () => {
    expect(nearDuplicates([a, b, c])).toEqual([{ a: 'a', b: 'b', similarity: 1 }]);
    expect(nearDuplicates([a, c], 0.5)).toEqual([]);
  });
});
