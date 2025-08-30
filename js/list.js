// js/list.js — 로그인 없이 공개 목록 조회, 카테고리/검색 필터, watch로 큐/인덱스 전달
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
  // categories.js가 노출하는 후보 전역들을 방어적으로 조회
  if (window?.CATEGORIES?.labelMap?.[key]) return window.CATEGORIES.labelMap[key];
  if (window?.CATEGORY_LABELS?.[key]) return window.CATEGORY_LABELS[key];
  if (window?.COPYTUBE?.categories?.labels?.[key]) return window.COPYTUBE.categories.labels[key];
  try { if (typeof window.getLabel === 'function') return window.getLabel(key) ?? key; } catch {}
  return key;
}

function setStatus(t){ if($msg) $msg.textContent = t || ''; }
function toggleMore(show){ if($btnMore) $btnMore.style.display = show ? '' : 'none'; }

/* ---------- Firestore 로드 ---------- */
async function loadPage(){
  if(isLoading || !hasMore) return;
  isLoading = true;
  setStatus(allDocs.length ? `총 ${allDocs.length}개 불러옴 · 더 불러오는 중…` : '불러오는 중…');

  try {
    // 선호: createdAt desc 페이지네이션
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
    // 폴백: createdAt 인덱스/필드 문제 시 일부만 불러 클라이언트 정렬
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

/* ---------- 렌더 & 필터 ---------- */
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

/* ---------- watch로 이동(큐 + 인덱스 + doc 파라미터) ---------- */
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
  location.href = `watch.html?doc=${docId}&idx=${index}`;
}

/* ---------- 이벤트 ---------- */
$q?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); render(); }});
$btnSearch?.addEventListener('click', ()=> render());
$btnClear ?.addEventListener('click', ()=> { if($q){ $q.value=''; } render(); });
$btnMore  ?.addEventListener('click', async ()=>{
  $btnMore.disabled = true; $btnMore.textContent = '불러오는 중…';
  try { await loadPage(); } finally { $btnMore.disabled=false; $btnMore.textContent='더 보기'; }
});

/* ---------- 시작 ---------- */
(async function init(){
  try{
    await loadPage();
  }catch(e){
    console.error(e);
    setStatus('목록을 불러오지 못했습니다.');
  }
})();
