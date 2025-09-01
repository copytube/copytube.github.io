// js/upload.js (v1.8.2 — 최종 완성본)
// - 카테고리 섹션 사라짐 이슈 해결: DOM 지연/모듈 로딩 순서/데이터 없음까지 방어
// - Firestore rules 100% 호환: videos.create 필수 필드(uid/title/url/category/createdAt)
// - 멀티 태깅은 cats(보조)로 저장, 대표 카테고리는 category(단일)
// - 개인자료는 로컬 저장(혼합 금지)
// - 상단 드롭다운/스와이프/그룹순서/개인라벨 유지

import { auth, db } from './firebase-init.js?v=1.5.1';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=1.5.1';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js?v=1.5.1';

/* ---------------- 전역/유틸 ---------------- */
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

function safeText(s){ return String(s ?? ''); }

function setMsg(t){
  const top = $('#msgTop'), body = $('#msg');
  if (top)  top.textContent  = safeText(t);
  if (body) body.textContent = safeText(t);
}

function looksLikeHttpUrl(u){ return /^https?:\/\//i.test(u||''); }
function extractYouTubeId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/i);
  return m ? m[1] : '';
}

async function fetchTitleById(id){
  if(!id) return '';
  try{
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(`https://www.youtube.com/watch?v=${id}`));
    if(!res.ok) throw 0;
    const data = await res.json();
    return String(data?.title || '').slice(0,200);
  }catch{ return ''; }
}

/* ---------------- 상단바/드롭다운 ---------------- */
const signupLink   = $('#signupLink');
const signinLink   = $('#signinLink');
const welcome      = $('#welcome');
const menuBtn      = $('#menuBtn');
const dropdown     = $('#dropdownMenu');
const btnSignOut   = $('#btnSignOut');
const btnGoUpload  = $('#btnGoUpload');
const btnMyUploads = $('#btnMyUploads');
const btnAbout     = $('#btnAbout');
const btnList      = $('#btnList');

