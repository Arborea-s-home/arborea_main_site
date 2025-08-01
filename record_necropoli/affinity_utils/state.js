export function createInitialState() {
    return {
        active: false,
        customizationOpen: false,
        weights: {
            strumento: 1,
            funzione: 1,
            funzione_specifica: 1,
            materiale: 1,
            materiale_specifico: 1,
            decoration_theme: 1
        },
        tripleAttributes: ["funzione", "materiale", "decoration_theme"],
        currentResults: null,
        currentFeature: null,
        currentTombe: null,

        toggleAffinityMode: function() {
            this.active = !this.active;
            const affinityResults = document.getElementById('affinity-results');

            if (this.active) {
                affinityResults.classList.remove('hidden');
                alert("🔗 You are now in Affinity Mode. Click on any tomb to start.");
            } else {
                affinityResults.classList.add('hidden');
                alert("❌ You are now on Standard Mode.");
            }
            return this.active;
        },

        toggleCustomization: function() {
            this.customizationOpen = !this.customizationOpen;
            if (this.customizationOpen && window.__AFFINITY_API__) {
                this.weights = { ...window.__AFFINITY_API__.getCurrentWeights() };
                this.tripleAttributes = [ ...window.__AFFINITY_API__.getCurrentTriple() ];
            }
            this.updateUI();
        },

        resetCustomization: function() {
            if (window.__AFFINITY_API__) {
                window.__AFFINITY_API__.resetToDefaults();
                this.weights = {
                    strumento: 1,
                    funzione: 1,
                    funzione_specifica: 1,
                    materiale: 1,
                    materiale_specifico: 1,
                    decoration_theme: 1
                };
                this.tripleAttributes = ["funzione", "materiale", "decoration_theme"];
                alert("Customization reset to defaults!");
                this.updateUI();
            }
        },

        applyCustomization: function() {
            if (window.__AFFINITY_API__) {
                const uniqueTriple = [...new Set(this.tripleAttributes)];
                if (uniqueTriple.length !== 3) {
                    alert("Please select exactly 3 unique attributes for the triple!");
                    return;
                }

                window.__AFFINITY_API__.updateWeights(this.weights);
                window.__AFFINITY_API__.updateTriple(uniqueTriple);
                this.customizationOpen = false;
                alert("Customization applied successfully!");
                
                // Ricalcola affinità in tempo reale
                if (window.__AFFINITY_API__ && this.currentFeature && this.currentTombe) {
                    const newResults = window.__AFFINITY_API__.computeAffinity(this.currentFeature, this.currentTombe);
                    this.displayResults(newResults, this.currentFeature, this.currentTombe);
                
                    // Aggiorna la mappa
                    if (typeof window.__COLOR_TOMBE__ === 'function') {
                        window.__COLOR_TOMBE__(this.currentFeature);
                    }
                }
            }
        }
    };
}
