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

    // Inizializza dashboard affinità
    const affinityDashboard = initAffinityDashboard();

    // Caricamento dati
    const sitiResponse = await fetch(getPath("data/siti.geojson"));
    const sitiData = await sitiResponse.json();

    const site = sitiData.features.find(f => f.properties.fid == fid);

    if (!site || !site.properties.map) {
        alert("Sito non trovato o mappa mancante");
        return;
    }

    const coords = site.geometry.coordinates;
    const siteName = site.properties.placeName;
    const mapFile = site.properties.map.toLowerCase().replace(/\.tif$/i, '') + ".tif";


    // Inizializzazione mappa
    const map = L.map("map", {
        minZoom: 15,
        maxZoom: 22,
    }).setView([coords[1], coords[0]], 18);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CartoDB</a>'
    }).addTo(map);

    // === Raster GeoTIFF ===
    const tiffResponse = await fetch(getPath(`images/maps/${mapFile}`));
    if (!tiffResponse.ok) throw new Error("GeoTIFF non trovato: " + mapFile);
    const arrayBuffer = await tiffResponse.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    const rasterLayer = new GeoRasterLayer({
        georaster,
        opacity: 0.7,
        resolution: 256
    });

    rasterLayer.addTo(map);
    map.fitBounds(rasterLayer.getBounds());

    // === Carica tombe.geojson ===
    const tombeResponse = await fetch(getPath("data/tombe.geojson"));
    const tombeData = await tombeResponse.json();
    const tombeDelSito = tombeData.features.filter(t =>
        t.properties.sito_id == fid && t.properties.parent_ID == null
    );
    const nomiTombe = tombeDelSito.map(t => t.properties.name);

    // Grafico tombe nella dashboard

    window.renderSiteGraphLazy = () => renderSiteGraph(tombeDelSito);
    window.__COLOR_TOMBE__ = colorTombeByAffinity;


    // === Carica oggetti.geojson ===
    const oggettiResponse = await fetch(getPath("data/oggetti.geojson"));
    const oggettiData = await oggettiResponse.json();
    const oggettiDelSito = oggettiData.features.filter(o =>
        nomiTombe.includes(o.properties.tomba)
    );

    // calcolo affinita

    const calcola = calcolaAffinitaTombe(
        { features: tombeDelSito },
        { features: oggettiDelSito }
    );

    // === Mappa oggetti per tomba ===
    const oggettiPerTomba = {};
    oggettiDelSito.forEach(obj => {
        const tomba = obj.properties.tomba;
        if (!tomba) return;
        if (!oggettiPerTomba[tomba]) oggettiPerTomba[tomba] = [];
        oggettiPerTomba[tomba].push(obj);
    });

    // === Layer tombe con popup dinamici ===
    const tombeLayer = L.geoJSON(tombeDelSito, {
        style: {
            color: "#993300",
            weight: 2,
            fillOpacity: 0.3
        },
        onEachFeature: (feature, layer) => {
            const tombaId = feature.properties.name;
            const oggetti = oggettiPerTomba[tombaId] || [];
            const popupDiv = createTombaPopup(feature, oggetti);
            layer.on("click", (e) => {
                if (affinityDashboard.active) {
                    e.originalEvent.preventDefault();
                    e.originalEvent.stopPropagation();
                    return;
                }
                layer.bindPopup(popupDiv).openPopup();
            });
        }
    }).addTo(map);

    aggiornaGestioneClickTombe();

    function aggiornaGestioneClickTombe() {
        tombeLayer.eachLayer(layer => {
            layer.off("click"); // Rimuove eventuali click precedenti
    
            const tombaId = layer.feature.properties.name;
            const oggetti = oggettiPerTomba[tombaId] || [];
    
            if (affinityDashboard.active) {
                layer.on("click", (e) => {
                    if (e.originalEvent && e.originalEvent.target.closest('.leaflet-popup, .leaflet-control')) return;
    
                    console.log("🟡 Modalità affinità attiva - Click su tomba:", tombaId);
    
                    const risultati = calcola(layer.feature.properties.fid);
                    const max = Math.max(...risultati.map(r => r.affinita));
    
                    tombeLayer.eachLayer(layerAltro => {
                        const fidAltro = layerAltro.feature.properties.fid;
                        const r = risultati.find(r => r.fid === fidAltro);
                        if (r) {
                            const perc = r.affinita / max;
                            const hue = 240 - (perc * 240);
                            const color = `hsl(${hue}, 100%, 50%)`;
                            layerAltro.setStyle({
                                fillColor: color,
                                fillOpacity: 0.7,
                                color: '#b00',
                                weight: 1.5
                            });
                        } else {
                            layerAltro.setStyle({
                                fillColor: "#f5f5f5",
                                fillOpacity: 0.3,
                                color: '#999',
                                weight: 1
                            });
                        }
                    });
    
                    affinityDashboard.displayResults(risultati, layer.feature, tombeDelSito);
                });
            } else {
                const popupDiv = createTombaPopup(layer.feature, oggetti);
                layer.on("click", (e) => {
                    layer.bindPopup(popupDiv).openPopup();
                });
            }
        });
    }   

    // === Layer oggetti ===
    let clusterGroup = addObjectsLayer(map, oggettiDelSito);

    // Inizializza barra dei filtri
    initCategoryFilter(oggettiDelSito, (oggettiFiltrati) => {
        if (map.hasLayer(clusterGroup)) {
            map.removeLayer(clusterGroup);
        }
        clusterGroup = addObjectsLayer(map, oggettiFiltrati);
    });

    // === Gestione click per affinità ===
    function getFeatureAtLatLng(latlng, layerGroup) {
        let found = null;
        layerGroup.eachLayer(layer => {
            if (layer.getBounds && layer.getBounds().contains(latlng)) {
                found = layer;
            }
        });
        return found;
    }

    function colorTombeByAffinity(baseFeature) {
        const risultati = calcola(baseFeature.properties.fid);
        const max = Math.max(...risultati.map(r => r.affinita));
    
        tombeLayer.eachLayer(layer => {
            const fidAltro = layer.feature.properties.fid;
            const r = risultati.find(r => r.fid === fidAltro);
            if (r) {
                const perc = r.affinita / max;
                const hue = 240 - (perc * 240);
                const color = `hsl(${hue}, 100%, 50%)`;
                layer.setStyle({
                    fillColor: color,
                    fillOpacity: 0.7,
                    color: '#b00',
                    weight: 1.5
                });
            } else {
                layer.setStyle({
                    fillColor: "#f5f5f5",
                    fillOpacity: 0.3,
                    color: '#999',
                    weight: 1
                });
            }
        });
    
        affinityDashboard.displayResults(risultati, baseFeature, tombeDelSito);
    }    

    map.on("click", function (e) {
        if (!affinityDashboard.active) return;
    
        if (e.originalEvent && e.originalEvent.target.closest('.leaflet-popup, .leaflet-control')) {
            console.log("⛔ Click su popup o controllo UI ignorato");
            return;
        }
    
        console.log("🟡 Modalità affinità attiva - Click rilevato");
    
        const layerClicked = getFeatureAtLatLng(e.latlng, tombeLayer);
        if (!layerClicked) {
            alert("Clicca su una tomba valida.");
            console.warn("❌ Nessuna tomba trovata al click");
            return;
        }
    
        console.log("✅ Tomba selezionata:", layerClicked.feature.properties.name);
    
        const fid = layerClicked.feature.properties.fid;
    
        const risultati = calcola(fid);
    
        const max = Math.max(...risultati.map(r => r.affinita));
        tombeLayer.eachLayer(layer => {
            const fidAltro = layer.feature.properties.fid;
            const r = risultati.find(r => r.fid === fidAltro);
            if (r) {
                const perc = r.affinita / max;
                const hue = 240 - (perc * 240);
                const saturation = 100;
                const lightness = 50; 
                const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        
                layer.setStyle({ 
                    fillColor: color, 
                    fillOpacity: 0.7,
                    color: '#b00',
                    weight: 1.5
                });
            } else {
                layer.setStyle({ 
                    fillColor: "#f5f5f5",
                    fillOpacity: 0.3,
                    color: '#999',
                    weight: 1
                });
            }
        });  

        // Mostra risultati nella dashboard
        affinityDashboard.displayResults(risultati, layerClicked.feature, tombeDelSito);
    });  

        // === Switch toggle visibilità layer ===
        const toggleRaster = document.getElementById('toggle-raster');
        const toggleOggetti = document.getElementById('toggle-oggetti');

        if (toggleRaster && toggleOggetti) {
            toggleRaster.addEventListener('change', (e) => {
                if (e.target.checked) {
                    map.addLayer(rasterLayer);
                } else {
                    map.removeLayer(rasterLayer);
                }
            });

            toggleOggetti.addEventListener('change', (e) => {
                if (e.target.checked) {
                map.addLayer(clusterGroup);
                } else {
                map.removeLayer(clusterGroup);
                }
            });
        } else {
            console.warn("Toggle raster/oggetti non trovati nel DOM");
        }

    // === Gestione toggle affinità nella dashboard ===
    document.getElementById('toggle-affinity').addEventListener('change', function(e) {
    const isActive = affinityDashboard.toggleAffinityMode();

    aggiornaGestioneClickTombe();

    // Accendi/spegni toggle

    if (!isActive) {
        tombeLayer.eachLayer(layer => {
            layer.setStyle({ 
                fillColor: "#993300", 
                fillOpacity: 0.3,
                color: "#993300",
                weight: 2
            });
        });
    }

    if (!isActive) {
        affinityDashboard.hideUI();

        tombeLayer.eachLayer(layer => {
            layer.setStyle({ 
                fillColor: "#993300", 
                fillOpacity: 0.3,
                color: "#993300",
                weight: 2
            });
        });
    }
});
})();