function openDropdown(){ dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'), 160); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `Hi! ${user.displayName || '회원'}님` : '';
  closeDropdown();
});
menuBtn   ?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
dropdown  ?.addEventListener('click', (e)=> e.stopPropagation());
document.addEventListener('pointerdown', (e)=>{ if (!dropdown || dropdown.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });

btnGoUpload ?.addEventListener('click', ()=>{ location.href='upload.html';           closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href='manage-uploads.html';   closeDropdown(); });
btnAbout    ?.addEventListener('click', ()=>{ location.href='about.html';            closeDropdown(); });
btnList     ?.addEventListener('click', ()=>{ location.href='list.html';             closeDropdown(); });
btnSignOut  ?.addEventListener('click', async ()=>{ await fbSignOut(auth);           closeDropdown(); });

/* ---------------- 그룹/개인 라벨 ---------------- */
const GROUP_ORDER_KEY     = 'groupOrderV1';
const PERSONAL_LABELS_KEY = 'personalLabels';
const isPersonal = (v)=> v==='personal1' || v==='personal2';

function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem(PERSONAL_LABELS_KEY) || '{}'); }catch{ return {}; }
}
function setPersonalLabel(key,label){
  const map = getPersonalLabels();
  map[key] = String(label||'').slice(0,12).replace(/[<>"]/g,'').trim();
  localStorage.setItem(PERSONAL_LABELS_KEY, JSON.stringify(map));
}
function applyGroupOrder(groups){
  let saved=null; try{ saved=JSON.parse(localStorage.getItem(GROUP_ORDER_KEY)||'null'); }catch{}
  const order = Array.isArray(saved) ? saved : [];
  if(!order.length) return groups.slice();
  const dict = new Map(groups.map(g=>[g.key,g]));
  const sorted = order.map(k=> dict.get(k)).filter(Boolean);
  groups.forEach(g=>{ if(!order.includes(g.key)) sorted.push(g); });
  return sorted;
}

/* ---------------- 카테고리 렌더(강화) ---------------- */
const catsBox = $('#cats');

function ensureCatsContainer(){
  if (!catsBox) {
    console.error('[upload] #cats 컨테이너를 찾을 수 없습니다. upload.html 내부 id 확인 필요');
    setMsg('카테고리 컨테이너(#cats)를 찾을 수 없습니다. HTML을 확인해 주세요.');
    return false;
  }
  return true;
}

function renderCatsOnce(){
  // CATEGORY_GROUPS 로딩 방어
  let groups = [];
  try{
    if (!Array.isArray(CATEGORY_GROUPS) || CATEGORY_GROUPS.length === 0) {
      console.warn('[upload] CATEGORY_GROUPS 비어 있음');
      catsBox.innerHTML = `<div class="muted" style="padding:8px;">카테고리 정보를 불러오지 못했습니다. js/categories.js를 확인해 주세요.</div>`;
      return;
    }
    groups = CATEGORY_GROUPS;
  }catch(e){
    console.error('[upload] categories.js import 실패:', e);
    catsBox.innerHTML = `<div class="muted" style="padding:8px;">카테고리를 불러오는 중 오류가 발생했습니다.</div>`;
    return;
  }

  // 그룹 순서 적용
  const ordered = applyGroupOrder(groups);
  const personalLabels = getPersonalLabels();

  const html = ordered.map(g=>{
    const kids = g.children.map(c=>{
      const text = (g.key==='personal' && personalLabels[c.value]) ? personalLabels[c.value] : c.label;
      const renameBtn = (g.key==='personal') ? ` <button class="rename-btn" data-key="${c.value}" type="button">이름변경</button>` : '';
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${text}${renameBtn}</label>`;
    }).join('');
    const legend = (g.key==='personal') ? `${g.label} <span class="subnote">(로컬 저장)</span>` : g.label;
    const note   = (g.key==='personal') ? `<div class="muted" style="margin:6px 4px 2px;">개인자료는 <b>단독</b>으로만 등록/재생됩니다.</div>` : '';
    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
        ${note}
      </fieldset>`;
  }).join('');

  catsBox.innerHTML = html;

  // 이벤트 바인딩
  catsBox.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.getAttribute('data-key');
      const cur = getPersonalLabels()[key] || (key==='personal1'?'자료1':'자료2');
      const name = prompt('개인자료 이름(최대 12자):', cur);
      if(!name) return;
      setPersonalLabel(key, name);
      renderCatsSafe(); // 새 라벨 반영
    });
  });

  catsBox.querySelectorAll('input.cat').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const v = chk.value;
      if (isPersonal(v) && chk.checked) {
        catsBox.querySelectorAll('input.cat').forEach(x=>{ if(x!==chk) x.checked=false; });
        setMsg('개인자료는 다른 카테고리와 함께 선택할 수 없습니다.');
        return;
      }
      if (!isPersonal(v) && chk.checked) {
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(x=> x.checked=false);
        const normals = $$('.cat:checked').map(x=>x.value).filter(x=>!isPersonal(x));
        if (normals.length > 3) { chk.checked = false; setMsg('카테고리는 최대 3개까지 선택 가능합니다.'); return; }
      }
      setMsg('');
    });
  });

  console.debug('[upload] 카테고리 렌더 완료:', ordered.map(g=>g.key));
}

// 지연/중복 방지: 로딩 순서가 늦어도 2회까지 재시도
let __catsRendered = false;
function renderCatsSafe(){
  if (!ensureCatsContainer()) return;
  try{
    renderCatsOnce();
    __catsRendered = true;
  }catch(e){
    console.error('[upload] renderCats 실패, 300ms 후 재시도:', e);
    setTimeout(()=>{ try{ renderCatsOnce(); __catsRendered = true; }catch(e2){ console.error('[upload] 재시도 실패:', e2); } }, 300);
  }
}

