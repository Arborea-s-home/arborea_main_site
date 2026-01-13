// record_necropoli/necropoli/map_viewer.js
import { addObjectsLayer } from './objects_layer.js';
import { initCategoryFilter } from './filter.js';
import { initSiteGraph, renderSiteGraph } from './site_graph.js';
import { openTombaModal, closeTombaModal } from './popup_tombe.js';
import { getPath } from '../../path_utils.js';
import { openSiteModal, closeSiteModal } from './modal_sites.js';
import { initSamplesGraph, renderSamplesGraph } from './samples_graph.js';
import { initCardsView } from './schede_view.js';
import { indexContextsBySite, computeSiteCards } from './schede_compute.js';
import { setSamplesForDetail } from './schede_detail_full.js';

/* =========================
   CSS helpers (UI polish)
========================= */
function injectUiCssOnce() {
  if (document.getElementById('mv-ui-css')) return;

  const css = `
  /* hover glow */
  .hover-glow{
    filter: drop-shadow(0 0 8px rgba(250,204,21,.85)) drop-shadow(0 0 2px rgba(250,204,21,.65));
  }
  .feature-hover-tip{
    background: rgba(255,255,255,.96);
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(0,0,0,.12);
    color:#0f172a;
    font-weight:600;
    padding:6px 10px;
  }

  /* centroid popup card */
  .site-centroid-card{
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif;
    padding:10px 10px 8px;
    min-width: 280px;
  }
  .site-centroid-title{
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 8px;
  }
  .site-centroid-actions{
    display:flex;
    gap:8px;
    margin-bottom:8px;
  }
  .site-centroid-btn{
    appearance:none;
    border:1px solid #cbd5e1;
    background:#fff;
    color:#0f172a;
    border-radius:10px;
    padding:7px 10px;
    font-size: 12px;
    font-weight: 700;
    cursor:pointer;
  }
  .site-centroid-btn.primary{
    border-color:#2563eb;
    color:#2563eb;
  }
  .site-centroid-btn:hover{
    background:#f8fafc;
  }
  .site-centroid-note{
    font-size:11px;
    color:#475569;
  }

  /* cluster icon */
  .site-cluster-icon{
    border-radius: 999px;
    background: rgba(255,255,255,.92);
    border: 2px solid rgba(37,99,235,.35);
    box-shadow: 0 8px 20px rgba(0,0,0,.15);
    display:flex;
    align-items:center;
    justify-content:center;
  }
  .site-cluster-bubble{
    width:100%;
    height:100%;
    border-radius:999px;
    display:flex;
    align-items:center;
    justify-content:center;
    background: rgba(37,99,235,.12);
  }
  .site-cluster-bubble span{
    font-weight: 800;
    color:#0f172a;
    font-size: 13px;
  }
  .site-cluster-small .site-cluster-bubble span{ font-size:12px; }
  .site-cluster-large .site-cluster-bubble span{ font-size:14px; }

  /* overlap picker */
  .poly-pick-popup .leaflet-popup-content-wrapper{
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(0,0,0,.18);
  }
  .poly-pick-card{
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif;
    padding: 6px 2px;
  }
  .poly-pick-title{
    font-weight: 800;
    font-size: 13px;
    margin: 0 0 8px;
    color:#0f172a;
  }
  .poly-pick-body{
    display:flex;
    flex-direction:column;
    gap:6px;
  }
  .poly-pick-btn{
    appearance:none;
    border:1px solid #e2e8f0;
    background:#fff;
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 700;
    text-align:left;
    cursor:pointer;
    color:#0f172a;
  }
  .poly-pick-btn:hover{
    background:#f8fafc;
    border-color:#cbd5e1;
  }
  .poly-pick-note{
    margin-top:8px;
    font-size:11px;
    color:#475569;
  }
  `;

  const tag = document.createElement('style');
  tag.id = 'mv-ui-css';
  tag.textContent = css;
  document.head.appendChild(tag);
}

/* =========================
   PRELOAD legenda_taxa → window.__TAXA_ICONS__/__FAMILY_ICONS__
========================= */
async function preloadLegendaTaxa() {
  if (window.__TAXA_ICONS__ && window.__FAMILY_ICONS__) return;
  try {
    const res = await fetch(getPath('data/legenda_taxa.csv'));
    const text = await res.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const idx = (k) => headers.indexOf(k);
    const rows = lines.slice(1).map(line => line.split(','));
    const fam = {};
    const tax = {};
    rows.forEach(cols => {
      const c1  = (cols[idx('category_1')] || '').trim();
      const i1  = (cols[idx('image_1')] || '').trim();
      const val = (cols[idx('valore')] || '').trim();
      const i2  = (cols[idx('image_2')] || '').trim();
      if (c1 && i1 && !fam[c1]) fam[c1] = i1;
      if (val) tax[val] = i2 || 'other.png';
    });
    window.__FAMILY_ICONS__ = fam;
    window.__TAXA_ICONS__ = tax;
  } catch (e) {
    console.warn('[preloadLegendaTaxa]', e);
  }
}

