// record_necropoli/necropoli/objects_layer.js
import { getPath } from '../../path_utils.js';

/* ==== Config fallback logo progetto ==== */
const PROJECT_LOGO = getPath("images/objects/logo_semplificato.png"); // <--- fallback generale

/* ==== Scala colori affidabilità (0→verde … 4→rosso; NULL trattato come 4) ==== */
const AFF_COLORS = ['#22c55e', '#a3e635', '#facc15', '#f59e0b', '#ef4444'];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Ritorna indice 0..4; valori non numerici → 4 */
function affIndex(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 4;
  return clamp(Math.round(n), 0, 4);
}

function affColor(v) {
  return AFF_COLORS[ affIndex(v) ];
}

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

/* ========= Escape HTML ========= */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s])
  );
}

function smartItalics(str) {
  const raw = String(str || '').trim();
  if (!raw) return '';

  // split su spazi: le "parole" (token) sono separate da whitespace
  const parts = raw.split(/\s+/);

  const rendered = parts.map(tok => {
    if (tok.includes('.')) {
      // niente corsivo per token tipo "L." / "sp." / "(L.)" / "Vill."
      return `<span class="no-italic">${escapeHtml(tok)}</span>`;
    } else {
      // corsivo per il resto
      return `<em>${escapeHtml(tok)}</em>`;
    }
  });

  return rendered.join(' ');
}

/* ========= Precision → className ========= */
function precisionClassName(p) {
  if (!Number.isFinite(p) || p < 0) return 'precision-unknown';
  const v = Math.max(0, Math.min(4, Math.floor(p)));
  return `precision-${v}`;
}

/* ========= Icona SEMPLICE (vecchia versione) =========
   (La teniamo per retro-compatibilità. Ora usiamo makeIconWithBadge().) */
