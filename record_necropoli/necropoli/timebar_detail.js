// record_necropoli/necropoli/timebar_detail.js
import { getPath } from '../../path_utils.js';

const TINY = Object.freeze({
  padX: 16,
  padBottom: 12,
  gap: 10,
  minWidth: 320
});

const PHASES = [
  "Mesolitico","Eneolitico","Neolitico","Età del Bronzo","Età del Ferro / Villanoviano",
  "Periodo Etrusco / Orientalizzante","Periodo Arcaico (Roma)","Periodo Repubblicano (Roma)",
  "Periodo Imperiale (Roma)","Tarda Antichità","Medioevo","Rinascimento","Periodo Moderno","Età contemporanea"
];

let chart = null;
let els = {};
let resizeObservers = [];
let mutationObserver = null;
let firstRendered = false;

const $ = (sel, root=document) => root.querySelector(sel);
const isVisible = (el) => !!el && getComputedStyle(el).visibility !== 'hidden' &&
  getComputedStyle(el).display !== 'none' && el.offsetWidth > 0 && el.offsetHeight > 0;

function buildUI() {
  const wrap = document.createElement('div');
  wrap.id = 'timebar-detail';
  wrap.innerHTML = `
    <div class="tb-controls">
      <div class="tb-labels">
        <span class="chip"><span class="dot"></span><span id="tb-label-from"></span></span>
        <span class="chip"><span class="dot"></span><span id="tb-label-to"></span></span>
      </div>
      <label class="tb-switch">
        <input id="tb-undated" type="checkbox" />
        <span class="tb-switch-label">add undated contexts</span>
      </label>
    </div>

    <div class="tb-canvas-wrap">
      <canvas id="tb-canvas" height="120"></canvas>
    </div>

    <div class="tb-sliders">
      <input id="tb-from" type="range" value="0" />
      <input id="tb-to"   type="range" value="${PHASES.length-1}" />
    </div>

    <button id="tb-help" class="tb-help" title="How the line works">?</button>
  `;
  document.body.appendChild(wrap);

  els.wrap    = wrap;
  els.map     = $('#map');
  els.from    = $('#tb-from', wrap);
  els.to      = $('#tb-to', wrap);
  els.labFrom = $('#tb-label-from', wrap);
  els.labTo   = $('#tb-label-to', wrap);
  els.undated = $('#tb-undated', wrap);
  els.canvas  = $('#tb-canvas', wrap);
  els.helpBtn = $('#tb-help', wrap);

  els.from.min = 0; els.from.max = PHASES.length - 1; els.from.step = 1;
  els.to.min   = 0; els.to.max   = PHASES.length - 1; els.to.step   = 1;

  const sel = (window.__detail_getSelectedRange?.()
    || { from:0, to: PHASES.length-1, includeUndated:false });
  els.from.value = String(sel.from);
  els.to.value   = String(sel.to);
  els.undated.checked = !!sel.includeUndated;

  syncLabels();
  positionToLayout();

  // Reattività base
  window.addEventListener('resize', scheduleRelayout);
  window.addEventListener('orientationchange', scheduleRelayout);

  // Osserva ridimensionamenti di dashboard / category-filter (se già presenti)
  attachRO($('#dashboard'));
  attachRO($('#category-filter'));

  // Osserva INSERIMENTO di #category-filter (creato dinamicamente)
  mutationObserver = new MutationObserver(() => {
    const cf = $('#category-filter');
    if (cf && !cf.__tb_ro) {
      attachRO(cf);
      positionToLayout();
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  // Reagisci ai nudge del tutorial
  document.addEventListener('tutorial:open', handleTutorialNudge);
  document.addEventListener('tutorial:step', handleTutorialNudge);
  document.addEventListener('tutorial:close', handleTutorialNudge);
}

function attachRO(el){
  if (!el || !('ResizeObserver' in window)) return;
  const ro = new ResizeObserver(scheduleRelayout);
  ro.observe(el);
  el.__tb_ro = ro;
  resizeObservers.push(ro);
}

let relayoutRAF = null;
function scheduleRelayout(){
  if (relayoutRAF) return;
  relayoutRAF = requestAnimationFrame(() => {
    relayoutRAF = null;
    positionToLayout();
    // se il canvas è già montato, sincronizza il chart con la nuova misura
    if (chart) try { chart.resize(); } catch {}
  });
}

function positionToLayout() {
  if (!els.wrap || !els.map) return;
  const mapR = els.map.getBoundingClientRect();
  if (mapR.width <= 0 || mapR.height <= 0) return;

  let left  = Math.max(0, mapR.left + TINY.padX);
  let right = Math.max(0, window.innerWidth - mapR.right + TINY.padX);

  const cf = $('#category-filter');
  if (isVisible(cf)) { const r = cf.getBoundingClientRect(); left  = Math.max(left,  r.right + TINY.gap); }
  const db = $('#dashboard');
  if (isVisible(db)) { const r = db.getBoundingClientRect(); right = Math.max(right, window.innerWidth - r.left + TINY.gap); }

  const avail = window.innerWidth - left - right;
  if (avail < TINY.minWidth) {
    const deficit  = TINY.minWidth - avail;
    const giveLeft = Math.min(left,  Math.ceil(deficit/2));
    const giveRight= Math.min(right, Math.floor(deficit/2));
    left  = Math.max(0, left  - giveLeft);
    right = Math.max(0, right - giveRight);
  }

  els.wrap.style.left   = `${left}px`;
  els.wrap.style.right  = `${right}px`;
  els.wrap.style.bottom = `${Math.max(0, window.innerHeight - mapR.bottom + TINY.padBottom)}px`;
}

function clampRange() {
  let a = parseInt(els.from.value,10);
  let b = parseInt(els.to.value,10);
  if (isNaN(a)) a = 0;
  if (isNaN(b)) b = PHASES.length-1;
  if (a > b) [a, b] = [b, a];
  els.from.value = String(a);
  els.to.value   = String(b);
  return { a, b };
}

function syncLabels() {
  const { a, b } = clampRange();
  els.labFrom.textContent = PHASES[a];
  els.labTo.textContent   = PHASES[b];
  els.wrap.style.setProperty('--tb-from', a);
  els.wrap.style.setProperty('--tb-to', b);
  els.wrap.style.setProperty('--tb-count', PHASES.length);
}

function attachEvents() {
  const onInput  = () => { syncLabels(); redraw(false); };
  const onChange = () => { syncLabels(); redraw(true); };
  els.from.addEventListener('input', onInput);
  els.to.addEventListener('input', onInput);
  els.from.addEventListener('change', onChange);
  els.to.addEventListener('change', onChange);
  els.undated.addEventListener('change', () => redraw(true));

  document.addEventListener('detail:filters-changed', () => redraw(false));

  els.helpBtn.addEventListener('click', () => {
    alert(`The line counts CONTEXTS per phase.
• It respects typology filter (doughnut), reliability range, taxa & s_type filters.
• The shaded area is your active chronologic selection.
• Toggle "add undated contexts" to include records without explicit phase.`);
  });
}

function ensureChart() {
  if (chart) return chart;
  const ctx = els.canvas.getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: PHASES,
      datasets: [{
        label: 'Contexts',
        data: new Array(PHASES.length).fill(0),
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBorderWidth: 1,
        borderWidth: 2,
        borderColor: '#2563eb',
        pointBackgroundColor: '#2563eb',
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => (items[0]?.label || ''),
            label: (ctx) => `${ctx.parsed?.y ?? 0} contexts`
          }
        },
        tbRangeShade: { from: 0, to: PHASES.length - 1 }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { precision: 0, font: { size: 10 } } }
      }
    },
    plugins: [rangeShadePlugin()]
  });
  return chart;
}

