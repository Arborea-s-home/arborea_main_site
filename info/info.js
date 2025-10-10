// info.js — paths via getPath, TOC smooth, tooltips globali, biblio (5 per pagina)
import { getPath } from "../path_utils.js";

document.addEventListener("DOMContentLoaded", () => {
  /* Paths & immagini (data-src) */
  const homeLink = document.getElementById("home-link");
  if (homeLink) homeLink.href = getPath("index.html");
  document.querySelectorAll("img[data-src]").forEach(img => {
    const rel = img.getAttribute("data-src");
    if (rel) img.src = getPath(rel);
  });

  /* Smooth scroll dal TOC */
  document.querySelectorAll('.toc a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({behavior:'smooth', block:'start'}); }
    });
  });

  /* Toggle concettuale / tecnico */
  const toggle = document.getElementById("toggleExplanation");
  const conceptual = document.getElementById("conceptual");
  const technical = document.getElementById("technical");
  if (toggle && conceptual && technical) {
    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        conceptual.classList.add("hidden");
        technical.classList.remove("hidden");
        technical.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        technical.classList.add("hidden");
        conceptual.classList.remove("hidden");
      }
    });
  }

  /* Animazioni on-scroll */
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('animate'); }),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.intro-card, .explanation-card, .future-card, .person-card, .logo-card').forEach(el => observer.observe(el));

  /* Expand/collapse box Data Model */
  document.querySelectorAll('.table-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList && (e.target.classList.contains('q') || e.target.classList.contains('qh'))) return;
      card.classList.toggle('open');
    });
  });

  /* Tooltip GLOBALI per i bottoni “?” (evita clip-path/overflow) */
  const tipEl = document.getElementById('dm-tooltip');
  let currentTarget = null;

  function showTip(btn){
    currentTarget = btn;
    tipEl.textContent = btn.getAttribute('data-tip') || '';
    tipEl.setAttribute('aria-hidden','false');
    positionTip(btn);
  }
  function hideTip(){
    currentTarget = null;
    tipEl.setAttribute('aria-hidden','true');
    tipEl.style.transform = 'translate(-9999px,-9999px)';
  }
  function positionTip(btn){
    if(!btn || tipEl.getAttribute('aria-hidden') === 'true') return;
    const rect = btn.getBoundingClientRect();
    const padding = 8;
    const maxW = 320;
    const idealTop = rect.bottom + 8;
    let left = rect.left;
    // flip a sinistra se non c'è spazio a destra
    if (left + maxW + padding > window.innerWidth) {
      left = Math.max(padding, window.innerWidth - maxW - padding);
    }
    const top = Math.min(idealTop, window.innerHeight - tipEl.offsetHeight - padding);
    tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  document.querySelectorAll('.q, .qh').forEach(b=>{
    b.addEventListener('mouseenter', ()=>showTip(b));
    b.addEventListener('mouseleave', hideTip);
    b.addEventListener('focus', ()=>showTip(b));
    b.addEventListener('blur', hideTip);
  });
  window.addEventListener('scroll', ()=>positionTip(currentTarget), {passive:true});
  window.addEventListener('resize', ()=>positionTip(currentTarget));

  /* Bibliografia (CSV → tabella, 5 per pagina) */
  const BIB_PATH = getPath("data/biblio.csv");
  const $wrap  = document.getElementById('bib-table-wrap');
  const $search= document.getElementById('bib-search');
  const $pager = document.getElementById('bib-pagination');
  const PAGE_SIZE = 5;
  let bibRows = [], filtered = [], page = 1;

  const esc = s => String(s ?? '').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));

  function parseCSV(text){
    const rows=[]; let i=0,cur="",inQ=false; const out=[];
    const pushCell=()=>{out.push(cur);cur=""};
    const pushRow=()=>{rows.push(out.slice());out.length=0};
    for(;i<text.length;i++){
      const ch=text[i];
      if(inQ){
        if(ch==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else inQ=false; }
        else cur+=ch;
      }else{
        if(ch==='"') inQ=true;
        else if(ch===',') pushCell();
        else if(ch==='\n'){ pushCell(); pushRow(); }
        else if(ch==='\r'){}
        else cur+=ch;
      }
    }
    pushCell();
    if(out.length>1 || (out.length===1 && out[0]!=='')) pushRow();
    if(!rows.length) return [];
    const header = rows[0].map(h=>String(h).trim());
    return rows.slice(1).map(r=>{ const o={}; header.forEach((h,idx)=>o[h]=r[idx]??''); return o; });
  }

  function renderTable(){
    if(!$wrap) return;
    const start=(page-1)*PAGE_SIZE;
    const slice=filtered.slice(start, start+PAGE_SIZE);
    const html = [
      `<table class="styled-table"><thead><tr>
        <th>Authors</th><th>Year</th><th>Title</th><th>Published In</th><th>Pages</th><th>DOI / ISBN</th>
      </tr></thead><tbody>`,
      ...slice.map(r=>{
        const aut = r.autori || r.author || "";
        const yr  = r.anno || r.year || "";
        const tit = r.titolo || r.title || "";
        const ed  = r.edito_in || r.edit_in || "";
        const pg  = r.pagine || r.pages || "";
        const doi = (r.doi||"").trim();
        const isbn= (r.isbn||"").trim();
        const idcol=[
          doi ? `<a href="https://doi.org/${esc(doi)}" target="_blank" rel="noopener">${esc(doi)}</a>` : "",
          esc(isbn)
        ].filter(Boolean).join(' &middot; ');
        return `<tr>
          <td>${esc(aut)}</td>
          <td>${esc(yr)}</td>
          <td>${esc(tit)}</td>
          <td>${esc(ed)}</td>
          <td>${esc(pg)}</td>
          <td>${idcol}</td>
        </tr>`;
      }),
      `</tbody></table>`
    ].join('');
    $wrap.innerHTML = html;

    const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE));
    const mkBtn=(lbl,p,dis=false,act=false)=>`<button ${dis?'disabled':''} data-p="${p}" class="${act?'active':''}">${lbl}</button>`;
    const btns=[];
    btns.push(mkBtn('Prev', Math.max(1,page-1), page===1));
    const MAX_SHOWN = 6;
    const showFirst = Math.max(1, Math.min(page-2, Math.max(1, totalPages-MAX_SHOWN+1)));
    for(let p=showFirst; p<=totalPages && p<showFirst+MAX_SHOWN; p++){
      btns.push(mkBtn(String(p), p, false, p===page));
    }
    if(totalPages>showFirst+MAX_SHOWN-1) btns.push('<span>…</span>', mkBtn(String(totalPages), totalPages, false, page===totalPages));
    btns.push(mkBtn('Next', Math.min(totalPages, page+1), page===totalPages));
    $pager.innerHTML = btns.join('');
    $pager.querySelectorAll('button[data-p]').forEach(b=>b.addEventListener('click', ()=>{ page=parseInt(b.dataset.p||'1',10); renderTable(); }));
  }

  function applyFilter(){
    const q=($search?.value||'').toLowerCase();
    filtered = bibRows.filter(r=>{
      const hay=[
        r.autori,r.anno,r.titolo,r.edito_in,r.editore,r.nome_completo,r.doi,r.isbn,
        r.title,r.author,r.edit_in
      ].map(x=>String(x||'').toLowerCase()).join(' ');
      return hay.includes(q);
    });
    page=1; renderTable();
  }

  if($wrap && $search){
    fetch(BIB_PATH).then(r=>r.text()).then(txt=>{
      bibRows = parseCSV(txt);
      filtered = bibRows.slice();
      renderTable();
      $search.addEventListener('input', applyFilter);
    }).catch(()=>{
      $wrap.innerHTML = '<p style="opacity:.7">Bibliography not available.</p>';
    });
  }
});
