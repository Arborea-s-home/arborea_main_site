// object_affinity.js

/**
 * Similarità per SAMPLES + CONTEXT
 *
 * Attributi (sample):
 *  - precise_taxon, Family, genus, s_type, s_part, s_foss, qt
 * Attributi (context, join contesti.fid = samples.context_id):
 *  - typology, chronology_iccd
 *
 * Tripla: (Family, genus, s_type)
 * Hard rule (esclusione): similarità = 0 se NON coincide almeno
 * uno tra {precise_taxon, genus, Family}
 */

export const DEFAULT_WEIGHTS = {
  precise_taxon: 1,
  Family: 1,
  genus: 1,
  s_type: 1,
  s_part: 1,
  s_foss: 1,
  typology: 1,
  qt: 1,
  chronology_iccd: 1
};

const TRIPLE_ATTRS = ["Family", "genus", "s_type"];

let userWeights = { ...DEFAULT_WEIGHTS };
let contaValori = {};
let contaTriple = {};

// API pesi
export function updateWeights(newWeights) {
  userWeights = { ...DEFAULT_WEIGHTS, ...newWeights };
}
export function resetWeights() {
  userWeights = { ...DEFAULT_WEIGHTS };
}
export function getCurrentConfig() {
  return { weights: { ...userWeights } };
}

// Helpers
function tokensFrom(value) {
  if (value === null || value === undefined) return [];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  const s = String(value).trim();
  if (!s) return [];
  const parts = s.split(/[;,/]+/).map(v => v.trim()).filter(Boolean);
  return parts.length ? parts : [s];
}

function buildFrequencies(features, attrs) {
  const counts = {};
  features.forEach(f => {
    const p = f.properties || {};
    attrs.forEach(attr => {
      tokensFrom(p[attr]).forEach(val => {
        const key = `${attr}::${val}`;
        counts[key] = (counts[key] || 0) + 1;
      });
    });
  });
  return counts;
}

function buildTripleFrequencies(features) {
  const counts = {};
  features.forEach(f => {
    const p = f.properties || {};
    const A = tokensFrom(p[TRIPLE_ATTRS[0]]);
    const B = tokensFrom(p[TRIPLE_ATTRS[1]]);
    const C = tokensFrom(p[TRIPLE_ATTRS[2]]);
    if (!A.length || !B.length || !C.length) return;
    A.forEach(a => B.forEach(b => C.forEach(c => {
      const key = `${a}::${b}::${c}`;
      counts[key] = (counts[key] || 0) + 1;
    })));
  });
  return counts;
}

function buildTokenWeights(counts) {
  const w = {};
  for (const key of Object.keys(counts)) {
    const [attr] = key.split("::");
    const base = 1 / Math.sqrt(counts[key]);
    const attrW = userWeights[attr] ?? 1;
    w[key] = base * attrW;
  }
  return w;
}

/** Weighted Jaccard numeratore/denominatore (per poter aggiungere bonus) */
function weightedJaccardNumDen(p1, p2, attrs, tokenWeights) {
  let num = 0;
  let den = 0;

  attrs.forEach(attr => {
    const a1 = tokensFrom(p1[attr]);
    const a2 = tokensFrom(p2[attr]);
    if (!a1.length && !a2.length) return;

    const set1 = new Set(a1);
    const set2 = new Set(a2);
    const union = new Set([...set1, ...set2]);

    union.forEach(val => {
      const key = `${attr}::${val}`;
      den += tokenWeights[key] || (userWeights[attr] ?? 1);
    });

    a1.forEach(val => {
      if (set2.has(val)) {
        const key = `${attr}::${val}`;
        num += tokenWeights[key] || (userWeights[attr] ?? 1);
      }
    });
  });

  return { num, den };
}

/** Hard rule: deve coincidere almeno uno tra precise_taxon / genus / Family */
function passesHardRule(p1, p2) {
  const A = tokensFrom(p1.precise_taxon);
  const B = tokensFrom(p1.genus);
  const C = tokensFrom(p1.Family);

  const A2 = tokensFrom(p2.precise_taxon);
  const B2 = tokensFrom(p2.genus);
  const C2 = tokensFrom(p2.Family);

  const interA = A.some(v => A2.includes(v));
  const interB = B.some(v => B2.includes(v));
  const interC = C.some(v => C2.includes(v));

  return interA || interB || interC;
}

