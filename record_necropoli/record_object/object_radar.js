export function showObjectRadarPopup(titolo, breakdown, x = 100, y = 100) {
    const old = document.getElementById("radar-popup");
    if (old) old.remove();
  
    const popup = document.createElement("div");
    popup.id = "radar-popup";
    popup.style.position = "absolute";
    popup.style.left = `${x + 20}px`;
    popup.style.top = `${y + 20}px`;
    popup.style.zIndex = 9999;
    popup.style.background = "white";
    popup.style.border = "1px solid #e0e0e0";
    popup.style.padding = "1rem";
    popup.style.borderRadius = "8px";
    popup.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    popup.style.width = "400px";
    popup.style.maxWidth = "90vw";
  
    popup.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h4 style="margin:0;color:#1a73e8;">${titolo}</h4>
        <button onclick="document.getElementById('radar-popup').remove()"
                style="background:none;border:none;font-size:1.2em;cursor:pointer;color:#5f6368;">✖</button>
      </div>
      <div class="chart-container" style="width:100%;height:300px;">
        <canvas id="objectRadarChart"></canvas>
      </div>
    `;
  
    document.body.appendChild(popup);
  
    setTimeout(() => {
      renderObjectRadarChart(breakdown);
    }, 30);
  }
  
  export function renderObjectRadarChart(breakdowns) {
    const el = document.getElementById('objectRadarChart');
    if (!el) return;
    const ctx = el.getContext('2d');
  
    const labels = breakdowns.map(b => `${b.attr}: ${b.val}`);
    const data = breakdowns.map(b => Math.round((b.sim || 0) * 100));
    const maxVal = Math.max(10, ...data);
    const dynamicMax = Math.ceil((maxVal + 10) / 10) * 10;
  
    if (window.objectRadarChartInstance) {
      window.objectRadarChartInstance.destroy();
    }
  
    window.objectRadarChartInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: 'Contributo %',
          data,
          backgroundColor: 'rgba(26,115,232,0.1)',
          borderColor: 'rgba(26,115,232,0.8)',
          pointBackgroundColor: 'rgba(26,115,232,0.8)',
          pointBorderColor: '#fff',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            suggestedMin: 0,
            suggestedMax: dynamicMax,
            ticks: { stepSize: 20, backdropColor: 'transparent', color: '#5f6368' },
            pointLabels: { font: { size: 11 }, color: '#202124' },
            grid: { color: 'rgba(0,0,0,0.05)' },
            angleLines: { color: 'rgba(0,0,0,0.1)' }
          }
        },
        plugins: {
          legend: { display: false }
        },
        elements: { line: { tension: 0.1 } }
      }
    });
  }
  