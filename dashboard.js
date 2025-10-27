import { getPath } from './path_utils.js';
import { Tutorial } from './tutorial.js';


class Dashboard {
  constructor() {
    this.selectedFields = new Set();
    this.fieldData = {};
    this.ambiti = {};
    this.debounceTimer = null;
    
    this.loadSites = async () => {

      // Se la mappa è già pronta, riusa i dati senza rifetch
      if (window.mapManager?.sitiFeatures?.length) {
        this.allSites = window.mapManager.sitiFeatures;
        return;
      }
      // Altrimenti fai il fetch diretto del GeoJSON
      const response = await fetch(getPath("data/siti.geojson"));
      const geojson = await response.json();
      this.allSites = geojson.features || [];
    };

    this.init();
  }
  
  async init() {
    // 1) carica definizioni dei campi per popolare i pulsanti
    await this.loadFieldData();
  
    // 2) carica tutti i siti e costruisci la lista annidata Regione → Provincia → Sito
    await this.loadSites();
    this.rebuildSitesList();
  
    // 3) UI
    this.createHeader();
    this.createAmbitoButtons();
    this.setupEventListeners();
    this.updateSelectedFields();
    this.createDownloadEntry();
    this.createFooter();
  
    // (opzionale) manda lo stato iniziale alla mappa
    this.sendToMap();
  }

  createHeader() {
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    
    const logo = document.createElement('img');
    logo.src = getPath('images/logo_semplificato.png');
    logo.alt = 'Project Logo';
    logo.className = 'dashboard-logo';

    // 🔗 Trigger tutorial
    logo.title = 'Show tutorial';
    logo.setAttribute('role', 'button');
    logo.setAttribute('tabindex', '0');
    logo.style.cursor = 'pointer';

    const openTutorial = () => {
      if (document.querySelector('.tutorial-overlay')) return;
      new Tutorial();
    };

    logo.addEventListener('click', openTutorial);
    logo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTutorial();
      }
    });

    header.appendChild(logo);
    document.getElementById('sidebar').prepend(header);
  }

  async loadFieldData() {
    const response = await fetch(getPath("data/spiegazione_dati.csv"));
    const csvText = await response.text();
  
    // salta righe vuote e usa header
    const data = Papa.parse(csvText, { header: true, skipEmptyLines: 'greedy' }).data;
  
    this.fieldData = {};
    this.ambiti = {};
  
    data.forEach(row => {
      // normalizza e verifica campi minimi
      const ambito = (row?.ambito || '').trim();
      const denominazione = (row?.DENOMINAZIONE || '').trim();
      const id = (row?.ID || '').trim();
      const definizione = (row?.DEFINIZIONE || '').trim();
  
      if (!ambito || !denominazione || !id) return; // ignora righe incomplete
  
      this.fieldData[denominazione] = {
        id,
        ambito,
        definition: definizione
      };
  
      if (!this.ambiti[ambito]) {
        this.ambiti[ambito] = {
          fields: [],
          definitions: new Set()
        };
      }
  
      this.ambiti[ambito].fields.push(denominazione);
      if (definizione) this.ambiti[ambito].definitions.add(definizione);
    });
  }  

  createAmbitoButtons() {
    const container = document.getElementById('ambito-buttons');
    container.innerHTML = '';

    Object.keys(this.ambiti).forEach(ambito => {
      const ambitoContainer = document.createElement('div');
      ambitoContainer.className = 'ambito-container';
      
      const button = document.createElement('button');
      button.className = 'ambito-button';
      button.textContent = ambito;
      button.dataset.ambito = ambito;
      
      const description = document.createElement('div');
      description.className = 'ambito-description';
      
      const fieldsContainer = document.createElement('div');
      fieldsContainer.className = 'fields-container'; // chiusa di default (CSS)
      
      // toggle items
      this.ambiti[ambito].fields.forEach(field => {
        const fieldId = `field-${field}`;
        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = 'field-wrapper fancy-toggle';
      
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = fieldId;
        checkbox.dataset.field = field;
        checkbox.className = 'toggle-input';
      
        // default attivi per "context type"
        if ((this.fieldData[field]?.ambito || '').toLowerCase() === 'context type') {
          checkbox.checked = true;
        }
      
        const label = document.createElement('label');
        label.className = 'toggle-label';
        label.htmlFor = fieldId;
        label.innerHTML = `
          <span class="toggle-slider" aria-hidden="true"></span>
          <span class="toggle-text">${field} (${this.fieldData[field].id})</span>
        `;
      
        fieldWrapper.appendChild(checkbox);
        fieldWrapper.appendChild(label);
        fieldsContainer.appendChild(fieldWrapper);
      });      
      
      ambitoContainer.appendChild(button);
      ambitoContainer.appendChild(description);
      ambitoContainer.appendChild(fieldsContainer);
      container.appendChild(ambitoContainer);
      
    });
  }

  setupEventListeners() {
    document.getElementById('ambito-buttons').addEventListener('click', (e) => {
      if (e.target.classList.contains('ambito-button')) {
        const container = e.target.closest('.ambito-container');
        const isOpen = container.classList.toggle('open');
        e.target.setAttribute('aria-expanded', String(isOpen));
        // niente style inline: gestisce il CSS
        this.updateSelectedFields();
      }
    });

    document.getElementById('ambito-buttons').addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        this.updateSelectedFields();
      }
    });
  }

  updateSelectedFields() {
    this.selectedFields.clear();
  
    document
      .querySelectorAll('.fields-container input[type="checkbox"]:checked')
      .forEach(checkbox => this.selectedFields.add(checkbox.dataset.field));
  
    this.sendToMap();
  
    // aggiorna le barre della timeline (se presente)
    if (window.timeline) {
      window.timeline.updateBars([...this.selectedFields]);
    }
  }
  
