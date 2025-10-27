// homepage_sites_graph.js
// Grafico a torta con drill-down Region → Province, tabella siti e link rapidi a pagine di dettaglio

import { getPath } from './path_utils.js';

const COLOR_GRAY = '#d4d8dd';

// palette elegante e ben separata
function palette(count, s = 70, l = 55) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const h = Math.round((360 / count) * i);
    arr.push(`hsl(${h} ${s}% ${l}%)`);
  }
  return arr;
}

// raggruppa i siti: Regione → Province → Sites
function buildIndex(sites = []) {
  const byRegion = new Map();
  sites.forEach(f => {
    const p = f.properties || {};
    const r = p.region || '—';
    const prov = p.province || '—';
    if (!byRegion.has(r)) byRegion.set(r, { count: 0, sites: [], provinces: new Map() });
    const reg = byRegion.get(r);
    reg.count += 1;
    reg.sites.push(f);

    if (!reg.provinces.has(prov)) reg.provinces.set(prov, { count: 0, sites: [] });
    const pr = reg.provinces.get(prov);
    pr.count += 1;
    pr.sites.push(f);
  });
  return byRegion;
}

// attende che i siti siano caricati (dashboard o mapManager)
async function waitForSites(maxMs = 5000) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const sites =
        (window.dashboard?.allSites && Array.isArray(window.dashboard.allSites) && window.dashboard.allSites.length)
          ? window.dashboard.allSites
          : (window.mapManager?.sitiFeatures || null);

      if (sites && sites.length) return resolve(sites);
      if (performance.now() - start > maxMs) return reject(new Error('Sites not ready'));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// UI: toggle + card grafico + link azioni + tabella
function ensureUI() {
  const host = document.getElementById('mapped-sites-list');
  if (!host) return null;

  // 1. Barra modalità (lista/grafico)
  let bar = host.querySelector('.sites-mode-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'sites-mode-bar';
    bar.innerHTML = `
      <div class="sites-mode-left">
        <h3 class="sites-title">Siti</h3>
      </div>
      <div class="sites-mode-right">
        <span class="mode-label">Lista</span>
        <label class="mode-switch">
          <input type="checkbox" id="sites-mode-toggle" aria-label="Mostra grafico">
        </label>
        <span class="mode-label">Grafico</span>
      </div>
    `;
    host.prepend(bar);
  }

  // 2. Bottone "See all records" SEMPRE visibile, subito sotto la barra modalità
  //    -> lo identifichiamo con un id dedicato così NON confondiamo col bottone legacy
  let seeAllBtn = host.querySelector('#see-all-records-global');
  if (!seeAllBtn) {
    seeAllBtn = document.createElement('button');
    seeAllBtn.id = 'see-all-records-global';     // <-- id nuovo
    seeAllBtn.className = 'see-all-records-btn'; // mantiene lo styling esistente
    seeAllBtn.textContent = 'See all records';

    // URL corretto richiesto: index.html?all=1
    seeAllBtn.addEventListener('click', () => {
      window.location.href = getPath('record_necropoli/necropoli/index.html?all=1');
    });

    // lo mettiamo subito dopo la barra .sites-mode-bar
    if (bar.nextSibling) {
      host.insertBefore(seeAllBtn, bar.nextSibling);
    } else {
      host.appendChild(seeAllBtn);
    }
  }

  // 3. Card grafico (contenitore donut, caption, tabellina province)
  let graphWrap = document.getElementById('sites-graph-container');
  if (!graphWrap) {
    graphWrap = document.createElement('div');
    graphWrap.id = 'sites-graph-container';
    graphWrap.innerHTML = `
      <div class="sites-graph-card">
        <div class="graph-header">
          <div class="graph-title">Distribuzione siti per regione</div>
        </div>

        <div class="graph-actions">
          <a id="sites-open-region" class="graph-link" href="#" target="_blank" hidden>Region samples</a>
          <a id="sites-open-province" class="graph-link" href="#" target="_blank" hidden>Province samples</a>
          <button class="graph-back" id="sites-graph-back" title="Torna alla vista per regioni">↩</button>
        </div>

        <div class="graph-canvas-wrap">
          <canvas id="sites-pie"></canvas>
        </div>

        <div class="graph-caption" id="sites-graph-caption">
          Clicca su una regione per vedere il dettaglio per province.
        </div>

        <div class="sites-table-wrapper" id="sites-graph-table" style="display:none;"></div>
      </div>
    `;
    host.appendChild(graphWrap);
  }

  return {
    toggle: document.getElementById('sites-mode-toggle'),
    graphWrap,
    backBtn: document.getElementById('sites-graph-back'),
    caption: document.getElementById('sites-graph-caption'),
    tableWrap: document.getElementById('sites-graph-table'),
    listWrap: document.getElementById('mapped-sites-container'),
    canvas: document.getElementById('sites-pie'),
    linkRegion: document.getElementById('sites-open-region'),
    linkProvince: document.getElementById('sites-open-province'),
    seeAllBtn // può tornare utile in futuro
  };
}

