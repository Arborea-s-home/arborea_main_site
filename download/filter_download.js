// download/filter_download.js
import { getPath } from '../path_utils.js';

/**
 * Taxa filter:
 * - Ricerca libera su family, precise_taxon (=valore) e nome_com (alias, anche multipli tra "...")
 * - Suggerimenti incrementali (prefisso) con multi-selezione persistente (chip con icona)
 * - "explore all taxa" → MODAL CENTRALE organizzato family → taxa (icone grandi)
 * - Reset = seleziona tutto (nessun filtro: Set vuoto)
 *
 * onChange(Set<string>) emette l’insieme dei precise_taxon (valore) attivi.
 */
export async function initTaxaFilter(mountEl, samplesFeatures, onChange){
  // ——— carica legenda
  const res  = await fetch(getPath("data/legenda_taxa.csv"));
  const text = await res.text();
  const parsed = (window.Papa ? window.Papa.parse(text, { header:true, skipEmptyLines:true }) : { data: [] }).data;

  const rows = parsed.map(r => ({
    family:   (r.category_1 || '').trim(),
    famImg:   (r.image_1    || '').trim(),
    taxon:    (r.category_2 || '').trim(),
    taxImg:   (r.image_2    || '').trim(),
    valore:   (r.valore     || '').trim(),    // precise_taxon
    nomeCom:  splitCommonNames(r.nome_com)    // array di alias
  })).filter(r => r.valore);

  // ——— indici
  const byFamily = new Map(); // family -> {image, taxa: Map(taxon -> {image, valori:Set})}
  const byTaxon  = new Map(); // taxon -> record (per icona/label)
  const byVal    = new Map(); // valore -> record
  const byAlias  = new Map(); // aliasLower -> Set(valore)

  rows.forEach(rec => {
    if (!byFamily.has(rec.family)) byFamily.set(rec.family, { image:rec.famImg, taxa:new Map(), allVals:new Set() });
    const fam = byFamily.get(rec.family);
    if (!fam.taxa.has(rec.taxon)) fam.taxa.set(rec.taxon, { image:rec.taxImg, valori:new Set() });
    fam.taxa.get(rec.taxon).valori.add(rec.valore);
    fam.allVals.add(rec.valore);

    if (!byTaxon.has(rec.taxon)) byTaxon.set(rec.taxon, rec);
    byVal.set(rec.valore, rec);

    rec.nomeCom.forEach(alias => {
      const key = alias.toLowerCase();
      if (!byAlias.has(key)) byAlias.set(key, new Set());
      byAlias.get(key).add(rec.valore);
    });
  });

  // ——— stato selezione: precise_taxon (vuoto = tutti)
  const active = new Set();

  // ——— UI base
  mountEl.innerHTML = `
    <div class="tx-head">
      <input id="txSearch" class="search-input" type="search" placeholder="Search family, taxon or common name…" autocomplete="off"/>
      <button id="txExplore" class="explore-btn" type="button">explore all taxa</button>
      <button id="txReset" class="rf-op" type="button" title="Reset (select all)">Reset</button>
    </div>
    <div id="txSuggest" class="tx-suggest" hidden></div>
    <div id="txSelected" class="sel-chips"></div>
  `;

  const qEl        = mountEl.querySelector('#txSearch');
  const sugEl      = mountEl.querySelector('#txSuggest');
  const selEl      = mountEl.querySelector('#txSelected');
  const resetBtn   = mountEl.querySelector('#txReset');
  const exploreBtn = mountEl.querySelector('#txExplore');

  // ——— Modal centrale (overlay + dialog)
  let modal = null;
  let overlay = null;

  const imgPath = (src) => getPath(src ? `images/objects/${src}` : 'images/objects/other.png');

  // ——— Ricerca / suggerimenti (prefisso)
  function buildSuggestions(prefix){
    const q = (prefix || '').trim().toLowerCase();
    if (!q) return [];
    const out = [];
    const seen = new Set();

    // family
    for (const [family, info] of byFamily.entries()){
      if (!family) continue;
      if (family.toLowerCase().startsWith(q)){
        const key = `fam|${family}`;
        if (!seen.has(key)){
          out.push({ type:'family', label:family, image:info.image, values:new Set(info.allVals) });
          seen.add(key);
        }
      }
    }
    // taxon scientifico
    for (const [taxon, rec] of byTaxon.entries()){
      if (taxon && taxon.toLowerCase().startsWith(q)){
        const key = `tax|${rec.valore}`;
        if (!seen.has(key)){
          out.push({ type:'taxon', label:taxon, image:rec.taxImg, value:rec.valore });
          seen.add(key);
        }
      }
    }
    // alias nome_com
    for (const [alias, valSet] of byAlias.entries()){
      if (alias.startsWith(q)){
        valSet.forEach(val=>{
          const rec = byVal.get(val); if (!rec) return;
          const key = `alias|${alias}|${val}`;
          if (!seen.has(key)){
            out.push({ type:'alias', label:capitalize(alias), image:rec.taxImg, value:val });
            seen.add(key);
          }
        });
      }
    }
    return out.slice(0, 30);
  }

  function paintSuggestions(list){
    if (!list.length){ sugEl.hidden = true; sugEl.innerHTML=''; return; }
    sugEl.hidden = false; sugEl.innerHTML = '';
    list.forEach(item => {
      const row = document.createElement('button');
      row.type='button'; row.className='tx-sug-row';

      const icn = document.createElement('img');
      icn.className='tx-sug-icn'; icn.alt=item.label || ''; icn.src=imgPath(item.image);
      row.appendChild(icn);

      const lab = document.createElement('span');
      lab.className='tx-sug-lab'; lab.textContent=item.label || '';
      row.appendChild(lab);

      const meta = document.createElement('span');
      meta.className='tx-sug-meta'; meta.textContent=item.type;
      row.appendChild(meta);

      row.addEventListener('click', ()=>{
        if (item.type === 'family'){
          const turnOn = ![...item.values].some(v=>active.has(v));
          item.values.forEach(v => turnOn ? active.add(v) : active.delete(v));
        } else {
          const v = item.value;
          active.has(v) ? active.delete(v) : active.add(v);
        }
        qEl.value = ''; paintSuggestions([]); paintSelected(); emitChange();
        // se il modal è aperto, rifresca gli stati dei bottoni
        if (modal) refreshModalStates();
      });

      sugEl.appendChild(row);
    });
  }

  function paintSelected(){
    selEl.innerHTML = '';
    [...active].map(v=>byVal.get(v)).filter(Boolean).forEach(rec=>{
      const chip = document.createElement('button');
      chip.type='button'; chip.className='sel-chip'; chip.title = rec.taxon || rec.valore;

      const img = document.createElement('img'); img.alt=rec.taxon || rec.valore; img.src=imgPath(rec.taxImg);
      chip.appendChild(img);

      const span = document.createElement('span'); span.textContent = rec.taxon || rec.valore;
      chip.appendChild(span);

      const x = document.createElement('span'); x.className='sel-x'; x.textContent='×';
      chip.appendChild(x);

      chip.addEventListener('click', ()=>{
        active.delete(rec.valore);
        paintSelected(); emitChange();
        if (modal) refreshModalStates();
      });

      selEl.appendChild(chip);
    });
  }

  function emitChange(){ onChange(new Set(active)); }

  // ——— Modal: build UI centrata stile “family card → subgrid taxa”
  function openModal(){
    if (modal) return; // già aperto

    overlay = document.createElement('div');
    overlay.className = 'tx-overlay';
    document.body.appendChild(overlay);

    modal = document.createElement('div');
    modal.className = 'tx-modal';
    modal.innerHTML = `
      <div class="tx-modal-head">
        <strong>All taxa</strong>
        <button type="button" class="tx-modal-close" aria-label="Close">×</button>
      </div>
      <div class="tx-modal-body"></div>
    `;
    document.body.appendChild(modal);
    document.body.classList.add('cf-modal-open');

    modal.querySelector('.tx-modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);

    // Body: cards per family
    const body = modal.querySelector('.tx-modal-body');
    body.innerHTML = '';
    const famEntries = [...byFamily.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    famEntries.forEach(([family, info])=>{
      const card = document.createElement('div');
      card.className = 'tx-card';

      const row = document.createElement('div');
      row.className = 'tx-card-row';

      const famBtn = makeCircleBtn(info.image, family, 'tx-family-btn');
      const lbl = document.createElement('span'); lbl.textContent = family || '(no family)';
      row.appendChild(famBtn); row.appendChild(lbl);
      card.appendChild(row);

      // toggle intera famiglia
      famBtn.addEventListener('click', ()=>{
        const hasAny = [...info.allVals].some(v=>active.has(v));
        const turnOn = !hasAny;
        info.allVals.forEach(v=> turnOn ? active.add(v) : active.delete(v));
        paintSelected(); emitChange(); refreshModalStates();
      });

      const sub = document.createElement('div');
      sub.className = 'tx-card-subgrid';

      const taxaList = [...info.taxa.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
      taxaList.forEach(([taxon, obj])=>{
        const tBtn = makeCircleBtn(obj.image, taxon, 'tx-sub-btn');
        tBtn.title = taxon || '';
        // stato iniziale
        const isOn = [...obj.valori].some(v=>active.has(v));
        if (isOn) tBtn.classList.add('active');

        tBtn.addEventListener('click', ()=>{
          const turnOn = ![...obj.valori].some(v=>active.has(v));
          obj.valori.forEach(v=> turnOn ? active.add(v) : active.delete(v));
          paintSelected(); emitChange(); refreshModalStates();
        });

        sub.appendChild(tBtn);
      });

      card.appendChild(sub);
      body.appendChild(card);
    });

    refreshModalStates();
  }

  function closeModal(){
    if (modal) { modal.remove(); modal = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    document.body.classList.remove('cf-modal-open');
  }

  function refreshModalStates(){
    if (!modal) return;
    // family: attiva se ANY dei suoi valori è selezionato
    const famBtns = modal.querySelectorAll('.tx-family-btn');
    [...famBtns].forEach(btn=>{
      const family = btn.getAttribute('aria-label') || btn.title || '';
      const info = byFamily.get(family);
      const on = info ? [...info.allVals].some(v=>active.has(v)) : false;
      btn.classList.toggle('active', on);
    });
    // taxa
    const subBtns = modal.querySelectorAll('.tx-sub-btn');
    [...subBtns].forEach(btn=>{
      const tax = btn.getAttribute('aria-label') || btn.title || '';
      const rec = byTaxon.get(tax);
      let on = false;
      if (rec) {
        const fam = byFamily.get(rec.family);
        const obj = fam?.taxa.get(tax);
        on = obj ? [...obj.valori].some(v=>active.has(v)) : false;
      }
      btn.classList.toggle('active', on);
    });
  }

  // ——— helpers UI
  function makeCircleBtn(img, title, cls){
    const btn = document.createElement('button');
    btn.type='button'; btn.className = cls;
    btn.setAttribute('aria-label', title || '');
    const im = document.createElement('img');
    im.alt = title || ''; im.loading='lazy'; im.src = imgPath(img);
    btn.appendChild(im);
    return btn;
  }

  // ——— Wires
  qEl.addEventListener('input', ()=>{
    paintSuggestions(buildSuggestions(qEl.value));
  });
  qEl.addEventListener('focus', ()=> paintSuggestions(buildSuggestions(qEl.value)) );
  qEl.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape'){ qEl.value=''; paintSuggestions([]); }
  });

  resetBtn.addEventListener('click', ()=>{
    active.clear();
    qEl.value=''; paintSuggestions([]); paintSelected(); emitChange();
    if (modal) refreshModalStates();
  });

  exploreBtn.addEventListener('click', ()=>{
    if (!modal) openModal(); else closeModal();
  });

  // init
  paintSelected();
  emitChange();
}

// —— utils
function splitCommonNames(raw){
  if (!raw) return [];
  const s = String(raw).trim().replace(/^"(.*)"$/,'$1'); // rimuovi virgolette esterne singole
  return s.split(',').map(t=>t.trim()).filter(Boolean);
}
function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
