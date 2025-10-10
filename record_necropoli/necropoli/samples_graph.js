import { getPath } from '../../path_utils.js';

/** ======================
 *  Utility di icone legenda
 *  ====================== */
let FAMILY_ICON = null;     // Map: family -> image_1
let TAXON_ICON  = null;     // Map: precise_taxon (valore) -> image_2

async function ensureLegendaMapsLoaded() {
  if (FAMILY_ICON && TAXON_ICON) return;
  // popolati altrove? riusa
  TAXON_ICON   = window.__TAXA_ICONS__    || null;
  FAMILY_ICON  = window.__FAMILY_ICONS__  || null;

  if (FAMILY_ICON && TAXON_ICON) return;

  try {
    const res = await fetch(getPath("data/legenda_taxa.csv"));
    const text = await res.text();
    const [headerLine, ...rows] = text.trim().split("\n");
    const headers = headerLine.split(",").map(h => h.trim());
    const get = (obj, k) => obj[headers.indexOf(k)] ?? "";

    const famMap = {};
    const taxMap = {};
    rows.forEach(line => {
      const cols = line.split(",");
      const fam  = get(cols, "category_1").trim();
      const img1 = get(cols, "image_1").trim();
      const val  = get(cols, "valore").trim();
      const img2 = get(cols, "image_2").trim();
      if (fam && img1 && !famMap[fam]) famMap[fam] = img1;
      if (val) taxMap[val] = img2 || "other.png";
    });

    FAMILY_ICON = famMap;
    TAXON_ICON  = taxMap;
    window.__FAMILY_ICONS__ = FAMILY_ICON;
    window.__TAXA_ICONS__   = TAXON_ICON;
  } catch (e) {
    console.warn("[samples_graph] impossibile caricare legenda_taxa:", e);
    FAMILY_ICON = FAMILY_ICON || {};
    TAXON_ICON  = TAXON_ICON  || {};
  }
}

/** ======================
 *  Helpers testo / escaping / wrapping
 *  ====================== */
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
  );
}

/**
 * Wrappa il testo alla prima “separazione” utile (spazio, /, -)
 * dopo la soglia `limit`. Include / o - nella riga precedente.
 * Se non trova separatori, fa hard-wrap a `limit`.
 * Ritorna array di righe.
 */
function wrapAtBoundary(text, limit){
  const s = String(text || '');
  if (s.length <= limit) return [s];

  const isSep = (ch) => ch === ' ' || ch === '/' || ch === '-';

  let i = 0;
  const out = [];
  while (i < s.length) {
    const remaining = s.length - i;
    if (remaining <= limit) { out.push(s.slice(i)); break; }

    const start = i + limit;
    let j = start;
    while (j < s.length && !isSep(s[j])) j++;

    if (j >= s.length) {
      out.push(s.slice(i, i + limit));
      i = i + limit;
    } else {
      const ch = s[j];
      const end = (ch === ' ') ? j : j + 1;
      out.push(s.slice(i, end).trimEnd());
      i = j + 1;
      while (s[i] === ' ') i++;
    }
  }
  return out;
}

/** Solo per SPECIES (chip label): se presente "subsp", mostra da lì in poi */
function chipLabelForSpecies(raw) {
  const s = String(raw || '');
  const idx = s.toLowerCase().indexOf('subsp');
  if (idx >= 0) {
    const cut = s.slice(idx).trim();
    return cut.replace(/^[-/ ]+/, ''); // rimuovi separatori iniziali
  }
  return s;
}

/** Misura testo su un canvas “volatile” per calcolo padding sinistro dinamico */
const MEASURE_CANVAS = document.createElement('canvas');
const MCTX = MEASURE_CANVAS.getContext('2d');
const CHIP_FONT = '600 11px Inter, system-ui, sans-serif';
const CHIP_LINE_H = 13; // px
function measureMaxLineWidth(lines){
  MCTX.font = CHIP_FONT;
  let w = 0;
  for (const ln of (lines || [])) w = Math.max(w, MCTX.measureText(ln).width);
  return w;
}

