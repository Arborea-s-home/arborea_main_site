import { getPath } from '../../path_utils.js';

// === Colori fissi per tipologia ===
const TYPO_COLOR_MAP = {
  settlement: '#82B366',  // verde
  underwater: '#6B9CD3',  // blu chiaro
  'undet':   '#F4A3A3',   // rosso chiaro (alias di undet./undetermined/unknown)
  sacred:    '#D6B656',   // giallo
  funerary:  '#D3D3D3',   // grigio chiaro
  nd:        '#BDBDBD',   // N/D
  default:   '#BDBDBD'    // fallback per qualsiasi altra tipologia
};

// normalizza stringhe: minuscolo, niente accenti/puntini, spazi compressi
function normalizeLabel(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuovi diacritici
    .replace(/[._]/g, ' ')   // punti/underscore → spazio
    .replace(/\s+/g, ' ')    // comprimi spazi
    .trim();
}

// alias comuni → chiave canonica per la mappa colori
function canonicalTypology(label) {
  const n = normalizeLabel(label || 'N/D');

  // mapping esplicito di alias/varianti/typo
  if (n === 'n/d' || n === 'nd' || n === 'n d') return 'nd';
  if (n === 'settlment' || n === 'settlemnt') return 'settlement';

  if (n === 'undet' || n === 'undet ' || n === 'undetermined' || n === 'unknown' || n === 'undefined') return 'undet';

  // già chiavi “pulite”
  if (['settlement','underwater','sacred','funerary','undet','nd'].includes(n)) return n;

  return n; // altrimenti proviamo con n stessa (poi fallback default)
}

function getFixedColorForTypology(label) {
  const key = canonicalTypology(label);
  return TYPO_COLOR_MAP[key] || TYPO_COLOR_MAP.default;
}

/** STATE **/
let chart = null;
let currentMode = 'contexts'; // 'sites' | 'contexts'
let activeTypologies = new Set(); // normalizzate (lowercase)
let centerIconCanvas = null; // canvas con icona centrale ripulita
let iconCanvases = []; // canvases per icone delle fette (stesso ordine labels)

// Bridge verso map_viewer.js
let getFeaturesForMode = null; // fn(mode) => Feature[] visibili al momento
let onTypologyFilterChange = null; // fn({ mode, activeTypologies:Set<string> })

/** PUBLIC API **/
export async function initSiteGraph(options = {}) {
  currentMode = options.mode || 'contexts';
  getFeaturesForMode = options.getFeaturesForMode || null;
  onTypologyFilterChange = options.onFilterChange || null;

  ensureToolbar();
  centerIconCanvas = await loadAndCleanIconCanvas(getPath('images/icons/cementery.png')).catch(() => null);
}

// Render iniziale o aggiornamento completo con nuove feature
export async function renderSiteGraph(features, opts = {}) {
  if (opts.mode) currentMode = opts.mode;

  const { labels, data } = buildCounts(features);
  const total = data.reduce((a, b) => a + b, 0);

  // Prepara icone per ogni label (in parallelo)
  iconCanvases = await Promise.all(labels.map(l =>
    loadAndCleanIconCanvas(iconPathForTypology(l)).catch(() => null)
  ));

  // 🎨 Colori FISSI per tipologia
  const baseColors = labels.map(lbl => getFixedColorForTypology(lbl));
  const bgColors = calcSelectionColors(labels, baseColors);
  const borderColors = baseColors.map(c => shadeColor(c, -20));

  const cfg = makeChartConfig({ labels, data, total, bgColors, borderColors, iconCanvases });

  const canvas = document.getElementById('siteChartCanvas');
  if (!canvas) return;

  if (!chart) {
    const ctx = canvas.getContext('2d');
    chart = new Chart(ctx, cfg);
  } else {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = bgColors;
    chart.data.datasets[0].borderColor = borderColors;

    // Aggiorna plugin state
    chart.options.plugins.centerText.total = total;
    chart.options.plugins.centerText.icon = centerIconCanvas;
    chart.options.plugins.sliceIcons.icons = iconCanvases;

    chart.update();
  }
}

// Aggiorna i dati del grafico mantenendo mode/filtri correnti
export function updateSiteGraph(features) {
  return renderSiteGraph(features, { mode: currentMode });
}

// Switch esplicito di modalità (reset filtri tipologia)
export function setSiteGraphMode(mode) {
  currentMode = (mode === 'sites') ? 'sites' : 'contexts';
  activeTypologies.clear();
  notifyFilterChange();
  if (getFeaturesForMode) {
    const feats = getFeaturesForMode(currentMode) || [];
    renderSiteGraph(feats, { mode: currentMode });
  }
}

/** INTERNALS **/
function makeChartConfig({ labels, data, total, bgColors, borderColors, iconCanvases }) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 2,
        spacing: 6,
        borderRadius: 8,
        offset: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      onClick: (evt, els, chartObj) => {
        const pts = chartObj.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (!pts || !pts.length) return;
        const idx = pts[0].index;
        const label = chartObj.data.labels[idx];
      
        toggleTypologyFilter(label);
      
        // Ricalcola i colori FISSI + attenuazione selezione
        const baseColors = chartObj.data.labels.map(lbl => getFixedColorForTypology(lbl));
        chartObj.data.datasets[0].backgroundColor = calcSelectionColors(chartObj.data.labels, baseColors);
        chartObj.data.datasets[0].borderColor = baseColors.map(c => shadeColor(c, -20));
      
        chartObj.update();
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = ctx.raw;
              const total = ctx.chart.options.plugins.centerText.total || 1;
              const percentage = Math.round((Number(value) / Number(total)) * 100);
              return `${canonicalTypology(ctx.label)}: ${value} (${percentage}%)`;
            }
          }
        },
        centerText: {
          // stato plugin personalizzato (mutabile a runtime)
          total,
          icon: centerIconCanvas
        },
        sliceIcons: {
          icons: iconCanvases
        }
      }
    },
    plugins: [centerTextPlugin(), sliceIconsPlugin()]
  };
}

