// record_necropoli/necropoli/schede_templates.js

// in cima a schede_templates.js
import { makeSiteDetailElFull } from './schede_detail_full.js';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])
  );
}

function t(v, fallback = 'N/D') {
  const s = String(v ?? '').trim();
  return s ? s : fallback;
}

function truncate(str, max = 220) {
  const s = String(str ?? '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

export function makeSiteCardEl(item, { onOpenDetail } = {}) {
  const p = item?.site?.properties || {};

  const name = t(p.name || p.site_name_brain || p.site_code, 'Site');
  const code = t(p.site_code);
  const region = t(p.region);
  const province = t(p.province);
  const typology = t(p.typology);
  const chrono = t(p.chronology_iccd);

  const biblio = truncate(p.bibliography, 260);

  const el = document.createElement('article');
  el.className = 'site-card';
  el.setAttribute('data-site-fid', String(p.fid ?? ''));

  el.innerHTML = `
    <div class="site-card-head">
      <div style="min-width:0;">
        <h4 class="site-card-title" title="${escapeHtml(name)}">${escapeHtml(name)}</h4>
        <div class="site-card-sub">
          <span class="ctx-chip" title="Associated contexts">
            <i class="bi bi-layers"></i>
            ${Number(item?.contextsCount || 0)} contexts
          </span>
          <span title="Site code"><i class="bi bi-hash"></i> ${escapeHtml(code)}</span>
        </div>
      </div>

      <button class="open-detail-btn" type="button" title="Open full card" aria-label="Open full card">
        <i class="bi bi-box-arrow-up-right"></i>
      </button>
    </div>

    <div class="site-card-body">
      <div class="site-kv">
        <div class="k">Region</div><div class="v" title="${escapeHtml(region)}">${escapeHtml(region)}</div>
        <div class="k">Province</div><div class="v" title="${escapeHtml(province)}">${escapeHtml(province)}</div>
        <div class="k">Typology</div><div class="v" title="${escapeHtml(typology)}">${escapeHtml(typology)}</div>
        <div class="k">Chronology</div><div class="v" title="${escapeHtml(chrono)}">${escapeHtml(chrono)}</div>
      </div>

      <div class="site-biblio">
        <strong>Bibliography</strong>
        <div>${escapeHtml(biblio || '—')}</div>
      </div>
    </div>
  `;

  const btn = el.querySelector('.open-detail-btn');
  btn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenDetail?.(item);
  });

  return el;
}

export function makeSiteDetailEl(item, { onBack } = {}) {
  return makeSiteDetailElFull(item, { onBack });
}
