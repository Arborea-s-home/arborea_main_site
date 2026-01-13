// record_necropoli/necropoli/timebar_detail.js
import { getPath } from '../../path_utils.js';

const TINY = Object.freeze({
  padX: 16,
  padBottom: 12,
  gap: 10,
  minWidth: 320
});

/** IT = valori reali nei dati (ordine), EN = alias solo UI */
const PHASES_IT = [
  "Mesolitico","Eneolitico","Neolitico","Età del Bronzo","Età del Ferro / Villanoviano",
  "Periodo Etrusco / Orientalizzante","Periodo Arcaico (Roma)","Periodo Repubblicano (Roma)",
  "Periodo Imperiale (Roma)","Tarda Antichità","Medioevo","Rinascimento","Periodo Moderno","Età contemporanea"
];

const PHASES_EN = [
  "Mesolithic","Chalcolithic","Neolithic","Bronze Age","Iron Age / Villanovan",
  "Etruscan / Orientalizing","Archaic (Rome)","Republican (Rome)",
  "Imperial (Rome)","Late Antiquity","Middle Ages","Renaissance","Modern Period","Contemporary"
];

const PHASES = PHASES_IT;        // lunghezza / ordine “vero”
const PHASES_UI = PHASES_EN;     // solo visualizzazione

const AUTO_COLLAPSE_ZOOM = 15; // ⇦ cambia qui se vuoi

let chart = null;
let els = {};
let resizeObservers = [];
let mutationObserver = null;
let firstRendered = false;

let isCollapsed = false;
let collapsedByAuto = false;

const $ = (sel, root=document) => root.querySelector(sel);
const isVisible = (el) => !!el && getComputedStyle(el).visibility !== 'hidden' &&
  getComputedStyle(el).display !== 'none' && el.offsetWidth > 0 && el.offsetHeight > 0;