function makeIcon(imgAbsPath, size, aff) {
  const stroke = affColor(aff);
  const fallback = PROJECT_LOGO; // fallback definitivo
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

/* ========= NUOVA icona con badge numerico wedge ========= */
function makeIconWithBadge(imgAbsPath, size, aff, count = 1) {
  const ringColor = affColor(aff);
  const fallback  = PROJECT_LOGO;

  const showBadge = count > 1;
  const badgeText = (count > 99) ? '99+' : String(count);

  return L.divIcon({
    className: `object-icon ${precisionClassName(aff)}`,
    // aggiungo 8px totali per non tagliare l’alone/ombra
    iconSize: [size + 8, size + 8],
    html: `
      <div style="
        position:relative;
        margin:4px;
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        background:#fff;                /* PIENO bianco, niente trasparenze */
        border:3px solid ${ringColor};   /* colore affidabilità */
        box-shadow:0 1px 4px rgba(0,0,0,.28);
        overflow:hidden;                /* maschero l'immagine nel cerchio */
      ">
        <!-- immagine del taxon: riempie quasi tutto e viene mascherata in tondo -->
        <img src="${imgAbsPath}" alt="" loading="lazy" decoding="async"
             onerror="this.onerror=null;this.src='${fallback}';"
             style="
               position:absolute;
               left:3px; top:3px; right:3px; bottom:3px;
               width:calc(100% - 6px);
               height:calc(100% - 6px);
               border-radius:50%;
               background:#fff;          /* garantisce fondo bianco pieno */
               object-fit:contain;       /* mantiene il disegno proporzionato */
               display:block;
             "/>

        ${showBadge ? `
          <!-- badge del numero: pallina nera con bordo bianco -->
          <div style="
            position:absolute;
            top:-4px;
            right:-4px;
            min-width:18px;
            height:18px;
            padding:0 4px;
            background:#000;
            color:#fff;
            font-weight:700;
            font-size:11px;
            line-height:18px;
            border-radius:999px;
            border:2px solid #fff;        /* bordino bianco per staccarlo dall'icona */
            box-shadow:0 1px 2px rgba(0,0,0,.5);
            text-align:center;
            pointer-events:none;
            user-select:none;
          ">
            ${badgeText}
          </div>
        ` : ``}
      </div>
    `
  });
}

/* ========= Raggruppa i samples per (coordinate ~) + precise_taxon =========
   -> torniamo un array di "group objects":
   {
      lon, lat,
      precise,            // string (precise_taxon)
      samples: [Feature,...],
      affAvg,             // media arrotondata affidabilità
      count,              // n campioni nel gruppo
      ctxIds: Set<number>,
      stypes: Set<string>,
      reprProps: props del primo sample
   }
*/
function groupSamplesByCoordAndTaxon(features, decimals = 6) {
  const groups = new Map();

  for (const f of (features || [])) {
    const p = f?.properties || {};
    const g = f?.geometry || {};

    // coordinate (Point o primo punto di MultiPoint)
    let coord = null;
    if (g.type === 'Point') {
      coord = g.coordinates;
    } else if (g.type === 'MultiPoint' && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
      coord = g.coordinates[0];
    }
    if (!coord || coord.length < 2) continue;

    const lon = Number(coord[0]).toFixed(decimals);
    const lat = Number(coord[1]).toFixed(decimals);

    const precise = (p.precise_taxon || '(no taxon)').trim();
    const key = `${lon},${lat}|${precise.toLowerCase()}`;

    if (!groups.has(key)) {
      groups.set(key, {
        lon: Number(lon),
        lat: Number(lat),
        precise,
        samples: [],
        affSum: 0,
        affN: 0,
        ctxIds: new Set(),
        stypes: new Set(),
        reprProps: p
      });
    }

    const gobj = groups.get(key);
    gobj.samples.push(f);

    const aff = affIndex(p.precision); // NULL -> 4 già gestito
    gobj.affSum += aff;
    gobj.affN   += 1;

    const ctxId = Number(p.context_id ?? p.contesti_id);
    if (Number.isFinite(ctxId)) gobj.ctxIds.add(ctxId);

    const st = String(p.s_type || '').trim().toLowerCase();
    if (st) gobj.stypes.add(st);
  }

  return [...groups.values()].map(g => ({
    ...g,
    count: g.samples.length,
    affAvg: Math.round(g.affSum / Math.max(1, g.affN))
  }));
}

/* ========= HTML dettaglio SINGOLO sample (riusato nel "dettaglio") ========= */
function buildSampleDetailHTML(props) {
  const precise     = (props.precise_taxon || "").trim();
  const family      = (props.family || props.Family || "").trim();
  const stype       = props.s_type || "-";
  const spart       = props.s_part || "-";
  const sfoss       = props.s_foss || "-";
  const note        = props.note || props.s_notes || "";
  const bibl        = props.bibliography || "";
  const contextId   = props.context_id;
  const precision   = (props.precision != null ? String(props.precision) : '4');
  const entity      = (props.entity != null && props.entity !== '') ? String(props.entity) : null;
  const qtRaw       = (props.qt != null && props.qt !== '' && Number.isFinite(Number(props.qt))) ? Number(props.qt) : null;
  const publishedAs = (props.species_orig_pub || "").trim();
  const idSample    = props.fid;

  // iconcina di testa = image_2 dal mapping del taxon, fallback logo
  const icon2Rel     = getTaxonIconFromGlobal(precise) || null;
  const headerIcon   = icon2Rel ? getPath(`images/objects/${icon2Rel}`) : PROJECT_LOGO;
  const fallbackIcon = PROJECT_LOGO;

  // "cf" a che livello?
  function computeCfTag(pp) {
    const cg = !!pp.cf_genus, cs = !!pp.cf_sp, csub = !!pp.cf_subsp;
    if (cg)   return 'genus';
    if (cs)   return 'species';
    if (csub) return 'subspecies';
    return null;
  }
  const cfTag = computeCfTag(props);

  // quantità/entità normalizzata
  let quantityValue = "not reported";
  if (qtRaw != null && Number.isFinite(qtRaw)) quantityValue = String(qtRaw);
  else if (entity) quantityValue = entity;

  return `
    <div class="obj-header">
      <img class="obj-header-icon" src="${headerIcon}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${fallbackIcon}';">

      <div class="obj-header-title">
        <div class="obj-header-precise">
          <strong>${smartItalics(precise || "-")}</strong>
        </div>
        ${family ? `
          <div class="obj-header-family"><em>${escapeHtml(family)}</em></div>
        ` : ''}
      </div>

      <div class="obj-header-id">
        <div class="obj-header-id-label">Arborea_ID</div>
        <div class="obj-header-id-val">${escapeHtml(String(idSample ?? '-'))}</div>
      </div>
    </div>

    <div class="obj-body">
      <div class="obj-col obj-col-left">

        ${publishedAs ? `
          <div class="popup-info-item">
            <div class="popup-info-label">PUBLISHED AS</div>
            <div class="popup-info-value">${smartItalics(publishedAs)}</div>
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
          <div class="popup-info-label">PLACEMENT ACCURACY</div>
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

          <a class="obj-link"
             href="../record_object/record_object.html?fid=${idSample}"
             target="_blank" rel="noopener">
            <i class="popup-link-icon">↗</i> View full record
          </a>
        </div>
      </div>
    </div>
  `;
}

// Interpola linearmente due colori RGB [r,g,b] → restituisce "rgb(r,g,b)"
function lerpColorRGB(rgbA, rgbB, t) {
  const r = Math.round(rgbA[0] + (rgbB[0] - rgbA[0]) * t);
  const g = Math.round(rgbA[1] + (rgbB[1] - rgbA[1]) * t);
  const b = Math.round(rgbA[2] + (rgbB[2] - rgbA[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/* ========= Popup per il GRUPPO di campioni =========
   - Mostra intestazione col taxon
   - Mostra "chip" cliccabili per ciascun sample (context + tipologia)
   - Clic su chip → vista dettaglio singolo sample (+ pulsante Back)
*/
function buildGroupPopupNode(group) {
  const precise    = (group.reprProps?.precise_taxon || group.precise || '').trim();
  const family     = (group.reprProps?.family || group.reprProps?.Family || '').trim();
  const icon2Rel   = getTaxonIconFromGlobal(precise);
  const headerIcon = icon2Rel ? getPath(`images/objects/${icon2Rel}`) : PROJECT_LOGO;
  const fidBadge   = (group.reprProps?.fid != null) ? String(group.reprProps.fid) : '-';

  const wrap = document.createElement('div');
  wrap.className = 'popup-wrapper object';

  // === prepariamo le chip col gradiente ===
  // Colore di partenza (verde molto chiaro) e colore finale (più saturo)
  // start = #ecfdf5  → rgb(236,253,245)
  // end   = #d1fae5  → rgb(209,250,229)
  const startRGB = [236, 253, 245];
  const endRGB   = [209, 250, 229];

  const samplesArr = group.samples || [];
  const n = samplesArr.length;

  const chipsHTML = samplesArr.map((s, idx) => {
    const p = s.properties || {};

    // posizione normalizzata 0..1
    const t = (n <= 1) ? 0 : (idx / (n - 1));

    // calcolo colore di sfondo
    const bgColor = lerpColorRGB(startRGB, endRGB, t);

    // bordo rimane il verde "forte" fisso
    const borderColor = '#43a047';

    const ctxName = p.context_detail || p.context_name ||
                    `Context #${p.context_id ?? p.contesti_id ?? '-'}`;
    const typ = p.tipologia || p.typology || p.s_type || '-';

    return `
      <button class="obj-chip"
              data-sample-id="${escapeHtml(String(p.fid))}"
              style="--chip-bg:${bgColor}; --chip-border:${borderColor};">
        <span class="obj-chip-title">${escapeHtml(ctxName)}</span>
        <span class="obj-chip-sub">${escapeHtml(typ)}</span>
      </button>
    `;
  }).join('');

  const listHTML = `
    <div class="obj-header">
      <img class="obj-header-icon" src="${headerIcon}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${PROJECT_LOGO}';">

      <div class="obj-header-title">
        <div class="obj-header-precise">
          <strong>${smartItalics(precise || "-")}</strong>
        </div>
        ${family ? `<div class="obj-header-family"><em>${escapeHtml(family)}</em></div>` : ''}
      </div>

      <div class="obj-header-id">
        <div class="obj-header-id-label">Arborea_ID</div>
        <div class="obj-header-id-val">${escapeHtml(fidBadge)}</div>
      </div>
    </div>

    <div class="obj-chips">
      ${chipsHTML}
    </div>
  `;

  const detailHTMLIntro = `
    <div class="obj-back"><button type="button" class="obj-back-btn">← Back</button></div>
    <div class="obj-detail"></div>
  `;

  const listBox   = document.createElement('div');
  listBox.className = 'obj-list';
  listBox.innerHTML = listHTML;

  const detailBox = document.createElement('div');
  detailBox.className  = 'obj-detail-wrap';
  detailBox.style.display = 'none';
  detailBox.innerHTML  = detailHTMLIntro;

  wrap.appendChild(listBox);
  wrap.appendChild(detailBox);

  // Interazioni dentro al popup
  wrap.addEventListener('click', (e) => {
    const chip = e.target.closest('.obj-chip');
    if (chip) {
      e.preventDefault();
      const fid = chip.getAttribute('data-sample-id');
      const s = group.samples.find(x => String(x?.properties?.fid) === fid);
      if (!s) return;
      listBox.style.display = 'none';
      detailBox.style.display = 'block';
      const inner = detailBox.querySelector('.obj-detail');
      inner.innerHTML = buildSampleDetailHTML(s.properties || {});
      return;
    }
    const back = e.target.closest('.obj-back-btn');
    if (back) {
      e.preventDefault();
      detailBox.style.display = 'none';
      listBox.style.display = 'block';
    }
  });

  return wrap;
}

