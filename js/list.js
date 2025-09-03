// js/list.js (v1.9.4) — 제목/oEmbed(7일 캐시) + 무한 스크롤 + 필터 선로딩 + 스와이프 + 닉네임/카테고리칩
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=1.5.1';
import {
  collection, getDocs, query, orderBy, limit, startAfter,
  doc, getDoc, where, setDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/* ---------- 전역 내비 중복 방지 플래그 ---------- */
window.__swipeNavigating = window.__swipeNavigating || false;

/* ---------- Topbar 로그인 상태 동기화 & 드롭다운 ---------- */
const signupLink = document.getElementById('signupLink');
const signinLink = document.getElementById('signinLink');
const welcome    = document.getElementById('welcome');
const menuBtn    = document.getElementById('menuBtn');
const dropdown   = document.getElementById('dropdownMenu');
const btnSignOut = document.getElementById('btnSignOut');
const btnGoUpload= document.getElementById('btnGoUpload');
const btnAbout   = document.getElementById('btnAbout');
const btnList    = document.getElementById('btnList');

let isMenuOpen = false;
function openDropdown(){ if(!dropdown) return; isMenuOpen = true; dropdown.classList.remove('hidden'); requestAnimationFrame(()=> dropdown.classList.add('show')); }
function closeDropdown(){ if(!dropdown) return; isMenuOpen = false; dropdown.classList.remove('show'); setTimeout(()=> dropdown.classList.add('hidden'), 180); }

onAuthStateChanged(auth, (user) => {
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `Welcome! ${user?.displayName || '회원'}` : '';
  closeDropdown();
});

menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if(!dropdown || dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());

btnSignOut?.addEventListener('click', async ()=>{ if (!auth.currentUser) { location.href = 'signin.html'; return; } try { await fbSignOut(auth); } catch {} closeDropdown(); });
btnGoUpload?.addEventListener('click', ()=>{ location.href = 'upload.html'; closeDropdown(); });
btnAbout   ?.addEventListener('click', ()=>{ location.href = 'about.html';  closeDropdown(); });
btnList    ?.addEventListener('click', ()=>{ location.href = 'list.html';   closeDropdown(); });

/* ---------- DOM ---------- */
const $cards     = document.getElementById('cards');
const $msg       = document.getElementById('msg') || document.getElementById('resultMsg');
const $q         = document.getElementById('q');
const $btnSearch = document.getElementById('btnSearch');
const $btnClear  = document.getElementById('btnClear'); // optional
const $btnMore   = document.getElementById('btnMore');

/* ---------- 상태 ---------- */
const PAGE_SIZE = 60;
let allDocs   = [];
let lastDoc   = null;
let hasMore   = true;
let isLoading = false;

/* ---------- 카테고리 라벨 맵(항상 사람 읽는 이름 노출) ---------- */
const LABEL_MAP = (() => {
  if (window?.CATEGORIES?.labelMap) return window.CATEGORIES.labelMap;
  if (window?.CATEGORY_LABELS)      return window.CATEGORY_LABELS;
  if (window?.COPYTUBE?.categories?.labels) return window.COPYTUBE.categories.labels;
  // CATEGORY_GROUPS 로부터 즉시 구성 (업로드 페이지와 동일 소스 사용)
  const m = {};
  try {
    if (Array.isArray(window?.CATEGORY_GROUPS)) {
      window.CATEGORY_GROUPS.forEach(g => (g.children||[]).forEach(c => { m[c.value] = c.label; }));
    }
  } catch {}
  return m;
})();
function getLabel(key){ return LABEL_MAP?.[key] || key; }

/* ---------- 유틸 ---------- */
function getSelectedCats(){
  try {
    const raw = localStorage.getItem('selectedCats');
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
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
function setStatus(t){ if($msg) $msg.textContent = t || ''; }
function toggleMore(show){ if($btnMore) $btnMore.style.display = show ? '' : 'none'; }

/* ---------- 제목 캐시(oEmbed, 7일) + 임시메모리 ---------- */
const TitleCache = {
  get(id){
    try{
      const j = localStorage.getItem('yt_title_'+id);
      if(!j) return null;
      const { t, exp } = JSON.parse(j);
      if(exp && Date.now() > exp){ localStorage.removeItem('yt_title_'+id); return null; }
      return t || null;
    }catch{ return null; }
  },
  set(id, title){
    try{
      const exp = Date.now() + 7*24*60*60*1000; // 7일
      localStorage.setItem('yt_title_'+id, JSON.stringify({ t: String(title||'').slice(0,200), exp }));
    }catch{}
  }
};
const lazyTitleMap = new Map();

async function fetchYouTubeTitleById(id){
  if(!id) return null;
  const c = TitleCache.get(id);
  if(c){ lazyTitleMap.set(id,c); return c; }

  try{
    const url = `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`;
    const res = await fetch(url, { mode:'cors' });
    if(!res.ok) throw 0;
    const data = await res.json();
    const title = data?.title ? String(data.title) : null;
    if(title){
      TitleCache.set(id, title);
      lazyTitleMap.set(id, title);
    }
    return title;
  }catch{ return null; }
}

async function hydrateTitleIfNeeded(titleEl, url, existingTitle){
  if(!titleEl) return;
  if(existingTitle && existingTitle !== '(제목 없음)') return;
  const id = extractId(url);
  if(!id) return;
  const t = await fetchYouTubeTitleById(id);
  if(t) titleEl.textContent = t;
}

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
    return Array.isArray(v) ? v[0] : null;
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
    const id    = extractId(url);
    const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

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
    hydrateTitleIfNeeded(card.querySelector('.title'), url, title);

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
    title: it.title || lazyTitleMap.get(extractId(it.url||'')) || '(제목 없음)',
    cats: [label]
  }));
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(index));
  location.href = `watch.html?idx=${index}&cats=${encodeURIComponent(slot)}`;
}

