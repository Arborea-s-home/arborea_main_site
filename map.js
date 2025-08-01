import { createPopupContent } from './popup.js';
import { getPath } from './path_utils.js';

class MapManager {
  constructor() {
    this.countsByRegion = {};
    this.map = L.map("map").setView([37.9838, 23.7275], 7);
    this.geojsonLayer = null;
    this.layers = {};
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
    const [sitiGeoJSON, regionsGeoJSON, explanationCsv] = await Promise.all([
      fetch(getPath("data/siti.geojson")).then(res => res.json()),
      fetch(getPath("data/regions.geojson")).then(res => res.json()),
      fetch(getPath("data/spiegazione_dati.csv")).then(res => res.text())
    ]);

    this.sitiFeatures = sitiGeoJSON.features;
    this.regionsGeoJSON = regionsGeoJSON;
    this.groupByAncientRegion = false;

    const explanationData = Papa.parse(explanationCsv, { header: true }).data;
    window.labelMap = {};
    explanationData.forEach(row => {
      if (row.DENOMINAZIONE && row.ID) {
        window.labelMap[row.DENOMINAZIONE.trim()] = row.ID.trim();
      }
    });

    this.aggregateDataByRegion();
  }

  aggregateDataByRegion() {
    this.countsByRegion = {};
  
    this.sitiFeatures.forEach(f => {
      const type = f.properties.type;
      if (!type) return;
  
      // 👇 Cambia dinamicamente il campo in base alla modalità
      const regionName = this.groupByAncientRegion
        ? f.properties.historical_region
        : f.properties.modern_region;
  
      if (!regionName) return;
  
      if (!this.countsByRegion[regionName]) {
        this.countsByRegion[regionName] = {};
      }
  
      this.countsByRegion[regionName][type] = (this.countsByRegion[regionName][type] || 0) + 1;
    });
  }  

  updateMap(fields = []) {
    if (this.geojsonLayer) {
      this.map.removeLayer(this.geojsonLayer);
    }
  
    const fieldsArray = Array.isArray(fields) ? fields : [fields];
    this.geojsonLayer = L.layerGroup();
    this.updateStandardMap(fieldsArray);
    this.geojsonLayer.addTo(this.map);
  }

  updateStandardMap(fields = []) {
    if (this.geojsonLayer) {
      this.map.removeLayer(this.geojsonLayer);
    }
  
    this.geojsonLayer = L.layerGroup();
  
    // Calcola per ogni regione la somma dei valori selezionati
    const regionSums = {};  // es. { "Peloponnisos": 12 }
  
    fields.forEach(type => {
      Object.entries(this.countsByRegion).forEach(([region, types]) => {
        const count = types[type] || 0;
        if (!regionSums[region]) regionSums[region] = 0;
        regionSums[region] += count;
      });
    });
  
    // Calcola min/max esclusi zeri
    const values = Object.values(regionSums).filter(v => v > 0);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
  
    const layer = L.geoJSON(this.regionsGeoJSON, {
      filter: (feature) => {
        const name = feature.properties.name;
        return name in regionSums;
      },
      style: (feature) => {
        const name = feature.properties.name;
        const val = regionSums[name] || 0;
        return {
          fillColor: this.getColor(val, min, max),
          weight: 1,
          color: "#666",
          fillOpacity: val > 0 ? 0.8 : 0.1
        };
      },
      onEachFeature: (feature, layer) => {
        this.bindPopupRegion(feature, layer, fields);
      }
    });    
  
    this.layers["_combined"] = layer;
    layer.addTo(this.geojsonLayer);
    this.geojsonLayer.addTo(this.map);
  }  

  updateMunicipalityMap(fieldsArray) {
    fieldsArray.forEach(field => {
      const values = Object.values(this.municipalityData)
        .map(d => parseFloat(d[field]))
        .filter(v => !isNaN(v) && v > 0);
  
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 100;
  
      const layer = L.geoJSON(this.municipalitiesGeoJSON, {
        filter: (feature) => {
          const rawName = feature.properties.Name || feature.properties.name || "";
          const key = this.normalizeName(rawName);
          const row = this.municipalityData[key];
          const val = parseFloat(row?.[field]);
                
          return row && !isNaN(val) && val > 0;
        },
        style: (feature) => {
          const rawName = feature.properties.Name || feature.properties.name || "";
          const key = this.normalizeName(rawName);
          const row = this.municipalityData[key];
          const val = parseFloat(row?.[field]);
  
          return {
            fillColor: this.getColor(val, min, max),
            weight: 1,
            color: "#666",
            fillOpacity: row && !isNaN(val) && val > 0 ? 0.8 : 0.1,
          };
        },
        onEachFeature: (feature, layer) => {
          this.bindMunicipalityPopup(feature, layer, fieldsArray);
        }
      });
  
      this.layers[field] = layer;
      layer.addTo(this.geojsonLayer);
    });
  }

  bindPopupRegion(feature, layer, selectedFields) {
    const name = feature.properties.name;
    const rowData = {};
  
    selectedFields.forEach(field => {
      rowData[field] = this.countsByRegion[name]?.[field] || 0;
    });
  
    const popupContent = createPopupContent({
      rawName: name,
      fieldsArray: selectedFields,
      rowData,
      dataSource: this.countsByRegion,
      group: 'standard'
    });
  
    layer.bindPopup(popupContent, {
      maxWidth: 600,
      minWidth: 400
    });
  }  

  bindMunicipalityPopup(feature, layer, fields) {
    const fieldsArray = Array.isArray(fields) ? fields : [fields];
    const rawName = feature.properties.Name || feature.properties.name || "";
    const key = this.normalizeName(rawName);
    const row = this.municipalityData[key];

    const popupContent = createPopupContent({
      rawName,
      fieldsArray,
      rowData: row,
      dataSource: Object.values(this.municipalityData),
      group: 'municipality'
    });

    layer.bindPopup(popupContent, {
      maxWidth: 600,
      minWidth: 400
    });
  }

  getStyle(feature, field, min, max) {
    const rawName = feature.properties.Name || feature.properties.name || "";
    const key = this.normalizeName(rawName);
    const row = this.dataMap[key];
    const val = parseFloat(row?.[field]);

    return {
      fillColor: this.getColor(val, min, max),
      weight: 1,
      color: "#666",
      fillOpacity: row && !isNaN(val) && val > 0 ? 0.8 : 0.1,
    };
  }

  getColor(value, min, max) {
    if (!value || value <= 0 || isNaN(value)) return "transparent";
    const t = (value - min) / (max - min);
    const r = Math.round(180 + 75 * t);
    const opacity = 0.2 + 0.6 * t;
    return `rgba(${r}, 0, 0, ${opacity})`;
  }

  normalizeName(name) {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  }

  setupGroupingToggle() {
    const checkbox = document.getElementById('group-by-municipality');
    if (!checkbox) return;
  
    checkbox.addEventListener('change', (e) => {
      this.groupByAncientRegion = e.target.checked; // ✅ switch tra moderno e antico
      this.aggregateDataByRegion();
      this.updateMap(window.selectedFields || []);
      if (window.dashboard) {
        window.dashboard.sendToMap();
      }
    });
  }  
}

document.addEventListener('DOMContentLoaded', () => {
  window.mapManager = new MapManager();
  window.mapManager.setupGroupingToggle();
});

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

