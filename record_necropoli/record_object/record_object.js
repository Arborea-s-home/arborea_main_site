import { getPath } from "../../path_utils.js";
import {
  updateWeights,
  resetWeights,
  getCurrentConfig,
  calcolaBreakdown,
  calcolaAffinitaOggettiSingolo
} from "./object_affinity.js";
import { showObjectRadarPopup, renderObjectRadarChart } from "./object_radar.js";

// ----------- DEBUG HELPER -----------
function dbg(...args) { console.log("[record_object]", ...args); }

// Attendi che Leaflet sia disponibile
function waitForLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) {
      dbg("Leaflet trovato subito");
      return resolve();
    }
    dbg("In attesa di Leaflet...");
    const chk = setInterval(() => {
      if (window.L) {
        clearInterval(chk);
        dbg("Leaflet pronto");
        resolve();
      }
    }, 20);
    setTimeout(() => {
      if (!window.L) {
        clearInterval(chk);
        reject(new Error("Leaflet non disponibile entro il timeout"));
      }
    }, 5000);
  });
}

const params = new URLSearchParams(window.location.search);
const fid = params.get("fid");
dbg("FID richiesto =", fid);

// Percorsi dataset
const samplesPath   = getPath("data/samples.geojson");
const contextsPath  = getPath("data/contesti.geojson");
const sitesPath     = getPath("data/siti.geojson");
// Province per heatmap
const provincesPath = getPath("data/provinces.geojson");
// Nuovo: CSV dei taxa
const taxaCsvPath   = getPath("data/legenda_taxa.csv");

dbg("Paths:", { samplesPath, contextsPath, sitesPath, provincesPath, taxaCsvPath });

// DOM (esistenti)
const $title         = document.getElementById("taxon-title");
const $sub           = document.getElementById("sample-subtitle");
const $fields        = document.getElementById("sample-fields");
const $contextFields = document.getElementById("context-fields");
const $siteFields    = document.getElementById("site-fields");
const $siteLinks     = document.getElementById("site-links");

const $similarList   = document.getElementById("similar-objects");
const $btnMore       = document.getElementById("show-more-btn");
const $btnList       = document.getElementById("view-list");
const $btnProv       = document.getElementById("view-provinces");
const $provMapEl     = document.getElementById("province-map");
const $provLegend    = document.getElementById("province-legend");

// DOM Taxon detail (nuovi)
const $tdBox     = document.getElementById("taxon-detail-box");
const $tdNomi    = document.getElementById("td-nomi");
const $tdUsi     = document.getElementById("td-usi");
const $tdImage   = document.getElementById("td-image");
const $logoActa  = document.getElementById("logo-acta");
const $logoFlori = document.getElementById("logo-floritaly");
const $swActa    = document.getElementById("sw-acta");
const $swFlori   = document.getElementById("sw-floritaly");
const $tdOpen    = document.getElementById("td-open");
const $tdIframe  = document.getElementById("td-iframe");
const $tdIframeNote = document.getElementById("td-iframe-note");

// Stato
let enrichedSamples = [];
let baseSample = null;
let allSimilar = [];
let displayedSimilar = 10;

let provincesGeoJSON = null;
let provincesMap = null;
let provincesLayer = null;

// === Nuovo: stato modalità aggregazione heatmap ===
// "average" (default) | "sum"
let provinceAggregationMode = "average";

// Stato Taxon detail
let taxaRows = []; // rows CSV come array di oggetti
let taxaRowForSample = null; // riga matchata per questo sample
let currentSource = "acta"; // "acta" | "floritaly"

// ---------- Helpers UI & Data ----------

