// site_detail_info.js
export function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
  );
}

export function parseOverviewAndBibliography(rawText, bibFallback = '') {
  const txt = String(rawText ?? '').trim();
  if (!txt && !bibFallback) return { overview: '/', bibliography: '/' };

  // stessa logica: separatore "Bibliography:"
  const m = txt.match(/(^|\n)\s*Bibliography\s*:\s*/i);
  if (!m) {
    return { overview: txt || '/', bibliography: String(bibFallback || '/').trim() || '/' };
  }

  const idx = m.index ?? -1;
  if (idx < 0) return { overview: txt || '/', bibliography: String(bibFallback || '/').trim() || '/' };

  const cut = idx + m[0].length;
  const overview = txt.slice(0, idx).trim() || '/';
  const bibliography = txt.slice(cut).trim() || String(bibFallback || '/').trim() || '/';
  return { overview, bibliography };
}

export function buildOverviewCardHtml({ title = 'Overview', rawText = '', bibFallback = '' } = {}) {
  const { overview, bibliography } = parseOverviewAndBibliography(rawText, bibFallback);

  return `
    <div class="sd-overview-card">
      <div class="sd-overview-head">
        <div class="sd-overview-title">${escapeHtml(title)}</div>
      </div>

      <div class="sd-overview-body">
        <div class="sd-overview-text">${escapeHtml(overview)}</div>

        <div class="sd-overview-bib">
          <div class="sd-overview-bib-title">Bibliography</div>
          <div class="sd-overview-bib-text">${escapeHtml(bibliography)}</div>
        </div>
      </div>
    </div>
  `;
}

export function buildInfoRowsHtml(rows = []) {
  const safe = (v) => (v == null || String(v).trim() === '') ? '-' : v;

  return `
    <div class="sd-info">
      ${(rows || []).map(([k,v]) => `
        <div class="sd-info-row">
          <div class="sd-info-k">${escapeHtml(k)}</div>
          <div class="sd-info-v">${escapeHtml(safe(v))}</div>
        </div>
      `).join('')}
    </div>
  `;
}
