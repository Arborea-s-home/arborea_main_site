import { addObjectsLayer } from './objects_layer.js';
import { initCategoryFilter } from './filter.js';
import { calcolaAffinitaTombe } from '../affinity_utils/tombs_affinity.js';
import { initAffinityDashboard } from '../affinity_utils/affinity_index.js';
import { renderSiteGraph } from './site_graph.js';
import { createTombaPopup } from './popup_tombe.js';
import { getPath } from '../../path_utils.js';

(async () => {
  const params = new URLSearchParams(window.location.search);
  const fid = params.get("fid");
  if (!fid) {
    alert("Parametro 'fid' mancante");
    return;
  }

  const affinityDashboard = initAffinityDashboard();

  // === Sito + raster ===
  const sitiResponse = await fetch(getPath("data/siti.geojson"));
  const sitiData = await sitiResponse.json();
  const site = sitiData.features.find(f => f.properties.fid == fid);
  if (!site || !site.properties.map) {
    alert("Sito non trovato o mappa mancante");
    return;
  }
  const coords = site.geometry.coordinates;
  const mapFile = site.properties.map.toLowerCase().replace(/\.tif$/i, '') + ".tif";

  const map = L.map("map", { minZoom: 15, maxZoom: 22 }).setView([coords[1], coords[0]], 18);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CartoDB</a>'
  }).addTo(map);

  const tiffResponse = await fetch(getPath(`images/maps/${mapFile}`));
  if (!tiffResponse.ok) throw new Error("GeoTIFF non trovato: " + mapFile);
  const arrayBuffer = await tiffResponse.arrayBuffer();
  const georaster = await parseGeoraster(arrayBuffer);
  const rasterLayer = new GeoRasterLayer({ georaster, opacity: 0.7, resolution: 256 });
  rasterLayer.addTo(map);
  map.fitBounds(rasterLayer.getBounds());

  // === Tombe & Oggetti (base, senza filtro affidabilità) ===
  const tombeResponse = await fetch(getPath("data/tombe.geojson"));
  const tombeData = await tombeResponse.json();
  const tombeBase = tombeData.features.filter(t =>
    t.properties.sito_id == fid && t.properties.parent_ID == null
  );

  const oggettiResponse = await fetch(getPath("data/oggetti.geojson"));
  const oggettiData = await oggettiResponse.json();
  const nomiTombeBase = new Set(tombeBase.map(t => (t.properties.name || '').trim()));
  const oggettiBase = oggettiData.features.filter(o =>
    nomiTombeBase.has((o.properties.tomba || '').trim())
  );

  // Grafico (dataset base)
  window.renderSiteGraphLazy = () => renderSiteGraph(tombeBase);

  // Affinità (dataset base)
  const calcola = calcolaAffinitaTombe({ features: tombeBase }, { features: oggettiBase });

  // Associazione oggetti→tomba (utility)
  function buildOggettiPerTomba(features) {
    const m = {};
    features.forEach(obj => {
      const key = (obj.properties.tomba || '').trim();
      if (!key) return;
      if (!m[key]) m[key] = [];
      m[key].push(obj);
    });
    return m;
  }

  // ====== Slider Affidabilità (0..4) ======
  const AFF_MIN = 0, AFF_MAX = 4, AFF_STEP = 1;
  const precMinInput = document.getElementById('precision-min');
  const precMaxInput = document.getElementById('precision-max');
  const precRangeLbl = document.getElementById('precision-range-label');
  const rangeFillEl  = document.getElementById('precision-range-fill');
  const bubbleMin    = document.getElementById('prec-bubble-min');
  const bubbleMax    = document.getElementById('prec-bubble-max');
  const rangeEl      = document.getElementById('precision-range');

  let currentAffMin = AFF_MIN;
  let currentAffMax = AFF_MAX;

  [precMinInput, precMaxInput].forEach(el => {
    if (!el) return;
    el.min = String(AFF_MIN);
    el.max = String(AFF_MAX);
    el.step = String(AFF_STEP);
  });

  const pct = (v) => ((v - AFF_MIN) / (AFF_MAX - AFF_MIN)) * 100;
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function snapToStep(v) {
    const snapped = Math.round((v - AFF_MIN) / AFF_STEP) * AFF_STEP + AFF_MIN;
    return clamp(snapped, AFF_MIN, AFF_MAX);
  }
  function updateAffUI() {
    if (precRangeLbl) {
      precRangeLbl.textContent = (currentAffMin === currentAffMax)
        ? `${currentAffMin}` : `${currentAffMin}–${currentAffMax}`;
    }
    const left  = pct(currentAffMin);
    const right = pct(currentAffMax);
    if (rangeFillEl) {
      rangeFillEl.style.left  = `calc(${left}% )`;
      rangeFillEl.style.width = `calc(${Math.max(0, right - left)}% )`;
    }
    if (bubbleMin) { bubbleMin.style.left = `calc(${left}% )`;  bubbleMin.textContent = String(currentAffMin); }
    if (bubbleMax) { bubbleMax.style.left = `calc(${right}% )`; bubbleMax.textContent = String(currentAffMax); }
  }
  function withinAffidabilita(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return false;
    if (n < AFF_MIN || n > AFF_MAX) return false;
    return (n >= currentAffMin && n <= currentAffMax);
  }

  // ====== LAYERS dinamici ======
  let tombeLayer = null;
  let objectsMgr = null; // ⬅️ manager a bucket

  function makeTombeLayer(tombeFeatures, oggettiPerTomba) {
    if (tombeLayer) { try { map.removeLayer(tombeLayer); } catch {} tombeLayer = null; }
    tombeLayer = L.geoJSON(tombeFeatures, {
      style: { color: "#993300", weight: 2, fillOpacity: 0.3 },
      onEachFeature: (feature, layer) => {
        const tombaId = feature.properties.name;
        const oggetti = oggettiPerTomba[tombaId] || [];
        const popupDiv = createTombaPopup(feature, oggetti);
        layer.on("click", (e) => {
          if (affinityDashboard.active) {
            e.originalEvent?.preventDefault();
            e.originalEvent?.stopPropagation();
            return;
          }
          layer.bindPopup(popupDiv).openPopup();
        });
      }
    }).addTo(map);
    aggiornaGestioneClickTombe();
  }

  // ====== Categoria + Affidabilità: NUOVA LOGICA ======
  let lastCategorySubset = oggettiBase.slice();

  // Costruisce/ricostruisce i marker SOLO quando cambia la categoria.
  function rebuildObjectsForCategory() {
    // distruggi manager precedente
    if (objectsMgr) { objectsMgr.destroy?.(); objectsMgr = null; }
    // costruisci NUOVO manager con il subset categoria
    objectsMgr = addObjectsLayer(map, lastCategorySubset);
    // applica range corrente (leggero: add/remove bucket)
    const oggToggle = document.getElementById('toggle-oggetti');
    const shouldShow = !oggToggle || oggToggle.checked;
    objectsMgr.setVisible(!!shouldShow);
    objectsMgr.applyRange(currentAffMin, currentAffMax);
  }

  // Applicazione range: leggero (toggle bucket) + ricostruzione TOMBE (poche)
  function applyAffRangeToMap() {
    // oggetti (leggero: solo bucket)
    if (objectsMgr) objectsMgr.applyRange(currentAffMin, currentAffMax);

    // tombe (filtrate su affidabilita_dato)
    const tombeFiltered = tombeBase.filter(t => withinAffidabilita(t?.properties?.affidabilita_dato));
    // oggetti per popup (filtrati con range su subset categoria)
    const oggettiFiltered = lastCategorySubset.filter(f => withinAffidabilita(f?.properties?.affidabilita));
    const oggettiPerTomba = buildOggettiPerTomba(oggettiFiltered);
    makeTombeLayer(tombeFiltered, oggettiPerTomba);
  }

  // Inizializza filtro categorie
  initCategoryFilter(oggettiBase, (oggettiFiltratiPerCategoria) => {
    lastCategorySubset = oggettiFiltratiPerCategoria.slice();
    rebuildObjectsForCategory();  // costoso (una volta per cambio categoria)
    applyAffRangeToMap();         // leggero
  });

  // ---- Slider affidabilità (debounce soft + apply on pointerup) ----
  let affApplyTimer = null;
  function normalizeAndApply(light = false) {
    if (!precMinInput || !precMaxInput) return;
    const aRaw = Number(precMinInput.value);
    const bRaw = Number(precMaxInput.value);
    let a = Number.isFinite(aRaw) ? snapToStep(aRaw) : AFF_MIN;
    let b = Number.isFinite(bRaw) ? snapToStep(bRaw) : AFF_MAX;
    if (a > b) [a, b] = [b, a];
    currentAffMin = a; currentAffMax = b;
    precMinInput.value = String(a);
    precMaxInput.value = String(b);
    updateAffUI();

    clearTimeout(affApplyTimer);
    const delay = light ? 60 : 120; // un filo più rilassato
    affApplyTimer = setTimeout(() => applyAffRangeToMap(), delay);
  }
  precMinInput?.addEventListener('input', () => normalizeAndApply(true));
  precMaxInput?.addEventListener('input', () => normalizeAndApply(true));

  // Applica “definitivo” a fine drag per UX più fluida
  ['pointerup','change'].forEach(ev => {
    precMinInput?.addEventListener(ev, () => normalizeAndApply(false));
    precMaxInput?.addEventListener(ev, () => normalizeAndApply(false));
  });

  // click sulla track: sposta il thumb più vicino
  if (rangeEl) {
    rangeEl.addEventListener('pointerdown', (e) => {
      const rect = rangeEl.getBoundingClientRect();
      const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const raw = AFF_MIN + x * (AFF_MAX - AFF_MIN);
      const value = snapToStep(raw);
      const distMin = Math.abs(value - currentAffMin);
      const distMax = Math.abs(value - currentAffMax);
      const target  = (distMin <= distMax) ? precMinInput : precMaxInput;
      target.value = String(value);
      normalizeAndApply(true);
    });
  }

  // Avvio iniziale
  updateAffUI();
  rebuildObjectsForCategory(); // costruzione iniziale
  applyAffRangeToMap();        // mount bucket ammessi + tombe

  // =========================
  // Gestione affinità
  // =========================
  function getFeatureAtLatLng(latlng, layerGroup) {
    let found = null;
    layerGroup.eachLayer(layer => {
      if (layer.getBounds && layer.getBounds().contains(latlng)) found = layer;
    });
    return found;
  }

  function colorTombeByAffinity(baseFeature) {
    const risultati = calcola(baseFeature.properties.fid);
    const max = Math.max(...risultati.map(r => r.affinita));
    tombeLayer.eachLayer(layer => {
      const fidAltro = layer.feature.properties.fid;
      const r = risultati.find(rr => rr.fid === fidAltro);
      if (r) {
        const perc = r.affinita / max;
        const hue = 240 - (perc * 240);
        const color = `hsl(${hue}, 100%, 50%)`;
        layer.setStyle({ fillColor: color, fillOpacity: 0.7, color: '#b00', weight: 1.5 });
      } else {
        layer.setStyle({ fillColor: "#f5f5f5", fillOpacity: 0.3, color: '#999', weight: 1 });
      }
    });
    affinityDashboard.displayResults(risultati, baseFeature, tombeBase);
  }
  window.__COLOR_TOMBE__ = colorTombeByAffinity;

  function aggiornaGestioneClickTombe() {
    if (!tombeLayer) return;
    tombeLayer.eachLayer(layer => {
      layer.off("click");
      const tombaId = layer.feature.properties.name;
      const oggettiPerTomba = buildOggettiPerTomba(
        lastCategorySubset.filter(f => withinAffidabilita(f?.properties?.affidabilita))
      );
      const oggetti = oggettiPerTomba[tombaId] || [];

      if (affinityDashboard.active) {
        layer.on("click", (e) => {
          if (e.originalEvent && e.originalEvent.target.closest('.leaflet-popup, .leaflet-control')) return;

          const risultati = calcola(layer.feature.properties.fid);
          const max = Math.max(...risultati.map(r => r.affinita));

          tombeLayer.eachLayer(layerAltro => {
            const fidAltro = layerAltro.feature.properties.fid;
            const r = risultati.find(rr => rr.fid === fidAltro);
            if (r) {
              const perc = r.affinita / max;
              const hue = 240 - (perc * 240);
              const color = `hsl(${hue}, 100%, 50%)`;
              layerAltro.setStyle({ fillColor: color, fillOpacity: 0.7, color: '#b00', weight: 1.5 });
            } else {
              layerAltro.setStyle({ fillColor: "#f5f5f5", fillOpacity: 0.3, color: '#999', weight: 1 });
            }
          });

          affinityDashboard.displayResults(risultati, layer.feature, tombeBase);
        });
      } else {
        const popupDiv = createTombaPopup(layer.feature, oggetti);
        layer.on("click", () => { layer.bindPopup(popupDiv).openPopup(); });
      }
    });
  }

  map.on("click", function (e) {
    if (!affinityDashboard.active || !tombeLayer) return;
    if (e.originalEvent && e.originalEvent.target.closest('.leaflet-popup, .leaflet-control')) return;

    const layerClicked = getFeatureAtLatLng(e.latlng, tombeLayer);
    if (!layerClicked) {
      alert("Clicca su una tomba valida.");
      return;
    }

    const risultati = calcola(layerClicked.feature.properties.fid);
    const max = Math.max(...risultati.map(r => r.affinita));
    tombeLayer.eachLayer(layer => {
      const fidAltro = layer.feature.properties.fid;
      const r = risultati.find(rr => rr.fid === fidAltro);
      if (r) {
        const perc = r.affinita / max;
        const hue = 240 - (perc * 240);
        const color = `hsl(${hue}, 100%, 50%)`;
        layer.setStyle({ fillColor: color, fillOpacity: 0.7, color: '#b00', weight: 1.5 });
      } else {
        layer.setStyle({ fillColor: "#f5f5f5", fillOpacity: 0.3, color: '#999', weight: 1 });
      }
    });
    affinityDashboard.displayResults(risultati, layerClicked.feature, tombeBase);
  });

  // =========================
  // Toggle layer
  // =========================
  const toggleRaster  = document.getElementById('toggle-raster');
  const toggleOggetti = document.getElementById('toggle-oggetti');

  if (toggleOggetti) {
    toggleOggetti.addEventListener('change', (e) => {
      if (!objectsMgr) return;
      objectsMgr.setVisible(!!e.target.checked); // mostra/nasconde bucket già attivi
    });
  } else {
    console.warn("Toggle oggetti non trovato nel DOM");
  }

  if (toggleRaster) {
    toggleRaster.addEventListener('change', (e) => {
      if (e.target.checked) map.addLayer(rasterLayer);
      else map.removeLayer(rasterLayer);
    });
  } else {
    console.warn("Toggle raster non trovato nel DOM");
  }

  // =========================
  // Toggle affinità
  // =========================
  const toggleAffinity = document.getElementById('toggle-affinity');
  if (toggleAffinity) {
    toggleAffinity.addEventListener('change', function () {
      const isActive = affinityDashboard.toggleAffinityMode();
      aggiornaGestioneClickTombe();
      if (typeof affinityDashboard.onAffinityModeChange === 'function') {
        affinityDashboard.onAffinityModeChange(isActive);
      }
      if (!isActive && tombeLayer) {
        tombeLayer.eachLayer(layer => {
          layer.setStyle({ fillColor: "#993300", fillOpacity: 0.3, color: "#993300", weight: 2 });
        });
        affinityDashboard.hideUI?.();
      }
    });
  }
})();