function val(v) {
  return v === null || v === undefined ? "" : String(v);
}
function cleanHtml(textOrHtml) {
  if (!textOrHtml) return "";
  return String(textOrHtml).replace(/<[^>]*>/g, "").trim();
}
function makeField(label, value) {
  const str = value === null || value === undefined ? "" : String(value).trim();
  if (!str) return null;
  const div = document.createElement("div");
  div.className = "field";
  const lab = document.createElement("span");
  lab.className = "label";
  lab.textContent = `${label}:`;
  div.appendChild(lab);
  div.append(` ${str}`);
  return div;
}
function makeFieldWithNode(label, node) {
  if (!node) return null;
  const div = document.createElement("div");
  div.className = "field";
  const lab = document.createElement("span");
  lab.className = "label";
  lab.textContent = `${label}:`;
  div.appendChild(lab);
  div.appendChild(node);
  return div;
}
function toAbsoluteUrl(url) {
  if (!url) return "";
  const s = String(url).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`;
  return s;
}

// Wiki links
function wikipediaUrl(tag) {
  if (!tag) return "";
  const s = String(tag).trim();
  if (!s) return "";
  if (s.includes(":")) {
    const idx = s.indexOf(":");
    const lang = s.slice(0, idx).trim();
    const title = s.slice(idx + 1).trim().replace(/ /g, "_");
    return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  }
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(s.replace(/ /g, "_"))}`;
}
function commonsUrl(v) {
  if (!v) return "";
  const title = String(v).trim().replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`;
}
function wikidataUrl(id) {
  if (!id) return "";
  const clean = String(id).trim().toUpperCase();
  return /^Q\d+$/.test(clean) ? `https://www.wikidata.org/wiki/${clean}` : "";
}
function osmSearchUrl(name) {
  if (!name) return "";
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(String(name).trim())}`;
}
function makeCustomLinkButton(label, computedUrl) {
  const url = computedUrl ? String(computedUrl).trim() : "";
  if (url) {
    const a = document.createElement("a");
    a.className = "link-btn success";
    a.target = "_blank";
    a.rel = "noopener";
    a.href = url;
    a.textContent = label;
    return a;
  } else {
    const btn = document.createElement("button");
    btn.className = "link-btn danger";
    btn.disabled = true;
    btn.textContent = label;
    return btn;
  }
}
function formatChronology(chron_orig, chronology_iccd, parent_iccd) {
  const left = [chron_orig, chronology_iccd].map(x => (x || "").trim()).filter(Boolean).join(" - ");
  return parent_iccd && String(parent_iccd).trim()
    ? `${left} (${String(parent_iccd).trim()})`
    : left;
}

/* -------------------- CSV PARSER (tollerante) -------------------- */

function parseCSV(text) {
  const rows = [];
  let i = 0, cur = "", inQuotes = false;
  const out = [];
  function pushCell() { out.push(cur); cur = ""; }
  function pushRow() { rows.push(out.slice()); out.length = 0; }

  for (; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { pushCell(); }
      else if (ch === "\n") { pushCell(); pushRow(); }
      else if (ch === "\r") { /* ignore */ }
      else { cur += ch; }
    }
  }
  // flush last
  pushCell();
  if (out.length > 1 || (out.length === 1 && out[0] !== "")) pushRow();

  if (!rows.length) return [];

  const header = rows[0].map(h => String(h).trim());
  const data = rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ""; });
    return obj;
  });
  return data;
}

function splitUsiSmart(s) {
  if (!s) return [];
  let parts = String(s).split(";").map(x => x.trim()).filter(Boolean);
  if (parts.length <= 1) {
    // tenta split su parole chiave ricorrenti
    const tmp = String(s)
      .replace(/(Entità\s+[^E]|Uso\s+[^U])/g, "|$1") // simple segmentation helper
      .split("|").map(x => x.trim()).filter(Boolean);
    if (tmp.length > parts.length) parts = tmp;
  }
  return parts;
}

/* -------------------- GEOJSON SANITIZER -------------------- */

function inRangeLatLng(lng, lat) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
         lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function sanitizeRing(ring) {
  if (!Array.isArray(ring)) return [];
  const out = ring
    .filter(pt => Array.isArray(pt) && pt.length >= 2 && inRangeLatLng(pt[0], pt[1]));
  return out.length >= 4 ? out : [];
}

function sanitizePolygonCoords(coords) {
  if (!Array.isArray(coords)) return [];
  const rings = coords.map(sanitizeRing).filter(r => r.length >= 4);
  return rings.length ? rings : [];
}

function sanitizeMultiPolygonCoords(coords) {
  if (!Array.isArray(coords)) return [];
  const polys = coords
    .map(poly => sanitizePolygonCoords(poly))
    .filter(rings => rings.length > 0);
  return polys.length ? polys : [];
}

function sanitizeGeometry(geom) {
  if (!geom || !geom.type || !geom.coordinates) return null;
  if (geom.type === "Polygon") {
    const rings = sanitizePolygonCoords(geom.coordinates);
    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geom.type === "MultiPolygon") {
    const polys = sanitizeMultiPolygonCoords(geom.coordinates);
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  if (geom.type === "Point") {
    const [lng, lat] = geom.coordinates || [];
    return inRangeLatLng(lng, lat) ? geom : null;
  }
  return null;
}

function sanitizeFeature(feature) {
  if (!feature || !feature.geometry) return null;
  const g = sanitizeGeometry(feature.geometry);
  if (!g) return null;
  return { type: "Feature", properties: feature.properties || {}, geometry: g };
}

function safeAddGeoJSON(feature, style) {
  try {
    const sanitized = sanitizeFeature(feature);
    if (!sanitized) {
      dbg("safeAddGeoJSON: feature scartata (non valida):", feature);
      return null;
    }
    
    // Aggiungi questo controllo per geometrie molto piccole
    const coords = sanitized.geometry.coordinates;
    if (sanitized.geometry.type === "Polygon" && coords.length > 0) {
      const firstRing = coords[0];
      if (firstRing.length >= 4) {
        // Calcola l'area approssimativa del poligono
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        
        for (const [lng, lat] of firstRing) {
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        }
        
        const area = (maxLng - minLng) * (maxLat - minLat);
        if (area < 1e-10) { // Area molto piccola
          dbg("Geometria molto piccola rilevata, applicando workaround");
          // Crea un cerchio invece di un poligono per evitare il bug di Leaflet
          const centerLng = (minLng + maxLng) / 2;
          const centerLat = (minLat + maxLat) / 2;
          const radius = Math.sqrt(area) * 50000; // Scala il raggio
          
          return L.circle([centerLat, centerLng], {
            radius: Math.max(radius, 10), // Minimo 10 metri
            ...style
          });
        }
      }
    }
    
    const layer = L.geoJSON(sanitized, style ? { style } : undefined);
    return layer;
  } catch (e) {
    console.error("safeAddGeoJSON error:", e, feature);
    return null;
  }
}

/* -------------------- MINI MAP -------------------- */

async function initMiniMap(sampleFeature, contextFeature, siteFeature) {
  dbg("initMiniMap: start");
  await waitForLeaflet();

  const mapContainer = document.getElementById("mini-map");
  if (mapContainer) {
    mapContainer.style.display = "block";
  }

  requestAnimationFrame(() => {
    dbg("initMiniMap: creating map on #mini-map");
    const map = L.map("mini-map", { 
      zoomControl: false, 
      attributionControl: true,
      // Aggiungi queste opzioni per migliorare la stabilità
      preferCanvas: true,
      zoomSnap: 0.1
    });

    try {
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 12,
        attribution: '&copy; OSM &copy; CARTO'
      }).addTo(map);
      dbg("initMiniMap: tile layer added (CartoDB)");
    } catch (e) {
      console.error("initMiniMap: errore aggiunta tile layer", e);
    }

    // DEBUG DETTAGLIATO
    dbg("Dettagli geometrie:", {
      site: siteFeature?.geometry?.type,
      siteCoords: siteFeature?.geometry?.coordinates?.[0]?.slice(0, 3),
      context: contextFeature?.geometry?.type,
      contextCoords: contextFeature?.geometry?.coordinates?.[0]?.slice(0, 3),
      sample: sampleFeature?.geometry?.type,
      sampleCoords: sampleFeature?.geometry?.coordinates
    });

    let centerPoint = null;
    let zoomLevel = 13;

    // Aggiungi prima il punto del sample (più semplice)
    if (sampleFeature?.geometry?.type === "Point") {
      const [lng, lat] = sampleFeature.geometry.coordinates;
      if (inRangeLatLng(lng, lat)) {
        L.circleMarker([lat, lng], { 
          radius: 8, 
          weight: 2, 
          color: "#000", 
          fillColor: "#ff9900", 
          fillOpacity: 1 
        }).addTo(map);
        centerPoint = [lat, lng];
        dbg("initMiniMap: sample point aggiunto", { lat, lng });
      }
    }

    // Aggiungi i poligoni con approccio conservativo
    const addPolygonSafely = (feature, style, layerType) => {
      if (!feature?.geometry) return null;
      
      try {
        const layer = safeAddGeoJSON(feature, style);
        if (layer) {
          layer.addTo(map);
          
          // Calcola il centro approssimativo per lo zoom
          try {
            const bounds = layer.getBounds();
            if (bounds && bounds.isValid()) {
              const layerCenter = bounds.getCenter();
              if (!centerPoint) {
                centerPoint = [layerCenter.lat, layerCenter.lng];
              }
              // Imposta zoom più vicino per geometrie piccole
              const size = bounds.getNorthEast().distanceTo(bounds.getSouthWest());
              if (size < 100) { // Meno di 100 metri
                zoomLevel = 18;
              }
            }
          } catch (e) {
            dbg(`Impossibile calcolare bounds per ${layerType}:`, e);
          }
          
          dbg(`initMiniMap: ${layerType} layer aggiunto`);
          return layer;
        }
      } catch (e) {
        console.error(`Errore nell'aggiungere ${layerType}:`, e);
      }
      return null;
    };

    // Aggiungi site e context
    addPolygonSafely(siteFeature, { 
      color: "#1a73e8", 
      weight: 3, 
      fillColor: "#1a73e8", 
      fillOpacity: 0.1 
    }, "site");

    addPolygonSafely(contextFeature, { 
      color: "#ea4335", 
      weight: 3, 
      fillColor: "#ea4335", 
      fillOpacity: 0.2 
    }, "context");

    // Imposta la vista della mappa
    if (centerPoint) {
      map.setView(centerPoint, zoomLevel);
      dbg("initMiniMap: setView su centerPoint", centerPoint, "zoom:", zoomLevel);
    } else {
      // Fallback alle coordinate del contesto se disponibile
      if (contextFeature?.geometry?.type === "Polygon") {
        const coords = contextFeature.geometry.coordinates[0];
        if (coords.length > 0) {
          const [lng, lat] = coords[0];
          map.setView([lat, lng], 16);
          dbg("initMiniMap: fallback a prima coordinata del contesto");
        }
      } else {
        map.setView([41.888, 12.498], 16);
        dbg("initMiniMap: fallback a coordinate predefinite");
      }
    }

    // Forza il ridisegno dopo un breve delay
    setTimeout(() => {
      try {
        map.invalidateSize();
        dbg("initMiniMap: invalidateSize() chiamato");
        
        // Ridisegna manualmente i layer
        map.eachLayer(layer => {
          try {
            if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
              layer.redraw();
            }
          } catch (e) {
            // Ignora errori di redraw
          }
        });
      } catch (e) {
        console.error("initMiniMap: errore in invalidateSize:", e);
      }
    }, 100);

    window.addEventListener("resize", () => {
      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch (e) {
          console.warn("initMiniMap: errore in resize:", e);
        }
      }, 100);
    });
  });
}

