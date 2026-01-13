// record_necropoli/necropoli/schede_view.js
import { makeSiteCardEl, makeSiteDetailEl } from './schede_templates.js';

function withViewTransition(fn) {
  if (document.startViewTransition) document.startViewTransition(fn);
  else fn();
}

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Trova il container che effettivamente scrolla (sidebar/cards panel).
 * Se in futuro cambi layout/CSS, ti basta aggiornare qui.
 */
function getScrollContainer(host) {
  // prova a beccare un wrapper scrollabile se esiste
  const cand =
    host.querySelector('.cards-scroll') ||
    host.querySelector('.cards-panel') ||
    host;

  return cand || host;
}

export function initCardsView({
  containerId = 'cards-view',
  getItems,                 // () => [{site, contexts, contextsCount}, ...]
  onEnterCards,             // optional
  onEnterMap                // optional
} = {}) {
  const host = document.getElementById(containerId);
  if (!host) throw new Error(`[initCardsView] Missing #${containerId}`);

  // ---- build skeleton once
  // ✅ NOTE: detailSlot PRIMA della griglia -> la scheda dettaglio sta "in alto"
  host.innerHTML = `
    <div class="cards-header">
      <div class="cards-header-left">
        <h2 class="cards-title">Sites</h2>
      </div>

      <div class="cards-search">
        <input id="cards-search-input" type="search" placeholder="Search sites…" autocomplete="off" />
      </div>

      <div class="cards-pager">
        <button class="pager-btn" id="cards-prev" type="button" title="Previous page">
          <i class="bi bi-chevron-left"></i>
        </button>
        <div class="pager-meta" id="cards-meta">—</div>
        <button class="pager-btn" id="cards-next" type="button" title="Next page">
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>

    <div id="cards-detail-slot"></div>
    <div class="cards-grid" id="cards-grid"></div>
  `;

  const searchInput = host.querySelector('#cards-search-input');
  const grid = host.querySelector('#cards-grid');
  const meta = host.querySelector('#cards-meta');
  const btnPrev = host.querySelector('#cards-prev');
  const btnNext = host.querySelector('#cards-next');
  const detailSlot = host.querySelector('#cards-detail-slot');

  let allItems = [];
  let filtered = [];
  let page = 0;
  const pageSize = 9;

  let debounceT = null;
  let query = '';

  function isActive() {
    return document.body.classList.contains('cards-mode');
  }

  function setActive(on) {
    withViewTransition(() => {
      document.body.classList.toggle('cards-mode', !!on);
      host.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    if (on) onEnterCards?.();
    else onEnterMap?.();
  }

  function applySearch(items) {
    const q = norm(query);
    if (!q) return items;

    return items.filter(it => {
      const p = it?.site?.properties || {};
      const hay = [
        p.name, p.site_name_brain, p.site_code,
        p.region, p.province, p.typology,
        p.chronology_iccd, p.parent_chronology_iccd,
        p.bibliography
      ].map(norm).join(' • ');
      return hay.includes(q);
    });
  }

  function updatePager() {
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.max(0, Math.min(page, pages - 1));

    const from = total ? (page * pageSize + 1) : 0;
    const to = Math.min(total, (page + 1) * pageSize);
    meta.textContent = `${from}–${to} / ${total}`;

    btnPrev.disabled = (page <= 0);
    btnNext.disabled = (page >= pages - 1);
  }

  function closeDetail() {
    host.classList.remove('detail-open');
    detailSlot.replaceChildren();
  }

  function scrollToTopNow() {
    const scroller = getScrollContainer(host);

    // 1) scroller locale (sidebar)
    try {
      scroller.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      try { scroller.scrollTop = 0; } catch {}
    }

    // 2) fallback pagina (se il layout cambia)
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {}
  }

  function openDetail(item) {
    // ✅ NON appendere: sostituisci
    detailSlot.replaceChildren();

    const detailEl = makeSiteDetailEl(item, { onBack: closeDetail });
    detailSlot.appendChild(detailEl);

    host.classList.add('detail-open');

    // ✅ porta la scheda "in alto"
    scrollToTopNow();
    try { detailSlot.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch {}
  }

  function renderGrid() {
    closeDetail();
    grid.innerHTML = '';

    updatePager();

    const start = page * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    for (const it of slice) {
      const card = makeSiteCardEl(it, { onOpenDetail: openDetail });
      grid.appendChild(card);
    }

    if (!slice.length) {
      const empty = document.createElement('div');
      empty.style.padding = '16px';
      empty.style.color = '#334155';
      empty.style.fontWeight = '800';
      empty.textContent = 'No sites match the current filters/search.';
      grid.appendChild(empty);
    }

    // quando torno alla griglia, stai su in alto
    scrollToTopNow();
  }

  function refresh({ keepPage = true } = {}) {
    allItems = Array.isArray(getItems?.()) ? getItems() : [];
    filtered = applySearch(allItems);
    if (!keepPage) page = 0;
    renderGrid();
  }

  // events
  btnPrev.addEventListener('click', () => { page -= 1; renderGrid(); });
  btnNext.addEventListener('click', () => { page += 1; renderGrid(); });

  searchInput.addEventListener('input', () => {
    query = searchInput.value || '';
    clearTimeout(debounceT);
    debounceT = setTimeout(() => refresh({ keepPage: false }), 140);
  });

  // keyboard arrows paging (quando attivo e non in detail)
  window.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    if (host.classList.contains('detail-open')) return;
    if (e.key === 'ArrowLeft') { page -= 1; renderGrid(); }
    if (e.key === 'ArrowRight') { page += 1; renderGrid(); }
  });

  // public API
  return {
    isActive,
    setActive,
    toggle() {
      const next = !isActive();
      setActive(next);
      if (next) refresh({ keepPage: false });
      return next;
    },
    refresh
  };
}
