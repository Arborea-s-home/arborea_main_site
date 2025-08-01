export function showInstrumentPopup(instrumentName, breakdowns, funzione = '') {
    let popup = document.getElementById('instrument-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'instrument-popup';
        popup.style.position = 'fixed';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.backgroundColor = 'white';
        popup.style.padding = '20px';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 0 20px rgba(0,0,0,0.3)';
        popup.style.zIndex = '10001';
        popup.style.maxWidth = '80%';
        popup.style.maxHeight = '80vh';
        popup.style.overflow = 'auto';
        popup.style.fontFamily = '"Segoe UI", Roboto, sans-serif';
        document.body.appendChild(popup);
    }

    popup.innerHTML = `
        <div style="text-align: right;">
            <button onclick="document.getElementById('instrument-popup').remove()" 
                    style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">
                ✖
            </button>
        </div>
        <h5 style="color: #2e384d; margin-top: 0; font-size: 1.2rem;">
            ${instrumentName}${funzione ? ' <span style="font-weight: normal; font-size: 0.9em; color: #6c7789;">(' + funzione + ')</span>' : ''}
        </h5>
        <div class="chart-container" style="width: 100%; height: 400px;">
            <canvas id="popupChart"></canvas>
        </div>
    `;

    setTimeout(() => {
        renderInstrumentChart(breakdowns);
    }, 50);
}

export function renderInstrumentChart(breakdowns) {
    const ctx = document.getElementById('popupChart').getContext('2d');

    const labels = breakdowns.map(b => `${b.attr}: ${b.val}`);
    const data = breakdowns.map(b => (b.sim * 100).toFixed(0));
    const bgColors = breakdowns.map(b => {
        const opacity = b.peso > 0.7 ? '0.8' : (b.peso > 0.4 ? '0.6' : '0.4');
        return `rgba(74, 109, 167, ${opacity})`; // Colore azzurro
    });

    const maxVal = Math.max(...data.map(v => parseFloat(v)));
    const buffer = 10;
    const dynamicMax = Math.ceil((maxVal + buffer) / 10) * 10;

    if (window.popupChartInstance) {
        window.popupChartInstance.destroy();
    }

    window.popupChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Similarità %',
                data: data,
                backgroundColor: 'rgba(74, 109, 167, 0.2)',
                borderColor: 'rgba(74, 109, 167, 0.8)',
                pointBackgroundColor: bgColors,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(74, 109, 167, 1)',
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
                        backdropColor: 'transparent'
                    },
                    pointLabels: {
                        font: {
                            size: 11,
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                        },
                        color: '#555'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
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
                            const label = b.attr === 'TRIPLA'
                                ? `Combinazione: ${b.val}`
                                : `Attributo: ${b.attr}\nValore: ${b.val}`;
                            return `${label}\nPeso: ${b.peso.toFixed(2)}`;
                        }
                    },
                    bodyFont: {
                        size: 12
                    },
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    padding: 10,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    cornerRadius: 4,
                    displayColors: false
                }
            },
            elements: {
                line: {
                    tension: 0.1
                }
            }
        }
    });
}