// DOMContentLoaded 보장 + 혹시 모듈이 먼저 실행되면 즉시 시도
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderCatsSafe, { once:true });
} else {
  renderCatsSafe();
}

/* ---------------- URL/입력 ---------------- */
const urlsBox = $('#urls');
function parseUrls(){
  const raw = urlsBox ? urlsBox.value : '';
  return raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}

/* ---------------- 붙여넣기 버튼 ---------------- */
$('#btnPaste')?.addEventListener('click', async ()=>{
  try{
    const txt = await navigator.clipboard.readText();
    if(!txt){ setMsg('클립보드가 비어 있습니다.'); return; }
    if (!urlsBox) { setMsg('URL 입력창을 찾을 수 없습니다.'); return; }
    urlsBox.value = (urlsBox.value.trim()? (urlsBox.value.replace(/\s*$/,'')+'\n') : '') + txt.trim();
    setMsg('붙여넣기 완료.');
  }catch{
    setMsg('클립보드 접근이 차단되었습니다. 브라우저 설정에서 허용해 주세요.');
  }
});

/* ---------------- 업로드 ---------------- */
function getOrderValue(){ return (document.querySelector('input[name="order"]:checked')?.value || 'bottom'); }

async function submitAll(){
  setMsg('검사 중...');
  const user = auth.currentUser;
  if(!user){ setMsg('로그인 후 이용하세요.'); return; }

  const lines = parseUrls();
  if(!lines.length){ setMsg('URL을 한 줄에 하나씩 입력해 주세요.'); return; }

  const selected = $$('.cat:checked').map(c=>c.value);
  if(!selected.length){ setMsg('카테고리를 최소 1개 선택해 주세요.'); return; }

  const personals = selected.filter(isPersonal);
  const normals   = selected.filter(v=> !isPersonal(v));

  // 개인자료 단독 → 로컬 저장
  if (personals.length === 1 && normals.length === 0) {
    const slot = personals[0]; // 'personal1' | 'personal2'
    const key  = `copytube_${slot}`;
    let arr=[]; try{ arr=JSON.parse(localStorage.getItem(key)||'[]'); }catch{ arr=[]; }

    let added=0;
    for (const url of lines) {
      if(!extractYouTubeId(url)) continue;
      arr.push({ url, savedAt: Date.now() });
      added++;
    }
    localStorage.setItem(key, JSON.stringify(arr));
    if (urlsBox) urlsBox.value = '';
    $$('.cat:checked').forEach(c=> c.checked=false);
    setMsg(`로컬 저장 완료: ${added}건 (${slot==='personal1'?'개인자료1':'개인자료2'})`);
    return;
  }

  // 혼합 금지
  if (personals.length >= 1 && normals.length >= 1) {
    setMsg('개인자료는 다른 카테고리와 함께 선택할 수 없습니다.');
    return;
  }

  // 일반 카테고리 → Firestore
  if (normals.length === 0) { setMsg('카테고리를 최소 1개 선택해 주세요.'); return; }
  if (normals.length > 3)   { setMsg('카테고리는 최대 3개까지 선택 가능합니다.'); return; }

  const order = getOrderValue();
  const list  = (order==='bottom') ? lines.slice().reverse() : lines.slice();

  setMsg(`등록 중... (0/${list.length})`);
  let ok=0, fail=0;

  for(let i=0;i<list.length;i++){
    const url = list[i];
    if(!looksLikeHttpUrl(url)){ fail++; setMsg(`등록 중... (${ok+fail}/${list.length})`); continue; }

    const vid = extractYouTubeId(url);
    let title = '';
    try{ title = await fetchTitleById(vid); }catch{}
    if(!title){
      if (vid) title = `YouTube: ${vid}`;
      else {
        try{ title = new URL(url).hostname; }catch{ title = '영상'; }
      }
    }

    // 대표 카테고리(필수): 첫 번째 일반 카테고리
    const primary = String(normals[0] || 'uncategorized');

    try{
      await addDoc(collection(db,'videos'), {
        uid: user.uid,                 // 필수
        title: String(title || '영상'),// 필수
        url,                           // 필수 (http/https)
        category: primary,             // 필수 (단일)
        cats: normals,                 // 보조(멀티 태깅 유지: 관리자 도구 호환)
        createdAt: serverTimestamp(),  // 필수
      });
      ok++;
    }catch(e){
      console.error('[upload] addDoc 실패:', e);
      fail++;
    }
    setMsg(`등록 중... (${ok+fail}/${list.length})`);
  }

  setMsg(`완료: 성공 ${ok}건, 실패 ${fail}건`);
  if (ok) {
    if (urlsBox) urlsBox.value='';
    $$('.cat:checked').forEach(c=> c.checked=false);
  }
}

