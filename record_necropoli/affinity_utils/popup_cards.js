import { showInstrumentPopup } from './affinity_chart.js';

export function showAllAffinityCards(dashboard) {
    if (document.getElementById('popup-all-cards')) return;

    const popup = document.createElement('div');
    popup.id = 'popup-all-cards';
    popup.className = 'popup-all-cards';
    popup.style.zIndex = '10000';

    const sortedResults = dashboard.currentResults
        .slice()
        .sort((a, b) => b.affinita - a.affinita);
    const resultsPerPage = 8;
    let currentPage = 1;
    const totalPages = Math.ceil(sortedResults.length / resultsPerPage);
    const maxAffinity = Math.max(...sortedResults.map(r => r.affinita));

    const renderPage = (page = 1) => {
        const start = (page - 1) * resultsPerPage;
        const end = start + resultsPerPage;
        const items = sortedResults.slice(start, end);

        const cardsHtml = items.map(result => renderAffinityCard(result, dashboard, maxAffinity)).join('');
        const pagination = `
            <div class="popup-pagination">
                ${Array.from({ length: totalPages }, (_, i) => `
                    <button class="popup-page-btn ${i + 1 === page ? 'active' : ''}" data-page="${i + 1}">
                        ${i + 1}
                    </button>
                `).join('')}
            </div>
        `;

        return `<div class="values-grid">${cardsHtml}</div>${pagination}`;
    };

    popup.innerHTML = `
        <div class="popup-all-header">
            <h2>Tombe affini</h2>
            <div class="search-box">
                <input type="text" id="popup-cards-filter" placeholder="Filtra per nome...">
            </div>
            <button id="close-popup-cards" class="back-button">&times;</button>
        </div>
        <div id="popup-cards-content">${renderPage(currentPage)}</div>
    `;

    document.body.appendChild(popup);

    // Close
    document.getElementById('close-popup-cards').addEventListener('click', () => popup.remove());

    // Filter
    document.getElementById('popup-cards-filter').addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        document.querySelectorAll('.affinity-item').forEach(item => {
            const name = item.querySelector('.affinity-name')?.textContent?.toLowerCase() || '';
            item.style.display = name.includes(val) ? 'block' : 'none';
        });
    });

    // Pagination and instrument clicks
    popup.addEventListener('click', e => {
        // Handle instrument clicks
        const instrumentEl = e.target.closest('.clickable-instrument');
        if (instrumentEl) {
            const instrumentName = instrumentEl.dataset.instrument;
            const breakdowns = JSON.parse(instrumentEl.dataset.breakdown);
            const funzione = instrumentEl.dataset.funzione || '';
            showInstrumentPopup(instrumentName, breakdowns, funzione);
            return;
        }
        
        // Handle pagination
        if (e.target.classList.contains('popup-page-btn')) {
            e.preventDefault();
            currentPage = parseInt(e.target.dataset.page);
            document.getElementById('popup-cards-content').innerHTML = renderPage(currentPage);
        }
    });
}

function renderAffinityCard(result, dashboard, maxAffinity) {
    const feature = dashboard.currentTombe.find(f => f.properties.fid === result.fid);
    if (!feature) return '';

    const nomeTomba = feature.properties.name;
    const percentage = ((result.affinita / maxAffinity) * 100).toFixed(0);
    const actual = (result.affinita * 100).toFixed(1);

    let html = `
        <div class="affinity-item value-card" data-fid="${result.fid}">
            <div class="affinity-header">
                <h3 class="affinity-name">${nomeTomba}</h3>
                <div class="affinity-value">${percentage}%</div>
            </div>
            <div class="affinity-details">
                <div class="meta">
                    <span class="affinity-raw">Valore effettivo: ${actual}%</span>
                </div>
                <div class="affinity-bar" style="width: 100%; height: 4px; background: #e0e0e0; margin: 10px 0;">
                    <div class="affinity-bar-progress" style="width: ${percentage}%; height: 100%; background: #4a6da7;"></div>
                </div>
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
                    if (simAttr > 0) strumenti[nomeStrumento].count += 1;

                    strumenti[nomeStrumento].breakdowns.push({
                        attr, val, sim: simAttr, peso: pesoVal
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

    strumentiArray.forEach(({ nome, normalizedScore, breakdowns, funzione }) => {
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

        function getHeatColor(score) {
            if (score >= 90) return '#800000';
            if (score >= 80) return '#cc0000';
            if (score >= 70) return '#ff3300';
            if (score >= 60) return '#ff6600';
            if (score >= 50) return '#ff9900';
            if (score >= 40) return '#ffcc00';
            if (score >= 30) return '#e1ad01';
            if (score >= 20) return '#99ccff';
            if (score >= 10) return '#3399ff';
            if (score >= 1)  return '#0066cc';
            return '#999999';
        }

        let color = getHeatColor(normalizedScore);

        html += `<li class="clickable-instrument"
                     data-instrument="${nome}"
                     data-breakdown='${JSON.stringify(breakdowns)}'
                     data-funzione="${funzione || ''}">
                     <strong>${nome}</strong> → ${confrontoStr} 
                     <strong style="color:${color}">${normalizedScore.toFixed(1)}</strong>
                 </li>`;
    });

    const strumentiPresenti = new Set(Object.keys(strumenti));

    result.confronti.map(c => c.base).filter(Boolean).forEach(o => {
        (o.strumento || "").split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
            if (!strumentiPresenti.has(s)) {
                html += `<li>${s} (${dashboard.currentFeature.properties.name}) → 0 <em>(no match)</em></li>`;
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
    return html;
}