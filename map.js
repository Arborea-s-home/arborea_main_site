// map.js
import { createPopupContent } from './popup.js';
import { getPath } from './path_utils.js';

class MapManager {
  constructor() {
    this.map = L.map("map").setView([42.2, 13.3], 7); // centro Italia (Lazio–Abruzzo)
    this.geojsonLayer = null;
    this.layers = {};
    this.currentFields = [];            // tipologie correnti selezionate
    this.activeBoundary = 'region';     // 'region' | 'province'
    this.includeUndated = false; // stato per toggle timeline

    // Ordine fasi (con accorpamenti richiesti)
    this.PHASES = [
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

    // Normalizzatore per stringhe fase
    this.phaseSlug = (s) => s
      ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g,"")
      : "";

    // Lookup raw → fase standard (include alias/accorpamenti)
    this.phaseLookup = new Map();
    const aliases = {
      "etadelferro": "Età del Ferro / Villanoviano",
      "villanoviano": "Età del Ferro / Villanoviano",
      "periodoetrusco": "Periodo Etrusco / Orientalizzante",
      "periodoorientalizzante": "Periodo Etrusco / Orientalizzante",
      "mesolito": "Mesolitico" // tollera refuso
    };
    this.PHASES.forEach(p => this.phaseLookup.set(this.phaseSlug(p), p));
    Object.entries(aliases).forEach(([k,v]) => this.phaseLookup.set(k, v));

    // Range cronologico corrente (indici inclusivi). Default: tutto
    this.chronoFrom = 0;
    this.chronoTo = this.PHASES.length - 1;

    this.initBaseMap();
  }

  initBaseMap() {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; ...',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this.loadData();
  }

  async loadData() {
    const [sitiGeoJSON, regionsGeoJSON, provincesGeoJSON, explanationCsv] = await Promise.all([
      fetch(getPath("data/siti.geojson")).then(res => res.json()),
      fetch(getPath("data/regions.geojson")).then(res => res.json()),
      fetch(getPath("data/provinces.geojson")).then(res => res.json()),
      fetch(getPath("data/spiegazione_dati.csv")).then(res => res.text())
    ]);

    this.sitiFeatures = sitiGeoJSON.features || [];
    this.regionsGeoJSON = regionsGeoJSON;
    this.provincesGeoJSON = provincesGeoJSON;

    // Etichette ID (se ti servono altrove)
    const explanationData = Papa.parse(explanationCsv, { header: true }).data;
    window.labelMap = {};
    explanationData.forEach(row => {
      if (row?.DENOMINAZIONE && row?.ID) {
        window.labelMap[row.DENOMINAZIONE.trim()] = row.ID.trim();
      }
    });

    // 🔴 PRECALCOLO: fasi normalizzate per ogni sito (da parent_chronology_iccd, multi-valore)
    this.sitiFeatures.forEach(f => {
      const raw = f?.properties?.parent_chronology_iccd;
      const phases = new Set();
      if (raw && typeof raw === 'string') {
        raw.split(';')
          .map(s => s.trim())
          .filter(Boolean)
          .forEach(tok => {
            const key = this.phaseSlug(tok);
            const std = this.phaseLookup.get(key);
            if (std) phases.add(std);
          });
      }
      f.properties._phasesNormalized = phases; // Set<string>
    });

    // Prima aggregazione (con range cronologico completo)
    this.aggregateDataByArea();

    // Disegno iniziale: se non ci sono tipologie selezionate, mostrare il totale per area
    this.updateMap([]);
    document.dispatchEvent(new CustomEvent('map:data-ready'));
  }