/** Similarità complessiva con bonus TRIPLA */
function similarity(sampleA, sampleB, attrs, tokenWeights) {
  const p1 = sampleA.properties || {};
  const p2 = sampleB.properties || {};

  if (!passesHardRule(p1, p2)) return 0;

  const { num, den } = weightedJaccardNumDen(p1, p2, attrs, tokenWeights);
  if (den === 0) return 0;

  // Bonus tripla (Family, genus, s_type)
  let bonus = 0;
  const A1 = tokensFrom(p1[TRIPLE_ATTRS[0]]);
  const B1 = tokensFrom(p1[TRIPLE_ATTRS[1]]);
  const C1 = tokensFrom(p1[TRIPLE_ATTRS[2]]);
  const A2 = tokensFrom(p2[TRIPLE_ATTRS[0]]);
  const B2 = tokensFrom(p2[TRIPLE_ATTRS[1]]);
  const C2 = tokensFrom(p2[TRIPLE_ATTRS[2]]);

  if (A1.length && B1.length && C1.length && A2.length && B2.length && C2.length) {
    A1.forEach(a => B1.forEach(b => C1.forEach(c => {
      if (A2.includes(a) && B2.includes(b) && C2.includes(c)) {
        const key = `${a}::${b}::${c}`;
        bonus += 1 / Math.sqrt((contaTriple[key] || 1));
      }
    })));
  }

  const final = ((num + bonus) / den) * 100;
  return Math.max(0, Math.min(100, final));
}

/** Public API: affinità con tutti */
export function calcolaAffinitaOggettiSingolo(sampleBase, featuresAll) {
  const ATTRS = Object.keys(DEFAULT_WEIGHTS);

  // Frequenze
  contaValori = buildFrequencies(featuresAll, ATTRS);
  contaTriple = buildTripleFrequencies(featuresAll);
  const tokenWeights = buildTokenWeights(contaValori);

  return featuresAll.map(target => {
    const perc = similarity(sampleBase, target, ATTRS, tokenWeights);
    return {
      fid: target.properties?.fid,
      label: target.properties?.sample_number || target.properties?.id || target.properties?.fid,
      percentuale: `${perc.toFixed(2)}%`
    };
  });
}

/** Breakdown per radar + TRIPLA */
export function calcolaBreakdown(sampleA, sampleB) {
  const ATTRS = Object.keys(DEFAULT_WEIGHTS);
  const breakdown = [];

  // Frequenze locali per coerenza (solo sui due sample)
  const localCounts = buildFrequencies([sampleA, sampleB], ATTRS);
  const tokenWeights = buildTokenWeights(localCounts);

  ATTRS.forEach(attr => {
    const a1 = tokensFrom(sampleA.properties?.[attr]);
    const a2 = tokensFrom(sampleB.properties?.[attr]);
    if (!a1.length && !a2.length) return;

    const set1 = new Set(a1);
    const set2 = new Set(a2);
    const union = new Set([...set1, ...set2]);

    let num = 0, den = 0;
    union.forEach(val => {
      const key = `${attr}::${val}`;
      den += tokenWeights[key] || (DEFAULT_WEIGHTS[attr] ?? 1);
      if (set1.has(val) && set2.has(val)) {
        num += tokenWeights[key] || (DEFAULT_WEIGHTS[attr] ?? 1);
      }
    });

    if (den > 0) {
      breakdown.push({
        attr,
        val: [...set1].filter(v => set2.has(v)).join(", ") || "(nessuna corrispondenza)",
        sim: num / den,
        peso: userWeights[attr] ?? 1
      });
    }
  });

  // TRIPLA
  const A1 = tokensFrom(sampleA.properties?.[TRIPLE_ATTRS[0]]);
  const B1 = tokensFrom(sampleA.properties?.[TRIPLE_ATTRS[1]]);
  const C1 = tokensFrom(sampleA.properties?.[TRIPLE_ATTRS[2]]);
  const A2 = tokensFrom(sampleB.properties?.[TRIPLE_ATTRS[0]]);
  const B2 = tokensFrom(sampleB.properties?.[TRIPLE_ATTRS[1]]);
  const C2 = tokensFrom(sampleB.properties?.[TRIPLE_ATTRS[2]]);

  let tripleVal = [];
  let triplePeso = 0;

  if (A1.length && B1.length && C1.length && A2.length && B2.length && C2.length) {
    A1.forEach(a => B1.forEach(b => C1.forEach(c => {
      if (A2.includes(a) && B2.includes(b) && C2.includes(c)) {
        const key = `${a}::${b}::${c}`;
        tripleVal.push(key);
        triplePeso += 1 / Math.sqrt((contaTriple[key] || 1));
      }
    })));
  }

  if (tripleVal.length) {
    breakdown.push({
      attr: "TRIPLA (Family, genus, s_type)",
      val: tripleVal.join(" / "),
      sim: 1.0,           // match pieno sulla tripla
      peso: triplePeso
    });
  }

  return breakdown;
}
