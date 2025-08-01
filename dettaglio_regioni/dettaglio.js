import { ChartManager } from '../charts.js';
import { getRepoBasePath, getPath } from '../path_utils.js';

export class DetailPage {
    constructor() {
        this.map = null;
        this.featureName = '';
        this.sitiFeatures = [];
        this.markers = L.markerClusterGroup({
            spiderfyOnMaxZoom: false, // non aspettare il maxZoom per spiderfy
            showCoverageOnHover: false,
            zoomToBoundsOnClick: false, // ❌ lasciato off
            spiderfyDistanceMultiplier: 1.5,
            maxClusterRadius: 60
        });

        this.markers.on('clusterclick', (a) => {
            a.layer.spiderfy();
        });
        
        this.iconCache = {};
    }

    async loadData() {
        this.base = getRepoBasePath();  // <-- salva qui
        const sitiGeoJSON = await fetch(`${this.base}data/siti.geojson`).then(res => res.json());        
        this.sitiFeatures = sitiGeoJSON.features;
    }
    getIconForType(type) {
        if (!type) return this.getIconForType('default');
        
        const normalizedType = type.toLowerCase().trim();
        let iconPath;

        switch(normalizedType) {
            case 'cementery':
                iconPath = getPath('images/icons/cementery.png');
                break;
            case 'chamber tomb':
                iconPath = getPath('images/icons/chamber.png');
                break;
            case 'tholos':
                iconPath = getPath('images/icons/tholos.png');
                break;
            case 'cist tomb':
                iconPath = getPath('images/icons/shaft.png');
                break;
            default:
                iconPath = getPath('images/icons/grave.png');
        }        
        
        if (!this.iconCache[normalizedType]) {
            this.iconCache[normalizedType] = L.divIcon({
                className: 'custom-marker',
                html: `
                    <div class="marker-container">
                        <img src="${iconPath}" class="marker-icon" />
                    </div>
                `,
                iconSize: [32, 32],  // Dimensioni aumentate
                iconAnchor: [16, 16],  // Punto di ancoraggio centrale
                popupAnchor: [0, -16]  // Posizione popup relativa
            });
        }
        
        return this.iconCache[normalizedType];
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
    
        this.initMap();
        this.addPageTitle(featureName);
        this.addSiteList(featureName);
        this.addLogo();
        await this.initChart();
    }

    initMap() {
        const matchingSiti = this.getSitiForRegion(this.featureName);

        if (matchingSiti.length === 0) {
            console.warn("Nessun sito trovato per questa regione.");
            return;
        }

        this.map = L.map('detail-map', {
            zoomControl: false // Disabilita completamente i controlli zoom
        }).fitBounds(L.geoJSON(matchingSiti).getBounds().pad(0.2));

        L.control.zoom({
            position: 'bottomright'
        }).addTo(this.map);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap & CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);

        // Add markers to cluster group
        matchingSiti.forEach(feature => {
            const latlng = L.geoJSON(feature).getBounds().getCenter();
            const marker = L.marker(latlng, {
                icon: this.getIconForType(feature.properties.type)
            });
            
            const name = feature.properties.placeName || "Sito senza nome";
            marker.bindPopup(`<b>${name}</b><br>${feature.properties.type || 'Tipo non specificato'}`);
            
            if (feature.properties.map === 'TRUE') {
                marker.on('click', () => {
                    const fid = feature.properties.fid;
                    window.location.href = `${base}record_necropoli/necropoli/index.html?fid=${fid}`;
                });
                marker.getElement().style.cursor = 'pointer';
            }
            
            this.markers.addLayer(marker);
        });

