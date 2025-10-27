// record_necropoli/necropoli/map_viewer.js
import { addObjectsLayer } from './objects_layer.js';
import { initCategoryFilter } from './filter.js';
import { initSiteGraph, renderSiteGraph } from './site_graph.js';
import { createTombaPopup } from './popup_tombe.js';
import { getPath } from '../../path_utils.js';
import { createSitePopup } from './popup_sito.js';
import { initSamplesGraph, renderSamplesGraph } from './samples_graph.js';

// --- PRELOAD legenda_taxa → window.__TAXA_ICONS__/__FAMILY_ICONS__
async function preloadLegendaTaxa() {
  if (window.__TAXA_ICONS__ && window.__FAMILY_ICONS__) return;
  try {
    const res = await fetch(getPath("data/legenda_taxa.csv"));
    const text = await res.text();
    const lines   = text.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    const idx = (k) => headers.indexOf(k);
    const rows = lines.slice(1).map(line => line.split(","));
    const fam = {};
    const tax = {};
    rows.forEach(cols => {
      const c1 = (cols[idx("category_1")]||'').trim();
      const i1 = (cols[idx("image_1")]||'').trim();
      const val= (cols[idx("valore")]||'').trim();
      const i2 = (cols[idx("image_2")]||'').trim();
      if (c1 && i1 && !fam[c1]) fam[c1]=i1;
      if (val) tax[val]= i2 || "other.png";
    });
    window.__FAMILY_ICONS__ = fam;
    window.__TAXA_ICONS__   = tax;
  } catch(e){ console.warn("[preloadLegendaTaxa]", e); }
}