// ---------- Card related ----------

function renderCard(sampleProps, affinityPerc, enrichedFeature) {
  const link = document.createElement("a");
  link.href = getPath(`record_necropoli/record_object/record_object.html?fid=${sampleProps.fid}`);
  link.target = "_blank";
  link.style.textDecoration = "none";
  link.style.color = "inherit";

  const div = document.createElement("div");
  div.className = "object-card";
  div.style.cursor = "pointer";

  // Riga 1: precise_taxon (bold)
  const r1 = document.createElement("div");
  r1.innerHTML = `<strong>${sampleProps.precise_taxon || sampleProps.taxon || sampleProps.species_orig_pub || "Undetermined"}</strong>`;

  // Riga 2: "Context name - Chronology"
  const ctxName = enrichedFeature.properties.__ctx_name || "";
  const chron = enrichedFeature.properties.__chron_str || "";
  const r2 = document.createElement("div");
  r2.textContent = [ctxName, chron].filter(Boolean).join(" - ");
  r2.style.fontSize = "0.85rem";
  r2.style.color = "var(--text-secondary)";

  // Riga 3: "Region/Province"
  const r3 = document.createElement("div");
  r3.textContent = enrichedFeature.properties.__regionProvince || "";
  r3.style.fontSize = "0.85rem";
  r3.style.color = "var(--text-secondary)";

  if (affinityPerc != null) {
    const perc = document.createElement("div");
    perc.className = "affinity-badge";
    perc.textContent = `Affinity: ${affinityPerc}%`;
    div.appendChild(perc);
  }

  div.appendChild(r1);
  div.appendChild(r2);
  div.appendChild(r3);
  link.appendChild(div);

  // Radar popup su hover
  let popupShown = false;
  function safeRenderRadarChart(breakdown) { try { renderObjectRadarChart(breakdown); } catch {} }
  div.addEventListener("mouseenter", e => {
    if (popupShown) return; popupShown = true;
    const breakdown = calcolaBreakdown(baseSample, enrichedFeature);
    showObjectRadarPopup(`Related sample`, breakdown, e.pageX, e.pageY);
    setTimeout(() => safeRenderRadarChart(breakdown), 40);
  });
  div.addEventListener("mousemove", e => {
    const popup = document.getElementById("radar-popup");
    if (popup) { popup.style.left = `${e.pageX + 20}px`; popup.style.top = `${e.pageY + 20}px`; }
  });
  div.addEventListener("mouseleave", () => {
    const popup = document.getElementById("radar-popup");
    if (popup) popup.remove();
    popupShown = false;
  });

  return link;
}