/**
 * Manager dei SAMPLES con prestazioni ottimizzate:
 *  - (aggiornato) Raggruppa i campioni per coordinate ~ e precise_taxon
 *    e crea UN marker per gruppo, con badge numerico.
 *  - Crea bucket affidabilità (0..4), ciascuno con clusterGroup ecc.
 *  - Applica filtri senza ricostruire tutti i marker.
 *  - applyRange / applyCategorySet / applyContextIdSet / applySType
 */
export function addObjectsLayer(map, samplesFeatures) {
  const size = 44;

  /* === Panes dedicati === */
  const objectsPane = map.getPane('objectsPane') || map.createPane('objectsPane');
  objectsPane.style.zIndex = 370;
  objectsPane.style.pointerEvents = 'auto';

  const basePane  = map.getPane('basePointsPane') || map.createPane('basePointsPane');
  basePane.style.zIndex = 350;
  basePane.style.pointerEvents = 'none';

  const linesPane = map.getPane('linesPane') || map.createPane('linesPane');
  linesPane.style.zIndex = 360;
  linesPane.style.pointerEvents = 'none';

  // Canvas renderer per punti e linee
  const baseRenderer  = L.canvas({ pane: 'basePointsPane' });
  const linesRenderer = L.canvas({ pane: 'linesPane' });

  /* === Bucket 0..4 (NULL trattati come 4) === */
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

    // cluster icon = media affidabilità dei figli
    cluster.options.iconCreateFunction = (cl) => {
      const markers = cl.getAllChildMarkers();
      const vals = markers.map(m => affIndex(m.options?.__aff));
      const avg = vals.length
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : 4;
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

  /* === Indici filtraggio rapido ===
     handle = {
        marker, basePoint, bucketIdx,
        precise: string,
        ctxIdSet: Set<number>,
        stypeSet: Set<string>,
        _lineToCluster?
     }
  */
  const indexByTaxon  = new Map();                    // precise_taxon -> [handle,...]
  const indexByBucket = Array.from({ length: NUM_BUCKETS }, () => []); // bucketIdx -> [handle,...]

  // Stato filtri
  let allowedTaxaSet = null;           // Set<string> o null | Set() vuoto => mostra niente
  let allowedContextIdSet = null;      // Set<number> o null
  let allowedSType = null;             // null = tutti | 'wood' | 'carpological'
  let currentMin = 0, currentMax = 4;  // range affidabilità
  let visible = true;

  // Helpers mount/unmount rapidi per un handle
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

  /* === COSTRUZIONE MARKER DAI GRUPPI === */
  let totalAdded = 0;
  const groups = groupSamplesByCoordAndTaxon(samplesFeatures);

  groups.forEach((g) => {
    const latlng = L.latLng(g.lat, g.lon);

    // aff medio arrotondato
    const aff = clamp(g.affAvg, 0, 4);
    const bucketIdx = aff;
    const B = BUCKETS[bucketIdx];
    if (!B) return;

    const stroke = affColor(aff);
    const fill   = hexToRgba(stroke, 0.15);

    // puntino base (cerchietto non interattivo sotto)
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

    // icona circolare con badge numerico
    const imgAbsPath = chooseImagePath(g.reprProps);
    const icon       = makeIconWithBadge(imgAbsPath, size, aff, g.count);

    // marker vero e proprio
    const marker = L.marker(latlng, {
      icon,
      title: g.precise || "sample",
      __aff: aff,
      pane: 'objectsPane',
      updateWhenDragging: false,
      updateWhenZooming: false
    });

    // linea tratteggiata cluster ↔ marker (solo se è raggruppato)
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
        cluster.on('move', () => {
          line.setLatLngs([cluster.getLatLng(), latlng]);
        });
      }
    });

    marker.on('remove', () => {
      const h = marker._lineToCluster;
      if (h) {
        B.lineLayerGroup.removeLayer(h);
        marker._lineToCluster = null;
      }
    });

    // POPUP “smistamento” per questo gruppo
    const node = buildGroupPopupNode(g);
    marker.bindPopup(node, {
      className: `leaflet-popup-object ${precisionClassName(aff)}`,
      maxWidth: 600,
      minWidth: 360
    });

    // tooltip veloce
    marker.bindTooltip(g.precise || "sample", {
      direction: 'top',
      offset: [0, -10],
      opacity: 0.9
    });

    // Handle per filtri
    const handle = {
      marker,
      basePoint,
      bucketIdx,
      precise: (g.precise || '').trim(),
      ctxIdSet: g.ctxIds,     // Set<number>
      stypeSet: g.stypes      // Set<string> (es. 'wood','carpological')
    };

    indexByBucket[bucketIdx].push(handle);

    if (!indexByTaxon.has(handle.precise)) {
      indexByTaxon.set(handle.precise, []);
    }
    indexByTaxon.get(handle.precise).push(handle);

    // monta subito (range iniziale completo)
    addHandleToMap(handle);
    totalAdded++;
  });

  /* === Monta/smonta bucket interi === */
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

  /* === Predicati filtri === */

  const handleInRange = (h) => (h.bucketIdx >= currentMin && h.bucketIdx <= currentMax);

  const handlePassesCategory = (h) => {
    // allowedTaxaSet:
    //   - null        => nessun filtro per taxa (tutto ok)
    //   - Set() vuoto => mostra niente
    //   - Set([...])  => solo quei taxa
    if (allowedTaxaSet === null) return true;
    if (allowedTaxaSet.size === 0) return false;
    return allowedTaxaSet.has(h.precise);
  };

  const handlePassesContext = (h) => {
    // allowedContextIdSet:
    //  null o size 0 => no filtro context
    if (!allowedContextIdSet || allowedContextIdSet.size === 0) return true;
    for (const id of (h.ctxIdSet || [])) {
      if (allowedContextIdSet.has(id)) return true;
    }
    return false;
  };

  const handlePassesSType = (h) => {
    // allowedSType: null => tutti
    if (!allowedSType) return true;
    for (const st of (h.stypeSet || [])) {
      if (st === allowedSType) return true;
    }
    return false;
  };

  const handleShouldBeOnMap = (h) => (
    handleInRange(h) &&
    handlePassesCategory(h) &&
    handlePassesContext(h) &&
    handlePassesSType(h)
  );

  /* === Filtri dinamici === */

  // Applica categoria (Set di precise_taxon ammessi)
  function applyCategorySet(setOrNull) {
    // null -> nessun filtro; Set() vuoto -> mostra niente; Set([...]) -> solo quei taxa
    allowedTaxaSet = (setOrNull instanceof Set) ? setOrNull : null;

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

  // Filtro per CONTEXT ID set (join tipologia/cronologia fatta a monte)
  function applyContextIdSet(setOrNull) {
    allowedContextIdSet = (setOrNull instanceof Set && setOrNull.size)
      ? setOrNull
      : null;

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

  // Applica range affidabilità (0..4). I NULL già mappati a 4.
  function applyRange(min, max) {
    currentMin = clamp(min, 0, 4);
    currentMax = clamp(max, 0, 4);
    if (!visible) return;

    for (let i = 0; i < NUM_BUCKETS; i++) {
      const inRange = (i >= currentMin && i <= currentMax);
      if (inRange) {
        mountBucket(i);
        // se abbiamo filtri già attivi, assicuriamoci che nel bucket restino solo quelli che passano
        if (allowedTaxaSet !== null || allowedContextIdSet || allowedSType) {
          indexByBucket[i].forEach(h => {
            if (!handlePassesCategory(h) || !handlePassesContext(h) || !handlePassesSType(h)) {
              removeHandleFromMap(h);
            }
          });
        }
      } else {
        unmountBucket(i);
      }
    }
  }

  // Mostra/Nascondi layer (toggle globale “oggetti”)
  function setVisible(v) {
    visible = !!v;
    const disp = visible ? '' : 'none';

    objectsPane.style.display = disp;
    basePane.style.display    = disp;
    linesPane.style.display   = disp;

    // fallback di sicurezza (nasconde anche eventuali cluster DOM)
    const container = map.getContainer();
    container.classList.toggle('objects-hidden', !visible);
  }

  // Distruggi tutto pulito
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

  // Monta iniziale TUTTI i bucket
  for (let i = 0; i < NUM_BUCKETS; i++) {
    mountBucket(i);
  }

  console.log(`[SamplesLayerBuckets] grouped markers created: ${totalAdded}`);

  // API pubblica usata da map_viewer.js
  return {
    type: 'samplesBuckets',
    applyRange,
    applyContextIdSet,
    setVisible,
    destroy,
    applyCategorySet,
    applySType,
    _dbg: { indexByTaxon, indexByBucket }
  };
}

/* Delegato globale per link "View the whole context" dentro ai popup */
document.addEventListener("DOMContentLoaded", () => {
  document.body.addEventListener("click", (e) => {
    const a = e.target.closest('a[data-open-context]');
    if (!a) return;
    e.preventDefault();
    const ctxId = Number(a.getAttribute('data-open-context'));
    if (Number.isFinite(ctxId) && window.__openContextPopup) {
      window.__openContextPopup(ctxId);
    }
  });
});
