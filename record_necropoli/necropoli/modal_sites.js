// record_necropoli/necropoli/modal_sites.js
import { getPath } from '../../path_utils.js';

/* === Carica (una volta) il CSS base del popup tombe, così ereditiamo lo stile === */
(function loadPopupBaseCSS() {
  try {
    if ([...document.styleSheets].some(s => s.href && /popup_tombe\.css/i.test(s.href))) return;
  } catch {}
  let href;
  try { href = new URL('../css/popup_tombe.css', import.meta.url).href; } catch (_) {}
  if (!href) href = (typeof getPath === 'function') ? getPath('css/popup_tombe.css') : '../css/popup_tombe.css';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
})();

/* === Carica (una volta) il CSS specifico sito === */
(function loadPopupSitoCSS() {
  try {
    if ([...document.styleSheets].some(s => s.href && /popup_sito\.css/i.test(s.href))) return;
  } catch {}
  let href;
  try { href = new URL('../css/popup_sito.css', import.meta.url).href; } catch (_) {}
  if (!href) href = (typeof getPath === 'function') ? getPath('css/popup_sito.css') : '../css/popup_sito.css';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
})();

/* ========= Helpers ========= */
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
  );
}

function splitValues(raw) {
  return String(raw || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}
function renderBubbles(raw) {
  const items = splitValues(raw);
  if (!items.length) return '<span class="empty">-</span>';
  return `<div class="bubble-wrap">${items.map(v =>
    `<span class="bubble" title="${escapeHtml(v)}">${escapeHtml(v)}</span>`
  ).join('')}</div>`;
}

function normalizeWs(s){
  return String(s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function renderParagraphs(text){
  const t = normalizeWs(text).trim();
  if (!t) return `<div class="site-overview-empty"><em>No overview reported.</em></div>`;
  const paras = t.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
  return paras.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

/**
 * Estrae:
 * - overview: testo senza la sezione Bibliography:
 * - refs: lista refs trovate dopo "Bibliography:"
 *
 * NOTE:
 * - lavora su c_notes
 * - "Bibliography:" può comparire anche a fine paragrafo, quindi match ovunque
 */
function extractOverviewAndRefsFromCNotes(raw){
  const t = normalizeWs(raw).trim();
  if (!t) return { overview: '', refs: [] };

  const re = /bibliography\s*:\s*/i;
  const m = re.exec(t);
  if (!m) return { overview: t, refs: [] };

  const idx = m.index;
  if (!Number.isFinite(idx) || idx < 0) return { overview: t, refs: [] };

  const head = t.slice(0, idx).trim();
  const tail = t.slice(idx + m[0].length).trim();

  const refs = tail
    .split(/;|\n/g)
    .map(x => x.trim())
    .filter(Boolean);

  return { overview: head, refs };
}

/* ========= Portals ========= */
function portalsButtons(siteProps) {
  const code = (siteProps.site_code || '').toString().trim();
  const brainUrl = 'https://brainplants.successoterra.net/index.html';
  const hasBrain = !!code;

  const q = (siteProps.osm_wikidata || '').toString().trim();
  const wdUrl = q ? `https://www.wikidata.org/wiki/${encodeURIComponent(q)}` : null;

  const commons = (siteProps.osm_wikimedia_commons || '').toString().trim();
  const wmUrl = commons ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(commons.replace(/\s+/g, '_'))}` : null;

  const wp = (siteProps.osm_wikipedia || '').toString().trim();
  let wpUrl = null;
  if (wp) {
    const parts = wp.split(':');
    if (parts.length >= 2) {
      const lang = parts[0] || 'en';
      const title = parts.slice(1).join(':').replace(/\s+/g, '_');
      wpUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
    } else {
      wpUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wp.replace(/\s+/g, '_'))}`;
    }
  }

  function btn(label, hrefOrNull) {
    const ok = !!hrefOrNull;
    const cls = ok ? 'ok' : 'ko';
    const attrs = ok ? `href="${hrefOrNull}" target="_blank" rel="noopener"` : 'tabindex="-1" aria-disabled="true"';
    return `<a class="portal-btn ${cls}" ${attrs}><span>${label}</span></a>`;
  }

  return `
    <div class="portal-grid">
      ${btn('Brainplants', hasBrain ? brainUrl : null)}
      ${btn('Wikidata', wdUrl)}
      ${btn('Wikimedia', wmUrl)}
      ${btn('Wikipedia', wpUrl)}
    </div>
  `;
}

/* ========= Tabs builders ========= */
function buildInfoTab(siteFeature) {
  const p = siteFeature?.properties || {};
  const name = p.name || p.site_name_brain || p.site_code || 'Site';
  const typology = p.typology || '-';
  const reliab = (p.c_appr != null) ? String(p.c_appr) : '-';
  const provReg = [p.province, p.region].filter(Boolean).join(' — ') || '-';

  const siteCode = (p.site_code != null && p.site_code !== '')
    ? String(p.site_code)
    : '-';

  const periods = (p.parent_chronology_iccd || '').trim();
  const subperiods = (p.chronology_iccd || '').trim();

  const geomSrc = [p.source, p.source_type]
    .map(v => v ? String(v) : '')
    .filter(Boolean)
    .join(' (') + (p.source_type ? ')' : '');

  const { overview } = extractOverviewAndRefsFromCNotes(p.c_notes || '');

  return `
    <div class="tomb-info" style="padding-top:6px;">
      <div class="tomb-info-box tomb-info--base">
        <div class="tomb-info-row">
          <div class="tomb-info-k">Site</div>
          <div class="tomb-info-v">${escapeHtml(name)}</div>
        </div>

        <div class="tomb-info-row">
          <div class="tomb-info-k">Brainplants code</div>
          <div class="tomb-info-v">${escapeHtml(siteCode)}</div>
        </div>

        <div class="tomb-info-row">
          <div class="tomb-info-k">Typology</div>
          <div class="tomb-info-v">${escapeHtml(typology)}</div>
        </div>

        <div class="tomb-info-row">
          <div class="tomb-info-k">Reliability</div>
          <div class="tomb-info-v">${escapeHtml(reliab)}</div>
        </div>

        <div class="tomb-info-row">
          <div class="tomb-info-k">Province / Region</div>
          <div class="tomb-info-v">${escapeHtml(provReg)}</div>
        </div>

        <div class="tomb-info-row">
          <div class="tomb-info-k">Periods</div>
          <div class="tomb-info-v">${renderBubbles(periods)}</div>
        </div>

        <div class="tomb-info-row">
          <div class="tomb-info-k">Sub-periods</div>
          <div class="tomb-info-v">${renderBubbles(subperiods)}</div>
        </div>

        <div class="tomb-info-row">
          <div class="tomb-info-k">Geometry source</div>
          <div class="tomb-info-v">${escapeHtml(geomSrc || '-')}</div>
        </div>
      </div>

      <div class="site-overview">
        <div class="site-overview-title">Site’s overview</div>
        <div class="site-overview-body">
          ${renderParagraphs(overview)}
        </div>
      </div>
    </div>
  `;
}

function buildReferencesTab(siteFeature) {
  const p = siteFeature?.properties || {};
  const rawField = (p.bibliography || '').trim();
  const fieldItems = rawField ? rawField.split(';').map(s => s.trim()).filter(Boolean) : [];

  // refs estratte da "Bibliography:" dentro c_notes
  const { refs: cNotesRefs } = extractOverviewAndRefsFromCNotes(p.c_notes || '');

  // merge + unique
  const uniq = new Set();
  [...cNotesRefs, ...fieldItems].forEach(x => { if (x) uniq.add(x); });
  const refs = [...uniq];

  const refsHtml = refs.length
    ? `<ul class="refs-list">${refs.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
    : `<em>No references reported.</em>`;

  return `
    <div class="site-refs">
      <div class="site-refs-block">
        <div class="site-refs-title">References</div>
        <div class="site-refs-body">${refsHtml}</div>
      </div>

      <div class="site-refs-block">
        <div class="site-refs-title">Other portals</div>
        <div class="site-refs-body">${portalsButtons(p)}</div>
      </div>
    </div>
  `;
}

/* ========= Contexts tab (Leaflet mini-map + carousel controls) ========= */
function makeCtxLabel(ctx){
  const cp = ctx?.properties || {};
  return (cp.context_name || cp.name || `Context ${cp.fid ?? ''}`).toString().trim();
}

function buildContextsTab(siteFeature, contexts) {
  const holder = document.createElement('div');
  holder.className = 'tomb-info';

  if (!contexts.length) {
    holder.innerHTML = `<div class="tomb-info" style="padding:8px 2px;"><em>No contexts for this site.</em></div>`;
    return { el: holder, init: () => {}, destroy: () => {} };
  }

  const sorted = contexts.slice().sort((a,b) => {
    const A = makeCtxLabel(a).toLowerCase();
    const B = makeCtxLabel(b).toLowerCase();
    return A.localeCompare(B);
  });

  const carousel = document.createElement('div');
  carousel.className = 'ctx-carousel';
  carousel.setAttribute('data-total', String(sorted.length));

  const prevBtn = document.createElement('button');
  prevBtn.className = 'ctx-nav prev';
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous');
  prevBtn.textContent = '◀';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'ctx-nav next';
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next');
  nextBtn.textContent = '▶';

  const viewport = document.createElement('div');
  viewport.className = 'ctx-viewport';

  // singola “card” con mini-map
  const card = document.createElement('div');
  card.className = 'ctx-card';
  const inner = document.createElement('div');
  inner.className = 'ctx-card-inner';
  const wrapper = document.createElement('div');
  wrapper.className = 'ctx-geom-wrapper';

  const geomBox = document.createElement('div');
  geomBox.className = 'ctx-geom-box ctx-geom-box--context';

  const miniMapEl = document.createElement('div');
  miniMapEl.className = 'ctx-mini-map';
  miniMapEl.setAttribute('aria-label', 'Context preview map');

  const head = document.createElement('div');
  head.className = 'ctx-head';
  head.innerHTML = `
    <div class="ctx-head-title"></div>
    <div class="ctx-head-row"><span class="lab">Periods:</span> <span class="ctx-periods"></span></div>
    <div class="ctx-head-row"><span class="lab">Sub-periods:</span> <span class="ctx-subperiods"></span></div>
    <a href="#" class="ctx-open" data-open-context="" aria-label="Open context">Open context</a>
  `;

  const attrib = document.createElement('div');
  attrib.className = 'ctx-mini-attrib';
  attrib.textContent = '© OpenStreetMap contributors';

  geomBox.appendChild(miniMapEl);
  geomBox.appendChild(head);
  geomBox.appendChild(attrib);

  wrapper.appendChild(geomBox);
  inner.appendChild(wrapper);
  card.appendChild(inner);
  viewport.appendChild(card);

  const dots = document.createElement('div');
  dots.className = 'ctx-dots';
  dots.innerHTML = sorted.map((_,i)=>`<span class="dot ${i===0?'active':''}" data-go="${i}"></span>`).join('');

  carousel.appendChild(prevBtn);
  carousel.appendChild(viewport);
  carousel.appendChild(nextBtn);
  carousel.appendChild(dots);

  holder.appendChild(carousel);

  // --- Leaflet mini-map lifecycle
  let miniMap = null;
  let baseLayer = null;
  let siteLayer = null;
  let ctxLayer = null;
  let index = 0;

  function updateHead(i){
    const ctx = sorted[i];
    const cp = ctx?.properties || {};
    const titleEl = head.querySelector('.ctx-head-title');
    const periodsEl = head.querySelector('.ctx-periods');
    const subpEl = head.querySelector('.ctx-subperiods');
    const openA = head.querySelector('a.ctx-open');

    if (titleEl) titleEl.textContent = makeCtxLabel(ctx);
    if (periodsEl) periodsEl.innerHTML = renderBubbles((cp.parent_chronology_iccd || '').trim());
    if (subpEl) subpEl.innerHTML = renderBubbles((cp.chronology_iccd || '').trim());
    if (openA) openA.setAttribute('data-open-context', String(Number(cp.fid) || ''));
  }

  function setDots(i){
    [...dots.querySelectorAll('.dot')].forEach((d,k) => d.classList.toggle('active', k === i));
  }

  function ensureMap(){
    if (miniMap) return;

    if (!window.L || !L.map) {
      console.warn('[modal_sites] Leaflet non disponibile per mini-map.');
      return;
    }

    miniMap = L.map(miniMapEl, {
      attributionControl: false,
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false
    });

    // OSM base (trasparente)
    baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      opacity: 0.35,
      maxZoom: 19
    }).addTo(miniMap);

    siteLayer = L.geoJSON(siteFeature, {
      style: { color:'#2563eb', weight:2, fillColor:'#60a5fa', fillOpacity:0.10 }
    }).addTo(miniMap);

    ctxLayer = L.geoJSON(null, {
      style: { color:'#8b2f00', weight:2, fillColor:'#fbbf24', fillOpacity:0.42 }
    }).addTo(miniMap);

    // prima render
    updateMapForIndex(0);

    // fix sizing
    setTimeout(() => {
      try { miniMap.invalidateSize(); } catch {}
    }, 80);
  }

  function updateMapForIndex(i){
    if (!miniMap || !ctxLayer) return;

    const ctx = sorted[i];
    ctxLayer.clearLayers();
    try { ctxLayer.addData(ctx); } catch {}

    updateHead(i);
    setDots(i);

    // fit bounds su union (site + ctx)
    try {
      const sb = siteLayer?.getBounds?.();
      const cb = ctxLayer?.getBounds?.();
      let b = null;
      if (sb?.isValid?.()) b = sb;
      if (cb?.isValid?.()) b = b ? b.extend(cb) : cb;
      if (b?.isValid?.()) miniMap.fitBounds(b.pad(0.12), { animate: false });
    } catch {}
  }

  function show(i){
    const total = sorted.length;
    index = ((i % total) + total) % total;
    updateHead(index);
    setDots(index);
    if (miniMap) updateMapForIndex(index);
  }

  // events
  prevBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); show(index - 1); });
  nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); show(index + 1); });

  dots.addEventListener('click', (e) => {
    const d = e.target.closest('.dot');
    if (!d) return;
    const go = Number(d.getAttribute('data-go'));
    if (Number.isFinite(go)) show(go);
  });

  // swipe
  let sx = null;
  viewport.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  viewport.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (dx > 30) show(index - 1);
    else if (dx < -30) show(index + 1);
  });

  // init head now
  updateHead(0);

  return {
    el: holder,
    init: () => { ensureMap(); },
    destroy: () => {
      try { miniMap?.remove(); } catch {}
      miniMap = null;
      baseLayer = null;
      siteLayer = null;
      ctxLayer = null;
    }
  };
}

/* ========= Modal controller ========= */
let __modal = null;

export function closeSiteModal(){
  if (!__modal) return;
  try { __modal.cleanup?.(); } catch {}
  try { __modal.overlay?.remove(); } catch {}
  document.body.classList.remove('site-modal-open');
  __modal = null;
}

export function openSiteModal(siteFeature, allContexts = []) {
  closeSiteModal();

  const p = siteFeature?.properties || {};
  const siteId = Number(p.fid);
  const contexts = (allContexts || []).filter(c => Number(c?.properties?.parent_id) === siteId);

  const overlay = document.createElement('div');
  overlay.className = 'site-modal-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');

  const panel = document.createElement('div');
  panel.className = 'site-modal-panel';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'site-modal-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label','Close');
  closeBtn.innerHTML = '&times;';

  // content wrapper (riuso classi)
  const container = document.createElement('div');
  container.className = 'popup-tomba-wrapper popup-large';

  const title = document.createElement('div');
  title.className = 'popup-tomba-title';
  title.textContent = p.name || p.site_name_brain || p.site_code || 'Site';

  const switcher = document.createElement('div');
  switcher.className = 'tomb-switcher';
  switcher.innerHTML = `
    <button class="ts-btn active" data-mode="info">Info</button>
    <button class="ts-btn" data-mode="contexts">Contexts</button>
    <button class="ts-btn" data-mode="refs">References</button>
  `;

  const infoBox = document.createElement('div');
  infoBox.className = 'tomb-info-box';
  infoBox.style.display = 'block';
  infoBox.innerHTML = buildInfoTab(siteFeature);

  // contexts
  const contextsBox = document.createElement('div');
  contextsBox.className = 'tomb-info-box';
  contextsBox.style.display = 'none';
  const ctxPack = buildContextsTab(siteFeature, contexts);
  contextsBox.appendChild(ctxPack.el);

  // refs
  const refsBox = document.createElement('div');
  refsBox.className = 'tomb-info-box';
  refsBox.style.display = 'none';
  refsBox.innerHTML = buildReferencesTab(siteFeature);

  container.appendChild(title);
  container.appendChild(switcher);
  container.appendChild(infoBox);
  container.appendChild(contextsBox);
  container.appendChild(refsBox);

  panel.appendChild(closeBtn);
  panel.appendChild(container);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.body.classList.add('site-modal-open');

  function setActive(mode){
    switcher.querySelectorAll('.ts-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    infoBox.style.display     = (mode === 'info')     ? 'block' : 'none';
    contextsBox.style.display = (mode === 'contexts') ? 'block' : 'none';
    refsBox.style.display     = (mode === 'refs')     ? 'block' : 'none';

    if (mode === 'contexts') {
      try { ctxPack.init?.(); } catch {}
    }
  }

  switcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.ts-btn'); if (!btn) return;
    setActive(btn.dataset.mode);
  });

  function onKey(e){
    if (e.key === 'Escape') closeSiteModal();
  }

  // close on backdrop click
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSiteModal();
  });

  closeBtn.addEventListener('click', () => closeSiteModal());
  document.addEventListener('keydown', onKey);

  // se apro un contesto dal modale → chiudo modale sito (poi il tuo handler globale aprirà il contesto)
  overlay.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-open-context]');
    if (a) {
      closeSiteModal();
      // non blocco propagazione: il listener in map_viewer intercetta e apre il contesto
    }
  });

  __modal = {
    overlay,
    cleanup: () => {
      try { ctxPack.destroy?.(); } catch {}
      try { document.removeEventListener('keydown', onKey); } catch {}
    }
  };

  // default
  setActive('info');
}