        this.map.addLayer(this.markers);
    }

    addLogo() {
        const logo = document.createElement('img');
        logo.src = `${this.base}images/logo_semplificato.png`;
        logo.className = 'map-logo';
        logo.alt = 'Logo';
        document.getElementById('detail-map-container').appendChild(logo);
    }

    addSiteList(regionName) {
        const container = document.getElementById('site-list-container');
        container.innerHTML = '';
    
        const title = document.createElement('h3');
        title.textContent = `Sites in ${regionName}`;
        container.appendChild(title);
    
        const siti = this.getSitiForRegion(regionName);
    
        if (siti.length === 0) {
            const none = document.createElement('p');
            none.textContent = "Nessun sito registrato.";
            container.appendChild(none);
        } else {
            // Raggruppa per tipo
            const sitesByType = {};
            siti.forEach(site => {
                const type = site.properties.type || 'Altro';
                if (!sitesByType[type]) {
                    sitesByType[type] = [];
                }
                sitesByType[type].push(site);
            });
    
            // Crea sezioni collassabili
            Object.entries(sitesByType).forEach(([type, sites]) => {
                const section = document.createElement('div');
                section.className = 'site-section';
    
                const header = document.createElement('div');
                header.className = 'site-section-header';
                header.innerHTML = `
                    <span>${type} (${sites.length})</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z"/>
                    </svg>
                `;
                
                const list = document.createElement('ul');
                list.className = 'site-section-list';
                
                sites.forEach(site => {
                    const li = document.createElement('li');
                    li.textContent = site.properties.placeName || "Sito senza nome";
                    
                    if (site.properties.map === 'TRUE') {
                        li.style.fontWeight = '500';
                        li.style.color = 'var(--primary-color)';
                        li.addEventListener('click', () => {
                            const fid = site.properties.fid;
                            window.location.href = `/record_necropoli/necropoli/index.html?fid=${fid}`;
                        });
                    }
                    
                    list.appendChild(li);
                });
    
                header.addEventListener('click', () => {
                    header.classList.toggle('collapsed');
                    list.style.display = header.classList.contains('collapsed') ? 'none' : 'block';
                });
    
                // Collassa tutte le sezioni inizialmente
                header.classList.add('collapsed');
                list.style.display = 'none';
    
                section.appendChild(header);
                section.appendChild(list);
                container.appendChild(section);
            });
        }
    
        container.classList.add('visible');
    }

    async initChart() {
        const regionName = this.featureName;
        const normalizedRegion = this.normalize(regionName);
    
        const sites = this.getSitiForRegion(regionName);
        if (sites.length === 0) {
            document.getElementById('detail-chart').innerHTML = '<p>Nessun dato disponibile per questa regione</p>';
            return;
        }
    
        // Conta i tipi nella regione corrente
        const currentCounts = {};
        sites.forEach(site => {
            const type = site.properties.type;
            if (!type) return;
            currentCounts[type] = (currentCounts[type] || 0) + 1;
        });
    
        // Conta per tipo su tutte le regioni
        const allCountsPerRegion = {}; // { region: { type: count } }
    
        this.sitiFeatures.forEach(site => {
            const reg = this.normalize(site.properties.historical_region || site.properties.modern_region || '');
            const type = site.properties.type;
            if (!type || !reg) return;
    
            if (!allCountsPerRegion[reg]) {
                allCountsPerRegion[reg] = {};
            }
    
            allCountsPerRegion[reg][type] = (allCountsPerRegion[reg][type] || 0) + 1;
        });
    
        // Calcola la media per tipo su tutte le regioni
        const sums = {};
        const counts = {};
        Object.values(allCountsPerRegion).forEach(regionCounts => {
            for (const type in regionCounts) {
                sums[type] = (sums[type] || 0) + regionCounts[type];
                counts[type] = (counts[type] || 0) + 1;
            }
        });
    
        const avgValues = {};
        for (const type in sums) {
            avgValues[type] = sums[type] / counts[type];
        }
    
        // Prepara dati per il grafico
        const chartData = Object.keys(currentCounts).map(type => ({
            field: type,
            currentValue: currentCounts[type],
            averageValue: avgValues[type] || 1
        })).sort((a, b) => (b.currentValue / b.averageValue) - (a.currentValue / a.averageValue));
    
        // Crea il contenitore mini-chart
        const chartContainer = document.createElement('div');
        chartContainer.className = 'site-list-chart';
        
        // Aggiungi al contenitore della lista
        const siteListContainer = document.getElementById('site-list-container');
        const title = siteListContainer.querySelector('h3');
        siteListContainer.insertBefore(chartContainer, title.nextSibling);
    
        // Crea il grafico
        if (!window.chartManager) {
            window.chartManager = new ChartManager();
            await new Promise(r => setTimeout(r, 100));
        }
        
        await window.chartManager.createGradientBarChart(chartData, chartContainer);
    }

    getSitiForRegion(regionName) {
        const normalized = this.normalize(regionName);
      
        const matching = this.sitiFeatures.filter(s => {
          const reg1 = s.properties.historical_region || '';
          const reg2 = s.properties.modern_region || '';
      
          const isMatch = this.normalize(reg1) === normalized || this.normalize(reg2) === normalized;
      
          if (isMatch) {
            console.log(`MATCH: ${s.properties.placeName} (region: ${reg1}, modern: ${reg2})`);
          }
      
          return isMatch;
        });
      
        console.log(`Totale siti trovati per "${regionName}":`, matching.length);
        return matching;
      }
      
    
    addPageTitle(featureName) {
        const title = document.createElement('h1');
        title.textContent = featureName;
        title.style.textAlign = 'center';
        title.style.margin = '20px 0';
        document.body.insertBefore(title, document.getElementById('detail-container'));
    }

    normalize(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, '');
    }
}

// Inizializzazione
document.addEventListener('DOMContentLoaded', () => {
    window.detailPage = new DetailPage();
    window.detailPage.init();
});