/* 버튼 바인딩 */
$('#btnSubmitTop')   ?.addEventListener('click', submitAll);
$('#btnSubmitBottom')?.addEventListener('click', submitAll);

/* ---------------- 스와이프(옵션) ---------------- */
(function injectSlideCSS(){
  if (document.getElementById('slide-css-152')) return;
  const style = document.createElement('style');
  style.id = 'slide-css-152';
  style.textContent = `
@keyframes pageSlideRight{ from { transform: translateX(0); opacity:1; } to { transform: translateX(22%);  opacity:.92; } }
:root.slide-out-right body { animation: pageSlideRight 0.24s ease forwards; }
@media (prefers-reduced-motion: reduce){ :root.slide-out-right body { animation:none; } }
`;
  document.head.appendChild(style);
})();

(function(){
  let x0=0, y0=0, t0=0, active=false, canceled=false;
  const threshold=60, slop=45, timeMax=700, feel=1.0, deadZoneCenterRatio=0.15;

  const page = $('main') || document.body;
  if (!page) return;

  if(!page.style.willChange || !page.style.willChange.includes('transform')){
    page.style.willChange = (page.style.willChange ? page.style.willChange + ', transform' : 'transform');
  }

  function reset(anim=true){
    if(anim) page.style.transition = 'transform 160ms ease';
    requestAnimationFrame(()=>{ page.style.transform = 'translateX(0px)'; });
    setTimeout(()=>{ if(anim) page.style.transition = ''; }, 200);
  }

  function start(e){
    const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
    if(!t) return;

    // 폼/버튼 등 인터랙티브 제외
    if (e.target.closest('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')) return;

    // 중앙 데드존
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const L  = vw * (0.5 - deadZoneCenterRatio/2);
    const R  = vw * (0.5 + deadZoneCenterRatio/2);
    if (t.clientX >= L && t.clientX <= R) return;

    x0=t.clientX; y0=t.clientY; t0=Date.now(); active=true; canceled=false;
    page.style.transition = 'none';
  }
  function move(e){
    if(!active) return;
    const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
    if(!t) return;
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dy) > slop) { canceled=true; active=false; reset(true); return; }
    const dxAdj = Math.max(0, dx); // 왼쪽 이동 차단
    if (dxAdj === 0){ page.style.transform='translateX(0px)'; return; }
    e.preventDefault();
    page.style.transform = 'translateX(' + (dxAdj*feel) + 'px)';
  }
  function end(e){
    if(!active) return; active=false;
    const t = (e.changedTouches && e.changedTouches[0]) || (e.pointerType ? e : null);
    if(!t) return;
    const dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0;
    if (canceled || Math.abs(dy) > slop || dt > timeMax) { reset(true); return; }
    if (dx >= threshold) {
      page.style.transition = 'transform 140ms ease';
      page.style.transform  = 'translateX(100vw)';
      setTimeout(()=>{ location.href='index.html'; }, 130);
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
})();