// Tabella siti (solo colonna "Sito" cliccabile)
function renderProvinceTable(container, regionName, provinceName, sites = []) {
  if (!container) return;

  const rows = sites.map(s => {
    const p = s.properties || {};
    const fid  = p.fid;
    const name = p.name || p.placeName || '—';
    const href = (fid != null)
      ? getPath(`record_necropoli/necropoli/index.html?fid=${encodeURIComponent(fid)}`)
      : null;
    return `<tr><td>${href ? `<a href="${href}">${name}</a>` : name}</td></tr>`;
  }).join('');

  container.innerHTML = `
    <div class="sites-table-title">
      Provincia: <strong>${provinceName}</strong> — ${sites.length} siti
    </div>
    <div class="sites-table-scroll">
      <table class="sites-table">
        <thead><tr><th>Sito</th></tr></thead>
        <tbody>${rows || '<tr><td class="empty">Nessun sito</td></tr>'}</tbody>
      </table>
    </div>
  `;
  container.style.display = 'block';
}

function setLinkActive(anchorEl, active, href = null) {
  if (!anchorEl) return;
  if (active) {
    if (href) anchorEl.href = href;
    anchorEl.hidden = false;
    anchorEl.classList.remove('graph-link--disabled');
    anchorEl.classList.add('graph-link--active');
    anchorEl.setAttribute('aria-disabled', 'false');
    anchorEl.tabIndex = 0;
  } else {
    anchorEl.hidden = false; // visibile ma disabilitato
    anchorEl.removeAttribute('href');
    anchorEl.classList.remove('graph-link--active');
    anchorEl.classList.add('graph-link--disabled');
    anchorEl.setAttribute('aria-disabled', 'true');
    anchorEl.tabIndex = -1;
  }
}

class SitesPie {
  constructor(ctx, captionEl, tableEl, linkRegionEl, linkProvinceEl, canvasEl) {
    this.ctx = ctx;
    this.canvasEl = canvasEl;
    this.captionEl = captionEl;
    this.tableEl = tableEl;
    this.linkRegionEl = linkRegionEl;
    this.linkProvinceEl = linkProvinceEl;

    this.chart = null;
    this.index = null; // Map region -> {count, sites, provinces: Map}
    this.mode = 'regions'; // 'regions' | 'provinces'
    this.selectedRegion = null;
    this._selectedProvince = null;

    this.regionColors = [];
    this.provColorsOriginal = []; // palette originale province

    // stato per doppio click "simulato"
    this._lastClickTs = 0;
    this._lastClickIndex = null;
  }

