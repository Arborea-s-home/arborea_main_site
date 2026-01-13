// schede_detail_charts.js
// Chart.js loader + donut "wide" + bar minimale + completion bars (HTML)

const CHARTJS_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

export function ensureChartJs() {
  if (typeof Chart !== 'undefined') return Promise.resolve();
function preloadImagesSafe(urls, fallbackUrl) {
  const imgs = [];
  let remaining = urls.length;

  return new Promise((resolve) => {
    if (!remaining) return resolve(imgs);

    const done = () => { if (--remaining <= 0) resolve(imgs); };

    urls.forEach((u, i) => {
      const img = new Image();
      imgs[i] = img;

      let usedFallback = false;

      img.onload = done;
      img.onerror = () => {
        if (!usedFallback && fallbackUrl) {
          usedFallback = true;
          img.onerror = done;     // se fallisce anche fallback, non bloccare
          img.src = fallbackUrl;
        } else {
          done();
        }
      };

      img.src = u;
    });
  });
}
}

export const NEON_PALETTE = [
  'rgba(168,85,247,0.88)',
  'rgba(236,72,153,0.88)',
  'rgba(217,70,239,0.88)',
  'rgba(251,146,60,0.88)',
  'rgba(245,158,11,0.88)',
  'rgba(99,102,241,0.88)',
  'rgba(56,189,248,0.80)',
  'rgba(148,163,184,0.70)'
];

function formatPct(p) {
  if (!Number.isFinite(p)) return '';
  if (p < 0.5) return '<1%';
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}
function shortLabel(s, max = 16){
  const t = String(s || '').trim();
  return (t.length <= max) ? t : (t.slice(0, max - 1) + '…');
}
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

const variableRadiusDonutPlugin = {
  id: 'sdVariableRadiusDonut',
  beforeDatasetsDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    if (chart.config.type !== 'doughnut') return;

    const meta = chart.getDatasetMeta(0);
    const arcs = meta?.data || [];
    const ds = chart.data?.datasets?.[0];
    if (!arcs.length || !ds?.data?.length) return;

    const ca = chart.chartArea;
    const rMax = Math.max(1, Math.min(ca.right - ca.left, ca.bottom - ca.top) / 2);
    const baseInner = arcs[0].innerRadius;

    const vals = ds.data.map((v, i) => {
      const n = Number(v);
      const vis = (typeof chart.getDataVisibility === 'function') ? chart.getDataVisibility(i) : true;
      return (vis && Number.isFinite(n) && n > 0) ? n : 0;
    });
    const maxVal = Math.max(1, ...vals);

    const minFactor = opts.minFactor ?? 0.22;
    const exp = opts.exp ?? 1.25;

    arcs.forEach((arc, i) => {
      const v = vals[i] || 0;
      const t = v <= 0 ? 0 : Math.pow(v / maxVal, exp);
      const factor = (v <= 0) ? 0 : (minFactor + (1 - minFactor) * t);
      arc.innerRadius = baseInner;
      arc.outerRadius = baseInner + (rMax - baseInner) * factor;
    });
  }
};

const donutShadowPlugin = {
  id: 'sdDonutShadow',
  beforeDatasetDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    if (chart.config.type !== 'doughnut') return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
  },
  afterDatasetDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    if (chart.config.type !== 'doughnut') return;
    chart.ctx.restore();
  }
};

