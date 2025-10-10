// record_necropoli/necropoli/popup_sito.js
import { getPath } from '../../path_utils.js';

/* === Carica (una volta) il CSS base del popup tombe, così ereditiamo lo stile === */
(function loadPopupBaseCSS() {
  if ([...document.styleSheets].some(s => s.href && /popup_tombe\.css/i.test(s.href))) return;
  let href;
  try { href = new URL('../css/popup_tombe.css', import.meta.url).href; } catch (_) {}
  if (!href) href = (typeof getPath === 'function') ? getPath('css/popup_tombe.css') : '../css/popup_tombe.css';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
})();

/* === Carica (una volta) il CSS specifico per il popup sito === */
(function loadPopupSitoCSS() {
  if ([...document.styleSheets].some(s => s.href && /popup_sito\.css/i.test(s.href))) return;
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

/* Bubbles helper: split "A ; B ; C" → <span class="bubble">A</span> ... */
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

/* ========= Geometry helpers ========= */
function ringsFromGeom(g) {
  if (!g || !g.type || !g.coordinates) return [];
  if (g.type === 'Polygon') return [ g.coordinates[0] || [] ];
  if (g.type === 'MultiPolygon') return (g.coordinates[0] ? [g.coordinates[0][0] || []] : []);
  return [];
}
function bboxOfRings(rings) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  rings.forEach(r => r.forEach(([x,y]) => { if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }));
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
  return {minX, minY, maxX, maxY};
}
function xyToSvg(x, y, box, w, h, pad=0.06) {
  const dx = (box.maxX - box.minX) || 1;
  const dy = (box.maxY - box.minY) || 1;
  const nx = (x - box.minX) / dx;
  const ny = 1 - (y - box.minY) / dy;
  const px = (pad + nx * (1 - 2*pad)) * w;
  const py = (pad + ny * (1 - 2*pad)) * h;
  return [px, py];
}
function makePolygonPoints(ring, box, w, h) {
  return ring.map(([x,y]) => {
    const [px, py] = xyToSvg(x,y,box,w,h);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');
}
function centroidXY(ring) {
  let sx = 0, sy = 0, n = 0;
  ring.forEach(([x,y]) => { sx += x; sy += y; n++; });
  return n ? [sx/n, sy/n] : null;
}

/* ========= Geometry previews (SVG) ========= */
function sitePreviewSVG(siteFeature, w=380, h=210) {
  const rings = ringsFromGeom(siteFeature?.geometry);
  const box = bboxOfRings(rings); if (!box) return '';
  const pts = makePolygonPoints(rings[0], box, w, h);
  if (!pts) return '';
  return `
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="ctx-geom-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="siteFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#60a5fa" stop-opacity=".35"/>
          <stop offset="100%" stop-color="#93c5fd" stop-opacity=".20"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${w}" height="${h}" rx="10" ry="10" fill="#f8fafc" stroke="#e5e7eb"/>
      <polygon points="${pts}" fill="url(#siteFill)" stroke="#2563eb" stroke-width="2"/>
    </svg>
  `;
}

function siteContextOverlaySVG(siteFeature, contextFeature, w=420, h=220) {
  const siteRings = ringsFromGeom(siteFeature?.geometry);
  const ctxRings  = ringsFromGeom(contextFeature?.geometry);
  const allRings  = [...siteRings, ...ctxRings];
  const box = bboxOfRings(allRings); if (!box) return '';

  const sitePts = siteRings[0] ? makePolygonPoints(siteRings[0], box, w, h) : '';
  const ctxPts  = ctxRings[0]  ? makePolygonPoints(ctxRings[0],  box, w, h) : '';

  let centerCircle = '';
  if (ctxRings[0]) {
    const cxy = centroidXY(ctxRings[0]);
    if (cxy) {
      const [cx, cy] = xyToSvg(cxy[0], cxy[1], box, w, h);
      centerCircle = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.2" fill="#8b2f00" stroke="#ffffff" stroke-width="1.6" />`;
    }
  }

  return `
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="ctx-geom-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="siteFillOverlay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#60a5fa" stop-opacity=".30"/>
          <stop offset="100%" stop-color="#93c5fd" stop-opacity=".16"/>
        </linearGradient>
        <linearGradient id="ctxFillOverlay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f59e0b" stop-opacity=".45"/>
          <stop offset="100%" stop-color="#fbbf24" stop-opacity=".25"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${w}" height="${h}" rx="10" ry="10" fill="#f8fafc" stroke="#e5e7eb"/>
      ${sitePts ? `<polygon points="${sitePts}" fill="url(#siteFillOverlay)" stroke="#2563eb" stroke-width="2"/>` : ''}
      ${ctxPts  ? `<polygon points="${ctxPts}"  fill="url(#ctxFillOverlay)"  stroke="#8b2f00" stroke-width="2"/>` : ''}
      ${centerCircle}
    </svg>
  `;
}

/* ========= Portals (buttons) ========= */
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

/* ========= UI builders ========= */
function buildInfoTab(siteFeature) {
  const p = siteFeature?.properties || {};
  const name = p.name || p.site_name_brain || p.site_code || 'Site';
  const typology = p.typology || '-';
  const reliab = (p.c_appr != null) ? String(p.c_appr) : '-';
  const provReg = [p.province, p.region].filter(Boolean).join(' — ') || '-';

  // Periods / Sub-periods (multi-valore separato da ';' → bubble)
  const periods = (p.parent_chronology_iccd || '').trim();
  const subperiods = (p.chronology_iccd || '').trim();

  const geomSrc = [p.source, p.source_type].map(v => v ? String(v) : '').filter(Boolean).join(' (') + (p.source_type ? ')' : '');

  const preview = sitePreviewSVG(siteFeature, 380, 210);

  return `
    <div class="tomb-info" style="padding-top:6px;">
      ${preview ? `<div class="ctx-geom-box" style="margin-top:2px;">${preview}</div>` : ''}
      <div class="tomb-info-box tomb-info--base">
        <div class="tomb-info-row"><div class="tomb-info-k">Site</div><div class="tomb-info-v">${escapeHtml(name)}</div></div>
        <div class="tomb-info-row"><div class="tomb-info-k">Typology</div><div class="tomb-info-v">${escapeHtml(typology)}</div></div>
        <div class="tomb-info-row"><div class="tomb-info-k">Reliability</div><div class="tomb-info-v">${escapeHtml(reliab)}</div></div>
        <div class="tomb-info-row"><div class="tomb-info-k">Province / Region</div><div class="tomb-info-v">${escapeHtml(provReg)}</div></div>
        <div class="tomb-info-row"><div class="tomb-info-k">Periods</div><div class="tomb-info-v">${renderBubbles(periods)}</div></div>
        <div class="tomb-info-row"><div class="tomb-info-k">Sub-periods</div><div class="tomb-info-v">${renderBubbles(subperiods)}</div></div>
        <div class="tomb-info-row"><div class="tomb-info-k">Geometry source</div><div class="tomb-info-v">${escapeHtml(geomSrc || '-')}</div></div>
      </div>
    </div>
  `;
}

/* === nuova tab: Bibliography (References) === */
function buildBibliographyTab(siteFeature) {
  const p = siteFeature?.properties || {};
  const raw = (p.bibliography || '').trim();
  if (!raw) {
    return `<div class="tomb-info"><div class="tomb-info-row"><div class="tomb-info-k">References</div><div class="tomb-info-v"><em>No references reported.</em></div></div></div>`;
  }
  const items = raw.split(';').map(s => s.trim()).filter(Boolean);
  return `
    <div class="tomb-info">
      <div class="tomb-info-row">
        <div class="tomb-info-k">References</div>
        <div class="tomb-info-v">
          <ul class="refs-list">${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>
  `;
}

/* CONTEXTS: header in alto a destra con: nome, Periods, Sub-periods (in bubble), Open */
function buildContextsCarousel(siteFeature, contexts) {
  if (!contexts.length) {
    return `<div class="tomb-info" style="padding:8px 2px;"><em>No contexts for this site.</em></div>`;
  }

  const slides = contexts.map((ctx, idx) => {
    const cp = ctx.properties || {};
    const name = cp.context_name || '(context)';
    const periods = (cp.parent_chronology_iccd || '').trim();
    const subperiods = (cp.chronology_iccd || '').trim();
    const svg = siteContextOverlaySVG(siteFeature, ctx, 420, 220);
    const ctxId = Number(cp.fid);

    return `
      <div class="ctx-card" data-slide="${idx}" ${idx===0 ? '' : 'hidden'}>
        <div class="ctx-card-inner">
          <div class="ctx-geom-wrapper">
            <div class="ctx-geom-box ctx-geom-box--context">
              ${svg || ''}
              <div class="ctx-head">
                <div class="ctx-head-title">${escapeHtml(name)}</div>
                <div class="ctx-head-row"><span class="lab">Periods:</span> ${renderBubbles(periods)}</div>
                <div class="ctx-head-row"><span class="lab">Sub-periods:</span> ${renderBubbles(subperiods)}</div>
                <a href="#" class="ctx-open" data-open-context="${ctxId}" aria-label="Open context">Open context</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="ctx-carousel" data-total="${contexts.length}">
      <button class="ctx-nav prev" aria-label="Previous">◀</button>
      <div class="ctx-viewport">
        ${slides}
      </div>
      <button class="ctx-nav next" aria-label="Next">▶</button>
      <div class="ctx-dots">${contexts.map((_,i)=>`<span class="dot ${i===0?'active':''}" data-go="${i}"></span>`).join('')}</div>
    </div>
  `;
}

function attachCarouselLogic(root) {
  const carousel = root.querySelector('.ctx-carousel');
  if (!carousel) return;

  const total = Number(carousel.getAttribute('data-total')) || 0;
  const viewport = carousel.querySelector('.ctx-viewport');
  const slides = [...viewport.querySelectorAll('.ctx-card')];
  const dots = [...carousel.querySelectorAll('.dot')];

  let index = 0;
  function show(i) {
    index = (i + total) % total;
    slides.forEach((el, k) => el.toggleAttribute('hidden', k !== index));
    dots.forEach((d, k) => d.classList.toggle('active', k === index));
  }
  carousel.querySelector('.prev')?.addEventListener('click', () => show(index - 1));
  carousel.querySelector('.next')?.addEventListener('click', () => show(index + 1));
  dots.forEach(d => d.addEventListener('click', () => show(Number(d.getAttribute('data-go')))));

  let sx = null;
  viewport.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  viewport.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (dx > 30) show(index - 1);
    else if (dx < -30) show(index + 1);
  });
}

/* ========= MAIN ========= */
export function createSitePopup(siteFeature, allContexts = []) {
  const p = siteFeature?.properties || {};
  const siteId = Number(p.fid);

  const contexts = (allContexts || []).filter(c => Number(c?.properties?.parent_id) === siteId);

  const container = document.createElement('div');
  container.className = 'popup-tomba-wrapper popup-large';
  container.style.maxWidth = '900px';

  const title = document.createElement('div');
  title.className = 'popup-tomba-title';
  title.textContent = p.name || p.site_name_brain || p.site_code || 'Site';
  container.appendChild(title);

  const switcher = document.createElement('div');
  switcher.className = 'tomb-switcher';
  switcher.innerHTML = `
    <button class="ts-btn active" data-mode="info">Info</button>
    <button class="ts-btn" data-mode="contexts">Contexts</button>
    <button class="ts-btn" data-mode="portals">Other portals</button>
    <button class="ts-btn" data-mode="biblio">Bibliography</button>
  `;
  container.appendChild(switcher);

  const infoBox = document.createElement('div');
  infoBox.className = 'tomb-info-box';
  infoBox.style.display = 'block';
  infoBox.innerHTML = buildInfoTab(siteFeature);
  container.appendChild(infoBox);

  const contextsBox = document.createElement('div');
  contextsBox.className = 'tomb-info-box';
  contextsBox.style.display = 'none';
  const sorted = contexts.slice().sort((a,b) => {
    const A = String(a?.properties?.context_name || '').toLowerCase();
    const B = String(b?.properties?.context_name || '').toLowerCase();
    return A.localeCompare(B);
  });
  contextsBox.innerHTML = buildContextsCarousel(siteFeature, sorted);
  container.appendChild(contextsBox);

  const portalsBox = document.createElement('div');
  portalsBox.className = 'tomb-info-box';
  portalsBox.style.display = 'none';
  portalsBox.innerHTML = portalsButtons(p);
  container.appendChild(portalsBox);

  const biblioBox = document.createElement('div');
  biblioBox.className = 'tomb-info-box';
  biblioBox.style.display = 'none';
  biblioBox.innerHTML = buildBibliographyTab(siteFeature);
  container.appendChild(biblioBox);

  function setActive(mode) {
    switcher.querySelectorAll('.ts-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    infoBox.style.display     = (mode === 'info')     ? 'block' : 'none';
    contextsBox.style.display = (mode === 'contexts') ? 'block' : 'none';
    portalsBox.style.display  = (mode === 'portals')  ? 'block' : 'none';
    biblioBox.style.display   = (mode === 'biblio')   ? 'block' : 'none';
  }
  switcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.ts-btn'); if (!btn) return;
    setActive(btn.dataset.mode);
  });

  let carouselReady = false;
  const obs = new MutationObserver(() => {
    if (!carouselReady && contextsBox.style.display !== 'none') {
      attachCarouselLogic(contextsBox);
      carouselReady = true;
      obs.disconnect();
    }
  });
  obs.observe(contextsBox, { attributes: true, attributeFilter: ['style'] });

  return container;
}
