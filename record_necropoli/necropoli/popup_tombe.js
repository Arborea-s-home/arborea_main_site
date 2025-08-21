// popup_tombe.js (MyMiTo — versione con switcher, donut, legenda e info)
import { getPath } from '../../path_utils.js';

/* === Carica CSS del popup (con controllo duplicati) === */
(function loadPopupTombeCSS() {
  if ([...document.styleSheets].some(s => s.href && s.href.includes('popup_tombe.css'))) return;
  // 1) relativo al file corrente (…/necropoli/ → …/css/)
  let href;
  try { href = new URL('../css/popup_tombe.css', import.meta.url).href; } catch (_) {}
  // 2) fallback via getPath (se definito) o stringa relativa
  if (!href) href = (typeof getPath === 'function')
      ? getPath('css/popup_tombe.css')
      : '../css/popup_tombe.css';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  // fallback finale se il primo tentativo fallisce
  link.onerror = () => {
    const alt = '../css/popup_tombe.css';
    if (link.href !== alt) {
      link.href = alt;
    }
  };
  document.head.appendChild(link);
})();

/* === Chart.js (v4) === */
function loadChartJsIfNeeded() {
  if (typeof Chart !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* === Utility icone per strumenti === */
function getIconPath(label) {
  if (!label || typeof label !== 'string') return getPath('images/objects/other.png');
  const slug = label.toLowerCase().trim(); // coerente con MyMiTo
  return getPath(`images/objects/${slug}.png`);
}

/* Precarica icone (con fallback) e restituisce { images, ready } */
function preloadIcons(labels) {
  const images = {};
  const fallbackSrc = getPath('images/objects/other.png');
  if (!labels || labels.length === 0) {
    return { images, ready: Promise.resolve() };
  }
  let remaining = labels.length;
  const ready = new Promise((resolve) => {
    labels.forEach((label) => {
      const img = new Image();
      img.onload = () => { if (--remaining <= 0) resolve(); };
      img.onerror = () => {
        img.onerror = () => { if (--remaining <= 0) resolve(); };
        img.src = fallbackSrc;
      };
      img.src = getIconPath(label);
      images[label] = img;
    });
  });
  return { images, ready };
}

/* =========
   LEGEND
   ========= */
function removeLegend(container) {
  const old = container.querySelector('.legend-collapsible')
           || container.querySelector('.donut-legend');
  if (old) old.remove();
}

/**
 * Crea la legenda.
 * - Se options.collapsible === true, usa <details>…</details> con summary “Legend”
 * - options.mode: 'donut' | 'bar' (per decidere il comportamento ON/OFF)
 * - options.valuesRef: array dei valori originali (necessario per il bar)
 */
function buildLegend(container, chart, labels, colors, images, options = {}) {
  const { collapsible = false, startOpen = true, mode = 'donut', valuesRef = [] } = options;

  removeLegend(container);

  let hostEl = container;
  if (collapsible) {
    const details = document.createElement('details');
    details.className = 'legend-collapsible';
    if (startOpen) details.open = true;
    details.innerHTML = `
      <summary>Legend</summary>
      <div class="legend-body"></div>
    `;
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
    img.src = (icon && icon.complete && icon.naturalWidth)
      ? icon.src
      : getPath('images/objects/other.png');
    if (icon && !icon.complete) {
      icon.addEventListener('load', () => { img.src = icon.src; }, { once: true });
    }
    swatch.appendChild(img);

    const text = document.createElement('span');
    text.className = 'donut-legend-label';
    text.textContent = label;

    item.appendChild(swatch);
    item.appendChild(text);

    item.addEventListener('click', () => {
      if (mode === 'donut') {
        const visible = chart.getDataVisibility(i);
        chart.toggleDataVisibility(i);
        chart.update();
        item.classList.toggle('disabled', visible);
      } else {
        // BAR: nascondi/mostra singola barra usando null
        const ds = chart.data.datasets[0];
        const currentlyHidden = ds.data[i] == null;
        ds.data[i] = currentlyHidden ? valuesRef[i] : null;
        chart.update();
        item.classList.toggle('disabled', !currentlyHidden);
      }
    });

    legend.appendChild(item);
  });

  hostEl.appendChild(legend);
}

/* =========
   POPUP
   ========= */
export function createTombaPopup(tombaFeature, oggettiFeatures = []) {
  const container = document.createElement('div');
  container.className = 'popup-tomba-wrapper';

  const nomeTomba = tombaFeature?.properties?.name || 'Tomb';

  // Titolo
  const title = document.createElement('div');
  title.className = 'popup-tomba-title';
  title.textContent = nomeTomba;
  container.appendChild(title);

  // Filtra oggetti associati alla tomba (match case-insensitive su properties.tomba)
  const oggettiTomba = (Array.isArray(oggettiFeatures) ? oggettiFeatures : []).filter(obj => {
    const nomeTombaOggetto = (obj?.properties?.tomba || '').trim().toLowerCase();
    return nomeTombaOggetto === nomeTomba.trim().toLowerCase();
  });

  // Nessun oggetto
  if (oggettiTomba.length === 0) {
    const noData = document.createElement('p');
    noData.className = 'popup-tomba-info';
    noData.textContent = 'Empty tomb';
    container.appendChild(noData);
    return container;
  }

  // === Aggrega per STRUMENTO ===
  const countsMap = new Map();
  let numOggetti = 0;
  let numAmbigui = 0;

  oggettiTomba.forEach(obj => {
    numOggetti++;
    const strumenti = String(obj?.properties?.strumento || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (strumenti.length > 1) numAmbigui++;

    strumenti.forEach(str => {
      countsMap.set(str, (countsMap.get(str) || 0) + 1);
    });
  });

  const entries = Array.from(countsMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const labels = entries.map(e => e[0]);
  const values = entries.map(e => e[1]);

  // === Info riassuntiva (MyMiTo) ===
  const info = document.createElement('div');
  info.className = 'popup-tomba-info';
  info.innerHTML = `
    <div class="info-item"><span class="info-label">Objects:</span> <span class="info-value">${numOggetti}</span></div>
    <div class="info-item"><span class="info-label">Multi-class Object(s):</span> <span class="info-value">${numAmbigui}</span></div>
  `;
  container.appendChild(info);

  // === Switcher ===
  const switcher = document.createElement('div');
  switcher.className = 'tomb-switcher';
  switcher.innerHTML = `
    <button class="ts-btn active" data-mode="bar">Bar chart</button>
    <button class="ts-btn" data-mode="donut">Donut</button>
    <button class="ts-btn" data-mode="info">Info</button>
    <span class="scale-badge" style="display:none;">log scale</span>
  `;
  container.appendChild(switcher);

  // === Canvas + info box ===
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'popup-tomba-canvas-container';
  const canvas = document.createElement('canvas');
  canvas.className = 'popup-tomba-canvas';
  canvasWrap.appendChild(canvas);
  container.appendChild(canvasWrap);

  const infoBox = document.createElement('div');
  infoBox.className = 'tomb-info-box';
  infoBox.style.display = 'none';
  infoBox.innerHTML = buildInfoHtmlMyMiTo(tombaFeature);
  container.appendChild(infoBox);

  // === Chart ===
  let chart = null;
  const palette = [
    'rgba(126,87,194,0.85)','rgba(76,175,80,0.85)','rgba(33,150,243,0.85)',
    'rgba(244,67,54,0.85)','rgba(255,152,0,0.85)','rgba(0,188,212,0.85)',
    'rgba(156,39,176,0.85)'
  ];
  const colors = labels.map((_, i) => palette[i % palette.length]);
  const borders = colors.map(c => c.replace('0.85', '1'));

  function destroyChart() {
    if (chart) { try { chart.destroy(); } catch {} chart = null; }
  }

  const { images, ready: iconsReady } = preloadIcons(labels);

  function renderBar() {
    canvasWrap.style.display = 'block';
    infoBox.style.display = 'none';
    destroyChart();
    removeLegend(container);

    const ctx = canvas.getContext('2d');

    // scala log automatica se molto sbilanciato
    const max = Math.max(...values);
    const min = Math.max(1, Math.min(...values));
    const useLog = (max / min) > 25;
    const badge = switcher.querySelector('.scale-badge');
    badge.style.display = useLog ? 'inline-block' : 'none';

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values.slice(), // copia
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1,
          borderRadius: 6,
          hoverBackgroundColor: colors.map(c => c.replace('0.85','0.95'))
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 72 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            yAlign: 'top',
            callbacks: {
              label: ctx => `${ctx.parsed.y} object(s)`,
              title: ctx => `${ctx.label}`
            }
          }
        },
        scales: {
          y: {
            type: useLog ? 'logarithmic' : 'linear',
            beginAtZero: false,
            grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
            ticks: {
              color: '#666', font: { size: 12 },
              callback: (val) => useLog ? String(val) : val
            },
            min: useLog ? 1 : undefined
          },
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { display: false }
          }
        }
      },
      plugins: [{
        id: 'iconsAboveBars',
        afterDraw(c) {
          const { ctx } = c;
          const meta = c.getDatasetMeta(0);
          if (!meta || !meta.data) return;

          meta.data.forEach((bar, i) => {
            const label = c.data.labels[i];
            const img = images[label];
            if (!img || !img.complete || !img.naturalWidth) return;

            const imgSize = Math.min(bar.width * 1.2, 32);
            const x = bar.x - imgSize / 2;
            const y = bar.y - imgSize - 8;

            ctx.beginPath();
            ctx.arc(bar.x, y + imgSize / 2, imgSize / 2 + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.fill();
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = 1.25;
            ctx.stroke();

            try { ctx.drawImage(img, x, y, imgSize, imgSize); } catch (_) {}
          });
        }
      }]
    });

    // Legenda collassabile per il BAR (default chiusa)
    buildLegend(container, chart, labels, colors, images, {
      collapsible: true,
      startOpen: false,
      mode: 'bar',
      valuesRef: values
    });

    iconsReady.then(() => { if (chart) chart.update(); });
  }

  function renderDonut() {
    canvasWrap.style.display = 'block';
    infoBox.style.display = 'none';
    destroyChart();
    removeLegend(container);

    const ctx = canvas.getContext('2d');

    chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)',
            titleColor: '#fff',
            bodyColor: '#fff',
            callbacks: {
              label: ctx => `${ctx.label}: ${ctx.parsed} object(s)`
            }
          }
        }
      }
    });

    // Legenda (aperta) per il DONUT
    buildLegend(container, chart, labels, colors, images, {
      collapsible: true,
      startOpen: true,
      mode: 'donut'
    });

    // Quando le icone sono pronte, ricostruisci la legenda (aggiorna le immagini)
    iconsReady.then(() => {
      removeLegend(container);
      buildLegend(container, chart, labels, colors, images, {
        collapsible: true,
        startOpen: true,
        mode: 'donut'
      });
    });
  }

  function renderInfo() {
    destroyChart();
    canvasWrap.style.display = 'none';
    infoBox.style.display = 'block';
    removeLegend(container);
    switcher.querySelector('.scale-badge').style.display = 'none';
  }

  function setActive(mode) {
    switcher.querySelectorAll('.ts-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  // Switcher events
  switcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.ts-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    setActive(mode);
    if (mode === 'bar') renderBar();
    else if (mode === 'donut') renderDonut();
    else renderInfo();
  });

  // Render iniziale
  loadChartJsIfNeeded().then(renderBar).catch(err => {
    console.warn('[TombsPopup] Chart.js load error:', err);
  });

  return container;
}

