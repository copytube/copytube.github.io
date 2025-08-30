// js/list.js (v1.8.1)
// 로그인 없어도 동작: auth wrapper에 의존하지 않음(redirect 없음)
// Index에서 저장된 카테고리 기반 목록, 검색/더보기/무한스크롤, watch 연동, 우측엣지 스와이프 복귀, 애니메이션/모션 내장

import { auth, db } from './firebase-init.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js';

/* ---------- 상단바(로그인 없어도 로딩 가능) ---------- */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnAbout     = document.getElementById("btnAbout");
const brandHome    = document.getElementById("brandHome");
const menuBackdrop = document.getElementById("menuBackdrop");

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown?.classList.remove("hidden"); requestAnimationFrame(()=> dropdown?.classList.add("show")); menuBackdrop?.classList.add('show'); }
function closeDropdown(){ isMenuOpen=false; dropdown?.classList.remove("show"); setTimeout(()=> dropdown?.classList.add("hidden"),180); menuBackdrop?.classList.remove('show'); }
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
dropdown?.addEventListener("click",(e)=> e.stopPropagation());
menuBackdrop?.addEventListener('click', closeDropdown);
addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });

btnAbout    ?.addEventListener("click", ()=>{ location.href="about.html"; closeDropdown(); });
btnMyUploads?.addEventListener("click", ()=>{ auth?.currentUser ? (location.href="manage-uploads.html") : (location.href="signin.html"); closeDropdown(); });
btnGoUpload ?.addEventListener("click", ()=>{ auth?.currentUser ? (location.href="upload.html")          : (location.href="signin.html"); closeDropdown(); });
btnSignOut  ?.addEventListener("click", async ()=>{
  if(!auth?.currentUser){ location.href='signin.html'; return; }
  try{ await signOut(getAuth()); }catch{}
  closeDropdown();
});
brandHome   ?.addEventListener("click",(e)=>{ e.preventDefault(); location.href="index.html"; });

try{
  onAuthStateChanged(getAuth(), (user)=>{
    const loggedIn = !!user;
    signupLink?.classList.toggle("hidden", loggedIn);
    signinLink?.classList.toggle("hidden", loggedIn);
    if (welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  });
}catch{ /* auth 초기화 실패해도 목록은 계속 동작 */ }

/* ---------- DOM ---------- */
const cards    = document.getElementById('cards');
const msgBox   = document.getElementById('msg');
const qbox     = document.getElementById('q');
const btnSearch= document.getElementById('btnSearch');
const btnMore  = document.getElementById('btnMore');
const sentinel = document.getElementById('sentinel');

function setStatus(t){ if(msgBox) msgBox.textContent = t || ''; }

/* ---------- 선택(카테고리) ---------- */
function parseCatsFromQuery(){
  try{
    const p = new URL(location.href).searchParams.get('cats');
    if(!p) return null;
    const arr = p.split(',').map(s=>s.trim()).filter(Boolean);
    return arr.length ? arr : null;
  }catch{ return null; }
}
function getSelectedCats(){
  const fromUrl = parseCatsFromQuery();
  if (fromUrl) return fromUrl;
  try{ return JSON.parse(localStorage.getItem('selectedCats')||'null'); }catch{ return "ALL"; }
}
const sel = getSelectedCats();

// 개인자료 단독 모드 여부
const PERSONAL_MODE = Array.isArray(sel) && sel.length === 1 && (sel[0]==='personal1' || sel[0]==='personal2');

// 공용 카테고리 필터 세트
let CAT_FILTER = null;
if (!PERSONAL_MODE){
  if (sel === "ALL" || !sel) CAT_FILTER = null;
  else if (Array.isArray(sel) && sel.length){
    CAT_FILTER = new Set(sel.filter(v => v!=='personal1' && v!=='personal2'));
  }
}

// 연속재생 옵션은 읽기만(존중)
const CONTINUOUS = (localStorage.getItem('continuousPlay')==='on') || (localStorage.getItem('autonext')==='on');

/* ---------- 칩 라벨 맵 ---------- */
const valueToLabel = (()=> {
  const m = new Map();
  CATEGORY_GROUPS.forEach(g => g.children.forEach(c => m.set(c.value, c.label)));
  return m;
})();

/* ---------- 유틸 ---------- */
function extractYouTubeId(url){
  const m = String(url||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/);
  return m ? m[1] : '';
}
function chipHtml(values=[]){
  return values.map(v=>`<span class="chip">${valueToLabel.get(v)||v}</span>`).join('');
}

/* ---------- 목록 상태 ---------- */
const PAGE_SIZE = 20;
let lastDoc = null;
let hasMore = true;
let isLoading = false;
let usingClientFallback = false;
let cache = []; // 화면에 적재된 전체(검색용)

/* ---------- 렌더 ---------- */
function cardEl(idx, docId, data){
  const id = extractYouTubeId(data.url);
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.index = String(idx);
  el.dataset.docId = docId || '';
  el.innerHTML = `
    <div class="title" title="${data.title||''}">${data.title || '(제목없음)'}</div>
    <div class="url"   title="${data.url||''}">${data.url||''}</div>
    <div class="chips">${chipHtml(data.categories||[])}</div>
    <div class="thumb" aria-hidden="true">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"/>
    </div>
  `;
  const go = (e)=>{
    e.preventDefault();
    const ids = cache.map(x => x.id);
    const at  = Number(el.dataset.index)||0;
    try{
      sessionStorage.setItem('nav_from', 'list');          // ✅ list에서 왔다는 표식
      sessionStorage.setItem('list_ids', JSON.stringify(ids));
      sessionStorage.setItem('list_index', String(at));
    }catch{}
    try{ sessionStorage.setItem('ct_enter_anim','from-right'); }catch{}
    document.documentElement.classList.add('slide-out-left');
    setTimeout(()=> location.href = 'watch.html', 180);
  };
  el.addEventListener('click', go);
  el.querySelector('.thumb')?.addEventListener('click', go);
  return el;
}

function applyFilter(){
  const q = (qbox?.value||'').trim().toLowerCase();
  cards.innerHTML = '';
  const rows = !q ? cache : cache.filter(x=>{
    const t = (x.data.title||'').toLowerCase();
    const u = (x.data.url||'').toLowerCase();
    return t.includes(q) || u.includes(q);
  });
  rows.forEach((x,i)=> cards.appendChild(cardEl(i, x.id, x.data)));
  btnMore?.classList.toggle('hidden', !!q);
  setStatus(rows.length ? '' : (q ? '검색 결과가 없습니다.' : '표시할 항목이 없습니다.'));
}
qbox?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); applyFilter(); }});
btnSearch?.addEventListener('click', ()=> applyFilter());

