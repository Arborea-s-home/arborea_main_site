// homepage_sites_graph.js
// Donut con drill-down Region → Province, tabella siti e link rapidi.
// Upgrade: pseudo-3D (extrusion) + shadow + gloss (specular) + inner shadow sul foro.
// UI: box scuro unico con header integrato (title + toggle + See all records) + body (grafico/lista).
// Fix: defer della ricostruzione chart fuori dalla pipeline eventi Chart.js (evita handleEvent undefined).

import { getPath } from "./path_utils.js";

const COLOR_GRAY = "#d4d8dd";

/* =========================
   Utils colori (HSL/HEX) per shading
   ========================= */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function darkenColor(color, amount = 18) {
  if (!color || typeof color !== "string") return "rgba(0,0,0,0.25)";

  const hslMatch = color.match(/hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%/i);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    const nl = clamp(l - amount, 8, 85);
    return `hsl(${h} ${s}% ${nl}%)`;
  }

  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const f = (x) => clamp(Math.round(x * (1 - amount / 100)), 0, 255);
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }

  return "rgba(0,0,0,0.28)";
}

/* =========================
   Chart.js plugins: shadow + extrusion + gloss + inner shadow
   ========================= */
const DonutShadowPlugin = {
  id: "donutShadow",
  beforeDatasetDraw(chart, _args, opts) {
    const o = opts || {};
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = o.color ?? "rgba(0,0,0,0.35)";
    ctx.shadowBlur = o.blur ?? 18;
    ctx.shadowOffsetX = o.offsetX ?? 0;
    ctx.shadowOffsetY = o.offsetY ?? 10;
  },
  afterDatasetDraw(chart) {
    chart.ctx.restore();
  }
};

// pseudo-3D extrusion: disegna “spessore” sotto il dataset più esterno
const DonutExtrudePlugin = {
  id: "donutExtrude",
  beforeDatasetsDraw(chart, _args, opts) {
    let bestIdx = 0;
    let bestOuter = -Infinity;
    for (let i = 0; i < chart.data.datasets.length; i++) {
      const meta = chart.getDatasetMeta(i);
      const el = meta?.data?.[0];
      const outer = el?.outerRadius ?? -Infinity;
      if (outer > bestOuter) {
        bestOuter = outer;
        bestIdx = i;
      }
    }
    chart.$_outerDsIndex = bestIdx;
    chart.$_extrudeOpts = opts || {};
  },
  beforeDatasetDraw(chart, args, _opts) {
    if (args.index !== chart.$_outerDsIndex) return;

    const opts = chart.$_extrudeOpts || {};
    const depth = clamp(opts.depth ?? 16, 0, 40);
    const steps = clamp(opts.steps ?? 14, 1, 80);
    const alpha = clamp(opts.alpha ?? 0.92, 0.05, 1);

    const meta = chart.getDatasetMeta(args.index);
    if (!meta || !meta.data || !meta.data.length) return;

    const ctx = chart.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (let s = steps; s >= 1; s--) {
      const dy = (depth * s) / steps;

      meta.data.forEach((arc) => {
        const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc;

        const baseColor = arc?.options?.backgroundColor;
        const shade = darkenColor(baseColor, 18 + (s * 10) / steps);
        ctx.fillStyle = shade;

        ctx.beginPath();
        ctx.arc(x, y + dy, outerRadius, startAngle, endAngle);
        ctx.arc(x, y + dy, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fill();
      });
    }

    ctx.restore();
  }
};

// gloss speculare: overlay “shine” per fetta (dataset più esterno)
const DonutGlossPlugin = {
  id: "donutGloss",
  afterDatasetsDraw(chart, _args, opts) {
    const o = opts || {};
    const idx = chart.$_outerDsIndex ?? 0;

    const meta = chart.getDatasetMeta(idx);
    if (!meta?.data?.length) return;

    const ctx = chart.ctx;
    const strength = clamp(o.strength ?? 0.22, 0, 0.6);
    const mode = o.composite ?? "screen";

    ctx.save();
    ctx.globalCompositeOperation = mode;

    meta.data.forEach((arc) => {
      const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, outerRadius, startAngle, endAngle);
      ctx.arc(x, y, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.clip();

      const g = ctx.createLinearGradient(
        x - outerRadius * 0.9,
        y - outerRadius * 0.9,
        x + outerRadius * 0.9,
        y + outerRadius * 0.9
      );
      g.addColorStop(0.0, `rgba(255,255,255,${strength})`);
      g.addColorStop(0.35, `rgba(255,255,255,${strength * 0.35})`);
      g.addColorStop(0.65, "rgba(255,255,255,0)");
      g.addColorStop(1.0, "rgba(255,255,255,0)");

      ctx.fillStyle = g;
      ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);

      ctx.restore();
    });

    ctx.restore();
  }
};

