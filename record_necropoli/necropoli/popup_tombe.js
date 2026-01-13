// popup_tombe.js – Context popup (taxa):
// - single context view: charts (qt) OR list (qualitative), + Info + Overview
// - multi "sub-contexts" view (unique samples.properties.context within same context_id):
//   shows only 2 previews at a time with arrows, expandable to full view per sub-context,
//   plus "Group all" to ignore sub-contexts and aggregate by context_id.
//
// NOTE: This file sets container.__destroy() so you can call it from Leaflet popupclose cleanup.

import { getPath } from '../../path_utils.js';
import {
  createQtDonutChart,
  createQtBarChart,
  chooseLogScale,
  makeModelColors
} from './modal_chart.js';

/* === Carica CSS del popup (con controllo duplicati) === */
(function loadPopupTombeCSS() {
  if ([...document.styleSheets].some(s => s.href && s.href.includes('popup_tombe.css'))) return;
  let href;
  try { href = new URL('../css/popup_tombe.css', import.meta.url).href; } catch (_) {}
  if (!href) href = (typeof getPath === 'function') ? getPath('css/popup_tombe.css') : '../css/popup_tombe.css';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.onerror = () => { const alt = '../css/popup_tombe.css'; if (link.href !== alt) link.href = alt; };
  document.head.appendChild(link);
})();

/* === Chart.js (v4) === */
function loadChartJsIfNeeded() {
  if (typeof Chart !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
}

/* ========= STOP propagation to Leaflet (fix "buttons jump"/popup close) ========= */
function shieldFromLeaflet(el) {
  if (!el) return;
  const stop = (e) => { try { e.stopPropagation(); } catch {} };
  ['click','dblclick','mousedown','mouseup','pointerdown','pointerup','touchstart','touchend','contextmenu','wheel']
    .forEach(ev => el.addEventListener(ev, stop, { passive: ev === 'wheel' }));

  try {
    if (window.L?.DomEvent) {
      window.L.DomEvent.disableClickPropagation(el);
      window.L.DomEvent.disableScrollPropagation(el);
    }
  } catch {}
}

/* ========= inline SVG icons ========= */
function makeSvgIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(ns, 'path');
  if (name === 'arrow-left') {
    path.setAttribute('d',
      'M15 8a.5.5 0 0 0-.5-.5H3.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L3.707 8.5H14.5A.5.5 0 0 0 15 8z'
    );
  } else if (name === 'arrows-fullscreen') {
    path.setAttribute('d',
      'M1 1v5h1V2h4V1H1zm13 0h-5v1h4v4h1V1zM1 14h5v-1H2V9H1v5zm13-5h-1v4h-4v1h5V9z'
    );
  } else if (name === 'chevron-left') {
    path.setAttribute('d',
      'M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z'
    );
  } else if (name === 'chevron-right') {
    path.setAttribute('d',
      'M4.646 14.354a.5.5 0 0 1 0-.708L10.293 8 4.646 2.354a.5.5 0 1 1 .708-.708l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708 0z'
    );
  } else {
    path.setAttribute('d','M3 3h10v10H3z');
  }

  svg.appendChild(path);
  return svg;
}

function makeIconButton({ label, title, icon, className = 'ctx-btn ghost' }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  if (title) b.title = title;

  const ico = document.createElement('span');
  ico.className = 'ctx-btn-ico';
  ico.appendChild(makeSvgIcon(icon));
  const txt = document.createElement('span');
  txt.textContent = label;

  b.appendChild(ico);
  b.appendChild(txt);
  return b;
}

function stopForButton(btn) {
  if (!btn) return;
  const stop = (e) => { try { e.stopPropagation(); } catch {} };
  ['mousedown', 'pointerdown', 'touchstart', 'contextmenu', 'dblclick'].forEach((ev) => {
    btn.addEventListener(ev, stop, { passive: true });
  });
}

/* ========= immagini/icon logic (legenda_taxa) ========= */
const TAXA_ICON_GLOBAL_KEY = "__TAXA_ICONS__";
function taxonIconFile(preciseTaxon) {
  try {
    const map = (window && window[TAXA_ICON_GLOBAL_KEY]) || null;
    if (!map) return null;
    return map[preciseTaxon] || null;
  } catch { return null; }
}
function iconAbsPathForTaxon(preciseTaxon) {
  const f = taxonIconFile(preciseTaxon);
  return getPath(`images/objects/${f || 'other.png'}`);
}
function preloadIcons(labels) {
  const images = {};
  const fallbackSrc = getPath('images/objects/other.png');
  if (!labels || !labels.length) return { images, ready: Promise.resolve() };

  let remaining = labels.length;
  const ready = new Promise((resolve) => {
    labels.forEach((label) => {
      const img = new Image();
      let triedFallback = false;

      img.onload = () => { if (--remaining <= 0) resolve(); };
      img.onerror = () => {
        if (!triedFallback) {
          triedFallback = true;
          img.onerror = () => { if (--remaining <= 0) resolve(); };
          img.src = fallbackSrc;
        } else {
          if (--remaining <= 0) resolve();
        }
      };

      img.src = iconAbsPathForTaxon(label);
      images[label] = img;
    });
  });
  return { images, ready };
}