rebuildSitesList() {
  if (!this.allSites) return;

  const container = document.getElementById('mapped-sites-container');
  container.innerHTML = `
    <h3>Siti</h3>
    <button id="see-all-records-btn" class="see-all-records-btn">
      see all records
    </button>
  `;

  // Raggruppa: Regione → Provincia → Siti
  const byRegion = {};
  this.allSites.forEach(site => {
    const region = site.properties.region || '—';
    const province = site.properties.province || '—';
    if (!byRegion[region]) byRegion[region] = {};
    if (!byRegion[region][province]) byRegion[region][province] = [];
    byRegion[region][province].push(site);
  });

  // Costruisci accordion annidato con caret separato
  Object.keys(byRegion).sort().forEach(region => {
    const regionAcc = document.createElement('div');
    regionAcc.className = 'region-accordion';

    const regionRow = document.createElement('div');
    regionRow.className = 'region-row';

    const regionCaret = document.createElement('button');
    regionCaret.className = 'caret';
    regionCaret.setAttribute('aria-label', `Espandi ${region}`);
    regionCaret.textContent = '▸';

    const regionBtn = document.createElement('button');
    regionBtn.className = 'region-title';
    const regionCount = Object.values(byRegion[region]).reduce((acc, arr) => acc + arr.length, 0);
    regionBtn.textContent = `${region} (${regionCount})`;

    regionBtn.addEventListener('click', () => {
      window.location.href = getPath(
        `record_necropoli/necropoli/index.html?region=${encodeURIComponent(region)}`
      );
    });

    const provincesWrap = document.createElement('div');
    provincesWrap.className = 'region-list';
    provincesWrap.style.display = 'none';

    regionCaret.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = provincesWrap.style.display === 'none';
      provincesWrap.style.display = open ? 'block' : 'none';
      regionCaret.classList.toggle('open', open);
    });

    regionRow.appendChild(regionCaret);
    regionRow.appendChild(regionBtn);
    regionAcc.appendChild(regionRow);

    Object.keys(byRegion[region]).sort().forEach(prov => {
      const provAcc = document.createElement('div');
      provAcc.className = 'province-accordion';

      const provRow = document.createElement('div');
      provRow.className = 'province-row';

      const provCaret = document.createElement('button');
      provCaret.className = 'caret';
      provCaret.setAttribute('aria-label', `Espandi ${prov}`);
      provCaret.textContent = '▸';

      const provBtn = document.createElement('button');
      provBtn.className = 'province-title';
      provBtn.textContent = `${prov} (${byRegion[region][prov].length})`;

      provBtn.addEventListener('click', () => {
        window.location.href = getPath(
          `record_necropoli/necropoli/index.html?province=${encodeURIComponent(prov)}`
        );
      });

      const sitesUl = document.createElement('ul');
      sitesUl.className = 'province-sites';
      sitesUl.style.display = 'none';

      byRegion[region][prov]
        .sort((a, b) => (a.properties.name || '').localeCompare(b.properties.name || ''))
        .forEach(site => {
          const li = document.createElement('li');
          const btn = document.createElement('button');
          const typ = site.properties.typology || '—';
          const name = site.properties.name || 'Unnamed site';
          btn.textContent = `${name} (${typ})`;
          btn.className = 'mapped-site-button';
          btn.dataset.fid = site.properties.fid;

          btn.addEventListener('click', () => {
            const fid = site.properties.fid;
            if (fid != null) {
              window.location.href = getPath(
                `record_necropoli/necropoli/index.html?fid=${encodeURIComponent(fid)}`
              );
            }
          });

          li.appendChild(btn);
          sitesUl.appendChild(li);
        });

      provCaret.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = sitesUl.style.display === 'none';
        sitesUl.style.display = open ? 'block' : 'none';
        provCaret.classList.toggle('open', open);
      });

      provRow.appendChild(provCaret);
      provRow.appendChild(provBtn);
      provAcc.appendChild(provRow);
      provAcc.appendChild(sitesUl);
      provincesWrap.appendChild(provAcc);
    });

    regionAcc.appendChild(provincesWrap);
    container.appendChild(regionAcc);
  });

  // <<< NUOVO: click sul bottone "see all records"
  const allBtn = document.getElementById('see-all-records-btn');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      const baseUrl = getPath('record_necropoli/necropoli/index.html');
      window.location.href = `${baseUrl}?all=1`;
    });
  }
}

  createDownloadEntry() {
    const legend = document.getElementById('legend');
    if (!legend) return;
  
    const wrap = document.createElement('div');
    wrap.id = 'download-entry';
    wrap.className = 'download-entry-card';
  
    // icona download (SVG inline, stile leggero)
    const icon = document.createElement('div');
    icon.className = 'download-icon';
    icon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>`;
  
    const text = document.createElement('div');
    text.className = 'download-text';
    text.innerHTML = `<h3>Download</h3>`;
  
    const btn = document.createElement('button');
    btn.className = 'download-entry-btn';
    btn.type = 'button';
    btn.textContent = 'explore and download the dataset';
    btn.addEventListener('click', () => {
      window.location.href = getPath('download/download_page.html');
    });
  
    wrap.appendChild(icon);
    wrap.appendChild(text);
    wrap.appendChild(btn);
  
    // Inserisci subito dopo la sezione Legend
    legend.insertAdjacentElement('afterend', wrap);
  }

  createFooter() {
    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';

    // --- SOLO Project Credits, con pannello viola e nuovo testo ---
    const credits = document.createElement('div');
    credits.className = 'credits credits--panel';

    const creditsTitle = document.createElement('h4');
    creditsTitle.textContent = 'Project Credits';
    credits.appendChild(creditsTitle);

    // blocco istituzionale richiesto
    const grant = document.createElement('div');
    grant.className = 'credits-grant';
    grant.innerHTML = `
      <p><strong>This website is intended as an online output of:</strong></p>
      <p>
        Project PE 0000020 CHANGES - CUP B53C22003780006, NRP Mission 4<br/>
        Component 2 Investment 1.3, Funded by the European Union - NextGenerationEU
      </p>
      <p style="margin-top:.5rem;"><strong>Directed by:</strong></p>
      <img src="${getPath('images/icons/logo_sapienza.png')}" alt="Sapienza" class="credits-sapienza" />
    `;
    credits.appendChild(grant);

    // (poi come prima) — autore, logo, contatto
    const author = document.createElement('div');
    author.className = 'author-info';

    const authorText = document.createElement('p');
    authorText.textContent = 'Produced and maintained by:';
    author.appendChild(authorText);

    const authorLogo = document.createElement('img');
    authorLogo.src = getPath('images/logo_erasmo.svg');
    authorLogo.alt = 'Erasmo di Fonso';
    authorLogo.className = 'author-logo';
    author.appendChild(authorLogo);

    const contact = document.createElement('p');
    contact.className = 'contact-info';
    contact.innerHTML = 'For questions or support please contact: <a href="mailto:erasmo.difonso@libero.it">erasmo.difonso@libero.it</a>';
    author.appendChild(contact);

    credits.appendChild(author);
    footer.appendChild(credits);

    // Append finale
    document.getElementById('sidebar').appendChild(footer);
  }

  sendToMap() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      if (window.mapManager) {
        const fields = [...this.selectedFields];
        window.mapManager.updateMap(fields);
      }
    }, 300);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
  
  // Avvia il tutorial solo al primo ingresso
  const TUTORIAL_STORAGE_KEY = 'arborea_tutorial_seen_v1';
  const alreadySeen = (() => { try { return localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1'; } catch { return false; } })();
  if (!alreadySeen) {
    setTimeout(() => { new Tutorial(); }, 1000);
  }
});

