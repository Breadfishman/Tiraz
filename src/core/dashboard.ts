/**
 * The Tiraz dashboard (centralized review UI) — the cockpit for human-steered evolution.
 * `renderDashboardHtml` turns a manifest + a map of live per-variant render URLs into one page: a
 * lineage-grouped sidebar of every variant and a stage that embeds the *live, interactive* variant
 * via an iframe. With `actionsEnabled`, it drives the search from the UI — heart (favorite), cull a
 * variant or a whole lineage, focus (keep one, prune the rest), directed breed ("what to improve"),
 * combine two variants, and promote — by POSTing to the serving CLI's action API. Pure (manifest +
 * endpoints in, HTML string out), so it is fully testable; the CLI boots the render surface, serves
 * this shell, and runs the actions.
 */

import type { Manifest, VariantNode } from './manifest';
import type { ResourceView } from './resources';
import type { SnapshotMeta } from './snapshot';

export interface DashboardOptions {
  title?: string;
  /** Render the heart / cull / breed / combine / promote controls + wire them to the action API. */
  actionsEnabled?: boolean;
  /** Saved checkpoints, surfaced in a restore dropdown (only with `actionsEnabled`). */
  snapshots?: SnapshotMeta[];
  /** Config + resource links (sources / capability libraries), surfaced in a collapsible panel. */
  resources?: ResourceView;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface VariantView {
  id: string;
  generation: number;
  url: string | null;
  primary: string;
  overlay: string;
  dials: { variance: number; motion: number; density: number };
  parents: string[];
  status: string;
  composite: number | null;
  lintPassed: boolean | null;
  tasteRank: number | null;
  /** Per-lens taste-judge rationale (why the judge ranked it where it did). */
  panel: { lens: string; rationale: string }[];
  best: boolean;
}

function toView(node: VariantNode, url: string | null, best: boolean): VariantView {
  const g = node.genome;
  const f = node.fitness;
  return {
    id: g.id,
    generation: node.generation,
    url,
    primary: g.primary,
    overlay: g.overlay,
    dials: g.dials,
    parents: g.parents,
    status: node.status,
    composite: f?.composite ?? null,
    lintPassed: f?.lintFloor.passed ?? null,
    tasteRank: f?.taste.rank ?? null,
    panel: (f?.taste.panel ?? []).map((p) => ({ lens: p.lens, rationale: p.rationale })),
    best,
  };
}

const STATUS_MARK: Record<string, string> = {
  survivor: ' ♥',
  promoted: ' ⬆',
};

/** The collapsible "Config & resources" panel: source/module toggles + hyperlinked libraries. */
function buildResourcePanel(resources: ResourceView | undefined): string {
  if (resources === undefined) return '';
  const link = (url: string, text: string): string =>
    `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(text)}</a>`;

  const sourceRow = (s: ResourceView['sources'][number]): string =>
    `<label class="rrow${s.enabled ? '' : ' rdim'}">
      <input type="checkbox" class="cfg-toggle" data-kind="source" data-id="${escapeHtml(s.id)}"${s.enabled ? ' checked' : ''} />
      ${link(s.url, s.name)} <span class="rbadge">${escapeHtml(s.tier)}</span>
      <span class="rlic">${escapeHtml(s.license)}</span>
      ${s.restricted ? `<span class="rwarn" title="${escapeHtml(s.warning ?? '')}">⚠ restricted</span>` : ''}
    </label>`;

  const capRow = (c: ResourceView['capabilities'][number]): string =>
    `<div class="rrow${c.enabled ? '' : ' rdim'}">${link(c.url, c.name)}
      <span class="rbadge">${escapeHtml(c.category)}</span><span class="rlic">${escapeHtml(c.license)}</span>
      ${c.restricted ? '<span class="rwarn">⚠</span>' : ''}</div>`;

  const moduleToggle = (id: 'threeD' | 'remotion', label: string, on: boolean): string =>
    `<label class="rrow"><input type="checkbox" class="cfg-toggle" data-kind="module" data-id="${id}"${on ? ' checked' : ''} /> ${label}</label>`;

  const skillOption = (value: string, current: string): string =>
    `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(value)}</option>`;
  const primaryOptions = ['impeccable', 'design-taste-frontend', 'redesign-existing-projects']
    .map((v) => skillOption(v, resources.skills.primary))
    .join('');
  const overlayOptions = ['none', 'minimalist', 'brutalist', 'soft']
    .map((v) => skillOption(v, resources.skills.overlay))
    .join('');
  const diversityOptions = ['conservative', 'diverse', 'alien']
    .map((v) => skillOption(v, resources.diversity))
    .join('');

  const dialSlider = (id: 'variance' | 'motion' | 'density', value: number): string =>
    `<label class="rrow rdial">${id}
      <input type="range" class="cfg-dial" data-dial="${id}" min="1" max="10" step="1" value="${String(value)}" />
      <span class="rval" id="dialval-${id}">${String(value)}</span></label>`;

  const tastePct = Math.round(resources.weights.taste * 100);

  return `<details class="respanel">
    <summary>⚙ Config &amp; resources</summary>
    <div class="respanel-body">
      <p class="rnote">Edits write <code>tiraz.config.json</code> and apply to the next gen / breed / score.</p>
      <div class="rsec"><h4>Design skills</h4>
        <label class="rrow">primary seed
          <select id="cfg-primary" class="cfgsel">${primaryOptions}</select></label>
        <label class="rrow">overlay
          <select id="cfg-overlay" class="cfgsel">${overlayOptions}</select></label>
        <label class="rrow">gen-0 diversity
          <select id="cfg-diversity" class="cfgsel">${diversityOptions}</select></label>
        <p class="rnote rdim" style="grid-column:auto">In integration mode the active primary is forced to <code>redesign-existing-projects</code>; the seed still applies to greenfield / diversity. Diversity spreads the first generation across ethoses + source allocation (<code>alien</code> = widest; <code>conservative</code> = uniform).</p>
      </div>
      <div class="rsec"><h4>Design dials</h4>
        ${dialSlider('variance', resources.dials.variance)}
        ${dialSlider('motion', resources.dials.motion)}
        ${dialSlider('density', resources.dials.density)}
      </div>
      <div class="rsec"><h4>Fitness weighting</h4>
        <label class="rrow rdial">taste ↔ DS
          <input type="range" id="cfg-taste" min="0" max="100" step="1" value="${String(tastePct)}" />
          <span class="rval" id="tasteval">${String(tastePct)}% taste</span></label>
      </div>
      <div class="rsec"><h4>Component sources</h4>
        <label class="rrow"><input type="checkbox" class="cfg-toggle" data-kind="fetchmode" data-id="fetchmode"${resources.fetchMode === 'install' ? ' checked' : ''} /> Fetch real components from sources (install) <span class="rlic">budget ${String(resources.fetchBudget)}/variant</span></label>
        <label class="rrow"><input type="checkbox" class="cfg-toggle" data-kind="twentyfirst" data-id="twentyfirst"${resources.twentyFirst ? ' checked' : ''} /> 21st.dev semantic search (agent-chosen) <span class="rlic">needs TWENTY_FIRST_API_KEY</span></label>
        ${resources.sources.map(sourceRow).join('')}</div>
      <div class="rsec"><h4>Capability libraries</h4>
        ${moduleToggle('threeD', '3D module (Three.js / R3F)', resources.modules.threeD)}
        ${moduleToggle('remotion', 'Video module (Remotion)', resources.modules.remotion)}
        ${resources.capabilities.map(capRow).join('')}
      </div>
    </div>
  </details>`;
}

/**
 * Render the dashboard shell. `endpoints` maps a variant id to its live render URL (e.g. a booted
 * Storybook story iframe); a variant absent from `endpoints` is shown as "not running".
 */
export function renderDashboardHtml(
  manifest: Manifest,
  endpoints: Record<string, string>,
  opts: DashboardOptions = {},
): string {
  const title = opts.title ?? `Tiraz · ${manifest.project}`;
  const actions = opts.actionsEnabled === true;

  const views: VariantView[] = [];
  manifest.generations.forEach((ids) => {
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
    for (const n of nodes) {
      views.push(toView(n, endpoints[n.genome.id] ?? null, n.genome.id === bestId));
    }
  });

  const first = views.find((v) => v.url !== null)?.id ?? '';

  // Sidebar grouped by generation (the lineage view): a header per generation, each item annotated
  // with its parents so chains are legible and a whole lineage can be culled deliberately.
  let lastGen = -1;
  const sidebar = views
    .map((v) => {
      const header =
        v.generation !== lastGen
          ? ((lastGen = v.generation),
            `<div class="genhdr">generation ${String(v.generation)}</div>`)
          : '';
      const fit =
        v.composite !== null
          ? `<span class="badge">${String(v.composite)}</span>`
          : '<span class="badge muted">—</span>';
      const disabled = v.url === null ? ' disabled' : '';
      const mark = STATUS_MARK[v.status] ?? '';
      const lineage = v.parents.length > 0 ? ` · ← ${escapeHtml(v.parents.join(', '))}` : '';
      return `${header}<button class="item s-${escapeHtml(v.status)}${v.best ? ' best' : ''}" data-id="${escapeHtml(v.id)}"${disabled}>
        <span class="iid">${escapeHtml(v.id)}${v.best ? ' ★' : ''}${mark}</span>${fit}
        <span class="isub">${escapeHtml(v.primary)}${lineage}${v.url === null ? ' · not running' : ''}</span>
      </button>`;
    })
    .join('');

  const data = JSON.stringify(Object.fromEntries(views.map((v) => [v.id, v])));

  // The action buttons collapse into a single "Actions ▾" dropdown so the top stays uncluttered.
  const actionsMenu = actions
    ? `<details class="actmenu">
      <summary class="vbtn">⚙ Actions ▾</summary>
      <div class="actions" id="actions">
      <div class="arow">
        <button class="abtn" id="act-heart" title="Favorite this variant (keep it; no siblings pruned)">♥ Heart</button>
        <button class="abtn" id="act-cull" title="Cull this variant (mark pruned)">✕ Cull</button>
        <button class="abtn" id="act-cull-lineage" title="Cull this variant and its whole descendant chain">⊘ Cull lineage</button>
        <button class="abtn" id="act-focus" title="Keep only this variant; prune the rest of its generation">◎ Focus</button>
        <button class="abtn danger" id="act-promote" title="Greenfield: merge to base. Integration: open a PR.">⬆ Promote</button>
      </div>
      <div class="arow">
        <span class="alabel">Breed</span>
        <input id="act-directive" class="atext" type="text" placeholder="what to improve (optional)" />
        <label class="factor">×<input id="act-factor" type="number" min="1" max="9" value="1" /></label>
        <button class="abtn" id="act-breed" title="Refine this variant into a new generation (runs the agent — minutes)">Breed</button>
      </div>
      <div class="arow">
        <button class="abtn" id="act-combine-start" title="Combine this variant with another">⧉ Combine with…</button>
        <span class="combine hidden" id="combine-panel">
          <span id="combine-ab" class="alabel"></span>
          <input id="act-graft" class="atext" type="text" placeholder="what to take from each / what to discard" />
          <button class="abtn" id="act-combine-go">Combine</button>
          <button class="abtn" id="act-combine-cancel">Cancel</button>
        </span>
      </div>
      <div class="arow">
        <button class="abtn" id="act-score" title="Score the latest generation (lint floor + DS-adherence + taste judge — minutes)">⚖ Score latest</button>
        <button class="abtn" id="act-snapshot" title="Save a checkpoint of the whole population you can revert to">📸 Snapshot</button>
        <select id="act-snap-select" class="snapsel">
          <option value="">— restore a snapshot —</option>
          ${(opts.snapshots ?? [])
            .map(
              (s) =>
                `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)} · ${String(s.nodes)}v</option>`,
            )
            .join('')}
        </select>
        <button class="abtn" id="act-restore">Restore</button>
      </div>
      </div>
    </details>`
    : '';

  // Persistent view toolbar: compare + fullscreen (work in read-only too) + the actions dropdown.
  const topTools = `<div class="toptools">
    <button class="vbtn" id="cmp-toggle" title="Compare variants side by side — click variants to add/remove (Esc exits)">⊞ Compare</button>
    <button class="vbtn" id="fsbtn" title="Fullscreen the preview (press f; Esc to exit)">⛶ Fullscreen</button>
    ${actionsMenu}
    <span class="toast" id="toast"></span>
  </div>`;

  const resourcePanel = buildResourcePanel(actions ? opts.resources : undefined);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: grid; grid-template-columns: 280px 1fr; background: #0b0b0d; color: #e7e7ea;
         font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
  aside { border-right: 1px solid #1e1e24; overflow-y: auto; display: flex; flex-direction: column; }
  .brand { padding: 16px; font-weight: 800; letter-spacing: -0.02em; font-size: 16px; border-bottom: 1px solid #1e1e24; }
  .brand small { display:block; font-weight: 400; color: #6f6f78; letter-spacing: 0; }
  .genhdr { padding: 8px 16px 4px; color: #6f6f78; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .item { all: unset; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px;
          padding: 10px 16px; border-bottom: 1px solid #16161c; }
  .item:hover { background: #15151b; }
  .item.active { background: #1b1b22; box-shadow: inset 3px 0 0 #d9a441; }
  .item.best .iid { color: #d9a441; }
  .item.s-survivor .iid { color: #5bd6a0; }
  .item.s-promoted .iid { color: #7aa2ff; }
  .item.s-pruned { opacity: 0.4; }
  .item.s-pruned .iid { text-decoration: line-through; }
  .item.combine-b { box-shadow: inset 3px 0 0 #7aa2ff; }
  .item[disabled] { opacity: 0.4; cursor: not-allowed; }
  .iid { font-weight: 700; }
  .isub { grid-column: 1 / -1; color: #8a8a93; }
  .badge { background: #20202a; border-radius: 6px; padding: 1px 7px; font-weight: 700; font-size: 11px; align-self: start; }
  .badge.muted { color: #6f6f78; font-weight: 400; }
  main { display: flex; flex-direction: column; min-width: 0; }
  /* Collapsible info stack (variant line + judge lenses + Config) — collapsed by default so the
     preview / compare grid gets the full height. */
  .infopanel { border-bottom: 1px solid #1e1e24; background: #0c0c10; }
  .infopanel > summary { cursor: pointer; padding: 8px 18px; color: #c7c7cf; font-size: 13px;
                         user-select: none; list-style: none; display: flex; gap: 10px; align-items: baseline; }
  .infopanel > summary::-webkit-details-marker { display: none; }
  .infopanel > summary::before { content: '▸ '; color: #6f6f78; }
  .infopanel[open] > summary::before { content: '▾ '; }
  .infobody > .respanel, .infobody > .detail { border-bottom: 0; }
  .bar { display: flex; gap: 14px; align-items: baseline; padding: 12px 18px; border-bottom: 1px solid #1e1e24; flex-wrap: wrap; }
  .bar .t { font-weight: 700; } .muted { color: #6f6f78; } .ok { color: #5bd6a0; } .bad { color: #e06b6b; }
  .actions { display: flex; flex-direction: column; gap: 8px; padding: 10px 18px; border-bottom: 1px solid #1e1e24; background: #0e0e12; }
  .arow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .alabel { color: #8a8a93; font-size: 12px; }
  .abtn { all: unset; cursor: pointer; background: #20202a; color: #e7e7ea; border-radius: 7px; padding: 6px 12px;
          font-weight: 600; font-size: 12px; }
  .abtn:hover { background: #2a2a36; } .abtn.danger { background: #3a1f22; color: #f0a0a0; }
  .abtn.danger:hover { background: #4a2629; } .abtn[disabled] { opacity: 0.4; cursor: not-allowed; }
  .atext { flex: 1; min-width: 180px; background: #16161c; color: #e7e7ea; border: 1px solid #2a2a36;
           border-radius: 6px; padding: 6px 9px; font: inherit; }
  .factor { color: #8a8a93; font-size: 12px; } .factor input { width: 38px; background: #16161c; color: #e7e7ea;
            border: 1px solid #2a2a36; border-radius: 5px; padding: 3px 5px; }
  .combine { display: flex; gap: 10px; align-items: center; flex: 1; } .combine.hidden { display: none; }
  .snapsel { background: #16161c; color: #e7e7ea; border: 1px solid #2a2a36; border-radius: 6px; padding: 5px 8px; font: inherit; min-width: 180px; }
  .toast { font-size: 12px; min-height: 1em; } .toast.ok { color: #5bd6a0; } .toast.bad { color: #e06b6b; } .toast.work { color: #d9a441; }
  .respanel { border-bottom: 1px solid #1e1e24; background: #0c0c10; font-size: 12px; }
  .respanel > summary { cursor: pointer; padding: 8px 18px; color: #c7c7cf; font-weight: 600; user-select: none; }
  .respanel-body { padding: 4px 18px 14px; max-height: 320px; overflow-y: auto; display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
  .rnote { grid-column: 1 / -1; margin: 0; color: #6f6f78; }
  .rsec h4 { margin: 0 0 6px; color: #8a8a93; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  .rsec:nth-of-type(3) { grid-column: 1 / -1; }
  .rrow { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; color: #c7c7cf; }
  .rrow.rdim { opacity: 0.55; } .rrow a { color: #8ab4ff; text-decoration: none; } .rrow a:hover { text-decoration: underline; }
  .cfgsel { background: #16161c; color: #e7e7ea; border: 1px solid #2a2a36; border-radius: 6px; padding: 4px 7px; font: inherit; }
  .rdial { gap: 10px; } .rdial input[type=range] { flex: 1; min-width: 90px; }
  .rval { color: #9a9aa3; font-variant-numeric: tabular-nums; min-width: 56px; text-align: right; }
  .rbadge { background: #20202a; border-radius: 5px; padding: 0 6px; font-size: 10px; color: #9a9aa3; }
  .rlic { color: #6f6f78; font-size: 11px; } .rwarn { color: #e0a96b; font-size: 11px; }
  .detail { padding: 8px 18px; border-bottom: 1px solid #1e1e24; background: #0c0c10; color: #9a9aa3;
            font-size: 12px; max-height: 132px; overflow-y: auto; }
  .detail:empty { display: none; }
  .detail b { color: #c7c7cf; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; margin-right: 6px; }
  .detail .lens { margin-bottom: 4px; }
  .stage { flex: 1; min-height: 0; background: #fff; position: relative; }
  iframe { width: 100%; height: 100%; border: 0; display: block; }
  .stage:fullscreen { background: #fff; }
  /* Persistent view toolbar + the collapsible Actions dropdown. */
  .toptools { display: flex; gap: 8px; align-items: center; padding: 8px 18px;
              border-bottom: 1px solid #1e1e24; background: #0e0e12; flex-wrap: wrap; }
  .vbtn { background: #16161c; color: #e7e7ea; border: 1px solid #2a2a36; border-radius: 6px;
          padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer; list-style: none; }
  .vbtn::-webkit-details-marker { display: none; }
  .vbtn:hover { border-color: #3a3a48; } .vbtn.on { background: #2a2a3a; border-color: #5a5ad0; }
  .actmenu { position: relative; }
  .actmenu > .actions { position: absolute; top: 100%; left: 0; z-index: 20; margin-top: 6px;
                        border: 1px solid #2a2a36; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); min-width: 360px; }
  /* Side-by-side compare grid (each selected variant in its own pane). */
  .compare { display: none; width: 100%; height: 100%; gap: 1px; background: #1e1e24; }
  .compare.on { display: grid; }
  .cmpcell { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #fff; }
  .cmphdr { font-size: 11px; padding: 4px 8px; background: #0e0e12; color: #c7c7cf; border-bottom: 1px solid #1e1e24;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cmpcell iframe { flex: 1; }
  .item.cmpsel { outline: 2px solid #5a5ad0; outline-offset: -2px; }
  .empty { color: #6f6f78; padding: 40px; }
  kbd { background: #20202a; border-radius: 4px; padding: 1px 5px; }
</style></head>
<body>
  <aside>
    <div class="brand">Tiraz <small>${escapeHtml(manifest.project)} · ${escapeHtml(manifest.mode)}</small></div>
    ${sidebar || '<div class="empty">No variants yet — run <kbd>tiraz gen</kbd>.</div>'}
  </aside>
  <main>
    ${topTools}
    <details class="infopanel" id="infopanel">
      <summary id="infosum"><span class="muted">Select a variant →</span></summary>
      <div class="infobody">
        <div class="bar" id="bar"><span class="muted">Select a variant to view it live →</span></div>
        <div class="detail" id="detail"></div>
        ${resourcePanel}
      </div>
    </details>
    <div class="stage" id="stagewrap">
      <iframe id="stage" title="variant" src=""></iframe>
      <div class="compare" id="comparewrap"></div>
      <div class="empty" id="empty" style="display:none">This variant has no live render.</div></div>
  </main>
  <script>
    const data = ${data};
    const actionsEnabled = ${String(actions)};
    const order = Object.keys(data);
    const frame = document.getElementById('stage'), bar = document.getElementById('bar'),
          empty = document.getElementById('empty'), detail = document.getElementById('detail'),
          cmpwrap = document.getElementById('comparewrap'), cmpToggle = document.getElementById('cmp-toggle');
    let cur = null;
    let compareMode = false;
    const compareSel = []; // ids picked for side-by-side (selection order; capped)
    const COMPARE_MAX = 4;
    function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
    function select(id) {
      const v = data[id]; if (!v) return;
      document.querySelectorAll('.item').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
      cur = id;
      cmpwrap.classList.remove('on'); cmpwrap.innerHTML = ''; // leave any compare grid
      if (v.url) { frame.style.display = 'block'; empty.style.display = 'none'; frame.src = v.url; }
      else { frame.style.display = 'none'; empty.style.display = 'block'; }
      const fit = v.composite != null
        ? '<span>composite <b>' + v.composite + '</b></span> <span class="' + (v.lintPassed ? 'ok' : 'bad') + '">lint ' + (v.lintPassed ? '✓' : '✗') + '</span> <span class="muted">taste #' + v.tasteRank + '</span>'
        : '<span class="muted">unscored</span>';
      bar.innerHTML = '<span class="t">' + id + (v.best ? ' ★' : '') + '</span>'
        + '<span class="muted">' + v.primary + (v.overlay !== 'none' ? ' + ' + v.overlay : '')
        + ' · ' + (v.parents.length ? '← ' + v.parents.join(', ') : 'seed') + '</span>'
        + '<span class="muted">variance ' + v.dials.variance + ' · motion ' + v.dials.motion + ' · density ' + v.dials.density + '</span>'
        + fit + '<span class="muted">status ' + v.status + '</span>';
      // Concise summary so the (collapsed) info panel still shows what's selected at a glance.
      document.getElementById('infosum').innerHTML =
        '<span class="t">' + id + (v.best ? ' ★' : '') + '</span>' + fit
        + '<span class="muted">status ' + v.status + '</span>';
      detail.innerHTML = (v.panel && v.panel.length)
        ? '<div class="lens"><b>judge</b> why this ranked where it did:</div>'
          + v.panel.map((p) => '<div class="lens"><b>' + esc(p.lens) + '</b>' + esc(p.rationale) + '</div>').join('')
        : '';
      if (actionsEnabled) syncActions();
    }
    function onItemClick(id) {
      if (actionsEnabled && window.__combining && id !== window.__combineA) { window.__pickB(id); return; }
      if (compareMode) { toggleCompare(id); return; }
      select(id);
    }
    document.querySelectorAll('.item:not([disabled])').forEach((b) => b.addEventListener('click', () => onItemClick(b.dataset.id)));

    // --- side-by-side compare: pick variants, render them in a grid of iframes ---
    function toggleCompare(id) {
      const i = compareSel.indexOf(id);
      if (i >= 0) compareSel.splice(i, 1);
      else if (compareSel.length < COMPARE_MAX) compareSel.push(id);
      renderCompare();
    }
    function renderCompare() {
      document.querySelectorAll('.item').forEach((b) => b.classList.toggle('cmpsel', compareSel.includes(b.dataset.id)));
      document.getElementById('infosum').innerHTML = '<span class="t">Comparing</span> <span class="muted">'
        + (compareSel.length ? compareSel.join(' · ') : 'pick variants from the sidebar') + '</span>';
      if (!compareSel.length) {
        cmpwrap.classList.remove('on'); cmpwrap.innerHTML = '';
        frame.style.display = 'none'; empty.style.display = 'block';
        empty.textContent = 'Compare mode — click variants in the sidebar to view them side by side.';
        return;
      }
      frame.style.display = 'none'; empty.style.display = 'none';
      const cols = compareSel.length === 1 ? 1 : compareSel.length <= 4 ? 2 : 3;
      cmpwrap.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
      cmpwrap.classList.add('on');
      cmpwrap.innerHTML = compareSel.map((id) => {
        const v = data[id];
        const hdr = '<div class="cmphdr">' + esc(id) + (v && v.best ? ' ★' : '')
          + (v && v.composite != null ? ' · ' + v.composite : '') + '</div>';
        const body = v && v.url
          ? '<iframe src="' + v.url + '"></iframe>'
          : '<div class="empty">no live render</div>';
        return '<div class="cmpcell">' + hdr + body + '</div>';
      }).join('');
    }
    function setCompareMode(on) {
      compareMode = on;
      cmpToggle.classList.toggle('on', on);
      cmpToggle.textContent = on ? '⊞ Comparing… (Esc to exit)' : '⊞ Compare';
      if (on) {
        compareSel.length = 0;
        if (cur) compareSel.push(cur); // seed with the current variant
        renderCompare();
      } else {
        compareSel.length = 0;
        document.querySelectorAll('.item').forEach((b) => b.classList.remove('cmpsel'));
        empty.textContent = 'This variant has no live render.';
        if (cur) select(cur); else { cmpwrap.classList.remove('on'); cmpwrap.innerHTML = ''; }
      }
    }
    cmpToggle.addEventListener('click', () => setCompareMode(!compareMode));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && compareMode) { setCompareMode(false); return; }
      if (compareMode) return; // arrows don't navigate while comparing
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const live = order.filter((id) => data[id].url); if (!live.length) return;
      const i = live.indexOf(cur); const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + live.length) % live.length;
      select(live[n]); e.preventDefault();
    });
    // Fullscreen the live preview (a view feature — available with or without actions).
    const stageWrap = document.getElementById('stagewrap'), fsbtn = document.getElementById('fsbtn');
    function openCurrentInTab() { if (cur && data[cur] && data[cur].url) window.open(data[cur].url, '_blank'); }
    function toggleFullscreen() {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
        return;
      }
      const req = stageWrap.requestFullscreen || stageWrap.webkitRequestFullscreen;
      if (req) { try { Promise.resolve(req.call(stageWrap)).catch(openCurrentInTab); } catch (e) { openCurrentInTab(); } }
      else { openCurrentInTab(); }
    }
    fsbtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      toggleFullscreen(); e.preventDefault();
    });
    if (actionsEnabled) wireActions();
    if ('${first}') select('${first}');

    function wireActions() {
      const toast = document.getElementById('toast');
      const directiveEl = document.getElementById('act-directive');
      const factorEl = document.getElementById('act-factor');
      const graftEl = document.getElementById('act-graft');
      const combinePanel = document.getElementById('combine-panel');
      const combineAb = document.getElementById('combine-ab');
      const btns = ['act-heart','act-cull','act-cull-lineage','act-focus','act-promote','act-breed','act-combine-start','act-combine-go','act-combine-cancel']
        .reduce((m, id) => { m[id] = document.getElementById(id); return m; }, {});
      window.__busy = false; window.__combining = false; window.__combineA = null;
      function setToast(msg, kind) { toast.textContent = msg; toast.className = 'toast ' + (kind || ''); }
      window.__setToast = setToast;
      function setBusy(on) { window.__busy = on; sync(); }
      async function post(path, body) {
        const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.error || (r.status + ' ' + r.statusText));
        return json;
      }
      async function quick(label, path, body) {
        if (!cur || window.__busy) return;
        setBusy(true); setToast(label + ' ' + cur + '…', 'work');
        try { await post(path, body); location.reload(); }
        catch (e) { setToast(label + ' failed: ' + e.message, 'bad'); setBusy(false); }
      }
      btns['act-heart'].addEventListener('click', () => quick('Hearting', '/api/favorite', { ids: [cur] }));
      btns['act-cull'].addEventListener('click', () => quick('Culling', '/api/cull', { ids: [cur] }));
      btns['act-cull-lineage'].addEventListener('click', () => {
        if (!cur) return;
        if (!confirm('Cull ' + cur + ' AND its whole descendant lineage?')) return;
        quick('Culling lineage', '/api/cull', { ids: [cur], cascade: true });
      });
      btns['act-focus'].addEventListener('click', () => {
        if (!cur) return;
        if (!confirm('Keep only ' + cur + ' and prune the rest of its generation?')) return;
        quick('Focusing', '/api/select', { ids: [cur] });
      });
      btns['act-promote'].addEventListener('click', async () => {
        if (!cur || window.__busy) return;
        if (!confirm('Promote ' + cur + '? Greenfield merges to base; integration opens a PR.')) return;
        setBusy(true); setToast('Promoting ' + cur + '…', 'work');
        try { const res = await post('/api/promote', { id: cur }); setToast(res.message || 'Promoted', 'ok'); setTimeout(() => location.reload(), 1200); }
        catch (e) { setToast('Promote failed: ' + e.message, 'bad'); setBusy(false); }
      });
      btns['act-breed'].addEventListener('click', async () => {
        if (!cur || window.__busy) return;
        const factor = Math.max(1, parseInt(factorEl.value, 10) || 1);
        const directive = directiveEl.value.trim();
        setBusy(true); setToast('Breeding ' + cur + ' ×' + factor + (directive ? ' (' + directive + ')' : '') + '…', 'work');
        try { const { jobId } = await post('/api/breed', { ids: [cur], factor, directive }); pollJob(jobId); }
        catch (e) { setToast('Breed failed: ' + e.message, 'bad'); setBusy(false); }
      });
      // --- combine mode ---
      function showCombine() {
        const b = window.__combineB;
        combinePanel.classList.toggle('hidden', !window.__combining);
        combineAb.textContent = window.__combining ? ('A=' + window.__combineA + (b ? '  +  B=' + b : '  + pick B in the sidebar')) : '';
      }
      window.__pickB = function (id) { window.__combineB = id; document.querySelectorAll('.item').forEach((el) => el.classList.toggle('combine-b', el.dataset.id === id)); showCombine(); };
      function cancelCombine() {
        window.__combining = false; window.__combineA = null; window.__combineB = null;
        document.querySelectorAll('.item').forEach((el) => el.classList.remove('combine-b'));
        showCombine(); sync();
      }
      btns['act-combine-start'].addEventListener('click', () => {
        if (!cur) return;
        window.__combining = true; window.__combineA = cur; window.__combineB = null;
        showCombine(); setToast('Pick a second variant in the sidebar, then describe the graft.', 'work'); sync();
      });
      btns['act-combine-cancel'].addEventListener('click', () => { cancelCombine(); setToast('', ''); });
      btns['act-combine-go'].addEventListener('click', async () => {
        if (!window.__combineA || !window.__combineB) { setToast('Pick a second variant first.', 'bad'); return; }
        const instructions = graftEl.value.trim();
        if (!instructions) { setToast('Describe what to take from each / discard.', 'bad'); return; }
        setBusy(true); setToast('Combining ' + window.__combineA + ' + ' + window.__combineB + '…', 'work');
        try { const { jobId } = await post('/api/recombine', { parentA: window.__combineA, parentB: window.__combineB, instructions }); pollJob(jobId); }
        catch (e) { setToast('Combine failed: ' + e.message, 'bad'); setBusy(false); }
      });
      // --- snapshots (population-wide; independent of the selected variant) ---
      const snapBtn = document.getElementById('act-snapshot');
      const snapSel = document.getElementById('act-snap-select');
      const restoreBtn = document.getElementById('act-restore');
      snapBtn.addEventListener('click', async () => {
        if (window.__busy) return;
        const label = prompt('Snapshot label (e.g. "liked g0-n2 + g0-n3"):');
        if (label === null) return;
        setBusy(true); setToast('Saving snapshot…', 'work');
        try { await post('/api/snapshot', { label }); location.reload(); }
        catch (e) { setToast('Snapshot failed: ' + e.message, 'bad'); setBusy(false); }
      });
      restoreBtn.addEventListener('click', async () => {
        if (window.__busy) return;
        const id = snapSel.value;
        if (!id) { setToast('Pick a snapshot to restore.', 'bad'); return; }
        if (!confirm('Revert the whole run to "' + id + '"? (Current state is auto-saved first.)')) return;
        setBusy(true); setToast('Restoring ' + id + '…', 'work');
        try { await post('/api/snapshot-restore', { id }); location.reload(); }
        catch (e) { setToast('Restore failed: ' + e.message, 'bad'); setBusy(false); }
      });
      // --- score the latest generation (long agent job; polled like breed/recombine) ---
      const scoreBtn = document.getElementById('act-score');
      scoreBtn.addEventListener('click', async () => {
        if (window.__busy) return;
        setBusy(true); setToast('Scoring the latest generation…', 'work');
        try { const { jobId } = await post('/api/score', {}); pollJob(jobId); }
        catch (e) { setToast('Score failed: ' + e.message, 'bad'); setBusy(false); }
      });
      // --- config & resource toggles (write tiraz.config.json; apply to next gen/breed/score) ---
      document.querySelectorAll('.cfg-toggle').forEach((cb) => {
        cb.addEventListener('change', async () => {
          if (window.__busy) { cb.checked = !cb.checked; return; }
          setBusy(true); setToast('Updating config…', 'work');
          try { await post('/api/config', { kind: cb.dataset.kind, id: cb.dataset.id, enabled: cb.checked }); location.reload(); }
          catch (e) { cb.checked = !cb.checked; setToast('Config update failed: ' + e.message, 'bad'); setBusy(false); }
        });
      });
      // --- skill selects (primary seed + overlay) ---
      function wireSkill(elId, kind) {
        const sel = document.getElementById(elId);
        if (!sel) return;
        let prev = sel.value;
        sel.addEventListener('change', async () => {
          if (window.__busy) { sel.value = prev; return; }
          setBusy(true); setToast('Updating skill…', 'work');
          try { await post('/api/config', { kind, id: sel.value, enabled: true }); location.reload(); }
          catch (e) { sel.value = prev; setToast('Skill update failed: ' + e.message, 'bad'); setBusy(false); }
        });
      }
      wireSkill('cfg-primary', 'primary');
      wireSkill('cfg-overlay', 'overlay');
      wireSkill('cfg-diversity', 'diversity');
      // --- design dials (write on release; live-update the readout while dragging) ---
      document.querySelectorAll('.cfg-dial').forEach((sl) => {
        const out = document.getElementById('dialval-' + sl.dataset.dial);
        sl.addEventListener('input', () => { if (out) out.textContent = sl.value; });
        sl.addEventListener('change', async () => {
          if (window.__busy) return;
          setBusy(true); setToast('Updating dials…', 'work');
          try { await post('/api/config', { kind: 'dial', id: sl.dataset.dial, value: parseInt(sl.value, 10) }); location.reload(); }
          catch (e) { setToast('Dial update failed: ' + e.message, 'bad'); setBusy(false); }
        });
      });
      // --- fitness taste↔DS weight ---
      const tasteSl = document.getElementById('cfg-taste');
      const tasteOut = document.getElementById('tasteval');
      if (tasteSl) {
        tasteSl.addEventListener('input', () => { if (tasteOut) tasteOut.textContent = tasteSl.value + '% taste'; });
        tasteSl.addEventListener('change', async () => {
          if (window.__busy) return;
          setBusy(true); setToast('Updating fitness weights…', 'work');
          try { await post('/api/config', { kind: 'weight', id: 'taste', value: parseInt(tasteSl.value, 10) }); location.reload(); }
          catch (e) { setToast('Weight update failed: ' + e.message, 'bad'); setBusy(false); }
        });
      }
      function sync() {
        const v = cur ? data[cur] : null;
        const disabled = window.__busy || !v;
        ['act-heart','act-cull','act-cull-lineage','act-focus','act-promote','act-breed','act-combine-start'].forEach((id) => { btns[id].disabled = disabled; });
        btns['act-combine-go'].disabled = window.__busy;
        snapBtn.disabled = window.__busy; restoreBtn.disabled = window.__busy;
        scoreBtn.disabled = window.__busy;
      }
      window.__syncActions = sync;
    }
    function syncActions() { if (window.__syncActions) window.__syncActions(); }
    function pollJob(jobId) {
      const setToast = window.__setToast;
      const tick = async () => {
        try {
          const r = await fetch('/api/job/' + encodeURIComponent(jobId));
          const j = await r.json();
          if (j.status === 'running') { if (j.message && setToast) setToast(j.message, 'work'); setTimeout(tick, 2000); }
          else if (j.status === 'done') { if (setToast) setToast(j.message || 'Done. Reloading…', 'ok'); setTimeout(() => location.reload(), 1000); }
          else { if (setToast) setToast('Failed: ' + (j.error || 'unknown'), 'bad'); }
        } catch (e) { setTimeout(tick, 2000); }
      };
      tick();
    }
  </script>
</body></html>`;
}