function rangeShadePlugin() {
  return {
    id: 'tbRangeShade',
    beforeDatasetDraw(c, _args, opts) {
      const { chartArea: a, ctx, scales } = c;
      if (!a || !scales?.x) return;
      const x = scales.x;
      const from = Math.max(0, Math.min(PHASES.length-1, opts.from ?? 0));
      const to   = Math.max(0, Math.min(PHASES.length-1, opts.to ?? PHASES.length-1));
      const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
      const x0 = x.getPixelForValue(from) - half;
      const x1 = x.getPixelForValue(to)   + half;
      ctx.save();
      ctx.fillStyle = 'rgba(34,197,94,0.12)';
      ctx.fillRect(x0, a.top, Math.max(0, x1 - x0), a.bottom - a.top);
      ctx.restore();
    }
  };
}

function readCounts() {
  const fn = window.__detail_computePhaseCounts;
  return (typeof fn === 'function') ? fn() : new Array(PHASES.length).fill(0);
}

function redraw(applyGlobal) {
  const { a, b } = clampRange();
  const includeUndated = !!els.undated.checked;

  if (applyGlobal && typeof window.__detail_setChronoRange === 'function') {
    window.__detail_setChronoRange(a, b, includeUndated);
  }

  const counts = readCounts();
  const max = Math.max(1, ...counts);

  const c = ensureChart();
  c.data.datasets[0].data = counts;
  c.options.plugins.tbRangeShade.from = a;
  c.options.plugins.tbRangeShade.to   = b;
  c.options.scales.y.max = Math.ceil(max * 1.05);
  c.update('none');

  // dopo il PRIMO render reale, dichiara pronto
  if (!firstRendered) {
    firstRendered = true;
    // doppio rAF: assicura layout stabile prima del ready
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.wrap.dataset.ready = '1';
        try { document.dispatchEvent(new Event('timebar:ready')); } catch {}
      });
    });
  }
}

function handleTutorialNudge() {
  // Ricalcola posizionamento e forza resize del grafico
  scheduleRelayout();
  if (chart) try { chart.resize(); } catch {}
}

/* ---------- Bootstrap ---------- */
function boot() {
  if (!$('#map')) return;
  buildUI();
  attachEvents();

  const doSync = () => { syncLabels(); positionToLayout(); redraw(false); };

  // 1) sync appena map_viewer segnala pronto
  document.addEventListener('detail:ready', doSync, { once: true });

  // 2) fallback: aspetta che la funzione di conteggio esista davvero
  let tries = 0;
  const POLL_MS = 120;
  const MAX_TRIES = 75; // ~9s
  const timer = setInterval(() => {
    if (typeof window.__detail_computePhaseCounts === 'function') {
      clearInterval(timer);
      doSync();
    } else if (++tries >= MAX_TRIES) {
      clearInterval(timer);
      // almeno posiziona e istanzia il chart vuoto (evita “0 perpetuo” visivo)
      ensureChart();
      positionToLayout();
    }
  }, POLL_MS);

  // 3) se già esposto, fai subito un primo sync
  if (typeof window.__detail_computePhaseCounts === 'function') doSync();

  // Re-sync a ogni cambio filtri globali
  document.addEventListener('detail:filters-changed', () => redraw(false));
}

document.addEventListener('DOMContentLoaded', boot);

// cleanup (opzionale, nel caso di SPA)
window.addEventListener('beforeunload', () => {
  resizeObservers.forEach(ro => { try { ro.disconnect(); } catch {} });
  try { mutationObserver?.disconnect(); } catch {}
});
