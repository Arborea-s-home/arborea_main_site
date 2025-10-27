export class ChartManager {
  constructor() {
    this.chartJSLoaded = false;
    this.loadChartJS();
  }

  async loadChartJS() {
    if (typeof Chart === 'undefined') {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js';
        script.onload = () => {
          this.chartJSLoaded = true;
          console.log('Chart.js loaded successfully');
          resolve();
        };
        script.onerror = () => {
          console.error('Failed to load Chart.js');
          resolve();
        };
        document.head.appendChild(script);
      });
    } else {
      this.chartJSLoaded = true;
    }
  }

  async createGradientBarChart(fieldsData, container) {
    if (!this.chartJSLoaded) await this.loadChartJS();
    if (!container?.parentNode) {
      console.error('Invalid chart container');
      return;
    }

    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    // Etichette leggibili (es. "funerary", "sacred", ecc.)
    const labels = fieldsData.map(item =>
      window.labelMap?.[item.field] || item.field
    );

    // Percentuale rispetto alla media pesata (100% = media)
    const percentages = fieldsData.map(item => {
      const avg = item.averageValue;
      const val = item.currentValue;
      if (avg === 0) return 0;
      return Math.round((val / avg) * 100);
    });

    // Assicuriamoci che l'asse X includa SEMPRE 100, così la linea verde cade dentro al grafico
    const maxPerc = Math.max(100, ...percentages);

    // Colore della barra in funzione di quanto sta sopra/sotto la media:
    // <100%  => rosso -> arancio/giallo
    // ~100%  => arancio/giallo pieno
    // >100%  => arancio/giallo -> verde
    const getGradient = (ctx, chartArea, value) => {
      if (!chartArea) return 'rgba(150,150,150,0.5)';

      const gradient = ctx.createLinearGradient(0, 0, chartArea.right, 0);
      const pct = value; // già in percento

      if (pct < 100) {
        // sotto media: rosso → arancio/giallo
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.7)');   // rosso (#ef4444)
        gradient.addColorStop(1, 'rgba(251, 191, 36, 0.7)');  // giallo/arancio (#fbbf24)
      } else if (pct === 100) {
        // esattamente nella media: arancio/giallo
        gradient.addColorStop(0, 'rgba(251, 191, 36, 0.7)');
        gradient.addColorStop(1, 'rgba(251, 191, 36, 0.7)');
      } else {
        // sopra media: arancio/giallo → verde
        gradient.addColorStop(0, 'rgba(251, 191, 36, 0.7)');  // giallo/arancio
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0.7)');   // verde (#22c55e)
      }
      return gradient;
    };

    // Plugin linea verticale tratteggiata a 100%
    const avgRefLinePlugin = {
      id: 'avgRefLine',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales?.x) return;

        const xScale = scales.x;
        const xPixel = xScale.getPixelForValue(100); // posizione del 100%

        // Se per qualche motivo è fuori, non disegnare
        if (xPixel < chartArea.left || xPixel > chartArea.right) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xPixel, chartArea.top);
        ctx.lineTo(xPixel, chartArea.bottom);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.9)'; // verde brillante
        ctx.stroke();
        ctx.restore();
      }
    };

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Compared to the average',
          data: percentages,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            return getGradient(ctx, chartArea, context.raw);
          },
          borderColor: 'rgba(0,0,0,0.8)',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        scales: { 
          x: {
            beginAtZero: true,
            suggestedMax: maxPerc, // <-- così la linea del 100% è sempre visibile
            title: {
              display: true,
              text: '% of the weighted avg'
            },
            ticks: {
              callback: v => v + '%'
            }
          },
          y: {
            type: 'category',
            title: {
              display: true,
              text: 'Type'
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              // tooltip personalizzato
              label: (ctx) => {
                const data = fieldsData[ctx.dataIndex];
                const code = window.labelMap?.[data.field] || data.field;
                const ratio = data.averageValue === 0
                  ? 0
                  : (data.currentValue / data.averageValue);

                return [
                  `${code} – ${data.field}`,
                  `Value: ${data.currentValue.toFixed(2)}`,
                  `Weighted avg: ${data.averageValue.toFixed(2)}`,
                  `Ratio: ${ratio.toFixed(2)}x (${ctx.raw}%)`
                ];
              }
            }
          }
        }
      },
      plugins: [avgRefLinePlugin] // <-- linea verticale a 100%
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.chartManager) {
    window.chartManager = new ChartManager();
    console.log('ChartManager initialized');
  }
});