(async () => {
  /* URL params */
  const params   = new URLSearchParams(window.location.search);
  const fidParam = params.get("fid");
  const provParam = params.get("province");
  const regParam  = params.get("region");
  const allParam  = params.get("all"); // <--- NEW

  // consenti anche la modalità "all"
  if (!fidParam && !provParam && !regParam && !allParam) {
    alert("Parametro mancante: usa ?fid=ID oppure ?province=Nome oppure ?region=Nome oppure ?all=1");
    return;
  }

  /* Mappa */
  let map;
  let rasterLayer = null;
  let mapCentered = false;
  map = L.map("map", { minZoom: 5, maxZoom: 22 }).setView([42.5, 13.5], 6);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CartoDB</a>'
  }).addTo(map);

  // --- Toolbar S-TYPE (in alto a sinistra, a destra del +/-) ----------------
  function injectSTypeCss() {
    const css = `
      #stype-toolbar{
        position:absolute; top:10px; left:64px; z-index:1000;
        background:rgba(255,255,255,.96);
        border:1px solid #cbd5e1; border-radius:12px;
        padding:6px 8px; display:flex; gap:8px; align-items:center;
        box-shadow:0 1px 4px rgba(0,0,0,.12);
      }
      #stype-toolbar .stype-btn{
        width:36px; height:36px; border-radius:50%;
        border:2px solid #94a3b8; background:#fff; padding:3px;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer;
      }
      #stype-toolbar .stype-btn img{ width:24px; height:24px; object-fit:contain; }
      #stype-toolbar .stype-btn.active{
        border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,.25);
      }
    `;
    const tag = document.createElement('style'); tag.textContent = css;
    document.head.appendChild(tag);
  }

  function buildSTypeToolbar(map, onChange) {
    injectSTypeCss();
    const el = document.createElement('div');
    el.id = 'stype-toolbar';
    // blocca il drag/zoom quando si usa la toolbar
    ['mousedown','dblclick','wheel','pointerdown','touchstart'].forEach(ev =>
      el.addEventListener(ev, e => e.stopPropagation(), { passive: true })
    );

    const makeBtn = (title, relPath, value) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'stype-btn'; b.title = title;
      const img = document.createElement('img');
      img.alt = title; img.src = getPath(relPath);
      img.onerror = () => { img.onerror = null; img.src = getPath('images/logo_semplificato.png'); };
      b.appendChild(img);
      b.addEventListener('click', () => { setActive(value); onChange(value); });
      return b;
    };

    const btnWood  = makeBtn('wood',        'images/objects/wood.png',   'wood');
    const btnCarpo = makeBtn('carpological','images/objects/carpo.png',   'carpological');
    const btnAll   = makeBtn('all',         'images/logo_semplificato.png', 'all');

    el.appendChild(btnWood);
    el.appendChild(btnCarpo);
    el.appendChild(btnAll);

    map.getContainer().appendChild(el);

    function setActive(which) {
      [btnWood, btnCarpo, btnAll].forEach(b => b.classList.remove('active'));
      if (which === 'wood') btnWood.classList.add('active');
      else if (which === 'carpological') btnCarpo.classList.add('active');
      else btnAll.classList.add('active'); // default
    }
    setActive('all');

    return { setActive };
  }

  const sitesPane    = map.createPane('sitesPane');    sitesPane.style.zIndex = 300;
  const contextsPane = map.createPane('contextsPane'); contextsPane.style.zIndex = 350;

  /* Dati */
  const sitiDataPromise      = fetch(getPath("data/siti.geojson")).then(r => r.json());
  const contestiDataPromise  = fetch(getPath("data/contesti.geojson")).then(r => r.json());
  const samplesDataPromise   = fetch(getPath("data/samples.geojson")).then(r => r.json());
  const [sitiData, contestiData, samplesData] = await Promise.all([sitiDataPromise, contestiDataPromise, samplesDataPromise]);

  /* Filtraggio contesti */
  let contestiBase = contestiData.features.filter(f => {
    const p = f.properties || {};
    if (allParam) return true; // <--- prendi tutto il database
    if (fidParam)  return String(p.parent_id) === String(fidParam);
    if (provParam) return (p.province || "").trim().toLowerCase() === String(provParam).trim().toLowerCase();
    if (regParam)  return (p.region   || "").trim().toLowerCase() === String(regParam).trim().toLowerCase();
    return false;
  });
  if (!contestiBase.length) { alert("Nessun contesto trovato per i parametri indicati."); return; }

  /* ====== CRONOLOGIA: fasi e normalizzazione (contesti) ====== */
  const PHASES = [
    "Mesolitico",
    "Eneolitico",
    "Neolitico",
    "Età del Bronzo",
    "Età del Ferro / Villanoviano",
    "Periodo Etrusco / Orientalizzante",
    "Periodo Arcaico (Roma)",
    "Periodo Repubblicano (Roma)",
    "Periodo Imperiale (Roma)",
    "Tarda Antichità",
    "Medioevo",
    "Rinascimento",
    "Periodo Moderno",
    "Età contemporanea"
  ];
  const phaseSlug = (s) => s
    ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'')
    : '';
  const phaseLookup = new Map();
  const aliases = {
    "etadelferro": "Età del Ferro / Villanoviano",
    "villanoviano": "Età del Ferro / Villanoviano",
    "periodoetrusco": "Periodo Etrusco / Orientalizzante",
    "periodoorientalizzante": "Periodo Etrusco / Orientalizzante",
    "mesolito": "Mesolitico"
  };
  PHASES.forEach(p => phaseLookup.set(phaseSlug(p), p));
  Object.entries(aliases).forEach(([k,v]) => phaseLookup.set(k, v));

  // Normalizza le fasi sui CONTESTI (campo parent_chronology_iccd)
  contestiBase.forEach(f => {
    const raw = f?.properties?.parent_chronology_iccd;
    const phases = new Set();
    if (raw && typeof raw === 'string') {
      raw.split(';')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(tok => {
          const std = phaseLookup.get(phaseSlug(tok));
          if (std) phases.add(std);
        });
    }
    f.properties._phasesNormalized = phases; // Set<string>
  });

  // Stato selezione cronologica (indici inclusivi)
  let chronoFrom = 0, chronoTo = PHASES.length - 1;
  let includeUndated = false;

  function contextPassesChrono(f) {
    const phases = f?.properties?._phasesNormalized || new Set();
    const hasPhases = phases.size > 0;
    const selected = new Set(PHASES.slice(chronoFrom, chronoTo + 1));
    let ok = hasPhases ? [...phases].some(p => selected.has(p)) : false;
    if (includeUndated && !hasPhases) ok = true;
    return ok;
  }

  /* Filtraggio siti */
  let sitiSelezionati = [];
  if (allParam) {
    // modalità globale: tutti i siti
    sitiSelezionati = sitiData.features;
  } else if (fidParam) {
    sitiSelezionati = sitiData.features.filter(
      s => String(s.properties?.fid) === String(fidParam)
    );
  } else {
    const parentIds = new Set(
      contestiBase
        .map(c => Number(c.properties?.parent_id))
        .filter(Number.isFinite)
    );
    sitiSelezionati = sitiData.features.filter(s =>
      parentIds.has(Number(s.properties?.fid))
    );
  }

  /* Raster (se presente): ora nessun toggle — se c’è lo mostriamo */
  if (fidParam && sitiSelezionati.length) {
    try {
      const site = sitiSelezionati[0];
      if (site && site.properties?.map) {
        const mapFile = site.properties.map.toLowerCase().replace(/\.tif$/i, '') + ".tif";
        const tiffResponse = await fetch(getPath(`images/maps/${mapFile}`));
        if (tiffResponse.ok) {
          const arrayBuffer = await tiffResponse.arrayBuffer();
          const georaster = await parseGeoraster(arrayBuffer);
          rasterLayer = new GeoRasterLayer({ georaster, opacity: 0.7, resolution: 256 });
          rasterLayer.addTo(map);
          map.fitBounds(rasterLayer.getBounds());
          mapCentered = true;
        }
      }
    } catch (e) { console.warn("Raster non disponibile:", e); }
  }

  /* Samples associati ai contesti */
  const getSampleCtxId = (s) => {
    const p = s?.properties || {};
    const a = Number(p.context_id);
    if (Number.isFinite(a)) return a;
    const b = Number(p.contesti_id);
    return Number.isFinite(b) ? b : null;
  };

  const idsContesti = new Set(contestiBase.map(c => Number(c.properties?.fid)).filter(Number.isFinite));
  const samplesBase = samplesData.features.filter(s => {
    const cid = getSampleCtxId(s);
    return Number.isFinite(cid) && idsContesti.has(cid);
  });

  // Index samples per context
  function buildSamplesPerContext(features) {
    const m = {};
    for (const s of features) {
      const key = getSampleCtxId(s);
      if (!Number.isFinite(key)) continue;
      (m[key] ||= []).push(s);
    }
    return m;
  }
  const samplesIndex = buildSamplesPerContext(samplesBase);

  /* Slider Affidabilità */
  const AFF_MIN = 0, AFF_MAX = 4, AFF_STEP = 1;
  const precMinInput = document.getElementById('precision-min');
  const precMaxInput = document.getElementById('precision-max');
  const precRangeLbl = document.getElementById('precision-range-label');
  const rangeFillEl  = document.getElementById('precision-range-fill');
  const bubbleMin    = document.getElementById('prec-bubble-min');
  const bubbleMax    = document.getElementById('prec-bubble-max');

  let currentAffMin = AFF_MIN, currentAffMax = AFF_MAX;
  [precMinInput, precMaxInput].forEach(el => { if (!el) return; el.min="0"; el.max="4"; el.step="1"; });
  const pct = (v) => ((v - AFF_MIN) / (AFF_MAX - AFF_MIN)) * 100;
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function snapToStep(v){ const s = Math.round((v - AFF_MIN) / AFF_STEP) * AFF_STEP + AFF_MIN; return clamp(s, AFF_MIN, AFF_MAX); }
  function updateAffUI() {
    if (precRangeLbl) precRangeLbl.textContent = (currentAffMin===currentAffMax)?`${currentAffMin}`:`${currentAffMin}–${currentAffMax}`;
    const left  = pct(currentAffMin), right = pct(currentAffMax);
    if (rangeFillEl) { rangeFillEl.style.left = `calc(${left}% )`; rangeFillEl.style.width = `calc(${Math.max(0, right-left)}% )`; }
    if (bubbleMin) { bubbleMin.style.left = `calc(${left}% )`;  bubbleMin.textContent = String(currentAffMin); }
    if (bubbleMax) { bubbleMax.style.left = `calc(${right}% )`; bubbleMax.textContent = String(currentAffMax); }
  }
  function passesReliability(val, allowUnknownWhenFull = true) {
    const n = Number(val);
    if (Number.isFinite(n)) return n >= currentAffMin && n <= currentAffMax;
    return allowUnknownWhenFull && currentAffMin<=AFF_MIN && currentAffMax>=AFF_MAX;
  }
  function withinAffidabilitaContext(val){ return passesReliability(val,true); }
  function withinAffidabilitaSite(val){ return passesReliability(val,true); }
  function withinAffidabilitaSample(val){ return passesReliability(val,true); }

  /* STILI layer */
  const STYLE_SITE = { color:'#111', weight:1.5, fillColor:'#2b6cb0', fillOpacity:0.18 };
  const STYLE_CONTEXT = { color:'#8b2f00', weight:2, fillColor:'#cc6b3d', fillOpacity:0.35 };
  const STYLE_SITE_HIDDEN = { ...STYLE_SITE, opacity:0, fillOpacity:0, weight:0 };
  const STYLE_CONTEXT_HIDDEN = { ...STYLE_CONTEXT, opacity:0, fillOpacity:0, weight:0 };

  /* Stato filtri (samples) */
  let currentCategorySet = null; // Set di precise_taxon attivi (null => tutti)
  let currentSTypeFilter = null; // null = tutti | 'wood' | 'carpological'

  const samplePassesCurrentFilters = (f) => {
    const p = f?.properties || {};
    if (!withinAffidabilitaSample(p?.precision)) return false;
    if (currentCategorySet && !currentCategorySet.has(String(p?.precise_taxon || ''))) return false;
    if (currentSTypeFilter) {
      const st = String(p?.s_type || '').trim().toLowerCase();
      if (st !== currentSTypeFilter) return false;
    }
    return true;
  };

  /* Filtro tipologia globale (riuso per contexts/sites + join samples) */
  let activeTypo = null; // Set lowercase
  const normalizeTypo = (v) => String(v ?? 'N/D').trim().toLowerCase();
  function passesTypology(feature) {
    if (!activeTypo || activeTypo.size===0) return true;
    const key = normalizeTypo(feature?.properties?.typology ?? 'N/D');
    return activeTypo.has(key);
  }
  function computeAllowedContextIdsByTypology() {
    const set = new Set();
    if (!contestiLayer) return set;
    contestiLayer.eachLayer(l => {
      const p = l.feature?.properties || {};
      const ok = withinAffidabilitaContext(p?.c_appr) && passesTypology(l.feature) && contextPassesChrono(l.feature);
      if (ok) {
        const id = Number(p.fid);
        if (Number.isFinite(id)) set.add(id);
      }
    });
    return set;
  }
  function applyTypologyFilters() {
    if (contestiLayer) contestiLayer.setStyle(f =>
      withinAffidabilitaContext(f?.properties?.c_appr) && passesTypology(f) && contextPassesChrono(f)
        ? STYLE_CONTEXT : STYLE_CONTEXT_HIDDEN
    );
    if (sitiLayer)     sitiLayer.setStyle(f =>
      withinAffidabilitaSite(f?.properties?.c_appr) && passesTypology(f)
        ? STYLE_SITE    : STYLE_SITE_HIDDEN
    );

    const allowedCtxIds = computeAllowedContextIdsByTypology();
    if (samplesMgr?.applyContextIdSet) samplesMgr.applyContextIdSet(allowedCtxIds.size ? allowedCtxIds : null);
    refreshCharts();

    // Notifica timebar e componenti collegati
    document.dispatchEvent(new CustomEvent('detail:filters-changed'));
  }

  /* Layers dinamici */
  let sitiLayer = null, contestiLayer = null;

  await preloadLegendaTaxa();
  let samplesMgr = addObjectsLayer(map, samplesBase);
  samplesMgr.setVisible(true);
  samplesMgr.applyRange(currentAffMin, currentAffMax);

  // Toolbar s_type (wood / carpological / all)
  const stypeUI = buildSTypeToolbar(map, (value) => {
    currentSTypeFilter = (value === 'all') ? null : value;   // aggiorna stato globale
    samplesMgr.applySType(currentSTypeFilter);               // applica al layer
    applyTypologyFilters();                                  // rimane in combo col resto
    refreshCharts();
  });

  // Toggle Samples (resta)
  const oggToggle = document.getElementById('toggle-oggetti');
  if (oggToggle) {
    if (!oggToggle.hasAttribute('data-init')) { oggToggle.checked = true; oggToggle.setAttribute('data-init','1'); }
    oggToggle.addEventListener('change', (e) => samplesMgr?.setVisible(!!e.target.checked));
  }

  // index per aprire popup del contesto by fid
  const contextLayerByFid = new Map();

  function makeSitiLayer(sitiFeatures) {
    if (sitiLayer) { try { map.removeLayer(sitiLayer); } catch {} sitiLayer = null; }
    if (!sitiFeatures?.length) return;

    sitiLayer = L.geoJSON(sitiFeatures, {
      pane: 'sitesPane',
      style: (f) => withinAffidabilitaSite(f?.properties?.c_appr) && passesTypology(f) ? STYLE_SITE : STYLE_SITE_HIDDEN,
      onEachFeature: (feature, layer) => {
        try {
          layer.on('popupopen', () => {
            const filteredContesti = contestiBase.filter(c => withinAffidabilitaContext(c?.properties?.c_appr));
            layer.setPopupContent(createSitePopup(feature, filteredContesti));
          });
          layer.bindPopup('<div class="popup-skeleton">Loading…</div>');
        } catch {
          const p = feature.properties || {};
          layer.bindPopup(`<div class="popup-wrapper object" style="max-width:320px;">
              <div class="popup-info-container" style="max-height:none; visibility:visible;">
                <div class="popup-info-item">
                  <div class="popup-info-label">SITE</div>
                  <div class="popup-info-main-value">${escapeHtml(p.name || p.site_name_brain || p.site_code || 'Site')}</div>
                </div>
              </div></div>`);
        }
        layer.on("click", () => layer.openPopup());
      }
    }).addTo(map);
  }

  function makeContestiLayer(contestiFeatures) {
    if (contestiLayer) { try { map.removeLayer(contestiLayer); } catch {} contestiLayer = null; }
    contextLayerByFid.clear();

    contestiLayer = L.geoJSON(contestiFeatures, {
      pane: 'contextsPane',
      style: (f) => (withinAffidabilitaContext(f?.properties?.c_appr) &&
                     passesTypology(f) &&
                     contextPassesChrono(f))
                    ? STYLE_CONTEXT : STYLE_CONTEXT_HIDDEN,
      onEachFeature: (feature, layer) => {
        const ctxId = Number(feature.properties?.fid);
        layer.on('popupopen', () => {
          const all = samplesIndex[ctxId] || [];
          const filtered = all.filter(samplePassesCurrentFilters);
          const content = createTombaPopup
            ? createTombaPopup(feature, filtered)
            : (() => { const div = document.createElement('div'); div.textContent = (feature.properties?.context_name || 'Context'); return div; })();
          layer.setPopupContent(content);
        });
        layer.bindPopup('<div class="popup-skeleton">Loading…</div>');
        layer.on("click", () => layer.openPopup());
        contextLayerByFid.set(ctxId, layer);
      }
    }).addTo(map);
  }

  /* Categoria + Affidabilità */
  function applyAffRangeToMap() {
    samplesMgr.applyRange(currentAffMin, currentAffMax);
    if (contestiLayer) contestiLayer.setStyle(f =>
      withinAffidabilitaContext(f?.properties?.c_appr) && passesTypology(f) && contextPassesChrono(f)
        ? STYLE_CONTEXT : STYLE_CONTEXT_HIDDEN
    );
    if (sitiLayer)     sitiLayer.setStyle(f =>
      withinAffidabilitaSite(f?.properties?.c_appr) && passesTypology(f)
        ? STYLE_SITE    : STYLE_SITE_HIDDEN
    );
    applyTypologyFilters();
  }

  initCategoryFilter(samplesBase, (samplesFiltratiPerCategoria) => {
    if (samplesFiltratiPerCategoria === null) currentCategorySet = null;
    else currentCategorySet = new Set(samplesFiltratiPerCategoria.map(f => String(f?.properties?.precise_taxon || '')));
    samplesMgr.applyCategorySet(currentCategorySet);
    applyTypologyFilters();
  });

  // slider: debounce
  let affApplyTimer = null;
  function normalizeAndApply(light=false) {
    if (!precMinInput || !precMaxInput) return;
    const aRaw=Number(precMinInput.value), bRaw=Number(precMaxInput.value);
    let a=Number.isFinite(aRaw)?snapToStep(aRaw):AFF_MIN;
    let b=Number.isFinite(bRaw)?snapToStep(bRaw):AFF_MAX;
    if (a>b) [a,b]=[b,a];
    currentAffMin=a; currentAffMax=b;
    precMinInput.value=String(a); precMaxInput.value=String(b);
    updateAffUI();
    clearTimeout(affApplyTimer);
    affApplyTimer=setTimeout(()=>applyAffRangeToMap(), light?100:200);
  }
  precMinInput?.addEventListener('input', ()=>normalizeAndApply(true));
  precMaxInput?.addEventListener('input', ()=>normalizeAndApply(true));
  ['pointerup','change'].forEach(ev => {
    precMinInput?.addEventListener(ev, ()=>normalizeAndApply(false));
    precMaxInput?.addEventListener(ev, ()=>normalizeAndApply(false));
  });
  updateAffUI();

  // costruisci i layer UNA volta
  makeContestiLayer(contestiBase);
  makeSitiLayer(sitiSelezionati);

  /* Centratura mappa robusta */
  function boundsFromFeatures(features) {
    try {
      if (!features?.length) return null;
      const gj = L.geoJSON({ type: 'FeatureCollection', features });
      const b = gj.getBounds();
      return (b && b.isValid()) ? b : null;
    } catch { return null; }
  }
  function unionBounds(a,b){ if(!a) return b||null; if(!b) return a||null; return a.extend(b.getNorthEast()).extend(b.getSouthWest()); }
  if (!mapCentered) {
    const bSiti=boundsFromFeatures(sitiSelezionati), bCont=boundsFromFeatures(contestiBase), bSamples=boundsFromFeatures(samplesBase);
    let bounds=null; [bSiti,bCont,bSamples].forEach(b=>{ bounds=unionBounds(bounds,b); });
    if (bounds?.isValid()) { try { map.fitBounds(bounds.pad(0.10)); } catch{} }
  }

  /* Site types chart (già esistente) */
  function getVisibleFeatures(layer) {
    if (!layer) return [];
    const view = map.getBounds();
    const out = [];
    try {
      layer.eachLayer(l => {
        if (!l.getBounds) return;
        const st = l.options || {};
        const visible = !(st.opacity === 0 && st.fillOpacity === 0 && st.weight === 0);
        if (!visible) return;
        const lb = l.getBounds();
        if (lb && lb.isValid() && view.intersects(lb)) out.push(l.feature);
      });
    } catch {}
    return out;
  }

  await initSiteGraph({
    mode: 'contexts',
    getFeaturesForMode: (mode) => mode==='contexts' ? getVisibleFeatures(contestiLayer) : getVisibleFeatures(sitiLayer),
    onFilterChange: ({ activeTypologies }) => { activeTypo = activeTypologies; applyTypologyFilters(); }
  });

  window.renderSiteGraphLazy = () => renderSiteGraph(getVisibleFeatures(contestiLayer), { mode: 'contexts' });

  function refreshSiteChart() {
    const featsCtx = getVisibleFeatures(contestiLayer);
    const featsSite= getVisibleFeatures(sitiLayer);
    if (featsCtx.length) renderSiteGraph(featsCtx, { mode:'contexts' });
    else if (featsSite.length) renderSiteGraph(featsSite, { mode:'sites' });
    else renderSiteGraph(contestiBase, { mode:'contexts' });
  }

  /* ===== Samples chart ===== */
  // Restituisce i samples “visibili” nel viewport, rispettando filtri active
  function getVisibleSamples() {
    const b = map.getBounds();
    const allowedCtx = computeAllowedContextIdsByTypology(); // join con tipologia + cronologia + affidabilità
    const out = [];
    for (const f of samplesBase) {
      const p = f.properties || {};
      // filtri affidabilità + categoria + s_type
      if (!withinAffidabilitaSample(p.precision)) continue;
      if (currentCategorySet && !currentCategorySet.has(String(p.precise_taxon || ''))) continue;
      if (currentSTypeFilter) {
        const st = String(p.s_type || '').trim().toLowerCase();
        if (st !== currentSTypeFilter) continue;
      }
      // join tipologia/cronologia (se presente)
      const cid = getSampleCtxId(f);
      if (allowedCtx.size && !allowedCtx.has(cid)) continue;
      // bounds
      const g = f.geometry || {};
      let coord = null;
      if (g.type === 'Point') coord = g.coordinates;
      else if (g.type === 'MultiPoint' && g.coordinates?.length) coord = g.coordinates[0];
      if (!coord) continue;
      const latlng = L.latLng(coord[1], coord[0]);
      if (!b.contains(latlng)) continue;
      out.push(f);
    }
    return out;
  }

  await initSamplesGraph({ getVisibleSamples });

  function refreshSamplesChart() {
    renderSamplesGraph();
  }

  function refreshCharts() {
    refreshSiteChart();
    refreshSamplesChart();
  }

  map.on('moveend zoomend', refreshCharts);

  // primo sync
  applyTypologyFilters();

  // Notifica "pronto" per timebar e componenti collegati
  document.dispatchEvent(new CustomEvent('detail:ready'));

  /* Link dal popup Sample → Context */
  function openContextPopupById(ctxId) {
    const layer = contextLayerByFid.get(Number(ctxId));
    if (!layer) return;
    if (layer.getBounds) {
      const b = layer.getBounds();
      if (b.isValid()) map.fitBounds(b.pad(0.15));
    }
    layer.openPopup();
  }
  window.__openContextPopup = openContextPopupById;

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-open-context]');
    if (!a) return;
    e.preventDefault();
    const ctxId = Number(a.getAttribute('data-open-context'));
    if (Number.isFinite(ctxId)) openContextPopupById(ctxId);
  });

  /* ======= API per timebar_detail.js ======= */

  // Conta CONTEXTS per fase, rispettando: tipologia, affidabilità, cronologia
  // e – se sono attivi filtri taxa/s_type – contando solo i contesti che hanno
  // almeno UN sample che passa questi filtri.
  function __detail_computePhaseCounts() {
    const counts = new Array(PHASES.length).fill(0);

    const needSampleGate = !!currentCategorySet || !!currentSTypeFilter;
    const validCtxBySamples = new Set();
    if (needSampleGate) {
      for (const [ctxId, arr] of Object.entries(samplesIndex)) {
        const id = Number(ctxId);
        if (!Number.isFinite(id)) continue;
        const any = (arr || []).some(samplePassesCurrentFilters);
        if (any) validCtxBySamples.add(id);
      }
    }

    const selected = new Set(PHASES.slice(chronoFrom, chronoTo + 1));

    for (const f of contestiBase) {
      const p = f?.properties || {};
      if (!withinAffidabilitaContext(p?.c_appr)) continue;
      if (!passesTypology(f)) continue;
      if (!contextPassesChrono(f)) continue;
      const id = Number(p.fid);
      if (needSampleGate && (!Number.isFinite(id) || !validCtxBySamples.has(id))) continue;

      const phases = p._phasesNormalized || new Set();
      phases.forEach(ph => {
        const idx = PHASES.indexOf(ph);
        if (idx >= 0) counts[idx] += 1;
      });
    }
    return counts;
  }

  function __detail_setChronoRange(a, b, include) {
    const max = PHASES.length - 1;
    chronoFrom = Math.max(0, Math.min(a, b));
    chronoTo   = Math.min(max, Math.max(a, b));
    includeUndated = !!include;

    // Re-applica stili/filtro join → impatta mappa, samples e grafici
    applyTypologyFilters();   // già richiama refreshCharts() e l'evento 'detail:filters-changed'
    document.dispatchEvent(new CustomEvent('detail:filters-changed'));
  }

  window.__detail_getPhases = () => PHASES.slice();
  window.__detail_setChronoRange = __detail_setChronoRange;
  window.__detail_computePhaseCounts = __detail_computePhaseCounts;
  window.__detail_getSelectedRange = () => ({ from: chronoFrom, to: chronoTo, includeUndated });

  /* Utils */
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])
    );
  }
})();

// Delegato per il link "View the whole context"
document.addEventListener("DOMContentLoaded", () => {
  document.body.addEventListener("click", (e) => {
    const a = e.target.closest('a[data-open-context]');
    if (!a) return;
    e.preventDefault();
    const ctxId = Number(a.getAttribute('data-open-context'));
    if (Number.isFinite(ctxId) && window.__openContextPopup) window.__openContextPopup(ctxId);
  });
});
