// popup_tombe.js – Context popup (taxa): bar/donut by qt OR plain list by entity + info tab with geometry preview
import { getPath } from '../../path_utils.js';

/* === Carica CSS del popup (con controllo duplicati) === */
(function loadPopupTombeCSS() {
  if ([...document.styleSheets].some(s => s.href && s.href.includes('popup_tombe.css'))) return;
  let href;
  try { href = new URL('../css/popup_tombe.css', import.meta.url).href; } catch (_) {}
  if (!href) href = (typeof getPath === 'function')
      ? getPath('css/popup_tombe.css')
      : '../css/popup_tombe.css';
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
    const item = document.createElement('div'); item.className = 'donut-legend-item';
    const swatch = document.createElement('span'); swatch.className = 'donut-legend-swatch'; swatch.style.setProperty('--legend-color', colors[i]);
    const img = document.createElement('img');
    const icon = images[label];
    img.src = (icon && icon.complete && icon.naturalWidth) ? icon.src : getPath('images/objects/other.png');
    if (icon && !icon.complete) icon.addEventListener('load', () => { img.src = icon.src; }, { once: true });
    swatch.appendChild(img);
    const text = document.createElement('span'); text.className = 'donut-legend-label'; text.textContent = label;
    item.appendChild(swatch); item.appendChild(text);
    item.addEventListener('click', () => {
      if (mode === 'donut') {
        const visible = chart.getDataVisibility(i);
        chart.toggleDataVisibility(i); chart.update(); item.classList.toggle('disabled', visible);
      } else {
        const ds = chart.data.datasets[0];
        const hidden = ds.data[i] == null;
        ds.data[i] = hidden ? valuesRef[i] : null; chart.update();
        item.classList.toggle('disabled', !hidden);
      }
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

/* ========= Toolbar locale s_type (carpological / wood / all)
   NOTE: all’inizializzazione NON chiama il callback, imposta solo lo stato visivo.
   ============================================================================ */
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

  // Stato visivo iniziale, senza chiamare onChange
  const initial = defaultVal || 'carpological';
  [btnCarpo, btnWood, btnAll].forEach(b => b.classList.toggle('active', b.dataset.val === initial));

  return { el: wrap, setActive };
}

/* ========== MAIN POPUP ==========
 * feature = CONTEXT
 * samples = array di samples (già filtrati per quel contesto dal chiamante)
 */
export function createTombaPopup(contextFeature, samples = []) {
  const p = contextFeature?.properties || {};
  const container = document.createElement('div');
  container.className = 'popup-tomba-wrapper';

  // Titolo
  const title = document.createElement('div');
  title.className = 'popup-tomba-title';
  title.textContent = p.context_name || 'Context';
  container.appendChild(title);

  // === Decide modalità: grafici (qt) oppure lista (entity/en) ===
  const modeIsQt = String(p.q_e || '').toLowerCase() === 'qt';

  // === Stato grafici PRIMA di creare la toolbar (evita TDZ) ===
  let chart = null;
  let currentMode = modeIsQt ? 'bar' : 'info';

  // === Default filtro locale s_type ===
  let localSType = 'carpological';

  // === Helpers filtraggio/aggregazione ===
  function filterBySType(arr, st) {
    if (!st || st === 'all') return arr;
    return arr.filter(s => String(s?.properties?.s_type || '').trim().toLowerCase() === st);
  }
  function aggregateQt(subset) {
    const sums = new Map(); let totalQt = 0;
    subset.forEach(s => {
      const sp = s.properties || {};
      const label = (sp.precise_taxon || sp.taxon || 'Unclassified').trim();
      const n = Number(sp.qt ?? sp.quantity);
      if (Number.isFinite(n)) {
        totalQt += n; sums.set(label, (sums.get(label) || 0) + n);
      }
    });
    return { labels: Array.from(sums.keys()), values: Array.from(sums.values()), totalQt };
  }
  function rowsForList(subset) {
    return subset.map(s => {
      const sp = s.properties || {};
      return {
        label: (sp.precise_taxon || sp.taxon || 'Unclassified').trim(),
        entity: (sp.entity == null || sp.entity === '') ? null : String(sp.entity)
      };
    });
  }

  // Info riassuntiva (su TUTTI i samples passati)
  const info = document.createElement('div');
  info.className = 'popup-tomba-info';
  const samplesCount = samples.length;
  const taxaSetAll = new Set(samples.map(s => (s.properties?.precise_taxon || s.properties?.taxon || 'Unclassified').trim()));
  info.innerHTML = `
    <div class="info-item"><span class="info-label">Samples:</span> <span class="info-value">${samplesCount}</span></div>
    <div class="info-item"><span class="info-label">Taxa:</span> <span class="info-value">${taxaSetAll.size}</span></div>
  `;
  container.appendChild(info);

  // Switcher
  const switcher = document.createElement('div');
  switcher.className = 'tomb-switcher';
  switcher.innerHTML = `
    ${modeIsQt ? `<button class="ts-btn active" data-mode="bar">Bar chart</button>
                  <button class="ts-btn" data-mode="donut">Donut</button>` : ''}
    <button class="ts-btn ${modeIsQt ? '' : 'active'}" data-mode="info">Info</button>
    <span class="scale-badge" style="display:none;">log scale</span>
  `;
  container.appendChild(switcher);

  // Canvas container + canvas (creati PRIMA della toolbar)
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'popup-tomba-canvas-container';
  const canvas = document.createElement('canvas');
  canvas.className = 'popup-tomba-canvas';
  canvasWrap.appendChild(canvas);
  if (modeIsQt) container.appendChild(canvasWrap);

  // mini legend container (anteprima top-6)
  const miniLegendHost = document.createElement('div');
  miniLegendHost.className = 'mini-legend-host';
  if (modeIsQt) container.insertBefore(miniLegendHost, canvasWrap);

  // Info box
  const infoBox = document.createElement('div');
  infoBox.className = 'tomb-info-box';
  infoBox.style.display = modeIsQt ? 'none' : 'block';
  infoBox.innerHTML = buildInfoHtmlForContext(contextFeature);
  container.appendChild(infoBox);

  // LISTA per s_type (quando q_e != 'qt')
  let listBySTypeEl = null;
  if (!modeIsQt) {
    const carpoRows = rowsForList(filterBySType(samples, 'carpological'));
    const woodRows  = rowsForList(filterBySType(samples, 'wood'));
    listBySTypeEl = buildTaxaListBySType(carpoRows, woodRows);
    container.appendChild(listBySTypeEl);
  }

  // Toolbar s_type (creata DOPO i contenitori; di default non chiama render)
  let stypeCtrl = null;
  if (modeIsQt) {
    stypeCtrl = buildLocalSTypeToolbar('carpological', (val) => {
      localSType = (val === 'all') ? 'all' : val;
      if (currentMode === 'bar') renderBar();
      else if (currentMode === 'donut') renderDonut();
    });
    container.insertBefore(stypeCtrl.el, canvasWrap); // sopra ai grafici
  }

  function destroyChart() { if (chart) { try { chart.destroy(); } catch {} chart = null; } }
  function noDataNotice(msg = 'No data for selected type') {
    destroyChart(); removeLegend(container);
    canvasWrap.style.display = 'none';
    infoBox.style.display = 'block';
    if (listBySTypeEl) listBySTypeEl.style.display = 'none';
    infoBox.innerHTML = `<div class="tomb-info"><div class="tomb-info-row"><div class="tomb-info-k">Notice</div><div class="tomb-info-v">${escapeHtml(msg)}</div></div></div>`;
    miniLegendHost.innerHTML = '';
  }

  function renderBar() {
    if (!modeIsQt) return renderInfo();
    const subset = filterBySType(samples, localSType);
    const { labels, values, totalQt } = aggregateQt(subset);
    if (!labels.length || !totalQt) return noDataNotice();

    canvasWrap.style.display = 'block';
    infoBox.style.display = 'none';
    if (listBySTypeEl) listBySTypeEl.style.display = 'none';
    destroyChart(); removeLegend(container);

    const colors = labels.map((_, i) => palette[i % palette.length]);
    const borders = colors.map(c => c.replace('0.85', '1'));
    const { images, ready } = preloadIcons(labels);

    miniLegendHost.innerHTML = '';
    renderMiniLegend(miniLegendHost, labels, values, images, 6);

    const ctx = canvas.getContext('2d');
    const max = Math.max(...values), min = Math.max(1, Math.min(...values));
    const useLog = (max / min) > 25;
    const badge = switcher.querySelector('.scale-badge');
    if (badge) badge.style.display = useLog ? 'inline-block' : 'none';

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values.slice(),
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1,
          borderRadius: 6,
          hoverBackgroundColor: colors.map(c => c.replace('0.85','0.95'))
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 72 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)',
            titleColor: '#fff', bodyColor: '#fff',
            callbacks: {
              label: ctx => `${ctx.parsed.y} item(s)`,
              title: ctx => ctx.label
            }
          }
        },
        scales: {
          y: {
            type: useLog ? 'logarithmic' : 'linear',
            beginAtZero: false,
            min: useLog ? 1 : undefined,
            grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
            ticks: { color: '#666', font: { size: 12 }, callback: v => useLog ? String(v) : v }
          },
          x: { grid: { display: false, drawBorder: false }, ticks: { display: false } }
        }
      },
      plugins: [{
        id: 'iconsAboveBars',
        afterDraw(c) {
          const meta = c.getDatasetMeta(0); if (!meta || !meta.data) return;
          const ctx2 = c.ctx;
          meta.data.forEach((bar, i) => {
            const lab = c.data.labels[i];
            const img = images[lab]; if (!img || !img.complete || !img.naturalWidth) return;
            const s = Math.min(bar.width * 1.2, 32);
            const x = bar.x - s/2; const y = bar.y - s - 8;
            ctx2.beginPath(); ctx2.arc(bar.x, y + s/2, s/2 + 4, 0, Math.PI*2);
            ctx2.fillStyle = 'rgba(255,255,255,0.95)'; ctx2.fill();
            ctx2.strokeStyle = colors[i]; ctx2.lineWidth = 1.25; ctx2.stroke();
            try { ctx2.drawImage(img, x, y, s, s); } catch {}
          });
        }
      }]
    });

    buildLegend(container, chart, labels, colors, images, {
      collapsible: true, startOpen: false, mode: 'bar', valuesRef: values
    });

    ready.then(() => { if (chart) chart.update(); });
  }

  function renderDonut() {
    if (!modeIsQt) return renderInfo();
    const subset = filterBySType(samples, localSType);
    const { labels, values, totalQt } = aggregateQt(subset);
    if (!labels.length || !totalQt) return noDataNotice();

    canvasWrap.style.display = 'block';
    infoBox.style.display = 'none';
    if (listBySTypeEl) listBySTypeEl.style.display = 'none';
    destroyChart(); removeLegend(container);

    const colors = labels.map((_, i) => palette[i % palette.length]);
    const { images, ready } = preloadIcons(labels);

    miniLegendHost.innerHTML = '';
    renderMiniLegend(miniLegendHost, labels, values, images, 6);

    const ctx = canvas.getContext('2d');
    chart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#fff', borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor:'rgba(0,0,0,0.85)', titleColor:'#fff', bodyColor:'#fff',
            callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} item(s)` } }
        }
      }
    });

    buildLegend(container, chart, labels, colors, images, { collapsible: true, startOpen: true, mode: 'donut' });
    ready.then(() => { if (chart) chart.update(); });
  }

  function renderInfo() {
    destroyChart(); removeLegend(container);
    canvasWrap.style.display = 'none';
    infoBox.style.display = 'block';
    if (listBySTypeEl) listBySTypeEl.style.display = 'block';
    miniLegendHost.innerHTML = '';
    const badge = switcher.querySelector('.scale-badge'); if (badge) badge.style.display = 'none';
  }

  function setActive(mode) {
    switcher.querySelectorAll('.ts-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    currentMode = mode;
  }

  // eventi switcher
  switcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.ts-btn'); if (!btn) return;
    const mode = btn.dataset.mode; setActive(mode);
    if (mode === 'bar') renderBar();
    else if (mode === 'donut') renderDonut();
    else renderInfo();
  });

  // render iniziale
  if (modeIsQt) {
    loadChartJsIfNeeded().then(() => {
      setActive('bar');           // default bar
      renderBar();                // default s_type = 'carpological'
    }).catch(err => { console.warn('[ContextPopup] Chart.js load error:', err); renderInfo(); });
  } else {
    setActive('info');
  }

  return container;
}

/* ===== taxa list (entity) — usata per le sezioni ===== */
function buildTaxaList(rows) {
  const order = { many: 3, few: 2 };
  const map = new Map();
  rows.forEach(r => {
    const e = (r.entity || '').toLowerCase().trim();
    const old = map.get(r.label);
    if (!old) { map.set(r.label, { entity: e || null, icon: iconAbsPathForTaxon(r.label) }); }
    else {
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

/* ===== nuova lista per s_type: due sezioni collassabili ===== */
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

/* ===== Scheda Info (contesto) con mini-geometry + References ===== */
function buildInfoHtmlForContext(feature) {
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
  ['Notes', p.c_notes ? escapeHtml(p.c_notes) : '-'],
  ['Brain code', p.site_code ? `<a href="https://brainplants.successoterra.net/index.html" target="_blank" rel="noopener">${escapeHtml(p.site_code)}</a>` : '-'],
  ['Site ID', escapeHtml(p.fid)]
];
  // Bibliography → "References" (split su ';')
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

  const geomPreview = geometryPreviewSVG(feature, 420, 180);

  return `
    <div class="tomb-info">
      ${infoRows}
      ${geomPreview ? `<div class="ctx-geom-box">${geomPreview}</div>` : ''}
    </div>
  `;
}
