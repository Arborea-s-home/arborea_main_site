import { getPath } from '../../path_utils.js';

export function addObjectsLayer(map, oggettiFeatures) {
  const size = 40;

  const clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 20,
    showCoverageOnHover: false,
    iconCreateFunction: function (cluster) {
      return L.divIcon({
        html: `<div style="width: 36px; height: 36px; line-height: 36px; border-radius: 50%; background: white; border: 2px solid black; text-align: center; font-weight: bold;">${cluster.getChildCount()}</div>`,
        className: 'cluster-icon',
        iconSize: [36, 36]
      });
    }
  });

  const lineLayerGroup = L.layerGroup().addTo(map);
  const basePointsGroup = L.layerGroup().addTo(map);

  oggettiFeatures.forEach((f) => {
    const props = f.properties;
    const tomba = props.tomba?.trim();
    if (!tomba) return;

    const geom = f.geometry;
    let coord;
    if (geom.type === 'MultiPoint' && geom.coordinates.length > 0) {
      coord = geom.coordinates[0];
    } else if (geom.type === 'Point') {
      coord = geom.coordinates;
    }

    if (!coord || coord.length < 2) return;

    const latlng = L.latLng(coord[1], coord[0]);

    const dot = L.circleMarker(latlng, {
      radius: 3,
      color: '#000',
      fillColor: '#fff',
      fillOpacity: 1,
      weight: 1
    }).addTo(basePointsGroup);

    const foto = props.foto_prova?.trim() || "other.png";
    const icon = makeIcon(foto, size);

    const marker = L.marker(latlng, {
      icon,
      title: props.oggetto_corredo || "oggetto"
    });

    const sigla = props.sigla || "";
    const desc = props.original_description || "";
    const funzione = props.funzione || "-";
    const materiale = props.materiale || "-";
    const materialeSpec = props.materiale_specifico ? ` (${props.materiale_specifico})` : "";
    const imageFile = getPath("images/objects/" + foto);
    const idOggetto = props.fid;

    const popupContent = `
    <div class="popup-wrapper">
      <div class="popup-image-info">
        <div class="popup-sigla">${sigla}</div>
        <div class="popup-image-container">
          <img src="${imageFile}" alt="foto oggetto" class="popup-image" />
          ${desc ? `
          <div class="popup-image-description">
            <div class="popup-info-label">ORIGINAL DESCRIPTION</div>
            <div class="popup-info-value">${desc}</div>
          </div>
          ` : ''}
        </div>
        <div class="popup-info-container collapsed">
          <div class="popup-info-item">
            <div class="popup-info-label">OBJECT</div>
            <div class="popup-info-main-value">${props.strumento || "-"}</div>
            ${funzione ? `<div class="popup-info-function">${funzione}</div>` : ''}
          </div>
          <div class="popup-info-item">
            <div class="popup-info-label">MATERIAL</div>
            <div class="popup-info-value">${materiale}${materialeSpec}</div>
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
  
  // When binding the popup, use the custom class
  marker.bindPopup(popupContent, {
    className: 'leaflet-popup-content-wrapper-object'
  });

    marker.bindPopup(popupContent);

    marker.bindTooltip(props.strumento || "oggetto", {
      direction: 'top',
      offset: [0, -10],
      opacity: 0.9
    });

    clusterGroup.addLayer(marker);

    marker.on('add', () => {
      if (!map.hasLayer(clusterGroup)) return;

      const cluster = clusterGroup.getVisibleParent(marker);
      if (cluster && cluster !== marker) {
        const clusterLatLng = cluster.getLatLng();
        const line = L.polyline([clusterLatLng, latlng], {
          color: '#666',
          weight: 1,
          dashArray: '2,4',
          opacity: 0.7
        }).addTo(lineLayerGroup);

        marker._lineToCluster = line;

        cluster.on('move', () => {
          line.setLatLngs([cluster.getLatLng(), latlng]);
        });
      }
    });

    marker.on('remove', () => {
      if (marker._lineToCluster) {
        lineLayerGroup.removeLayer(marker._lineToCluster);
        marker._lineToCluster = null;
      }
    });
  });

  map.addLayer(clusterGroup);
  return clusterGroup;
}

function makeIcon(imgFile, size) {
  const imageUrl = getPath("images/objects/" + imgFile);
  return L.divIcon({
    className: "object-icon",
    iconSize: [size, size],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      overflow:hidden;border:2px solid #fff;
      box-shadow:0 0 4px #0004;
      background:url('${imageUrl}') center/cover;">
    </div>`
  });  
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("popup-toggle-btn")) {
      const wrapper = e.target.closest(".popup-wrapper");
      const info = wrapper.querySelector(".popup-info-container");

      if (!wrapper || !info) return;

      const isCollapsed = info.classList.contains("collapsed");

      if (isCollapsed) {
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


