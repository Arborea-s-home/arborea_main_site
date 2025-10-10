// record_necropoli/necropoli/objects_layer.js
import { getPath } from '../../path_utils.js';

/* ==== Config fallback logo progetto ==== */
const PROJECT_LOGO = getPath("images/objects/logo_semplificato.png"); // <--- imposta il path del tuo logo

/* ==== Scala colori affidabilità (0→verde … 4→rosso; NULL trattato come 4) ==== */
const AFF_COLORS = ['#22c55e', '#a3e635', '#facc15', '#f59e0b', '#ef4444'];
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
/** Ritorna indice 0..4; valori non numerici → 4 */
function affIndex(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 4;
  return clamp(Math.round(n), 0, 4);
}
function affColor(v) { return AFF_COLORS[ affIndex(v) ]; }
function hexToRgba(hex, alpha = 0.25) {
  const h = (hex || '').replace('#', '').trim();
  let r = 153, g = 163, b = 175;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length >= 6) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- Risoluzione icona del sample ---------- */
const TAXA_ICON_GLOBAL_KEY = "__TAXA_ICONS__";
function getTaxonIconFromGlobal(preciseTaxon) {
  try {
    const map = (window && window[TAXA_ICON_GLOBAL_KEY]) || null;
    if (!map) return null;
    return map[preciseTaxon] || null;
  } catch { return null; }
}
/** 1) foto sample; 2) icona legenda_taxa image_2; 3) logo progetto */
function chooseImagePath(props) {
  const photo = (props.photo || '').trim();
  if (photo) return getPath(`images/samples/${photo}`);
  const ptx = (props.precise_taxon || '').trim();
  if (ptx) {
    const icon2 = getTaxonIconFromGlobal(ptx);
    if (icon2) return getPath(`images/objects/${icon2}`);
  }
  return PROJECT_LOGO;
}

// --- JOIN Sample → Context (accetta context_id o contesti_id)
function getSampleCtxIdFromFeature(f) {
  const p = (f && f.properties) ? f.properties : {};
  const a = Number(p.context_id);
  if (Number.isFinite(a)) return a;
  const b = Number(p.contesti_id);
  return Number.isFinite(b) ? b : null;
}

function makeIcon(imgAbsPath, size, aff) {
  const stroke = affColor(aff);
  const fallback = PROJECT_LOGO; // fallback definitivo
  // fallback client-side se l’immagine non si carica
  return L.divIcon({
    className: "object-icon",
    iconSize: [size, size],
    html: `
      <div style="
        width:${size}px; height:${size}px; border-radius:50%;
        overflow:hidden; border:2px solid ${stroke};
        box-shadow:0 0 4px rgba(0,0,0,0.3); position:relative;">
       <img src="${imgAbsPath}" alt="" loading="lazy" decoding="async"
             onerror="this.onerror=null;this.src='${fallback}';"
             style="width:100%; height:100%; object-fit:cover; display:block;">
      </div>`
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s])
  );
}

/**
 * Manager dei SAMPLES con prestazioni ottimizzate:
 *  - Crea TUTTI i marker una volta sola (chunkedLoading per non bloccare il main thread).
 *  - Applica filtro Affidabilità (range) montando/smontando interi bucket 0..4.
 *  - Applica filtro Categoria (Set di precise_taxon) senza ricostruire: add/remove per taxa.
 *  - Filtro tipologia via JOIN sul contesto (Set di fid contesti ammessi).
 *  - Filtro s_type (wood/carpological) combinato con gli altri.
 */
