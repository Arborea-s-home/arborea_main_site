import {updateWeights, getCurrentConfig, updateTriple, calcolaBreakdown, calcolaAffinitaOggettiSingolo} 
from "./object_affinity.js";
import { showObjectRadarPopup } from "./object_radar.js";
import { getPath } from "../../path_utils.js";

const params = new URLSearchParams(window.location.search);
const fid = params.get("fid");
const oggettiPath = getPath("data/oggetti.geojson");

let allSimilarObjects = [];
let displayedSimilarObjects = 10;
let refreshSimilarObjects = null;

fetch(oggettiPath)
  .then(res => res.json())
  .then(oggetti => {
    const record = oggetti.features.find(f => String(f.properties.fid) === fid);

    if (!record) {
      document.getElementById("sigla").textContent = "Oggetto non trovato";
      return;
    }

    const p = record.properties;

    // Titoli
    document.getElementById("sigla").textContent = p.sigla || "";
    document.getElementById("original_description").textContent = p.original_description || "";

    // Campi informativi
    const fields = [
      { label: "Strumento", value: p.strumento },
      { label: "Funzione", value: p.funzione },
      { label: "Funzione specifica", value: p.funzione_specifica },
      { label: "Materiale", value: p.materiale + (p.materiale_specifico ? ` (${p.materiale_specifico})` : "") },
      { label: "Decorazione", value: p.decorazione ? "Sì" : null },
      { label: "Tema decorazione", value: p.decorazione_theme },
      {
        label: "Note",
        value: parseNoteWithLink(p.note, oggetti.features)
      }
    ];

    const fieldsContainer = document.getElementById("fields");
    function parseNoteWithLink(note, features) {
      if (!note) return "";
    
      const pattern = /\b([\w\s]+?)\s*\[ID:\s*(\d+)\]/g;
      let match;
      let lastIndex = 0;
      const parts = [];
    
      while ((match = pattern.exec(note)) !== null) {
        const [fullMatch, textBefore, oldId] = match;
        const index = match.index;
    
        // Aggiungi testo prima del match
        parts.push(document.createTextNode(note.slice(lastIndex, index)));
    
        // Estrai l'ultima parola dalla frase precedente
        const words = textBefore.trim().split(" ");
        const linkWord = words.pop(); // ultima parola
        const beforeLink = words.join(" ");
        if (beforeLink) parts.push(document.createTextNode(beforeLink + " "));
    
        // Crea il link
        const link = document.createElement("a");
        const linkedObj = features.find(f => String(f.properties.old_id) === oldId);
        const fallbackHref = getPath(`record_necropoli/record_object/record_object.html?fid=${oldId}`);
        link.href = linkedObj ? getPath(`record_necropoli/record_object/record_object.html?fid=${linkedObj.properties.fid}`) : fallbackHref;
        link.textContent = linkWord;
        link.setAttribute("data-note-link", "true");
        link.style.textDecoration = "underline dotted";
        link.style.cursor = "pointer";
    
        if (linkedObj) {
          link.addEventListener("mouseenter", e => {
            const breakdown = calcolaBreakdown(null, linkedObj);
            showObjectRadarPopup(linkedObj.properties.sigla || "Oggetto", breakdown, e.pageX, e.pageY);
            setTimeout(() => {
              try {
                if (document.getElementById('objectRadarChart')) {
                  renderObjectRadarChart(breakdown);
                }
              } catch (err) {
                console.error("Errore popup radar:", err);
              }
            }, 50);
          });
    
          link.addEventListener("mousemove", e => {
            const popup = document.getElementById("radar-popup");
            if (popup) {
              popup.style.left = `${e.pageX + 20}px`;
              popup.style.top = `${e.pageY + 20}px`;
            }
          });
    
          link.addEventListener("mouseleave", () => {
            const popup = document.getElementById("radar-popup");
            if (popup) popup.remove();
          });
        }
    
        parts.push(link);
        lastIndex = pattern.lastIndex;
      }
    
      // Aggiungi l'ultima parte di testo rimanente
      parts.push(document.createTextNode(note.slice(lastIndex)));
    
      const wrapper = document.createElement("span");
      parts.forEach(p => wrapper.appendChild(p));
      return wrapper;
    }    
    fields.forEach(({ label, value }) => {
      if (
        (typeof value === "string" && value.trim() !== "") ||
        (typeof value === "object" && value instanceof Node) // valore DOM (es. nota con link)
      ) {
        const div = document.createElement("div");
        div.className = "field";
    
        const labelSpan = document.createElement("span");
        labelSpan.className = "label";
        labelSpan.textContent = `${label}:`;
    
        div.appendChild(labelSpan);
        if (typeof value === "string") {
          div.append(` ${value}`);
        } else {
          div.appendChild(value);
        }
    
        fieldsContainer.appendChild(div);
      }
    });    

    // Immagini
    const imgBox = document.getElementById("object-images");
    const basePath = getPath("images/objects/");
    const foto1 = p.foto_prova?.trim();
    const foto2 = p.foto_prova2?.trim();

    function createImageWrapper(src, src2) {
      const wrapper = document.createElement("div");
      wrapper.className = "image-wrapper";
    
      if (src2) {
        const container = document.createElement("div");
        container.className = "image-flip-container";
    
        const front = document.createElement("div");
        front.className = "flip-face front";
        const img1 = document.createElement("img");
        img1.src = src;
        img1.alt = "Foto oggetto 1";
        front.appendChild(img1);
    
        const back = document.createElement("div");
        back.className = "flip-face back";
        const img2 = document.createElement("img");
        img2.src = src2;
        img2.alt = "Foto oggetto 2";
        back.appendChild(img2);
    
        container.appendChild(front);
        container.appendChild(back);
    
        const flipWrapper = document.createElement("div");
        flipWrapper.className = "flip-wrapper";
        flipWrapper.appendChild(container);
    
        const arrow = document.createElement("div");
        arrow.className = "image-flip-arrow";
        arrow.innerHTML = "&#x21bb;"; // simbolo ↻
    
        let flipped = false;
        arrow.addEventListener("click", () => {
          flipped = !flipped;
          container.classList.toggle("flipped", flipped);
        });
    
        wrapper.appendChild(flipWrapper);
        wrapper.appendChild(arrow);
      } else {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "Foto oggetto";
        wrapper.appendChild(img);
      }
    
      return wrapper;
    }    
    
    if (foto1) {
      imgBox.appendChild(createImageWrapper(basePath + foto1, foto2 ? basePath + foto2 : null));
    }

    // Mini-card
    function renderCard(p, affinity) {
      const link = document.createElement("a");
      link.href = getPath(`record_necropoli/record_object/record_object.html?fid=${p.fid}`);
      link.target = "_blank";
      link.style.textDecoration = "none";
      link.style.color = "inherit";
    
      const div = document.createElement("div");
      div.className = "object-card";
      div.style.cursor = "pointer";
    
      const img = document.createElement("img");
      img.src = getPath(`images/objects/${p.foto_prova?.trim() || 'other.png'}`);
      img.alt = p.oggetto_corredo || "oggetto";
    
      const titolo = document.createElement("div");
      titolo.innerHTML = `<strong>${p.sigla || "?"}</strong>`;
    
      const descr = document.createElement("div");
      descr.textContent = p.original_description?.substring(0, 60) + (p.original_description?.length > 60 ? "..." : "");
      descr.style.fontSize = "0.85rem";
      descr.style.color = "var(--text-secondary)";
    
      if (affinity) {
        const perc = document.createElement("div");
        perc.className = "affinity-badge";
        perc.textContent = `Affinità: ${affinity}%`;
        div.appendChild(perc);
      }
    
      div.appendChild(img);
      div.appendChild(titolo);
      div.appendChild(descr);
      link.appendChild(div);
    
      let popupShown = false;


      // radar

      function safeRenderRadarChart(breakdown) {
        try {
          if (document.getElementById('objectRadarChart')) {
            renderObjectRadarChart(breakdown);
          }
        } catch (err) {
          console.error("Errore nel rendering del grafico radar:", err);
        }
      }
    
      div.addEventListener("mouseenter", e => {
        if (popupShown || !affinity) return;
        popupShown = true;

        const breakdown = calcolaBreakdown(record, { properties: p });
        showObjectRadarPopup(p.sigla || "Oggetto affine", breakdown, e.pageX, e.pageY);
        
        // Usa safeRender invece di render diretto
        setTimeout(() => {
          safeRenderRadarChart(breakdown);
        }, 50);
      });
    
      div.addEventListener("mousemove", e => {
        const popup = document.getElementById("radar-popup");
        if (popup) {
          popup.style.left = `${e.pageX + 20}px`;
          popup.style.top = `${e.pageY + 20}px`;
        }
      });
    
      div.addEventListener("mouseleave", () => {
        const popup = document.getElementById("radar-popup");
        if (popup) popup.remove();
        popupShown = false;
      });
    
      return link;
    }

    // Oggetti nella stessa tomba
    const tombBox = document.getElementById("same-tomb");
    oggetti.features
      .filter(f => f.properties.tomba === p.tomba && f.properties.fid != fid)
      .forEach(f => {
        const card = renderCard(f.properties);
        tombBox.appendChild(card);
      });

    // Oggetti affini
    const simBox = document.getElementById("similar-objects");
    refreshSimilarObjects = function() {
      simBox.innerHTML = "";
      
      const minAffinity = parseInt(document.getElementById("min-affinity").value) || 0;
      const maxAffinity = parseInt(document.getElementById("max-affinity").value) || 100;
      
      allSimilarObjects = calcolaAffinitaOggettiSingolo(record, oggetti.features)
        .filter(r => r.fid != fid)
        .sort((a, b) => parseFloat(b.percentuale) - parseFloat(a.percentuale))
        .filter(r => {
          const perc = parseFloat(r.percentuale);
          return perc >= minAffinity && perc <= maxAffinity;
        });
      
      const toDisplay = allSimilarObjects.slice(0, displayedSimilarObjects);
      
      toDisplay.forEach(r => {
        const feature = oggetti.features.find(f => f.properties.fid == r.fid);
        if (feature) {
          const card = renderCard(feature.properties, parseFloat(r.percentuale).toFixed(1));
          simBox.appendChild(card);
        }
      });
      
      document.getElementById("show-more-btn").style.display = 
        displayedSimilarObjects < allSimilarObjects.length ? "block" : "none";
    }
    
    refreshSimilarObjects();

    // Mostra più oggetti
    document.getElementById("show-more-btn").addEventListener("click", () => {
      displayedSimilarObjects += 10;
      refreshSimilarObjects();
    });

    // Filtra per range di affinità
    document.getElementById("min-affinity").addEventListener("change", refreshSimilarObjects);
    document.getElementById("max-affinity").addEventListener("change", refreshSimilarObjects);
  })
  .catch(err => {
    console.error("Errore nel caricamento dei dati:", err);
    document.getElementById("sigla").textContent = "Errore nel caricamento dati";
  });

// Pannello impostazioni affinità
document.getElementById("toggle-affinity-settings").addEventListener("click", () => {
  const panel = document.getElementById("affinity-settings-panel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
});

const attributi = ["strumento", "funzione", "funzione_specifica", "materiale", "materiale_specifico", "decorazione_theme"];
const slidersBox = document.getElementById("affinity-sliders");

attributi.forEach(attr => {
  const wrapper = document.createElement("div");
  wrapper.className = "slider-container";
  wrapper.innerHTML = `
  <label for="slider-${attr}">${attr.replace(/_/g, ' ')}</label>
  <div style="display: flex; align-items: center; gap: 0.5rem;">
    <span style="font-size: 0.8rem; color: #999;">0</span>
    <input type="range" min="0" max="3" step="0.1" value="1" id="slider-${attr}">
    <span style="font-size: 0.8rem; color: #999;">3</span>
  </div>
`;
  slidersBox.appendChild(wrapper);
});

document.getElementById("apply-affinity-settings").addEventListener("click", () => {
  const newWeights = {};
  attributi.forEach(attr => {
    const val = parseFloat(document.getElementById(`slider-${attr}`).value);
    newWeights[attr] = val;
  });

  updateWeights(newWeights);
  refreshSimilarObjects();
});