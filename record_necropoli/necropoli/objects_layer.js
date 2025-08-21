import { getPath } from '../../path_utils.js';

/* ==== Scala colori affidabilità: 0 blu → 4 rosso ==== */
const AFF_COLORS = ['#60a5fa', '#22c55e', '#facc15', '#f59e0b', '#ef4444'];

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function affIndex(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return clamp(Math.round(n), 0, 4);
}
function affColor(v) {
  const idx = affIndex(v);
  return idx == null ? '#9ca3af' /* gray */ : AFF_COLORS[idx];
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

function makeIcon(imgFile, size, aff) {
  const imageUrl = getPath("images/objects/" + (imgFile || 'other.png'));
  const stroke = affColor(aff);
  return L.divIcon({
    className: "object-icon",
    iconSize: [size, size],
    html: `<div style="
      width:${size}px; height:${size}px; border-radius:50%;
      overflow:hidden; border:2px solid ${stroke};
      box-shadow:0 0 4px rgba(0,0,0,0.3);
      background:url('${imageUrl}') center/cover;">
    </div>`
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s])
  );
}

/**
 * Crea un manager "bucketizzato" per l'insieme corrente di oggetti.
 * - NON filtra per affidabilità: costruisce 6 bucket (0..4, unknown) una sola volta.
 * - Espone metodi per mostrare/nascondere i bucket compatibili con un range.
 */
