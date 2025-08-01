import { getPath } from './path_utils.js';
import { Tutorial } from './tutorial.js';


class Dashboard {
  constructor() {
    this.selectedFields = new Set();
    this.fieldData = {};
    this.ambiti = {};
    this.debounceTimer = null;
    this.init();
  }

  async init() {
    await this.loadFieldData();
    this.createHeader();
    this.createAmbitoButtons();
    this.setupEventListeners();
    await this.loadMappedSites();
    this.createFooter();
  }

  createHeader() {
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    
    const logo = document.createElement('img');
    logo.src = getPath('images/logo_semplificato.png');
    logo.alt = 'Project Logo';
    logo.className = 'dashboard-logo';
    
    header.appendChild(logo);
    document.getElementById('sidebar').prepend(header);
  }

  async loadFieldData() {
    const response = await fetch(getPath("data/spiegazione_dati.csv"));
    const csvText = await response.text();
    const data = Papa.parse(csvText, { header: true }).data;

    data.forEach(row => {
      if (!row.ambito || !row.DENOMINAZIONE) return;
      
      const fieldName = row.DENOMINAZIONE?.trim();
      if (!row.ambito || !fieldName) return;
      
      this.fieldData[fieldName] = {
        id: row.ID.trim(),
        ambito: row.ambito.trim(),
        definition: row.DEFINIZIONE?.trim() || "",
      };
      
      if (!this.ambiti[row.ambito]) {
        this.ambiti[row.ambito] = {
          fields: [],
          definitions: new Set()
        };
      }
      
      this.ambiti[row.ambito].fields.push(fieldName);
      this.ambiti[row.ambito].definitions.add(row.DEFINIZIONE);
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
      description.textContent = [...this.ambiti[ambito].definitions][0];
      description.style.display = 'none';
      
      const fieldsContainer = document.createElement('div');
      fieldsContainer.className = 'fields-container';
      fieldsContainer.style.display = 'none';
      
      this.ambiti[ambito].fields.forEach(field => {
        const fieldId = `field-${field}`;
        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = 'field-wrapper';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = fieldId;
        checkbox.dataset.field = field;
        
        const label = document.createElement('label');
        label.htmlFor = fieldId;
        label.textContent = `${field} (${this.fieldData[field].id})`;
        label.className = 'field-label';
        
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
        const ambito = e.target.dataset.ambito;
        const container = e.target.closest('.ambito-container');
        const description = container.querySelector('.ambito-description');
        const fields = container.querySelector('.fields-container');
        
        description.style.display = description.style.display === 'none' ? 'block' : 'none';
        fields.style.display = fields.style.display === 'none' ? 'grid' : 'none';
        
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
    
    document.querySelectorAll('.fields-container input[type="checkbox"]:checked').forEach(checkbox => {
      this.selectedFields.add(checkbox.dataset.field);
    });
    
    this.sendToMap();
  }

  async loadMappedSites() {
    try {
      const response = await fetch(getPath("data/siti.geojson"));
      const geojson = await response.json();
  
      const mappedSites = geojson.features.filter(
        f => f.properties?.mapped === true
      );
  
      const container = document.getElementById('mapped-sites-container');
      container.innerHTML = '<h3>Current Mapped Necropolis</h3>';
      
      // Group by region based on current mode
      const groupedSites = {};
      mappedSites.forEach(site => {
        const region = window.mapManager.groupByAncientRegion 
          ? site.properties.historical_region 
          : site.properties.modern_region;
        
        if (!groupedSites[region]) {
          groupedSites[region] = [];
        }
        groupedSites[region].push(site);
      });
  
      // Create accordion for each region
      Object.keys(groupedSites).sort().forEach(region => {
        if (!region) return;
        
        const regionAccordion = document.createElement('div');
        regionAccordion.className = 'region-accordion';
        
        const regionHeader = document.createElement('button');
        regionHeader.className = 'region-header';
        regionHeader.textContent = `${region} (${groupedSites[region].length})`;
        
        const regionList = document.createElement('ul');
        regionList.className = 'region-list';
        regionList.style.display = 'none';
        
        groupedSites[region].forEach(site => {
          const li = document.createElement('li');
          const btn = document.createElement('button');
  
          btn.textContent = site.properties.placeName || 'Unnamed site';
          btn.className = 'mapped-site-button';
          btn.dataset.fid = site.properties.fid;
  
          btn.addEventListener('click', () => {
            const mapName = site.properties.map;
            const fid = site.properties.fid;
            if (mapName) {
              window.location.href = getPath(`record_necropoli/necropoli/index.html?fid=${fid}`);
            }
          });
  
          li.appendChild(btn);
          regionList.appendChild(li);
        });
        
        regionHeader.addEventListener('click', () => {
          regionList.style.display = regionList.style.display === 'none' ? 'block' : 'none';
        });
        
        regionAccordion.appendChild(regionHeader);
        regionAccordion.appendChild(regionList);
        container.appendChild(regionAccordion);
      });
  
    } catch (err) {
      console.error("Error loading mapped sites:", err);
    }
  }

  createFooter() {
    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    
    const sourcesTitle = document.createElement('h4');
    sourcesTitle.textContent = 'Data Sources';
    footer.appendChild(sourcesTitle);
    
    const sourcesList = document.createElement('ul');
    sourcesList.className = 'sources-list';
    
    const sources = [
      {
        text: 'data from sites',
        linkText: 'Mycenean Atlas Project',
        url: 'https://helladic.info/index.php',
        license: 'CC 4.0'
      },
      {
        text: 'modern regions',
        linkText: 'Greek Ministry of the Interior and Administrative Reconstruction',
        url: 'http://geodata.gov.gr/en/dataset/periphereies-elladas',
        license: 'CC 3.0'
      },
      {
        text: 'ancient region',
        linkText: 'made by the author',
        url: '',
        description: 'loosely based on classical historical regions'
      }
    ];
    
    sources.forEach(source => {
      const li = document.createElement('li');
      li.className = 'source-item';
      
      const textSpan = document.createElement('span');
      textSpan.textContent = `${source.text} → `;
      
      if (source.url) {
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.textContent = source.linkText;
        textSpan.appendChild(link);
      } else {
        textSpan.textContent += source.linkText;
      }
      
      if (source.license) {
        const licenseSpan = document.createElement('span');
        licenseSpan.textContent = ` ${source.license}`;
        textSpan.appendChild(licenseSpan);
      } else if (source.description) {
        const descSpan = document.createElement('span');
        descSpan.className = 'source-description';
        descSpan.textContent = ` (${source.description})`;
        textSpan.appendChild(descSpan);
      }
      
      li.appendChild(textSpan);
      sourcesList.appendChild(li);
    });
    
    footer.appendChild(sourcesList);
    
    const credits = document.createElement('div');
    credits.className = 'credits';
    
    const creditsTitle = document.createElement('h4');
    creditsTitle.textContent = 'Project Credits';
    credits.appendChild(creditsTitle);
    
    const author = document.createElement('div');
    author.className = 'author-info';
    
    const authorText = document.createElement('p');
    authorText.textContent = 'Produced and maintained by:';
    author.appendChild(authorText);
    
    const authorLogo = document.createElement('img');
    authorLogo.src = 'images/logo_erasmo.svg';
    authorLogo.alt = 'Erasmo di Fonso';
    authorLogo.className = 'author-logo';
    author.appendChild(authorLogo);
    
    const contact = document.createElement('p');
    contact.className = 'contact-info';
    contact.innerHTML = 'For questions or support please contact: <a href="mailto:erasmo.difonso@libero.it">erasmo.difonso@libero.it</a>';
    author.appendChild(contact);
    
    credits.appendChild(author);
    footer.appendChild(credits);
    
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
  
  // Avvia il tutorial dopo un breve ritardo
  setTimeout(() => {
    new Tutorial();
  }, 1000);
});

