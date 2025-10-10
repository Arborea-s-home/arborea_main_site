// download/download_page.js
import { getPath } from '../path_utils.js';
import { initTaxaFilter } from './filter_download.js';

// ---------------------------------------------------------
// Config
// ---------------------------------------------------------
const PATHS = {
  sites:    getPath('data/siti.geojson'),
  contexts: getPath('data/contesti.geojson'),
  samples:  getPath('data/samples.geojson')
};

const DEFAULT_FIELDS = {
  sites:    ['fid','site_code','name','typology','region','province','source_type','source'],
  contexts: ['fid','site_code','context_name','type','chron_orig','typology','region','province'],
  samples:  ['id','context_id','precise_taxon','s_type','s_part','quantity','Family','genus','specie','region','province']
};

// ---------------------------------------------------------
// Stato
// ---------------------------------------------------------
const state = {
  dataset: 'sites',
  raw: { sites: [], contexts: [], samples: [] }, // Feature[]
  tableRows: [],          // righe piatte per preview
  filteredIds: new Set(), // indici di feature filtrate (rispettando l’ordine di push in tableRows)
  allFields: [],
  activeFields: new Set(DEFAULT_FIELDS['sites']),
  // Area
  regions: new Set(),
  provinces: new Set(),
  selectedRegions: new Set(),
  selectedProvinces: new Set(),
  // Sidebar destra
  taxaSet: new Set(),     // precise_taxon selezionati (solo per samples)
  typologySet: new Set(), // typology selezionate
  periodSet: new Set(),   // period (chronology_iccd / parent_chronology_iccd)
  typologyAll: [],
  periodAll: [],
  // Paging
  page: 1,
  pageSize: 25
};

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
const $ = (s)=>document.querySelector(s);
function uniq(a){ return Array.from(new Set(a)); }
function escCSV(v){
  if (v==null) return '';
  const s=String(v).replace(/"/g,'""');
  return /[",\n]/.test(s)?`"${s}"`:s;
}
function toCSV(rows, fields){
  const head = fields.join(',');
  const body = rows.map(r=>fields.map(f=>escCSV(r[f])).join(',')).join('\n');
  return head+'\n'+body;
}
function flattenFeature(f){ return {...(f.properties||{})}; }
function setHomeIcon(){
  const img = $('#homeLogo');
  if (img) img.src = getPath('images/logo_completo.png'); // icona “back”
}

// ---------------------------------------------------------
// Load
// ---------------------------------------------------------
async function loadAll(){
  const [s, c, x] = await Promise.all([
    fetch(PATHS.sites).then(r=>r.json()),
    fetch(PATHS.contexts).then(r=>r.json()),
    fetch(PATHS.samples).then(r=>r.json())
  ]);
  state.raw.sites    = s.features || [];
  state.raw.contexts = c.features || [];
  state.raw.samples  = x.features || [];
}

function computeAllFields(ds){
  const keys = new Set();
  state.raw[ds].forEach(f => Object.keys(f.properties||{}).forEach(k=>keys.add(k)));
  if (ds==='samples'){ keys.add('region'); keys.add('province'); }
  return Array.from(keys);
}

// Join contesti: anche typology/period oltre ad area
function buildContextAreaLookup(){
  const lut = new Map();
  state.raw.contexts.forEach(f=>{
    const p=f.properties||{};
    const period = p.chronology_iccd || p.parent_chronology_iccd || null;
    if (p.fid!=null) {
      lut.set(String(p.fid), {
        region: p.region || null,
        province: p.province || null,
        typology: p.typology || null,
        period
      });
    }
  });
  return lut;
}

// Popola set region/province per dataset corrente
function computeAreas(){
  state.regions.clear(); state.provinces.clear();
  const ds = state.dataset;
  if (ds==='samples'){
    const lut = buildContextAreaLookup();
    state.raw.samples.forEach(f=>{
      const p=f.properties||{};
      const a = lut.get(String(p.context_id));
      if (a?.region)   state.regions.add(a.region);
      if (a?.province) state.provinces.add(a.province);
    });
  } else {
    state.raw[ds].forEach(f=>{
      const p=f.properties||{};
      if (p.region)   state.regions.add(p.region);
      if (p.province) state.provinces.add(p.province);
    });
  }
}

// Typology & Period (period può essere lista separata da virgole)
function computeTypologyAndPeriod(){
  const ds = state.dataset;
  const typ = new Set(), per = new Set();

  if (ds === 'samples'){
    const lut = buildContextAreaLookup();
    state.raw.samples.forEach(f=>{
      const p=f.properties||{};
      const a = lut.get(String(p.context_id));
      if (a?.typology) typ.add(a.typology);
      if (a?.period){
        String(a.period).split(',').map(s=>s.trim()).filter(Boolean).forEach(v=>per.add(v));
      }
    });
  } else {
    state.raw[ds].forEach(f=>{
      const p=f.properties||{};
      if (p.typology) typ.add(p.typology);
      const period = p.chronology_iccd || p.parent_chronology_iccd || '';
      if (period){
        String(period).split(',').map(s=>s.trim()).filter(Boolean).forEach(v=>per.add(v));
      }
    });
  }
  state.typologyAll = Array.from(typ).sort();
  state.periodAll   = Array.from(per).sort();
}

// ---------------------------------------------------------
// Filtri base
// ---------------------------------------------------------
function isAreaSelected(){
  return state.selectedRegions.size>0 || state.selectedProvinces.size>0;
}
function filterByArea(p){
  const okRegion = state.selectedRegions.size ? state.selectedRegions.has(p.region) : true;
  const okProv   = state.selectedProvinces.size ? state.selectedProvinces.has(p.province) : true;
  return okRegion && okProv;
}

// ---------------------------------------------------------
// Rebuild righe (applica tutti i filtri)
// ---------------------------------------------------------
function rebuildRows(){
  state.tableRows = [];
  state.filteredIds.clear();

  // gating: senza area non mostriamo niente
  if (!isAreaSelected()) return;

  const ds = state.dataset;
  const hasTyp = state.typologySet.size>0;
  const hasPer = state.periodSet.size>0;

  if (ds==='samples'){
    const lut = buildContextAreaLookup();
    state.raw.samples.forEach((f,idx)=>{
      const p = flattenFeature(f);
      const a = lut.get(String(p.context_id)) || {};
      // area
      p.region   = a.region || null;
      p.province = a.province || null;
      if (!filterByArea(p)) return;
      // taxa (precise_taxon)
      if (state.taxaSet.size>0 && !state.taxaSet.has(String(p.precise_taxon||""))) return;
      // typology / period dal contesto
      if (hasTyp && !state.typologySet.has(a.typology||'')) return;
      if (hasPer){
        const vals = String(a.period||'').split(',').map(s=>s.trim()).filter(Boolean);
        if (!vals.some(v=>state.periodSet.has(v))) return;
      }
      state.tableRows.push(p);
      state.filteredIds.add(idx);
    });
  } else {
    state.raw[ds].forEach((f,idx)=>{
      const p = flattenFeature(f);
      if (!filterByArea(p)) return;
      if (hasTyp && !state.typologySet.has(p.typology||'')) return;
      const period = p.chronology_iccd || p.parent_chronology_iccd || '';
      if (hasPer){
        const vals = String(period).split(',').map(s=>s.trim()).filter(Boolean);
        if (!vals.some(v=>state.periodSet.has(v))) return;
      }
      state.tableRows.push(p);
      state.filteredIds.add(idx);
    });
  }

  state.page = 1; // reset pagina
}

// ---------------------------------------------------------
// UI: area chips (region/province)
// ---------------------------------------------------------
function paintAreaChips(){
  const rW=$('#regionChips'), pW=$('#provinceChips');
  rW.innerHTML=''; pW.innerHTML='';

  uniq(Array.from(state.regions)).sort().forEach(reg=>{
    const el=document.createElement('button');
    el.className='chip';
    el.textContent=reg;
    if (state.selectedRegions.has(reg)) el.classList.add('active');
    el.addEventListener('click', ()=>{
      const on=state.selectedRegions.has(reg);
      on?state.selectedRegions.delete(reg):state.selectedRegions.add(reg);
      el.classList.toggle('active', !on);
      rebuildRows(); paintTable();
    });
    rW.appendChild(el);
  });

  uniq(Array.from(state.provinces)).sort().forEach(pr=>{
    const el=document.createElement('button');
    el.className='chip';
    el.textContent=pr;
    if (state.selectedProvinces.has(pr)) el.classList.add('active');
    el.addEventListener('click', ()=>{
      const on=state.selectedProvinces.has(pr);
      on?state.selectedProvinces.delete(pr):state.selectedProvinces.add(pr);
      el.classList.toggle('active', !on);
      rebuildRows(); paintTable();
    });
    pW.appendChild(el);
  });

  $('#regionsSelectAll').onclick = ()=>{ state.selectedRegions=new Set(state.regions); paintAreaChips(); rebuildRows(); paintTable(); };
  $('#regionsClear').onclick     = ()=>{ state.selectedRegions.clear(); paintAreaChips(); rebuildRows(); paintTable(); };
  $('#provincesSelectAll').onclick = ()=>{ state.selectedProvinces=new Set(state.provinces); paintAreaChips(); rebuildRows(); paintTable(); };
  $('#provincesClear').onclick     = ()=>{ state.selectedProvinces.clear(); paintAreaChips(); rebuildRows(); paintTable(); };
}

// ---------------------------------------------------------
// UI: fields bar
// ---------------------------------------------------------
function paintFieldsBar(){
  const bar=$('#fieldsBar'); bar.innerHTML='';
  state.allFields.sort().forEach(f=>{
    const on=state.activeFields.has(f);
    const pill=document.createElement('button');
    pill.className=`field-pill ${on?'on':'off'}`;
    pill.textContent=f;
    pill.addEventListener('click', ()=>{
      if (state.activeFields.has(f)) state.activeFields.delete(f);
      else state.activeFields.add(f);
      paintFieldsBar(); paintTable();
    });
    bar.appendChild(pill);
  });
}

// ---------------------------------------------------------
// UI: typology & period chips (sidebar destra)
// ---------------------------------------------------------
function paintTypologyChips(){
  const wrap = $('#typologyChips'); if (!wrap) return;
  wrap.innerHTML='';
  (state.typologyAll||[]).forEach(v=>{
    const b=document.createElement('button'); b.className='rf-chip';
    b.textContent=v;
    if (state.typologySet.has(v)) b.classList.add('active');
    b.addEventListener('click', ()=>{
      const on=state.typologySet.has(v);
      on?state.typologySet.delete(v):state.typologySet.add(v);
      b.classList.toggle('active', !on);
      rebuildRows(); paintTable();
    });
    wrap.appendChild(b);
  });
  const selAll = $('#typSelAll'), clear = $('#typClear');
  if (selAll) selAll.onclick = ()=>{ state.typologySet = new Set(state.typologyAll); paintTypologyChips(); rebuildRows(); paintTable(); };
  if (clear)  clear.onclick  = ()=>{ state.typologySet.clear(); paintTypologyChips(); rebuildRows(); paintTable(); };
}

function paintPeriodChips(){
  const wrap = $('#periodChips'); if (!wrap) return;
  wrap.innerHTML='';
  (state.periodAll||[]).forEach(v=>{
    const b=document.createElement('button'); b.className='rf-chip';
    b.textContent=v;
    if (state.periodSet.has(v)) b.classList.add('active');
    b.addEventListener('click', ()=>{
      const on=state.periodSet.has(v);
      on?state.periodSet.delete(v):state.periodSet.add(v);
      b.classList.toggle('active', !on);
      rebuildRows(); paintTable();
    });
    wrap.appendChild(b);
  });
  const selAll = $('#perSelAll'), clear = $('#perClear');
  if (selAll) selAll.onclick = ()=>{ state.periodSet = new Set(state.periodAll); paintPeriodChips(); rebuildRows(); paintTable(); };
  if (clear)  clear.onclick  = ()=>{ state.periodSet.clear(); paintPeriodChips(); rebuildRows(); paintTable(); };
}

// ---------------------------------------------------------
// Table + paging
// ---------------------------------------------------------
function totalPages(filteredRows){ return Math.max(1, Math.ceil(filteredRows.length/state.pageSize)); }
function currentSlice(filteredRows){
  const start=(state.page-1)*state.pageSize;
  return filteredRows.slice(start, start+state.pageSize);
}

function paintTable(){
  const thead=$('#dataTable thead'), tbody=$('#dataTable tbody'), noRes=$('#noResults');
  thead.innerHTML=''; tbody.innerHTML='';

  const fields = Array.from(state.activeFields);
  // header
  const trh=document.createElement('tr');
  fields.forEach(f=>{ const th=document.createElement('th'); th.textContent=f; trh.appendChild(th); });
  thead.appendChild(trh);

  // gating messaggio
  if (!isAreaSelected()){
    if (noRes) noRes.hidden=false;
    const info=$('#pageInfo'); if (info) info.textContent='Page 0/0';
    const prev=$('#prevPage'), next=$('#nextPage');
    if (prev) prev.disabled=true; if (next) next.disabled=true;
    return;
  } else {
    if (noRes) noRes.hidden=true;
  }

  // search
  const q = ($('#tableSearch')?.value||'').toLowerCase();

  const filtered = state.tableRows.filter(r=>{
    if (!q) return true;
    return fields.map(f=>r[f]).join(' ').toLowerCase().includes(q);
  });

  const pages = totalPages(filtered);
  state.page = Math.min(state.page, pages);

  currentSlice(filtered).forEach(r=>{
    const tr=document.createElement('tr');
    fields.forEach(f=>{
      const td=document.createElement('td');
      let v = r[f];
      if (Array.isArray(v) || (v && typeof v==='object')) { try{ v=JSON.stringify(v); } catch(e){ v=String(v); } }
      td.textContent = (v ?? '');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  const info=$('#pageInfo'); if (info) info.textContent = `Page ${pages===0?0:state.page}/${pages}`;
  const prev=$('#prevPage'), next=$('#nextPage');
  if (prev) prev.disabled = (state.page<=1);
  if (next) next.disabled = (state.page>=pages);
}

// ---------------------------------------------------------
// Wire
// ---------------------------------------------------------
function wireHome(){
  $('#homeLink')?.addEventListener('click', (e)=>{
    e.preventDefault();
    window.location.href = getPath('index.html');
  });
  setHomeIcon();
}

function wireDatasetChooser(){
  const chooser = $('#datasetChooser');
  chooser?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.ds-btn'); if(!btn) return;
    chooser.querySelectorAll('.ds-btn').forEach(b=>b.setAttribute('aria-pressed','false'));
    btn.setAttribute('aria-pressed','true');

    state.dataset = btn.dataset.ds;
    state.allFields = computeAllFields(state.dataset);
    state.activeFields = new Set(DEFAULT_FIELDS[state.dataset] || state.allFields.slice(0,10));

    // reset filtri specifici
    state.taxaSet.clear();
    state.typologySet.clear();
    state.periodSet.clear();

    computeAreas();
    computeTypologyAndPeriod();
    paintAreaChips();
    paintFieldsBar();
    paintTypologyChips();
    paintPeriodChips();

    // taxa widget (solo per samples)
    const mount = document.getElementById('taxaFilterMount');
    if (mount){ mount.innerHTML = ''; }
    if (state.dataset === 'samples' && mount){
      initTaxaFilter(mount, state.raw.samples, (selectedSet)=>{
        state.taxaSet = selectedSet || new Set();
        rebuildRows(); paintTable();
      });
    }

    rebuildRows();
    paintTable();
  });
}

function wireSearchAndDownload(){
  $('#tableSearch')?.addEventListener('input', ()=>{ state.page=1; paintTable(); });
  $('#rowsPerPage')?.addEventListener('change', (e)=>{
    state.pageSize = parseInt(e.target.value,10) || 25;
    state.page = 1;
    paintTable();
  });
  $('#prevPage')?.addEventListener('click', ()=>{ if (state.page>1){ state.page--; paintTable(); } });
  $('#nextPage')?.addEventListener('click', ()=>{ state.page++; paintTable(); });

  // CSV export (tutti i record filtrati, non solo pagina)
  $('#downloadCsvBtn')?.addEventListener('click', ()=>{
    if (!isAreaSelected()) return;
    const fields = Array.from(state.activeFields);
    const q = ($('#tableSearch')?.value||'').toLowerCase();
    const rows = state.tableRows.filter(r=>{
      if (!q) return true;
      return fields.map(f=>r[f]).join(' ').toLowerCase().includes(q);
    });
    const csv = toCSV(rows, fields);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`${state.dataset}_export.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // GeoJSON export (rispetta tutti i filtri; geometrie originali; properties = campi attivi)
  $('#downloadGeoBtn')?.addEventListener('click', ()=>{
    if (!isAreaSelected()) return;

    const fields = Array.from(state.activeFields);
    const q = ($('#tableSearch')?.value||'').toLowerCase();

    // mappa righe visibili (dopo search) ai relativi index originali
    const passSearch = new Set();
    state.tableRows.forEach((r, i)=>{
      if (!q || fields.map(f=>r[f]).join(' ').toLowerCase().includes(q)) {
        passSearch.add(i);
      }
    });

    // idArray e tableRows hanno stesso ordine di push
    const idArray = Array.from(state.filteredIds);
    const sourceArr = state.raw[state.dataset];

    const featuresOut = [];
    let rowIdx=0;
    idArray.forEach(origIdx=>{
      if (!passSearch.has(rowIdx)) { rowIdx++; return; }
      const feat = sourceArr[origIdx];
      const propsFlat = flattenFeature(feat);
      const outProps = {};
      fields.forEach(f=>{ outProps[f] = propsFlat[f]; });
      featuresOut.push({
        type:'Feature',
        properties: outProps,
        geometry: feat.geometry ?? null
      });
      rowIdx++;
    });

    const gj = { type:'FeatureCollection', features: featuresOut, crs: { type:'name', properties:{name:'EPSG:4326'} } };
    const blob = new Blob([JSON.stringify(gj)], {type:'application/geo+json'});
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`${state.dataset}_export.geojson`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
}

// ---------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------
(async function main(){
  wireHome();
  await loadAll();

  state.allFields = computeAllFields(state.dataset);
  state.activeFields = new Set(DEFAULT_FIELDS[state.dataset] || state.allFields.slice(0,10));

  computeAreas();
  computeTypologyAndPeriod();

  // di default nessuna area selezionata → preview vuota
  paintAreaChips();
  paintFieldsBar();
  paintTypologyChips();
  paintPeriodChips();

  // taxa: solo se parti con dataset 'samples'
  if (state.dataset === 'samples'){
    const mount = document.getElementById('taxaFilterMount');
    if (mount){
      initTaxaFilter(mount, state.raw.samples, (selectedSet)=>{
        state.taxaSet = selectedSet || new Set();
        rebuildRows(); paintTable();
      });
    }
  }

  rebuildRows();
  paintTable();

  wireDatasetChooser();
  wireSearchAndDownload();
})();