  setData(byRegionMap) {
    this.index = byRegionMap;
    this.regionColors = palette(this.index.size, 75, 55);
    this.mode = 'regions';
    this.selectedRegion = null;
    this._selectedProvince = null;
    this.provColorsOriginal = [];
    this._lastClickTs = 0;
    this._lastClickIndex = null;

    this.renderRegions();
    if (this.tableEl) this.tableEl.style.display = 'none';
    setLinkActive(this.linkRegionEl, false);
    setLinkActive(this.linkProvinceEl, false);
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  _baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 8 },
      events: ['mousemove', 'click'],
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            label: (ctx) => {
              const lab = ctx.label || '';
              const val = ctx.parsed || 0;
              return `${lab}: ${val}`;
            }
          }
        }
      },
      elements: {
        arc: { borderColor: '#fff', borderWidth: 2, offset: 10 }
      },
      animation: { duration: 350, easing: 'easeOutCubic' },
      onClick: (evt, els) => this._handleClick(evt, els)
    };
  }

  renderRegions() {
    this.destroy();
    const labels = [];
    const data = [];
    const bg = [];

    [...this.index.entries()].forEach(([regName, obj], i) => {
      labels.push(regName);
      data.push(obj.count);
      bg.push(this.regionColors[i % this.regionColors.length]);
    });

    this.chart = new Chart(this.ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: bg }] },
      options: { ...this._baseOptions(), cutout: '45%' }
    });

    this.captionEl.textContent = 'Clicca su una regione per vedere il dettaglio per province. Ctrl/Cmd-click per aprire la pagina della regione.';
    this.mode = 'regions';
    this.selectedRegion = null;
    this._selectedProvince = null;
    if (this.tableEl) this.tableEl.style.display = 'none';
    setLinkActive(this.linkRegionEl, false);
    setLinkActive(this.linkProvinceEl, false);
  }

  renderProvinces(regionName) {
    const reg = this.index.get(regionName);
    if (!reg) return;

    this.destroy();

    // inner ring (tutte le regioni, contesto)
    const regionLabels = [...this.index.keys()];
    const regionData = regionLabels.map(r => this.index.get(r)?.count || 0);
    const regionColors = regionLabels.map(() => COLOR_GRAY);

    // outer ring (province della regione selezionata)
    const provLabels = [...reg.provinces.keys()];
    const provData = provLabels.map(p => reg.provinces.get(p)?.count || 0);
    const provColors = palette(provLabels.length, 70, 55);

    // 🔑 memorizza i colori originali per il reset selezione
    this.provColorsOriginal = provColors.slice();

    this.chart = new Chart(this.ctx, {
      type: 'doughnut',
      data: {
        labels: provLabels,
        datasets: [
          {
            data: regionData,
            backgroundColor: regionColors,
            borderColor: '#fff',
            borderWidth: 2,
            offset: 4,
            radius: '58%',
            cutout: '36%'
          },
          {
            data: provData,
            backgroundColor: provColors,
            borderColor: '#fff',
            borderWidth: 2,
            offset: 12,
            radius: '100%',
            cutout: '62%'
          }
        ]
      },
      options: { ...this._baseOptions() }
    });

    this.mode = 'provinces';
    this.selectedRegion = regionName;
    this._selectedProvince = null;

    // link "Region samples": visibile/attivo ora
    setLinkActive(
      this.linkRegionEl,
      true,
      getPath(`record_necropoli/necropoli/index.html?region=${encodeURIComponent(regionName)}`)
    );

    // link "Province samples": ancora nascosto finché non seleziono una provincia
    setLinkActive(this.linkProvinceEl, false);

    this.captionEl.textContent = `Regione: ${regionName} — clicca una provincia per vedere la lista dei siti. Ctrl/Cmd-click per aprire la pagina della provincia.`;
    if (this.tableEl) this.tableEl.style.display = 'none';
  }

  _colorProvinceSelection(selectedIndex) {
    const ds = this.chart?.data?.datasets?.[1];
    if (!ds) return;
    // riparti SEMPRE dalla palette originale
    ds.backgroundColor = this.provColorsOriginal.map((c, i) => (i === selectedIndex ? c : '#d1d5db'));
    this.chart.update();
  }

  _handleClick(evt, elements) {
    if (!elements || !elements.length) return;
    const el = elements[0];

    // stato per doppio click (entro 300ms sullo stesso slice)
    const now = performance.now();
    const isDbl = (now - this._lastClickTs < 300) && (this._lastClickIndex === el.index);
    this._lastClickTs = now;
    this._lastClickIndex = el.index;

    // rilevazione ctrl/cmd
    const ctrlMeta = !!(evt?.native?.ctrlKey || evt?.native?.metaKey || evt?.ctrlKey || evt?.metaKey);

    if (this.mode === 'regions' && el.datasetIndex === 0) {
      const regionName = this.chart.data.labels[el.index];
      if (ctrlMeta || isDbl) {
        const url = getPath(`record_necropoli/necropoli/index.html?region=${encodeURIComponent(regionName)}`);
        window.open(url, '_blank');
        return;
      }
      this.renderProvinces(regionName);
      return;
    }

    if (this.mode === 'provinces' && el.datasetIndex === 1) {
      const provinceName = this.chart.data.labels[el.index];

      if (ctrlMeta || isDbl) {
        const url = getPath(`record_necropoli/necropoli/index.html?province=${encodeURIComponent(provinceName)}`);
        window.open(url, '_blank');
        return;
      }

      // evidenzia solo la provincia scelta (ripartendo dalla palette originale)
      this._colorProvinceSelection(el.index);
      this._selectedProvince = provinceName;

      // link "Province samples": ora visibile/attivo
      setLinkActive(
        this.linkProvinceEl,
        true,
        getPath(`record_necropoli/necropoli/index.html?province=${encodeURIComponent(provinceName)}`)
      );

      // render tabella
      const reg = this.index.get(this.selectedRegion);
      const pr = reg?.provinces.get(provinceName);
      renderProvinceTable(this.tableEl, this.selectedRegion, provinceName, pr?.sites || []);
      this.captionEl.textContent = `Regione: ${this.selectedRegion} — Provincia: ${provinceName}`;
    }
  }
}

// Bootstrap
(async function boot() {
  const ui = ensureUI();
  if (!ui) return;

  // ✅ default: GRAFICO attivo
  ui.toggle.checked = true;
  ui.graphWrap.style.display = 'block';
  if (ui.listWrap) ui.listWrap.style.display = 'none';

  ui.backBtn.addEventListener('click', () => {
    if (window._sitesPie) window._sitesPie.renderRegions();
  });

  ui.toggle.addEventListener('change', () => {
    const graphMode = ui.toggle.checked;
    ui.graphWrap.style.display = graphMode ? 'block' : 'none';
    if (ui.listWrap) ui.listWrap.style.display = graphMode ? 'none' : 'block';
    if (graphMode && window._sitesPie?.chart) window._sitesPie.chart.resize();
  });

  // attendi i dati
  let sites = [];
  try {
    sites = await waitForSites();
  } catch {
    return;
  }

  const byRegion = buildIndex(sites);

  const ctx = ui.canvas.getContext('2d');
  const pie = new SitesPie(ctx, ui.caption, ui.tableWrap, ui.linkRegion, ui.linkProvince, ui.canvas);
  pie.setData(byRegion);
  window._sitesPie = pie;

  window.addEventListener('resize', () => {
    if (window._sitesPie?.chart) window._sitesPie.chart.resize();
  });
})();