/* ---------- 필터 공통 ---------- */
function filterDocs(){
  const cats = getSelectedCats();
  const q = ($q?.value || '').trim().toLowerCase();

  let list = allDocs.slice();

  if (Array.isArray(cats) && cats.length){
    list = list.filter(x => {
      const arr = Array.isArray(x.data?.categories) ? x.data.categories : [];
      return arr.some(v => cats.includes(v));
    });
  }
  if (q){
    list = list.filter(x => {
      const id = extractId(x.data?.url || '');
      const t = String(x.data?.title || lazyTitleMap.get(id) || '').toLowerCase();
      const u = String(x.data?.url || '').toLowerCase();
      return t.includes(q) || u.includes(q);
    });
  }
  return list;
}

/* ---------- Firestore 로드 ---------- */
async function loadPage(){
  if(isLoading || !hasMore) return false;
  isLoading = true;
  setStatus(allDocs.length ? `총 ${allDocs.length}개 불러옴 · 더 불러오는 중…` : '불러오는 중…');

  try {
    const parts = [ orderBy('createdAt','desc') ];
    if (lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const snap = await getDocs(query(collection(db,'videos'), ...parts));
    if (snap.empty) { hasMore = false; toggleMore(false); setStatus(allDocs.length ? `총 ${allDocs.length}개` : '등록된 영상이 없습니다.'); isLoading=false; return false; }

    const batch = snap.docs.map(d => ({ id: d.id, data: d.data() }));
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
      return false;
    }
  }

  render();
  toggleMore(hasMore);
  setStatus(`총 ${allDocs.length}개`);
  isLoading = false;
  return true;
}

/* ---------- 필터 인지형 선로딩 ---------- */
async function ensureMinFiltered(min = PAGE_SIZE){
  if (isPersonalOnlySelection()) return;

  let filtered = filterDocs();
  let guard = 0;
  while (filtered.length < min && hasMore && guard < 5){
    const ok = await loadPage();
    if (!ok) break;
    filtered = filterDocs();
    guard++;
  }
  render();
  toggleMore(hasMore);
}

/* ---------- 닉네임 조회(캐시 + usernames 역참조 + 백필) ---------- */
const userNameCache = new Map();
const userNameInflight = new Map();

async function getUserDisplayName(uid){
  if(!uid) return null;
  if (userNameCache.has(uid)) return userNameCache.get(uid);
  if (userNameInflight.has(uid)) return userNameInflight.get(uid);

  const p = (async ()=>{
    // 1) users/{uid}.displayName
    try{
      const usnap = await getDoc(doc(db,'users', uid));
      const nm = usnap.exists() ? usnap.data()?.displayName : null;
      if(nm){ userNameCache.set(uid, nm); return nm; }
    }catch{}

    // 2) usernames 역참조 → 문서 ID가 닉네임
    try{
      const rs = await getDocs(query(collection(db,'usernames'), where('uid','==', uid), limit(1)));
      if(!rs.empty){
        const nickLower = rs.docs[0].id;
        userNameCache.set(uid, nickLower);
        // (선택) 백필
        try{ await setDoc(doc(db,'users', uid), { displayName: nickLower }, { merge:true }); }catch{}
        return nickLower;
      }
    }catch{}

    return '회원';
  })();

  userNameInflight.set(uid, p);
  try{ return await p; } finally { userNameInflight.delete(uid); }
}