export function addObjectsLayer(map, samplesFeatures) {
  const size = 40;

  /* Panes */
  const objectsPane = map.getPane('objectsPane') || map.createPane('objectsPane');
  objectsPane.style.zIndex = 370;
  objectsPane.style.pointerEvents = 'auto';
  const basePane  = map.getPane('basePointsPane') || map.createPane('basePointsPane');
  basePane.style.zIndex = 350;
  basePane.style.pointerEvents = 'none';
  const linesPane = map.getPane('linesPane') || map.createPane('linesPane');
  linesPane.style.zIndex = 360;
  linesPane.style.pointerEvents = 'none';

  // Canvas renderer (più leggero di SVG)
  const baseRenderer  = L.canvas({ pane: 'basePointsPane' });
  const linesRenderer = L.canvas({ pane: 'linesPane' });

  /* Bucket 0..4 (NULL trattati come 4) */
  const NUM_BUCKETS = 5;
  const BUCKETS = new Array(NUM_BUCKETS).fill(null).map(() => ({
    clusterGroup: null,
    basePointsGroup: null,
    lineLayerGroup: null,
  }));

  function makeClusterForBucket(bucketIdx) {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 20,
      showCoverageOnHover: false,
      chunkedLoading: true,
      pane: 'objectsPane'
    });
    cluster.options.iconCreateFunction = (cl) => {
      const markers = cl.getAllChildMarkers();
      const vals = markers.map(m => affIndex(m.options.__aff));
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 4;
      const stroke = AFF_COLORS[Math.round(avg)];
      const fill = hexToRgba(stroke, 0.25);
      return L.divIcon({
        html: `
          <div style="
            width:36px;height:36px;line-height:36px;border-radius:50%;
            background:${fill}; border:2px solid ${stroke};
            text-align:center;font-weight:bold;">
            ${cl.getChildCount()}
          </div>`,
        className: 'cluster-icon',
        iconSize: [36, 36]
      });
    };
    cluster.on('clusterclick', (e) => e.layer.spiderfy());
    return cluster;
  }

  for (let i = 0; i < NUM_BUCKETS; i++) {
    BUCKETS[i].clusterGroup    = makeClusterForBucket(i);
    BUCKETS[i].basePointsGroup = L.layerGroup([], { pane: 'basePointsPane' });
    BUCKETS[i].lineLayerGroup  = L.layerGroup([], { pane: 'linesPane' });
  }

  /* === Indici per aggiornarci velocemente sui filtri === */
  // precise_taxon → array di handle { marker, basePoint, bucketIdx, precise, ctxId, stype }
  const indexByTaxon = new Map();
  // 0..4 → array di handle
  const indexByBucket = Array.from({ length: NUM_BUCKETS }, () => []);

  // Stato filtri
  let allowedTaxaSet = null;           // Set<string> o null | Set() vuoto: mostra niente
  let allowedContextIdSet = null;      // Set<number> o null
  let allowedSType = null;             // null = tutti | 'wood' | 'carpological'
  let currentMin = 0, currentMax = 4;  // range affidabilità
  let visible = true;

  // Helpers mount/unmount rapidi
  function addHandleToMap(handle) {
    const B = BUCKETS[handle.bucketIdx];
    if (!B) return;
    B.basePointsGroup.addLayer(handle.basePoint);
    B.clusterGroup.addLayer(handle.marker);
  }
  function removeHandleFromMap(handle) {
    const B = BUCKETS[handle.bucketIdx];
    if (!B) return;
    if (handle._lineToCluster) {
      B.lineLayerGroup.removeLayer(handle._lineToCluster);
      handle._lineToCluster = null;
    }
    try { B.clusterGroup.removeLayer(handle.marker); } catch {}
    try { B.basePointsGroup.removeLayer(handle.basePoint); } catch {}
  }

  /* === Costruzione marker === */
  let totalAdded = 0;

  samplesFeatures.forEach((f) => {
    const props = f.properties || {};
    const geom  = f.geometry || {};

    let coord = null;
    if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
      coord = geom.coordinates[0];
    } else if (geom.type === 'Point') {
      coord = geom.coordinates;
    }
    if (!coord || coord.length < 2) return;

    const latlng = L.latLng(coord[1], coord[0]);
    const aff = affIndex(props.precision); // NULL→4
    const bucketIdx = aff;                 // 0..4
    const B = BUCKETS[bucketIdx];
    if (!B) return;

    const stroke = affColor(aff);
    const fill = hexToRgba(stroke, 0.15);

    // puntino base
    const basePoint = L.circleMarker(latlng, {
      pane: 'basePointsPane',
      radius: 3,
      color: stroke,
      fillColor: fill,
      fillOpacity: 1,
      weight: 1,
      interactive: false,
      bubblingMouseEvents: false,
      renderer: baseRenderer
    });

    // icona / marker (+ fallback img lato client)
    const imgAbs = chooseImagePath(props);
    const icon = makeIcon(imgAbs, size, aff);

    const marker = L.marker(latlng, {
      icon,
      title: props.taxon || props.precise_taxon || "sample",
      __aff: aff,
      pane: 'objectsPane',
      updateWhenDragging: false,
      updateWhenZooming: false
    });

    // linea cluster→marker creata solo se realmente in cluster
    marker.on('add', () => {
      const cluster = B.clusterGroup.getVisibleParent(marker);
      if (cluster && cluster !== marker) {
        const clusterLatLng = cluster.getLatLng();
        const line = L.polyline([clusterLatLng, latlng], {
          pane: 'linesPane',
          color: '#666',
          weight: 1,
          dashArray: '2,4',
          opacity: 0.7,
          interactive: false,
          bubblingMouseEvents: false,
          renderer: linesRenderer
        }).addTo(B.lineLayerGroup);
        marker._lineToCluster = line;
        cluster.on('move', () => line.setLatLngs([cluster.getLatLng(), latlng]));
      }
    });
    marker.on('remove', () => {
      if (marker._lineToCluster) {
        B.lineLayerGroup.removeLayer(marker._lineToCluster);
        marker._lineToCluster = null;
      }
    });

    // === POPUP — nuovo layout ===============================================
    const idSample  = props.fid;
    const precise   = (props.precise_taxon || "").trim();
    const family    = (props.family || props.Family || "").trim();
    const stype     = props.s_type || "-";
    const spart     = props.s_part || "-";
    const sfoss     = props.s_foss || "-";
    const note      = props.note || props.s_notes || "";
    const bibl      = props.bibliography || "";
    const contextId = props.context_id;
    const precision = (props.precision != null ? String(props.precision) : '4');
    const entity    = (props.entity != null && props.entity !== '') ? String(props.entity) : null;
    const qt        = (props.qt != null && props.qt !== '' && Number.isFinite(Number(props.qt))) ? Number(props.qt) : null;
    const publishedAs = (props.species_orig_pub || "").trim();

    // Iconcina di intestazione = icona di cat_2 (image_2); fallback: logo progetto
    const icon2Rel = getTaxonIconFromGlobal(precise) || null;
    const headerIcon = icon2Rel ? getPath(`images/objects/${icon2Rel}`) : PROJECT_LOGO;
    const fallbackIcon = PROJECT_LOGO;

    // Campo "cf" secondo priorità tassonomica: genus > species > subspecies
    function computeCfTag(p) {
      const cg = !!p.cf_genus, cs = !!p.cf_sp, csub = !!p.cf_subsp;
      if (cg) return 'genus';
      if (cs) return 'species';
      if (csub) return 'subspecies';
      return null;
    }
    const cfTag = computeCfTag(props);

    // Quantity unificata: priorità a qt; altrimenti entity; altrimenti "not reported"
    let quantityValue = "not reported";
    if (qt != null && Number.isFinite(qt)) quantityValue = String(qt);
    else if (entity) quantityValue = entity;

    const popupContent = `
      <div class="popup-wrapper object">

        <!-- Testata con iconcina (cat_2) + titolo -->
        <div class="obj-header">
          <img class="obj-header-icon" src="${headerIcon}" alt="" loading="lazy"
               onerror="this.onerror=null;this.src='${fallbackIcon}';">
          <div class="obj-header-title">
            <div class="obj-header-precise"><strong>${escapeHtml(precise || "-")}</strong></div>
            <div class="obj-header-family"><em>${escapeHtml(family || "-")}</em></div>
          </div>
        </div>

        <!-- Corpo a due colonne -->
        <div class="obj-body">
          <div class="obj-col obj-col-left">
            ${publishedAs ? `
              <div class="popup-info-item">
                <div class="popup-info-label">PUBLISHED AS</div>
                <div class="popup-info-value">${escapeHtml(publishedAs)}</div>
              </div>` : ''}

            ${cfTag ? `
              <div class="popup-info-item">
                <div class="popup-info-label">CF</div>
                <div class="popup-info-value">${escapeHtml(cfTag)}</div>
              </div>` : ''}

            <div class="popup-info-item">
              <div class="popup-info-label">SAMPLE TYPE</div>
              <div class="popup-info-value">${escapeHtml(stype)}</div>
            </div>

            <div class="popup-info-item">
              <div class="popup-info-label">PART / FOSSILIZATION</div>
              <div class="popup-info-value">${escapeHtml(spart)} / ${escapeHtml(sfoss)}</div>
            </div>

            <div class="popup-info-item">
              <div class="popup-info-label">QUANTITY</div>
              <div class="popup-info-value">${escapeHtml(quantityValue)}</div>
            </div>

            <div class="popup-info-item">
              <div class="popup-info-label">RELIABILITY</div>
              <div class="popup-info-value">${escapeHtml(precision)}</div>
            </div>

            ${note ? `
              <div class="popup-info-item">
                <div class="popup-info-label">NOTES</div>
                <div class="popup-info-value">${escapeHtml(note)}</div>
              </div>` : ''}
          </div>

          <div class="obj-divider"></div>

          <div class="obj-col obj-col-right">
            ${bibl ? `
              <div class="popup-info-item">
                <div class="popup-info-label">BIBLIOGRAPHY</div>
                <div class="popup-info-value">${escapeHtml(bibl)}</div>
              </div>` : ''}

            <div class="obj-links">
              ${contextId != null ? `
                <a class="obj-link" href="#" data-open-context="${escapeHtml(String(contextId))}">
                  <i class="popup-link-icon">↗</i> View the whole context
                </a>` : ''}

              <a class="obj-link" href="../record_object/record_object.html?fid=${idSample}"
                 target="_blank" rel="noopener">
                <i class="popup-link-icon">↗</i> View full record
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
    const affCls = `precision-${aff}`;
    marker.bindPopup(popupContent, {
      className: `leaflet-popup-object ${affCls}`,
      maxWidth: 600,              // allineato al CSS
      minWidth: 360
    });
    marker.bindTooltip(props.taxon || props.precise_taxon || "sample", {
      direction: 'top', offset: [0, -10], opacity: 0.9
    });

    // Handle negli indici
    const handle = {
      marker, basePoint, bucketIdx,
      precise: (props.precise_taxon || '').trim(),
      ctxId: getSampleCtxIdFromFeature(f),
      stype: (props.s_type || '').trim().toLowerCase()
    };
    indexByBucket[bucketIdx].push(handle);
    if (!indexByTaxon.has(handle.precise)) indexByTaxon.set(handle.precise, []);
    indexByTaxon.get(handle.precise).push(handle);

    // monta subito
    addHandleToMap(handle);

    totalAdded++;
  });

  // mount/unmount gruppi bucket
  const mounted = new Set();
  function mountBucket(i) {
    if (mounted.has(i)) return;
    const B = BUCKETS[i];
    if (!B) return;
    map.addLayer(B.basePointsGroup);
    map.addLayer(B.lineLayerGroup);
    map.addLayer(B.clusterGroup);
    mounted.add(i);
  }
  function unmountBucket(i) {
    if (!mounted.has(i)) return;
    const B = BUCKETS[i];
    if (!B) return;
    map.removeLayer(B.clusterGroup);
    map.removeLayer(B.basePointsGroup);
    map.removeLayer(B.lineLayerGroup);
    mounted.delete(i);
  }

  // Helpers visibilità
  const handleInRange = (h) => (h.bucketIdx >= currentMin && h.bucketIdx <= currentMax);
  const handlePassesCategory = (h) => {
    if (allowedTaxaSet === null) return true;              // nessun filtro categoria
    if (allowedTaxaSet.size === 0) return false;           // set vuoto => mostra niente
    return allowedTaxaSet.has(h.precise);
  };
  const handlePassesContext  = (h) => (!allowedContextIdSet || allowedContextIdSet.has(h.ctxId));
  const handlePassesSType    = (h) => {
    if (!allowedSType) return true;
    const s = (h.stype || '').toLowerCase();
    return s === allowedSType;
  };
  const handleShouldBeOnMap  = (h) =>
    (handleInRange(h) && handlePassesCategory(h) && handlePassesContext(h) && handlePassesSType(h));

  // Applica categoria (Set di precise_taxon ammessi)
  function applyCategorySet(setOrNull) {
    // Stati:
    //  - null  => nessun filtro categoria (mostra tutto, rispettando range + context + s_type)
    //  - Set() vuoto => mostra NIENTE
    //  - Set([...])  => mostra solo quei taxa
    const was = allowedTaxaSet;
    allowedTaxaSet = (setOrNull instanceof Set) ? setOrNull : null;

    const toRemoveByBucket = Array.from({length: NUM_BUCKETS}, () => ({markers:[], base:[]}));
    const toAddByBucket    = Array.from({length: NUM_BUCKETS}, () => ({markers:[], base:[]}));

    for (let i = 0; i < NUM_BUCKETS; i++) {
      const B = BUCKETS[i]; if (!B) continue;
      const arr = indexByBucket[i];
      for (const h of arr) {
        const has  = B.clusterGroup.hasLayer(h.marker);
        const want = handleShouldBeOnMap(h);
        if (want && !has) {
          toAddByBucket[i].markers.push(h.marker);
          toAddByBucket[i].base.push(h.basePoint);
        } else if (!want && has) {
          toRemoveByBucket[i].markers.push(h.marker);
          toRemoveByBucket[i].base.push(h.basePoint);
        }
      }
    }

    toRemoveByBucket.forEach((b, i) => {
      const B = BUCKETS[i]; if (!B) return;
      if (b.markers.length) B.clusterGroup.removeLayers(b.markers);
      for (const bp of b.base) B.basePointsGroup.removeLayer(bp);
    });

    toAddByBucket.forEach((b, i) => {
      const B = BUCKETS[i]; if (!B) return;
      if (b.markers.length) B.clusterGroup.addLayers(b.markers);
      for (const bp of b.base) B.basePointsGroup.addLayer(bp);
    });
  }

  // Filtro per CONTEXT ID set (join tipologia contesto)
  function applyContextIdSet(setOrNull) {
    allowedContextIdSet = (setOrNull instanceof Set && setOrNull.size) ? setOrNull : null;

    const toRemoveByBucket = Array.from({length: NUM_BUCKETS}, () => ({markers:[], base:[]}));
    const toAddByBucket    = Array.from({length: NUM_BUCKETS}, () => ({markers:[], base:[]}));

    for (let i = 0; i < NUM_BUCKETS; i++) {
      const B = BUCKETS[i]; if (!B) continue;
      const arr = indexByBucket[i];
      for (const h of arr) {
        const want = handleShouldBeOnMap(h);
        const has  = B.clusterGroup.hasLayer(h.marker);
        if (want && !has) {
          toAddByBucket[i].markers.push(h.marker);
          toAddByBucket[i].base.push(h.basePoint);
        } else if (!want && has) {
          toRemoveByBucket[i].markers.push(h.marker);
          toRemoveByBucket[i].base.push(h.basePoint);
        }
      }
    }

    toRemoveByBucket.forEach((b, i) => {
      const B = BUCKETS[i]; if (!B) return;
      if (b.markers.length) B.clusterGroup.removeLayers(b.markers);
      for (const bp of b.base) B.basePointsGroup.removeLayer(bp);
    });

    toAddByBucket.forEach((b, i) => {
      const B = BUCKETS[i]; if (!B) return;
      if (b.markers.length) B.clusterGroup.addLayers(b.markers);
      for (const bp of b.base) B.basePointsGroup.addLayer(bp);
    });
  }

  // Applica filtro s_type (wood/carpological)
  function applySType(valueOrNull) {
    allowedSType = (valueOrNull ? String(valueOrNull).toLowerCase() : null);

    const toRemoveByBucket = Array.from({length: NUM_BUCKETS}, () => ({markers:[], base:[]}));
    const toAddByBucket    = Array.from({length: NUM_BUCKETS}, () => ({markers:[], base:[]}));

    for (let i = 0; i < NUM_BUCKETS; i++) {
      const B = BUCKETS[i]; if (!B) continue;
      const arr = indexByBucket[i];
      for (const h of arr) {
        const want = handleShouldBeOnMap(h);
        const has  = B.clusterGroup.hasLayer(h.marker);
        if (want && !has) {
          toAddByBucket[i].markers.push(h.marker);
          toAddByBucket[i].base.push(h.basePoint);
        } else if (!want && has) {
          toRemoveByBucket[i].markers.push(h.marker);
          toRemoveByBucket[i].base.push(h.basePoint);
        }
      }
    }

    toRemoveByBucket.forEach((b, i) => {
      const B = BUCKETS[i]; if (!B) return;
      if (b.markers.length) B.clusterGroup.removeLayers(b.markers);
      for (const bp of b.base) B.basePointsGroup.removeLayer(bp);
    });
    toAddByBucket.forEach((b, i) => {
      const B = BUCKETS[i]; if (!B) return;
      if (b.markers.length) B.clusterGroup.addLayers(b.markers);
      for (const bp of b.base) B.basePointsGroup.addLayer(bp);
    });
  }

  // Applica range (0..4). I NULL già mappati a 4.
  function applyRange(min, max) {
    currentMin = clamp(min, 0, 4);
    currentMax = clamp(max, 0, 4);
    if (!visible) return;

    for (let i = 0; i < NUM_BUCKETS; i++) {
      const inRange = (i >= currentMin && i <= currentMax);
      if (inRange) {
        mountBucket(i);
        // rispetta i filtri attivi (categoria + context + s_type)
        if (allowedTaxaSet !== null || allowedContextIdSet || allowedSType) {
          indexByBucket[i].forEach(h => {
            if (!handlePassesCategory(h) || !handlePassesContext(h) || !handlePassesSType(h)) removeHandleFromMap(h);
          });
        }
      } else {
        unmountBucket(i);
      }
    }
  }

  function setVisible(v) {
    visible = !!v;
    const disp = visible ? '' : 'none';
    // nascondi/mostra in O(1)
    objectsPane.style.display   = disp;
    basePane.style.display      = disp;
    linesPane.style.display     = disp;
    // fallback: nascondi anche le icone dei cluster via classe
    const container = map.getContainer();
    container.classList.toggle('objects-hidden', !visible);
  }

  function destroy() {
    for (let i = 0; i < NUM_BUCKETS; i++) {
      const B = BUCKETS[i]; if (!B) continue;
      try { map.removeLayer(B.clusterGroup); } catch {}
      try { map.removeLayer(B.basePointsGroup); } catch {}
      try { map.removeLayer(B.lineLayerGroup); } catch {}
      try { B.basePointsGroup.clearLayers(); } catch {}
      try { B.lineLayerGroup.clearLayers(); } catch {}
      try { B.clusterGroup.clearLayers(); } catch {}
    }
  }

  // Monta iniziale (range completo)
  for (let i = 0; i < NUM_BUCKETS; i++) mountBucket(i);
  console.log(`[SamplesLayerBuckets] markers creati una sola volta: ${totalAdded}`);

  return {
    type: 'samplesBuckets',
    applyRange,
    applyContextIdSet,
    setVisible,
    destroy,
    applyCategorySet,
    applySType,                 // <— nuovo
    _dbg: { indexByTaxon, indexByBucket }
  };
}

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