  // Re-aggregazione per area (region/province), rispettando range cronologico
  aggregateDataByArea() {
    const selectedPhaseSet = new Set(this.PHASES.slice(this.chronoFrom, this.chronoTo + 1));
    this.countsByArea = {}; // { area: { typology: count } }
  
    // ✅ NIENTE dati? esci senza errori
    if (!Array.isArray(this.sitiFeatures) || this.sitiFeatures.length === 0) {
      return;
    }
  
    this.sitiFeatures.forEach(f => {
      const props = f.properties || {};
      const phases = props._phasesNormalized || new Set();
      const hasPhases = phases.size > 0;
      let chronoOk = hasPhases ? [...phases].some(p => selectedPhaseSet.has(p)) : false;
  
      // includi i siti senza data quando il toggle è ON
      if (this.includeUndated && !hasPhases) chronoOk = true;
      if (!chronoOk) return;
  
      const typology = props.typology;
      if (!typology) return;
  
      const key = (this.activeBoundary === 'province') ? props.province : props.region;
      if (!key) return;
  
      if (!this.countsByArea[key]) this.countsByArea[key] = {};
      this.countsByArea[key][typology] = (this.countsByArea[key][typology] || 0) + 1;
    });
  }  

  // Chiamato dalla timeline (due slider)
  setChronoSelectionByIndices(fromIdx, toIdx) {
    const max = this.PHASES.length - 1;
    this.chronoFrom = Math.max(0, Math.min(fromIdx, toIdx));
    this.chronoTo = Math.min(max, Math.max(fromIdx, toIdx));

    // Ricalcola aggregazioni per il nuovo range e ridisegna con i filtri correnti
    this.aggregateDataByArea();

    const fields =
      (window.dashboard && window.dashboard.selectedFields && window.dashboard.selectedFields.size)
        ? [...window.dashboard.selectedFields]
        : (this.currentFields || []);

    this.updateMap(fields);
  }

  // Per la timeline: #siti per fase (rispettando eventuale filtro tipologico)
  computePhaseCounts(selectedTypologies = []) {
    const useTyp = Array.isArray(selectedTypologies) ? new Set(selectedTypologies) : new Set();
    const counts = new Array(this.PHASES.length).fill(0);
  
    // ✅ niente dati? torna zeri
    if (!Array.isArray(this.sitiFeatures) || this.sitiFeatures.length === 0) {
      return counts;
    }
  
    this.sitiFeatures.forEach(f => {
      const props = f.properties || {};
      const typOk = useTyp.size === 0 ? true : useTyp.has(props.typology);
      if (!typOk) return;
  
      const phases = props._phasesNormalized || new Set();
      phases.forEach(p => {
        const idx = this.PHASES.indexOf(p);
        if (idx >= 0) counts[idx] += 1;
      });
    });
  
    return counts;
  }
  
  // ————————————————————————
  // Disegno mappa (choropleth)
  // ————————————————————————
  updateMap(fields = []) {
    const incoming = Array.isArray(fields) ? fields : [fields];
    const useFields = incoming.length ? incoming : (this.currentFields || []);
    this.currentFields = useFields;
  
    // ✅ se i siti non sono pronti, esci in silenzio
    if (!Array.isArray(this.sitiFeatures)) return;
  
    // se non ho ancora aggregato, fallo ora (non darà errore grazie alla guardia sopra)
    if (!this.countsByArea) this.aggregateDataByArea();
  
    if (this.geojsonLayer) this.map.removeLayer(this.geojsonLayer);
    this.geojsonLayer = L.layerGroup();
    this.updateStandardMap(useFields);
    this.geojsonLayer.addTo(this.map);
  }
  
