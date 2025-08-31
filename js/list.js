// js/list.js (v1.7.0) — list 페이지에 '끌리는 모션' 스와이프 추가(단순형 유지)
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, orderBy, limit, startAfter
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/* ---------- 전역 내비 중복 방지 플래그 ---------- */
window.__swipeNavigating = window.__swipeNavigating || false;

/* ---------- Topbar 로그인 상태 동기화 ---------- */
const signupLink = document.getElementById('signupLink');
const signinLink = document.getElementById('signinLink');
const welcome    = document.getElementById('welcome');
const menuBtn    = document.getElementById('menuBtn');
const dropdown   = document.getElementById('dropdownMenu');
const btnSignOut = document.getElementById('btnSignOut');
const btnGoUpload= document.getElementById('btnGoUpload');
const btnAbout   = document.getElementById('btnAbout');

onAuthStateChanged(auth, (user) => {
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user?.displayName || '회원'}님` : '';
});

// 메뉴/버튼
menuBtn   ?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown?.classList.toggle('hidden'); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) dropdown?.classList.add('hidden'); }, true);
btnSignOut?.addEventListener('click', async ()=>{
  if (!auth.currentUser) { location.href = 'signin.html'; return; }
  try { await fbSignOut(auth); } catch {}
  dropdown?.classList.add('hidden');
});
btnGoUpload?.addEventListener('click', ()=>{ location.href = 'upload.html'; });
btnAbout   ?.addEventListener('click', ()=>{ location.href = 'about.html'; });

/* ---------- DOM ---------- */
const $cards     = document.getElementById('cards');
const $msg       = document.getElementById('msg') || document.getElementById('resultMsg');
const $q         = document.getElementById('q');
const $btnSearch = document.getElementById('btnSearch');
const $btnClear  = document.getElementById('btnClear'); // 없어도 안전 (옵셔널 체이닝)
const $btnMore   = document.getElementById('btnMore');

/* ---------- 상태 ---------- */
const PAGE_SIZE = 60;
let allDocs   = [];
let lastDoc   = null;
let hasMore   = true;
let isLoading = false;

/* ---------- 유틸 ---------- */
function getSelectedCats(){
  try {
    const raw = localStorage.getItem('selectedCats');
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function esc(s=''){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function extractId(url=''){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&\/]+)/);
  return m ? m[1] : '';
}
function toThumb(url, fallback=''){
  const id = extractId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : fallback;
}
function getLabel(key){
  if (window?.CATEGORIES?.labelMap?.[key]) return window.CATEGORIES.labelMap[key];
  if (window?.CATEGORY_LABELS?.[key]) return window.CATEGORY_LABELS[key];
  if (window?.COPYTUBE?.categories?.labels?.[key]) return window.COPYTUBE.categories.labels[key];
  try { if (typeof window.getLabel === 'function') return window.getLabel(key) ?? key; } catch {}
  return key;
}
function setStatus(t){ if($msg) $msg.textContent = t || ''; }
function toggleMore(show){ if($btnMore) $btnMore.style.display = show ? '' : 'none'; }

/* ---------- 개인자료 모드 지원 ---------- */
function isPersonalOnlySelection(){
  try{
    const raw = localStorage.getItem('selectedCats');
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) && v.length === 1 && (v[0] === 'personal1' || v[0] === 'personal2');
  }catch{ return false; }
}
function getPersonalSlot(){
  try{
    const v = JSON.parse(localStorage.getItem('selectedCats') || '[]');
    return Array.isArray(v) ? v[0] : null; // 'personal1' | 'personal2'
  }catch{ return null; }
}
function readPersonalItems(slot){
  const key = `copytube_${slot}`;
  try{
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function getPersonalLabel(slot){
  try{
    const labels = JSON.parse(localStorage.getItem('personalLabels') || '{}');
    return labels?.[slot] || (slot === 'personal1' ? '개인자료1' : '개인자료2');
  }catch{ return slot; }
}

function renderPersonalList(){
  const slot  = getPersonalSlot();
  const items = readPersonalItems(slot);
  const label = getPersonalLabel(slot);

  $cards.innerHTML = '';
  if (!items.length){
    $cards.innerHTML = `<div style="padding:14px;border:1px dashed var(--border,#333);border-radius:12px;color:#cfcfcf;">${esc(label)}에 저장된 영상이 없습니다.</div>`;
    toggleMore(false);
    setStatus('0개');
    return;
  }

  const frag = document.createDocumentFragment();
  const sorted = items.slice().sort((a,b)=> (b?.savedAt||0) - (a?.savedAt||0));

  sorted.forEach((it, idx)=>{
    const title = it.title || '(제목 없음)';
    const url   = it.url   || '';
    const thumb = `https://i.ytimg.com/vi/${extractId(url)}/hqdefault.jpg`;

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="left">
        <div class="title" title="${esc(title)}">${esc(title)}</div>
        <div class="url" title="${esc(url)}">${esc(url)}</div>
        <div class="chips"><span class="chip">${esc(label)}</span></div>
      </div>
      <div class="right">
        <div class="thumb-wrap"><img class="thumb" src="${esc(thumb)}" alt="썸네일" loading="lazy"></div>
      </div>
    `;
    card.querySelector('.left') ?.addEventListener('click', ()=> openInWatchPersonal(sorted, idx, slot, label));
    card.querySelector('.thumb')?.addEventListener('click', ()=> openInWatchPersonal(sorted, idx, slot, label));
    frag.appendChild(card);
  });

  $cards.appendChild(frag);
  toggleMore(false);
  setStatus(`총 ${items.length}개`);
}

function openInWatchPersonal(items, index, slot, label){
  const queue = items.map((it, i)=> ({
    id: `local-${slot}-${i}`,
    url: it.url || '',
    title: it.title || '(제목 없음)',
    cats: [label]
  }));
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(index));
  // 큐 모드로 바로: idx만으로도 watch가 재생되도록 (watch.js에 idx/doc 가드 있음)
  location.href = `watch.html?idx=${index}&cats=${encodeURIComponent(slot)}`;
}

/* ---------- Firestore 로드 ---------- */
async function loadPage(){
  if(isLoading || !hasMore) return;
  isLoading = true;
  setStatus(allDocs.length ? `총 ${allDocs.length}개 불러옴 · 더 불러오는 중…` : '불러오는 중…');

  try {
    const parts = [ orderBy('createdAt','desc') ];
    if (lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const snap = await getDocs(query(collection(db,'videos'), ...parts));
    if (snap.empty) { hasMore = false; toggleMore(false); setStatus(allDocs.length ? `총 ${allDocs.length}개` : '등록된 영상이 없습니다.'); isLoading=false; return; }

    const batch = snap.docs.map(d => ({
      id: d.id,
      data: d.data()
    }));
    allDocs = allDocs.concat(batch);
    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if (snap.size < PAGE_SIZE) hasMore = false;
  } catch (e) {
    console.warn('[list] fallback:', e?.message || e);
    try {
      const snap = await getDocs(query(collection(db,'videos'), limit(PAGE_SIZE*3)));
      const arr = snap.docs.map(d => ({ id:d.id, data:d.data(), _t:(d.data()?.createdAt?.toMillis?.()||0) }));
      arr.sort((a,b)=> b._t - a._t);
      allDocs = allDocs.concat(arr.map(({_t,...rest})=>rest));
      hasMore = false;
    } catch(e2){
      console.error('[list] load failed:', e2);
      setStatus('목록을 불러오지 못했습니다.');
      toggleMore(false);
      isLoading=false;
      return;
    }
  }

  render();
  toggleMore(hasMore);
  setStatus(`총 ${allDocs.length}개`);
  isLoading = false;
}

/* ---------- 렌더 & 필터 (일반 카테고리) ---------- */
function render(){
  const cats = getSelectedCats();
  const q = ($q?.value || '').trim().toLowerCase();

  // 필터
  let list = allDocs.slice();
  if (cats.length){
    list = list.filter(x => {
      const arr = Array.isArray(x.data?.categories) ? x.data.categories : [];
      return arr.some(v => cats.includes(v));
    });
  }
  if (q){
    list = list.filter(x => {
      const t = String(x.data?.title || '').toLowerCase();
      const u = String(x.data?.url || '').toLowerCase();
      return t.includes(q) || u.includes(q);
    });
  }

  // 렌더
  $cards.innerHTML = '';
  if (!list.length){
    $cards.innerHTML = `<div style="padding:14px;border:1px dashed var(--border,#333);border-radius:12px;color:#cfcfcf;">결과가 없습니다.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((x, idx) => {
    const title = x.data?.title || '(제목 없음)';
    const url   = x.data?.url || '';
    const catsV = Array.isArray(x.data?.categories) ? x.data.categories : [];
    const thumb = x.data?.thumbnail || toThumb(url);

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="left">
        <div class="title" title="${esc(title)}">${esc(title)}</div>
        <div class="url" title="${esc(url)}">${esc(url)}</div>
        <div class="chips">${catsV.map(v=>`<span class="chip" title="${esc(v)}">${esc(getLabel(v))}</span>`).join('')}</div>
      </div>
      <div class="right">
        <div class="thumb-wrap"><img class="thumb" src="${esc(thumb)}" alt="썸네일" loading="lazy"></div>
      </div>
    `;
    // 왼쪽/썸네일 클릭 → watch로 이동(큐+인덱스)
    card.querySelector('.left') ?.addEventListener('click', ()=> openInWatch(list, idx));
    card.querySelector('.thumb')?.addEventListener('click', ()=> openInWatch(list, idx));

    frag.appendChild(card);
  });
  $cards.appendChild(frag);
}

/* ---------- watch로 이동(큐 + 인덱스 + doc + cats 파라미터) ---------- */
function openInWatch(list, index){
  const queue = list.map(x => ({
    id: x.id,
    url: x.data?.url || '',
    title: x.data?.title || '',
    cats: Array.isArray(x.data?.categories) ? x.data.categories : []
  }));
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(index));

  const docId = encodeURIComponent(list[index].id);

  // 현재 선택된 카테고리를 URL에도 포함(복구/공유 대비)
  let catsParam = '';
  try{
    const raw = localStorage.getItem('selectedCats');
    const parsed = JSON.parse(raw || '[]');
    const arr = Array.isArray(parsed) ? parsed : [];
    if (arr.length) catsParam = `&cats=${encodeURIComponent(arr.join(','))}`;
  }catch{}

  location.href = `watch.html?doc=${docId}&idx=${index}${catsParam}`;
}

/* ---------- 이벤트 ---------- */
$q?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); isPersonalOnlySelection() ? renderPersonalList() : render(); }});
$btnSearch?.addEventListener('click', ()=> isPersonalOnlySelection() ? renderPersonalList() : render());
$btnClear ?.addEventListener('click', ()=> { if($q){ $q.value=''; } isPersonalOnlySelection() ? renderPersonalList() : render(); });
$btnMore  ?.addEventListener('click', async ()=>{
  $btnMore.disabled = true; $btnMore.textContent = '불러오는 중…';
  try { await loadPage(); } finally { $btnMore.disabled=false; $btnMore.textContent='더 보기'; }
});

/* ---------- 시작 ---------- */
(async function init(){
  try{
    if (isPersonalOnlySelection()){
      renderPersonalList();     // ✅ 개인자료 전용 목록
    } else {
      await loadPage();         // ✅ 일반(Cloud) 목록
    }
  }catch(e){
    console.error(e);
    setStatus('목록을 불러오지 못했습니다.');
  }
})();

/* ===================== */
/* Slide-out CSS (단순형/백업용) */
/* ===================== */
(function injectSlideCSS(){
  if (document.getElementById('slide-css-152')) return;
  const style = document.createElement('style');
  style.id = 'slide-css-152';
  style.textContent = `
@keyframes pageSlideLeft { from { transform: translateX(0); opacity:1; } to { transform: translateX(-22%); opacity:.92; } }
@keyframes pageSlideRight{ from { transform: translateX(0); opacity:1; } to { transform: translateX(22%);  opacity:.92; } }
:root.slide-out-left  body { animation: pageSlideLeft 0.26s ease forwards; }
:root.slide-out-right body { animation: pageSlideRight 0.26s ease forwards; }
@media (prefers-reduced-motion: reduce){
  :root.slide-out-left  body,
  :root.slide-out-right body { animation:none; }
}`;
  document.head.appendChild(style);
})();

/* ===================== */
/* 단순형 스와이프 (기존 유지) */
/* ===================== */
function initSwipeNav({ goLeftHref=null, goRightHref=null, animateMs=260 } = {}){
  let sx=0, sy=0, t0=0, tracking=false;
  const THRESH_X = 70;
  const MAX_OFF_Y = 80;
  const MAX_TIME  = 600;

  const getPoint = (e) => e.touches?.[0] || e.changedTouches?.[0] || e;

  function onStart(e){
    const p = getPoint(e); sx = p.clientX; sy = p.clientY; t0 = Date.now(); tracking = true;
  }
  function onEnd(e){
    if(!tracking) return; tracking = false;

    // 고급형이 이미 처리 중이면 종료
    if (window.__swipeNavigating) return;

    const p = getPoint(e);
    const dx = p.clientX - sx;
    const dy = p.clientY - sy;
    const dt = Date.now() - t0;
    if (Math.abs(dy) > MAX_OFF_Y || dt > MAX_TIME) return;

    if (dx <= -THRESH_X && goLeftHref){
      window.__swipeNavigating = true;
      document.documentElement.classList.add('slide-out-left');
      setTimeout(()=> location.href = goLeftHref, animateMs);
    } else if (dx >= THRESH_X && goRightHref){
      window.__swipeNavigating = true;
      document.documentElement.classList.add('slide-out-right');
      setTimeout(()=> location.href = goRightHref, animateMs);
    }
  }
  document.addEventListener('touchstart', onStart, { passive:true });
  document.addEventListener('touchend',   onEnd,   { passive:true });
  document.addEventListener('pointerdown',onStart, { passive:true });
  document.addEventListener('pointerup',  onEnd,   { passive:true });
}

// ✅ list: 우→좌 = index 로 돌아가기 (단순형 유지)
initSwipeNav({ goLeftHref: 'index.html', goRightHref: null });

/* ===================== */
/* 고급형 스와이프 — 끌리는 모션 (upload와 동일 감) */
/* ===================== */
(function(){
  function initDragSwipe({ goLeftHref=null, goRightHref=null, threshold=60, slop=45, timeMax=700, feel=1.0 }={}){
    const page = document.querySelector('main') || document.body;
    if(!page) return;

    // 드래그 성능 향상 힌트
    if(!page.style.willChange || !page.style.willChange.includes('transform')){
      page.style.willChange = (page.style.willChange ? page.style.willChange + ', transform' : 'transform');
    }

    let x0=0, y0=0, t0=0, active=false, canceled=false;
    const isInteractive = (el)=> !!(el && (el.closest('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')));

    function reset(anim=true){
      if(anim) page.style.transition = 'transform 180ms ease';
      requestAnimationFrame(()=>{ page.style.transform = 'translateX(0px)'; });
      setTimeout(()=>{ if(anim) page.style.transition = ''; }, 200);
    }

    function start(e){
      // 이미 다른 네비가 진행 중이면 무시
      if (window.__swipeNavigating) return;

      const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      if(isInteractive(e.target)) return; // 폼 요소 위에서는 시작하지 않음
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
      active = true; canceled = false;
      page.style.transition = 'none';
    }

    function move(e){
      if(!active) return;
      const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if(Math.abs(dy) > slop){
        canceled = true; active = false;
        reset(true);
        return;
      }
      // 손가락에 따라 화면을 좌/우로 끌기
      e.preventDefault(); // 수평 제스처 시 스크롤 방지
      page.style.transform = 'translateX(' + (dx * feel) + 'px)';
    }

    function end(e){
      if(!active) return; active = false;
      const t = (e.changedTouches && e.changedTouches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      const dt = Date.now() - t0;

      if(canceled || Math.abs(dy) > slop || dt > timeMax){
        reset(true);
        return;
      }

      if(dx >= threshold && goRightHref){
        // 오른쪽 스와이프
        window.__swipeNavigating = true;
        page.style.transition = 'transform 160ms ease';
        page.style.transform  = 'translateX(100vw)';
        setTimeout(()=>{ location.href = goRightHref; }, 150);
      } else if(dx <= -threshold && goLeftHref){
        // 왼쪽 스와이프 → index
        window.__swipeNavigating = true;
        page.style.transition = 'transform 160ms ease';
        page.style.transform  = 'translateX(-100vw)';
        setTimeout(()=>{ location.href = goLeftHref; }, 150);
      } else {
        reset(true);
      }
    }

    // 터치 & 포인터: end/up은 capture:true로 등록해 단순형보다 먼저 실행
    document.addEventListener('touchstart',  start, { passive:true });
    document.addEventListener('touchmove',   move,  { passive:false });
    document.addEventListener('touchend',    end,   { passive:true, capture:true });

    document.addEventListener('pointerdown', start, { passive:true });
    document.addEventListener('pointermove', move,  { passive:false });
    document.addEventListener('pointerup',   end,   { passive:true, capture:true });
  }

  // list: 우→좌 = index 로 돌아가기 (끌리는 모션)
  initDragSwipe({ goLeftHref: 'index.html', goRightHref: null, threshold:60, slop:45, timeMax:700, feel:1.0 });
})();

// End of js/list.js (v1.7.0)
