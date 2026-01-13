// schede_detail_full.js
// Costruisce la "full card" per un sito a partire da {site, contexts, contextsCount}
// e usa createContextCard() per creare le cards contesto (2 per row).
//
// Richiede samplesFeatures per popolare grafici / entity / qt nei contesti.
// Puoi passarli con setSamplesForDetail(samplesFeatures) una volta, oppure li prende da window.__SAMPLES__ se esiste.

import { getPath } from '../../path_utils.js';
import { createContextCard } from './schede_detail_context_card.js';

let _samplesFeatures = null;

export function setSamplesForDetail(samplesFeatures) {
  _samplesFeatures = Array.isArray(samplesFeatures) ? samplesFeatures : [];
}

function ensureCssLoaded() {
  const ID = 'schede-detail-css';
  if (document.getElementById(ID)) return;

  let href = '';
  try {
    // da /record_necropoli/necropoli -> /record_necropoli/css
    href = new URL('../css/schede_detail.css', import.meta.url).href;
  } catch (e) {
    href = (typeof getPath === 'function')
      ? getPath('css/schede_detail.css')
      : '../css/schede_detail.css';
  }

  const link = document.createElement('link');
  link.id = ID;
  link.rel = 'stylesheet';
  link.href = href;

  link.onerror = () => {
    const alt = '../css/schede_detail.css';
    if (link.href !== alt) link.href = alt;
  };

  document.head.appendChild(link);
}

// (opzionale) preload immediato, così lo hai già quando apri la detail
ensureCssLoaded();

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])
  );
}

function normalizeWs(s){
  return String(s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function t(v, fallback = 'N/D') {
  const s = String(v ?? '').trim();
  return s ? s : fallback;
}

/**
 * Estrae overview + bibliography da un testo che può contenere "Bibliography:".
 * - match ovunque (non solo inizio riga), perché può essere attaccato in fondo a un paragrafo
 * - bibliography fallback: usa bibFallback se non c'è la sezione nel testo o se è vuota
 */
function parseOverviewAndBibliography(rawText, bibFallback = '') {
  const txt = normalizeWs(rawText).trim();
  const fb = normalizeWs(bibFallback).trim();

  if (!txt && !fb) return { overview: '/', bibliography: '/' };
  if (!txt) return { overview: '/', bibliography: fb || '/' };

  const re = /bibliography\s*:\s*/i;
  const m = re.exec(txt);
  if (!m) return { overview: txt || '/', bibliography: fb || '/' };

  const idx = m.index;
  if (!Number.isFinite(idx) || idx < 0) return { overview: txt || '/', bibliography: fb || '/' };

  const overview = txt.slice(0, idx).trim() || '/';
  const bibliographyTail = txt.slice(idx + m[0].length).trim();
  const bibliography = bibliographyTail || fb || '/';

  return { overview, bibliography };
}

function buildOverviewCardHtml({ title, rawText, bibFallback }) {
  const { overview, bibliography } = parseOverviewAndBibliography(rawText, bibFallback);

  return `
    <article class="sd-overview-card">
      <div class="sd-overview-head">
        <div class="sd-overview-title">${escapeHtml(title || 'Overview')}</div>
      </div>
      <div class="sd-overview-body">
        <div class="sd-overview-text">${escapeHtml(overview)}</div>
        <div class="sd-overview-bib">
          <div class="sd-overview-bib-title">Bibliography</div>
          <div class="sd-overview-bib-text">${escapeHtml(bibliography)}</div>
        </div>
      </div>
    </article>
  `;
}

function buildInfoRowsHtml(rows = []) {
  return `
    <div class="sd-info">
      ${rows.map(([k,v]) => `
        <div class="sd-info-row">
          <div class="sd-info-k">${escapeHtml(k)}</div>
          <div class="sd-info-v">${escapeHtml(t(v, '-'))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildSiteInfoCard(item) {
  const p = item?.site?.properties || {};

  const name = t(p.name || p.site_name_brain || p.site_code, 'Site');
  const rows = [
    ['Site code', t(p.site_code, '-')],
    ['Region', t(p.region, '-')],
    ['Province', t(p.province, '-')],
    ['Typology', t(p.typology, '-')],
    ['Chronology', t(p.chronology_iccd || p.parent_chronology_iccd, '-')],
    ['Contexts', String(item?.contextsCount ?? 0)]
  ];

  return `
    <aside class="sd-side-card">
      <div class="sd-side-title" title="${escapeHtml(name)}">Info</div>
      ${buildInfoRowsHtml(rows)}
    </aside>
  `;
}

function indexSamplesByContext(samplesFeatures) {
  const m = new Map();
  for (const s of (samplesFeatures || [])) {
    const sp = s?.properties || {};
    const raw = sp.context_id ?? sp.context ?? sp.context_fid;
    if (raw == null || String(raw).trim() === '') continue;

    const k1 = String(raw).trim();
    if (!m.has(k1)) m.set(k1, []);
    m.get(k1).push(s);

    // anche forma numerica normalizzata
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const k2 = String(n);
      if (!m.has(k2)) m.set(k2, []);
      m.get(k2).push(s);
    }
  }
  return m;
}

export function makeSiteDetailElFull(item, { onBack } = {}) {
  ensureCssLoaded();

  const p = item?.site?.properties || {};
  const name = t(p.name || p.site_name_brain || p.site_code, 'Site');

  // samples: da setter, oppure fallback se usi global
  const samples = Array.isArray(_samplesFeatures)
    ? _samplesFeatures
    : (Array.isArray(window.__SAMPLES__) ? window.__SAMPLES__ : []);

  const samplesByContext = indexSamplesByContext(samples);

  const wrap = document.createElement('section');
  wrap.className = 'cards-detail';

  // overview: campo corretto da siti.geojson = c_notes
  const overviewRaw =
    p.c_notes ||
    p.overview ||
    p.s_notes ||
    p.notes ||
    p.description ||
    '';

  wrap.innerHTML = `
    <div class="detail-head">
      <div style="min-width:0;">
        <h3 class="detail-title" title="${escapeHtml(name)}">${escapeHtml(name)}</h3>
      </div>
      <button class="detail-back" type="button">
        <i class="bi bi-arrow-left"></i>
        Back
      </button>
    </div>

    <div class="sd-wrap">
      <div class="sd-top">
        <div class="sd-top-left">
          ${buildOverviewCardHtml({
            title: 'Site Overview',
            rawText: overviewRaw,
            bibFallback: (p.bibliography || '')
          })}
        </div>
        <div class="sd-top-right">
          ${buildSiteInfoCard(item)}
        </div>
      </div>

      <div class="sd-section">
        <div class="sd-section-title">Contexts</div>
        <div class="sd-grid" id="sd-contexts-grid"></div>
      </div>
    </div>
  `;

  wrap.querySelector('.detail-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    onBack?.();
  });

  const grid = wrap.querySelector('#sd-contexts-grid');

  const contexts = Array.isArray(item?.contexts) ? item.contexts : [];
  if (!contexts.length) {
    grid.innerHTML = `<div class="sd-empty">No contexts associated with this site.</div>`;
    return wrap;
  }

  // 2 per row, top-aligned: gestito via CSS (.sd-grid align-items:start)
  for (const ctx of contexts) {
    const ctxId = ctx?.properties?.fid ?? ctx?.properties?.id ?? ctx?.properties?.context_id;
    const arr = samplesByContext.get(String(ctxId)) || [];
    const card = createContextCard(ctx, arr); // <-- attach logica qt/entity + switch s_type
    grid.appendChild(card.el);
  }

  return wrap;
}
