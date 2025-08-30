// js/list.js — 공개 목록(로그인 불필요), 카테고리 & 검색 필터, watch 연동(큐 전달)
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, orderBy, limit, startAfter, where
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js';

/* ---------- 상단바(원본 유지) ---------- */
const signupLink = document.getElementById('signupLink');
const signinLink = document.getElementById('signinLink');
const welcome    = document.getElementById('welcome');
const menuBtn    = document.getElementById('menuBtn');
const dropdown   = document.getElementById('dropdownMenu');
const btnSignOut = document.getElementById('btnSignOut');
const btnGoUpload= document.getElementById('btnGoUpload');
const btnAbout   = document.getElementById('btnAbout');

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown?.classList.remove("hidden"); requestAnimationFrame(()=> dropdown?.classList.add("show")); }
function closeDropdown(){ isMenuOpen=false; dropdown?.classList.remove("show"); setTimeout(()=> dropdown?.classList.add("hidden"),180); }
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden")?openDropdown():closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());
btnAbout?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnGoUpload?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ try{ await fbSignOut(auth); }catch{} closeDropdown(); });

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user?.displayName||'회원'}님` : '');
});

/* ---------- DOM ---------- */
const cards   = document.getElementById('cards');
const msg     = document.getElementById('msg');
const qbox    = document.getElementById('q');
const btnSearch = document.getElementById('btnSearch');
const btnClear  = document.getElementById('btnClear');
const moreBox = document.getElementById('more');
const btnMore = document.getElementById('btnMore');

/* ---------- 상태 ---------- */
const PAGE_SIZE = 40;
let lastDoc = null;
let hasMore = true;
let isLoading = false;

// 캐시(전체), 현재 필터 결과
let cache = [];

/* ---------- 카테고리 라벨 맵 ---------- */
const valueToLabel = (()=> {
  const m = new Map();
  try{ CATEGORY_GROUPS.forEach(g => g.children.forEach(c => m.set(c.value, c.label))); }catch(_){}
  return m;
})();

/* ---------- 유틸 ---------- */
const $esc = s => String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
function extractId(url){ const m=String(url||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&\/]+)/); return m?m[1]:''; }
function thumbFrom(url, fallback=''){ const id = extractId(url); return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : fallback; }
function selectedCats(){
  try{ const raw = localStorage.getItem('selectedCats'); const a = JSON.parse(raw||'[]'); return Array.isArray(a)?a:[]; }catch(_){ return []; }
}

/* ---------- Firestore 로드 ---------- */
async function loadPage(){
  if(isLoading || !hasMore) return;
  isLoading = true;
  setStatus(cache.length ? `총 ${cache.length}개 불러옴 · 더 불러오는 중…` : '불러오는 중…');

  try{
    // 선호 경로: createdAt desc 페이지네이션 (공개 읽기 전제)
    const base = collection(db,'videos');
    const parts = lastDoc
      ? [ orderBy('createdAt','desc'), startAfter(lastDoc), limit(PAGE_SIZE) ]
      : [ orderBy('createdAt','desc'), limit(PAGE_SIZE) ];

    const snap = await getDocs(query(base, ...parts));
    if(snap.empty){ hasMore=false; setStatus(cache.length ? `총 ${cache.length}개` : '등록된 영상이 없습니다.'); toggleMore(false); return; }
    snap.docs.forEach(d => cache.push({ id:d.id, data:d.data() }));
    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if(snap.size < PAGE_SIZE) hasMore=false;
  }catch(e){
    console.warn('[list] index fallback:', e?.message||e);
    // 폴백: 인덱스 미구성/권한 문제 → 제한된 수만 가져와 클라이언트 정렬
    try{
      const snap = await getDocs(query(collection(db,'videos'), limit(PAGE_SIZE*3)));
      const arr = snap.docs.map(d=>({ id:d.id, data:d.data(), _created:(d.data().createdAt?.toMillis?.()||0) }));
      arr.sort((a,b)=> b._created - a._created);
      cache = cache.concat(arr);
      hasMore = false; // 한 번에 적재
    }catch(e2){
      console.error('[list] 로드 실패:', e2);
      setStatus('목록을 불러오지 못했습니다.');
      toggleMore(false);
      isLoading=false;
      return;
    }
  }

  render();
  toggleMore(hasMore);
  setStatus(`총 ${cache.length}개`);
  isLoading=false;
}

/* ---------- 렌더 & 필터 ---------- */
function render(){
  const cats = selectedCats();
  const q = (qbox?.value||'').trim().toLowerCase();

  let list = cache.slice();

  // 카테고리 필터(선택된 카테고리가 있으면 교집합)
  if(cats.length){
    list = list.filter(x => {
      const arr = Array.isArray(x.data?.categories) ? x.data.categories : [];
      return arr.some(v => cats.includes(v));
    });
  }

  // 검색어 필터
  if(q){
    list = list.filter(x => {
      const t = String(x.data?.title||'').toLowerCase();
      const u = String(x.data?.url||'').toLowerCase();
      return t.includes(q) || u.includes(q);
    });
  }

  // 카드 렌더
  cards.innerHTML = '';
  if(!list.length){
    cards.innerHTML = `<div style="padding:14px;border:1px dashed var(--border);border-radius:12px;color:#cfcfcf;">결과가 없습니다.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((x, idx)=>{
    const { id, data } = x;
    const title = data?.title || '(제목 없음)';
    const url   = data?.url || '';
    const catsV = Array.isArray(data?.categories) ? data.categories : [];
    const thumb = data?.thumbnail || thumbFrom(url);

    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `
      <div class="left">
        <div class="title" title="${$esc(title)}">${$esc(title)}</div>
        <div class="url" title="${$esc(url)}">${$esc(url)}</div>
        <div class="chips">${catsV.map(v=>`<span class="chip" title="${$esc(v)}">${$esc(valueToLabel.get(v)||v)}</span>`).join('')}</div>
      </div>
      <div class="right">
        <div class="thumb-wrap"><img class="thumb" alt="썸네일" loading="lazy" src="${$esc(thumb)}"></div>
      </div>
    `;

    // 썸네일/카드 클릭 → watch로 이동 + 큐 전달
    el.querySelector('.thumb')?.addEventListener('click', ()=> openInWatch(list, idx));
    el.querySelector('.left')?.addEventListener('click', ()=> openInWatch(list, idx));

    frag.appendChild(el);
  });
  cards.appendChild(frag);
}

