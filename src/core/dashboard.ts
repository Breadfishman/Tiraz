/**
 * The Tiraz dashboard (centralized review UI). `renderDashboardHtml` turns a manifest + a map of
 * live per-variant render URLs into one page: a sidebar of every variant (genome + fitness) and a
 * stage that embeds the *live, interactive* variant via an iframe — click or arrow to switch. With
 * `actionsEnabled`, it also drives the search from the UI (select / breed / promote) by POSTing to
 * the serving CLI's action API. Pure — manifest + endpoints in, HTML string out — so it is fully
 * testable; the CLI boots the per-variant render surface, serves this shell, and runs the actions.
 */

import type { Manifest, VariantNode } from './manifest';

export interface DashboardOptions {
  title?: string;
  /** Render the select / breed / promote controls + wire them to the action API. */
  actionsEnabled?: boolean;
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
    best,
  };
}

const STATUS_MARK: Record<string, string> = {
  survivor: ' ✓',
  promoted: ' ⬆',
};

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

  const sidebar = views
    .map((v) => {
      const fit =
        v.composite !== null
          ? `<span class="badge">${String(v.composite)}</span>`
          : '<span class="badge muted">—</span>';
      const disabled = v.url === null ? ' disabled' : '';
      const mark = STATUS_MARK[v.status] ?? '';
      return `<button class="item s-${escapeHtml(v.status)}${v.best ? ' best' : ''}" data-id="${escapeHtml(v.id)}"${disabled}>
        <span class="iid">${escapeHtml(v.id)}${v.best ? ' ★' : ''}${mark}</span>${fit}
        <span class="isub">${escapeHtml(v.primary)}${v.url === null ? ' · not running' : ''}</span>
      </button>`;
    })
    .join('');

  const data = JSON.stringify(Object.fromEntries(views.map((v) => [v.id, v])));

  const actionBar = actions
    ? `<div class="actions" id="actions">
      <button class="abtn" id="act-select" title="Mark this variant a survivor (prune its siblings)">Select survivor</button>
      <label class="factor">breed ×<input id="act-factor" type="number" min="1" max="9" value="1" /></label>
      <button class="abtn" id="act-breed" title="Mutate this survivor into a new generation (runs the agent — slow)">Breed</button>
      <button class="abtn danger" id="act-promote" title="Greenfield: merge to base. Integration: open a PR.">Promote</button>
      <span class="toast" id="toast"></span>
    </div>`
    : '';

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
  .item { all: unset; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px;
          padding: 10px 16px; border-bottom: 1px solid #16161c; }
  .item:hover { background: #15151b; }
  .item.active { background: #1b1b22; box-shadow: inset 3px 0 0 #d9a441; }
  .item.best .iid { color: #d9a441; }
  .item.s-survivor .iid { color: #5bd6a0; }
  .item.s-promoted .iid { color: #7aa2ff; }
  .item.s-pruned { opacity: 0.45; }
  .item[disabled] { opacity: 0.4; cursor: not-allowed; }
  .iid { font-weight: 700; }
  .isub { grid-column: 1 / -1; color: #8a8a93; }
  .badge { background: #20202a; border-radius: 6px; padding: 1px 7px; font-weight: 700; font-size: 11px; align-self: start; }
  .badge.muted { color: #6f6f78; font-weight: 400; }
  main { display: flex; flex-direction: column; min-width: 0; }
  .bar { display: flex; gap: 14px; align-items: baseline; padding: 12px 18px; border-bottom: 1px solid #1e1e24; flex-wrap: wrap; }
  .bar .t { font-weight: 700; } .muted { color: #6f6f78; } .ok { color: #5bd6a0; } .bad { color: #e06b6b; }
  .actions { display: flex; gap: 10px; align-items: center; padding: 10px 18px; border-bottom: 1px solid #1e1e24;
             background: #0e0e12; flex-wrap: wrap; }
  .abtn { all: unset; cursor: pointer; background: #20202a; color: #e7e7ea; border-radius: 7px; padding: 6px 12px;
          font-weight: 600; font-size: 12px; }
  .abtn:hover { background: #2a2a36; } .abtn.danger { background: #3a1f22; color: #f0a0a0; }
  .abtn.danger:hover { background: #4a2629; } .abtn[disabled] { opacity: 0.4; cursor: not-allowed; }
  .factor { color: #8a8a93; font-size: 12px; } .factor input { width: 38px; background: #16161c; color: #e7e7ea;
            border: 1px solid #2a2a36; border-radius: 5px; padding: 3px 5px; }
  .toast { font-size: 12px; } .toast.ok { color: #5bd6a0; } .toast.bad { color: #e06b6b; } .toast.work { color: #d9a441; }
  .stage { flex: 1; min-height: 0; background: #fff; position: relative; }
  iframe { width: 100%; height: 100%; border: 0; display: block; }
  .empty { color: #6f6f78; padding: 40px; }
  kbd { background: #20202a; border-radius: 4px; padding: 1px 5px; }
</style></head>
<body>
  <aside>
    <div class="brand">Tiraz <small>${escapeHtml(manifest.project)} · ${escapeHtml(manifest.mode)}</small></div>
    ${sidebar || '<div class="empty">No variants yet — run <kbd>tiraz gen</kbd>.</div>'}
  </aside>
  <main>
    <div class="bar" id="bar"><span class="muted">Select a variant to view it live →</span></div>
    ${actionBar}
    <div class="stage"><iframe id="stage" title="variant" src=""></iframe>
      <div class="empty" id="empty" style="display:none">This variant has no live render.</div></div>
  </main>
  <script>
    const data = ${data};
    const actionsEnabled = ${String(actions)};
    const order = Object.keys(data);
    const frame = document.getElementById('stage'), bar = document.getElementById('bar'),
          empty = document.getElementById('empty');
    let cur = null;
    function select(id) {
      const v = data[id]; if (!v) return;
      document.querySelectorAll('.item').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
      cur = id;
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
      if (actionsEnabled) syncActions();
    }
    document.querySelectorAll('.item:not([disabled])').forEach((b) => b.addEventListener('click', () => select(b.dataset.id)));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const live = order.filter((id) => data[id].url); if (!live.length) return;
      const i = live.indexOf(cur); const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + live.length) % live.length;
      select(live[n]); e.preventDefault();
    });
    if (actionsEnabled) wireActions();
    if ('${first}') select('${first}');

    function wireActions() {
      const toast = document.getElementById('toast');
      const selectBtn = document.getElementById('act-select');
      const breedBtn = document.getElementById('act-breed');
      const promoteBtn = document.getElementById('act-promote');
      const factorEl = document.getElementById('act-factor');
      window.__busy = false;
      function setToast(msg, kind) { toast.textContent = msg; toast.className = 'toast ' + (kind || ''); }
      window.__setToast = setToast;
      function setBusy(on) {
        window.__busy = on;
        [selectBtn, breedBtn, promoteBtn].forEach((b) => { b.disabled = on; });
      }
      async function post(path, body) {
        const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.error || (r.status + ' ' + r.statusText));
        return json;
      }
      selectBtn.addEventListener('click', async () => {
        if (!cur || window.__busy) return;
        setBusy(true); setToast('Selecting ' + cur + '…', 'work');
        try { await post('/api/select', { ids: [cur] }); location.reload(); }
        catch (e) { setToast('Select failed: ' + e.message, 'bad'); setBusy(false); }
      });
      promoteBtn.addEventListener('click', async () => {
        if (!cur || window.__busy) return;
        if (!confirm('Promote ' + cur + '? Greenfield merges to base; integration opens a PR.')) return;
        setBusy(true); setToast('Promoting ' + cur + '…', 'work');
        try { const res = await post('/api/promote', { id: cur }); setToast(res.message || 'Promoted ' + cur, 'ok'); setTimeout(() => location.reload(), 1200); }
        catch (e) { setToast('Promote failed: ' + e.message, 'bad'); setBusy(false); }
      });
      breedBtn.addEventListener('click', async () => {
        if (!cur || window.__busy) return;
        const factor = Math.max(1, parseInt(factorEl.value, 10) || 1);
        setBusy(true); setToast('Breeding ' + cur + ' ×' + factor + ' (runs the agent — minutes)…', 'work');
        try { const { jobId } = await post('/api/breed', { ids: [cur], factor }); pollJob(jobId); }
        catch (e) { setToast('Breed failed: ' + e.message, 'bad'); setBusy(false); }
      });
      window.__syncActions = function () {
        const v = cur ? data[cur] : null;
        selectBtn.disabled = window.__busy || !v;
        breedBtn.disabled = window.__busy || !v;
        promoteBtn.disabled = window.__busy || !v;
      };
    }
    function syncActions() { if (window.__syncActions) window.__syncActions(); }
    function pollJob(jobId) {
      const setToast = window.__setToast;
      const tick = async () => {
        try {
          const r = await fetch('/api/job/' + encodeURIComponent(jobId));
          const j = await r.json();
          if (j.status === 'running') { if (j.message && setToast) setToast(j.message, 'work'); setTimeout(tick, 2000); }
          else if (j.status === 'done') { if (setToast) setToast(j.message || 'Bred. Reloading…', 'ok'); setTimeout(() => location.reload(), 1000); }
          else { if (setToast) setToast('Breed failed: ' + (j.error || 'unknown'), 'bad'); }
        } catch (e) { setTimeout(tick, 2000); }
      };
      tick();
    }
  </script>
</body></html>`;
}
