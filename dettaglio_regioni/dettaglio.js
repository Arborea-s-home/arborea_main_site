import { ChartManager } from '../charts.js';
import { getRepoBasePath, getPath } from '../path_utils.js';

/**
 * Detail page for regions/provinces.
 * - Detects whether the `feature` refers to a Region or a Province by
 *   checking `data/regions.geojson` and `data/provinces.geojson`.
 * - Filters `data/siti.geojson` by `properties.region` or `properties.province` accordingly.
 * - Uses new `typology` categories: funerary, sacred, settlement, underwater, undet..
 */
export class DetailPage {
  constructor() {
    this.map = null;
    this.base = '';
    this.featureName = '';

    this.scope = null; // 'region' | 'province'
    this.boundaryFeature = null; // GeoJSON Feature for the selected boundary

    this.sitiFeatures = [];

    this.markers = L.markerClusterGroup({
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      spiderfyDistanceMultiplier: 1.5,
      maxClusterRadius: 60,
    });

    this.markers.on('clusterclick', (a) => {
      a.layer.spiderfy();
    });

    this.iconCache = {};
  }

  async loadData() {
    this.base = getRepoBasePath();

    const [sitiGeoJSON, regionsGeoJSON, provincesGeoJSON] = await Promise.all([
      fetch(`${this.base}data/siti.geojson`).then((r) => r.json()),
      fetch(`${this.base}data/regions.geojson`).then((r) => r.json()),
      fetch(`${this.base}data/provinces.geojson`).then((r) => r.json()),
    ]);

    this.sitiFeatures = sitiGeoJSON.features || [];
    this.regions = regionsGeoJSON.features || [];
    this.provinces = provincesGeoJSON.features || [];
  }