/* ========= geometry mini-preview (SVG) ========= */
function geometryPreviewSVG(feature, w = 280, h = 150) {
  try {
    const g = feature?.geometry;
    if (!g || !g.coordinates) return '';
    const coords = (g.type === 'Polygon')
      ? g.coordinates[0]
      : (g.type === 'MultiPolygon' ? g.coordinates[0][0] : null);
    if (!coords || !coords.length) return '';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    coords.forEach(([x, y]) => { if (x<minX)minX=x; if (y<minY)minY=y; if (x>maxX)maxX=x; if (y>maxY)maxY=y; });
    const pad = 0.06;
    const dx = maxX - minX || 1;
    const dy = maxY - minY || 1;
    const pts = coords.map(([x, y]) => {
      const nx = (x - minX) / dx;
      const ny = 1 - (y - minY) / dy;
      const px = (pad + nx * (1 - 2*pad)) * w;
      const py = (pad + ny * (1 - 2*pad)) * h;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' ');
    return `
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="ctx-geom-svg" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${w}" height="${h}" rx="10" ry="10" fill="#f8fafc" stroke="#e5e7eb"/>
        <polyline points="${pts}" fill="url(#ctxFill)" stroke="#0ea5e9" stroke-width="2"/>
        <defs>
          <linearGradient id="ctxFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#bae6fd" stop-opacity=".45" />
            <stop offset="100%" stop-color="#7dd3fc" stop-opacity=".25" />
          </linearGradient>
        </defs>
      </svg>
    `;
  } catch { return ''; }
}

/* ========= helpers ========= */
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
  );
}
const palette = [
  'rgba(126,87,194,0.85)','rgba(76,175,80,0.85)','rgba(33,150,243,0.85)',
  'rgba(244,67,54,0.85)','rgba(255,152,0,0.85)','rgba(0,188,212,0.85)',
  'rgba(156,39,176,0.85)','rgba(121,85,72,0.85)','rgba(205,220,57,0.85)'
];

// === bubbles helper ===
function splitValues(raw) {
  return String(raw || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}
function renderBubbles(raw) {
  const items = splitValues(raw);
  if (!items.length) return '<span class="empty">-</span>';
  return `<div class="bubble-wrap">${items.map(v =>
    `<span class="bubble" title="${escapeHtml(v)}">${escapeHtml(v)}</span>`
  ).join('')}</div>`;
}

/* ========= legenda con icone (riusabile per bar e donut) ========= */
function removeLegend(container) {
  const old1 = container.querySelector('.legend-collapsible');
  if (old1) old1.remove();
}

function buildLegend(container, chart, labels, colors, images, options = {}) {
  const { collapsible = false, startOpen = true, mode = 'donut', valuesRef = [] } = options;

  removeLegend(container);

  let hostEl = container;
  if (collapsible) {
    const details = document.createElement('details');
    details.className = 'legend-collapsible';
    if (startOpen) details.open = true;
    details.innerHTML = `<summary>Legend</summary><div class="legend-body"></div>`;
    container.appendChild(details);
    hostEl = details.querySelector('.legend-body');
  }

  const legend = document.createElement('div');
  legend.className = 'donut-legend';

  labels.forEach((label, i) => {
    const item = document.createElement('div');
    item.className = 'donut-legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'donut-legend-swatch';
    swatch.style.setProperty('--legend-color', colors[i]);

    const img = document.createElement('img');
    const icon = images[label];
    img.src = (icon && icon.complete && icon.naturalWidth) ? icon.src : getPath('images/objects/other.png');
    if (icon && !icon.complete) icon.addEventListener('load', () => { img.src = icon.src; }, { once: true });
    swatch.appendChild(img);

    const text = document.createElement('span');
    text.className = 'donut-legend-label';
    text.textContent = label;

    item.appendChild(swatch);
    item.appendChild(text);

    item.addEventListener('click', () => {
      if (!chart) return;

      // ✅ DONUT: usa il toggle nativo (così re-click riporta visibile)
      if (mode === 'donut') {
        const wasVisible = (typeof chart.getDataVisibility === 'function') ? chart.getDataVisibility(i) : true;
        if (typeof chart.toggleDataVisibility === 'function') {
          chart.toggleDataVisibility(i);
        }
        chart.update();
        item.classList.toggle('disabled', wasVisible); // se prima era visibile, ora è nascosto
        return;
      }

      // BAR: toggle via null (serve valuesRef)
      const ds = chart.data.datasets[0];
      const hidden = ds.data[i] == null;
      ds.data[i] = hidden ? valuesRef[i] : null;
      chart.update();
      item.classList.toggle('disabled', !hidden);
    });

    legend.appendChild(item);
  });

  hostEl.appendChild(legend);
}

/* ========= mini legend (top 6 taxa) ========= */
function renderMiniLegend(where, labels, values, images, topN = 6) {
  const old = where.querySelector('.mini-legend');
  if (old) old.remove();
  if (!labels?.length) return;

  const idxs = labels.map((_, i) => i)
    .sort((a,b) => (values[b] ?? 0) - (values[a] ?? 0))
    .slice(0, topN);

  const box = document.createElement('div');
  box.className = 'mini-legend';
  idxs.forEach(i => {
    const lab = labels[i];
    const item = document.createElement('div');
    item.className = 'mini-legend-item';
    const img = document.createElement('img');
    const icon = images[lab];
    img.src = (icon && icon.complete && icon.naturalWidth) ? icon.src : getPath('images/objects/other.png');
    const span = document.createElement('span');
    span.textContent = lab;
    item.appendChild(img); item.appendChild(span);
    box.appendChild(item);
  });
  where.appendChild(box);
}

/* ========= Toolbar locale s_type ========= */
function buildLocalSTypeToolbar(defaultVal, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'stype-local-toolbar';

  const make = (title, rel, value) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'stype-local-btn'; b.title = title; b.dataset.val = value;
    const img = document.createElement('img'); img.alt = title; img.src = getPath(rel);
    img.onerror = () => { img.onerror=null; img.src = getPath('images/logo_semplificato.png'); };
    b.appendChild(img);
    b.addEventListener('click', () => setActive(value));
    stopForButton(b);
    return b;
  };

  const btnCarpo = make('carpological', 'images/objects/carpo.png',  'carpological');
  const btnWood  = make('wood',         'images/objects/wood.png',  'wood');
  const btnAll   = make('all',          'images/logo_semplificato.png', 'all');
  wrap.appendChild(btnCarpo); wrap.appendChild(btnWood); wrap.appendChild(btnAll);

  function setActive(v) {
    [btnCarpo, btnWood, btnAll].forEach(b => b.classList.toggle('active', b.dataset.val === v));
    if (typeof onChange === 'function') onChange(v);
  }

  const initial = defaultVal || 'carpological';
  [btnCarpo, btnWood, btnAll].forEach(b => b.classList.toggle('active', b.dataset.val === initial));

  return { el: wrap, setActive };
}

