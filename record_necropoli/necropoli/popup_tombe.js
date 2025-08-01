import { getPath } from '../../path_utils.js';

// Carica il CSS dedicato ai popup delle tombe
function loadPopupTombeCSS() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../css/popup_tombe.css';
  document.head.appendChild(link);
}
loadPopupTombeCSS();

// Caricamento Chart.js se necessario
function loadChartJsIfNeeded() {
  if (typeof Chart !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Ottiene il percorso dell'icona in base allo strumento
function getIconPath(strumento) {
  if (!strumento || typeof strumento !== 'string') {
    return getPath("images/objects/other.png");
  }

const strumentoPulito = strumento.toLowerCase().trim();
  return getPath("images/objects/" + strumentoPulito + ".png");
}

// Crea il popup per una tomba specifica
export function createTombaPopup(tombaFeature, oggettiFeatures) {
  const container = document.createElement('div');
  container.className = 'popup-tomba-wrapper';

  const nomeTomba = tombaFeature.properties.name;

  // Titolo
  const title = document.createElement('div');
  title.className = 'popup-tomba-title';
  title.textContent = nomeTomba;
  container.appendChild(title);

  // Filtra oggetti associati alla tomba
  const oggettiTomba = oggettiFeatures.filter(obj => {
    const nomeTombaOggetto = obj.properties.tomba?.trim().toLowerCase();
    return nomeTombaOggetto === nomeTomba.trim().toLowerCase();
  });

  // Nessun oggetto
  if (oggettiTomba.length === 0) {
    const noData = document.createElement('p');
    noData.className = 'popup-tomba-info';
    noData.textContent = 'Empty tomb';
    container.appendChild(noData);
    return container;
  }

  // Calcola strumenti
  const strumentiCount = {};
  let numOggetti = 0;
  let numAmbigui = 0;

  oggettiTomba.forEach(obj => {
    numOggetti++;
    const strumenti = (obj.properties.strumento || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (strumenti.length > 1) numAmbigui++;

    strumenti.forEach(str => {
      strumentiCount[str] = (strumentiCount[str] || 0) + 1;
    });
  });

  // Info riassuntiva
  const info = document.createElement('div');
  info.className = 'popup-tomba-info';
  info.innerHTML = `
    <div class="info-item"><span class="info-label">Objects:</span> <span class="info-value">${numOggetti}</span></div>
    <div class="info-item"><span class="info-label">Multi-class Object(s):</span> <span class="info-value">${numAmbigui}</span></div>
  `;
  container.appendChild(info);

  // Canvas per il grafico
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'popup-tomba-canvas-container';
  const canvas = document.createElement('canvas');
  canvas.className = 'popup-tomba-canvas';
  canvasContainer.appendChild(canvas);
  container.appendChild(canvasContainer);

// Disegna grafico
loadChartJsIfNeeded().then(() => {
  const ctx = canvas.getContext('2d');
  const labels = Object.keys(strumentiCount);
  const dataValues = Object.values(strumentiCount);
  
  // Palette di colori differenziati
  const colorPalette = [
    'rgba(126, 87, 194, 0.8)',  // viola
    'rgba(76, 175, 80, 0.8)',   // verde
    'rgba(33, 150, 243, 0.8)',  // blu
    'rgba(244, 67, 54, 0.8)',   // rosso
    'rgba(255, 152, 0, 0.8)',   // arancione
    'rgba(0, 188, 212, 0.8)',   // ciano
    'rgba(156, 39, 176, 0.8)'   // viola scuro
  ];

  if (canvas.chart) canvas.chart.destroy();

  // Creiamo immagini per i plugin
  const images = {};
  labels.forEach((label, i) => {
    const img = new Image();
    img.src = getIconPath(label);
    img.onerror = () => { img.src = getPath("images/objects/other.png"); };
    images[label] = img;
  });

  canvas.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: labels.map((_, i) => colorPalette[i % colorPalette.length]),
        borderColor: labels.map((_, i) => colorPalette[i % colorPalette.length].replace('0.8', '1')),
        borderWidth: 1,
        borderRadius: 6,
        hoverBackgroundColor: labels.map((_, i) => colorPalette[i % colorPalette.length].replace('0.8', '0.9'))
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 70 
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          yAlign: 'top',
          xAlign: 'center',
          caretSize: 5,
          caretPadding: 10,
          callbacks: {
            label: ctx => `${ctx.parsed.y} object(s)`,
            title: ctx => `${ctx[0].label}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0,0,0,0.05)',
            drawBorder: false
          },
          ticks: {
            color: '#666',
            font: {
              size: 12
            }
          }
        },
        x: {
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            display: false
          }
        }
      }
    },
    plugins: [{
      id: 'customImages',
      afterDraw(chart) {
        const ctx = chart.ctx;
        const xAxis = chart.scales.x;
        const yAxis = chart.scales.y;
        
        chart.data.labels.forEach((label, i) => {
          const img = images[label];
          if (img && img.complete) {
            const meta = chart.getDatasetMeta(0);
            const bar = meta.data[i];
            
            // Dimensioni icone più grandi
            const imgSize = Math.min(bar.width * 1.2, 32);
            const x = bar.x - imgSize / 2;
            const y = bar.y - imgSize - 8;  // Posizionata sopra la barra
            
            // Cerchio di sfondo per l'icona
            ctx.beginPath();
            ctx.arc(bar.x, y + imgSize/2, imgSize/2 + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fill();
            ctx.strokeStyle = colorPalette[i % colorPalette.length];
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Disegna l'icona
            ctx.drawImage(img, x, y, imgSize, imgSize);
          }
        });
      }
    }]
  });
});

  return container;
}