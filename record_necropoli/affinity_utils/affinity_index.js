import { createInitialState } from './state.js';
import { renderDashboardUI } from './ui.js';
import { setupEventListeners } from './events.js';
import { showInstrumentPopup } from './affinity_chart.js';

export function initAffinityDashboard() {
    const dashboard = createInitialState();

    dashboard.updateUI = function () {
        if (this.currentResults && this.currentFeature && this.currentTombe) {
            renderDashboardUI(this);
            setupEventListeners(this);
        }
    };

    dashboard.displayResults = function(results, baseFeature, tombeDelSito) {
        this.currentResults = results;
        this.currentFeature = baseFeature;
        this.currentTombe = tombeDelSito;
        this.updateUI();
    };

    dashboard.hideUI = function () {
        const container = document.getElementById('affinity-results');
        if (container) {
            container.classList.add('hidden');
            container.innerHTML = ''; // se vuoi anche svuotare il contenuto
        }
    };

    dashboard.showInstrumentPopup = showInstrumentPopup.bind(dashboard);

    window.__affinityDashboard = dashboard;
    return dashboard;
}