/* ---------- Firestore 로딩 ---------- */
function matchCatFilter(data){
  if(!CAT_FILTER) return true;
  const cats = Array.isArray(data?.categories) ? data.categories : [];
  for(const v of cats){ if(CAT_FILTER.has(v)) return true; }
  return false;
}

async function appendFromSnap(snap, initial=false, clientFilter=false){
  if(snap.empty){
    if(initial && cache.length===0) setStatus('표시할 항목이 없습니다.');
    hasMore=false;
    applyFilter();
    return;
  }
  const before = cache.length;
  for(const d of snap.docs){
    const data = d.data();
    if(clientFilter){
      if(!matchCatFilter(data)) continue;
    }
    cache.push({ id:d.id, data });
  }
  lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
  if (snap.size < PAGE_SIZE && !clientFilter) hasMore=false;
  const appended = cache.length - before;
  if (initial && appended===0){ setStatus('표시할 항목이 없습니다.'); }
  applyFilter();
}

async function loadMore(initial=false){
  if(isLoading || !hasMore) return;
  isLoading = true;
  setStatus('불러오는 중...');

  try{
    // 개인자료 모드: 목록 미지원(요구사항). 안내만
    if (PERSONAL_MODE){
      hasMore=false;
      setStatus('개인자료는 목록에서 지원하지 않습니다. (watch에서 단독 재생)');
      applyFilter();
      return;
    }

    const base = collection(db,'videos');

    // 필터 없음 → 최신순
    if(!CAT_FILTER){
      const parts = [ orderBy('createdAt','desc') ];
      if(lastDoc) parts.push(startAfter(lastDoc));
      parts.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(base, ...parts));
      await appendFromSnap(snap, initial);
    }
    // 필터 <=10 → array-contains-any + 최신순
    else if(CAT_FILTER.size <= 10){
      const parts = [ where('categories','array-contains-any', Array.from(CAT_FILTER)), orderBy('createdAt','desc') ];
      if(lastDoc) parts.push(startAfter(lastDoc));
      parts.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(base, ...parts));
      await appendFromSnap(snap, initial, /*clientFilter*/false);
    }
    // 필터 >10 → 서버 최신순만 가져오고, 클라이언트 필터
    else{
      usingClientFallback = true;
      let appended = 0;
      let guard = 0;
      while(appended < PAGE_SIZE && hasMore && guard < 5){
        const parts = [ orderBy('createdAt','desc') ];
        if(lastDoc) parts.push(startAfter(lastDoc));
        parts.push(limit(PAGE_SIZE));
        const snap = await getDocs(query(base, ...parts));
        if(snap.empty){ hasMore=false; break; }
        const before = cache.length;
        await appendFromSnap(snap, initial, /*clientFilter*/true);
        appended += (cache.length - before);
        guard++;
      }
      if(appended===0 && initial){ setStatus('표시할 항목이 없습니다.'); }
    }
  }catch(e){
    console.error('[list] loadMore error:', e);
    // 로그인 없어도 돌아가야 하므로, 에러도 안내만 하고 중단
    setStatus('목록을 불러오지 못했습니다.');
    hasMore=false;
  }finally{
    isLoading = false;
  }
}

