export function showObjectRadarPopup(titolo, breakdown, x = 100, y = 100) {
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h4 style="margin: 0; color: #1a73e8;">${titolo}</h4>
            <button onclick="document.getElementById('radar-popup').remove()" 
                    style="background: none; border: none; font-size: 1.2em; cursor: pointer; color: #5f6368;">
                ✖
            </button>
        </div>
        <div class="chart-container" style="width: 100%; height: 300px;">
            <canvas id="objectRadarChart"></canvas>
        </div>
    `;

    document.body.appendChild(popup);

    setTimeout(() => {
        renderObjectRadarChart(breakdown);
    }, 50);
}

export function renderObjectRadarChart(breakdowns) {
    const ctx = document.getElementById('objectRadarChart').getContext('2d');

    const labels = breakdowns.map(b => `${b.attr}: ${b.val}`);
    const data = breakdowns.map(b => (b.sim * 100).toFixed(0));
    const bgColors = breakdowns.map(b => {
        const opacity = b.peso > 0.7 ? '0.8' : (b.peso > 0.4 ? '0.6' : '0.4');
        return `rgba(26, 115, 232, ${opacity})`;
    });

    const maxVal = Math.max(...data.map(v => parseFloat(v)));
    const buffer = 10;
    const dynamicMax = Math.ceil((maxVal + buffer) / 10) * 10;

    if (window.objectRadarChartInstance) {
        window.objectRadarChartInstance.destroy();
    }

    window.objectRadarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Contributo %',
                data: data,
                backgroundColor: 'rgba(26, 115, 232, 0.1)',
                borderColor: 'rgba(26, 115, 232, 0.8)',
                pointBackgroundColor: bgColors,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(26, 115, 232, 1)',
                borderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    suggestedMin: 0,
                    suggestedMax: dynamicMax,
                    ticks: {
                        stepSize: 20,
                        backdropColor: 'transparent',
                        color: '#5f6368'
                    },
                    pointLabels: {
                        font: { size: 11 },
                        color: '#202124'
                    },
                    grid: { 
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const b = breakdowns[context.dataIndex];
                            const rarity = b.peso > 0.7 ? '🌟 raro' : (b.peso > 0.4 ? '⭐ medio' : '');
                            const tipo = b.attr === 'TRIPLA' ? '🧩 tripla' : '';
                            return `${context.dataset.label}: ${context.raw}% ${rarity} ${tipo}`;
                        },
                        afterLabel: function(context) {
                            const b = breakdowns[context.dataIndex];
                            return `Peso: ${b.peso.toFixed(2)}`;
                        }
                    },
                    bodyFont: { size: 12 },
                    titleFont: { size: 14, weight: 'bold' },
                    padding: 10,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    cornerRadius: 4,
                    displayColors: false
                }
            },
            elements: {
                line: { tension: 0.1 }
            }
        }
    });
}