function buildUI() {
  const wrap = document.createElement('div');
  wrap.id = 'timebar-detail';
  wrap.innerHTML = `
    <div class="tb-head">
      <button id="tb-toggle" class="tb-toggle" type="button" aria-expanded="true" title="Collapse/Expand">
        <i class="bi bi-hourglass-split"></i>
      </button>

      <div class="tb-head-main">
        <div class="tb-title-row">
          <div class="tb-title">Time filter</div>

          <div class="tb-stats" aria-label="Counters">
            <span class="tb-stat" title="Contexts in selected range">
              <i class="bi bi-bar-chart-line"></i>
              <span id="tb-stat-range">0</span>
            </span>
            <span class="tb-stat tb-stat-muted" title="Total contexts">
              <span id="tb-stat-total">0</span>
            </span>
          </div>
        </div>

        <div class="tb-labels">
          <span class="chip chip-from"><span class="dot"></span><span id="tb-label-from"></span></span>
          <span class="chip chip-to"><span class="dot"></span><span id="tb-label-to"></span></span>
        </div>
      </div>

      <button id="tb-help" class="tb-help" type="button" title="Help" aria-haspopup="dialog" aria-controls="tb-pop">
        <i class="bi bi-info-lg"></i>
      </button>
    </div>

    <div class="tb-body">
      <div class="tb-controls">
        <label class="tb-switch">
          <input id="tb-undated" type="checkbox" />
          <span class="tb-switch-ui" aria-hidden="true"></span>
          <span class="tb-switch-label">add undated records</span>
        </label>
      </div>

      <div class="tb-canvas-wrap">
        <canvas id="tb-canvas" height="120"></canvas>
      </div>

      <div class="tb-sliders" aria-label="Time range slider">
        <!-- UI custom (interazione) -->
        <div class="tb-slider-ui" id="tb-slider-ui" aria-hidden="true">
          <div class="tb-slider-track"></div>
          <div class="tb-slider-range"></div>
          <div class="tb-slider-handle tb-h-from" data-handle="from" title="From"></div>
          <div class="tb-slider-handle tb-h-to" data-handle="to" title="To"></div>
        </div>

        <!-- input reali (logica), invisibili ma presenti -->
        <input id="tb-from" type="range" value="0" aria-label="From phase"/>
        <input id="tb-to"   type="range" value="${PHASES.length-1}" aria-label="To phase"/>
      </div>
    </div>

    <div id="tb-pop" class="tb-pop" role="dialog" aria-modal="false" hidden>
      <div class="tb-pop-card">
        <div class="tb-pop-head">
          <div class="tb-pop-title">
            <i class="bi bi-clock-history"></i>
            Time filter
          </div>
          <button id="tb-pop-close" class="tb-pop-close" type="button" aria-label="Close">✕</button>
        </div>

        <div class="tb-pop-body">
          <ul>
            <li>Filters <b>CONTEXTS</b> and <b>SITES</b> (<code>parent_chronology_iccd</code>).</li>
            <li>Chart shows <b>CONTEXTS per phase</b> (after typology/reliability/taxa/s_type filters).</li>
            <li>The highlighted span is your <b>active selection</b>.</li>
            <li><b>add undated records</b> includes features without explicit phases.</li>
          </ul>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  els.wrap      = wrap;
  els.map       = $('#map');
  els.toggle    = $('#tb-toggle', wrap);

  els.from      = $('#tb-from', wrap);
  els.to        = $('#tb-to', wrap);

  els.labFrom   = $('#tb-label-from', wrap);
  els.labTo     = $('#tb-label-to', wrap);
  els.undated   = $('#tb-undated', wrap);

  els.canvas    = $('#tb-canvas', wrap);
  els.helpBtn   = $('#tb-help', wrap);

  els.statRange = $('#tb-stat-range', wrap);
  els.statTotal = $('#tb-stat-total', wrap);

  els.pop       = $('#tb-pop', wrap);
  els.popClose  = $('#tb-pop-close', wrap);

  els.sliderUI  = $('#tb-slider-ui', wrap);

  els.from.min = 0; els.from.max = PHASES.length - 1; els.from.step = 1;
  els.to.min   = 0; els.to.max   = PHASES.length - 1; els.to.step   = 1;

  // ensure closed by default
  els.pop?.setAttribute('hidden', '');

  const sel = (window.__detail_getSelectedRange?.()
    || { from:0, to: PHASES.length-1, includeUndated:false });

  els.from.value = String(sel.from);
  els.to.value   = String(sel.to);
  els.undated.checked = !!sel.includeUndated;

  syncLabels();
  positionToLayout();

  window.addEventListener('resize', scheduleRelayout);
  window.addEventListener('orientationchange', scheduleRelayout);

  attachRO($('#dashboard'));
  attachRO($('#category-filter'));

  mutationObserver = new MutationObserver(() => {
    const cf = $('#category-filter');
    if (cf && !cf.__tb_ro) {
      attachRO(cf);
      positionToLayout();
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('tutorial:open', handleTutorialNudge);
  document.addEventListener('tutorial:step', handleTutorialNudge);
  document.addEventListener('tutorial:close', handleTutorialNudge);
}

function setCollapsed(next, { auto=false } = {}) {
  isCollapsed = !!next;
  els.wrap.classList.toggle('tb-collapsed', isCollapsed);
  els.toggle?.setAttribute('aria-expanded', (!isCollapsed).toString());

  if (auto) collapsedByAuto = isCollapsed;
  else collapsedByAuto = false;

  scheduleRelayout();
  if (chart) { try { chart.resize(); } catch {} }
}

function attachMapAutoCollapse() {
  const map = window.__DETAIL_MAP__;
  if (!map || typeof map.on !== 'function') return false;

  const handler = () => {
    const z = map.getZoom?.();
    if (!Number.isFinite(z)) return;

    if (z >= AUTO_COLLAPSE_ZOOM) {
      if (!isCollapsed) setCollapsed(true, { auto:true });
    } else {
      if (isCollapsed && collapsedByAuto) setCollapsed(false, { auto:true });
    }
  };

  map.on('zoomend', handler);
  handler();
  return true;
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
  if (isVisible(cf)) {
    const r = cf.getBoundingClientRect();
    left = Math.max(left, r.right + TINY.gap);
  }

  const db = $('#dashboard');
  if (isVisible(db)) {
    const r = db.getBoundingClientRect();
    right = Math.max(right, window.innerWidth - r.left + TINY.gap);
  }

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
  els.labFrom.textContent = PHASES_UI[a];
  els.labTo.textContent   = PHASES_UI[b];

  els.wrap.style.setProperty('--tb-from', a);
  els.wrap.style.setProperty('--tb-to', b);
  els.wrap.style.setProperty('--tb-count', PHASES.length);
}

function openHelp(open) {
  if (!els.pop) return;
  const next = (open == null) ? els.pop.hasAttribute('hidden') : !!open;
  if (next) els.pop.removeAttribute('hidden');
  else els.pop.setAttribute('hidden', '');
}

/* ---------------- slider custom (fix manopola destra) ---------------- */

function sliderIndexFromClientX(clientX) {
  const r = els.sliderUI.getBoundingClientRect();
  const x = Math.max(0, Math.min(r.width, clientX - r.left));
  const t = (r.width <= 0) ? 0 : (x / r.width);
  return Math.max(0, Math.min(PHASES.length - 1, Math.round(t * (PHASES.length - 1))));
}

function dispatchOn(el, type) {
  try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch {}
}

function attachCustomSlider() {
  if (!els.sliderUI) return;

  let active = null;      // 'from' | 'to'
  let lastIdx = null;
  let pointerId = null;

  const pickClosestHandle = (idx) => {
    const { a, b } = clampRange();
    const da = Math.abs(idx - a);
    const db = Math.abs(idx - b);
    if (da === db) return (idx < (a + b) / 2) ? 'from' : 'to';
    return (da < db) ? 'from' : 'to';
  };

  const setValue = (idx, final=false) => {
    lastIdx = idx;

    // set sul handle attivo
    if (active === 'from') els.from.value = String(idx);
    else els.to.value = String(idx);

    // trigger: input durante drag, change a fine drag
    dispatchOn(active === 'from' ? els.from : els.to, final ? 'change' : 'input');

    // se clampRange ha fatto swap (per incrocio), riallinea "active"
    const aNow = parseInt(els.from.value, 10);
    const bNow = parseInt(els.to.value, 10);
    if (active === 'from' && aNow !== idx) active = 'to';
    else if (active === 'to' && bNow !== idx) active = 'from';
  };

  const onMove = (e) => {
    if (pointerId == null) return;
    e.preventDefault();
    const idx = sliderIndexFromClientX(e.clientX);
    setValue(idx, false);
  };

  const endDrag = () => {
    if (pointerId == null) return;
    try { els.sliderUI.releasePointerCapture(pointerId); } catch {}
    pointerId = null;

    window.removeEventListener('pointermove', onMove, { passive: false });
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);

    // applica globale a fine drag
    if (Number.isFinite(lastIdx)) setValue(lastIdx, true);
    active = null;
  };

  const onUp = (e) => {
    e.preventDefault();
    endDrag();
  };

  const onDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();

    const idx = sliderIndexFromClientX(e.clientX);
    active = pickClosestHandle(idx);

    pointerId = e.pointerId;
    try { els.sliderUI.setPointerCapture(pointerId); } catch {}

    setValue(idx, false);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: false });
    window.addEventListener('pointercancel', onUp, { passive: false });
  };

  els.sliderUI.addEventListener('pointerdown', onDown, { passive: false });
}

/* ---------------- chart (no barre: area/line) ---------------- */

function makeAreaGradient(chartInstance) {
  const { ctx, chartArea } = chartInstance;
  if (!chartArea) return 'rgba(37,99,235,0.12)';
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, 'rgba(37,99,235,0.22)');
  g.addColorStop(1, 'rgba(37,99,235,0.03)');
  return g;
}

function ensureChart() {
  if (chart) return chart;

  const ctx = els.canvas.getContext('2d');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: PHASES_UI,
      datasets: [{
        label: 'Contexts',
        data: new Array(PHASES.length).fill(0),
        tension: 0.38,
        borderWidth: 2,
        borderColor: 'rgba(37,99,235,0.95)',
        fill: true,
        backgroundColor: (c) => makeAreaGradient(c.chart),
        pointRadius: 0,
        pointHitRadius: 10,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 520 },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => (items[0]?.label || ''),
            label: (ctx) => `${ctx.parsed?.y ?? 0} contexts`
          }
        },
        tbRangeShade: { from: 0, to: PHASES.length - 1 }
      },
      layout: { padding: { top: 8, right: 6, left: 6, bottom: 0 } },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            font: { size: 10 },
            callback: (v, i) => {
              const w = els.wrap?.getBoundingClientRect()?.width ?? 700;
              const step = (w < 520) ? 2 : 1;
              return (i % step === 0) ? PHASES_UI[i] : '';
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(2,6,23,0.06)' },
          ticks: { precision: 0, font: { size: 10 } }
        }
      }
    },
    plugins: [rangeShadePlugin(), hoverLinePlugin()]
  });

  return chart;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function rangeShadePlugin() {
  return {
    id: 'tbRangeShade',
    beforeDatasetsDraw(c, _args, opts) {
      const { chartArea: a, ctx, scales } = c;
      if (!a || !scales?.x) return;

      const x = scales.x;
      const from = Math.max(0, Math.min(PHASES.length-1, opts.from ?? 0));
      const to   = Math.max(0, Math.min(PHASES.length-1, opts.to ?? PHASES.length-1));
      const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;

      const x0 = x.getPixelForValue(from) - half;
      const x1 = x.getPixelForValue(to)   + half;

      ctx.save();

      ctx.fillStyle = 'rgba(34,197,94,0.10)';
      roundRect(ctx, x0, a.top, Math.max(0, x1 - x0), a.bottom - a.top, 12);
      ctx.fill();

      ctx.strokeStyle = 'rgba(34,197,94,0.22)';
      ctx.lineWidth = 1;
      roundRect(ctx, x0, a.top + 0.5, Math.max(0, x1 - x0), (a.bottom - a.top) - 1, 12);
      ctx.stroke();

      ctx.restore();
    }
  };
}

function hoverLinePlugin() {
  return {
    id: 'tbHoverLine',
    afterDatasetsDraw(c) {
      const { ctx, tooltip, chartArea } = c;
      if (!tooltip || !tooltip.getActiveElements || !chartArea) return;

      const act = tooltip.getActiveElements();
      if (!act || !act.length) return;

      const x = act[0].element?.x;
      if (!Number.isFinite(x)) return;

      ctx.save();
      ctx.strokeStyle = 'rgba(15,23,42,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  };
}

function readCounts() {
  const fn = window.__detail_computePhaseCounts;
  return (typeof fn === 'function') ? fn() : new Array(PHASES.length).fill(0);
}

function sumRange(arr, a, b) {
  let s = 0;
  for (let i = a; i <= b; i++) s += (+arr[i] || 0);
  return s;
}

function redraw(applyGlobal) {
  const { a, b } = clampRange();
  const includeUndated = !!els.undated.checked;

  if (applyGlobal && typeof window.__detail_setChronoRange === 'function') {
    window.__detail_setChronoRange(a, b, includeUndated);
  }

  const counts = readCounts();
  const max = Math.max(1, ...counts);

  const total = counts.reduce((acc, v) => acc + (+v || 0), 0);
  const inSel = sumRange(counts, a, b);
  if (els.statTotal) els.statTotal.textContent = String(total);
  if (els.statRange) els.statRange.textContent = String(inSel);

  const c = ensureChart();
  c.data.datasets[0].data = counts;
  c.options.plugins.tbRangeShade.from = a;
  c.options.plugins.tbRangeShade.to   = b;
  c.options.scales.y.max = Math.ceil(max * 1.08);

  c.update(firstRendered ? 'none' : undefined);

  if (!firstRendered) {
    firstRendered = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.wrap.dataset.ready = '1';
        try { document.dispatchEvent(new Event('timebar:ready')); } catch {}
      });
    });
  }
}

function handleTutorialNudge() {
  scheduleRelayout();
  if (chart) try { chart.resize(); } catch {}
}

/* ---------------- events ---------------- */

function attachEvents() {
  const onInput  = () => { syncLabels(); redraw(false); };
  const onChange = () => { syncLabels(); redraw(true); };

  els.from.addEventListener('input', onInput);
  els.to.addEventListener('input', onInput);
  els.from.addEventListener('change', onChange);
  els.to.addEventListener('change', onChange);

  els.undated.addEventListener('change', () => redraw(true));
  document.addEventListener('detail:filters-changed', () => redraw(false));

  els.toggle.addEventListener('click', () => setCollapsed(!isCollapsed, { auto:false }));

  els.helpBtn.addEventListener('click', () => openHelp());
  els.popClose?.addEventListener('click', () => openHelp(false));
  els.pop?.addEventListener('click', (e) => {
    if (e.target === els.pop) openHelp(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') openHelp(false);
  });

  attachCustomSlider(); // ✅ fix manopola destra
}

/* ---------- Bootstrap ---------- */
function boot() {
  if (!$('#map')) return;

  buildUI();
  attachEvents();

  const doSync = () => { syncLabels(); positionToLayout(); redraw(false); };

  document.addEventListener('detail:ready', doSync, { once: true });

  if (!attachMapAutoCollapse()) {
    document.addEventListener('detail:map-ready', () => attachMapAutoCollapse(), { once:true });
    let t = 0;
    const timer = setInterval(() => {
      if (attachMapAutoCollapse()) clearInterval(timer);
      if (++t > 60) clearInterval(timer);
    }, 150);
  }

  let tries = 0;
  const POLL_MS = 120;
  const MAX_TRIES = 75;
  const timer = setInterval(() => {
    if (typeof window.__detail_computePhaseCounts === 'function') {
      clearInterval(timer);
      doSync();
    } else if (++tries >= MAX_TRIES) {
      clearInterval(timer);
      ensureChart();
      positionToLayout();
    }
  }, POLL_MS);

  if (typeof window.__detail_computePhaseCounts === 'function') doSync();
  document.addEventListener('detail:filters-changed', () => redraw(false));
}

document.addEventListener('DOMContentLoaded', boot);

window.addEventListener('beforeunload', () => {
  resizeObservers.forEach(ro => { try { ro.disconnect(); } catch {} });
  try { mutationObserver?.disconnect(); } catch {}
});