async function loadInit(){
  cache = []; lastDoc=null; hasMore=true; isLoading=false;
  await loadMore(true);
}
loadInit();

btnMore?.addEventListener('click', ()=> loadMore(false));

/* 무한스크롤(센티널) */
if (sentinel){
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting && !isLoading && hasMore && !((qbox?.value||'').trim())){
        loadMore(false);
      }
    });
  }, { root:null, threshold:0.1 });
  io.observe(sentinel);
}

/* ---------- 오른쪽 엣지 스와이프 → Index 복귀 (모션 + 클래스) ---------- */
(function injectSlideCSS(){
  if (document.getElementById('slide-css-list')) return;
  const style = document.createElement('style');
  style.id = 'slide-css-list';
  style.textContent = `
@keyframes pageSlideRight { from { transform: translateX(0); opacity:1; } to { transform: translateX(22%); opacity:.92; } }
:root.slide-out-right body { animation: pageSlideRight 0.24s ease-out forwards; }
@media (prefers-reduced-motion: reduce){
  :root.slide-out-right body { animation:none; }
}
html, body { overscroll-behavior-x: contain; }
body { touch-action: pan-y; }
`;
  document.head.appendChild(style);
})();

(function initEdgeSwipeBack(){
  let sx=0, sy=0, t0=0, tracking=false, edge=false;
  const THRESH_X=60, MAX_OFF_Y=30, MAX_TIME=600, EDGE_PX=18;
  const getP = e => e.touches?.[0] || e.changedTouches?.[0] || e;

  function setX(x){ document.body.style.transform = `translateX(${x}px)`; }
  function reset(ms=140){
    document.body.style.transition = `transform ${ms}ms ease-out`;
    setX(0);
    setTimeout(()=>{ document.body.style.transition=''; }, ms);
  }

  function start(e){
    const p = getP(e);
    sx=p.clientX; sy=p.clientY; t0=Date.now(); tracking=true; edge=false;
    if (innerWidth - sx <= EDGE_PX) edge=true; else tracking=false;
    document.body.style.willChange='transform';
  }
  function move(e){
    if(!tracking) return;
    const p = getP(e);
    const dx=p.clientX - sx, dy=p.clientY - sy;
    if(Math.abs(dy)>MAX_OFF_Y){ tracking=false; reset(100); return; }
    if(!edge) return;
    if(dx<0){
      e.preventDefault();
      const drag = Math.max(dx, -Math.round(innerWidth*0.28));
      setX(drag);
    }
  }
  function end(e){
    if(!tracking) return; tracking=false;
    document.body.style.willChange='';

    const p = getP(e);
    const dx=p.clientX - sx, dy=p.clientY - sy, dt=Date.now()-t0;
    if(!edge || Math.abs(dy)>MAX_OFF_Y || dt>MAX_TIME){ reset(120); return; }

    if(dx <= -THRESH_X){
      try{ sessionStorage.setItem('ct_enter_anim','from-left'); }catch{}
      document.body.style.transition = 'transform 200ms ease-out';
      document.body.style.transform  = `translateX(${-Math.round(innerWidth*0.22)}px)`;
      setTimeout(()=>{ document.documentElement.classList.add('slide-out-right'); location.href='index.html'; }, 200);
      return;
    }
    reset(120);
  }

  // touch + pointer
  document.addEventListener('touchstart', start, {passive:true});
  document.addEventListener('touchmove',  move,  {passive:false});
  document.addEventListener('touchend',   end,   {passive:true});
  document.addEventListener('pointerdown',start, {passive:true});
  document.addEventListener('pointermove',move,  {passive:false});
  document.addEventListener('pointerup',  end,   {passive:true});
})();