/* === HTML “Info” per MyMiTo === */
function buildInfoHtmlMyMiTo(feature) {
  const p = feature?.properties || {};
  const rows = [
    ['Tipologia', p.tipologia],
    ['Datazione', p.datazione],
    ['Conservazione', p.conservazione],
    ['Segni di manipolazione', p.segni_manipolazione],
    ['Collocazione', p.collocazione],
    ['Affidabilità dato', p.affidabilita_dato],
    ['Alias', p.alias],
    ['Sito ID', p.sito_id],
    ['Old ID', p.old_id],
    ['ID (tabella tombe_2)', p.tombe_2_ID_tomba],
  ];
  const infoRows = rows
    .filter(([,v]) => v != null && String(v).trim() !== '')
    .map(([k,v]) => `
      <div class="tomb-info-row">
        <div class="tomb-info-k">${escapeHtml(k)}</div>
        <div class="tomb-info-v">${escapeHtml(String(v))}</div>
      </div>
    `).join('');

  // Allegato PDF (se presente)
  const allegato = (p.allegato || '').toString().trim();
  const docLink = allegato
    ? `<div class="tomb-info-doc">
         <a href="${getPath(allegato)}" target="_blank" rel="noopener">Apri allegato</a>
       </div>`
    : '';

  return `
    <div class="tomb-info">
      ${infoRows || '<div class="tomb-info-row"><em>No extra info.</em></div>'}
      ${docLink}
    </div>
  `;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
  );
}
