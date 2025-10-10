// record_necropoli/necropoli/filter.js
import { getPath } from '../../path_utils.js';

export async function initCategoryFilter(samplesFeatures, updateVisibleObjects) {
  const res = await fetch(getPath("data/legenda_taxa.csv"));
  const text = await res.text();
  const lines   = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  const rows    = lines.slice(1).map(line => {
    const v = line.split(","); // parser semplice
    return Object.fromEntries(headers.map((h,i) => [h, (v[i] ?? "").trim()]));
  });

  // Build struttura (rispetta l'ordine di apparizione nel CSV)
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

  // Esporta mappa icone per marker se non già presente (usata da objects_layer)
  window.__TAXA_ICONS__ = window.__TAXA_ICONS__ || Object.fromEntries(
    rows.map(r => [ (r.valore || "").trim(), (r.image_2 || "other.png").trim() ])
  );

  // Stato selezioni
  const activePrecise = new Set();

  // --- UI base ---------------------------------------------------------------
  const container = document.createElement("aside");
  container.id = "category-filter";
  container.className = "cf cf-expanded"; // espanso di default
  document.body.appendChild(container);

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

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "cf-collapse";
  collapseBtn.textContent = "Collapse";

  header.appendChild(search);
  header.appendChild(allBtn);
  header.appendChild(resetBtn);
  header.appendChild(collapseBtn);
  container.appendChild(header);

  // Grid (famiglie)
  const grid = document.createElement("div");
  grid.className = "cf-grid";
  container.appendChild(grid);

  // Popover (riutilizzato)
  const popover = document.createElement("div");
  popover.className = "cf-popover";
  document.body.appendChild(popover);
  let hideTimer = null;
  const scheduleHide = () => { hideTimer = setTimeout(() => { popover.style.display = "none"; }, 140); };
  const cancelHide   = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };

  // Helpers -------------------------------------------------------------------
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
  function getTaxFromKey(familyInfo, key) {
    return familyInfo.taxa.get(key) || null;
  }
  function toggleFamily(familyInfo, btn, onlySubsetKeys = null) {
    const isActive = !btn.classList.contains("active");
    btn.classList.toggle("active", isActive);

    if (isActive) {
      if (onlySubsetKeys && onlySubsetKeys.size) {
        onlySubsetKeys.forEach(k => {
          const t = getTaxFromKey(familyInfo, k);
          if (t) t.valori.forEach(v => activePrecise.add(v));
        });
      } else {
        familyInfo.valori.forEach(v => activePrecise.add(v));
      }
    } else {
      if (onlySubsetKeys && onlySubsetKeys.size) {
        onlySubsetKeys.forEach(k => {
          const t = getTaxFromKey(familyInfo, k);
          if (t) t.valori.forEach(v => activePrecise.delete(v));
        });
      } else {
        familyInfo.valori.forEach(v => activePrecise.delete(v));
      }
    }
    applyFilter();
  }
  function toggleTaxon(t, btn) {
    const isActive = !btn.classList.contains("active");
    btn.classList.toggle("active", isActive);
    t.valori.forEach(v => { isActive ? activePrecise.add(v) : activePrecise.delete(v); });
    applyFilter();
  }

  // Ricerca → famiglie visibili + subset taxa per popover (include match su nome_com nascosto)
  function computeSearch() {
    const q = (search.value || "").toLowerCase().trim();
    const visibleFamilies = new Set();
    const subsetTaxaByFamily = new Map();
    if (!q) {
      Object.keys(families).forEach(f => visibleFamilies.add(f));
      return { visibleFamilies, subsetTaxaByFamily };
    }

    // 1) match su etichette visibili (family/taxon)
    Object.entries(families).forEach(([fname, info]) => {
      const inFamily = (info.label || "").toLowerCase().includes(q);
      let hasTax = false;
      const subset = new Set();
      info.taxa.forEach((t, key) => {
        if ((t.label || "").toLowerCase().includes(q)) { hasTax = true; subset.add(key); }
      });
      if (inFamily || hasTax) {
        visibleFamilies.add(fname);
        if (hasTax) subsetTaxaByFamily.set(
          fname,
          new Set([...(subsetTaxaByFamily.get(fname) || new Set()), ...subset])
        );
      }
    });

    // 2) match “nascosto” su nome_com → mostra family e il relativo taxon (image_2)
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

  // Disegna le famiglie – NORMAL vs COLLAPSED
  let collapsed = false;

  function renderFamilies() {
    grid.innerHTML = "";
    const { visibleFamilies } = computeSearch();

    // entries in ordine CSV (Object.entries preserva l'ordine di inserimento)
    const entriesAll = Object.entries(families).filter(([f]) => visibleFamilies.has(f));

    if (collapsed) {
      // COLLASSATO: prime 5 categorie in colonna unica (1,2,3,4,5)
      const col = document.createElement("div");
      col.className = "cf-col";
      grid.appendChild(col);

      entriesAll.slice(0, 5).forEach(([fname, info]) => {
        const card = document.createElement("div");
        card.className = "cf-family";

        const famBtn = makeImgBtn(info.image, info.label, "cf-family-btn");
        famBtn.title = info.label || "";

        famBtn.addEventListener("click", () => {
          const { subsetTaxaByFamily } = computeSearch();
          const subset = subsetTaxaByFamily.get(fname) || null;
          toggleFamily(info, famBtn, subset);
        });

        // Popover su hover
        famBtn.addEventListener("mouseenter", () => {
          cancelHide();
          const rect = famBtn.getBoundingClientRect();
          const { subsetTaxaByFamily } = computeSearch();
          renderPopoverForFamily(fname, subsetTaxaByFamily.get(fname) || null);
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

      return;
    }

    // NORMALE: 3 colonne, riempimento orizzontale (1–2–3 / 4–5–6 …)
    const cols = [document.createElement("div"), document.createElement("div"), document.createElement("div")];
    cols.forEach(c => { c.className = "cf-col"; grid.appendChild(c); });

    entriesAll.forEach(([fname, info], i) => {
      const col = cols[i % 3];

      const card = document.createElement("div");
      card.className = "cf-family";

      const famBtn = makeImgBtn(info.image, info.label, "cf-family-btn");
      famBtn.title = info.label || "";

      famBtn.addEventListener("click", () => {
        const { subsetTaxaByFamily } = computeSearch();
        const subset = subsetTaxaByFamily.get(fname) || null;
        toggleFamily(info, famBtn, subset);
      });

      // Popover su hover
      famBtn.addEventListener("mouseenter", () => {
        cancelHide();
        const rect = famBtn.getBoundingClientRect();
        const { subsetTaxaByFamily } = computeSearch();
        renderPopoverForFamily(fname, subsetTaxaByFamily.get(fname) || null);
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
  }

  // Popover: taxa in ordine alfabetico
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

    // ⬇️ Ordina alfabeticamente per etichetta, case-insensitive, locale IT
    wanted.sort((a, b) =>
      String(a.t.label || "").localeCompare(String(b.t.label || ""), 'it', { sensitivity: 'base' })
    );

    wanted.forEach(({ t }) => {
      const btn = makeImgBtn(t.image, t.label, "cf-sub-btn");
      btn.title = t.label || "";
      btn.addEventListener("click", () => toggleTaxon(t, btn));
      wrap.appendChild(btn);
    });

    popover.appendChild(wrap);

    popover.addEventListener("mouseenter", cancelHide, { once: true });
    popover.addEventListener("mouseleave", scheduleHide, { once: true });
  }

  // --- FULL MODAL (All options) al centro -----------------------------------
  const fullPanel = document.createElement("div");
  fullPanel.className = "cf-fullpanel";
  fullPanel.style.display = "none";
  document.body.appendChild(fullPanel);

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
      famBtn.addEventListener("click", () => toggleFamily(info, famBtn));
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
        taxBtn.addEventListener("click", () => toggleTaxon(t, taxBtn));
        sub.appendChild(taxBtn);
      });
      card.appendChild(sub);

      body.appendChild(card);
    });
  }

  allBtn.addEventListener("click", () => {
    renderFullPanel();
    fullPanel.style.display = "block";
    document.body.classList.add("cf-modal-open");
  });

  // Collapse/expand — aggiorna UI e RIDISEGNA la griglia
  function applyCollapsed() {
    container.classList.toggle("cf-collapsed", collapsed);
    collapseBtn.textContent = collapsed ? "Show" : "Collapse";
    renderFamilies(); // <— fondamentale per cambiare layout (normale vs collassato)
  }
  collapseBtn.addEventListener("click", () => { collapsed = !collapsed; applyCollapsed(); });
  applyCollapsed(); // espanso all’avvio

  // Eventi & primo render
  resetBtn.addEventListener("click", resetFilters);
  search.addEventListener("input", renderFamilies);
  // Primo render viene già fatto da applyCollapsed()

  // Reset = mostra tutto (nessun filtro categoria)
  function resetFilters() {
    activePrecise.clear();
    document.querySelectorAll(".cf-family-btn.active, .cf-sub-btn.active")
      .forEach(el => el.classList.remove("active"));
    updateVisibleObjects(null); // null = nessun filtro (mostra tutto)
  }

  // Applica filtro a samples
  function applyFilter() {
    if (activePrecise.size === 0) {
      updateVisibleObjects(null);
      return;
    }
    const out = samplesFeatures.filter(f =>
      activePrecise.has(String(f?.properties?.precise_taxon || ""))
    );
    updateVisibleObjects(out);
  }
}