/** ======================
 *  Stato/Widget
 *  ====================== */
let chart = null;
let mode = 'family'; // 'family' | 'species'
let getVisibleSamplesFn = null; // fn(): Feature[]

// filtro locale per s_type: null = all | 'carpological' | 'wood'
let localSType = null;

/** API Pubblica */
export async function initSamplesGraph(options = {}) {
  await ensureLegendaMapsLoaded();
  getVisibleSamplesFn = options.getVisibleSamples || (() => []);

  // imposta la modalità leggendo lo stato attuale dello switch
  const toggle = document.getElementById('samples-graph-toggle');
  mode = toggle?.checked ? 'species' : 'family';

  if (toggle) {
    toggle.addEventListener('change', () => {
      mode = toggle.checked ? 'species' : 'family';
      renderSamplesGraph();
    });
  }

  buildSTypeToolbar();
  if (document.getElementById('samplesChartCanvas')) renderSamplesGraph();
}


// Call esplicito quando cambia la mappa/filtri
export function renderSamplesGraph() {
  const feats = (typeof getVisibleSamplesFn === 'function') ? getVisibleSamplesFn() : [];

  // modalità effettiva letta dallo switch (species/family)
  const toggle = document.getElementById('samples-graph-toggle');
  const effectiveMode = toggle?.checked ? 'species' : 'family';

  // filtro locale s_type (carpological / wood / all)
  const filtered = localSType
    ? feats.filter(f => String(f?.properties?.s_type || '').trim().toLowerCase() === localSType)
    : feats;

  // dataset top-10 (per family o precise_taxon)
  const { labels: labelsRaw, data } = buildDataset(filtered, effectiveMode);

  const canvas = document.getElementById('samplesChartCanvas');
  const container = document.getElementById('samples-chart-container');
  if (!canvas || !container) return;

  // ➜ Chip label: se SPECIES, taglia tutto prima di "subsp"
  const chipBase = (effectiveMode === 'species')
    ? labelsRaw.map(chipLabelForSpecies)
    : labelsRaw.slice();

  // etichette multi-line per l’asse Y (wrap dopo 15)
  const labelsDisplay = chipBase.map(l => wrapAtBoundary(l, 15));
  const maxLines = labelsDisplay.reduce((m, a) => Math.max(m, a.length), 1);

  // altezza dinamica del container
  const rows = Math.max(1, labelsRaw.length);
  const baseRowH = 30;
  const extraPerLine = 9;
  const rowH = baseRowH + (maxLines - 1) * extraPerLine;
  const H = Math.max(200, rowH * rows + 70);
  container.style.height = `${H}px`;

  // padding sinistro dinamico in base alla larghezza massima della “bubble”
  const maxTextW = Math.max(...labelsDisplay.map(lines => measureMaxLineWidth(lines)), 0);
  const CHIP_PADX = 8, CHIP_BORDER = 2, CHIP_GAP = 8;
  const leftPad = Math.ceil(CHIP_BORDER + CHIP_PADX * 2 + maxTextW + CHIP_GAP);

  const colors = labelsRaw.map((_, i) => PALETTE[i % PALETTE.length]);
  const cfg = makeConfig({
    labelsDisplay,
    labelsRaw,
    data,
    colors,
    leftPad,
    isSpecies: (effectiveMode === 'species')  // ➜ barre più larghe solo per species
  });

  if (!chart) {
    const ctx = canvas.getContext('2d');
    chart = new Chart(ctx, cfg);
  } else {
    chart.config.data.labels = labelsDisplay;
    chart.config.data.datasets[0].data = data;
    chart.config.data.datasets[0].backgroundColor = colors;

    // aggiorna spessori/percentuali se cambia modalità
    chart.config.data.datasets[0].barThickness = (effectiveMode === 'species') ? 18 : 14;
    chart.config.data.datasets[0].categoryPercentage = (effectiveMode === 'species') ? 0.7 : 0.6;

    chart.config.options.layout.padding.left = leftPad;
    if (chart.config.options.plugins?.yChipLabels) {
      chart.config.options.plugins.yChipLabels.lines = labelsDisplay;
      chart.config.options.plugins.yChipLabels.colors = colors;
    }
    chart.update();
  }

  // mini-legenda coerente con la modalità corrente
  renderMiniLegend(labelsRaw, effectiveMode);
}