/* ========= Overview parsing (c_notes) ========= */
function parseContextOverview(raw) {
  const txt = String(raw ?? '').trim();
  if (!txt) return { overview: '/', bibliography: '/' };

  const m = txt.match(/(^|\n)\s*Bibliography\s*:\s*/i);
  if (!m) return { overview: txt, bibliography: '/' };

  const idx = m.index ?? -1;
  if (idx < 0) return { overview: txt, bibliography: '/' };

  const cut = idx + m[0].length;
  const overview = txt.slice(0, idx).trim() || '/';
  const bibliography = txt.slice(cut).trim() || '/';
  return { overview, bibliography };
}
function buildOverviewHtmlForContext(feature) {
  const p = feature?.properties || {};
  const { overview, bibliography } = parseContextOverview(p.c_notes);
  return `
    <div class="ctx-overview-card">
      <div class="ctx-overview-head">
        <div class="ctx-overview-title">Context Overview</div>
      </div>

      <div class="ctx-overview-body">
        <div class="ctx-overview-text">${escapeHtml(overview)}</div>

        <div class="ctx-overview-bib">
          <div class="ctx-overview-bib-title">Context Overview Bibliography</div>
          <div class="ctx-overview-bib-text">${escapeHtml(bibliography)}</div>
        </div>
      </div>
    </div>
  `;
}

/* ========= samples grouping ========= */
function normalizeGroupKey(v) {
  const s = String(v ?? '').trim();
  return s || '(unlabeled)';
}
function groupSamplesBySubcontext(samples) {
  const m = new Map();
  for (const s of (samples || [])) {
    const p = s?.properties || {};
    const key = normalizeGroupKey(p.context);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(s);
  }
  return m;
}

/* ========= aggregation helpers ========= */
function filterBySType(arr, st) {
  if (!st || st === 'all') return arr;
  return (arr || []).filter(s => String(s?.properties?.s_type || '').trim().toLowerCase() === st);
}
function aggregateQt(subset) {
  const sums = new Map(); let totalQt = 0;
  (subset || []).forEach(s => {
    const sp = s.properties || {};
    const label = (sp.precise_taxon || sp.taxon || 'Unclassified').trim();
    const n = Number(sp.qt ?? sp.quantity);
    if (Number.isFinite(n)) {
      totalQt += n;
      sums.set(label, (sums.get(label) || 0) + n);
    }
  });
  return { labels: Array.from(sums.keys()), values: Array.from(sums.values()), totalQt };
}
function rowsForList(subset) {
  return (subset || []).map(s => {
    const sp = s.properties || {};
    return {
      label: (sp.precise_taxon || sp.taxon || 'Unclassified').trim(),
      entity: (sp.entity == null || sp.entity === '') ? null : String(sp.entity)
    };
  });
}