/* ---------- watch 연동: 큐 전달 & 특정 영상으로 진입 ---------- */
function openInWatch(listLike, index){
  // 최소 정보 큐
  const queue = listLike.map(x => ({
    id: x.id,
    url: x.data?.url || '',
    title: x.data?.title || '',
    cats: Array.isArray(x.data?.categories) ? x.data.categories : []
  }));
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(index));

  const targetId = listLike[index]?.id;
  const q = targetId ? ('?doc=' + encodeURIComponent(targetId)) : '';
  location.href = 'watch.html' + q;
}

/* ---------- 이벤트 ---------- */
qbox?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); render(); }});
btnSearch?.addEventListener('click', ()=> render());
btnClear?.addEventListener('click', ()=> { qbox.value=''; render(); });

btnMore?.addEventListener('click', async ()=>{
  btnMore.disabled = true; btnMore.textContent = '불러오는 중…';
  try{ await loadPage(); } finally{ btnMore.disabled=false; btnMore.textContent = '더 보기'; }
});

/* ---------- 시작 ---------- */
(function init(){
  // 초기 1페이지 로드
  loadPage();
})();

/* ---------- 보조 ---------- */
function setStatus(t){ if(msg) msg.textContent = t||''; }
function toggleMore(show){ moreBox.style.display = show ? '' : 'none'; }