/* ---------- 렌더 ---------- */
function render(){
  if (isPersonalOnlySelection()){
    renderPersonalList();
    return;
  }

  const list = filterDocs();

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
    const uid   = x.data?.uid || x.data?.ownerUid || null;

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="left">
        <!-- 1) 제목 -->
        <div class="title" title="${esc(title)}">${esc(title)}</div>

        <!-- 2) 카테고리 칩 -->
        <div class="chips">
          ${catsV.map(v=>`<span class="chip" title="${esc(v)}">${esc(getLabel(v))}</span>`).join('')}
        </div>

        <!-- 3) 등록: 닉네임 (제목보다 2px 작게) -->
        <div class="nickline">등록: 불러오는 중…</div>
      </div>
      <div class="right">
        <div class="thumb-wrap"><img class="thumb" src="${esc(thumb)}" alt="썸네일" loading="lazy"></div>
      </div>
    `;

    // 제목 보정(oEmbed)
    const titleEl = card.querySelector('.title');
    hydrateTitleIfNeeded(titleEl, url, title);

    // 닉네임 주입 + 폰트 크기 조정
    (async ()=>{
      const nickEl = card.querySelector('.nickline');
      const nick = (await getUserDisplayName(uid)) || '회원';
      nickEl.textContent = `등록: ${nick}`;
      const fs = parseFloat(getComputedStyle(titleEl).fontSize || '0');
      if (isFinite(fs) && fs > 0){
        nickEl.style.fontSize = Math.max(10, fs - 2) + 'px';
        nickEl.style.color = '#cfcfcf';
      }
    })();

    // 클릭 이동
    card.querySelector('.left') ?.addEventListener('click', ()=> openInWatch(list, idx));
    card.querySelector('.thumb')?.addEventListener('click', ()=> openInWatch(list, idx));

    frag.appendChild(card);
  });
  $cards.appendChild(frag);
}

/* ---------- watch로 이동(큐 + 인덱스 + doc + cats 파라미터) ---------- */
function openInWatch(list, index){
  const queue = list.map(x => {
    const id = extractId(x.data?.url || '');
    return {
      id: x.id,
      url: x.data?.url || '',
      title: x.data?.title || lazyTitleMap.get(id) || '',
      cats: Array.isArray(x.data?.categories) ? x.data.categories : []
    };
  });
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(index));

  const docId = encodeURIComponent(list[index].id);

  let catsParam = '';
  try{
    const raw = localStorage.getItem('selectedCats');
    const parsed = JSON.parse(raw || '[]');
    const arr = Array.isArray(parsed) ? parsed : [];
    if (arr.length) catsParam = `&cats=${encodeURIComponent(arr.join(','))}`;
  }catch{}

  location.href = `watch.html?doc=${docId}&idx=${index}${catsParam}`;
}

/* ---------- 검색 이벤트 ---------- */
$q?.addEventListener('keydown', async (e)=>{
  if(e.key==='Enter'){
    e.preventDefault();
    if(isPersonalOnlySelection()){ renderPersonalList(); return; }
    render();
    await ensureMinFiltered(PAGE_SIZE);
  }
});
$btnSearch?.addEventListener('click', async ()=>{
  if(isPersonalOnlySelection()){ renderPersonalList(); return; }
  render();
  await ensureMinFiltered(PAGE_SIZE);
});
$btnClear ?.addEventListener('click', async ()=>{
  if($q) $q.value='';
  if(isPersonalOnlySelection()){ renderPersonalList(); return; }
  render();
  await ensureMinFiltered(PAGE_SIZE);
});
$btnMore  ?.addEventListener('click', async ()=>{
  $btnMore.disabled = true; $btnMore.textContent = '불러오는 중…';
  try {
    await loadPage();
    await ensureMinFiltered(PAGE_SIZE);
  } finally {
    $btnMore.disabled=false; $btnMore.textContent='더 보기';
  }
});

/* ---------- 시작 ---------- */
(async function init(){
  try{
    if (isPersonalOnlySelection()){
      renderPersonalList();
      return;
    }
    await loadPage();
    await ensureMinFiltered(PAGE_SIZE);
  }catch(e){
    console.error(e);
    setStatus('목록을 불러오지 못했습니다.');
  }
})();

/* ---------- 무한 스크롤 ---------- */
const SCROLL_LOAD_OFFSET = 320;
window.addEventListener('scroll', async ()=>{
  if (isLoading || !hasMore) return;
  const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - SCROLL_LOAD_OFFSET);
  if (!nearBottom) return;
  if (isPersonalOnlySelection()) return;

  const before = filterDocs().length;
  const ok = await loadPage();
  if (!ok) return;

  let guard=0;
  while (filterDocs().length < PAGE_SIZE && hasMore && guard < 2){
    const ok2 = await loadPage();
    if(!ok2) break;
    guard++;
  }

  const after = filterDocs().length;
  if (after > before) render();
}, { passive:true });

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
/* 단순형 스와이프 (중앙 30% 데드존 추가) */
/* ===================== */
function initSwipeNav({ goLeftHref=null, goRightHref=null, animateMs=260, deadZoneCenterRatio=0.30 } = {}){
  let sx=0, sy=0, t0=0, tracking=false;
  const THRESH_X = 70;
  const MAX_OFF_Y = 80;
  const MAX_TIME  = 600;

  const getPoint = (e) => e.touches?.[0] || e.changedTouches?.[0] || e;

  function onStart(e){
    const p = getPoint(e);
    if(!p) return;

    // 중앙 데드존
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const dz = Math.max(0, Math.min(0.9, deadZoneCenterRatio));
    const L  = vw * (0.5 - dz/2);
    const R  = vw * (0.5 + dz/2);
    if (p.clientX >= L && p.clientX <= R) { tracking = false; return; }

    sx = p.clientX; sy = p.clientY; t0 = Date.now(); tracking = true;
  }
  function onEnd(e){
    if(!tracking) return; tracking = false;
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

// ✅ list: 우→좌 = index
initSwipeNav({ goLeftHref: 'index.html', goRightHref: null, deadZoneCenterRatio: 0.30 });

/* ===================== */
/* 고급형 스와이프 — 끌리는 모션 + 방향 잠금 + 중앙 30% 데드존 */
/* ===================== */
(function(){
  function initDragSwipe({ goLeftHref=null, goRightHref=null, threshold=60, slop=45, timeMax=700, feel=1.0, deadZoneCenterRatio=0.30 }={}){
    const page = document.querySelector('main') || document.body;
    if(!page) return;

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
      if (window.__swipeNavigating) return;
      const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      if(isInteractive(e.target)) return;

      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const dz = Math.max(0, Math.min(0.9, deadZoneCenterRatio));
      const L  = vw * (0.5 - dz/2);
      const R  = vw * (0.5 + dz/2);
      if (t.clientX >= L && t.clientX <= R) return;

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

      const allowLeft  = !!goLeftHref;
      const allowRight = !!goRightHref;

      let dxAdj = dx;
      if (dx < 0 && !allowLeft)  dxAdj = 0; // 왼쪽 금지
      if (dx > 0 && !allowRight) dxAdj = 0; // 오른쪽 금지

      if (dxAdj === 0){
        page.style.transform = 'translateX(0px)';
        return;
      }

      e.preventDefault();
      page.style.transform = 'translateX(' + (dxAdj * feel) + 'px)';
    }

    function end(e){
      if(!active) return; active = false;
      const t = (e.changedTouches && e.changedTouches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      const dt = Date.now() - t0;

      const allowLeft  = !!goLeftHref;
      const allowRight = !!goRightHref;

      if(canceled || Math.abs(dy) > slop || dt > timeMax){
        reset(true);
        return;
      }

      if(dx >= threshold && allowRight){
        window.__swipeNavigating = true;
        page.style.transition = 'transform 160ms ease';
        page.style.transform  = 'translateX(100vw)';
        setTimeout(()=>{ location.href = goRightHref; }, 150);
      } else if(dx <= -threshold && allowLeft){
        window.__swipeNavigating = true;
        page.style.transition = 'transform 160ms ease';
        page.style.transform  = 'translateX(-100vw)';
        setTimeout(()=>{ location.href = goLeftHref; }, 150);
      } else {
        reset(true);
      }
    }

    document.addEventListener('touchstart',  start, { passive:true });
    document.addEventListener('touchmove',   move,  { passive:false });
    document.addEventListener('touchend',    end,   { passive:true, capture:true });

    document.addEventListener('pointerdown', start, { passive:true });
    document.addEventListener('pointermove', move,  { passive:false });
    document.addEventListener('pointerup',   end,   { passive:true, capture:true });
  }

  // list: 우→좌 = index (오른쪽 페이지 없음 → 오른쪽 끌림 차단)
  initDragSwipe({ goLeftHref: 'index.html', goRightHref: null, threshold:60, slop:45, timeMax:700, feel:1.0, deadZoneCenterRatio: 0.15 });
})();