  updateStandardMap(fields = []) {
    this.geojsonLayer = L.layerGroup();
  
    const counts = this.countsByArea || {};     // ✅ guard
    const sumAll = fields.length === 0;
    const areaSums = {};
  
    if (sumAll) {
      Object.entries(counts).forEach(([area, typologies]) => {
        const tot = Object.values(typologies || {}).reduce((acc, n) => acc + (n || 0), 0);
        areaSums[area] = tot;
      });
    } else {
      fields.forEach(typology => {
        Object.entries(counts).forEach(([area, typologies]) => {
          const count = (typologies && typologies[typology]) || 0;
          if (!areaSums[area]) areaSums[area] = 0;
          areaSums[area] += count;
        });
      });
    }

    // Calcola min/max esclusi zeri
    const values = Object.values(areaSums).filter(v => v > 0);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;

    // Scegli il GeoJSON giusto in base allo switch
    const gj = (this.activeBoundary === 'province')
      ? this.provincesGeoJSON
      : this.regionsGeoJSON;

    const layer = L.geoJSON(gj, {
      filter: (feature) => {
        const name = feature.properties.name;
        return name in areaSums;
      },
      style: (feature) => {
        const name = feature.properties.name;
        const val = areaSums[name] || 0;
        return {
          fillColor: this.getColor(val, min, max),
          weight: 1,
          color: "#666",
          fillOpacity: val > 0 ? 0.8 : 0.1
        };
      },
      onEachFeature: (feature, layer) => {
        this.bindPopupArea(feature, layer, fields);
      }
    });

    this.layers["_combined"] = layer;
    layer.addTo(this.geojsonLayer);
    this.geojsonLayer.addTo(this.map);
  }

  bindPopupArea(feature, layer, selectedFields) {
    const name = feature.properties.name;
    const rowData = {};

    selectedFields.forEach(field => {
      rowData[field] = this.countsByArea[name]?.[field] || 0;
    });

    const popupContent = createPopupContent({
      rawName: name,
      fieldsArray: selectedFields,
      rowData,
      dataSource: this.countsByArea,
      group: this.activeBoundary   // 'region' oppure 'province'
    });

    layer.bindPopup(popupContent, {
      maxWidth: 600,
      minWidth: 400
    });
  }

  getColor(value, min, max) {
    if (!value || value <= 0 || isNaN(value)) return "transparent";
    const denom = Math.max(1e-9, (max - min));
    const t = (value - min) / denom; // [0..1]
    const opacity = 0.2 + 0.6 * t;
    // verde #22c55e → rgb(34, 197, 94)
    return `rgba(34, 197, 94, ${opacity})`;
  }

  // (rimasto per compatibilità – non usato nel nuovo flusso)
  normalizeName(name) {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  }

  setupBoundaryToggle() {
    const checkbox = document.getElementById('admin-boundary-switch');
    const label = document.getElementById('admin-boundary-label');
    if (!checkbox || !label) return;

    // inizializza UI
    checkbox.checked = (this.activeBoundary === 'province');
    label.textContent = checkbox.checked ? 'Aggrega per province' : 'Aggrega per regioni';

    checkbox.addEventListener('change', (e) => {
      this.activeBoundary = e.target.checked ? 'province' : 'region';
      label.textContent = e.target.checked ? 'Aggrega per province' : 'Aggrega per regioni';

      // Ricalcolo le aggregazioni per il nuovo boundary
      this.aggregateDataByArea();

      // Prendo i filtri dalla dashboard se disponibile, altrimenti uso i correnti
      const fields =
        (window.dashboard && window.dashboard.selectedFields && window.dashboard.selectedFields.size)
          ? [...window.dashboard.selectedFields]
          : (this.currentFields || []);

      // Redraw immediato con gli stessi filtri
      this.updateMap(fields);

      // (opzionale) tenere la lista in sync
      if (window.dashboard) {
        window.dashboard.rebuildSitesList();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.mapManager = new MapManager();
  window.mapManager.setupBoundaryToggle();
});

// Gestione logo (come avevi)
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('map-logo-toggle');
  const logoWrapper = document.getElementById('map-logo-wrapper');
  const restoreBtn = document.getElementById('map-logo-restore');

  if (toggleBtn && logoWrapper && restoreBtn) {
    toggleBtn.addEventListener('click', () => {
      logoWrapper.classList.add('hidden');
      restoreBtn.classList.add('visible');
    });

    restoreBtn.addEventListener('click', () => {
      logoWrapper.classList.remove('hidden');
      restoreBtn.classList.remove('visible');
    });
  }
});

export { MapManager };
