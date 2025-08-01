export function renderDashboardUI(dashboard) {
    const { currentResults, currentFeature, currentTombe, customizationOpen, weights, tripleAttributes } = dashboard;

    const maxAffinity = Math.max(...currentResults.map(r => r.affinita));
    const sortedResults = currentResults.slice().sort((a, b) => b.affinita - a.affinita);

    let html = `
<div class="header-row customize-toggle-row">
  <div class="customize-label">Customize</div>
  <label class="switch blue-toggle">
    <input type="checkbox" id="toggle-customization-ui" ${customizationOpen ? 'checked' : ''}>
    <span class="slider round"></span>
  </label>
</div>

<!-- PANEL CUSTOMIZE -->
<div class="affinity-customization-panel ${customizationOpen ? 'open' : 'closed'}">
  <div class="customization-header">
    <h4>Algorithm Customization</h4>
    <div class="customization-subtitle">Adjust weights and attributes to refine similarity results</div>
  </div>

  <div class="customization-sections">
    <div class="customization-section">
      <div class="section-header">
        <svg class="section-icon" viewBox="0 0 24 24">
          <path d="M12,2L4,5V11.09C4,16.14 7.41,20.85 12,22C16.59,20.85 20,16.14 20,11.09V5L12,2M11,15H13V17H11V15M11,7H13V13H11V7"/>
        </svg>
        <h5>Attribute Weights</h5>
      </div>
      <div class="weight-controls">
        ${Object.entries(weights).map(([attr, value]) => `
          <div class="weight-control">
            <label class="weight-label">${attr.replace(/_/g, ' ')}</label>
            <div class="weight-slider-container">
              <input type="range" min="0" max="2" step="0.1" value="${value}" 
                     id="weight-${attr}" class="weight-slider">
              <output class="weight-value">${value.toFixed(1)}</output>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="customization-section">
      <div class="section-header">
        <svg class="section-icon" viewBox="0 0 24 24">
          <path d="M17,13H13V17H11V13H7V11H11V7H13V11H17M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
        </svg>
        <h5>Triple Attributes</h5>
      </div>
      <div class="triple-controls">
        ${[0, 1, 2].map(i => `
          <div class="triple-control">
            <label class="triple-label">Attribute ${i + 1}</label>
            <select id="triple-${i}" class="triple-select">
              ${Object.keys(weights).map(attr => `
                <option value="${attr}" ${tripleAttributes[i] === attr ? 'selected' : ''}>
                  ${attr.replace(/_/g, ' ')}
                </option>
              `).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <div class="customization-actions">
    <div class="action-block">
      <button id="reset-customization" class="action-btn secondary">
        <svg viewBox="0 0 24 24" class="btn-icon">
          <path d="M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6Z"/>
        </svg>
        Reset
      </button>
    </div>
    <div class="action-block grouped-buttons">
      <button id="cancel-customization" class="action-btn secondary">
        <svg viewBox="0 0 24 24" class="btn-icon">
          <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
        </svg>
        Close
      </button>
      <button id="apply-customization" class="action-btn primary">
        <svg viewBox="0 0 24 24" class="btn-icon">
          <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/>
        </svg>
        Apply
      </button>
    </div>
  </div>
</div>

<!-- INTESTAZIONE SIMILARITÀ -->
<div class="affinity-section-header">
  <hr class="customize-separator"/>
<div class="affinity-title-box">
  <div class="affinity-title">
    <h4>Similarity with ${currentFeature.properties.name || 'selected tomb'}</h4>
    <div class="affinity-subtitle">Top matching tombs based on current settings</div>
  </div>
</div>
</div>

<!-- GRAFICO -->
<div class="graph-preview-section">
  <div class="graph-header">
    <h5>Cluster Overview</h5>
    <div class="graph-subtitle">Distribution of similarity scores</div>
  </div>
  <div class="graph-preview-container">
    <canvas id="scatter-preview" width="250" height="150"></canvas>
  </div>
  <button class="show-graph-btn" id="show-graph-btn">
    <svg viewBox="0 0 24 24" class="btn-icon">
      <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
    </svg>
    View Full Graph
  </button>
</div>

<!-- LISTA AFFINITÀ -->
<div class="affinity-list">
    `;

    // pop-up per il grafico (inizialmente nascosto)
    html += `
        <div id="graph-popup" class="graph-popup" style="display: none;">
            <div class="graph-popup-content">
                <span class="close-popup">&times;</span>
                <h3>Scatterplot</h3>
                <div class="graph-container" id="scatter-plot-container"></div>
                <div class="graph-legend">
                    <div><span class="legend-color cluster-1"></span> Cluster 1</div>
                    <div><span class="legend-color cluster-2"></span> Cluster 2</div>
                    <div><span class="legend-color cluster-3"></span> Cluster 3</div>
                    <div><span class="legend-color other"></span> Other tombs</div>
                </div>
            </div>
        </div>
    `;
    // Rimuovi classe hidden per mostrare il blocco
    document.getElementById('affinity-results')?.classList.remove('hidden');

    // Mini grafico: cluster preview
    setTimeout(() => {
        try {
          const miniCtx = document.getElementById("scatter-preview");
          if (!miniCtx) return;
      
          const miniData = dashboard.currentResults.map(result => {
            const feature = dashboard.currentTombe.find(f => f.properties.fid === result.fid);
            return {
              x: result.affinita,
              y: Math.random() * 100,
              cluster: determineCluster(result),
              name: feature?.properties.name || "?"
            };
          });
      
          new Chart(miniCtx, {
            type: 'scatter',
            data: {
              datasets: [{
                label: 'Cluster',
                data: miniData,
                backgroundColor: miniData.map(d => {
                  switch (d.cluster) {
                    case 1: return 'rgba(54, 162, 235, 0.7)';
                    case 2: return 'rgba(255, 206, 86, 0.7)';
                    case 3: return 'rgba(75, 192, 192, 0.7)';
                    default: return 'rgba(153, 102, 255, 0.5)';
                  }
                }),
                pointRadius: 3
              }]
            },
            options: {
              responsive: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.raw.name}: ${ctx.raw.x.toFixed(2)}`
                  }
                }
              },
              scales: {
                x: { title: { display: false } },
                y: { title: { display: false } }
              }
            }
          });
        } catch (e) {
          console.warn("Errore nel rendering del grafico preview:", e);
        }
      }, 0);      

    sortedResults.slice(0, 5).forEach((result, index) => {
        const feature = currentTombe.find(f => f.properties.fid === result.fid);
        if (!feature) {
            console.warn(`Feature with fid ${result.fid} not found in currentTombe array`);
            return;
        }

        const nomeTomba = feature.properties.name;
        const percentage = ((result.affinita / maxAffinity) * 100).toFixed(0);
        const actual = (result.affinita * 100).toFixed(1);

        html += `
            <div class="affinity-item" data-fid="${result.fid}">
                <div class="affinity-header">
                    <span class="affinity-name">${nomeTomba}</span>
                    <span class="affinity-value">${percentage}%</span>
                    <span class="affinity-raw">(${actual}%)</span>
                </div>
                <div class="affinity-bar" style="width: ${percentage}%"></div>
                <div class="affinity-details">
                    <ul class="attribute-breakdown">
        `;
        const strumenti = {};
        result.confronti.forEach(conf => {
            if (!conf.base || !conf.confronto) return;

            const nomeStrumento = (conf.base.strumento || "").trim();
            if (!nomeStrumento) return;

            if (!strumenti[nomeStrumento]) {
                strumenti[nomeStrumento] = {
                    score: 0,
                    pesi: [],
                    count: 0,
                    breakdowns: [],
                    funzione: conf.base.funzione || null
                };
            }

            if (conf.breakdown) {
                for (const attr in conf.breakdown) {
                    const valori = (conf.base[attr] || "").split(',').map(v => v.trim()).filter(Boolean);
                    valori.forEach(val => {
                        const chiave = `${attr}::${val}`;
                        const pesoVal = window.__GLOBAL_PESI__?.[chiave] || 0;
                        const simAttr = conf.breakdown[attr] || 0;
                        const contributo = simAttr * pesoVal;
            
                        strumenti[nomeStrumento].score += contributo;
                        strumenti[nomeStrumento].pesi.push(pesoVal);
                        
                        if (simAttr > 0) {
                            strumenti[nomeStrumento].count += 1; // ✅ conta solo se sim > 0
                        }
            
                        strumenti[nomeStrumento].breakdowns.push({
                            attr,
                            val,
                            sim: simAttr,
                            peso: pesoVal
                        });
                    });
                }
            }            

            const tripleAttr = window.__AFFINITY_API__?.getCurrentTriple() || ["funzione", "materiale", "decoration_theme"];
            const v1 = tripleAttr.map(a => (conf.base[a] || "").split(',').map(s => s.trim()).filter(Boolean));
            const v2 = tripleAttr.map(a => (conf.confronto[a] || "").split(',').map(s => s.trim()).filter(Boolean));

            v1[0].forEach(a1 => {
                v1[1].forEach(a2 => {
                    v1[2].forEach(a3 => {
                        const key = `${a1}::${a2}::${a3}`;
                        const match = v2[0].includes(a1) && v2[1].includes(a2) && v2[2].includes(a3);
                        if (match) {
                            const pesoTriple = window.__GLOBAL_PESI__?.[key] || 0;
                            strumenti[nomeStrumento].score += pesoTriple;
                            strumenti[nomeStrumento].pesi.push(pesoTriple);
                            strumenti[nomeStrumento].count += 1;
                            strumenti[nomeStrumento].breakdowns.push({
                                attr: 'TRIPLA',
                                val: key,
                                sim: 1,
                                peso: pesoTriple
                            });
                        }
                    });
                });
            });
        });

        let strumentiArray = Object.entries(strumenti).map(([nome, data]) => {
            const maxContributoPossibile = data.pesi.reduce((a, b) => a + b, 0) || 1;
            const normalizedInternal = data.score / maxContributoPossibile;
            const avgScore = normalizedInternal * 100;
            const avgPeso = data.pesi.length > 0
                ? data.pesi.reduce((a, b) => a + b, 0) / data.pesi.length
                : 0;
        
            let significance = 'low';
            if (avgPeso > 0.7) significance = 'high';
            else if (avgPeso > 0.45) significance = 'medium';
        
            return {
                nome,
                avgScore,
                significance,
                breakdowns: data.breakdowns,
                funzione: data.funzione,
                score: data.score
            };
        });
                
        const maxScoreGlobale = Math.max(...strumentiArray.map(s => s.score || 0), 1);

        strumentiArray = strumentiArray.map(s => ({
            ...s,
            normalizedScore: (s.score / maxScoreGlobale) * 100
        }));

        strumentiArray.sort((a, b) => {
            const rank = { high: 3, medium: 2, low: 1 };
            if (rank[b.significance] !== rank[a.significance]) {
                return rank[b.significance] - rank[a.significance];
            }
            return b.avgScore - a.avgScore;
        });

        strumentiArray.forEach(({ nome, normalizedScore, breakdowns }) => {
            const strumentiConfronto = new Set();
        
            breakdowns.forEach(b => {
                if (b.attr === 'TRIPLA') return;
                const match = result.confronti.find(c => 
                    c.base?.strumento?.includes(nome) && 
                    c.confronto?.strumento
                );
                if (match) {
                    match.confronto.strumento.split(',').forEach(s => strumentiConfronto.add(s.trim()));
                }
            });
        
            const confrontoStr = [...strumentiConfronto].join(', ') || '?';
        
            // Colore per intensità
            function getHeatColor(score) {
                if (score >= 90) return '#800000'; // marrone scuro
                if (score >= 80) return '#cc0000'; // rosso scuro
                if (score >= 70) return '#ff3300'; // rosso
                if (score >= 60) return '#ff6600'; // arancio scuro
                if (score >= 50) return '#ff9900'; // arancio
                if (score >= 40) return '#ffcc00'; // giallo-arancio
                if (score >= 30) return '#e1ad01'; // giallo
                if (score >= 20) return '#99ccff'; // azzurro chiaro
                if (score >= 10) return '#3399ff'; // blu chiaro
                if (score >= 1)  return '#0066cc'; // blu scuro
                return '#999999'; // grigio
            }
            
            let color = getHeatColor(normalizedScore);
            
            // Etichetta della tomba base in grassetto
            html += `<li class="clickable-instrument"
                         data-instrument="${nome}"
                         data-breakdown='${JSON.stringify(breakdowns)}'>
                         <strong>${nome}</strong> → ${confrontoStr} 
                         <strong style="color:${color}">${normalizedScore.toFixed(1)}</strong>
                     </li>`;
        });               

        const strumentiPresenti = new Set(Object.keys(strumenti));

        result.confronti.map(c => c.base).filter(Boolean).forEach(o => {
            (o.strumento || "").split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
                if (!strumentiPresenti.has(s)) {
                    html += `<li>${s} (${currentFeature.properties.name}) → 0 <em>(no match)</em></li>`;
                }
            });
        });
        
        result.confronti.map(c => c.confronto).filter(Boolean).forEach(o => {
            (o.strumento || "").split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
                if (!strumentiPresenti.has(s)) {
                    html += `<li>${s} (${feature.properties.name}) → 0 <em>(no match)</em></li>`;
                }
            });
        });        

        html += `</ul></div></div>`;
    });

    html += '</div>';
    const container = document.getElementById('affinity-results');
    container.innerHTML = html;

    // Aggiungi gestione del click sul pulsante del grafico
    document.getElementById('show-graph-btn').addEventListener('click', () => {
        console.log('Mostra grafico clickato');
        showScatterPlot(dashboard);
    });

    // Aggiungi gestione della chiusura del popup
    document.querySelector('.close-popup').addEventListener('click', () => {
        document.getElementById('graph-popup').style.display = 'none';
    });

    // Chiudi il popup se si clicca fuori dal contenuto
    document.getElementById('graph-popup').addEventListener('click', (e) => {
        if (e.target === document.getElementById('graph-popup')) {
            document.getElementById('graph-popup').style.display = 'none';
        }
    });

    // Toggle custom  

    const toggleCustomization = document.getElementById('toggle-customization-ui');
    if (toggleCustomization) {
      toggleCustomization.addEventListener('change', (e) => {
        dashboard.customizationOpen = e.target.checked;
        dashboard.updateUI();
      });
    }
}

function showScatterPlot(dashboard) {
    console.log('Preparando il grafico a dispersione...');
    const { currentResults, currentFeature, currentTombe } = dashboard;
    
    try {
        // Estrai i dati per il grafico
        const data = currentResults.map(result => {
            const feature = currentTombe.find(f => f.properties.fid === result.fid);
            return {
                fid: result.fid,
                name: feature?.properties.name || 'Sconosciuto',
                affinita: result.affinita,
                x: result.affinita, // Potresti voler usare altre metriche per gli assi
                y: Math.random() * 100, // Placeholder - sostituisci con dati reali
                isSelected: result.fid === currentFeature.properties.fid,
                cluster: determineCluster(result) // Funzione per determinare il cluster
            };
        });

        console.log('Dati preparati per il grafico:', data);

        // Mostra il popup
        document.getElementById('graph-popup').style.display = 'block';

        // Crea il grafico usando Chart.js (assicurati di averlo incluso nel tuo progetto)
        const ctx = document.createElement('canvas');
        ctx.id = 'scatter-plot';
        const container = document.getElementById('scatter-plot-container');
        container.innerHTML = '';
        container.appendChild(ctx);

        new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Tomba selezionata',
                        data: data.filter(d => d.isSelected),
                        backgroundColor: 'rgba(255, 99, 132, 1)',
                        pointRadius: 10
                    },
                    {
                        label: 'Cluster 1',
                        data: data.filter(d => !d.isSelected && d.cluster === 1),
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        pointRadius: 7
                    },
                    {
                        label: 'Cluster 2',
                        data: data.filter(d => !d.isSelected && d.cluster === 2),
                        backgroundColor: 'rgba(255, 206, 86, 0.7)',
                        pointRadius: 7
                    },
                    {
                        label: 'Cluster 3',
                        data: data.filter(d => !d.isSelected && d.cluster === 3),
                        backgroundColor: 'rgba(75, 192, 192, 0.7)',
                        pointRadius: 7
                    },
                    {
                        label: 'Altre tombe',
                        data: data.filter(d => !d.isSelected && d.cluster === 0),
                        backgroundColor: 'rgba(153, 102, 255, 0.5)',
                        pointRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Affinità'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Metrica Y' // Sostituisci con una metrica significativa
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.raw.name}: ${context.raw.affinita.toFixed(2)}%`;
                            }
                        }
                    },
                    legend: {
                        display: false // Usiamo la nostra legenda personalizzata
                    }
                }
            }
        });

        console.log('Grafico creato con successo');
    } catch (error) {
        console.error('Errore nella creazione del grafico:', error);
        document.getElementById('scatter-plot-container').innerHTML = 
            '<p class="error-message">Si è verificato un errore nel generare il grafico.</p>';
    }
}

document.getElementById('affinity-results')?.classList.remove('hidden');

function determineCluster(result) {
    if (result.affinita > 0.3) return 1;
    if (result.affinita > 0.2) return 2;
    if (result.affinita > 0.1) return 3;
    return 0;
}