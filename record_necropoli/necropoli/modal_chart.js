// samples_graph.js
// Tutta la logica Chart.js per:
// - Donut "a cono" (raggio variabile per fetta) + ombra soft + labels Manhattan + testo centrale
// - Bar chart con eventuale scala log + icone sopra le barre
//
// Nessuna dipendenza esterna oltre a Chart.js già caricato dal chiamante.

function formatPct(p) {
  if (!Number.isFinite(p)) return '';
  if (p < 0.5) return '<1%';
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

function formatCompact(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n ?? '');
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}k`;
  return String(Math.round(x));
}

export function chooseLogScale(values, ratio = 25) {
  const arr = (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0);
  if (!arr.length) return false;
  const max = Math.max(...arr);
  const min = Math.max(1, Math.min(...arr));
  return (max / min) > ratio;
}

// Palette “modello” (verde / cyan / violet + neutri)
const MODEL_COLORS = [
  'rgba(34,197,94,0.88)',    // green
  'rgba(34,211,238,0.88)',   // cyan
  'rgba(167,139,250,0.88)',  // violet
  'rgba(96,165,250,0.88)',   // blue
  'rgba(226,232,240,0.80)',  // light neutral
  'rgba(251,191,36,0.88)',   // amber
  'rgba(244,114,182,0.88)',  // pink
  'rgba(148,163,184,0.85)',  // slate
];

export function makeModelColors(n, fallbackPalette = []) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(MODEL_COLORS[i % MODEL_COLORS.length] || fallbackPalette[i % fallbackPalette.length] || 'rgba(148,163,184,0.85)');
  }
  return out;
}

/* =========================
   DONUT plugins
========================= */

// Spessore/raggio variabile per fetta (effetto “cono”)
export const variableRadiusDonutPlugin = {
  id: 'variableRadiusDonut',
  beforeDatasetsDraw(chart, _args, opts) {
    try {
      if (!opts?.enabled) return;
      if (chart.config.type !== 'doughnut') return;

      const meta = chart.getDatasetMeta(0);
      const arcs = meta?.data || [];
      const ds = chart.data?.datasets?.[0];
      if (!arcs.length || !ds?.data?.length) return;

      const ca = chart.chartArea;
      const rMax = Math.max(1, Math.min(ca.right - ca.left, ca.bottom - ca.top) / 2);

      const baseInner = arcs[0].innerRadius;

      const visibleVals = ds.data.map((v, i) => {
        const n = Number(v);
        const vis = (typeof chart.getDataVisibility === 'function') ? chart.getDataVisibility(i) : true;
        return (vis && Number.isFinite(n) && n > 0) ? n : 0;
      });

      const maxVal = Math.max(1, ...visibleVals);

      const minFactor = opts.minFactor ?? 0.18; // più basso = più “cono”
      const exp = opts.exp ?? 1.35;             // più alto = più differenza

      arcs.forEach((arc, i) => {
        const v = visibleVals[i] || 0;
        const t = v <= 0 ? 0 : Math.pow(v / maxVal, exp);
        const factor = (v <= 0) ? 0 : (minFactor + (1 - minFactor) * t);

        arc.innerRadius = baseInner;
        arc.outerRadius = baseInner + (rMax - baseInner) * factor;
      });
    } catch {}
  }
};

// Ombra soft
export const donutSoftShadowPlugin = {
  id: 'donutSoftShadow',
  beforeDatasetDraw(chart, _args, opts) {
    try {
      if (!opts?.enabled) return;
      if (chart.config.type !== 'doughnut') return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 10;
    } catch {}
  },
  afterDatasetDraw(chart, _args, opts) {
    try {
      if (!opts?.enabled) return;
      if (chart.config.type !== 'doughnut') return;
      chart.ctx.restore();
    } catch {}
  }
};

// Labels Manhattan (snelle, con leader ortogonali e anti-overlap)
export const donutManhattanLabelsPlugin = {
  id: 'donutManhattanLabels',
  afterDatasetsDraw(chart, _args, opts) {
    try {
      if (!opts?.enabled) return;
      if (chart.config.type !== 'doughnut') return;

      const meta = chart.getDatasetMeta(0);
      const arcs = meta?.data || [];
      const ds = chart.data?.datasets?.[0];
      const raw = ds?.data || [];
      if (!arcs.length || !raw.length) return;

      const vals = raw.map(v => (v == null ? NaN : Number(v)));
      const sum = vals.reduce((a, v, i) => {
        const vis = (typeof chart.getDataVisibility === 'function') ? chart.getDataVisibility(i) : true;
        return a + (vis && Number.isFinite(v) && v > 0 ? v : 0);
      }, 0);
      if (sum <= 0) return;

      const ca = chart.chartArea;
      const safe = opts.safePad ?? 14;

      const yMin = ca.top + safe;
      const yMax = ca.bottom - safe;

      const elbowOut = opts.elbowOut ?? 12;
      const textOut  = opts.textOut  ?? 56;

      // clamp dinamico: mai oltre canvas
      const maxExtraR = Math.max(0, chart.width - ca.right - safe);
      const maxExtraL = Math.max(0, ca.left - safe);

      const xElbowR = ca.right + Math.min(elbowOut, maxExtraR);
      const xTextR  = ca.right + Math.min(textOut,  maxExtraR);

      const xElbowL = ca.left  - Math.min(elbowOut, maxExtraL);
      const xTextL  = ca.left  - Math.min(textOut,  maxExtraL);

      const leaderStart = opts.leaderStart ?? 2;
      const leaderLen   = opts.leaderLen   ?? 14;

      const minPct = opts.minPctToShow ?? 0; // se vuoi pulizia: 0.8 / 1.0
      const minGap = opts.minGap ?? 14;

      const items = [];

      for (let i = 0; i < arcs.length; i++) {
        const v = vals[i];
        const vis = (typeof chart.getDataVisibility === 'function') ? chart.getDataVisibility(i) : true;
        if (!vis) continue;
        if (!Number.isFinite(v) || v <= 0) continue;

        const pct = (v / sum) * 100;
        if (pct < minPct) continue;

        const arc = arcs[i];
        const ang = (arc.startAngle + arc.endAngle) / 2;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const side = cos >= 0 ? 'r' : 'l';

        const r0 = arc.outerRadius + leaderStart;
        const r1 = arc.outerRadius + leaderLen;

        const x1 = arc.x + cos * r0;
        const y1 = arc.y + sin * r0;
        const x2 = arc.x + cos * r1;
        const y2 = arc.y + sin * r1;

        items.push({ i, side, x1, y1, x2, y2, yT: y2, pct });
      }

      function spread(list) {
        list.sort((a, b) => a.yT - b.yT);

        for (let k = 1; k < list.length; k++) {
          if (list[k].yT - list[k - 1].yT < minGap) {
            list[k].yT = list[k - 1].yT + minGap;
          }
        }

        const over = (list.length ? list[list.length - 1].yT : 0) - yMax;
        if (over > 0) for (let k = 0; k < list.length; k++) list[k].yT -= over;

        const under = yMin - (list.length ? list[0].yT : 0);
        if (under > 0) for (let k = 0; k < list.length; k++) list[k].yT += under;

        for (let k = 1; k < list.length; k++) {
          if (list[k].yT - list[k - 1].yT < minGap) {
            list[k].yT = list[k - 1].yT + minGap;
          }
        }
      }

      const left  = items.filter(x => x.side === 'l');
      const right = items.filter(x => x.side === 'r');
      spread(left);
      spread(right);

      const ctx = chart.ctx;
      ctx.save();

      const lineColor = opts.lineColor ?? 'rgba(255,255,255,0.55)';
      const textColor = opts.textColor ?? 'rgba(255,255,255,0.92)';
      const haloColor = opts.haloColor ?? 'rgba(0,0,0,0.38)';
      const lineWidth = opts.lineWidth ?? 1.1;
      const fontSize  = opts.fontSize ?? 12;

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.fillStyle = textColor;
      ctx.font = `700 ${fontSize}px Segoe UI, Roboto, Arial`;
      ctx.textBaseline = 'middle';

      function drawOne(it) {
        const isR = it.side === 'r';
        const xElbow = isR ? xElbowR : xElbowL;
        const xText  = isR ? xTextR  : xTextL;

        // leader “Manhattan”
        ctx.beginPath();
        ctx.moveTo(it.x1, it.y1);
        ctx.lineTo(it.x2, it.y2);
        ctx.lineTo(xElbow, it.y2);
        ctx.lineTo(xElbow, it.yT);
        ctx.lineTo(xText,  it.yT);
        ctx.stroke();

        // dot finale
        ctx.beginPath();
        ctx.arc(xText, it.yT, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = textColor;
        ctx.fill();

        // testo
        const txt = formatPct(it.pct);
        ctx.textAlign = isR ? 'left' : 'right';
        const pad = 8;
        const tx = isR ? (xText + pad) : (xText - pad);

        // micro-halo per leggibilità
        ctx.lineWidth = 3;
        ctx.strokeStyle = haloColor;
        ctx.strokeText(txt, tx, it.yT);

        ctx.lineWidth = 1;
        ctx.fillStyle = textColor;
        ctx.fillText(txt, tx, it.yT);

        // ripristina stile linee
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;
      }

      left.forEach(drawOne);
      right.forEach(drawOne);

      ctx.restore();
    } catch {}
  }
};

// Testo centrale (Total + valore)
export const donutCenterTextPlugin = {
  id: 'donutCenterText',
  afterDatasetsDraw(chart, _args, opts) {
    try {
      if (!opts?.enabled) return;
      if (chart.config.type !== 'doughnut') return;

      const meta = chart.getDatasetMeta(0);
      const arc = meta?.data?.[0];
      if (!arc) return;

      const ctx = chart.ctx;
      const label = opts.label ?? 'Total';
      const value = opts.value ?? '';

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = opts.labelColor ?? 'rgba(255,255,255,0.78)';
      ctx.font = `600 ${opts.labelSize ?? 11}px ${opts.fontFamily ?? "Segoe UI, Roboto, Arial"}`;
      ctx.fillText(label, arc.x, arc.y - 10);

      ctx.fillStyle = opts.valueColor ?? 'rgba(255,255,255,0.95)';
      ctx.font = `800 ${opts.valueSize ?? 18}px ${opts.fontFamily ?? "Segoe UI, Roboto, Arial"}`;
      ctx.fillText(formatCompact(value), arc.x, arc.y + 12);

      ctx.restore();
    } catch {}
  }
};

/* =========================
   BAR plugins
========================= */

export function makeIconsAboveBarsPlugin({ images, colors }) {
  return {
    id: 'iconsAboveBars',
    afterDraw(c) {
      try {
        const meta = c.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const ctx2 = c.ctx;
        meta.data.forEach((bar, i) => {
          const lab = c.data.labels[i];
          const img = images?.[lab];
          if (!img || !img.complete || !img.naturalWidth) return;
          const s = Math.min(bar.width * 1.2, 32);
          const x = bar.x - s / 2;
          const y = bar.y - s - 8;

          ctx2.beginPath();
          ctx2.arc(bar.x, y + s / 2, s / 2 + 4, 0, Math.PI * 2);
          ctx2.fillStyle = 'rgba(255,255,255,0.95)';
          ctx2.fill();

          ctx2.strokeStyle = colors?.[i] || 'rgba(148,163,184,1)';
          ctx2.lineWidth = 1.25;
          ctx2.stroke();

          try { ctx2.drawImage(img, x, y, s, s); } catch {}
        });
      } catch {}
    }
  };
}

/* =========================
   CHART builders
========================= */

export function createQtDonutChart(ctx, {
  labels,
  values,
  colors,
  totalValue,
  cutout = '34%',
  rotation = -90 * (Math.PI / 180),
  layoutPadding = { top: 18, right: 92, bottom: 18, left: 92 },
  variableRadius = { enabled: true, minFactor: 0.18, exp: 1.35 },
  shadow = { enabled: true },
  manhattanLabels = {
    enabled: true,
    minPctToShow: 0,   // se vuoi meno caos: 0.8 / 1.0
    minGap: 14,
    elbowOut: 12,
    textOut: 56,
    safePad: 14
  },
  centerText = { enabled: true, label: 'Total', value: null }
} = {}) {
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: 'rgba(255,255,255,0.28)',
        borderWidth: 1,
        spacing: 4,
        borderRadius: 10,
        hoverOffset: 8,
        radius: '92%'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout,
      rotation,
      layout: { padding: layoutPadding },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: (c) => {
              const v = Number(c.parsed) || 0;
              const sum = c.dataset.data.reduce((a, x, i) => {
                const vis = (typeof c.chart.getDataVisibility === 'function') ? c.chart.getDataVisibility(i) : true;
                return a + (vis ? (Number(x) || 0) : 0);
              }, 0) || 1;
              const pct = (v / sum) * 100;
              return `${c.label}: ${v} (${formatPct(pct)})`;
            }
          }
        },

        variableRadiusDonut: variableRadius,
        donutSoftShadow: shadow,
        donutManhattanLabels: manhattanLabels,
        donutCenterText: {
          ...(centerText || {}),
          value: (centerText?.value ?? totalValue)
        }
      }
    },
    plugins: [
      variableRadiusDonutPlugin,
      donutSoftShadowPlugin,
      donutManhattanLabelsPlugin,
      donutCenterTextPlugin
    ]
  });
}

export function createQtBarChart(ctx, {
  labels,
  values,
  colors,
  borders,
  images,
  useLog = false
} = {}) {
  const iconsPlugin = makeIconsAboveBarsPlugin({ images, colors });

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values.slice(),
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
        borderRadius: 6,
        hoverBackgroundColor: colors.map(c => String(c).replace('0.85', '0.95'))
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 72 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: t => `${t.parsed.y} item(s)`,
            title: t => t[0]?.label ?? ''
          }
        }
      },
      scales: {
        y: {
          type: useLog ? 'logarithmic' : 'linear',
          beginAtZero: false,
          min: useLog ? 1 : undefined,
          grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
          ticks: { color: '#666', font: { size: 12 }, callback: v => useLog ? String(v) : v }
        },
        x: { grid: { display: false, drawBorder: false }, ticks: { display: false } }
      }
    },
    plugins: [iconsPlugin]
  });
}