// ---------- Province heatmap ----------

function normalizeName(s) {
  if (!s) return "";
  const base = String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return base.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function lerpColorHex(hex1, hex2, t) {
  const c1 = hex1.replace('#',''), c2 = hex2.replace('#','');
  const r1 = parseInt(c1.substr(0,2),16), g1 = parseInt(c1.substr(2,2),16), b1 = parseInt(c1.substr(4,2),16);
  const r2 = parseInt(c2.substr(0,2),16), g2 = parseInt(c2.substr(2,2),16), b2 = parseInt(c2.substr(4,2),16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

async function ensureProvincesMap() {
  await waitForLeaflet();
  if (provincesMap) return provincesMap;

  dbg("ensureProvincesMap: creating map on #province-map");
  provincesMap = L.map("province-map", { zoomControl: true, attributionControl: true });

  try {
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 10,
      attribution: '&copy; OSM &copy; CARTO'
    }).addTo(provincesMap);
    dbg("ensureProvincesMap: tile layer added (CartoDB)");
  } catch (e) {
    console.error("ensureProvincesMap: errore aggiunta tile layer", e);
  }

  setTimeout(() => {
    provincesMap.invalidateSize();
    dbg("ensureProvincesMap: invalidateSize()");
  }, 100);
  window.addEventListener("resize", () => provincesMap.invalidateSize());
  return provincesMap;
}

function buildProvinceScores() {
  const scores = {};
  allSimilar.forEach(r => {
    const feat = enrichedSamples.find(f => String(f.properties?.fid) === String(r.fid));
    if (!feat) return;
    const raw = (feat.properties.__province || "").trim();
    if (!raw) return;
    const key = normalizeName(raw);
    if (!scores[key]) scores[key] = { sum: 0, count: 0, label: raw };
    scores[key].sum += r.percNum;
    scores[key].count += 1;
  });
  dbg("buildProvinceScores (normalized):", scores);
  return scores;
}

// === Nuovo: UI per switch Somma/Media ===
function ensureProvinceControls() {
  // Crea un contenitore subito sopra la legenda (una sola volta)
  let controls = document.getElementById("province-controls");
  if (!controls) {
    controls = document.createElement("div");
    controls.id = "province-controls";
    controls.className = "prov-controls";
    // Inserisci il blocco controlli prima della legenda
    $provLegend.parentNode.insertBefore(controls, $provLegend);
  }

  // Pulisci e costruisci due bottoni toggle
  controls.innerHTML = `
    <div class="view-toggle">
      <span style="font-size:.9rem;color:var(--text-secondary);margin-right:.25rem;">Aggregazione:</span>
      <button id="btn-agg-average" class="toggle-btn">Media</button>
      <button id="btn-agg-sum" class="toggle-btn">Somma</button>
    </div>
  `;

  // Stato attivo
  const $avg = document.getElementById("btn-agg-average");
  const $sum = document.getElementById("btn-agg-sum");
  function refreshActive() {
    if (provinceAggregationMode === "average") {
      $avg.classList.add("active");
      $sum.classList.remove("active");
    } else {
      $sum.classList.add("active");
      $avg.classList.remove("active");
    }
  }
  refreshActive();

  // Event handlers
  $avg.addEventListener("click", () => {
    provinceAggregationMode = "average";
    refreshActive();
    renderProvinceHeatmap(); // ricalcola con media
  });
  $sum.addEventListener("click", () => {
    provinceAggregationMode = "sum";
    refreshActive();
    renderProvinceHeatmap(); // ricalcola con somma
  });
}

function renderProvinceHeatmap() {
  if (!provincesGeoJSON) { dbg("renderProvinceHeatmap: provincesGeoJSON assente"); return; }
  const map = provincesMap;
  if (!map) { dbg("renderProvinceHeatmap: map non inizializzata"); return; }

  const scores = buildProvinceScores();

  // Calcola il massimo in base alla modalità
  let maxForScale = 0;
  if (provinceAggregationMode === "average") {
    maxForScale = Math.max(
      0,
      ...Object.values(scores).map(v => (v.count ? (v.sum / v.count) : 0))
    );
  } else { // "sum"
    maxForScale = Math.max(0, ...Object.values(scores).map(v => v.sum));
  }
  dbg("renderProvinceHeatmap: mode =", provinceAggregationMode, "max =", maxForScale);

  if (provincesLayer) {
    provincesLayer.remove();
    provincesLayer = null;
  }

  provincesLayer = L.geoJSON(provincesGeoJSON, {
    style: (feature) => {
      const rawName = (feature.properties?.name || feature.properties?.NAME_2 || feature.properties?.NAME || "").trim();
      const norm = normalizeName(rawName);
      const entry = scores[norm];
      let valueForColor = 0;
      if (entry) {
        valueForColor = (provinceAggregationMode === "average")
          ? (entry.count ? entry.sum / entry.count : 0)
          : entry.sum;
      }
      const t = maxForScale > 0 ? (valueForColor / maxForScale) : 0;
      const fill = lerpColorHex("#ffffff", "#ff0000", Math.min(1, Math.max(0, t)));
      return {
        color: "#cfcfcf",     // più chiaro
        weight: 0.1,          // linea più sottile
        opacity: 0.3,         // contorno meno invadente
         fillColor: fill,
        fillOpacity: t === 0 ? 0 : 0.55,
        className: "province-poly" // per CSS mirato
      };
    },
    onEachFeature: (feature, layer) => {
      const rawName = (feature.properties?.name || feature.properties?.NAME_2 || feature.properties?.NAME || "").trim();
      const norm = normalizeName(rawName);
      const entry = scores[norm];
      const sum = entry ? entry.sum.toFixed(1) : "0.0";
      const count = entry ? entry.count : 0;
      const avg = (entry && entry.count) ? (entry.sum / entry.count).toFixed(1) : "0.0";

      // Mostra sempre entrambe, evidenzia quella attiva
      const avgRow = provinceAggregationMode === "average" ? `<strong>Avg: ${avg}%</strong>` : `Avg: ${avg}%`;
      const sumRow = provinceAggregationMode === "sum" ? `<strong>Sum: ${sum}%</strong>` : `Sum: ${sum}%`;

      layer.bindPopup(
        `<strong>${rawName}</strong><br/>${avgRow}<br/>${sumRow}<br/>N samples: ${count}`
      );
    }
  }).addTo(map);
  dbg("renderProvinceHeatmap: layer aggiunto");

  try {
    const b = provincesLayer.getBounds();
    map.fitBounds(provincesLayer.getBounds(), { padding: [10,10] });
  } catch (e) {
    console.warn("renderProvinceHeatmap: fitBounds fallito, fallback setView", e);
    map.setView([42.0, 12.5], 5);
  }

  // Legenda coerente con modalità
  let maxLabel = (provinceAggregationMode === "average") ? maxForScale.toFixed(1) : maxForScale.toFixed(0);
  let legendTitle = (provinceAggregationMode === "average") ? "Province score (Average)" : "Province score (Sum)";
  let legendNote  = (provinceAggregationMode === "average")
    ? "Media delle affinità (%) per provincia"
    : "Somma delle affinità (%) per provincia";

  $provLegend.style.display = "block";
  $provLegend.innerHTML = `
    <div><strong>${legendTitle}</strong></div>
    <div class="legend-bar">
      <span>0</span>
      <div class="bar"></div>
      <span>${maxLabel}</span>
    </div>
    <div class="legend-note">${legendNote}</div>
  `;
  dbg("renderProvinceHeatmap: legenda aggiornata");
}

// ---------- MAIN ----------

Promise.all([
  fetch(samplesPath).then(r => r.json()),
  fetch(contextsPath).then(r => r.json()),
  fetch(sitesPath).then(r => r.json()),
  fetch(provincesPath).then(r => r.json()).catch(() => null),
  fetch(taxaCsvPath).then(r => r.text()).catch(() => "")
]).then(async ([samples, contexts, sites, provinces, taxaCsv]) => {
  dbg("Dati caricati:", {
    samplesCount: samples?.features?.length,
    contextsCount: contexts?.features?.length,
    sitesCount: sites?.features?.length,
    provincesFeatures: provinces?.features?.length,
    taxaCsvLoaded: !!taxaCsv
  });

  // parse CSV taxa
  if (taxaCsv) {
    taxaRows = parseCSV(taxaCsv);
    dbg("Taxa CSV rows:", taxaRows.length);
  } else {
    dbg("Taxa CSV non disponibile");
  }

  const ctxById  = new Map(contexts.features.map(c => [String(c.properties?.fid), c]));
  const siteById = new Map(sites.features.map(s => [String(s.properties?.fid), s]));
  provincesGeoJSON = provinces || null;

  // Enrich samples
  enrichedSamples = samples.features.map(f => {
    const p = { ...(f.properties || {}) };
    const ctx = ctxById.get(String(p.context_id));
    let site = null;

    if (ctx) {
      const cp = ctx.properties || {};
      p.typology = cp.typology ?? p.typology;
      p.chronology_iccd = cp.chronology_iccd ?? p.chronology_iccd;

      p.__ctx_name  = cp.context_name || "";
      const chronStr = formatChronology(cp.chron_orig, cp.chronology_iccd, cp.parent_chronology_iccd);
      p.__chron_str = chronStr;

      site = siteById.get(String(cp.parent_id));
      p.__province = (cp.province || "").trim();
    } else {
      p.__province = "";
      p.__ctx_name = "";
      p.__chron_str = "";
    }

    const reg = site?.properties?.region ?? ctx?.properties?.region ?? "";
    const pro = site?.properties?.province ?? ctx?.properties?.province ?? "";
    const regProv = [reg, pro].map(x => (x || "").trim()).filter(Boolean).join(" / ");
    p.__regionProvince = regProv;

    return { ...f, properties: p };
  });

  // Base sample
  const base = enrichedSamples.find(f => String(f.properties?.fid) === String(fid));
  if (!base) {
    $title.textContent = "Campione non trovato";
    return;
  }
  baseSample = base;

  // --- POPOLA SAMPLE ---
  const p = base.properties || {};
  $title.textContent = p.sample_number ? `Sample ${p.sample_number}` :
                       (p.id ? `Sample ID ${p.id}` :
                       (p.fid ? `Sample FID ${p.fid}` : "Sample"));
  $sub.textContent = p.context ? val(p.context) : "";

  const taxonStr = [
    p.precise_taxon ? String(p.precise_taxon).trim() : "Undetermined",
    p.species_orig_pub ? `(${String(p.species_orig_pub).trim()})` : ""
  ].filter(Boolean).join(" ");
  const taxonField = makeFieldWithNode("Taxon", document.createTextNode(taxonStr));

  const leftFields = [
    taxonField,
    makeField("Type", p.s_type),
    makeField("Part", p.s_part),
    makeField("Fossilization", p.s_foss),
    makeField("Quantity", p.quantity ?? p.qt),
    makeField("Weight (g)", p.weight_g),
    makeField("AMS", p.AMS),
    makeField("Notes", p.s_notes),
    makeField("Bibliography", p.bibliography)
  ].filter(Boolean);
  leftFields.forEach(el => $fields.appendChild(el));

  // --- TAXON DETAIL ---
  // --- TAXON DETAIL: join CSV su precise_taxon = valore ---
  taxaRowForSample = null;
  if (taxaRows && p.precise_taxon) {
    taxaRowForSample = taxaRows.find(
      r => String(r.valore || "").trim() === String(p.precise_taxon).trim()
    ) || null;
  }

  // loghi sorgenti
  const actaLogoPath  = getPath("images/icons/acta.png");
  const floriLogoPath = getPath("images/icons/floritaly.png");
  if ($logoActa)  $logoActa.src  = actaLogoPath;
  if ($logoFlori) $logoFlori.src = floriLogoPath;

  // Utility per colorare i pulsanti verdi/rossi come per la sezione "site"
  function applyLinkState(el, url) {
    const has = !!(url && String(url).trim());
    el.href = has ? String(url).trim() : "#";
    el.classList.remove("success", "danger", "disabled");
    if (has) {
      el.classList.add("success");
      el.removeAttribute("aria-disabled");
    } else {
      el.classList.add("danger");
      el.classList.add("disabled");
      el.setAttribute("aria-disabled", "true");
    }
  }

  if (taxaRowForSample) {
    dbg("Taxon detail trovato per", p.precise_taxon, taxaRowForSample);

    // Nomi comuni
    const nomi = (taxaRowForSample.nome_com || "").trim();
    $tdNomi.textContent = nomi || "—";

    // Usi attestati
    const usi = (taxaRowForSample.usi_attestati || "").trim();
    const parts = splitUsiSmart(usi);
    $tdUsi.innerHTML = parts.length
      ? parts.map(x => `<span class="chip">${x}</span>`).join(" ")
      : "—";

    // Immagine
    const linkImg = (taxaRowForSample.link_imm || "").trim();
    if (linkImg) {
      $tdImage.src = linkImg;
      $tdImage.style.display = "block";
    } else {
      $tdImage.style.display = "none";
    }
    
    // === Opzione A: link diretto per "Image source" ===
    const $imgSrcLink = document.getElementById("td-image-source-link");
    if ($imgSrcLink) {
      const imgUrl = toAbsoluteUrl(linkImg); // normalizza l'URL se manca https://
      if (imgUrl) {
        $imgSrcLink.href = imgUrl;
        $imgSrcLink.target = "_blank";
        $imgSrcLink.rel = "noopener";
        $imgSrcLink.classList.remove("disabled");
        $imgSrcLink.removeAttribute("aria-disabled");
      } else {
        // disabilita se non disponibile
        $imgSrcLink.removeAttribute("href");
        $imgSrcLink.classList.add("disabled");
        $imgSrcLink.setAttribute("aria-disabled", "true");
      }
    }

    // Link diretti
    const actaId  = (taxaRowForSample.id_actaplantarum || "").trim();
    const floriId = (taxaRowForSample.id_floritaly || "").trim();

    const actaUrl  = actaId  ? `https://www.actaplantarum.org/flora/flora_info.php?id=${encodeURIComponent(actaId)}` : "";
    const floriUrl = floriId ? `https://dryades.units.it/floritaly/index.php?procedure=taxon_page&tipo=all&id=${encodeURIComponent(floriId)}` : "";

    // NUOVI CAMPI nel CSV: wikipedia, wikispecies (link diretti)
    const wikiUrl  = (taxaRowForSample.wikipedia   || "").trim();
    const wsUrl    = (taxaRowForSample.wikispecies || "").trim();

    const $btnActa  = document.getElementById("td-open-acta");
    const $btnFlori = document.getElementById("td-open-floritaly");
    const $btnWiki  = document.getElementById("td-open-wikipedia");
    const $btnWS    = document.getElementById("td-open-wikispecies");

    applyLinkState($btnActa,  actaUrl);
    applyLinkState($btnFlori, floriUrl);
    applyLinkState($btnWiki,  wikiUrl);
    applyLinkState($btnWS,    wsUrl);

  } else {
    dbg("Taxon detail NON trovato per", p.precise_taxon);
    $tdNomi.textContent = "—";
    $tdUsi.textContent = "—";
    $tdImage.style.display = "none";

    // Disabilita tutti i pulsanti
    ["td-open-acta","td-open-floritaly","td-open-wikipedia","td-open-wikispecies"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      applyLinkState(el, ""); // rosso/disabled
    });
  }

  // ====== QUI IL FIX: definiamo context e site PRIMA di usarli ======
  const context = ctxById.get(String(p.context_id)) || null;
  const site = context ? siteById.get(String(context.properties?.parent_id)) : null;

  // SITE
  if (site) {
    const sp = site.properties || {};
    const brainCodeLink = document.createElement("a");
    brainCodeLink.href = "https://brainplants.successoterra.net/index.html";
    brainCodeLink.target = "_blank"; brainCodeLink.rel = "noopener";
    brainCodeLink.textContent = sp.site_code || (sp.site_name_brain || "");

    const siteRegionProvince = [sp.region, sp.province].map(x => (x || "").trim()).filter(Boolean).join(" / ");
    const siteChrono = formatChronology(sp.chron_orig, sp.chronology_iccd, sp.parent_chronology_iccd);

    [ makeFieldWithNode("Brain Code", brainCodeLink),
      makeField("Typology", sp.typology),
      makeField("Region/Province", siteRegionProvince),
      makeField("Chronology", siteChrono),
      makeField("Notes", cleanHtml(sp.c_notes))
    ].filter(Boolean).forEach(el => $siteFields.appendChild(el));

    const wikiBtn    = makeCustomLinkButton("Wikipedia", sp.osm_wikipedia ? wikipediaUrl(sp.osm_wikipedia) : "");
    const commonsBtn = makeCustomLinkButton("Commons", sp.osm_wikimedia_commons ? commonsUrl(sp.osm_wikimedia_commons) : "");
    const wdBtn      = makeCustomLinkButton("Wikidata", sp.osm_wikidata ? wikidataUrl(sp.osm_wikidata) : "");
    const webBtn     = makeCustomLinkButton("Website", sp.osm_website ? toAbsoluteUrl(sp.osm_website) : "");
    const osmBtn     = makeCustomLinkButton("OSM", sp.osm_name ? osmSearchUrl(sp.osm_name) : "");
    $siteLinks.appendChild(wikiBtn);
    $siteLinks.appendChild(commonsBtn);
    $siteLinks.appendChild(wdBtn);
    $siteLinks.appendChild(webBtn);
    $siteLinks.appendChild(osmBtn);
  } else {
    $siteFields.textContent = "Site non trovato.";
  }

  // CONTEXT
  if (context) {
    const cp = context.properties || {};
    const ctxChrono = formatChronology(cp.chron_orig, cp.chronology_iccd, cp.parent_chronology_iccd);
    [ makeField("Context name", cp.context_name),
      makeField("Typology", cp.typology),
      makeField("Chronology", ctxChrono),
      makeField("Notes", cleanHtml(cp.c_notes))
    ].filter(Boolean).forEach(el => $contextFields.appendChild(el));
  } else {
    $contextFields.textContent = "Context non trovato.";
  }

  // Mappa oggetto (sanitizzata)
  await initMiniMap(base, context, site);

  // RELATED
  function refreshSimilar() {
    $similarList.innerHTML = "";

    const raw = calcolaAffinitaOggettiSingolo(base, enrichedSamples)
      .filter(r => String(r.fid) !== String(fid));

    const minA = parseFloat(document.getElementById("min-affinity").value || "0");
    const maxA = parseFloat(document.getElementById("max-affinity").value || "100");
    allSimilar = raw
      .map(r => ({ ...r, percNum: parseFloat(String(r.percentuale).replace("%","")) }))
      .filter(r => r.percNum >= minA && r.percNum <= maxA)
      .sort((a,b) => b.percNum - a.percNum);

    dbg("refreshSimilar: risultati filtrati =", allSimilar.length, { minA, maxA });

    const toDisplay = allSimilar.slice(0, displayedSimilar);
    toDisplay.forEach(r => {
      const feat = enrichedSamples.find(f => String(f.properties?.fid) === String(r.fid));
      if (feat) {
        const card = renderCard(feat.properties, r.percNum.toFixed(1), feat);
        $similarList.appendChild(card);
      }
    });

    $btnMore.style.display = displayedSimilar < allSimilar.length ? "block" : "none";

    // Se la vista province è attiva, aggiorna la heatmap
    if ($provMapEl.style.display !== "none" && provincesGeoJSON) {
      dbg("refreshSimilar: aggiorno heatmap province");
      renderProvinceHeatmap();
    }
  }

  refreshSimilar();

  // Show more
  $btnMore.addEventListener("click", () => {
    displayedSimilar += 10;
    dbg("Show more: displayedSimilar =", displayedSimilar);
    refreshSimilar();
  });

  // Filtri Min/Max
  document.getElementById("min-affinity").addEventListener("change", () => { displayedSimilar = 10; dbg("min changed"); refreshSimilar(); });
  document.getElementById("max-affinity").addEventListener("change", () => { displayedSimilar = 10; dbg("max changed"); refreshSimilar(); });

  // Sliders pesi
  buildWeightSliders();
  document.getElementById("apply-affinity-settings").addEventListener("click", () => {
    const newWeights = collectSliderWeights();
    dbg("Apply weights:", newWeights);
    updateWeights(newWeights);
    displayedSimilar = 10;
    refreshSimilar();
  });
  document.getElementById("reset-affinity-settings").addEventListener("click", () => {
    dbg("Reset weights");
    resetWeights();
    resetSlidersToDefault();
    displayedSimilar = 10;
    refreshSimilar();
  });

  // Toggle vista List / Province
  $btnList.addEventListener("click", () => {
    dbg("Switch to LIST view");
    $btnList.classList.add("active");
    $btnProv.classList.remove("active");
    $similarList.style.display = "grid";
    $btnMore.style.display = displayedSimilar < allSimilar.length ? "block" : "none";
    $provMapEl.style.display = "none";
    $provLegend.style.display = "none";
    // Nascondi i controlli aggregazione se presenti
    const controls = document.getElementById("province-controls");
    if (controls) controls.style.display = "none";
  });

  $btnProv.addEventListener("click", async () => {
    dbg("Switch to PROVINCES view");
    $btnProv.classList.add("active");
    $btnList.classList.remove("active");
    $similarList.style.display = "none";
    $btnMore.style.display = "none";
    $provMapEl.style.display = "block";
    $provLegend.style.display = "block";

    await ensureProvincesMap();

    // Mostra/crea lo switch Somma/Media
    ensureProvinceControls();
    const controls = document.getElementById("province-controls");
    if (controls) controls.style.display = "block";

    setTimeout(() => {
      if (provincesMap) {
        provincesMap.invalidateSize();
        dbg("province-map invalidateSize()");
      }
    }, 120);

    if (provincesGeoJSON) {
      renderProvinceHeatmap();
    } else {
      dbg("Nessun GeoJSON province disponibile: impossibile renderizzare heatmap");
    }
  });

}).catch(err => {
  console.error("Errore nel caricamento dei dati:", err);
  $title.textContent = "Sample ?";
});