(async () => {
  injectUiCssOnce();

  /* URL params */
  const params = new URLSearchParams(window.location.search);
  const fidParam  = params.get('fid');
  const provParam = params.get('province');
  const regParam  = params.get('region');
  const allParam  = params.get('all');

  if (!fidParam && !provParam && !regParam && !allParam) {
    alert('Parametro mancante: usa ?fid=ID oppure ?province=Nome oppure ?region=Nome oppure ?all=1');
    return;
  }

  /* Mappa */
  let rasterLayer = null;
  let mapCentered = false;
  let cardsView = null;

  const map = L.map('map', { minZoom: 5, maxZoom: 22 }).setView([42.5, 13.5], 6);

  /* =========================
   LAYOUT SYNC: timebar + sidebar (responsive)
   - timebar si adatta allo spazio residuo a sinistra
   - auto-collapse della timebar a zoom alto
   - sidebar collapsed width = top filters width
    ========================= */
    const TIMEBAR_AUTO_COLLAPSE_ZOOM = 15;   // cambia se vuoi (es. 14/16)
    const TIMEBAR_PAD = 16;                  // padding laterale
    const TIMEBAR_COLLAPSED_HEIGHT = 56;     // px: altezza quando collassa

    function findFirst(selectors) {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    function isVisibleEl(el) {
      if (!el) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    /** ⬅️ Elemento “barra filtri laterale” (quando espansa) */
    function getSidebarEl() {
      return findFirst([
        '#sidebar',
        '#filters-sidebar',
        '#left-sidebar',
        '.sidebar',
        '.left-sidebar',
        '.filters-sidebar',
        '.dashboard',
        '#dashboard'
      ]);
    }

    /** ⬆️ Elemento “riquadro in alto con filtri” (per width sidebar collassata) */
    function getTopFiltersBoxEl() {
      return findFirst([
        '#top-filters',
        '#filters-top',
        '#filters-bar',
        '.top-filters',
        '.filters-top',
        '.filters-bar',
        '.taxa-filter',          // nel tuo screenshot sembra un box con “Taxa”
        '#taxa-filter'
      ]);
    }

    /** ⬇️ Elemento root della timebar */
    function getTimebarEl() {
      return findFirst([
        '#timebar',
        '#time-filter',
        '#time-filter-panel',
        '#timebar-panel',
        '.timebar',
        '.timebar-panel',
        '.time-filter',
        '.time-filter-panel',
        '[data-timebar]'
      ]);
    }

    function sidebarIsCollapsed(sidebar) {
      if (!sidebar) return false;
      return (
        sidebar.classList.contains('collapsed') ||
        sidebar.classList.contains('is-collapsed') ||
        sidebar.getAttribute('data-collapsed') === '1'
      );
    }

    /** larghezza “occupata” a sinistra dentro il container mappa */
    function computeLeftOccupiedWidth() {
      const sidebar = getSidebarEl();
      if (!sidebar || !isVisibleEl(sidebar)) return 0;

      const mapRect = map.getContainer().getBoundingClientRect();
      const r = sidebar.getBoundingClientRect();

      // se non interseca verticalmente la mappa → ignora
      const overlapV = !(r.bottom < mapRect.top || r.top > mapRect.bottom);
      if (!overlapV) return 0;

      // se non è davvero sulla sinistra della mappa → ignora
      if (r.right <= mapRect.left + 8) return 0;

      // width “utile” che sottrae spazio alla timebar
      const w = Math.min(r.width, mapRect.width);
      return w > 0 ? w : 0;
    }

    /** timebar: left/right/maxWidth “responsive” */
    function applyTimebarResponsiveWidth() {
      const tb = getTimebarEl();
      if (!tb || !isVisibleEl(tb)) return;

      const leftW = computeLeftOccupiedWidth();
      const leftInset = leftW + TIMEBAR_PAD;

      // timebar overlay: la facciamo “stare” nello spazio libero
      tb.style.left = `${leftInset}px`;
      tb.style.right = `${TIMEBAR_PAD}px`;
      tb.style.maxWidth = `calc(100% - ${leftInset + TIMEBAR_PAD}px)`;
      tb.style.width = 'auto';
    }

    /** timebar: auto-collapse a zoom alto (senza dipendere dalla struttura interna) */
    function applyTimebarAutoCollapse() {
      const tb = getTimebarEl();
      if (!tb || !isVisibleEl(tb)) return;

      const shouldCollapse = map.getZoom() >= TIMEBAR_AUTO_COLLAPSE_ZOOM;

      if (shouldCollapse) {
        if (!tb.dataset.expandedOverflow) tb.dataset.expandedOverflow = tb.style.overflow || '';
        tb.classList.add('collapsed');
        tb.style.height = `${TIMEBAR_COLLAPSED_HEIGHT}px`;
        tb.style.overflow = 'hidden';
      } else {
        tb.classList.remove('collapsed');
        tb.style.height = '';
        tb.style.overflow = tb.dataset.expandedOverflow || '';
      }
    }

    /** sidebar: quando collassata → width = box filtri in alto */
    function applySidebarCollapsedWidth() {
      const sidebar = getSidebarEl();
      if (!sidebar || !isVisibleEl(sidebar)) return;

      if (!sidebarIsCollapsed(sidebar)) {
        // quando NON è collassata, lasciamo come già va bene
        sidebar.style.width = '';
        return;
      }

      const topBox = getTopFiltersBoxEl();
      if (!topBox || !isVisibleEl(topBox)) return;

      const w = Math.round(topBox.getBoundingClientRect().width);
      if (w > 40) sidebar.style.width = `${w}px`;
    }

    function syncOverlayLayout() {
      applySidebarCollapsedWidth();
      applyTimebarResponsiveWidth();
      applyTimebarAutoCollapse();
    }

    // hook principali
    window.addEventListener('resize', () => syncOverlayLayout());

    // Leaflet: quando cambia zoom/mappa
    map.on('zoomend', () => syncOverlayLayout());
    map.on('moveend', () => syncOverlayLayout());
    map.on('resize', () => syncOverlayLayout());

    // osserva cambi dimensioni sidebar/topbox/timebar (aperture/chiusure)
    const ro = new ResizeObserver(() => syncOverlayLayout());
    setTimeout(() => {
      try {
        ro.observe(map.getContainer());
        const sb = getSidebarEl(); if (sb) ro.observe(sb);
        const top = getTopFiltersBoxEl(); if (top) ro.observe(top);
        const tb = getTimebarEl(); if (tb) ro.observe(tb);
      } catch {}
      syncOverlayLayout();
    }, 250);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
     maxZoom: 20,
     opacity: 0.80,
    attribution: '&copy; <a href="https://carto.com/">CartoDB</a>' 
  })
    .addTo(map);

  /* ===== Toolbar S-TYPE ===== */
  function injectSTypeCss() {
    if (document.getElementById('stype-toolbar-css')) return;
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
    const tag = document.createElement('style');
    tag.id = 'stype-toolbar-css';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function buildSTypeToolbar(map, onChange) {
    injectSTypeCss();
    const el = document.createElement('div');
    el.id = 'stype-toolbar';

    // evita che la toolbar “mangi” drag/scroll della mappa
    ['mousedown', 'dblclick', 'wheel', 'pointerdown', 'touchstart'].forEach(ev =>
      el.addEventListener(ev, e => e.stopPropagation(), { passive: true })
    );

    const makeBtn = (title, relPath, value) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stype-btn';
      b.title = title;

      const img = document.createElement('img');
      img.alt = title;
      img.src = getPath(relPath);
      img.onerror = () => {
        img.onerror = null;
        img.src = getPath('images/logo_semplificato.png');
      };
      b.appendChild(img);

      b.addEventListener('click', () => {
        setActive(value);
        onChange(value);
      });
      return b;
    };

    const btnWood  = makeBtn('wood', 'images/objects/wood.png', 'wood');
    const btnCarpo = makeBtn('carpological', 'images/objects/carpo.png', 'carpological');
    const btnAll   = makeBtn('all', 'images/logo_semplificato.png', 'all');

    el.appendChild(btnWood);
    el.appendChild(btnCarpo);
    el.appendChild(btnAll);

    map.getContainer().appendChild(el);

    function setActive(which) {
      [btnWood, btnCarpo, btnAll].forEach(b => b.classList.remove('active'));
      if (which === 'wood') btnWood.classList.add('active');
      else if (which === 'carpological') btnCarpo.classList.add('active');
      else btnAll.classList.add('active');
    }

    setActive('all');
    return { setActive };
  }

  const sitesPane = map.createPane('sitesPane');
  sitesPane.style.zIndex = 300;

  const contextsPane = map.createPane('contextsPane');
  contextsPane.style.zIndex = 350;

  /* Dati */
  const sitiDataPromise = fetch(getPath('data/siti.geojson')).then(r => r.json());
  const contestiDataPromise = fetch(getPath('data/contesti.geojson')).then(r => r.json());
  const samplesDataPromise = fetch(getPath('data/samples.geojson')).then(r => r.json());
  const [sitiData, contestiData, samplesData] = await Promise.all([
    sitiDataPromise, contestiDataPromise, samplesDataPromise
  ]);

  /* Filtraggio contesti */
  let contestiBase = contestiData.features.filter(f => {
    const p = f.properties || {};
    if (allParam) return true;
    if (fidParam) return String(p.parent_id) === String(fidParam);
    if (provParam) return (p.province || '').trim().toLowerCase() === String(provParam).trim().toLowerCase();
    if (regParam) return (p.region || '').trim().toLowerCase() === String(regParam).trim().toLowerCase();
    return false;
  });

  if (!contestiBase.length) {
    alert('Nessun contesto trovato per i parametri indicati.');
    return;
  }

  const contextsBySite = indexContextsBySite(contestiBase);

  /* ====== CRONOLOGIA: fasi e normalizzazione (contesti) ====== */
  const PHASES = [
    'Mesolitico', 'Eneolitico', 'Neolitico', 'Età del Bronzo', 'Età del Ferro / Villanoviano',
    'Periodo Etrusco / Orientalizzante', 'Periodo Arcaico (Roma)', 'Periodo Repubblicano (Roma)',
    'Periodo Imperiale (Roma)', 'Tarda Antichità', 'Medioevo', 'Rinascimento', 'Periodo Moderno', 'Età contemporanea'
  ];

  const phaseSlug = (s) => s
    ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    : '';

  const phaseLookup = new Map();
  const aliases = {
    'etadelferro': 'Età del Ferro / Villanoviano',
    'villanoviano': 'Età del Ferro / Villanoviano',
    'periodoetrusco': 'Periodo Etrusco / Orientalizzante',
    'periodoorientalizzante': 'Periodo Etrusco / Orientalizzante',
    'mesolito': 'Mesolitico'
  };

  PHASES.forEach(p => phaseLookup.set(phaseSlug(p), p));
  Object.entries(aliases).forEach(([k, v]) => phaseLookup.set(k, v));

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

    f.properties._phasesNormalized = phases;
  });

  let chronoFrom = 0;
  let chronoTo = PHASES.length - 1;
  let includeUndated = false;

  function contextPassesChrono(f) {
    const phases = f?.properties?._phasesNormalized || new Set();
    const hasPhases = phases.size > 0;
    const selected = new Set(PHASES.slice(chronoFrom, chronoTo + 1));
    let ok = hasPhases ? [...phases].some(p => selected.has(p)) : false;
    if (includeUndated && !hasPhases) ok = true;
    return ok;
  }

  function getContextsForSiteFid(fid) {
  // contextsBySite può essere Map oppure oggetto indicizzato
  if (!Number.isFinite(fid)) return [];
  if (contextsBySite instanceof Map) return contextsBySite.get(fid) || [];
  return contextsBySite?.[fid] || contextsBySite?.[String(fid)] || [];
  }

  function sitePassesChrono(siteFeature) {
    const fid = Number(siteFeature?.properties?.fid);
    if (!Number.isFinite(fid)) return true;

    const ctxArr = getContextsForSiteFid(fid);
    if (!ctxArr.length) return false;

    // se hai filtri “sample-based” attivi, manteniamo coerenza:
    const needSampleGate = !!currentCategorySet || !!currentSTypeFilter;

    return ctxArr.some(ctxF => {
      const p = ctxF?.properties || {};
      if (!withinAffidabilitaContext(p?.c_appr)) return false;
      if (!passesTypology(ctxF)) return false;
      if (!contextPassesChrono(ctxF)) return false;

      if (needSampleGate) {
        const ctxId = Number(p?.fid);
        const arr = samplesIndex[ctxId] || [];
        if (!arr.some(samplePassesCurrentFilters)) return false;
      }
      return true;
    });
  }

  /* Filtraggio siti */
  let sitiSelezionati = [];
  if (allParam) {
    sitiSelezionati = sitiData.features;
  } else if (fidParam) {
    sitiSelezionati = sitiData.features.filter(s => String(s.properties?.fid) === String(fidParam));
  } else {
    const parentIds = new Set(
      contestiBase.map(c => Number(c.properties?.parent_id)).filter(Number.isFinite)
    );
    sitiSelezionati = sitiData.features.filter(s => parentIds.has(Number(s.properties?.fid)));
  }

  // Map feature by fid (per Zoom-to-polygon)
  const siteFeatureByFid = new Map(
    sitiSelezionati
      .map(f => [Number(f?.properties?.fid), f])
      .filter(([k]) => Number.isFinite(k))
  );

  /* Raster (se presente) */
  if (fidParam && sitiSelezionati.length) {
    try {
      const site = sitiSelezionati[0];
      if (site && site.properties?.map) {
        const mapFile = site.properties.map.toLowerCase().replace(/\.tif$/i, '') + '.tif';
        const tiffResponse = await fetch(getPath(`images/maps/${mapFile}`));
        if (tiffResponse.ok) {
          const arrayBuffer = await tiffResponse.arrayBuffer();
          // parseGeoraster / GeoRasterLayer globali (già nel progetto)
          const georaster = await parseGeoraster(arrayBuffer);
          rasterLayer = new GeoRasterLayer({ georaster, opacity: 0.7, resolution: 256 });
          rasterLayer.addTo(map);
          map.fitBounds(rasterLayer.getBounds());
          mapCentered = true;
        }
      }
    } catch (e) {
      console.warn('Raster non disponibile:', e);
    }
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

  // normalizza FK usata dal dettaglio (sempre context_id)
  for (const s of samplesBase) {
    const p = (s.properties ||= {});
    const cid = getSampleCtxId(s);
    if (Number.isFinite(cid)) p.context_id = cid;
  }

  // rende disponibili i samples alla vista "detail" delle cards
  window.__SAMPLES__ = samplesBase;
  setSamplesForDetail(samplesBase);

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

  [precMinInput, precMaxInput].forEach(el => {
    if (!el) return;
    el.min = String(AFF_MIN);
    el.max = String(AFF_MAX);
    el.step = String(AFF_STEP);
  });

  const pct = (v) => ((v - AFF_MIN) / (AFF_MAX - AFF_MIN)) * 100;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const snapToStep = (v) => {
    const s = Math.round((v - AFF_MIN) / AFF_STEP) * AFF_STEP + AFF_MIN;
    return clamp(s, AFF_MIN, AFF_MAX);
  };

  function updateAffUI() {
    if (precRangeLbl) {
      precRangeLbl.textContent = (currentAffMin === currentAffMax) ? `${currentAffMin}` : `${currentAffMin}–${currentAffMax}`;
    }
    const left = pct(currentAffMin), right = pct(currentAffMax);
    if (rangeFillEl) {
      rangeFillEl.style.left = `calc(${left}% )`;
      rangeFillEl.style.width = `calc(${Math.max(0, right - left)}% )`;
    }
    if (bubbleMin) {
      bubbleMin.style.left = `calc(${left}% )`;
      bubbleMin.textContent = String(currentAffMin);
    }
    if (bubbleMax) {
      bubbleMax.style.left = `calc(${right}% )`;
      bubbleMax.textContent = String(currentAffMax);
    }
  }

  function passesReliability(val, allowUnknownWhenFull = true) {
    const n = Number(val);
    if (Number.isFinite(n)) return n >= currentAffMin && n <= currentAffMax;
    return allowUnknownWhenFull && currentAffMin <= AFF_MIN && currentAffMax >= AFF_MAX;
  }

  const withinAffidabilitaContext = (val) => passesReliability(val, true);
  const withinAffidabilitaSite    = (val) => passesReliability(val, true);
  const withinAffidabilitaSample  = (val) => passesReliability(val, true);

  /* STILI layer */
  const STYLE_SITE = { color: '#111', weight: 1.5, fillColor: '#2b6cb0', fillOpacity: 0.18 };
  const STYLE_CONTEXT = { color: '#8b2f00', weight: 2, fillColor: '#cc6b3d', fillOpacity: 0.35 };
  const STYLE_SITE_HIDDEN = { ...STYLE_SITE, opacity: 0, fillOpacity: 0, weight: 0 };
  const STYLE_CONTEXT_HIDDEN = { ...STYLE_CONTEXT, opacity: 0, fillOpacity: 0, weight: 0 };

  // Hover: giallo + più spesso (il glow lo fa il CSS)
  const STYLE_SITE_HOVER = { ...STYLE_SITE, color: '#facc15', weight: 5.0, fillOpacity: 0.24 };
  const STYLE_CTX_HOVER  = { ...STYLE_CONTEXT, color: '#facc15', weight: 5.5, fillOpacity: 0.46 };

  function isPathVisible(layer) {
    const o = layer?.options || {};
    return !(o.opacity === 0 && o.fillOpacity === 0 && o.weight === 0);
  }

  /* Stato filtri (samples) */
  let currentCategorySet = null;
  let currentSTypeFilter = null;

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

  /* Filtro tipologia globale */
  let activeTypo = null;
  const normalizeTypo = (v) => String(v ?? 'N/D').trim().toLowerCase();
  function passesTypology(feature) {
    if (!activeTypo || activeTypo.size === 0) return true;
    const key = normalizeTypo(feature?.properties?.typology ?? 'N/D');
    return activeTypo.has(key);
  }

  /* Layers */
  let sitiLayer = null, contestiLayer = null;

  /* ===== SITI: centroidi + cluster ===== */
  let sitiCentroidsLayer = null;
  const SITES_POLYGON_MIN_ZOOM = 14;
  const sitePolygonLayerByFid = new Map();

  function centroidBoundsOfFeature(feature) {
    try {
      const b = L.geoJSON(feature).getBounds();
      return (b && b.isValid()) ? b : null;
    } catch {
      return null;
    }
  }

  function centroidLatLngOfFeature(feature) {
    const b = centroidBoundsOfFeature(feature);
    return b ? b.getCenter() : null;
  }

  function getSiteDisplayName(feature) {
    const p = feature?.properties || {};
    return p.name || p.site_name_brain || p.site_code || 'Site';
  }

  // Icona punto singolo: DIV (mai marker blu)
  const siteCentroidIcon = L.divIcon({
    className: 'site-centroid-icon',
    html: `<div style="
      width:12px;height:12px;border-radius:999px;
      background:rgba(43,108,176,0.98);
      border:2px solid rgba(255,255,255,0.98);
      box-shadow:0 3px 12px rgba(0,0,0,0.25);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });

  function makeZoomCardHtml(fid, name) {
    const safeName = escapeHtml(name);
    const safeFid = Number.isFinite(Number(fid)) ? String(fid) : '';
    return `
      <div class="site-centroid-card">
        <div class="site-centroid-title">${safeName}</div>
        <div class="site-centroid-actions">
          <button class="site-centroid-btn primary" type="button" data-zoom-site="${safeFid}">
            Zoom to polygon
          </button>
          <button class="site-centroid-btn" type="button" data-open-site="${safeFid}">
            Open card
          </button>
        </div>
        <div class="site-centroid-note">At this scale we show centroids for clarity.</div>
      </div>
    `;
  }

  function siteClusterIconCreate(cluster) {
    const count = cluster.getChildCount();
    let size = 34;
    let sizeClass = 'site-cluster-small';
    if (count >= 50) { size = 52; sizeClass = 'site-cluster-large'; }
    else if (count >= 15) { size = 42; sizeClass = 'site-cluster-medium'; }

    return L.divIcon({
      className: `site-cluster-icon ${sizeClass}`,
      html: `<div class="site-cluster-bubble"><span>${count}</span></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function rebuildSitiCentroids(features) {
    if (!sitiCentroidsLayer) return;
    sitiCentroidsLayer.clearLayers();

    (features || []).forEach((feature) => {
      if (!(withinAffidabilitaSite(feature?.properties?.c_appr) && passesTypology(feature) && sitePassesChrono(feature))) return;

      const fid = Number(feature?.properties?.fid);
      const ll = centroidLatLngOfFeature(feature);
      if (!ll) return;

      const m = L.marker(ll, { icon: siteCentroidIcon, pane: 'sitesPane', riseOnHover: true });
      m.feature = feature;

      m.on('click', () => {
        const z = map.getZoom();
        if (z < SITES_POLYGON_MIN_ZOOM) {
          const name = getSiteDisplayName(feature);
          m.bindPopup(makeZoomCardHtml(fid, name), { closeButton: true, maxWidth: 360 }).openPopup();
        } else {
          const filteredContesti = contestiBase.filter(c => withinAffidabilitaContext(c?.properties?.c_appr));
          openSiteModal(feature, filteredContesti);
        }
      });

      sitiCentroidsLayer.addLayer(m);
    });
  }

  function makeSitiCentroidsLayer(features) {
    if (sitiCentroidsLayer) {
      try { map.removeLayer(sitiCentroidsLayer); } catch {}
      sitiCentroidsLayer = null;
    }

    sitiCentroidsLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: siteClusterIconCreate
    });

    rebuildSitiCentroids(features);
  }

  function updateSitesDisplay() {
    // ✅ se sites OFF: rimuovi tutto e stop
    if (!showSites) {
      if (sitiLayer && map.hasLayer(sitiLayer)) map.removeLayer(sitiLayer);
      if (sitiCentroidsLayer && map.hasLayer(sitiCentroidsLayer)) map.removeLayer(sitiCentroidsLayer);
      return;
    }

    const z = map.getZoom();
    const wantPolys = z >= SITES_POLYGON_MIN_ZOOM;

    if (wantPolys) {
      if (sitiCentroidsLayer && map.hasLayer(sitiCentroidsLayer)) map.removeLayer(sitiCentroidsLayer);
      if (sitiLayer && !map.hasLayer(sitiLayer)) map.addLayer(sitiLayer);
    } else {
      if (sitiLayer && map.hasLayer(sitiLayer)) map.removeLayer(sitiLayer);
      if (sitiCentroidsLayer && !map.hasLayer(sitiCentroidsLayer)) map.addLayer(sitiCentroidsLayer);
    }
  }
  map.on('zoomend', updateSitesDisplay);

  /* ===== contexts overlap picker ===== */
  const allContextLayers = [];

  function pointInRing(pt, ring) {
    // pt: [lng,lat]; ring: [[lng,lat],...]
    let x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect =
        ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygonGeom(pt, geom) {
    if (!geom) return false;
    const t = geom.type;
    const c = geom.coordinates;

    const inPoly = (poly) => {
      if (!poly?.length) return false;
      const outer = poly[0];
      if (!outer?.length) return false;
      if (!pointInRing(pt, outer)) return false;
      for (let k = 1; k < poly.length; k++) {
        const hole = poly[k];
        if (hole?.length && pointInRing(pt, hole)) return false;
      }
      return true;
    };

    if (t === 'Polygon') return inPoly(c);
    if (t === 'MultiPolygon') {
      for (const poly of c) if (inPoly(poly)) return true;
      return false;
    }
    return false;
  }

  function approxLayerAreaDeg2(layer) {
    try {
      const b = layer.getBounds?.();
      if (!b?.isValid?.()) return 1e9;
      return Math.abs((b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth()));
    } catch {
      return 1e9;
    }
  }

  function collectContextHits(latlng) {
    const pt = [latlng.lng, latlng.lat];
    const hits = [];

    for (const l of allContextLayers) {
      if (!l) continue;
      if (!isPathVisible(l)) continue;

      const b = l.getBounds?.();
      if (b && b.isValid && b.isValid() && !b.contains(latlng)) continue;

      const geom = l.feature?.geometry;
      if (!pointInPolygonGeom(pt, geom)) continue;

      hits.push(l);
    }

    // più piccoli prima (spesso quelli “sotto” o più specifici)
    hits.sort((a, b) => approxLayerAreaDeg2(a) - approxLayerAreaDeg2(b));
    return hits;
  }

  function showContextPicker(latlng, layers) {
    const items = layers.slice(0, 12).map(l => {
      const p = l.feature?.properties || {};
      const id = Number(p.fid);
      const name = escapeHtml(p.context_name || p.name || `Context ${p.fid ?? ''}`);
      return `<button class="poly-pick-btn" type="button" data-pick-context="${id}">${name}</button>`;
    }).join('');

    const extra = layers.length > 12
      ? `<div class="poly-pick-note">+${layers.length - 12} more… zoom in for precision</div>`
      : '';

    const html = `
      <div class="poly-pick-card">
        <div class="poly-pick-body">${items}${extra}</div>
      </div>
    `;

    L.popup({ className: 'poly-pick-popup', maxWidth: 320, closeButton: true, autoPan: true })
      .setLatLng(latlng)
      .setContent(html)
      .openOn(map);
  }

  /* ===== Hover helper (glow + style) ===== */
  function toggleGlow(layer, on) {
    try {
      const p = layer?._path;
      if (p && p.classList) {
        if (on) p.classList.add('hover-glow');
        else p.classList.remove('hover-glow');
      }
    } catch {}
  }

  function bindPolygonHover(layer, label, hoverStyle, resetFn) {
    try {
      layer.bindTooltip(label, {
        sticky: true,
        direction: 'top',
        opacity: 0.95,
        className: 'feature-hover-tip'
      });
    } catch {}

    layer.on('mouseover', () => {
      if (!isPathVisible(layer)) return;
      layer.setStyle(hoverStyle);
      toggleGlow(layer, true);
      try { layer.bringToFront(); } catch {}
    });

    layer.on('mouseout', () => {
      toggleGlow(layer, false);
      if (typeof resetFn === 'function') resetFn();
    });
  }

  function computeAllowedContextIdsByTypology() {
    const set = new Set();
    if (!contestiLayer) return set;
    contestiLayer.eachLayer(l => {
      const p = l.feature?.properties || {};
      const ok =
        withinAffidabilitaContext(p?.c_appr) &&
        passesTypology(l.feature) &&
        contextPassesChrono(l.feature);
      if (ok) {
        const id = Number(p.fid);
        if (Number.isFinite(id)) set.add(id);
      }
    });
    return set;
  }

  function applyTypologyFilters() {
    if (contestiLayer) {
      contestiLayer.setStyle(f =>
        withinAffidabilitaContext(f?.properties?.c_appr) && passesTypology(f) && contextPassesChrono(f)
          ? STYLE_CONTEXT
          : STYLE_CONTEXT_HIDDEN
      );
    }

    if (sitiLayer) sitiLayer.setStyle(f =>
      withinAffidabilitaSite(f?.properties?.c_appr) &&
      passesTypology(f) &&
      sitePassesChrono(f)
        ? STYLE_SITE
        : STYLE_SITE_HIDDEN
    );

    rebuildSitiCentroids(sitiSelezionati);

    const allowedCtxIds = computeAllowedContextIdsByTypology();
    if (samplesMgr?.applyContextIdSet) {
      samplesMgr.applyContextIdSet(allowedCtxIds.size ? allowedCtxIds : null);
    }

    refreshCharts();
    if (cardsView?.isActive?.()) cardsView.refresh();
    document.dispatchEvent(new CustomEvent('detail:filters-changed'));
  }

  await preloadLegendaTaxa();

  /* ===== Samples layer ===== */
  let samplesMgr = addObjectsLayer(map, samplesBase);
  samplesMgr?.setVisible(false); // OFF default
  samplesMgr?.applyRange?.(currentAffMin, currentAffMax);

  const oggToggle = document.getElementById('toggle-oggetti');
  const sitiToggle     = document.getElementById('toggle-siti');
  const contestiToggle = document.getElementById('toggle-contesti');

  let samplesForcedBySidebarFilter = false;
  let showSites = true;
  let showContexts = true;

  function syncSamplesVisibility() {
    const userWants = !!(oggToggle && oggToggle.checked);
    const shouldShow = userWants || samplesForcedBySidebarFilter;
    samplesMgr?.setVisible?.(shouldShow);
  }

  if (oggToggle) {
    if (!oggToggle.hasAttribute('data-init')) {
      oggToggle.checked = false;
      oggToggle.setAttribute('data-init', '1');
    }
    oggToggle.addEventListener('change', () => syncSamplesVisibility());
  }
  syncSamplesVisibility();

  if (sitiToggle && !sitiToggle.hasAttribute('data-init')) {
  sitiToggle.checked = true;
  sitiToggle.setAttribute('data-init', '1');
  }
  if (contestiToggle && !contestiToggle.hasAttribute('data-init')) {
    contestiToggle.checked = true;
    contestiToggle.setAttribute('data-init', '1');
  }

  function syncContextsVisibility() {
    showContexts = contestiToggle ? !!contestiToggle.checked : true;

    if (!contestiLayer) return;
    const has = map.hasLayer(contestiLayer);

    if (showContexts && !has) contestiLayer.addTo(map);
    if (!showContexts && has) map.removeLayer(contestiLayer);

    refreshCharts();
  }

  function syncSitesVisibility() {
  showSites = sitiToggle ? !!sitiToggle.checked : true;
  updateSitesDisplay();  
  refreshCharts();
  }

  contestiToggle?.addEventListener('change', syncContextsVisibility);
  sitiToggle?.addEventListener('change', syncSitesVisibility);

  buildSTypeToolbar(map, (value) => {
    currentSTypeFilter = (value === 'all') ? null : value;
    samplesMgr?.applySType?.(currentSTypeFilter);
    applyTypologyFilters();
    refreshCharts();
  });

  /* ===== Layers contexts + sites ===== */
  const contextLayerByFid = new Map();

  function openContextModalFromLayer(layer) {
    const feature = layer?.feature;
    const ctxId = Number(feature?.properties?.fid);
    const all = samplesIndex[ctxId] || [];
    const filtered = all.filter(samplePassesCurrentFilters);
    openTombaModal(feature, filtered);
  }

  function makeSitiLayer(sitiFeatures) {
    if (sitiLayer) { try { map.removeLayer(sitiLayer); } catch {} sitiLayer = null; }
    sitePolygonLayerByFid.clear();
    if (!sitiFeatures?.length) return;

    sitiLayer = L.geoJSON(sitiFeatures, {
      pane: 'sitesPane',
      style: (f) =>
        withinAffidabilitaSite(f?.properties?.c_appr) &&
        passesTypology(f) &&
        sitePassesChrono(f)
          ? STYLE_SITE
          : STYLE_SITE_HIDDEN,
        onEachFeature: (feature, layer) => {
        const fid = Number(feature?.properties?.fid);
        if (Number.isFinite(fid)) sitePolygonLayerByFid.set(fid, layer);

        const label = getSiteDisplayName(feature);
        bindPolygonHover(layer, label, STYLE_SITE_HOVER, () => {
          try { sitiLayer.resetStyle(layer); } catch {}
        });

        layer.on('click', (e) => {
          try {
            if (e?.originalEvent) {
              e.originalEvent.preventDefault();
              e.originalEvent.stopPropagation();
            }
          } catch {}

          const filteredContesti = contestiBase.filter(c => withinAffidabilitaContext(c?.properties?.c_appr));
          try { map.closePopup(); } catch {}
          try { closeTombaModal(); } catch {}
          try { closeSiteModal(); } catch {}
          openSiteModal(feature, filteredContesti);
        });
      }
    });
    // add/remove gestito da updateSitesDisplay()
  }

  function makeContestiLayer(contestiFeatures) {
    if (contestiLayer) {
      try { map.removeLayer(contestiLayer); } catch {}
      contestiLayer = null;
    }
    contextLayerByFid.clear();
    allContextLayers.length = 0;

    contestiLayer = L.geoJSON(contestiFeatures, {
      pane: 'contextsPane',
      style: (f) => (
        withinAffidabilitaContext(f?.properties?.c_appr) &&
        passesTypology(f) &&
        contextPassesChrono(f)
      ) ? STYLE_CONTEXT : STYLE_CONTEXT_HIDDEN,

      onEachFeature: (feature, layer) => {
        const ctxId = Number(feature?.properties?.fid);
        allContextLayers.push(layer);

        const p = feature?.properties || {};
        const label = (p.context_name || p.name || `Context ${p.fid ?? ''}`).trim();

        bindPolygonHover(layer, label, STYLE_CTX_HOVER, () => {
          try { contestiLayer.resetStyle(layer); } catch {}
        });

        // CLICK “smart”: se sovrapposti → picker, altrimenti modale
        layer.on('click', (e) => {
          try {
            if (e?.originalEvent) {
              e.originalEvent.preventDefault();
              e.originalEvent.stopPropagation();
            }
          } catch {}

          const hits = collectContextHits(e.latlng);
          if (hits.length <= 1) {
            try {
              const all = samplesIndex[ctxId] || [];
              const filtered = all.filter(samplePassesCurrentFilters);
              openTombaModal(feature, filtered);
            } catch (err) {
              console.warn('[openTombaModal]', err);
            }
            return;
          }

          showContextPicker(e.latlng, hits);
        });

        contextLayerByFid.set(ctxId, layer);
      }
    }).addTo(map);
  }

  function applyAffRangeToMap() {
    samplesMgr?.applyRange?.(currentAffMin, currentAffMax);
    applyTypologyFilters();
    if (cardsView?.isActive?.()) cardsView.refresh();
  }

  initCategoryFilter(samplesBase, (samplesFiltratiPerCategoria) => {
    const isActive = (samplesFiltratiPerCategoria !== null);

    if (!isActive) currentCategorySet = null;
    else currentCategorySet = new Set(samplesFiltratiPerCategoria.map(f => String(f?.properties?.precise_taxon || '')));

    samplesMgr?.applyCategorySet?.(currentCategorySet);

    samplesForcedBySidebarFilter = isActive;
    syncSamplesVisibility();

    applyTypologyFilters();
  });

  function getCardsItems() {
    const needSampleGate = !!currentCategorySet || !!currentSTypeFilter;

    return computeSiteCards({
      sitiFeatures: sitiSelezionati,
      contextsBySite,

      siteFilter: (siteF) => {
        const p = siteF?.properties || {};
        return withinAffidabilitaSite(p?.c_appr) && passesTypology(siteF);
      },

      contextFilter: (ctxF) => {
        const p = ctxF?.properties || {};
        if (!withinAffidabilitaContext(p?.c_appr)) return false;
        if (!passesTypology(ctxF)) return false;
        if (!contextPassesChrono(ctxF)) return false;

        // gate “sample-based” (taxa / s_type)
        if (needSampleGate) {
          const ctxId = Number(p?.fid);
          const arr = samplesIndex[ctxId] || [];
          if (!arr.some(samplePassesCurrentFilters)) return false;
        }
        return true;
      },

      requireAtLeastOneContext: true
    });
  }

  cardsView = initCardsView({
    containerId: 'cards-view',
    getItems: getCardsItems,
    onEnterCards: () => {
      try { map.closePopup(); } catch {}
      try { closeTombaModal(); } catch {}
      try { closeSiteModal(); } catch {}
    },
    onEnterMap: () => {
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 240);
    }
  });

  const btnCards = document.getElementById('toggle-sites-cards');
  btnCards?.addEventListener('click', () => {
    const on = cardsView.toggle();
    btnCards.classList.toggle('active', on);
    btnCards.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  let affApplyTimer = null;
  function normalizeAndApply(light = false) {
    if (!precMinInput || !precMaxInput) return;

    const aRaw = Number(precMinInput.value);
    const bRaw = Number(precMaxInput.value);

    let a = Number.isFinite(aRaw) ? snapToStep(aRaw) : AFF_MIN;
    let b = Number.isFinite(bRaw) ? snapToStep(bRaw) : AFF_MAX;

    if (a > b) [a, b] = [b, a];

    currentAffMin = a;
    currentAffMax = b;

    precMinInput.value = String(a);
    precMaxInput.value = String(b);

    updateAffUI();

    clearTimeout(affApplyTimer);
    affApplyTimer = setTimeout(() => applyAffRangeToMap(), light ? 100 : 200);
  }

  precMinInput?.addEventListener('input', () => normalizeAndApply(true));
  precMaxInput?.addEventListener('input', () => normalizeAndApply(true));
  ['pointerup', 'change'].forEach(ev => {
    precMinInput?.addEventListener(ev, () => normalizeAndApply(false));
    precMaxInput?.addEventListener(ev, () => normalizeAndApply(false));
  });
  updateAffUI();

  /* build layers */
  makeContestiLayer(contestiBase);
  makeSitiLayer(sitiSelezionati);
  makeSitiCentroidsLayer(sitiSelezionati);
  updateSitesDisplay();
  syncContextsVisibility();
  syncSitesVisibility();

  /* Centratura */
  function boundsFromFeatures(features) {
    try {
      if (!features?.length) return null;
      const gj = L.geoJSON({ type: 'FeatureCollection', features });
      const b = gj.getBounds();
      return (b && b.isValid()) ? b : null;
    } catch {
      return null;
    }
  }
  function unionBounds(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return a.extend(b.getNorthEast()).extend(b.getSouthWest());
  }

  if (!mapCentered) {
    const bSiti = boundsFromFeatures(sitiSelezionati);
    const bCont = boundsFromFeatures(contestiBase);
    const bSamples = boundsFromFeatures(samplesBase);
    let bounds = null;
    [bSiti, bCont, bSamples].forEach(b => { bounds = unionBounds(bounds, b); });
    if (bounds?.isValid()) {
      try { map.fitBounds(bounds.pad(0.10)); } catch {}
    }
  }

  /* ===== Zoom to polygon (NO popup) + flash highlight ===== */
  function flashSitePolygon(fid) {
    const lyr = sitePolygonLayerByFid.get(Number(fid));
    if (!lyr || !sitiLayer) return;

    try {
      lyr.setStyle({ color: '#facc15', weight: 6, fillOpacity: 0.26 });
      toggleGlow(lyr, true);
      lyr.bringToFront?.();
      setTimeout(() => {
        try { toggleGlow(lyr, false); } catch {}
        try { sitiLayer.resetStyle(lyr); } catch {}
      }, 900);
    } catch {}
  }

  async function zoomToSitePolygon(fid) {
    const f = siteFeatureByFid.get(Number(fid));
    if (!f) return;

    const b = centroidBoundsOfFeature(f);
    if (!b) return;

    try { map.closePopup(); } catch {}
    try { closeTombaModal(); } catch {}
    try { closeSiteModal(); } catch {}

    try { map.fitBounds(b.pad(0.12), { animate: true }); } catch {}

    const ensureZoom = () => {
      const z = map.getZoom();
      if (z < SITES_POLYGON_MIN_ZOOM) {
        try { map.setView(b.getCenter(), SITES_POLYGON_MIN_ZOOM, { animate: true }); } catch {}
      }
    };

    return new Promise((resolve) => {
      let step = 0;
      const handler = () => {
        step += 1;
        if (step === 1) ensureZoom();

        const z = map.getZoom();
        if (z >= SITES_POLYGON_MIN_ZOOM) {
          updateSitesDisplay();
          flashSitePolygon(fid);
          map.off('zoomend', handler);
          map.off('moveend', handler);
          resolve();
        }
      };

      map.on('zoomend', handler);
      map.on('moveend', handler);
      setTimeout(handler, 450);
    });
  }

  /* ===== Delegated clicks (centroid popup + overlap picker + link contesti) ===== */
  document.addEventListener('click', async (e) => {
    const btnZoom = e.target.closest('button[data-zoom-site]');
    if (btnZoom) {
      e.preventDefault();
      e.stopPropagation();
      const fid = Number(btnZoom.getAttribute('data-zoom-site'));
      if (Number.isFinite(fid)) await zoomToSitePolygon(fid);
      return;
    }

    const btnOpen = e.target.closest('button[data-open-site]');
    if (btnOpen) {
      e.preventDefault();
      e.stopPropagation();

      const fid = Number(btnOpen.getAttribute('data-open-site'));
      if (!Number.isFinite(fid)) return;

      const f = siteFeatureByFid.get(fid);
      if (!f) return;

      const filteredContesti = contestiBase.filter(c => withinAffidabilitaContext(c?.properties?.c_appr));
      try { map.closePopup(); } catch {}
      try { closeTombaModal(); } catch {}
      try { closeSiteModal(); } catch {}
      openSiteModal(f, filteredContesti);
      return;
    }

    const pick = e.target.closest('button[data-pick-context]');
    if (pick) {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(pick.getAttribute('data-pick-context'));
      if (!Number.isFinite(id)) return;
      const lyr = contextLayerByFid.get(id);
      if (!lyr) return;

      try { map.closePopup(); } catch {}
      try { lyr.bringToFront?.(); } catch {}
      openContextModalFromLayer(lyr);
      return;
    }

    const aCtx = e.target.closest('a[data-open-context]');
    if (aCtx) {
      e.preventDefault();
      const ctxId = Number(aCtx.getAttribute('data-open-context'));
      if (Number.isFinite(ctxId)) openContextPopupById(ctxId);
      return;
    }
  });

  /* ===== Site chart ===== */
  function getVisibleFeaturesFromPolygons(layer) {
    if (!layer) return [];
    const view = map.getBounds();
    const out = [];
    try {
      layer.eachLayer(l => {
        if (!l.getBounds) return;
        if (!isPathVisible(l)) return;
        const lb = l.getBounds();
        if (lb && lb.isValid() && view.intersects(lb)) out.push(l.feature);
      });
    } catch {}
    return out;
  }

  function getVisibleSiteFeaturesFromCentroids() {
    const out = [];
    const view = map.getBounds();
    const seen = new Set();

    if (!sitiCentroidsLayer) return out;

    try {
      sitiCentroidsLayer.eachLayer(l => {
        if (!l.getLatLng) return;
        const ll = l.getLatLng();
        if (!view.contains(ll)) return;

        if (typeof l.getAllChildMarkers === 'function') {
          const kids = l.getAllChildMarkers() || [];
          kids.forEach(m => {
            const f = m.feature;
            const fid = Number(f?.properties?.fid);
            const key = Number.isFinite(fid) ? `fid:${fid}` : `obj:${String(f?.properties?.name || '')}`;
            if (f && !seen.has(key)) { seen.add(key); out.push(f); }
          });
          return;
        }

        if (l.feature) {
          const f = l.feature;
          const fid = Number(f?.properties?.fid);
          const key = Number.isFinite(fid) ? `fid:${fid}` : `obj:${String(f?.properties?.name || '')}`;
          if (!seen.has(key)) { seen.add(key); out.push(f); }
        }
      });
    } catch {}

    return out;
  }

  await initSiteGraph({
    mode: 'contexts',
    getFeaturesForMode: (mode) => {
      if (mode === 'contexts') return getVisibleFeaturesFromPolygons(contestiLayer);
      const wantPolys = map.getZoom() >= SITES_POLYGON_MIN_ZOOM;
      return wantPolys ? getVisibleFeaturesFromPolygons(sitiLayer) : getVisibleSiteFeaturesFromCentroids();
    },
    onFilterChange: ({ activeTypologies }) => {
      activeTypo = activeTypologies;
      applyTypologyFilters();
    }
  });

  window.renderSiteGraphLazy = () => renderSiteGraph(getVisibleFeaturesFromPolygons(contestiLayer), { mode: 'contexts' });

  function refreshSiteChart() {
    const featsCtx = showContexts ? getVisibleFeaturesFromPolygons(contestiLayer) : [];
    const wantPolys = map.getZoom() >= SITES_POLYGON_MIN_ZOOM;
    const featsSite = showSites ? (wantPolys ? getVisibleFeaturesFromPolygons(sitiLayer) : getVisibleSiteFeaturesFromCentroids()) : [];

    if (featsCtx.length) renderSiteGraph(featsCtx, { mode: 'contexts' });
    else if (featsSite.length) renderSiteGraph(featsSite, { mode: 'sites' });
    else renderSiteGraph(contestiBase, { mode: 'contexts' });
  }

  /* ===== Samples chart ===== */
  function getVisibleSamples() {
    const b = map.getBounds();
    const allowedCtx = computeAllowedContextIdsByTypology();
    const out = [];

    for (const f of samplesBase) {
      const p = f.properties || {};
      if (!withinAffidabilitaSample(p.precision)) continue;
      if (currentCategorySet && !currentCategorySet.has(String(p.precise_taxon || ''))) continue;
      if (currentSTypeFilter) {
        const st = String(p.s_type || '').trim().toLowerCase();
        if (st !== currentSTypeFilter) continue;
      }

      const cid = getSampleCtxId(f);
      if (allowedCtx.size && !allowedCtx.has(cid)) continue;

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

  function refreshSamplesChart() { renderSamplesGraph(); }
  function refreshCharts() { refreshSiteChart(); refreshSamplesChart(); }

  map.on('moveend zoomend', refreshCharts);

  applyTypologyFilters();
  document.dispatchEvent(new CustomEvent('detail:ready'));

  /* Link Sample → Context */
  function openContextPopupById(ctxId) {
    const layer = contextLayerByFid.get(Number(ctxId));
    if (!layer) return;

    if (layer.getBounds) {
      const b = layer.getBounds();
      if (b.isValid()) map.fitBounds(b.pad(0.15));
    }

    openContextModalFromLayer(layer);
  }
  window.__openContextPopup = openContextPopupById;

  /* ======= API per timebar_detail.js ======= */
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
    chronoTo = Math.min(max, Math.max(a, b));
    includeUndated = !!include;

    applyTypologyFilters();
    document.dispatchEvent(new CustomEvent('detail:filters-changed'));
  }

  window.__detail_getPhases = () => PHASES.slice();
  window.__detail_setChronoRange = __detail_setChronoRange;
  window.__detail_computePhaseCounts = __detail_computePhaseCounts;
  window.__detail_getSelectedRange = () => ({ from: chronoFrom, to: chronoTo, includeUndated });

  /* Utils */
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s])
    );
  }
})();