/** ======================
 *  Dataset (top-10 per frequenza, NON pesato da qt)
 *  ====================== */
function buildDataset(features, mode) {
  const counts = Object.create(null);

  for (const f of (features || [])) {
    const p = f?.properties || {};
    const family = (p.family || p.Family || 'N/D').trim();
    const taxon  = (p.precise_taxon || '').trim();
    const key = (mode === 'species') ? (taxon || '(no taxon)') : (family || 'N/D');
    counts[key] = (counts[key] || 0) + 1; // conta i samples (no qt)
  }

  // ordina per frequenza desc e prendi top 10
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  const top10  = sorted.slice(0, 10);
  const labels = top10.map(d => d[0]);
  const data   = top10.map(d => d[1]);

  return { labels, data };
}

/** ======================
 *  Chart.js setup (bar orizzontale + plugin “chip labels”)
 *  ====================== */
function makeConfig({ labelsDisplay, labelsRaw, data, colors, leftPad, isSpecies }) {
  return {
    type: 'bar',
    data: {
      labels: labelsDisplay, // array di array → multi-line
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 1,
        borderRadius: 6,
        barThickness: isSpecies ? 18 : 14,   // ➜ più larga in species
        categoryPercentage: isSpecies ? 0.7 : 0.6,
        hoverBackgroundColor: colors.map(c => c)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      layout: { padding: { top: 8, bottom: 8, left: leftPad, right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            // Solo numero, senza titolo
            title: () => '',
            label: (ctx) => String(Number(ctx.raw || 0))
          }
        },
        // Plugin custom che disegna le “bubble” label a sinistra
        yChipLabels: {
          lines: labelsDisplay,
          colors
        }
      },
      scales: {
        x: {
          type: 'logarithmic',
          min: 1,
          grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
          ticks: {
            color: '#666',
            font: { size: 11 },
            callback: (v) => `${v}`
          }
        },
        y: {
          grid: { display: false, drawBorder: false },
          ticks: { display: false } // etichette disegnate dal plugin come chip
        }
      },
      animation: { duration: 180 }
    },
    plugins: [yChipLabelsPlugin()]
  };
}

/** Plugin: disegna chip arrotondati con bordo nel colore della barra */
function yChipLabelsPlugin() {
  return {
    id: 'yChipLabels',
    afterDatasetsDraw(chart, _args, opts) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;

      const linesArr = opts.lines || [];
      const colors   = opts.colors || [];
      const gap = 8;             // spazio fra chip e area barre
      const padX = 8, padY = 4;  // padding interno chip
      const r   = 10;            // raggio arrotondamento
      const lineH = CHIP_LINE_H;

      ctx.save();
      ctx.font = CHIP_FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      for (let i = 0; i < meta.data.length; i++) {
        const elem = meta.data[i];
        if (!elem) continue;
        const cy = elem.y;   // centro barra
        const lines = Array.isArray(linesArr[i]) ? linesArr[i] : [String(linesArr[i] || '')];

        // dimensioni chip
        let w = 0;
        for (const ln of lines) w = Math.max(w, ctx.measureText(ln).width);
        const h = padY * 2 + lineH * lines.length;

        const xRight = chart.scales.x.left - gap;
        const xLeft  = xRight - (w + padX * 2);
        const yTop   = Math.round(cy - h / 2);

        // chip (bg + bordo nel colore della barra)
        const stroke = colors[i % colors.length] || '#999';
        ctx.beginPath();
        roundRect(ctx, xLeft, yTop, w + padX * 2, h, r);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();

        // testo multi-riga
        let ty = yTop + padY + lineH / 2;
        ctx.fillStyle = '#111827';
        for (const ln of lines) {
          ctx.fillText(ln, xLeft + padX, ty);
          ty += lineH;
        }
      }

      ctx.restore();

      function roundRect(c, x, y, w, h, r) {
        const rr = Math.min(r, w/2, h/2);
        c.moveTo(x + rr, y);
        c.arcTo(x + w, y,     x + w, y + h, rr);
        c.arcTo(x + w, y + h, x,     y + h, rr);
        c.arcTo(x,     y + h, x,     y,     rr);
        c.arcTo(x,     y,     x + w, y,     rr);
        c.closePath();
      }
    }
  };
}