// inner shadow sul foro: “recessed look”
const DonutInnerShadowPlugin = {
  id: "donutInnerShadow",
  afterDatasetsDraw(chart, _args, opts) {
    const o = opts || {};
    const idx = chart.$_outerDsIndex ?? 0;

    const meta = chart.getDatasetMeta(idx);
    const first = meta?.data?.[0];
    if (!first) return;

    const ctx = chart.ctx;
    const x = first.x;
    const y = first.y;
    const innerR = first.innerRadius;
    const outerR = first.outerRadius;

    const width = clamp(o.width ?? 16, 4, 40);
    const alpha = clamp(o.alpha ?? 0.35, 0, 1);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, outerR, 0, Math.PI * 2);
    ctx.arc(x, y, innerR, Math.PI * 2, 0, true);
    ctx.closePath();
    ctx.clip();

    const g = ctx.createRadialGradient(x, y, innerR, x, y, innerR + width);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.35})`);
    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, innerR + width, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
};

// registra plugin (Chart è globale da CDN)
try {
  if (window.Chart?.register) {
    window.Chart.register(DonutShadowPlugin);
    window.Chart.register(DonutExtrudePlugin);
    window.Chart.register(DonutGlossPlugin);
    window.Chart.register(DonutInnerShadowPlugin);
  }
} catch {
  /* noop */
}

/* =========================
   Palette
   ========================= */
function palette(count, s = 70, l = 55) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const h = Math.round((360 / count) * i);
    arr.push(`hsl(${h} ${s}% ${l}%)`);
  }
  return arr;
}

/* =========================
   Build index Regione → Province → Sites
   ========================= */
function buildIndex(sites = []) {
  const byRegion = new Map();
  sites.forEach((f) => {
    const p = f.properties || {};
    const r = p.region || "—";
    const prov = p.province || "—";

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

async function waitForSites(maxMs = 5000) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const sites =
        window.dashboard?.allSites?.length
          ? window.dashboard.allSites
          : window.mapManager?.sitiFeatures || null;

      if (sites && sites.length) return resolve(sites);
      if (performance.now() - start > maxMs) return reject(new Error("Sites not ready"));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/* =========================
   UI: box scuro unico con header integrato
   ========================= */
function ensureUI() {
  const host = document.getElementById("mapped-sites-list");
  if (!host) return null;

  let panel = document.getElementById("sites-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sites-panel";
    panel.className = "sites-panel sites-panel--dark";
    panel.innerHTML = `
      <div class="sites-panel-head">
        <div class="sites-panel-title">Select a subset &amp; see the WebGis</div>

        <div class="sites-panel-controls">
          <div class="sites-toggle">
            <span class="mode-label">Lista</span>
            <label class="mode-switch mode-switch--dark">
              <input type="checkbox" id="sites-mode-toggle" aria-label="Mostra grafico">
            </label>
            <span class="mode-label">Grafico</span>
          </div>

          <button id="see-all-records-global"
                  class="see-all-records-btn see-all-records-btn--inline see-all-records-btn--dark"
                  type="button">
            See all records
          </button>
        </div>
      </div>

      <div class="sites-panel-body">
        <div id="sites-graph-area" class="sites-graph-area">
          <div class="graph-actions graph-actions--top">
            <a id="sites-open-region" class="graph-link" href="#" target="_blank" hidden>Region samples</a>
            <a id="sites-open-province" class="graph-link" href="#" target="_blank" hidden>Province samples</a>
            <button class="graph-back" id="sites-graph-back" title="Torna alla vista per regioni" type="button">↩</button>
          </div>

          <div class="graph-canvas-wrap graph-canvas-wrap--dark">
            <canvas id="sites-pie"></canvas>
            <div class="graph-center-label" id="sites-center-label" aria-hidden="true">
              <div class="kpi">—</div>
              <div class="sub">—</div>
            </div>
          </div>

          <div class="graph-caption" id="sites-graph-caption">
            Clicca su una regione per vedere il dettaglio per province.
          </div>

          <div class="sites-table-wrapper" id="sites-graph-table" style="display:none;"></div>
        </div>

        <div id="sites-list-area" class="sites-list-area"></div>
      </div>
    `;
    host.prepend(panel);
  }

  const seeAllBtn = panel.querySelector("#see-all-records-global");
  if (seeAllBtn && !seeAllBtn.dataset.bound) {
    seeAllBtn.dataset.bound = "1";
    seeAllBtn.addEventListener("click", () => {
      window.location.href = getPath("record_necropoli/necropoli/index.html?all=1");
    });
  }

  const listArea = panel.querySelector("#sites-list-area");
  const graphArea = panel.querySelector("#sites-graph-area");

  // sposta la lista esistente (creata da dashboard.js) dentro listArea
  const listWrap = document.getElementById("mapped-sites-container");
  if (listWrap && listWrap.parentElement !== listArea) listArea.appendChild(listWrap);

  // nascondi titolo legacy
  const legacyH3 = listWrap?.querySelector(":scope > h3");
  if (legacyH3) legacyH3.style.display = "none";

  return {
    toggle: panel.querySelector("#sites-mode-toggle"),
    seeAllBtn,
    listArea,
    listWrap,
    graphArea,
    backBtn: panel.querySelector("#sites-graph-back"),
    caption: panel.querySelector("#sites-graph-caption"),
    tableWrap: panel.querySelector("#sites-graph-table"),
    canvas: panel.querySelector("#sites-pie"),
    linkRegion: panel.querySelector("#sites-open-region"),
    linkProvince: panel.querySelector("#sites-open-province"),
    centerEl: panel.querySelector("#sites-center-label")
  };
}

/* =========================
   Table renderer
   ========================= */
function renderProvinceTable(container, _regionName, provinceName, sites = []) {
  if (!container) return;

  const rows = sites
    .map((s) => {
      const p = s.properties || {};
      const fid = p.fid;
      const name = p.name || p.placeName || "—";
      const href =
        fid != null ? getPath(`record_necropoli/necropoli/index.html?fid=${encodeURIComponent(fid)}`) : null;
      return `<tr><td>${href ? `<a href="${href}">${name}</a>` : name}</td></tr>`;
    })
    .join("");

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
  container.style.display = "block";
}

function setLinkActive(anchorEl, active, href = null) {
  if (!anchorEl) return;

  if (active) {
    if (href) anchorEl.href = href;
    anchorEl.hidden = false;
    anchorEl.classList.remove("graph-link--disabled");
    anchorEl.classList.add("graph-link--active");
    anchorEl.setAttribute("aria-disabled", "false");
    anchorEl.tabIndex = 0;
  } else {
    anchorEl.hidden = false;
    anchorEl.removeAttribute("href");
    anchorEl.classList.remove("graph-link--active");
    anchorEl.classList.add("graph-link--disabled");
    anchorEl.setAttribute("aria-disabled", "true");
    anchorEl.tabIndex = -1;
  }
}

/* =========================
   Chart controller
   ========================= */
class SitesPie {
  constructor(ctx, captionEl, tableEl, linkRegionEl, linkProvinceEl, centerEl) {
    this.ctx = ctx;
    this.captionEl = captionEl;
    this.tableEl = tableEl;
    this.linkRegionEl = linkRegionEl;
    this.linkProvinceEl = linkProvinceEl;
    this.centerEl = centerEl;

    this.chart = null;
    this.index = null;

    this.mode = "regions";
    this.selectedRegion = null;
    this._selectedProvince = null;

    this.regionColors = [];
    this.provColorsOriginal = [];

    this._lastClickTs = 0;
    this._lastClickIndex = null;

    // per annullare navigazioni rapidissime (click multipli)
    this._navToken = 0;
  }

  _defer(fn) {
    const t = ++this._navToken;
    requestAnimationFrame(() => {
      if (t !== this._navToken) return;
      fn();
    });
  }

  _setCenter(kpi, sub) {
    if (!this.centerEl) return;
    const k = this.centerEl.querySelector(".kpi");
    const s = this.centerEl.querySelector(".sub");
    if (k) k.textContent = kpi ?? "—";
    if (s) s.textContent = sub ?? "—";
  }

  setData(byRegionMap) {
    this.index = byRegionMap;
    this.regionColors = palette(this.index.size, 75, 55);

    this.mode = "regions";
    this.selectedRegion = null;
    this._selectedProvince = null;
    this.provColorsOriginal = [];
    this._lastClickTs = 0;
    this._lastClickIndex = null;

    this.renderRegions();
    if (this.tableEl) this.tableEl.style.display = "none";
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
      layout: { padding: 10 },
      // IMPORTANT: non forziamo `events:` -> usiamo i default Chart.js per evitare edge-case
      plugins: {
        legend: { display: false },

        donutShadow: { blur: 20, offsetY: 12 },
        donutExtrude: { depth: 18, steps: 16, alpha: 0.92 },
        donutGloss: { strength: 0.24, composite: "screen" },
        donutInnerShadow: { width: 18, alpha: 0.36 },

        tooltip: {
          enabled: true,
          backgroundColor: "rgba(10, 15, 28, 0.92)",
          titleColor: "#fff",
          bodyColor: "#e5e7eb",
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label: (ctx) => `${ctx.label || ""}: ${ctx.parsed || 0}`
          }
        }
      },
      elements: {
        arc: {
          borderColor: "rgba(255,255,255,0.85)",
          borderWidth: 3,
          borderRadius: 14,
          spacing: 5,
          hoverOffset: 18
        }
      },
      animation: { duration: 520, easing: "easeOutCubic" },
      onClick: (evt, els) => this._handleClick(evt, els)
    };
  }

  renderRegions() {
    this.destroy();

    const labels = [];
    const data = [];
    const bg = [];

    let total = 0;
    [...this.index.entries()].forEach(([regName, obj], i) => {
      labels.push(regName);
      data.push(obj.count);
      total += obj.count;
      bg.push(this.regionColors[i % this.regionColors.length]);
    });

    this.chart = new Chart(this.ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: bg }] },
      options: { ...this._baseOptions(), cutout: "62%" }
    });

    this._setCenter(String(total), "Total sites");
    this.captionEl.textContent =
      "Clicca su una regione per vedere il dettaglio per province. Ctrl/Cmd-click per aprire la pagina della regione.";

    this.mode = "regions";
    this.selectedRegion = null;
    this._selectedProvince = null;

    if (this.tableEl) this.tableEl.style.display = "none";
    setLinkActive(this.linkRegionEl, false);
    setLinkActive(this.linkProvinceEl, false);
  }

  renderProvinces(regionName) {
    const reg = this.index.get(regionName);
    if (!reg) return;

    this.destroy();

    const regionLabels = [...this.index.keys()];
    const regionData = regionLabels.map((r) => this.index.get(r)?.count || 0);
    const regionColors = regionLabels.map(() => COLOR_GRAY);

    const provLabels = [...reg.provinces.keys()];
    const provData = provLabels.map((p) => reg.provinces.get(p)?.count || 0);
    const provColors = palette(provLabels.length, 70, 55);
    this.provColorsOriginal = provColors.slice();

    this.chart = new Chart(this.ctx, {
      type: "doughnut",
      data: {
        labels: provLabels,
        datasets: [
          {
            data: regionData,
            backgroundColor: regionColors,
            borderColor: "rgba(255,255,255,0.55)",
            borderWidth: 2,
            borderRadius: 10,
            spacing: 2,
            offset: 2,
            radius: "58%",
            cutout: "36%"
          },
          {
            data: provData,
            backgroundColor: provColors,
            borderColor: "rgba(255,255,255,0.85)",
            borderWidth: 3,
            borderRadius: 14,
            spacing: 5,
            offset: 16,
            radius: "100%",
            cutout: "62%"
          }
        ]
      },
      options: { ...this._baseOptions() }
    });

    this.mode = "provinces";
    this.selectedRegion = regionName;
    this._selectedProvince = null;

    this._setCenter(String(reg.count), regionName);

    setLinkActive(
      this.linkRegionEl,
      true,
      getPath(`record_necropoli/necropoli/index.html?region=${encodeURIComponent(regionName)}`)
    );
    setLinkActive(this.linkProvinceEl, false);

    this.captionEl.textContent =
      `Regione: ${regionName} — clicca una provincia per vedere la lista dei siti. Ctrl/Cmd-click per aprire la pagina della provincia.`;

    if (this.tableEl) this.tableEl.style.display = "none";
  }

  _colorProvinceSelection(selectedIndex) {
    const ds = this.chart?.data?.datasets?.[1];
    if (!ds) return;

    ds.backgroundColor = this.provColorsOriginal.map((c, i) => (i === selectedIndex ? c : "#d1d5db"));
    this.chart.update();
  }

  _handleClick(evt, elements) {
    if (!elements || !elements.length) return;
    const el = elements[0];

    const now = performance.now();
    const isDbl = now - this._lastClickTs < 300 && this._lastClickIndex === el.index;
    this._lastClickTs = now;
    this._lastClickIndex = el.index;

    const ctrlMeta = !!(evt?.native?.ctrlKey || evt?.native?.metaKey || evt?.ctrlKey || evt?.metaKey);

    if (this.mode === "regions" && el.datasetIndex === 0) {
      const regionName = this.chart.data.labels[el.index];

      if (ctrlMeta || isDbl) {
        const url = getPath(`record_necropoli/necropoli/index.html?region=${encodeURIComponent(regionName)}`);
        window.open(url, "_blank");
        return;
      }

      // ✅ FIX: differiamo la ricostruzione fuori dallo stack evento di Chart.js
      this._defer(() => this.renderProvinces(regionName));
      return;
    }

    if (this.mode === "provinces" && el.datasetIndex === 1) {
      const provinceName = this.chart.data.labels[el.index];

      if (ctrlMeta || isDbl) {
        const url = getPath(`record_necropoli/necropoli/index.html?province=${encodeURIComponent(provinceName)}`);
        window.open(url, "_blank");
        return;
      }

      this._colorProvinceSelection(el.index);
      this._selectedProvince = provinceName;

      const reg = this.index.get(this.selectedRegion);
      const pr = reg?.provinces.get(provinceName);

      this._setCenter(String(pr?.count || 0), provinceName);

      setLinkActive(
        this.linkProvinceEl,
        true,
        getPath(`record_necropoli/necropoli/index.html?province=${encodeURIComponent(provinceName)}`)
      );

      renderProvinceTable(this.tableEl, this.selectedRegion, provinceName, pr?.sites || []);
      this.captionEl.textContent = `Regione: ${this.selectedRegion} — Provincia: ${provinceName}`;
    }
  }
}

/* =========================
   Bootstrap
   ========================= */
(async function boot() {
  const ui = ensureUI();
  if (!ui) return;

  // default: GRAFICO attivo
  ui.toggle.checked = true;
  ui.graphArea.style.display = "block";
  ui.listArea.style.display = "none";

  ui.backBtn.addEventListener("click", () => {
    if (!window._sitesPie) return;
    // non è strettamente necessario, ma è coerente col fix (zero edge-case)
    window._sitesPie._defer(() => window._sitesPie.renderRegions());
  });

  ui.toggle.addEventListener("change", () => {
    const graphMode = ui.toggle.checked;

    ui.graphArea.style.display = graphMode ? "block" : "none";
    ui.listArea.style.display = graphMode ? "none" : "block";

    if (graphMode && window._sitesPie?.chart) window._sitesPie.chart.resize();
  });

  let sites = [];
  try {
    sites = await waitForSites();
  } catch {
    return;
  }

  const byRegion = buildIndex(sites);

  const ctx = ui.canvas.getContext("2d");
  const pie = new SitesPie(ctx, ui.caption, ui.tableWrap, ui.linkRegion, ui.linkProvince, ui.centerEl);
  pie.setData(byRegion);
  window._sitesPie = pie;

  window.addEventListener("resize", () => {
    if (window._sitesPie?.chart) window._sitesPie.chart.resize();
  });
})();