  /** Map typology -> icon path */
  getIconForTypology(typologyRaw) {
    const t = (typologyRaw || 'undet.').toString().trim().toLowerCase();
    const key = ['funerary', 'sacred', 'settlement', 'underwater', 'undet.'].includes(t)
      ? t
      : 'undet.';

    if (!this.iconCache[key]) {
      const iconPath = getPath(`images/icons/${key}.png`);
      this.iconCache[key] = L.divIcon({
        className: 'custom-marker',
        html: `
          <div class="marker-container">
            <img src="${iconPath}" class="marker-icon" />
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });
    }
    return this.iconCache[key];
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const featureName = urlParams.get('feature');

    if (!featureName) {
      console.error('Nessuna feature specificata');
      return;
    }

    this.featureName = featureName;

    await this.loadData();

    // Inject light UI upgrades (typography, list card, popup)
    this.injectDetailStyles();

    // Detect region vs province and get the boundary feature
    await this.detectScopeAndBoundary();

    this.initMap();
    this.addPageTitle(this.featureName);
    this.addSiteList(this.featureName);
    this.addLogo();
    await this.initChart();
  }

  normalize(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Decide if the feature is a region or a province by name lookup.
   */
  async detectScopeAndBoundary() {
    const target = this.normalize(this.featureName);

    const regionMatch = (this.regions || []).find((f) => this.normalize(f.properties?.name) === target);
    if (regionMatch) {
      this.scope = 'region';
      this.boundaryFeature = regionMatch;
      return;
    }

    const provinceMatch = (this.provinces || []).find((f) => this.normalize(f.properties?.name) === target);
    if (provinceMatch) {
      this.scope = 'province';
      this.boundaryFeature = provinceMatch;
      return;
    }

    // Fallback: keep old behavior (treat as region by historical/modern fields)
    console.warn('Feature non trovata in regions/provinces; fallback su filtro legacy.');
    this.scope = 'region';
    this.boundaryFeature = null;
  }

  /** Filter `siti` by region or province depending on `scope`. */
  getSitiForFeature() {
    const nameNorm = this.normalize(this.featureName);

    // New schema: properties.region / properties.province
    if (this.scope === 'province') {
      return this.sitiFeatures.filter((s) => this.normalize(s.properties?.province) === nameNorm);
    }
    if (this.scope === 'region') {
      return this.sitiFeatures.filter((s) => this.normalize(s.properties?.region) === nameNorm);
    }

    // Legacy fallback (historical/modern)
    return this.sitiFeatures.filter((s) => {
      const reg1 = s.properties?.historical_region || '';
      const reg2 = s.properties?.modern_region || '';
      return this.normalize(reg1) === nameNorm || this.normalize(reg2) === nameNorm;
    });
  }

  // Return a safe Leaflet LatLng center for a feature, or null
  getSafeCenter(feature) {
    if (!feature || !feature.geometry) return null;

    try {
      // Fast-path for Point
      if (feature.geometry.type === 'Point' && Array.isArray(feature.geometry.coordinates)) {
        const [x, y] = feature.geometry.coordinates;
        if (typeof x === 'number' && typeof y === 'number') {
          return L.latLng(y, x);
        }
      }

      // Generic: derive from bounds if valid
      const layer = L.geoJSON(feature);
      const b = layer.getBounds();
      if (b && b.isValid && b.isValid()) return b.getCenter();
    } catch (e) {
      console.warn('getSafeCenter error for feature', feature, e);
    }
    return null;
  }

  // Return a safe Leaflet LatLng center for a feature, or null
  getSafeCenter(feature) {
    if (!feature || !feature.geometry) return null;

    try {
      if (feature.geometry.type === 'Point' && Array.isArray(feature.geometry.coordinates)) {
        const [x, y] = feature.geometry.coordinates;
        if (typeof x === 'number' && typeof y === 'number') return L.latLng(y, x);
      }
      const layer = L.geoJSON(feature);
      const b = layer.getBounds();
      if (b && b.isValid && b.isValid()) return b.getCenter();
    } catch (e) {
      console.warn('getSafeCenter error for feature', feature, e);
    }
    return null;
  }

  buildSitePopupHTML(feature) {
    const p = feature.properties || {};
    const typ = (p.typology || 'undet.').toString().toLowerCase();
    const icon = getPath(`images/icons/${typ}.png`);
  
    const chrono = (p.chronology_iccd || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  
    const parentChrono = (p.parent_chronology_iccd || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  
    const brainBase = 'https://brainplants.successoterra.net';
    const brainLink = `${brainBase}/?site=${encodeURIComponent(p.site_code || '')}`;
  
    const detailHref = p.fid
      ? getPath(`record_necropoli/necropoli/index.html?fid=${p.fid}`)
      : null;
  
      return `
      <div class="site-popup-card">
        <div class="site-popup-header">
          <img class="site-popup-icon" src="${icon}" alt="${typ}">
          <div class="site-popup-titles">
            <div class="site-name">${p.name || 'Sito senza nome'}</div>
            <div class="site-sub">${this.cap(typ)} • ${this.cap(this.scope || '')}</div>
          </div>
        </div>
        <div class="site-popup-body">
          <div class="meta-row">
            <div class="meta"><span>Codice</span><b>${p.site_code || '—'}</b></div>
            <div class="meta"><span>Regione</span><b>${p.region || '—'}</b></div>
            <div class="meta"><span>Provincia</span><b>${p.province || '—'}</b></div>
          </div>
          ${chrono.length ? `<div class="chips"><span class="chip-h">Cronologie</span>${chrono.map(c=>`<span class="chip">${c}</span>`).join('')}</div>` : ''}
          ${parentChrono.length ? `<div class="chips alt"><span class="chip-h">Cronologie (macro)</span>${parentChrono.map(c=>`<span class="chip alt">${c}</span>`).join('')}</div>` : ''}
        </div>
        <div class="site-popup-actions">
          <div class="left-actions">
            ${
              p.fid
                ? `<a class="btn" href="${getPath(`record_necropoli/necropoli/index.html?fid=${p.fid}`)}">Detail</a>`
                : `<span class="btn btn-disabled">Detail</span>`
            }
          </div>
          <div class="right-actions">
            <a class="btn" target="_blank" rel="noopener" href="${brainLink}">Apri BrainPlants</a>
          </div>
        </div>
      </div>`;    
  }  

  injectDetailStyles() {
    if (document.getElementById('detail-enhanced-styles')) return;
    const css = `
      :root {
        --rounded-xl: 16px;
        --muted: #6b7280;
        --card: #ffffff;
        --chip: #eef2ff;
        --chip-alt: #f1f5f9;
      }
      body { font-feature-settings: 'liga' 1, 'kern' 1; }
      h1 { letter-spacing: .2px; font-weight: 700; }

      /* Site list as a soft card */
      #site-list-container { border: 1px solid rgba(0,0,0,0.06); border-radius: var(--rounded-xl); box-shadow: 0 8px 30px rgba(0,0,0,.08); }
      #site-list-container h3 { font-weight: 600; }
      .site-section-header { color: #475569; }
      .site-section-list li { border-bottom: 1px dashed rgba(0,0,0,.06); }

      /* Modern popup card */
      .leaflet-popup-content { margin: 0; }
      .leaflet-popup-content-wrapper.site-popup { padding: 0; border-radius: var(--rounded-xl); overflow: hidden; }
      .site-popup-card { width: 360px; max-width: 92vw; font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .site-popup-header { display:flex; gap:12px; align-items:center; padding:14px 14px 8px; border-bottom:1px solid rgba(0,0,0,.06); }
      .site-popup-icon { width:28px; height:28px; filter: drop-shadow(0 1px 1px rgba(0,0,0,.2)); }
      .site-popup-titles .site-name { font-weight: 700; font-size: 15px; line-height: 1.25; }
      .site-popup-titles .site-sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
      .site-popup-body { padding: 10px 14px 6px; }
      .meta-row { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:8px; }
      .meta span { display:block; color: var(--muted); font-size: 11px; }
      .meta b { font-size: 13px; font-weight: 600; }
      .chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
      .chips .chip-h { color: var(--muted); font-size: 11px; margin-right: 2px; }
      .chip { background: var(--chip); border: 1px solid rgba(59,130,246,.15); padding: 4px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; }
      .chip.alt { background: var(--chip-alt); border-color: rgba(2,6,23,.08); }
      .site-popup-actions { display:flex; justify-content:flex-end; gap:8px; padding: 10px 14px 12px; border-top: 1px solid rgba(0,0,0,.06); }
      .btn { display:inline-flex; align-items:center; gap:6px; padding: 6px 10px; border-radius: 10px; border:1px solid rgba(0,0,0,.12); text-decoration:none; font-weight:600; font-size: 12.5px; }
      .btn:hover { background: #f8fafc; }
      .btn-primary { color: white; background: #3a0ca3; border-color: transparent; }
      .btn-primary:hover { filter: brightness(1.05); }
    `;
    const style = document.createElement('style');
    style.id = 'detail-enhanced-styles';
    style.innerHTML = css;
    document.head.appendChild(style);
  }

  initMap() {
    const matchingSiti = this.getSitiForFeature();

    if (!this.map) {
      this.map = L.map('detail-map', { zoomControl: false });
      L.control.zoom({ position: 'bottomright' }).addTo(this.map);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap & CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(this.map);
    }

    // Clean layers
    this.markers.clearLayers();

    // Draw boundary if available
    let boundaryLayer = null;
    if (this.boundaryFeature) {
      try {
        boundaryLayer = L.geoJSON(this.boundaryFeature, {
          style: { color: '#3a0ca3', weight: 2, opacity: 0.9, fillOpacity: 0.06 },
        }).addTo(this.map);
      } catch (e) {
        console.warn('Boundary render error', e);
        boundaryLayer = null;
      }
    }

    // Add markers with safety checks and rich popup
    (matchingSiti || []).forEach((feature) => {
      const center = this.getSafeCenter(feature);
      if (!center) return; // skip invalid geometries

      const marker = L.marker(center, { icon: this.getIconForTypology(feature.properties?.typology) });

      marker.bindPopup(this.buildSitePopupHTML(feature), {
        className: 'site-popup',
        maxWidth: 420,
        minWidth: 280,
        autoPanPadding: [24, 24],
      });

      this.markers.addLayer(marker);
    });

    this.map.addLayer(this.markers);

    // Compute bounds safely: prefer boundary, else markers
    let bounds = null;
    if (boundaryLayer) {
      const b = boundaryLayer.getBounds();
      if (b && b.isValid && b.isValid()) bounds = b.pad(0.08);
    }
    if (!bounds) {
      const mb = this.markers.getBounds();
      if (mb && mb.isValid && mb.isValid()) bounds = mb.pad(0.2);
    }

    if (bounds) {
      this.map.fitBounds(bounds);
    } else {
      console.warn('Nessun bounds valido per il fit');
    }
  }

  addLogo() {
    const logo = document.createElement('img');
    logo.src = `${this.base}images/logo_semplificato.png`;
    logo.className = 'map-logo';
    logo.alt = 'Logo';
    document.getElementById('detail-map-container').appendChild(logo);
  }

  /** Capitalize helper */
  cap(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  addSiteList(featureName) {
    const container = document.getElementById('site-list-container');
    container.innerHTML = '';
  
    const scopeLabel = this.scope === 'province' ? 'Province' : 'Region';
  
    const title = document.createElement('h3');
    title.textContent = `Sites in ${featureName} (${scopeLabel})`;
    container.appendChild(title);
  
    // Pulsante “Apri regione/provincia” (sopra il grafico)
    const areaBtn = document.createElement('a');
    const areaParam = this.scope === 'province' ? 'province' : 'region';
    const areaLabel = this.scope === 'province' ? 'Apri provincia' : 'Apri regione';
    areaBtn.className = 'area-btn';
    areaBtn.href = getPath(`record_necropoli/necropoli/index.html?${areaParam}=${encodeURIComponent(this.featureName)}`);
    areaBtn.textContent = areaLabel;
    container.appendChild(areaBtn);
  
    const siti = this.getSitiForFeature();
  
    if (siti.length === 0) {
      const none = document.createElement('p');
      none.textContent = 'Nessun sito registrato.';
      container.appendChild(none);
    } else {
      const byTypology = {};
      siti.forEach((site) => {
        const key = (site.properties?.typology || 'undet.').toString().toLowerCase();
        if (!byTypology[key]) byTypology[key] = [];
        byTypology[key].push(site);
      });
  
      Object.entries(byTypology)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([typ, sites]) => {
          const section = document.createElement('div');
          section.className = 'site-section';
  
          const header = document.createElement('div');
          header.className = 'site-section-header';
          header.innerHTML = `
            <span>
              <img src="${getPath(`images/icons/${typ}.png`)}" alt="${typ}" style="width:14px;height:14px;vertical-align:-2px;margin-right:8px;opacity:0.8"> 
              ${this.cap(typ)} (${sites.length})
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
          `;
  
          const list = document.createElement('ul');
          list.className = 'site-section-list';
  
          sites.forEach((site) => {
            const li = document.createElement('li');
  
            const name = site.properties?.name || 'Sito senza nome';
            const fid = site.properties?.fid;
            if (fid) {
              const a = document.createElement('a');
              a.className = 'site-link';
              a.href = getPath(`record_necropoli/necropoli/index.html?fid=${fid}`);
              a.textContent = name;
              li.appendChild(a);
            } else {
              // Fallback: apre popup come prima
              const span = document.createElement('span');
              span.className = 'site-link disabled';
              span.textContent = name;
              span.title = 'Nessun record collegato';
              li.appendChild(span);
  
              li.addEventListener('click', () => {
                const popupHTML = this.buildSitePopupHTML(site);
                const center = this.getSafeCenter(site);
                if (!center) return;
                const tempMarker = L.marker(center, { icon: this.getIconForTypology(site.properties?.typology) }).addTo(this.map);
                tempMarker
                  .bindPopup(popupHTML, { className: 'site-popup', maxWidth: 420, minWidth: 280 })
                  .openPopup();
                setTimeout(() => this.map.removeLayer(tempMarker), 0);
              });
            }
  
            // Evidenzia siti mappati
            if (site.properties?.map === 'TRUE') {
              li.style.fontWeight = '600';
              li.style.color = 'var(--primary-color)';
            }
  
            list.appendChild(li);
          });
  
          header.addEventListener('click', () => {
            this.openSitesModal(typ, sites);
          });
  
          header.classList.add('collapsed');
          list.style.display = 'none';
  
          section.appendChild(header);
          section.appendChild(list);
          container.appendChild(section);
        });
    }
  
    container.classList.add('visible');
  }  

  createSitesModalOnce() {
    if (this._modalCreated) return;
    this._modalCreated = true;
  
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'sites-modal-overlay';
  
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'sites-modal';
  
    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title" id="sites-modal-title"></div>
        <button class="modal-close" id="sites-modal-close" aria-label="Chiudi">×</button>
      </div>
      <div class="modal-body">
        <div class="modal-sites-grid" id="sites-modal-grid"></div>
      </div>
    `;
  
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  
    const close = () => this.closeSitesModal();
    overlay.addEventListener('click', close);
    document.getElementById('sites-modal-close').addEventListener('click', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
  
  openSitesModal(typ, sites) {
    this.createSitesModalOnce();
  
    // titolo + icona
    const titleEl = document.getElementById('sites-modal-title');
    titleEl.innerHTML = `
      <img src="${getPath(`images/icons/${typ}.png`)}" alt="${typ}">
      ${this.cap(typ)} — ${sites.length} siti
    `;
  
    // grid con link/fallback
    const grid = document.getElementById('sites-modal-grid');
    grid.innerHTML = '';
    sites.forEach(site => {
      const name = site.properties?.name || 'Sito senza nome';
      const fid  = site.properties?.fid;
  
      if (fid) {
        const a = document.createElement('a');
        a.className = 'modal-site-pill';
        a.href = getPath(`record_necropoli/necropoli/index.html?fid=${fid}`);
        a.textContent = name;
        grid.appendChild(a);
      } else {
        const s = document.createElement('a');
        s.className = 'modal-site-pill disabled';
        s.textContent = name;
        s.title = 'Nessun record collegato';
        s.href = '#';
        s.addEventListener('click', (ev) => {
          ev.preventDefault();
          const center = this.getSafeCenter(site);
          if (!center) return;
          const tmp = L.marker(center, { icon: this.getIconForTypology(site.properties?.typology) }).addTo(this.map);
          tmp.bindPopup(this.buildSitePopupHTML(site), { className: 'site-popup', maxWidth: 420, minWidth: 280 }).openPopup();
          setTimeout(() => this.map.removeLayer(tmp), 0);
        });
        grid.appendChild(s);
      }
    });
  
    document.getElementById('sites-modal-overlay').style.display = 'block';
    document.getElementById('sites-modal').style.display = 'block';
  }
  
  closeSitesModal() {
    const o = document.getElementById('sites-modal-overlay');
    const m = document.getElementById('sites-modal');
    if (o) o.style.display = 'none';
    if (m) m.style.display = 'none';
  }  

  async initChart() {
    const sites = this.getSitiForFeature();
    if (sites.length === 0) {
      const el = document.getElementById('detail-chart');
      if (el) el.innerHTML = '<p>Nessun dato disponibile per quest\'area</p>';
      return;
    }

    // Count typologies for the current area
    const currentCounts = {};
    sites.forEach((site) => {
      const typ = (site.properties?.typology || 'undet.').toString().toLowerCase();
      currentCounts[typ] = (currentCounts[typ] || 0) + 1;
    });

    // Average per typology across all regions (using `properties.region` as area unit)
    const allCountsPerRegion = {}; // { regionName: { typology: count } }
    (this.sitiFeatures || []).forEach((site) => {
      const reg = this.normalize(site.properties?.region);
      const typ = (site.properties?.typology || '').toString().toLowerCase();
      if (!reg || !typ) return;
      if (!allCountsPerRegion[reg]) allCountsPerRegion[reg] = {};
      allCountsPerRegion[reg][typ] = (allCountsPerRegion[reg][typ] || 0) + 1;
    });

    const sums = {};
    const counts = {};
    Object.values(allCountsPerRegion).forEach((regionCounts) => {
      for (const typ in regionCounts) {
        sums[typ] = (sums[typ] || 0) + regionCounts[typ];
        counts[typ] = (counts[typ] || 0) + 1;
      }
    });

    const avgValues = {};
    for (const typ in sums) avgValues[typ] = sums[typ] / counts[typ];

    const chartData = Object.keys(currentCounts)
      .map((typ) => ({
        field: this.cap(typ),
        currentValue: currentCounts[typ],
        averageValue: avgValues[typ] || 1,
      }))
      .sort((a, b) => b.currentValue / b.averageValue - a.currentValue / a.averageValue);

    const chartContainer = document.createElement('div');
    chartContainer.className = 'site-list-chart';

    const siteListContainer = document.getElementById('site-list-container');
    const title = siteListContainer.querySelector('h3');
    siteListContainer.insertBefore(chartContainer, title.nextSibling);

    if (!window.chartManager) {
      window.chartManager = new ChartManager();
      await new Promise((r) => setTimeout(r, 100));
    }

    await window.chartManager.createGradientBarChart(chartData, chartContainer);
  }

  addPageTitle(featureName) {
    const title = document.createElement('h1');
    title.textContent = featureName;
    title.style.textAlign = 'center';
    title.style.margin = '20px 0';
    document.body.insertBefore(title, document.getElementById('detail-container'));
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  window.detailPage = new DetailPage();
  window.detailPage.init();
});