const donutLabelsPlugin = {
  id: 'sdDonutLabels',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    if (chart.config.type !== 'doughnut') return;

    const meta = chart.getDatasetMeta(0);
    const arcs = meta?.data || [];
    const ds = chart.data?.datasets?.[0];
    const raw = ds?.data || [];
    if (!arcs.length || !raw.length) return;

    const labels = chart.data.labels || [];
    const vals = raw.map(v => Number(v));
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
    const textOut  = opts.textOut  ?? 70;

    const xElbowR = ca.right + elbowOut;
    const xTextR  = ca.right + textOut;

    const xElbowL = ca.left  - elbowOut;
    const xTextL  = ca.left  - textOut;

    const minPct = opts.minPctToShow ?? 1.0;
    const minGap = opts.minGap ?? 14;

    const items = [];
    for (let i = 0; i < arcs.length; i++) {
      const v = vals[i];
      const vis = (typeof chart.getDataVisibility === 'function') ? chart.getDataVisibility(i) : true;
      if (!vis || !Number.isFinite(v) || v <= 0) continue;

      const pct = (v / sum) * 100;
      if (pct < minPct) continue;

      const arc = arcs[i];
      const ang = (arc.startAngle + arc.endAngle) / 2;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const side = cos >= 0 ? 'r' : 'l';

      const r0 = arc.outerRadius + 2;
      const r1 = arc.outerRadius + 16;

      const x1 = arc.x + cos * r0;
      const y1 = arc.y + sin * r0;
      const x2 = arc.x + cos * r1;
      const y2 = arc.y + sin * r1;

      items.push({ i, side, x1, y1, x2, y2, yT: y2, pct });
    }

    function spread(list) {
      list.sort((a,b) => a.yT - b.yT);
      for (let k = 1; k < list.length; k++) {
        if (list[k].yT - list[k-1].yT < minGap) list[k].yT = list[k-1].yT + minGap;
      }
      const over = (list.length ? list[list.length - 1].yT : 0) - yMax;
      if (over > 0) for (let k = 0; k < list.length; k++) list[k].yT -= over;
      const under = yMin - (list.length ? list[0].yT : 0);
      if (under > 0) for (let k = 0; k < list.length; k++) list[k].yT += under;
    }

    const left = items.filter(x => x.side === 'l');
    const right = items.filter(x => x.side === 'r');
    spread(left); spread(right);

    const ctx = chart.ctx;
    ctx.save();

    ctx.strokeStyle = 'rgba(255,255,255,0.40)';
    ctx.lineWidth = 1.1;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `700 11px Segoe UI, Roboto, Arial`;
    ctx.textBaseline = 'middle';

    function drawOne(it) {
      const isR = it.side === 'r';
      const xElbow = isR ? xElbowR : xElbowL;
      const xText  = isR ? xTextR  : xTextL;

      ctx.beginPath();
      ctx.moveTo(it.x1, it.y1);
      ctx.lineTo(it.x2, it.y2);
      ctx.lineTo(xElbow, it.y2);
      ctx.lineTo(xElbow, it.yT);
      ctx.lineTo(xText,  it.yT);
      ctx.stroke();

      const lab = shortLabel(labels[it.i], 16);
      const txt = `${formatPct(it.pct)}`;

      ctx.textAlign = isR ? 'left' : 'right';
      const pad = 8;
      const tx = isR ? (xText + pad) : (xText - pad);

      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(txt, tx, it.yT);

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.40)';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(txt, tx, it.yT);
    }

    left.forEach(drawOne);
    right.forEach(drawOne);

    ctx.restore();
  }
};

export function makeColors(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(NEON_PALETTE[i % NEON_PALETTE.length]);
  return out;
}

export function createWideDonutChart(ctx, { labels, values, colors } = {}) {
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: 'rgba(255,255,255,0.22)',
        borderWidth: 1,
        spacing: 4,
        borderRadius: 10,
        hoverOffset: 10,
        radius: '94%'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '18%',
      rotation: -90 * (Math.PI / 180),
      layout: { padding: { top: 18, right: 120, bottom: 18, left: 120 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: t => {
              const v = Number(t.parsed) || 0;
              const sum = (t.dataset.data || []).reduce((a,x,i) => {
                const vis = (typeof t.chart.getDataVisibility === 'function') ? t.chart.getDataVisibility(i) : true;
                return a + (vis ? (Number(x)||0) : 0);
              }, 0) || 1;
              return `${v} ( ${formatPct((v/sum)*100)} )`;
            }
          }
        },
        sdVariableRadiusDonut: { enabled: true, minFactor: 0.22, exp: 1.25 },
        sdDonutShadow: { enabled: true },
        sdDonutLabels: { enabled: true, minPctToShow: 1.0, minGap: 14, elbowOut: 12, textOut: 70, safePad: 14 }
      }
    },
    plugins: [variableRadiusDonutPlugin, donutShadowPlugin, donutLabelsPlugin]
  });
}

export function createMiniBarChart(ctx, { labels, values, colors } = {}) {
  const idx = labels.map((_, i) => i).sort((a,b) => (values[b]||0) - (values[a]||0));
  const N = Math.min(12, idx.length);
  const labs = idx.slice(0, N).map(i => labels[i]);
  const vals = idx.slice(0, N).map(i => values[i]);
  const cols = idx.slice(0, N).map((_,i) => colors[i % colors.length]);

  return new Chart(ctx, {
    type: 'bar',
    data: { labels: labs, datasets: [{ data: vals, backgroundColor: cols, borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { display: false }, grid: { display: false, drawBorder: false } },
        y: { ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.10)', drawBorder: false } }
      }
    }
  });
}

export function renderCompletionBars(host, { labels, values, topN = 4 } = {}) {
  if (!host) return;
  host.innerHTML = '';

  const pairs = labels.map((l,i) => ({ l, v: Number(values[i]) || 0 }));
  pairs.sort((a,b) => b.v - a.v);
  const take = pairs.slice(0, Math.min(topN, pairs.length));
  const maxV = Math.max(1, ...take.map(x => x.v));

  take.forEach(x => {
    const pct = clamp(x.v / maxV, 0, 1);
    const row = document.createElement('div');
    row.className = 'sd-comp-row';
    row.style.setProperty('--pct', String(pct));
    row.innerHTML = `
      <div class="sd-comp-lab" title="${x.l}">${shortLabel(x.l, 14)}</div>
      <div class="sd-comp-bar"><span class="sd-comp-fill"></span></div>
      <div class="sd-comp-val">${x.v}</div>
    `;
    host.appendChild(row);
  });

  if (!take.length) host.innerHTML = `<div class="sd-muted">No data</div>`;
}