/* ========= pager (renders only current page; 2 previews max) ========= */
function mountPagedPreviews(hostEl, factories, pageSize = 2) {
  const items = Array.isArray(factories) ? factories : [];
  let start = 0;
  let current = [];
  if (!hostEl) return { destroy(){} };

  hostEl.innerHTML = '';
  hostEl.classList.add('ctx-previews-host');

  const nav = document.createElement('div');
  nav.className = 'ctx-previews-nav';
  nav.innerHTML = `
    <button type="button" class="ctx-nav-btn" data-dir="-1" aria-label="Previous"></button>
    <div class="ctx-nav-meta"><span class="ctx-nav-count"></span></div>
    <button type="button" class="ctx-nav-btn" data-dir="1" aria-label="Next"></button>
  `;
  const row = document.createElement('div');
  row.className = 'ctx-previews-row';

  hostEl.appendChild(nav);
  hostEl.appendChild(row);

  const btnPrev = nav.querySelector('[data-dir="-1"]');
  const btnNext = nav.querySelector('[data-dir="1"]');
  const countEl = nav.querySelector('.ctx-nav-count');

  btnPrev.appendChild(makeSvgIcon('chevron-left'));
  btnNext.appendChild(makeSvgIcon('chevron-right'));
  stopForButton(btnPrev);
  stopForButton(btnNext);

  function clampStart(v) {
    const maxStart = Math.max(0, items.length - pageSize);
    return Math.max(0, Math.min(maxStart, v));
  }
  function destroyCurrent() {
    current.forEach(x => { try { x?.destroy?.(); } catch {} });
    current = [];
    row.innerHTML = '';
  }
  function render() {
    start = clampStart(start);
    destroyCurrent();

    const slice = items.slice(start, start + pageSize);
    current = slice.map(fn => {
      const built = fn();
      if (built?.el) row.appendChild(built.el);
      return built || {};
    });

    const end = Math.min(items.length, start + pageSize);
    countEl.textContent = items.length ? `${start + 1}–${end} / ${items.length}` : `0 / 0`;

    btnPrev.disabled = (start <= 0);
    btnNext.disabled = (start >= items.length - pageSize);
    nav.style.display = (items.length > pageSize) ? 'flex' : 'none';
  }
  function onClick(e) {
    const b = e.target.closest('.ctx-nav-btn');
    if (!b) return;
    const dir = Number(b.dataset.dir);
    start += dir * pageSize;
    render();
  }

  nav.addEventListener('click', onClick);
  render();

  return {
    destroy() {
      try { nav.removeEventListener('click', onClick); } catch {}
      destroyCurrent();
      try { hostEl.innerHTML = ''; } catch {}
    }
  };
}

/* ========= preview cards ========= */
function makeGroupCardShell(title, metaText, onExpand) {
  const card = document.createElement('div');
  card.className = 'ctx-group-card';

  const head = document.createElement('div');
  head.className = 'ctx-group-head';

  const name = document.createElement('div');
  name.className = 'ctx-group-name';
  name.title = title;
  name.textContent = title;

  const meta = document.createElement('div');
  meta.className = 'ctx-group-meta';
  meta.textContent = metaText || '';

  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'ctx-group-expand';
  expand.title = 'Open';
  expand.setAttribute('aria-label', 'Open');
  expand.appendChild(makeSvgIcon('arrows-fullscreen'));
  stopForButton(expand);

  expand.addEventListener('click', () => {
    if (typeof onExpand === 'function') onExpand();
  });

  head.appendChild(name);
  head.appendChild(meta);
  head.appendChild(expand);

  const body = document.createElement('div');
  body.className = 'ctx-group-body';

  card.appendChild(head);
  card.appendChild(body);

  return { card, body };
}

