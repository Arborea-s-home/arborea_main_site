export function calcolaAffinitaTombe(contesto, oggetti) {
  // Default weights for attributes
  const defaultWeights = {
      "strumento": 1,
      "funzione": 1,
      "funzione_specifica": 1,
      "materiale": 1,
      "materiale_specifico": 1,
      "decoration_theme": 1
  };

  // Default triple attributes
  let attributiTripla = ["funzione", "materiale", "decoration_theme"];
  
  // User customization
  let userWeights = {...defaultWeights};
  let userTriple = [...attributiTripla];
  
  // Expose functions to update weights and triple
  const updateWeights = (newWeights) => {
      userWeights = {...defaultWeights, ...newWeights};
  };
  
  const updateTriple = (newTriple) => {
      if (newTriple.length === 3) {
          userTriple = [...newTriple];
      }
  };

  const attributiOggetto = Object.keys(defaultWeights);

  // 1. Frequenze globali per pesatura
  const contaValori = {};
  oggetti.features.forEach(o => {
      attributiOggetto.forEach(attr => {
          const val = o.properties[attr];
          if (val) {
              val.split(',').map(v => v.trim()).forEach(valSingolo => {
                  const chiave = `${attr}::${valSingolo}`;
                  contaValori[chiave] = (contaValori[chiave] || 0) + 1;
              });
          }
      });
  });

  // Frequenze delle combinazioni triple
  const contaTriple = {};
  oggetti.features.forEach(o => {
      const triple = userTriple.map(attr =>
          (o.properties[attr] || "").split(',').map(v => v.trim()).filter(Boolean)
      );

      // prodotto cartesiano delle 3 liste
      triple[0].forEach(v1 => {
          triple[1].forEach(v2 => {
              triple[2].forEach(v3 => {
                  const key = `${v1}::${v2}::${v3}`;
                  contaTriple[key] = (contaTriple[key] || 0) + 1;
              });
          });
      });
  });

  const peso = {};
  for (const chiave in contaValori) {
      const [attr] = chiave.split('::');
      const rarityWeight = 1 / Math.sqrt(contaValori[chiave]);
      peso[chiave] = rarityWeight * (userWeights[attr] || 1);
  }

  const pesoTriple = {};
  for (const chiave in contaTriple) {
      pesoTriple[chiave] = 1 / Math.sqrt(contaTriple[chiave]);
  }

  // 2. Oggetti per tomba
  const oggettiPerTomba = {};
  oggetti.features.forEach(o => {
    const id = o.properties.tomba;
    if (!oggettiPerTomba[id]) oggettiPerTomba[id] = [];
    oggettiPerTomba[id].push(o.properties);
  });

  // 3. Similarità tra due oggetti
  function similaritaOggetto(o1, o2, peso = {}) {
    const breakdown = {};
    let total = 0;
    let count = 0;

    attributiOggetto.forEach(attr => {
        const a1 = (o1[attr] || "").split(',').map(s => s.trim()).filter(Boolean);
        const a2 = (o2[attr] || "").split(',').map(s => s.trim()).filter(Boolean);

        if (a1.length === 0 || a2.length === 0) {
            breakdown[attr] = null;
            return;
        }

        let matchWeight = 0;
        a1.forEach(val => {
            if (a2.includes(val)) {
                const p = peso[`${attr}::${val}`] || 1;
                matchWeight += p;
            }
        });

        const denom = Math.max(a1.length, a2.length);
        const sim = denom > 0 ? matchWeight / denom : 0;

        breakdown[attr] = sim;
        total += sim * (userWeights[attr] || 1); // Apply user weight here
        count += 1;
    });

    const triple1 = userTriple.map(attr =>
        (o1[attr] || "").split(',').map(v => v.trim()).filter(Boolean)
    );
    const triple2 = userTriple.map(attr =>
        (o2[attr] || "").split(',').map(v => v.trim()).filter(Boolean)
    );
    
    let bonus = 0;
    triple1[0].forEach(v1 => {
        triple1[1].forEach(v2 => {
            triple1[2].forEach(v3 => {
                const key = `${v1}::${v2}::${v3}`;
                if (
                    triple2[0].includes(v1) &&
                    triple2[1].includes(v2) &&
                    triple2[2].includes(v3)
                ) {
                    bonus += pesoTriple[key] || 0;
                }
            });
        });
    });
    
    const valore = count > 0 ? (total + bonus) / count : 0;
    return { valore, breakdown };
}

  // 4. Matching 1:1 tra oggetti
  function affinitaOggetti(lista1, lista2, peso = {}) {
    const n1 = lista1.length;
    const n2 = lista2.length;

    const simMatrix = [];
    for (let i = 0; i < n1; i++) {
      simMatrix[i] = [];
      for (let j = 0; j < n2; j++) {
        const simData = similaritaOggetto(lista1[i], lista2[j], peso);
        simMatrix[i][j] = {
          valore: simData.valore,
          breakdown: simData.breakdown,
          base: lista1[i],
          confronto: lista2[j],
          i, j
        };
      }
    }

    const matched1 = new Set();
    const matched2 = new Set();
    const assignments = [];

    while (matched1.size < n1 && matched2.size < n2) {
      let best = null;

      for (let i = 0; i < n1; i++) {
        if (matched1.has(i)) continue;
        for (let j = 0; j < n2; j++) {
          if (matched2.has(j)) continue;
          const sim = simMatrix[i][j];
          if (!best || sim.valore > best.valore) {
            best = sim;
          }
        }
      }

      if (!best || best.valore === 0) break;

      matched1.add(best.i);
      matched2.add(best.j);
      assignments.push({
        base: best.base,
        confronto: best.confronto,
        sim: best.valore,
        breakdown: best.breakdown
      });
    }

    for (let i = 0; i < n1; i++) {
      if (!matched1.has(i)) {
        assignments.push({
          base: lista1[i],
          confronto: null,
          sim: 0,
          breakdown: null
        });
      }
    }

    for (let j = 0; j < n2; j++) {
      if (!matched2.has(j)) {
        assignments.push({
          base: null,
          confronto: lista2[j],
          sim: 0,
          breakdown: null
        });
      }
    }

    const valore = assignments.reduce((acc, c) => acc + c.sim, 0) / assignments.length;

    return { valore, confronti: assignments };
  }

  // 5. Similarità statica per attributi non oggettuali
  const freqStatiche = { tipologia: {} };
  contesto.features.forEach(c => {
    const val = c.properties["tipologia"];
    if (val) freqStatiche["tipologia"][val] = (freqStatiche["tipologia"][val] || 0) + 1;
  });

  function similaritaStatica(c1, c2) {
    let sim = 0;
    const v1 = c1.properties["tipologia"];
    const v2 = c2.properties["tipologia"];
    if (v1 && v2 && v1 === v2) {
      sim += 1 / Math.sqrt(freqStatiche["tipologia"][v1] || 1);
    }
    return sim;
  }

  if (typeof window !== 'undefined') {
    window.__GLOBAL_PESI__ = peso;
  
    window.__AFFINITY_API__ = {
        updateWeights,
        updateTriple,
        getCurrentWeights: () => userWeights,
        getCurrentTriple: () => userTriple,
        resetToDefaults: () => {
            userWeights = { ...defaultWeights };
            userTriple = [...attributiTripla];
        },
        computeAffinity: (baseFeature, allTombe) => {
            const baseFid = baseFeature.properties.fid;
            return window.__AFFINITY_COMPUTE__(baseFid);
        }
    };
  }

  // 6. Calcolo finale rispetto a una tomba selezionata
  const computeFn = function (tombaFid) {
    // 🔁 Ricalcola i pesi aggiornati in base ai pesi/triple dell’utente
    const peso = {};
    for (const chiave in contaValori) {
        const [attr] = chiave.split('::');
        const rarityWeight = 1 / Math.sqrt(contaValori[chiave]);
        peso[chiave] = rarityWeight * (userWeights[attr] || 1);
    }
  
    const pesoTriple = {};
    for (const chiave in contaTriple) {
        pesoTriple[chiave] = 1 / Math.sqrt(contaTriple[chiave]);
    }
  
    console.log("📊 Pesi attuali:", userWeights);
    console.log("🔁 Tripla attuale:", userTriple);
    console.log("🧮 Pesi effettivi:", peso);
  
    if (typeof window !== 'undefined') {
      window.__GLOBAL_PESI__ = peso;
    }
  
    const fidToName = {};
    contesto.features.forEach(f => {
      fidToName[f.properties.fid] = f.properties.name;
    });
  
    const base = contesto.features.find(f => f.properties.fid === tombaFid);
    const baseName = fidToName[tombaFid];
    const oggBase = oggettiPerTomba[baseName] || [];
  
    return contesto.features
      .filter(f => f.properties.fid !== tombaFid)
      .map(f => {
        const fid = f.properties.fid;
        const otherName = fidToName[fid];
        const oggAltra = oggettiPerTomba[otherName] || [];
  
        const { valore: simCorredo, confronti } = affinitaOggetti(oggBase, oggAltra, peso);
        const simStatica = similaritaStatica(base, f);
  
        return {
          fid: fid,
          affinita: simCorredo + simStatica,
          confronti: confronti
        };
      });
  };
  
  // 🔁 Esponi la funzione globalmente
  if (typeof window !== 'undefined') {
    window.__AFFINITY_COMPUTE__ = computeFn;
  }
  
  // ✅ Restituisci la funzione al chiamante
  return computeFn;
  
}
