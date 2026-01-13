// record_necropoli/necropoli/filter.js
import { getPath } from '../../path_utils.js';

export async function initCategoryFilter(samplesFeatures, updateVisibleObjects) {
  const res = await fetch(getPath("data/legenda_taxa.csv"));
  const text = await res.text();
  const lines   = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  const rows    = lines.slice(1).map(line => {
    const v = line.split(",");
    return Object.fromEntries(headers.map((h,i) => [h, (v[i] ?? "").trim()]));
  });

  // Build struttura (ordine CSV)
  const families = {};
  rows.forEach(r => {
    const family = r.category_1 || "";
    const famImg = r.image_1   || "";
    const taxon  = r.category_2 || "";
    const taxImg = r.image_2    || "";
    const valore = r.valore      || "";

    if (!families[family]) {
      families[family] = {
        label: family,
        image: famImg,
        valori: new Set(),
        taxa: new Map() // key = `${taxon}||${taxImg}`
      };
    }
    families[family].valori.add(valore);

    const key = `${taxon}||${taxImg}`;
    if (!families[family].taxa.has(key)) {
      families[family].taxa.set(key, { label: taxon, image: taxImg, valori: new Set() });
    }
    families[family].taxa.get(key).valori.add(valore);
  });

  // Esporta icone taxa per marker
  window.__TAXA_ICONS__ = window.__TAXA_ICONS__ || Object.fromEntries(
    rows.map(r => [ (r.valore || "").trim(), (r.image_2 || "other.png").trim() ])
  );

  // Stato selezioni
  const activePrecise = new Set();

  // --- UI ---------------------------------------------------------------
  const container = document.createElement("aside");
  container.id = "category-filter";
  container.className = "cf"; // closed di default
  document.body.appendChild(container);

  // Blocca interazioni Leaflet sotto (wheel/drag/click)
  ['mousedown','dblclick','pointerdown','touchstart','wheel'].forEach(ev => {
    container.addEventListener(ev, (e) => {
      e.stopPropagation();
      if (ev === 'wheel') e.preventDefault();
    }, { passive: false });
  });

  // Handle (sempre visibile): rettangolo sobrio
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "cf-handle";
  handle.innerHTML = `
    <i class="bi bi-funnel-fill"></i>
    <span class="cf-handle-label">Taxa</span>
    <span class="cf-badge" aria-hidden="true" style="display:none"></span>
    <i class="bi bi-chevron-down cf-chev" aria-hidden="true"></i>
  `;
  container.appendChild(handle);

  const badgeEl = handle.querySelector(".cf-badge");
  const chevEl  = handle.querySelector(".cf-chev");

  // Panel (contenuto completo)
  const panel = document.createElement("div");
  panel.className = "cf-panel";
  container.appendChild(panel);

  const header = document.createElement("div");
  header.className = "cf-header";

  const search = document.createElement("input");
  search.type = "search";
  search.className = "cf-search";
  search.placeholder = "Search family or taxon…";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "cf-all";
  allBtn.textContent = "All options";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "cf-reset";
  resetBtn.textContent = "Reset";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "cf-closepanel";
  closeBtn.innerHTML = `<i class="bi bi-x-lg"></i>`;

  header.appendChild(search);
  header.appendChild(allBtn);
  header.appendChild(resetBtn);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "cf-grid";
  panel.appendChild(grid);

  // Popover (hover)
  const popover = document.createElement("div");
  popover.className = "cf-popover";
  document.body.appendChild(popover);
  let hideTimer = null;
  const scheduleHide = () => { hideTimer = setTimeout(() => { popover.style.display = "none"; }, 140); };
  const cancelHide   = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };

  // Modal "All options"
  const fullPanel = document.createElement("div");
  fullPanel.className = "cf-fullpanel";
  fullPanel.style.display = "none";
  document.body.appendChild(fullPanel);

  function getAnchorEl() {
  const st = document.getElementById('stype-toolbar');
  const zoom = document.querySelector('.leaflet-control-zoom');
  return st || zoom || null;
}

  function applyCollapsedWidth() {
    // quando è chiuso: larghezza = anchor (box sopra)
    const anchor = getAnchorEl();
    if (!anchor) return;

    const r = anchor.getBoundingClientRect();
    const w = Math.max(44, Math.round(r.width)); // minimo sensato
    if (!isOpen) container.style.width = `${w}px`;
    else container.style.width = ''; // quando aperto: lascia come da CSS
  }

  function getAnchorEl() {
    const st = document.getElementById('stype-toolbar');
    const zoom = document.querySelector('.leaflet-control-zoom');
    return st || zoom || null;
  }

  function applyCollapsedWidth() {
    // quando è chiuso: larghezza = anchor (box sopra)
    const anchor = getAnchorEl();
    if (!anchor) return;

    const r = anchor.getBoundingClientRect();
    const w = Math.max(44, Math.round(r.width)); // minimo sensato
    if (!isOpen) container.style.width = `${w}px`;
    else container.style.width = ''; // quando aperto: lascia come da CSS
  }

  // --- Posizionamento: sotto #stype-toolbar, allineato al suo left ----------
  function positionSelf() {
    const st = document.getElementById('stype-toolbar');
    const zoom = document.querySelector('.leaflet-control-zoom');
    const anchor = st || zoom;

    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const left = Math.round(r.left);
      const top  = Math.round(r.bottom + 8);
      container.style.left = `${left}px`;
      container.style.top  = `${top}px`;
  +   applyCollapsedWidth();
      return;
    }

    // fallback
    container.style.left = `20px`;
    container.style.top  = `90px`;
  + applyCollapsedWidth();
  }

  window.addEventListener('resize', positionSelf);
  requestAnimationFrame(positionSelf);

  // --- Helpers ---------------------------------------------------------------
  function makeImgBtn(src, title, cls) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;

    const img = document.createElement("img");
    img.alt = title || "";
    img.loading = "lazy";
    const fallback = getPath("images/objects/other.png");
    img.onerror = () => { img.onerror = null; img.src = fallback; };
    img.src = getPath(src ? `images/objects/${src}` : "images/objects/other.png");

    btn.appendChild(img);
    return btn;
  }

  function updateBadge() {
    const n = activePrecise.size;
    if (!badgeEl) return;

    if (!n) {
      badgeEl.style.display = "none";
      badgeEl.textContent = "";
      return;
    }
    badgeEl.style.display = "inline-flex";
    badgeEl.textContent = (n > 99) ? "99+" : String(n);
  }

  function isFamilyActive(info) {
    for (const v of info.valori) if (activePrecise.has(v)) return true;
    return false;
  }
  function isTaxonActive(t) {
    for (const v of t.valori) if (activePrecise.has(v)) return true;
    return false;
  }

  function toggleFamily(familyInfo, btn, onlySubsetKeys = null) {
    const willActivate = !btn.classList.contains("active");

    if (willActivate) {
      if (onlySubsetKeys && onlySubsetKeys.size) {
        onlySubsetKeys.forEach(k => {
          const t = familyInfo.taxa.get(k);
          if (t) t.valori.forEach(v => activePrecise.add(v));
        });
      } else {
        familyInfo.valori.forEach(v => activePrecise.add(v));
      }
    } else {
      if (onlySubsetKeys && onlySubsetKeys.size) {
        onlySubsetKeys.forEach(k => {
          const t = familyInfo.taxa.get(k);
          if (t) t.valori.forEach(v => activePrecise.delete(v));
        });
      } else {
        familyInfo.valori.forEach(v => activePrecise.delete(v));
      }
    }

    applyFilter();
    renderFamilies(); // riallinea stati UI
  }

  function toggleTaxon(t, btn) {
    const willActivate = !btn.classList.contains("active");
    t.valori.forEach(v => { willActivate ? activePrecise.add(v) : activePrecise.delete(v); });

    applyFilter();
    // aggiorna subito lo stato del bottone
    btn.classList.toggle("active", willActivate);
    updateBadge();
  }

  // Ricerca → famiglie visibili + subset taxa per popover
  function computeSearch() {
    const q = (search.value || "").toLowerCase().trim();
    const visibleFamilies = new Set();
    const subsetTaxaByFamily = new Map();

    if (!q) {
      Object.keys(families).forEach(f => visibleFamilies.add(f));
      return { visibleFamilies, subsetTaxaByFamily };
    }

    Object.entries(families).forEach(([fname, info]) => {
      const inFamily = (info.label || "").toLowerCase().includes(q);
      let hasTax = false;
      const subset = new Set();

      info.taxa.forEach((t, key) => {
        if ((t.label || "").toLowerCase().includes(q)) {
          hasTax = true;
          subset.add(key);
        }
      });

      if (inFamily || hasTax) {
        visibleFamilies.add(fname);
        if (hasTax) subsetTaxaByFamily.set(fname, subset);
      }
    });

    // match “nascosto” su nome_com
    rows.forEach(r => {
      const nomeCom = (r.nome_com || "").toLowerCase();
      if (!nomeCom) return;
      if (nomeCom.includes(q)) {
        const fname = r.category_1 || "";
        const key   = `${r.category_2 || ""}||${r.image_2 || ""}`;
        visibleFamilies.add(fname);
        const set = subsetTaxaByFamily.get(fname) || new Set();
        set.add(key);
        subsetTaxaByFamily.set(fname, set);
      }
    });

    return { visibleFamilies, subsetTaxaByFamily };
  }

  function renderPopoverForFamily(fname, subsetKeys) {
    const info = families[fname];
    if (!info) return;

    popover.innerHTML = "";

    const head = document.createElement("div");
    head.className = "cf-popover-head";
    head.textContent = info.label || "";
    popover.appendChild(head);

    const wrap = document.createElement("div");
    wrap.className = "cf-popover-grid";

    const wanted = [];
    info.taxa.forEach((t, key) => {
      if (subsetKeys && subsetKeys.size && !subsetKeys.has(key)) return;
      wanted.push({ key, t });
    });

    wanted.sort((a, b) =>
      String(a.t.label || "").localeCompare(String(b.t.label || ""), 'it', { sensitivity: 'base' })
    );

    wanted.forEach(({ t }) => {
      const btn = makeImgBtn(t.image, t.label, "cf-sub-btn");
      btn.title = t.label || "";
      btn.classList.toggle("active", isTaxonActive(t));
      btn.addEventListener("click", () => toggleTaxon(t, btn));
      wrap.appendChild(btn);
    });

    popover.appendChild(wrap);

    popover.addEventListener("mouseenter", cancelHide, { once: true });
    popover.addEventListener("mouseleave", scheduleHide, { once: true });
  }

  function renderFamilies() {
    grid.innerHTML = "";
    const { visibleFamilies, subsetTaxaByFamily } = computeSearch();
    const entriesAll = Object.entries(families).filter(([f]) => visibleFamilies.has(f));

    const cols = [document.createElement("div"), document.createElement("div"), document.createElement("div")];
    cols.forEach(c => { c.className = "cf-col"; grid.appendChild(c); });

    entriesAll.forEach(([fname, info], i) => {
      const col = cols[i % 3];

      const card = document.createElement("div");
      card.className = "cf-family";

      const famBtn = makeImgBtn(info.image, info.label, "cf-family-btn");
      famBtn.title = info.label || "";
      famBtn.classList.toggle("active", isFamilyActive(info));

      famBtn.addEventListener("click", () => {
        const subset = subsetTaxaByFamily.get(fname) || null;
        toggleFamily(info, famBtn, subset);
      });

      famBtn.addEventListener("mouseenter", () => {
        cancelHide();
        const rect = famBtn.getBoundingClientRect();
        const subset = subsetTaxaByFamily.get(fname) || null;

        renderPopoverForFamily(fname, subset);
        popover.style.display = "flex";

        const top = Math.max(12, Math.min(window.innerHeight - 12, rect.top + rect.height/2));
        const left = Math.min(window.innerWidth - 260, rect.right + 12);

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
        popover.style.transform = "translateY(-50%)";
      });
      famBtn.addEventListener("mouseleave", scheduleHide);

      const lbl = document.createElement("div");
      lbl.className = "cf-family-label";
      lbl.textContent = info.label || "(no family)";

      card.appendChild(famBtn);
      card.appendChild(lbl);
      col.appendChild(card);
    });

    updateBadge();
  }

  function renderFullPanel() {
    fullPanel.innerHTML = "";

    const panelHead = document.createElement("div");
    panelHead.className = "cf-fullpanel-head";
    panelHead.innerHTML = `<strong>All options</strong><button type="button" class="cf-close">×</button>`;
    fullPanel.appendChild(panelHead);

    panelHead.querySelector(".cf-close").addEventListener("click", () => {
      fullPanel.style.display = "none";
      document.body.classList.remove("cf-modal-open");
    });

    const body = document.createElement("div");
    body.className = "cf-fullpanel-body";
    fullPanel.appendChild(body);

    Object.values(families).forEach(info => {
      const card = document.createElement("div");
      card.className = "cf-card";

      const row = document.createElement("div");
      row.className  = "cf-card-row";

      const famBtn = makeImgBtn(info.image, info.label, "cf-family-btn");
      famBtn.classList.toggle("active", isFamilyActive(info));
      famBtn.addEventListener("click", () => {
        toggleFamily(info, famBtn);
        // refresh stato in modal
        famBtn.classList.toggle("active", isFamilyActive(info));
      });

      const lbl = document.createElement("span");
      lbl.textContent = info.label || "";
      row.appendChild(famBtn);
      row.appendChild(lbl);
      card.appendChild(row);

      const sub = document.createElement("div");
      sub.className = "cf-card-subgrid";
      info.taxa.forEach(t => {
        const taxBtn = makeImgBtn(t.image, t.label, "cf-sub-btn");
        taxBtn.title = t.label || "";
        taxBtn.classList.toggle("active", isTaxonActive(t));
        taxBtn.addEventListener("click", () => {
          toggleTaxon(t, taxBtn);
          taxBtn.classList.toggle("active", isTaxonActive(t));
        });
        sub.appendChild(taxBtn);
      });
      card.appendChild(sub);

      body.appendChild(card);
    });

    updateBadge();
  }

  // --- Open/close panel ------------------------------------------------------
  let isOpen = false;

  function setOpen(next) {
    isOpen = !!next;
    container.classList.toggle("cf-open", isOpen);
    chevEl?.classList.toggle("bi-chevron-down", !isOpen);
    chevEl?.classList.toggle("bi-chevron-up", isOpen);

    // chiudi popover se stai chiudendo
    if (!isOpen) popover.style.display = "none";

    // ridisegna quando apri (stati attivi coerenti)
    if (isOpen) renderFamilies();

    applyCollapsedWidth();

    // nudge layout (timebar si riposiziona via RO/resize)
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  handle.addEventListener("click", () => setOpen(!isOpen));
  closeBtn.addEventListener("click", () => setOpen(false));

  // --- Buttons --------------------------------------------------------------
  allBtn.addEventListener("click", () => {
    renderFullPanel();
    fullPanel.style.display = "block";
    document.body.classList.add("cf-modal-open");
  });

  resetBtn.addEventListener("click", resetFilters);
  search.addEventListener("input", renderFamilies);

  // Reset = mostra tutto (nessun filtro categoria)
  function resetFilters() {
    activePrecise.clear();
    document.querySelectorAll(".cf-family-btn.active, .cf-sub-btn.active")
      .forEach(el => el.classList.remove("active"));
    updateBadge();
    updateVisibleObjects(null);
    renderFamilies();
  }

  // Applica filtro a samples
  function applyFilter() {
    updateBadge();

    if (activePrecise.size === 0) {
      updateVisibleObjects(null);
      return;
    }
    const out = samplesFeatures.filter(f =>
      activePrecise.has(String(f?.properties?.precise_taxon || ""))
    );
    updateVisibleObjects(out);
  }

  // Stato iniziale: CLOSED
  setOpen(false);
  updateBadge();
}