// ---------- Sliders pesi ----------

const ATTRS_FOR_WEIGHTS = [
  "precise_taxon",
  "Family",
  "genus",
  "s_type",
  "s_part",
  "s_foss",
  "typology",
  "qt",
  "chronology_iccd"
];

function labelize(attr) { return attr.replace(/_/g, ' '); }

function buildWeightSliders() {
  const slidersBox = document.getElementById("affinity-sliders");
  slidersBox.innerHTML = "";
  ATTRS_FOR_WEIGHTS.forEach(attr => {
    const wrapper = document.createElement("div");
    wrapper.className = "slider-container";
    wrapper.innerHTML = `
      <label for="slider-${attr}">${labelize(attr)}</label>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span style="font-size:0.8rem;color:#999;">0</span>
        <input type="range" min="0" max="3" step="0.1" value="1" id="slider-${attr}">
        <span style="font-size:0.8rem;color:#999;">3</span>
      </div>
    `;
    slidersBox.appendChild(wrapper);
  });
}

function collectSliderWeights() {
  const w = {};
  ATTRS_FOR_WEIGHTS.forEach(attr => {
    const el = document.getElementById(`slider-${attr}`);
    const val = el ? parseFloat(el.value) : 1;
    w[attr] = isNaN(val) ? 1 : val;
  });
  return w;
}
function resetSlidersToDefault() {
  ATTRS_FOR_WEIGHTS.forEach(attr => {
    const el = document.getElementById(`slider-${attr}`);
    if (el) el.value = "1";
  });
}

// ---------- Toggle pannello impostazioni ----------
document.getElementById("toggle-affinity-settings").addEventListener("click", () => {
  const panel = document.getElementById("affinity-settings-panel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
  dbg("toggle-affinity-settings: panel =", panel.style.display);
});
