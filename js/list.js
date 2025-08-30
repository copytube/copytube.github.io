// js/list.js (v1.6.0) — 로그인 없이 공개 목록 조회, 카테고리/검색 필터, watch로 큐/인덱스 전달
import { db } from './firebase-init.js';
import {
  collection, getDocs, query, orderBy, limit, startAfter
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/* ---------- DOM ---------- */
const $cards     = document.getElementById('cards');
const $msg       = document.getElementById('msg') || document.getElementById('resultMsg');
const $q         = document.getElementById('q');
const $btnSearch = document.getElementById('btnSearch');
const $btnClear  = document.getElementById('btnClear');
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
  // 큐 모드로 바로: idx만으로도 watch가 재생되도록 (watch.js에 idx/doc 가드 추가 권장)
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
/* Swipe Navigation + CSS inject (index/upload와 동일 모션) */
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
    const p = getPoint(e);
    const dx = p.clientX - sx;
    const dy = p.clientY - sy;
    const dt = Date.now() - t0;
    if (Math.abs(dy) > MAX_OFF_Y || dt > MAX_TIME) return;

    if (dx <= -THRESH_X && goLeftHref){
      document.documentElement.classList.add('slide-out-left');
      setTimeout(()=> location.href = goLeftHref, animateMs);
    } else if (dx >= THRESH_X && goRightHref){
      document.documentElement.classList.add('slide-out-right');
      setTimeout(()=> location.href = goRightHref, animateMs);
    }
  }
  document.addEventListener('touchstart', onStart, { passive:true });
  document.addEventListener('touchend',   onEnd,   { passive:true });
  document.addEventListener('pointerdown',onStart, { passive:true });
  document.addEventListener('pointerup',  onEnd,   { passive:true });
}

// ✅ list: 우→좌 = index 로 돌아가기
initSwipeNav({ goLeftHref: 'index.html', goRightHref: null });

// End of js/list.js (v1.6.0)
