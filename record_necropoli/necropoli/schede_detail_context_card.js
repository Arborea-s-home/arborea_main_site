// schede_detail_context_card.js
// Card contesto: supporta entity/qt e, in qt, switch s_type (carpo/wood/all).
// Include: bottone "tabella" e bottone "info" (bootstrap icons).

import { getPath } from '../../path_utils.js';
import { ensureChartJs, makeColors, createWideDonutChart, createMiniBarChart, renderCompletionBars } from './schede_detail_charts.js';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])
  );
}
function t(v, fallback = 'N/D') {
  const s = String(v ?? '').trim();
  return s ? s : fallback;
}
function pickFirst(p, keys = []) {
  for (const k of keys) {
    const v = p?.[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return null;
}

function isQtContext(ctxFeature) {
  const q = String(ctxFeature?.properties?.q_e || '').trim().toLowerCase();
  return q === 'qt';
}
function normalizeSType(v) {
  return String(v || '').trim().toLowerCase();
}
function filterBySType(samples, stype) {
  if (!stype || stype === 'all') return samples || [];
  return (samples || []).filter(s => normalizeSType(s?.properties?.s_type) === stype);
}

function taxonLabelOf(sample) {
  const sp = sample?.properties || {};
  return String((sp.precise_taxon || sp.taxon || 'Unclassified')).trim() || 'Unclassified';
}

// qt aggregation
function aggregateQtByTaxon(samples) {
  const map = new Map();
  let total = 0;

  for (const s of (samples || [])) {
    const sp = s?.properties || {};
    const lab = taxonLabelOf(s);
    const raw = (sp.qt != null && sp.qt !== '') ? sp.qt : sp.quantity;
    const num = Number(raw);

    const old = map.get(lab) || { value: 0, text: new Set() };

    if (Number.isFinite(num)) {
      old.value += num;
      total += num;
    } else {
      const txt = String(raw || '').trim();
      if (txt) old.text.add(txt);
    }
    map.set(lab, old);
  }

  const labels = Array.from(map.keys());
  const values = labels.map(l => map.get(l)?.value || 0);
  const notes  = labels.map(l => {
    const st = map.get(l)?.text;
    return (st && st.size) ? Array.from(st).join(' - ') : '';
  });

  return { labels, values, notes, total };
}

// entity list (many/few)
function rowsForEntity(samples) {
  const order = { many: 3, few: 2 };
  const map = new Map();

  for (const s of (samples || [])) {
    const sp = s?.properties || {};
    const lab = taxonLabelOf(s);
    const ent = (sp.entity == null || sp.entity === '') ? null : String(sp.entity).toLowerCase().trim();

    const old = map.get(lab);
    if (!old) map.set(lab, { entity: ent, count: 1 });
    else {
      old.count += 1;
      const prev = old.entity || '';
      const sOld = order[prev] || 0;
      const sNew = order[ent] || 0;
      if (sNew > sOld) old.entity = ent;
    }
  }

  return Array.from(map.entries())
    .map(([label, v]) => ({ label, entity: v.entity, count: v.count }))
    .sort((a,b) => a.label.localeCompare(b.label));
}

function stypeToolbar(defaultVal = 'all', onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'stype-local-toolbar';

  let current = defaultVal || 'all';

  const mkBtn = (title, rel, value) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stype-local-btn';
    b.title = title;
    b.dataset.val = value;

    const img = document.createElement('img');
    img.alt = title;
    img.src = getPath(rel);
    b.appendChild(img);

    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActive(value);               // qui OK: chiama onChange
    });

    return b;
  };

  const btnCarpo = mkBtn('carpological', 'images/objects/carpo.png', 'carpological');
  const btnWood  = mkBtn('wood',        'images/objects/wood.png',  'wood');
  const btnAll   = mkBtn('all',         'images/logo_semplificato.png', 'all');

  wrap.appendChild(btnCarpo);
  wrap.appendChild(btnWood);
  wrap.appendChild(btnAll);

  function setActive(v, { silent = false } = {}) {
    current = v || 'all';
    [btnCarpo, btnWood, btnAll].forEach(b =>
      b.classList.toggle('active', b.dataset.val === current)
    );

    if (!silent && typeof onChange === 'function') onChange(current);
  }

  // ✅ Inizializza SOLO lo stato UI, senza scatenare renderBody()
  setActive(current, { silent: true });

  return { el: wrap, setActive, getActive: () => current };
}

  function buildContextInfoHtml(ctxFeature) {
    const p = ctxFeature?.properties || {};

    const rows = [
    ['Part of', t(p.parent_context || p.site_name_brain || p.site_name, '-')],
    ['Periods', t(p.parent_chronology_iccd || p.periods, '-')],
    ['Sub-periods', t(p.chronology_iccd || p.subperiods, '-')],
    ['Reliability', t(p.c_appr || p.reliability, '-')],
    ['Province / Region', t([p.province, p.region || p.modern_region].filter(Boolean).join(' — '), '-')],
    ['Brain code', t(p.site_code || p.brain_code, '-')],
    ['Context ID', t(p.fid || p.id || p.context_id, '-')],
    // ✅ NEW: il campo "bibliography" (quello “lungo” del GeoJSON) va nell’elenco info
    ['Bibliography', t(p.bibliography, '/')]
  ];

  const rawNotes = String(p.c_notes || '').trim();

  // ✅ la “bibliography” che sta dentro c_notes (sottostringa dopo "Bibliography:")
  // va sotto la descrizione (overview), NON nell’elenco info.
  const m = rawNotes.match(/(^|\n)\s*Bibliography\s*:\s*/i);

  let overview = rawNotes || '/';
  let bibliography = '/';

  if (m && m.index != null) {
    const idx = m.index;
    const cut = idx + m[0].length;

    overview = rawNotes.slice(0, idx).trim() || '/';
    bibliography = rawNotes.slice(cut).trim() || '/';
  }

  return `
    <div class="sd-card-info-inner">
      <div class="sd-info-panel-grid">
        <div>
          <div class="sd-side-card" style="position:static; top:auto;">
            <div class="sd-side-title">Info</div>
            <div class="sd-info">
              ${rows.map(([k,v]) => `
                <div class="sd-info-row">
                  <div class="sd-info-k">${escapeHtml(k)}</div>
                  <div class="sd-info-v">${escapeHtml(t(v,'-'))}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div>
          <article class="sd-overview-card">
            <div class="sd-overview-head">
              <div class="sd-overview-title">Context Description</div>
            </div>
            <div class="sd-overview-body">
              <div class="sd-overview-text">${escapeHtml(overview)}</div>
              <div class="sd-overview-bib">
                <div class="sd-overview-bib-title">Bibliography</div>
                <div class="sd-overview-bib-text">${escapeHtml(bibliography)}</div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  `;
}

function renderQtLegend(host, {
  labels = [],
  values = [],
  colors = [],
  donutChart = null,
  barChart = null,
  onChange
} = {}) {
  if (!host) return;
  host.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'sd-legend';

  const getVisible = (i) => {
    if (donutChart?.getDataVisibility) return donutChart.getDataVisibility(i);
    const ds = barChart?.data?.datasets?.[0];
    return ds ? ds.data[i] != null : true;
  };

  const setVisible = (i, show) => {
    // donut: toggleDataVisibility è "toggle", quindi lo usiamo solo se serve
    if (donutChart?.getDataVisibility && donutChart?.toggleDataVisibility) {
      const cur = donutChart.getDataVisibility(i);
      if (cur !== show) donutChart.toggleDataVisibility(i);
    }

    // bar: null = nascosto
    const ds = barChart?.data?.datasets?.[0];
    if (ds) ds.data[i] = show ? values[i] : null;
  };

  const computeVisibleValues = () =>
    values.map((v, i) => (getVisible(i) ? v : 0));

  labels.forEach((lab, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sd-legend-item';
    btn.title = String(lab || '');

    btn.innerHTML = `
      <span class="sd-legend-swatch" style="--c:${colors[i] || 'rgba(255,255,255,.35)'}"></span>
      <span class="sd-legend-label">${escapeHtml(String(lab || ''))}</span>
    `;

    const syncDisabled = () => {
      btn.classList.toggle('disabled', !getVisible(i));
    };

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const next = !getVisible(i);
      setVisible(i, next);

      try { donutChart?.update?.(); } catch {}
      try { barChart?.update?.(); } catch {}

      syncDisabled();

      if (typeof onChange === 'function') {
        onChange(computeVisibleValues());
      }
    });

    syncDisabled();
    wrap.appendChild(btn);
  });

  host.appendChild(wrap);
}

export function createContextCard(ctxFeature, samplesForThisContext = []) {
  const p = ctxFeature?.properties || {};
  const qtMode = isQtContext(ctxFeature);

  const title = t(p.context_name || p.context || p.name, 'Context');

  const el = document.createElement('article');
  el.className = 'sd-card';

  const taxaSet = new Set((samplesForThisContext || []).map(s => taxonLabelOf(s)));

  el.innerHTML = `
    <div class="sd-card-head">
      <div class="sd-card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
      <div class="sd-card-meta">
        <span class="sd-chip">S:${samplesForThisContext.length}</span>
        <span class="sd-chip">T:${taxaSet.size}</span>
        <span class="sd-chip">${qtMode ? 'qt' : 'entity'}</span>
      </div>
      <div class="sd-card-actions">
        <button class="sd-ibtn js-table" type="button" title="Show table">
          <i class="bi bi-table"></i>
        </button>
        <button class="sd-ibtn js-info" type="button" title="Show info">
          <i class="bi bi-info-circle"></i>
        </button>
      </div>
    </div>
  `;

  let stype = 'all';
  if (qtMode) {
    const tb = stypeToolbar('all', (v) => { stype = v; renderBody(); });
    el.appendChild(tb.el); // ✅ niente "c"
  }

  const body = document.createElement('div');
  body.className = 'sd-card-body';
  el.appendChild(body);

  const btnTable = el.querySelector('.js-table');
  const btnInfo  = el.querySelector('.js-info');

  let showTable = false;
  let showInfo  = false;
  let donutChart = null;
  let barChart   = null;

  function destroyCharts() {
    try { donutChart?.destroy?.(); } catch {}
    try { barChart?.destroy?.(); } catch {}
    donutChart = null;
    barChart = null;
  }

    function renderEntityView() {
    const carpo = rowsForEntity(filterBySType(samplesForThisContext, 'carpological'));
    const wood  = rowsForEntity(filterBySType(samplesForThisContext, 'wood'));

    if (showTable) {
      const rows = (samplesForThisContext || []).map(s => {
        const sp = s?.properties || {};
        return {
          taxon: taxonLabelOf(s),
          entity: sp.entity || '-',
          s_type: sp.s_type || '-'
        };
      }).sort((a,b) => a.taxon.localeCompare(b.taxon));

      body.innerHTML = `
        <div class="sd-table-wrap">
          <table class="sd-table">
            <thead><tr><th>Taxon</th><th>Entity</th><th>Type</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td title="${escapeHtml(r.taxon)}">${escapeHtml(r.taxon)}</td>
                  <td>${escapeHtml(r.entity)}</td>
                  <td>${escapeHtml(r.s_type)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    const section = (lab, arr, open) => `
      <details class="sd-elist" ${open ? 'open' : ''}>
        <summary>
          <span class="sd-elist-chip">${escapeHtml(lab)}</span>
          <span class="sd-elist-count">(${arr.length})</span>
        </summary>
        <div class="sd-elist-body">
          ${arr.length ? `
            <ul>
              ${arr.map(x => `
                <li>
                  <span class="sd-elist-taxon" title="${escapeHtml(x.label)}">${escapeHtml(x.label)}</span>
                  ${x.entity ? `<span class="sd-elist-entity">(${escapeHtml(x.entity)})</span>` : ''}
                </li>
              `).join('')}
            </ul>
          ` : `<div class="sd-muted">No data</div>`}
        </div>
      </details>
    `;

    body.innerHTML = `
      <div class="sd-entity">
        ${section('carpological', carpo, true)}
        ${section('wood', wood, false)}
      </div>
    `;
  }

  async function renderQtView() {
    const subset = filterBySType(samplesForThisContext, stype);
    const { labels, values, total } = aggregateQtByTaxon(subset);

    // ✅ TABLE view = davvero tabella (non dashboard)
    if (showTable) {
      destroyCharts();
      const rows = labels.map((l,i) => ({ taxon: l, qt: values[i] || 0 }))
        .sort((a,b) => (b.qt - a.qt) || a.taxon.localeCompare(b.taxon));

      body.innerHTML = `
        <div class="sd-table-wrap">
          <table class="sd-table">
            <thead><tr><th>Taxon</th><th>qt</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td title="${escapeHtml(r.taxon)}">${escapeHtml(r.taxon)}</td>
                  <td class="sd-td-num">${escapeHtml(r.qt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (!labels.length || total <= 0) {
      destroyCharts();
      body.innerHTML = `<div class="sd-empty">No quantitative data for selected type.</div>`;
      return;
    }

    // ✅ DASHBOARD unificata (sfondo unico)
    body.innerHTML = `
      <div class="sd-qdash">
        <div class="sd-qwrap">
          <div class="sd-qdonut">
            <canvas class="sd-canvas"></canvas>
          </div>

          <div class="sd-qright">
            <div class="sd-qbar">
              <canvas class="sd-canvas"></canvas>
            </div>

            <div class="sd-qcomp">
              <div class="sd-comp"></div>
            </div>
          </div>
        </div>
          <div class="sd-qlegend"></div>
      </div>
    `;

    const canv = body.querySelectorAll('canvas.sd-canvas');
    const donutCanvas = canv[0];
    const barCanvas   = canv[1];
    const compHost    = body.querySelector('.sd-comp');

    const colors = makeColors(labels.length);

    await ensureChartJs();
    destroyCharts();

    donutChart = createWideDonutChart(donutCanvas.getContext('2d'), { labels, values, colors });
    barChart   = createMiniBarChart(barCanvas.getContext('2d'), { labels, values, colors });
    renderCompletionBars(compHost, { labels, values, topN: 4 });
    
    const legendHost = body.querySelector('.sd-qlegend');
      renderQtLegend(legendHost, {
        labels,
        values,
        colors,
        donutChart,
        barChart,
        onChange: (visibleValues) => {
          // riallinea anche il pannello “completion”
          renderCompletionBars(compHost, { labels, values: visibleValues, topN: 4 });
        }
      });
  }

  function renderBody() {
    destroyCharts();

    btnTable?.classList.toggle('active', showTable);
    btnInfo?.classList.toggle('active', showInfo);

    // ✅ INFO sostituisce il body
    if (showInfo) {
      body.innerHTML = buildContextInfoHtml(ctxFeature);
      return;
    }

    if (!samplesForThisContext.length) {
      body.innerHTML = `<div class="sd-empty">No samples for this context.</div>`;
      return;
    }

    if (qtMode) renderQtView().catch(() => {
      body.innerHTML = `<div class="sd-empty">Chart unavailable.</div>`;
    });
    else renderEntityView();
  }

  btnTable?.addEventListener('click', () => {
    showTable = !showTable;
    renderBody();
  });

  btnInfo?.addEventListener('click', () => {
    showInfo = !showInfo;
    renderBody();
  });

  renderBody();

  return {
    el,
    destroy() { destroyCharts(); }
  };
}