function makeQtPreviewFactory(groupLabel, groupSamples, onExpand) {
  return () => {
    const { labels, values, totalQt } = aggregateQt(groupSamples);
    const taxa = labels.length;
    const samp = groupSamples.length;

    const metaText = `S:${samp}  T:${taxa}  Σ:${totalQt || 0}`;
    const { card, body } = makeGroupCardShell(groupLabel, metaText, onExpand);

    const wrap = document.createElement('div');
    wrap.className = 'ctx-mini-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'ctx-mini-canvas';
    wrap.appendChild(canvas);
    body.appendChild(wrap);

    let chart = null;
    let destroyed = false;

    const render = async () => {
      try {
        await loadChartJsIfNeeded();
        if (destroyed) return;

        if (!labels.length || !totalQt) {
          body.innerHTML = `<div class="ctx-mini-nodata">No data</div>`;
          return;
        }

        const idxs = labels.map((_, i) => i).sort((a,b) => (values[b]||0)-(values[a]||0));
        const topN = 8;
        const labs = idxs.slice(0, topN).map(i => labels[i]);
        const vals = idxs.slice(0, topN).map(i => values[i]);
        const colors = labs.map((_, i) => palette[i % palette.length]);

        const ctx = canvas.getContext('2d');
        chart = new Chart(ctx, {
          type: 'doughnut',
          data: { labels: labs, datasets: [{ data: vals, backgroundColor: colors, borderColor: '#fff', borderWidth: 2, cutout: '58%' }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
      } catch {
        body.innerHTML = `<div class="ctx-mini-nodata">Chart unavailable</div>`;
      }
    };

    render();

    return {
      el: card,
      destroy() {
        destroyed = true;
        try { chart?.destroy?.(); } catch {}
        chart = null;
      }
    };
  };
}

function makeListPreviewFactory(groupLabel, groupSamples, onExpand) {
  return () => {
    const rows = rowsForList(groupSamples);
    const samp = groupSamples.length;
    const taxaSet = new Set(rows.map(r => r.label));

    const metaText = `S:${samp}  T:${taxaSet.size}`;
    const { card, body } = makeGroupCardShell(groupLabel, metaText, onExpand);

    const top = Array.from(taxaSet).sort((a,b)=>a.localeCompare(b)).slice(0, 8);

    const box = document.createElement('div');
    box.className = 'taxa-list taxa-list-compact';
    const ul = document.createElement('ul');
    top.forEach(t => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="tli-icon"><img src="${iconAbsPathForTaxon(t)}" alt=""></span>
        <span class="tli-label">${escapeHtml(t)}</span>
      `;
      ul.appendChild(li);
    });
    box.appendChild(ul);

    body.appendChild(box);

    if (taxaSet.size > top.length) {
      const more = document.createElement('div');
      more.className = 'taxa-list-more';
      more.textContent = `+ ${taxaSet.size - top.length} more`;
      body.appendChild(more);
    }

    return { el: card, destroy(){} };
  };
}

/* ===== taxa list (entity) ===== */
function buildTaxaList(rows) {
  const order = { many: 3, few: 2 };
  const map = new Map();
  (rows || []).forEach(r => {
    const e = (r.entity || '').toLowerCase().trim();
    const old = map.get(r.label);
    if (!old) {
      map.set(r.label, { entity: e || null, icon: iconAbsPathForTaxon(r.label) });
    } else {
      const prev = old.entity || '';
      const sOld = order[prev] || 0;
      const sNew = order[e] || 0;
      if (sNew > sOld) old.entity = e;
    }
  });
  const items = Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0]));

  const box = document.createElement('div');
  box.className = 'taxa-list';
  const ul = document.createElement('ul');
  items.forEach(([label, v]) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="tli-icon"><img src="${v.icon}" alt=""></span>
      <span class="tli-label">${escapeHtml(label)}</span>
      ${v.entity ? `<span class="tli-entity">(${escapeHtml(v.entity)})</span>` : ''}
    `;
    ul.appendChild(li);
  });
  box.appendChild(ul);
  return box;
}

function buildTaxaListBySType(carpoRows, woodRows) {
  const wrap = document.createElement('div');
  wrap.className = 'taxa-list-byst';

  function sect(title, rows, open = true) {
    const details = document.createElement('details');
    details.className = 'tl-section';
    if (open && rows.length) details.open = true;
    const sum = document.createElement('summary');
    sum.innerHTML = `<span class="tl-chip">${escapeHtml(title)}</span> <span class="tl-count">(${rows.length})</span>`;
    details.appendChild(sum);
    const box = buildTaxaList(rows);
    details.appendChild(box);
    return details;
  }

  wrap.appendChild(sect('carpological', carpoRows, true));
  wrap.appendChild(sect('wood', woodRows, false));
  return wrap;
}

/* ===== Scheda Info (contesto) ===== */
function buildInfoHtmlForContext(feature, opts = {}) {
  const { includeGeometry = false } = opts;

  const p = feature?.properties || {};
  const periods    = (p.parent_chronology_iccd || '').trim();
  const subperiods = (p.chronology_iccd || '').trim();
  const partOf     = p.parent_context || p.site_name_brain || '-';

  const rows = [
    ['Part of', `<span class="js-partof">${escapeHtml(partOf)}</span>`],
    ['Periods', renderBubbles(periods)],
    ['Sub-periods', renderBubbles(subperiods)],
    ['Reliability', escapeHtml(p.c_appr)],
    ['Province / Region', escapeHtml([p.province, p.region].filter(Boolean).join(' — '))],
    // NOTE: c_notes moved to Overview (NOT here)
    ['Brain code', p.site_code ? `<a href="https://brainplants.successoterra.net/index.html" target="_blank" rel="noopener">${escapeHtml(p.site_code)}</a>` : '-'],
    ['Site ID', escapeHtml(p.fid)]
  ];

  const bibl = (p.bibliography || '').trim();
  if (bibl) {
    const items = bibl.split(';').map(s => s.trim()).filter(Boolean);
    if (items.length) {
      rows.push(['References', `<ul class="refs-list">${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`]);
    }
  }

  const infoRows = rows.map(([k,v]) => `
    <div class="tomb-info-row">
      <div class="tomb-info-k">${k}</div>
      <div class="tomb-info-v">${v}</div>
    </div>`).join('');

  // 🔻 geometria SOLO se richiesta
  const geomPreview = includeGeometry ? geometryPreviewSVG(feature, 420, 180) : '';

  return `
    <div class="tomb-info">
      ${infoRows}
      ${geomPreview ? `<div class="ctx-geom-box">${geomPreview}</div>` : ''}
    </div>
  `;
}

/* ========== MAIN POPUP ========== */
export function createTombaPopup(contextFeature, samples = []) {
  const p = contextFeature?.properties || {};
  const container = document.createElement('div');
  container.className = 'popup-tomba-wrapper';

  shieldFromLeaflet(container);

  const destroyers = [];
  const cleanupAll = () => { destroyers.splice(0).forEach(fn => { try { fn?.(); } catch {} }); };
  container.__destroy = cleanupAll;

  const title = document.createElement('div');
  title.className = 'popup-tomba-title';
  title.textContent = p.context_name || 'Context';
  container.appendChild(title);

  const modeIsQt = String(p.q_e || '').toLowerCase() === 'qt';

  const grouped = groupSamplesBySubcontext(samples);
  const groupKeys = Array.from(grouped.keys());
  const isMulti = groupKeys.length > 1;

  const info = document.createElement('div');
  info.className = 'popup-tomba-info';
  const samplesCount = samples.length;
  const taxaSetAll = new Set(samples.map(s => (s.properties?.precise_taxon || s.properties?.taxon || 'Unclassified').trim()));
  let sumQtAll = 0;
  if (modeIsQt) {
    samples.forEach(s => {
      const n = Number(s?.properties?.qt ?? s?.properties?.quantity);
      if (Number.isFinite(n)) sumQtAll += n;
    });
  }
  info.innerHTML = `
    <div class="info-item"><span class="info-label">Samples:</span> <span class="info-value">${samplesCount}</span></div>
    <div class="info-item"><span class="info-label">Taxa:</span> <span class="info-value">${taxaSetAll.size}</span></div>
    <div class="info-item"><span class="info-label">${modeIsQt ? 'Σqt:' : 'Groups:'}</span>
      <span class="info-value">${modeIsQt ? sumQtAll : (isMulti ? groupKeys.length : 1)}</span>
    </div>
  `;
  container.appendChild(info);

  const headControls = document.createElement('div');
  headControls.className = 'ctx-group-toolbar';
  container.appendChild(headControls);

  let groupAll = false;
  let detailKey = null;
  let activeMode = null;

  function renderHeadControls() {
    headControls.innerHTML = '';

    if (detailKey && isMulti && !groupAll) {
      const back = makeIconButton({ label: 'Back', title: 'Back', icon: 'arrow-left', className: 'ctx-btn ghost' });
      stopForButton(back);
      back.addEventListener('click', () => {
        detailKey = null;
        activeMode = modeIsQt ? 'previews' : 'list';
        renderUI();
      });
      headControls.appendChild(back);

      const chip = document.createElement('div');
      chip.className = 'ctx-group-chip';
      chip.textContent = detailKey;
      headControls.appendChild(chip);
      return;
    }

    if (isMulti) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-btn primary';
      btn.textContent = groupAll ? 'Split by sub-context' : 'Group all';
      stopForButton(btn);
      btn.addEventListener('click', () => {
        groupAll = !groupAll;
        detailKey = null;
        activeMode = modeIsQt ? (groupAll ? 'bar' : 'previews') : 'list';
        renderUI();
      });
      headControls.appendChild(btn);

      if (!groupAll) {
        const hint = document.createElement('div');
        hint.className = 'ctx-group-chip';
        hint.textContent = `Sub-contexts: ${groupKeys.length}`;
        headControls.appendChild(hint);
      }
    }
  }

  const switcher = document.createElement('div');
  switcher.className = 'tomb-switcher';
  container.appendChild(switcher);

  function setActive(mode) {
    activeMode = mode;
    switcher.querySelectorAll('.ts-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }

  function renderSwitcher() {
    switcher.innerHTML = '';

    const addBtn = (label, mode, isActive=false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ts-btn' + (isActive ? ' active' : '');
      b.dataset.mode = mode;
      b.textContent = label;
      stopForButton(b);
      switcher.appendChild(b);
      return b;
    };

    // MULTI (previews) — niente Info (ora è fisso a destra nel modale)
    if (isMulti && !groupAll && !detailKey) {
      if (modeIsQt) addBtn('Previews', 'previews', activeMode === 'previews');
      else addBtn('List', 'list', activeMode === 'list');
      addBtn('Overview', 'overview', activeMode === 'overview');
      return;
    }

    // SINGLE / DETAIL
    if (modeIsQt) {
      addBtn('Bar chart', 'bar', activeMode === 'bar');
      addBtn('Donut', 'donut', activeMode === 'donut');
      addBtn('Overview', 'overview', activeMode === 'overview');

      const badge = document.createElement('span');
      badge.className = 'scale-badge';
      badge.style.display = 'none';
      badge.textContent = 'log scale';
      switcher.appendChild(badge);
    } else {
      addBtn('List', 'list', activeMode === 'list');
      addBtn('Overview', 'overview', activeMode === 'overview');
      const badge = document.createElement('span');
      badge.className = 'scale-badge';
      badge.style.display = 'none';
      switcher.appendChild(badge);
    }
  }

  const previewsHost = document.createElement('div');
  previewsHost.className = 'ctx-previews-or-list';
  container.appendChild(previewsHost);

  const miniLegendHost = document.createElement('div');
  miniLegendHost.className = 'mini-legend-host';
  container.appendChild(miniLegendHost);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'popup-tomba-canvas-container';
  const canvas = document.createElement('canvas');
  canvas.className = 'popup-tomba-canvas';
  canvasWrap.appendChild(canvas);
  container.appendChild(canvasWrap);

  const overviewBox = document.createElement('div');
  overviewBox.className = 'ctx-overview-box';
  overviewBox.innerHTML = buildOverviewHtmlForContext(contextFeature);
  container.appendChild(overviewBox);

  let stypeCtrl = null;
  let localSType = 'carpological';

  function ensureSTypeToolbar() {
    if (!modeIsQt) return;
    if (stypeCtrl?.el && stypeCtrl.el.isConnected) return;
    stypeCtrl = buildLocalSTypeToolbar('carpological', (val) => {
      localSType = (val === 'all') ? 'all' : val;
      if (activeMode === 'bar' || activeMode === 'donut') renderBody();
    });
    container.insertBefore(stypeCtrl.el, canvasWrap);
    destroyers.push(() => { try { stypeCtrl?.el?.remove?.(); } catch {} stypeCtrl = null; });
  }

  let chart = null;
  function destroyChart() { if (chart) { try { chart.destroy(); } catch {} chart = null; } }

  let pager = null;
  function destroyPager() { try { pager?.destroy?.(); } catch {} pager = null; }

  destroyers.push(() => {
    destroyPager();
    destroyChart();
    removeLegend(container);
  });

  function getActiveSamples() {
    if (isMulti && !groupAll && detailKey) return grouped.get(detailKey) || [];
    return samples;
  }

  function showOnly(which) {
    previewsHost.style.display = 'none';
    miniLegendHost.style.display = 'none';
    canvasWrap.style.display = 'none';
    overviewBox.style.display = 'none';
    removeLegend(container);

    if (which === 'previews' || which === 'list') previewsHost.style.display = 'block';
    if (which === 'chart') { miniLegendHost.style.display = 'block'; canvasWrap.style.display = 'block'; }
    if (which === 'overview') overviewBox.style.display = 'block';
  }

  function noDataNotice(msg = 'No data for selected type') {
    destroyPager();
    destroyChart();
    removeLegend(container);
    miniLegendHost.innerHTML = '';
    try { canvasWrap.classList.remove('donut-sheen'); } catch {}

    // mostra l’avviso nel pannello sinistro
    showOnly('list');
    previewsHost.classList.remove('ctx-list-box');
    previewsHost.innerHTML = `<div class="ctx-mini-nodata">${escapeHtml(msg)}</div>`;
  }

  function renderBar(subsetSamples) {
    ensureSTypeToolbar();
    try { canvasWrap.classList.remove('donut-sheen'); } catch {}

    const subset = filterBySType(subsetSamples, localSType);
    const { labels, values, totalQt } = aggregateQt(subset);
    if (!labels.length || !totalQt) return noDataNotice();

    showOnly('chart');
    destroyChart();
    removeLegend(container);

    const colors = labels.map((_, i) => palette[i % palette.length]);
    const borders = colors.map(c => c.replace('0.85', '1'));
    const { images, ready } = preloadIcons(labels);

    miniLegendHost.innerHTML = '';
    renderMiniLegend(miniLegendHost, labels, values, images, 6);

    const useLog = chooseLogScale(values, 25);
    const badge = switcher.querySelector('.scale-badge');
    if (badge) badge.style.display = useLog ? 'inline-block' : 'none';

    const ctx = canvas.getContext('2d');
    chart = createQtBarChart(ctx, { labels, values, colors, borders, images, useLog });

    buildLegend(container, chart, labels, colors, images, {
      collapsible: true, startOpen: false, mode: 'bar', valuesRef: values
    });

    ready.then(() => { if (chart) chart.update(); });
  }

  function renderDonut(subsetSamples) {
    ensureSTypeToolbar();

    const subset = filterBySType(subsetSamples, localSType);
    const { labels, values, totalQt } = aggregateQt(subset);
    if (!labels.length || !totalQt) return noDataNotice();

    showOnly('chart');
    destroyChart();
    removeLegend(container);

    canvasWrap.classList.add('donut-sheen');

    const colors = makeModelColors(labels.length, palette);
    const { images, ready } = preloadIcons(labels);

    miniLegendHost.innerHTML = '';
    renderMiniLegend(miniLegendHost, labels, values, images, 6);

    const ctx = canvas.getContext('2d');

    chart = createQtDonutChart(ctx, {
      labels,
      values,
      colors,
      totalValue: totalQt,
      cutout: '34%',
      layoutPadding: { top: 18, right: 96, bottom: 18, left: 96 },
      variableRadius: { enabled: true, minFactor: 0.18, exp: 1.35 },
      manhattanLabels: {
        enabled: true,
        minPctToShow: 0,
        minGap: 14,
        elbowOut: 12,
        textOut: 56,
        safePad: 14
      },
      centerText: { enabled: true, label: 'Total', value: totalQt }
    });

    buildLegend(container, chart, labels, colors, images, {
      collapsible: true,
      startOpen: true,
      mode: 'donut',
      valuesRef: values
    });

    ready.then(() => { if (chart) chart.update(); });
  }

  function renderList(subsetSamples) {
    showOnly('list');
    destroyPager();
    destroyChart();
    removeLegend(container);
    try { canvasWrap.classList.remove('donut-sheen'); } catch {}

    const carpoRows = rowsForList(filterBySType(subsetSamples, 'carpological'));
    const woodRows  = rowsForList(filterBySType(subsetSamples, 'wood'));
    const listBySTypeEl = buildTaxaListBySType(carpoRows, woodRows);

    previewsHost.innerHTML = '';
    previewsHost.classList.add('ctx-list-box');
    previewsHost.appendChild(listBySTypeEl);

    const badge = switcher.querySelector('.scale-badge');
    if (badge) badge.style.display = 'none';
  }

  function renderPreviews() {
    showOnly(modeIsQt ? 'previews' : 'list');
    destroyChart(); removeLegend(container);
    try { canvasWrap.classList.remove('donut-sheen'); } catch {}

    previewsHost.innerHTML = '';
    previewsHost.classList.remove('ctx-list-box');

    const keysSorted = groupKeys.slice().sort((a,b) => a.localeCompare(b));
    const factories = keysSorted.map(k => {
      const arr = grouped.get(k) || [];
      const onExpand = () => {
        detailKey = k;
        activeMode = modeIsQt ? 'bar' : 'list';
        renderUI();
      };
      return modeIsQt
        ? makeQtPreviewFactory(k, arr, onExpand)
        : makeListPreviewFactory(k, arr, onExpand);
    });

    pager = mountPagedPreviews(previewsHost, factories, 2);
    destroyers.push(() => { try { pager?.destroy?.(); } catch {} pager = null; });

    const badge = switcher.querySelector('.scale-badge');
    if (badge) badge.style.display = 'none';
  }

  function renderBody() {
    destroyPager();
    destroyChart();
    removeLegend(container);
    miniLegendHost.innerHTML = '';

    renderHeadControls();
    renderSwitcher();

    const subset = getActiveSamples();

    // MULTI previews
    if (isMulti && !groupAll && !detailKey) {
      if (modeIsQt) {
        if (!activeMode) activeMode = 'previews';
        setActive(activeMode);
        if (activeMode === 'overview') { showOnly('overview'); return; }
        setActive('previews');
        renderPreviews();
        return;
      } else {
        if (!activeMode) activeMode = 'list';
        setActive(activeMode);
        if (activeMode === 'overview') { showOnly('overview'); return; }
        setActive('list');
        renderPreviews();
        return;
      }
    }

    // SINGLE / DETAIL
    if (!activeMode) activeMode = modeIsQt ? 'bar' : 'list';
    setActive(activeMode);

    if (activeMode === 'overview') { showOnly('overview'); return; }

    if (modeIsQt) {
      loadChartJsIfNeeded()
        .then(() => {
          if (activeMode === 'donut') renderDonut(subset);
          else renderBar(subset);
        })
        .catch(() => { noDataNotice('Chart unavailable'); });
    } else {
      renderList(subset);
    }
  }

  function renderUI() {
    destroyPager();
    destroyChart();
    removeLegend(container);

    if (!modeIsQt && stypeCtrl?.el) {
      try { stypeCtrl.el.remove(); } catch {}
      stypeCtrl = null;
    }
    renderBody();
  }

  switcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.ts-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    setActive(mode);
    renderUI();
  });

  if (isMulti && !groupAll) activeMode = modeIsQt ? 'previews' : 'list';
  else activeMode = modeIsQt ? 'bar' : 'list';

  renderUI();
  return container;
}

/* ============================
   MODAL wrapper (central screen)
============================ */

let __activeTombaModal = null;

export function closeTombaModal() {
  try { __activeTombaModal?.close?.(); } catch {}
}

export function openTombaModal(contextFeature, samples = [], opts = {}) {
  // chiudi eventuale modale precedente
  closeTombaModal();

  const title = opts.title || contextFeature?.properties?.context_name || 'Context';

  const backdrop = document.createElement('div');
  backdrop.className = 'ctx-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'ctx-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.tabIndex = -1;

  const head = document.createElement('div');
  head.className = 'ctx-modal-head';

  const h = document.createElement('div');
  h.className = 'ctx-modal-title';
  h.textContent = title;

  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.className = 'ctx-modal-close';
  btnClose.setAttribute('aria-label', 'Close');
  btnClose.innerHTML = '&times;';

  head.appendChild(h);
  head.appendChild(btnClose);

  // ===== BODY: due colonne (sx contenuto, dx info fissa) =====
  const body = document.createElement('div');
  body.className = 'ctx-modal-body';

  const left = document.createElement('div');
  left.className = 'ctx-modal-left';

  const right = document.createElement('div');
  right.className = 'ctx-modal-right';

  // contenuto (identico al popup precedente, ma SENZA tab Info)
  const content = createTombaPopup(contextFeature, samples);
  left.appendChild(content);

  // INFO fisso a destra (senza preview geometria)
  right.innerHTML = `
    <div class="ctx-side-card">
      <div class="ctx-side-title">Info</div>
      ${buildInfoHtmlForContext(contextFeature, { includeGeometry: false })}
    </div>
  `;

  // evita propagazioni “map-like” se riusi helper (opzionale ma innocuo)
  try { shieldFromLeaflet(left); } catch {}
  try { shieldFromLeaflet(right); } catch {}

  body.appendChild(left);
  body.appendChild(right);

  modal.appendChild(head);
  modal.appendChild(body);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // blocca scroll pagina
  document.body.classList.add('ctx-modal-open');

  const onEsc = (e) => {
    if (e.key === 'Escape') close();
  };

  const close = () => {
    try { document.removeEventListener('keydown', onEsc); } catch {}

    try {
      // cleanup charts/timers ecc
      const c = body.querySelector('.popup-tomba-wrapper') || content;
      if (c && typeof c.__destroy === 'function') c.__destroy();
    } catch {}

    try { backdrop.remove(); } catch {}
    try { document.body.classList.remove('ctx-modal-open'); } catch {}

    __activeTombaModal = null;

    try { opts.onClose?.(); } catch {}
  };

  // click fuori = chiudi
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });

  // stop propagation dentro modale
  modal.addEventListener('mousedown', (e) => e.stopPropagation());

  btnClose.addEventListener('click', close);
  document.addEventListener('keydown', onEsc);

  // focus
  try { modal.focus(); } catch {}

  __activeTombaModal = { close };
  return close;
}

