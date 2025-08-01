import { showAllAffinityCards } from './popup_cards.js';

export function setupEventListeners(dashboard) {
    // Toggle pannello personalizzazione
    document.getElementById('toggle-customization')?.addEventListener('click', () => {
        dashboard.toggleCustomization();
    });

    // Pulsanti del pannello personalizzazione
    document.getElementById('reset-customization')?.addEventListener('click', () => {
        dashboard.resetCustomization();
    });

    document.getElementById('apply-customization')?.addEventListener('click', () => {
        dashboard.applyCustomization();
    });

    document.getElementById('cancel-customization')?.addEventListener('click', () => {
        dashboard.customizationOpen = false;
        dashboard.updateUI();
    });

    // Sliders per i pesi
    Object.keys(dashboard.weights).forEach(attr => {
        const slider = document.getElementById(`weight-${attr}`);
        if (slider) {
            slider.addEventListener('input', (e) => {
                dashboard.weights[attr] = parseFloat(e.target.value);
                e.target.nextElementSibling.textContent = dashboard.weights[attr].toFixed(1);
            });
        }
    });

    // Select per la tripla
    [0, 1, 2].forEach(i => {
        const select = document.getElementById(`triple-${i}`);
        if (select) {
            select.addEventListener('change', (e) => {
                dashboard.tripleAttributes[i] = e.target.value;
            });
        }
    });

    // Click su strumenti per popup dettagliato
    document.querySelectorAll('.clickable-instrument').forEach(elem => {
        elem.addEventListener('click', () => {
            const nome = elem.dataset.instrument;
            const funzione = elem.dataset.funzione;
            const breakdowns = JSON.parse(elem.dataset.breakdown);
            dashboard.showInstrumentPopup(nome, breakdowns, funzione);
        });
    });

    //pop-up schede

    document.getElementById('open-all-affinities')?.addEventListener('click', () => {
        showAllAffinityCards(dashboard);
    });
    
}