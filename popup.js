import { getPath } from './path_utils.js';

export function createPopupContent({
  rawName,
  fieldsArray,
  rowData,
  dataSource,
  group = 'standard'
}) {
  const popupContent = document.createElement('div');
  popupContent.style.maxWidth = '500px';

  // Titolo
  const title = document.createElement('strong');
  title.textContent = rawName;
  title.style.display = 'block';
  title.style.fontSize = '16px';
  title.style.marginBottom = '4px';
  popupContent.appendChild(title);

  // Sottotitolo
  const subtitle = document.createElement('div');
  subtitle.textContent = fieldsArray.join(', ');
  subtitle.style.fontSize = '14px';
  subtitle.style.color = '#666';
  subtitle.style.marginBottom = '8px';
  popupContent.appendChild(subtitle);

  // Prepara dati per il grafico
  const fieldsData = [];
  fieldsArray.forEach(field => {
    const val = parseFloat(rowData?.[field]);

    // Corretto: estrai valori da oggetto dataSource
    const values = Object.values(dataSource)
      .map(regionTypes => parseFloat(regionTypes[field]) || 0)
      .filter(v => v > 0);

    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    if (rowData && !isNaN(val) && val > 0) {
      fieldsData.push({
        field,
        currentValue: val,
        averageValue: avg
      });
    }
  });

  // Se ci sono dati, crea contenitore grafico + pulsante
  if (fieldsData.length > 0 && window.chartManager) {
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'chart-container-actual';
    chartWrapper.style.marginTop = '10px';
    chartWrapper.style.width = '100%';
    chartWrapper.style.minHeight = `${Math.max(150, fieldsData.length * 40)}px`;
    popupContent.appendChild(chartWrapper);

    // Pulsante dettaglio (sopra al grafico)
    const detailBtn = document.createElement('button');
    detailBtn.textContent = 'Full Details';
    detailBtn.className = 'dettaglio-btn';
    detailBtn.onclick = () => {
      window.location.href = getPath(
        `dettaglio_regioni/dettaglio.html?feature=${encodeURIComponent(rawName)}${group === 'municipality' ? '&group=municipality' : ''}`
      );
    };
    chartWrapper.appendChild(detailBtn);

    // Caption esplicativa del grafico (in apice)
    const chartCaption = document.createElement('div');
    chartCaption.className = 'chart-caption';
    chartCaption.textContent =
      'Bars show how common each site type is in this area compared to the average (100% = average). Green = above average, red = below.';
    chartWrapper.appendChild(chartCaption);

    // Contenitore vero del grafico (canvas va qui dentro)
    const chartContainer = document.createElement('div');
    chartContainer.style.height = chartWrapper.style.minHeight;
    chartContainer.style.width = '100%';
    chartWrapper.appendChild(chartContainer);

    // Crea il grafico dopo un breve delay
    setTimeout(async () => {
      await window.chartManager.createGradientBarChart(fieldsData, chartContainer);
    }, 50);
  }

  return popupContent;
}