/** ======================
 *  Toolbar locale s_type
 *  ====================== */
function buildSTypeToolbar() {
  const host = document.querySelector('#samples-chart-section');
  if (!host) return;

  let bar = host.querySelector('.samp-stype-toolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'samp-stype-toolbar';
    bar.innerHTML = `
      <button class="stype-btn" data-stype="carpological" title="Carpological">
        <img loading="lazy" decoding="async" src="${getPath('images/objects/carpo.png')}" alt="carpological">
      </button>
      <button class="stype-btn" data-stype="wood" title="Wood">
        <img loading="lazy" decoding="async" src="${getPath('images/objects/wood.png')}" alt="wood">
      </button>
      <button class="stype-btn active" data-stype="" title="All">
        <img loading="lazy" decoding="async" src="${getPath('images/logo_semplificato.png')}" alt="all">
      </button>
    `;
    const header = host.querySelector('#samples-chart-header');
    if (header && header.nextElementSibling) {
      host.insertBefore(bar, header.nextElementSibling);
    } else {
      host.prepend(bar);
    }
  }

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.stype-btn'); if (!btn) return;
    bar.querySelectorAll('.stype-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const val = btn.getAttribute('data-stype') || '';
    localSType = val ? val.toLowerCase() : null; // '' = all
    renderSamplesGraph();
  });
}

/** ======================
 *  Mini-legend con icone (solo top-10) — con wrapping a 25
 *  ====================== */
function renderMiniLegend(labelsRaw, legendMode) {
  const wrap = document.getElementById('samples-mini-legend');
  if (!wrap) return;
  wrap.innerHTML = '';

  labelsRaw.forEach((label, i) => {
    const item = document.createElement('div');
    item.className = 'samp-leg-item';

    const sw = document.createElement('span');
    sw.className = 'samp-leg-swatch';
    sw.style.background = PALETTE[i % PALETTE.length];

    const img = document.createElement('img');
    img.className = 'samp-leg-icon';
    img.loading = 'lazy';
    img.decoding = 'async';

    let src = '';
    if (legendMode === 'family') {
      src = FAMILY_ICON?.[label] ? getPath(`images/objects/${FAMILY_ICON[label]}`) : '';
    } else {
      const img2 = TAXON_ICON?.[label] || '';
      src = img2 ? getPath(`images/objects/${img2}`) : '';
    }
    if (src) {
      const fallback = getPath('images/objects/other.png');
      img.onerror = () => { img.onerror = null; img.src = fallback; };
      img.src = src;
    } else {
      img.style.display = 'none';
    }

    const txt = document.createElement('span');
    txt.className = 'samp-leg-label';
    const lines = wrapAtBoundary(label, 25).map(escapeHtml);
    txt.innerHTML = lines.join('<br>');

    item.appendChild(sw);
    item.appendChild(img);
    item.appendChild(txt);
    wrap.appendChild(item);
  });
}

/** Tavolozza */
const PALETTE = [
  '#4f46e5','#22c55e','#f59e0b','#ef4444','#06b6d4',
  '#8b5cf6','#84cc16','#eab308','#f97316','#10b981'
];