function buildCounts(features) {
  const counts = Object.create(null);
  for (const f of (features || [])) {
    let t = (f?.properties?.typology ?? 'N/D');
    t = (t === null || t === undefined || t === '') ? 'N/D' : String(t);
    counts[t] = (counts[t] || 0) + 1;
  }
  const labels = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  const data = labels.map(k => counts[k]);
  return { labels, data, counts };
}

function normalizeTypology(label) {
  return String(label ?? 'N/D').trim().toLowerCase();
}

function toggleTypologyFilter(label) {
  const key = normalizeTypology(label);
  if (activeTypologies.has(key)) activeTypologies.delete(key);
  else activeTypologies.add(key);
  notifyFilterChange();
}

function notifyFilterChange() {
  if (typeof onTypologyFilterChange === 'function') {
    // Passa una copia (immutabile) del Set
    onTypologyFilterChange({ mode: currentMode, activeTypologies: new Set(activeTypologies) });
  }
}

function calcSelectionColors(labels, baseColors) {
  if (!activeTypologies || activeTypologies.size === 0) return baseColors;
  return labels.map((lab, i) => {
    const on = activeTypologies.has(normalizeTypology(lab));
    return on ? baseColors[i] : withAlpha(baseColors[i], 0.25);
  });
}

/** Toolbar SITI/CONTESTI **/
function ensureToolbar() {
  const section = document.getElementById('site-chart-section');
  if (!section || section.querySelector('.chart-toolbar')) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'chart-toolbar';
  toolbar.style.cssText = 'display:flex;gap:8px;justify-content:center;margin:8px 0;';

  const btnContexts = document.createElement('button');
  btnContexts.textContent = 'Contexts';
  btnContexts.type = 'button';
  btnContexts.dataset.mode = 'contexts';

  const btnSites = document.createElement('button');
  btnSites.textContent = 'Sites';
  btnSites.type = 'button';
  btnSites.dataset.mode = 'sites';

  [btnContexts, btnSites].forEach(b => {
    b.style.cssText = 'padding:6px 10px;border-radius:10px;border:1px solid #ccc;background:#fff;cursor:pointer;';
  });

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === currentMode) return;
    currentMode = mode;
    activeTypologies.clear();
    notifyFilterChange();

    if (getFeaturesForMode) {
      const feats = getFeaturesForMode(currentMode) || [];
      renderSiteGraph(feats, { mode: currentMode });
    }
  });

  const container = document.getElementById('site-chart-container');
  section.insertBefore(toolbar, container);
}

/** Icone **/
function iconPathForTypology(label) {
  const slug = slugify(label);
  return getPath(`images/icons/${slug}.png`);
}

function slugify(str) {
  const s = String(str || 'default').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuovi accentate
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s || 'default';
}

async function loadAndCleanIconCanvas(src) {
  const img = await loadImage(src);
  return removeWhiteBackgroundToCanvas(img);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function removeWhiteBackgroundToCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) data[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
  } catch (err) {
    // Se canvas è "tainted" per CORS, ignora la pulizia (mostrerà l'immagine originale)
  }
  return canvas;
}

/** Plugins Chart.js **/
function centerTextPlugin() {
  return {
    id: 'centerText',
    beforeDraw(chart, _args, opts) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const centerX = (chartArea.left + chartArea.right) / 2;
      const centerY = (chartArea.top + chartArea.bottom) / 2;

      // icona
      const icon = opts.icon || centerIconCanvas;
      if (icon) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY - 10, 14, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(icon, centerX - 12, centerY - 22, 24, 24);
        ctx.restore();
      }

      // testo
      const total = Number(opts.total || 0);
      ctx.save();
      ctx.font = 'bold 20px Lato, sans-serif';
      ctx.fillStyle = '#2c3e50';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${total}`, centerX, centerY + 12);
      ctx.font = '12px Lato, sans-serif';
      ctx.fillText('Contexts', centerX, centerY + 32);
      ctx.restore();
    }
  };
}

function sliceIconsPlugin() {
  return {
    id: 'sliceIcons',
    afterDatasetDraw(chart, _args, opts) {
      const meta = chart.getDatasetMeta(0);
      const ctx = chart.ctx;
      const icons = opts.icons || iconCanvases;
      if (!meta?.data) return;

      meta.data.forEach((arc, i) => {
        const icon = icons[i];
        if (!icon) return;
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const radius = (arc.outerRadius + arc.innerRadius) / 2 + 12;
        const x = arc.x + Math.cos(angle) * radius;
        const y = arc.y + Math.sin(angle) * radius;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(icon, x - 12, y - 12, 24, 24);
        ctx.restore();
      });
    }
  };
}

/** Colors **/
function shadeColor(hex, percent) {
  let R = parseInt(hex.substring(1, 3), 16);
  let G = parseInt(hex.substring(3, 5), 16);
  let B = parseInt(hex.substring(5, 7), 16);
  R = Math.min(255, Math.round(R * (100 + percent) / 100));
  G = Math.min(255, Math.round(G * (100 + percent) / 100));
  B = Math.min(255, Math.round(B * (100 + percent) / 100));
  return '#' + [R, G, B].map(c => c.toString(16).padStart(2, '0')).join('');
}

function withAlpha(hex, alpha) {
  // da #rrggbb a rgba(r,g,b,alpha)
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}