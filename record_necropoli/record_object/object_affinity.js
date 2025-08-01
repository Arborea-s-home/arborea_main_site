// object_affinity.js

const defaultWeights = {
  "strumento": 1,
  "funzione": 1,
  "funzione_specifica": 1,
  "materiale": 1,
  "materiale_specifico": 1,
  "decorazione_theme": 1
};

let userWeights = { ...defaultWeights };
let userTriple = ["funzione", "materiale", "decorazione_theme"];
let staticKey = "tipologia";
let contaValori = {};
let contaTriple = {};

export function updateWeights(newWeights) {
  userWeights = { ...newWeights };
  console.log("🔧 Weights aggiornati in object_affinity.js:", userWeights);
}

export function updateTriple(newTriple) {
  if (newTriple.length === 3) userTriple = [...newTriple];
}

export function setStaticKey(key) {
  staticKey = key;
}

export function getCurrentConfig() {
  return {
    weights: userWeights,
    triple: userTriple,
    staticKey
  };
}

export function calcolaAffinitaOggettiSingolo(oggettoBase, oggettiTotali) {
  const attributiOggetto = Object.keys(defaultWeights);

  // Frequenze singole
  contaValori = {};
  oggettiTotali.forEach(o => {
    attributiOggetto.forEach(attr => {
      const raw = o.properties[attr];
      if (!raw) return;
      raw.split(",").map(s => s.trim()).forEach(val => {
        const key = `${attr}::${val}`;
        contaValori[key] = (contaValori[key] || 0) + 1;
      });
    });
  });

  // Frequenze triple
  contaTriple = {};
  oggettiTotali.forEach(o => {
    const triple = userTriple.map(attr =>
      (o.properties[attr] || "").split(",").map(s => s.trim()).filter(Boolean)
    );
    if (triple.some(arr => arr.length === 0)) return;

    triple[0].forEach(v1 => {
      triple[1].forEach(v2 => {
        triple[2].forEach(v3 => {
          const key = `${v1}::${v2}::${v3}`;
          contaTriple[key] = (contaTriple[key] || 0) + 1;
        });
      });
    });
  });

  // Pesi singoli
  const peso = {};
  for (const key in contaValori) {
    const [attr] = key.split("::");
    peso[key] = (1 / Math.sqrt(contaValori[key])) * (userWeights[attr] || 1);
  }

  // Pesi triple
  const pesoTriple = {};
  for (const key in contaTriple) {
    pesoTriple[key] = 1 / Math.sqrt(contaTriple[key]);
  }

  // Matching statico (es. tipologia)
  function similaritaStatica(o1, o2) {
    if (!staticKey) return 0;
    const v1 = o1.properties[staticKey];
    const v2 = o2.properties[staticKey];
    if (v1 && v2 && v1 === v2) {
      return 1 / Math.sqrt(
        oggettiTotali.filter(o => o.properties[staticKey] === v1).length
      );
    }
    return 0;
  }

  function similarita(obj1, obj2) {
    let sim = 0;
    let pesoMax = 0;

    attributiOggetto.forEach(attr => {
      const val1 = obj1.properties[attr];
      const val2 = obj2.properties[attr];
      if (!val1 || !val2) return;

      const arr1 = val1.split(",").map(s => s.trim());
      const arr2 = val2.split(",").map(s => s.trim());

      const unione = [...new Set([...arr1, ...arr2])];
      unione.forEach(val => {
        const key = `${attr}::${val}`;
        pesoMax += peso[key] || 0;
      });

      const comuni = arr1.filter(val => arr2.includes(val));
      comuni.forEach(val => {
        const key = `${attr}::${val}`;
        sim += peso[key] || 0;
      });
    });

    // Bonus su triple
    const triple1 = userTriple.map(attr =>
      (obj1.properties[attr] || "").split(",").map(v => v.trim()).filter(Boolean)
    );
    const triple2 = userTriple.map(attr =>
      (obj2.properties[attr] || "").split(",").map(v => v.trim()).filter(Boolean)
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

    const statica = similaritaStatica(obj1, obj2);

    if (pesoMax === 0) return 0;
    return ((sim + bonus) / pesoMax) * 100 + statica;
  }

  return oggettiTotali.map(target => {
    return {
      fid: target.properties.fid,
      sigla: target.properties.sigla,
      percentuale: similarita(oggettoBase, target).toFixed(2) + "%"
    };
  });
}

export function calcolaBreakdown(obj1, obj2) {
  const attributiOggetto = Object.keys(userWeights);

  const breakdown = [];

  // Similarità per attributo singolo
  attributiOggetto.forEach(attr => {
    const val1 = obj1.properties[attr];
    const val2 = obj2.properties[attr];
    if (!val1 || !val2) return;

    const arr1 = val1.split(",").map(v => v.trim());
    const arr2 = val2.split(",").map(v => v.trim());

    const comuni = arr1.filter(v => arr2.includes(v));
    const unione = [...new Set([...arr1, ...arr2])];

    let simAttr = 0;
    let pesoAttr = 0;

    unione.forEach(val => {
      const key = `${attr}::${val}`;
      const pesoVal = 1 / Math.sqrt((contaValori[key] || 1));
      pesoAttr += pesoVal;
      if (comuni.includes(val)) simAttr += pesoVal;
    });

    if (pesoAttr > 0) {
      breakdown.push({
        attr,
        val: comuni.join(", ") || "(nessuna corrispondenza)",
        sim: simAttr / pesoAttr,
        peso: userWeights[attr]
      });
    }
  });

  // Bonus tripla
  const triple1 = userTriple.map(attr =>
    (obj1.properties[attr] || "").split(",").map(s => s.trim()).filter(Boolean)
  );
  const triple2 = userTriple.map(attr =>
    (obj2.properties[attr] || "").split(",").map(s => s.trim()).filter(Boolean)
  );

  let bonus = 0;
  let tripleVal = [];

  triple1[0].forEach(v1 => {
    triple1[1].forEach(v2 => {
      triple1[2].forEach(v3 => {
        const key = `${v1}::${v2}::${v3}`;
        if (
          triple2[0].includes(v1) &&
          triple2[1].includes(v2) &&
          triple2[2].includes(v3)
        ) {
          bonus += 1 / Math.sqrt((contaTriple[key] || 1));
          tripleVal.push(key);
        }
      });
    });
  });

  if (bonus > 0) {
    breakdown.push({
      attr: "TRIPLA",
      val: tripleVal.join(" / "),
      sim: 1.0,
      peso: bonus
    });
  }

  return breakdown;
}