export function addObjectsLayer(map, oggettiFeatures) {
  const size = 40;

  /* === Panes dedicati (sotto i marker; niente click) === */
  const basePane  = map.getPane('basePointsPane') || map.createPane('basePointsPane');
  basePane.style.zIndex = 350;
  basePane.style.pointerEvents = 'none';
  const linesPane = map.getPane('linesPane') || map.createPane('linesPane');
  linesPane.style.zIndex = 360;
  linesPane.style.pointerEvents = 'none';

  // costruiamo 6 bucket: 0..4 e "unknown" (indice 5)
  const BUCKETS = new Array(6).fill(null).map(() => ({
    clusterGroup: null,
    basePointsGroup: null,
    lineLayerGroup: null,
    count: 0
  }));

  // factory cluster per singolo bucket
  function makeClusterForBucket(bucketIdx) {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 20,
      showCoverageOnHover: false,
      iconCreateFunction(cluster) {
        // colore cluster: media degli __aff nei marker
        const markers = cluster.getAllChildMarkers();
        const vals = markers.map(m => Number(m.options.__aff)).filter(Number.isFinite);
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const stroke = affColor(avg);
        const fill = hexToRgba(stroke, 0.25);
        return L.divIcon({
          html: `
            <div style="
              width:36px;height:36px;line-height:36px;border-radius:50%;
              background:${fill}; border:2px solid ${stroke};
              text-align:center;font-weight:bold;">
              ${cluster.getChildCount()}
            </div>`,
          className: 'cluster-icon',
          iconSize: [36, 36]
        });
      }
    });
    cluster.on('clusterclick', (e) => e.layer.spiderfy());
    return cluster;
  }

  // crea gruppi per ogni bucket
  for (let i = 0; i < BUCKETS.length; i++) {
    BUCKETS[i].clusterGroup   = makeClusterForBucket(i);
    BUCKETS[i].basePointsGroup = L.layerGroup([], { pane: 'basePointsPane' });
    BUCKETS[i].lineLayerGroup  = L.layerGroup([], { pane: 'linesPane' });
  }

  // costruzione UNA VOLTA dei marker dentro ai bucket
  let totalAdded = 0;
  oggettiFeatures.forEach((f) => {
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
    const aff = props.affidabilita;
    const idx = affIndex(aff);
    const bucketIdx = (idx == null ? 5 : idx); // 0..4, oppure 5=unknown
    const B = BUCKETS[bucketIdx];
    if (!B) return;

    const stroke = affColor(aff);
    const fill = hexToRgba(stroke, 0.15);

    // puntino base
    L.circleMarker(latlng, {
      pane: 'basePointsPane',
      radius: 3,
      color: stroke,
      fillColor: fill,
      fillOpacity: 1,
      weight: 1,
      interactive: false,
      bubblingMouseEvents: false
    }).addTo(B.basePointsGroup);

    // icona / marker
    const foto = (props.foto_prova || 'other.png').trim();
    const icon = makeIcon(foto, size, aff);

    const marker = L.marker(latlng, {
      icon,
      title: props.oggetto_corredo || "oggetto",
      __aff: Number(aff)
    });

    const sigla = props.sigla || "";
    const desc = props.original_description || "";
    const funzione = props.funzione || "-";
    const materiale = props.materiale || "-";
    const materialeSpec = props.materiale_specifico ? ` (${props.materiale_specifico})` : "";
    const imageFile = getPath("images/objects/" + foto);
    const idOggetto = props.fid;

    const popupContent = `
      <div class="popup-wrapper object">
        <div class="popup-image-info">
          <div class="popup-sigla">${escapeHtml(sigla)}</div>
          <div class="popup-image-container">
            <img src="${imageFile}" alt="foto oggetto" class="popup-image" />
            ${desc ? `
              <div class="popup-image-description">
                <div class="popup-info-label">ORIGINAL DESCRIPTION</div>
                <div class="popup-info-value">${escapeHtml(desc)}</div>
              </div>` : ''}
          </div>
          <div class="popup-info-container collapsed">
            <div class="popup-info-item">
              <div class="popup-info-label">OBJECT</div>
              <div class="popup-info-main-value">${escapeHtml(props.strumento || "-")}</div>
              ${funzione ? `<div class="popup-info-function">${escapeHtml(funzione)}</div>` : ''}
            </div>
            <div class="popup-info-item">
              <div class="popup-info-label">MATERIAL</div>
              <div class="popup-info-value">${escapeHtml(materiale)}${escapeHtml(materialeSpec)}</div>
            </div>
          </div>
        </div>
        <div class="popup-controls">
          <button class="popup-toggle-btn">View basic data</button>
        </div>
        <div class="popup-link">
          <a href="../record_object/record_object.html?fid=${idOggetto}" target="_blank">
            <i class="popup-link-icon">↗</i> View full record
          </a>
        </div>
      </div>
    `;

    // bordo popup con classi precision-*
    const affCls = (idx == null) ? 'precision-unknown' : `precision-${idx}`;
    marker.bindPopup(popupContent, {
      className: `leaflet-popup-object leaflet-popup-content-wrapper-object ${affCls}`
    });

    // tooltip
    marker.bindTooltip(props.strumento || "oggetto", {
      direction: 'top',
      offset: [0, -10],
      opacity: 0.9
    });

    // linea cluster→marker (creata quando il cluster entra in mappa)
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
          bubblingMouseEvents: false
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

    B.clusterGroup.addLayer(marker);
    B.count++;
    totalAdded++;
  });

  // stato visibilità corrente
  let currentMin = 0, currentMax = 4;
  let visible = true;

  function indicesForRange(min, max) {
    const allow = new Set();
    for (let i = 0; i <= 4; i++) {
      if (i >= min && i <= max) allow.add(i);
    }
    // gli "unknown" (bucket 5) li mostriamo SOLO se tutto è selezionato (0..4)
    if (min <= 0 && max >= 4) allow.add(5);
    return allow;
  }

  // gruppi attualmente montati in mappa
  let mounted = new Set();

  function mountBucket(i) {
    if (mounted.has(i)) return;
    const B = BUCKETS[i];
    if (!B) return;
    // aggiungi i tre gruppi in mappa
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

  function applyRange(min, max) {
    currentMin = min; currentMax = max;
    const allowed = indicesForRange(min, max);
    // mostra solo se il manager è "visibile"
    if (visible) {
      // mount nuovi
      allowed.forEach(i => mountBucket(i));
    }
    // smonta quelli non più ammessi, anche se invisible→true o false
    [...mounted].forEach(i => {
      if (!allowed.has(i) || !visible) unmountBucket(i);
    });
  }

  function setVisible(v) {
    visible = !!v;
    if (visible) {
      applyRange(currentMin, currentMax); // monta i bucket ammessi
    } else {
      // smonta tutto rapidamente
      [...mounted].forEach(i => unmountBucket(i));
    }
  }

  function destroy() {
    // smonta e pulisci tutti i bucket
    [...Array(6).keys()].forEach(i => {
      const B = BUCKETS[i];
      if (!B) return;
      try { map.removeLayer(B.clusterGroup); } catch {}
      try { map.removeLayer(B.basePointsGroup); } catch {}
      try { map.removeLayer(B.lineLayerGroup); } catch {}
      try { B.basePointsGroup.clearLayers(); } catch {}
      try { B.lineLayerGroup.clearLayers(); } catch {}
      try { B.clusterGroup.clearLayers(); } catch {}
    });
    mounted.clear();
  }

  console.log(`[ObjectsLayerBuckets] markers costruiti una volta: ${totalAdded}`);

  // API del manager
  return {
    type: 'objectsBuckets',
    applyRange,     // (min,max) → mostra/nasconde bucket senza ricostruire marker
    setVisible,     // true/false
    destroy,        // cleanup totale
    _dbg: { BUCKETS }
  };
}

// Delegato globale per il toggle "View basic data"
document.addEventListener("DOMContentLoaded", () => {
  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("popup-toggle-btn")) {
      const wrapper = e.target.closest(".popup-wrapper");
      const info = wrapper?.querySelector(".popup-info-container");
      if (!wrapper || !info) return;

      const collapsed = info.classList.contains("collapsed");
      if (collapsed) {
        info.classList.remove("collapsed");
        wrapper.classList.add("show-info");
        e.target.textContent = "Hide basic data";
      } else {
        info.classList.add("collapsed");
        wrapper.classList.remove("show-info");
        e.target.textContent = "View basic data";
      }
    }
  });
});
