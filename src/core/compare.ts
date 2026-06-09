/**
 * Variant comparison view (human review — the real bottleneck, SPEC §9). `renderCompareHtml` turns a
 * manifest into a self-contained HTML gallery: every variant's screenshot in one page, grouped by
 * generation, with its genome + fitness, and a click-to-zoom lightbox you can arrow through. Pure —
 * manifest in, HTML string out — so it is fully testable; the CLI just writes the file.
 */

import path from 'node:path';
import type { Manifest, VariantNode } from './manifest';

export interface CompareOptions {
  /** Directory the HTML will be written to — used to make screenshot `src`s relative. */
  outDir: string;
  title?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Relative, forward-slashed href from the HTML's dir to a screenshot (empty if none). */
function screenshotHref(outDir: string, node: VariantNode): string {
  if (node.screenshot === undefined) return '';
  return path.relative(outDir, node.screenshot).split(path.sep).join('/');
}

function fitnessLine(node: VariantNode): string {
  const f = node.fitness;
  if (f === null) return '<span class="muted">unscored</span>';
  const floor = f.lintFloor.passed
    ? '<span class="ok">lint ✓</span>'
    : '<span class="bad">lint ✗</span>';
  return [
    `<span class="metric"><b>${String(f.composite)}</b> composite</span>`,
    floor,
    `<span class="metric">ds ${String(f.dsAdherence.score)}</span>`,
    `<span class="metric">taste #${String(f.taste.rank)}</span>`,
  ].join('');
}

function card(node: VariantNode, href: string, index: number, best: boolean): string {
  const g = node.genome;
  const lineage = g.parents.length === 0 ? 'seed' : `← ${g.parents.join(', ')}`;
  const overlay = g.overlay !== 'none' ? ` + ${g.overlay}` : '';
  const thumb =
    href === ''
      ? '<div class="noshot">not rendered</div>'
      : `<img loading="lazy" src="${escapeHtml(href)}" alt="${escapeHtml(g.id)}" data-index="${String(index)}" data-full="${escapeHtml(href)}" />`;
  return `
    <article class="card${best ? ' best' : ''}">
      <header><span class="id">${escapeHtml(g.id)}</span>${best ? '<span class="star">★ best</span>' : ''}<span class="status s-${escapeHtml(node.status)}">${escapeHtml(node.status)}</span></header>
      <div class="shot">${thumb}</div>
      <div class="meta">
        <div class="row">${escapeHtml(g.primary)}${escapeHtml(overlay)} · <span class="muted">${escapeHtml(lineage)}</span></div>
        <div class="row dials">variance ${String(g.dials.variance)} · motion ${String(g.dials.motion)} · density ${String(g.dials.density)}</div>
        <div class="row fit">${fitnessLine(node)}</div>
        ${g.graft ? `<div class="row muted graft">graft: ${escapeHtml(g.graft.instructions)}</div>` : ''}
      </div>
    </article>`;
}

/** Render the full comparison gallery as a single self-contained HTML document. */
export function renderCompareHtml(manifest: Manifest, opts: CompareOptions): string {
  const title = opts.title ?? `Tiraz — ${manifest.project}`;
  const brief = Object.values(manifest.nodes)[0]?.genome.brief ?? '';

  // Flat ordered list (for the lightbox) + per-generation grouping (for the page).
  const flat: { node: VariantNode; href: string }[] = [];
  const sections: string[] = [];

  manifest.generations.forEach((ids, gen) => {
    const nodes = ids
      .map((id) => manifest.nodes[id])
      .filter((n): n is VariantNode => n !== undefined);
    let bestId: string | null = null;
    let bestComposite = -Infinity;
    for (const n of nodes) {
      if (n.fitness !== null && n.fitness.composite > bestComposite) {
        bestComposite = n.fitness.composite;
        bestId = n.genome.id;
      }
    }
    const cards = nodes
      .map((node) => {
        const href = screenshotHref(opts.outDir, node);
        flat.push({ node, href });
        return card(node, href, flat.length - 1, node.genome.id === bestId);
      })
      .join('');
    sections.push(
      `<section><h2>Generation ${String(gen)} <span class="muted">· ${String(nodes.length)} variant(s)</span></h2><div class="grid">${cards}</div></section>`,
    );
  });

  // Ordered list of full-size srcs for the lightbox arrow navigation.
  const slides = JSON.stringify(flat.map((f) => ({ src: f.href, id: f.node.genome.id })));

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0b0d; color: #e7e7ea; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  header.top { padding: 28px 32px 8px; }
  header.top h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
  header.top .sub { color: #8a8a93; margin-top: 4px; }
  .brief { color: #b7b7c0; max-width: 70ch; margin: 8px 32px 0; }
  section { padding: 8px 32px 24px; }
  section h2 { font-size: 14px; font-weight: 600; color: #b7b7c0; border-bottom: 1px solid #1e1e24; padding-bottom: 8px; }
  .muted { color: #6f6f78; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
  .card { background: #131318; border: 1px solid #20202a; border-radius: 12px; overflow: hidden; }
  .card.best { border-color: #d9a441; box-shadow: 0 0 0 1px #d9a44133; }
  .card header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #20202a; }
  .card .id { font-weight: 700; }
  .card .star { color: #d9a441; font-size: 12px; }
  .card .status { margin-left: auto; font-size: 11px; color: #8a8a93; text-transform: uppercase; letter-spacing: 0.04em; }
  .s-survivor { color: #5bd6a0; } .s-pruned { color: #d66; } .s-promoted { color: #d9a441; }
  .shot { background: #08080a; aspect-ratio: 16/10; display: flex; align-items: center; justify-content: center; }
  .shot img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; display: block; }
  .noshot { color: #55555e; font-size: 12px; }
  .meta { padding: 10px 12px; display: grid; gap: 4px; }
  .meta .dials { color: #9a9aa3; }
  .meta .fit { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; }
  .metric b { color: #fff; } .ok { color: #5bd6a0; } .bad { color: #e06b6b; }
  .graft { font-style: italic; }
  /* lightbox */
  #lb { position: fixed; inset: 0; background: #000d; display: none; align-items: center; justify-content: center; z-index: 10; }
  #lb.open { display: flex; }
  #lb img { max-width: 94vw; max-height: 88vh; object-fit: contain; }
  #lb .cap { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); color: #ccc; font-weight: 600; }
  #lb .nav { position: fixed; top: 50%; transform: translateY(-50%); font-size: 40px; color: #fff8; cursor: pointer; user-select: none; padding: 0 20px; }
  #lb .prev { left: 0; } #lb .next { right: 0; }
  #lb .x { position: fixed; top: 12px; right: 20px; font-size: 26px; color: #fff8; cursor: pointer; }
</style></head>
<body>
  <header class="top">
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">${escapeHtml(manifest.mode)} · ${String(manifest.generations.length)} generation(s) · ${String(Object.keys(manifest.nodes).length)} variant(s)</div>
    ${brief !== '' ? `<p class="brief">${escapeHtml(brief)}</p>` : ''}
  </header>
  ${sections.join('')}
  <div id="lb"><span class="x">✕</span><span class="nav prev">‹</span><span class="cap"></span><img alt="" /><span class="nav next">›</span></div>
  <script>
    const slides = ${slides};
    const lb = document.getElementById('lb'), img = lb.querySelector('img'), cap = lb.querySelector('.cap');
    let cur = 0;
    function show(i) { cur = (i + slides.length) % slides.length; const s = slides[cur]; if (!s.src) return; img.src = s.src; cap.textContent = s.id; lb.classList.add('open'); }
    document.querySelectorAll('.shot img').forEach((el) => el.addEventListener('click', () => show(Number(el.dataset.index))));
    lb.querySelector('.x').addEventListener('click', () => lb.classList.remove('open'));
    lb.querySelector('.next').addEventListener('click', () => show(cur + 1));
    lb.querySelector('.prev').addEventListener('click', () => show(cur - 1));
    document.addEventListener('keydown', (e) => { if (!lb.classList.contains('open')) return; if (e.key === 'Escape') lb.classList.remove('open'); if (e.key === 'ArrowRight') show(cur + 1); if (e.key === 'ArrowLeft') show(cur - 1); });
  </script>
</body></html>`;
}
