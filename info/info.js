// info.js — paths via getPath, smooth scroll bottom-nav, scrollspy, tooltips globali, biblio (5 per pagina)
import { getPath } from "../path_utils.js";

document.addEventListener("DOMContentLoaded", () => {
  /* =========================
     Paths & immagini (data-src)
     ========================= */
  const homeLink = document.getElementById("home-link");
  if (homeLink) homeLink.href = getPath("index.html");

  document.querySelectorAll("[data-href]").forEach(el => {
    const rel = el.getAttribute("data-href");
    if (rel) el.setAttribute("href", getPath(rel));
  });

  document.querySelectorAll("img[data-src]").forEach(img => {
    const rel = img.getAttribute("data-src");
    if (rel) img.src = getPath(rel);
  });

  /* =========================
     Print button (bottom-nav)
     ========================= */
  const printBtn = document.getElementById("nav-print");
  if (printBtn) printBtn.addEventListener("click", () => window.print());

  /* =========================
     Smooth scroll (bottom-nav)
     ========================= */
  document.querySelectorAll('.bottom-nav a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      const target = href ? document.querySelector(href) : null;
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* =========================
     Scrollspy: active icon
     ========================= */
  const navLinks = Array.from(document.querySelectorAll('.bottom-nav a.bn[href^="#"]'));
  const navTargets = navLinks
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if (navLinks.length && navTargets.length) {
    const spy = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];

      if (!visible) return;

      const id = visible.target.id;
      navLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
      });
    }, { rootMargin: "-25% 0px -65% 0px", threshold: [0.01, 0.1, 0.25] });

    navTargets.forEach(s => spy.observe(s));
  }

  /* =========================
     Bottom-nav: si solleva sopra al footer quando necessario
     ========================= */
  const bottomNav = document.querySelector('.bottom-nav');
  const footer = document.querySelector('.page-footer');

  function updateNavLift(){
    if (!bottomNav || !footer) return;

    const footerTop = footer.getBoundingClientRect().top;
    const navRect = bottomNav.getBoundingClientRect();
    const navH = navRect.height;

    // distanza "base" dal fondo (coerente col CSS)
    const baseBottom = 12;

    // punto in cui la nav inizierebbe a sovrapporsi al footer
    const overlap = (window.innerHeight - baseBottom) - footerTop;

    // se overlap > 0: solleva la nav di overlap
    const lift = overlap > 0 ? -Math.ceil(overlap) : 0;

    bottomNav.style.setProperty('--nav-shift', `${lift}px`);
  }

  updateNavLift();
  window.addEventListener('scroll', updateNavLift, { passive: true });
  window.addEventListener('resize', updateNavLift);

  /* =========================
     Animazioni on-scroll
     ========================= */
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('animate'); }),
    { threshold: 0.12 }
  );
  document
    .querySelectorAll('.intro-card, .explanation-card, .future-card, .person-card, .logo-card')
    .forEach(el => observer.observe(el));

  /* =========================
     Expand/collapse Data Model
     ========================= */
  document.querySelectorAll('.table-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.classList && (t.classList.contains('q') || t.classList.contains('qh'))) return;
      card.classList.toggle('open');
    });
  });

  /* =========================
     Tooltip GLOBALI per i “?” (hover + click)
     ========================= */
  const tipEl = document.getElementById('dm-tooltip');
  let currentTarget = null;

  function showTip(btn){
    if (!tipEl || !btn) return;
    currentTarget = btn;
    tipEl.textContent = btn.getAttribute('data-tip') || '';
    tipEl.setAttribute('aria-hidden','false');
    requestAnimationFrame(() => positionTip(btn));
  }

  function hideTip(){
    if (!tipEl) return;
    currentTarget = null;
    tipEl.setAttribute('aria-hidden','true');
    tipEl.style.transform = 'translate(-9999px,-9999px)';
  }

  function positionTip(btn){
    if(!btn || !tipEl || tipEl.getAttribute('aria-hidden') === 'true') return;

    const rect = btn.getBoundingClientRect();
    const padding = 10;

    const tipRect = tipEl.getBoundingClientRect();
    const tipW = Math.min(tipRect.width || 320, 320);
    const tipH = tipRect.height || 60;

    let left = rect.left;
    let top  = rect.bottom + 10;

    if (left + tipW + padding > window.innerWidth) {
      left = Math.max(padding, window.innerWidth - tipW - padding);
    }
    if (left < padding) left = padding;

    if (top + tipH + padding > window.innerHeight) {
      top = Math.max(padding, rect.top - tipH - 10);
    }

    tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  document.querySelectorAll('.q, .qh').forEach(b=>{
    b.addEventListener('mouseenter', ()=>showTip(b));
    b.addEventListener('mouseleave', ()=>hideTip());
    b.addEventListener('focus', ()=>showTip(b));
    b.addEventListener('blur', ()=>hideTip());

    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentTarget === b) hideTip();
      else showTip(b);
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.q, .qh')) hideTip();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTip();
  });

  window.addEventListener('scroll', ()=>positionTip(currentTarget), {passive:true});
  window.addEventListener('resize', ()=>positionTip(currentTarget));

  /* =========================
     Bibliografia (CSV → tabella, 5 per pagina)
     ========================= */
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

    if ($pager) {
      $pager.innerHTML = btns.join('');
      $pager.querySelectorAll('button[data-p]').forEach(b=>b.addEventListener('click', ()=>{
        page=parseInt(b.dataset.p||'1',10);
        renderTable();
      }));
    }
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
    page=1;
    renderTable();
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
