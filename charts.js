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

    const labels = fieldsData.map(item =>
      window.labelMap?.[item.field] || item.field
    );

    const percentages = fieldsData.map(item => {
      const avg = item.averageValue;
      const val = item.currentValue;
      if (avg === 0) return 0;
      return Math.round((val / avg) * 100);
    });

    const getGradient = (ctx, chartArea, value) => {
      const ratio = value / 100;
      const gradient = ctx.createLinearGradient(0, 0, chartArea.right, 0);

      if (ratio < 0.5) {
        gradient.addColorStop(0, 'rgba(0, 180, 0, 0.7)');
        gradient.addColorStop(1, 'rgba(255, 255, 0, 0.7)');
      } else if (ratio < 1) {
        gradient.addColorStop(0, 'rgba(255, 255, 0, 0.7)');
        gradient.addColorStop(1, 'rgba(255, 165, 0, 0.7)');
      } else {
        gradient.addColorStop(0, 'rgba(255, 165, 0, 0.7)');
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0.7)');
      }
      return gradient;
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
            if (!chartArea) return 'rgba(150,150,150,0.5)';
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
              label: (ctx) => {
                const data = fieldsData[ctx.dataIndex];
                const code = window.labelMap?.[data.field] || data.field;
                const ratio = data.averageValue === 0 ? 0 : (data.currentValue / data.averageValue);
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
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.chartManager) {
    window.chartManager = new ChartManager();
    console.log('ChartManager initialized');
  }
});
