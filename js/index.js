// js/index.js — CopyTube v1.8.0 패치 (양쪽 엣지 스와이프 + listFilter 전달 + 기존 기능 유지)
// 스펙: ES modules, Firestore v12.1.0
import { CATEGORY_GROUPS } from './categories.js';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';

/* =========================
   상수/도움함수
========================= */
const GROUP_ORDER_KEY = 'groupOrderV1';
const isPersonalVal = (v)=> v==='personal1' || v==='personal2';
const EXCLUDED_GROUPS_FOR_ALL = new Set(['personal','series']); // 전체선택 제외 그룹

function applyGroupOrder(groups){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(GROUP_ORDER_KEY) || 'null'); }catch{}
  const order = Array.isArray(saved) && saved.length ? saved : groups.map(g=>g.key);
  const idx = new Map(order.map((k,i)=>[k,i]));
  return groups.slice().sort((a,b)=>(idx.get(a.key)??999) - (idx.get(b.key)??999));
}
function getPersonalLabels(){
  try { return JSON.parse(localStorage.getItem('personalLabels') || '{}'); }
  catch { return {}; }
}

/* =========================
   상단바 / 드롭다운
========================= */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnAbout     = document.getElementById("btnAbout");
const btnOrder     = document.getElementById("btnOrder");
const brandHome    = document.getElementById("brandHome");

let isMenuOpen=false;
function openDropdown(){
  isMenuOpen=true;
  dropdown?.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown?.classList.add("show"));
}
function closeDropdown(){
  isMenuOpen=false;
  dropdown?.classList.remove("show");
  setTimeout(()=> dropdown?.classList.add("hidden"),180);
}

onAuthStateChanged(auth,(user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user?.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click",(e)=> e.stopPropagation());

btnMyUploads ?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ navigateUpload(); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnOrder     ?.addEventListener("click", ()=>{ location.href = "category-order.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{
  if(!auth.currentUser){ location.href='signin.html'; return; }
  await fbSignOut(auth); closeDropdown();
});
brandHome    ?.addEventListener("click",(e)=>{ e.preventDefault(); window.scrollTo({top:0,behavior:"smooth"}); });

/* =========================
   카테고리 UI
========================= */
const catsBox      = document.getElementById("cats");           // 그룹들 컨테이너
const btnWatch     = document.getElementById("btnWatch");       // 시청 버튼
const cbAutoNext   = document.getElementById("cbAutoNext");     // 연속재생 체크
const cbToggleAll  = document.getElementById("cbToggleAll");    // 전체선택 체크
const btnOpenOrder = document.getElementById("btnOpenOrder");   // 순서 설정 이동
const qbox         = document.getElementById("q");              // (선택) 검색 인풋

function renderGroups(){
  if (!catsBox) return;
  const groups = applyGroupOrder(CATEGORY_GROUPS);
  const personalLabels = getPersonalLabels();

  const html = groups.map(g=>{
    const isPersonalGroup = g.key==='personal';
    const kids = g.children.map(c=>{
      const labelText = isPersonalGroup && personalLabels[c.value]
        ? personalLabels[c.value]
        : c.label;
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}</label>`;
    }).join('');

    const legendHTML = isPersonalGroup
      ? `<legend><span style="font-weight:800;">${g.label}</span> <span class="muted">(로컬저장소)</span></legend>`
      : `<legend>
           <label class="group-toggle">
             <input type="checkbox" class="group-check" data-group="${g.key}" />
             <span>${g.label}</span>
           </label>
         </legend>`;

    const noteHTML = isPersonalGroup
      ? `<div class="muted" style="margin:6px 4px 2px;">개인자료는 <b>단독 재생</b> 중심입니다.</div>`
      : '';

    return `
      <fieldset class="group" data-key="${g.key}">
        ${legendHTML}
        <div class="child-grid">${kids}</div>
        ${noteHTML}
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;
  bindGroupInteractions();
}
renderGroups();

/* parent/child sync */
function setParentStateByChildren(groupEl){
  const parent = groupEl.querySelector('.group-check');
  if (!parent) return; // personal에는 parent 없음
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  const total = children.length;
  const checked = children.filter(c => c.checked).length;
  if (checked===0){ parent.checked=false; parent.indeterminate=false; }
  else if (checked===total){ parent.checked=true; parent.indeterminate=false; }
  else { parent.checked=false; parent.indeterminate=true; }
}
function setChildrenByParent(groupEl,on){
  groupEl.querySelectorAll('input.cat').forEach(c=> c.checked = !!on);
}
function refreshAllParentStates(){
  catsBox?.querySelectorAll('.group').forEach(setParentStateByChildren);
}
function computeAllSelected(){
  // personal/series 제외
  const list = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]):not([data-key="series"]) input.cat'));
  return list.length>0 && list.every(c=> c.checked);
}
let allSelected=false;

function bindGroupInteractions(){
  // parent toggles (not for personal)
  catsBox.querySelectorAll('.group-check').forEach(parent=>{
    const groupKey = parent.getAttribute('data-group');
    if (groupKey === 'personal') return;
    parent.addEventListener('change', ()=>{
      const groupEl = parent.closest('.group');
      setChildrenByParent(groupEl, parent.checked);
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;

      // 일반 선택 시 personal 해제
      catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
    });
  });

  // child toggles
  catsBox.querySelectorAll('input.cat').forEach(child=>{
    child.addEventListener('change', ()=>{
      const v = child.value;
      const isPersonal = isPersonalVal(v);

      if (isPersonal && child.checked){
        // personal 단독 모드: 같은 그룹 나머지 및 일반 모두 해제
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat').forEach(c=>{ if(c!==child) c.checked=false; });
        catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat:checked').forEach(c=> c.checked=false);
      }
      if (!isPersonal && child.checked){
        // 일반 선택 시 personal 해제
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
      }

      const groupEl = child.closest('.group');
      setParentStateByChildren(groupEl);
      refreshAllParentStates();

      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
    });
  });
}

/* 전체선택/저장 복원 */
function selectAll(on){
  // 일반 카테고리 전체 on/off (personal/series 제외)
  catsBox
    .querySelectorAll('.group:not([data-key="personal"]):not([data-key="series"]) input.cat')
    .forEach(b => { b.checked = !!on; });

  // 전체선택 시 personal/series는 항상 해제
  catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked, .group[data-key="series"] input.cat:checked')
    .forEach(c => { c.checked = false; });

  refreshAllParentStates();
  allSelected = !!on;
  if (cbToggleAll) cbToggleAll.checked = allSelected;
}
function applySavedSelection(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('selectedCats')||'null'); }catch{}
  if (!saved || saved==="ALL"){ selectAll(true); }
  else{
    selectAll(false);
    const set = new Set(saved);
    catsBox.querySelectorAll('.cat').forEach(ch=>{ if (set.has(ch.value)) ch.checked=true; });
    // guard: personal 단독 유지
    const personals = Array.from(catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked'));
    const normals   = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat:checked'));
    if (personals.length >= 1 && normals.length >= 1){
      personals.forEach(c=> c.checked=false);
    }else if (personals.length >= 2){
      personals.slice(1).forEach(c=> c.checked=false);
    }
    refreshAllParentStates();
  }
  const auto = localStorage.getItem('autonext')==='on';
  if (cbAutoNext) cbAutoNext.checked = auto;
}
applySavedSelection();

cbToggleAll?.addEventListener('change', ()=> selectAll(!!cbToggleAll.checked));

/* =========================
   시청 이동
========================= */
btnWatch?.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const personals = selected.filter(isPersonalVal);
  const normals   = selected.filter(v=> !isPersonalVal(v));

  // personal-only
  if (personals.length === 1 && normals.length === 0){
    localStorage.setItem('selectedCats', JSON.stringify(personals));
    localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
    location.href = `watch.html?cats=${encodeURIComponent(personals[0])}`;
    return;
  }

  // normal only
  const isAll = computeAllSelected(); // personal/series 제외 기준
  const valueToSave = (normals.length===0 || isAll) ? "ALL" : normals;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
  location.href = 'watch.html';
});

/* 순서 설정 이동 */
btnOpenOrder?.addEventListener('click', ()=> location.href='category-order.html');

/* 다른 탭 변경 반영 */
window.addEventListener('storage', (e)=>{
  if (e.key === 'personalLabels' || e.key === 'groupOrderV1') {
    renderGroups();
    applySavedSelection();
  }
});

/* =========================
   listFilter 전달 + 네비 함수
========================= */
function buildListFilter(){
  // list.html에서 사용할 필터: 선택 카테고리(공개만), 검색어, 정렬
  const allCats = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const publicCats = allCats.filter(v=> !isPersonalVal(v));
  const isAll = computeAllSelected();
  const categories = (publicCats.length===0 || isAll) ? [] : publicCats.slice(0);
  const q = qbox ? String(qbox.value||'') : '';
  return { categories, q, sort:'createdAtDesc' };
}
function navigateList(){
  try{ sessionStorage.setItem('listFilter', JSON.stringify(buildListFilter())); }catch{}
  try{ history.pushState({ from:'index' }, '', 'list.html'); }catch{}
  document.documentElement.classList.add('slide-out-right');
  setTimeout(()=> location.href='list.html', 260);
}
function navigateUpload(){
  try{ history.pushState({ from:'index' }, '', 'upload.html'); }catch{}
  document.documentElement.classList.add('slide-out-left');
  setTimeout(()=> location.href='upload.html', 260);
}

/* =========================
   엣지 스와이프 제스처
   - 좌 24px / 우 24px 엣지에서 시작
   - |dx| >= 60 && |dy| < 30
   - 수직 스크롤 충돌 방지: 큰 dy 무시
========================= */
(function initEdgeSwipe(){
  let sx=0, sy=0, t0=0, tracking=false, edge=null;
  const EDGE=24, THRESH_X=60, MAX_OFF_Y=30, MAX_TIME=700;

  const getP = (e)=> e.touches?.[0] || e.changedTouches?.[0] || e;

  function onStart(e){
    const p=getP(e);
    sx=p.clientX; sy=p.clientY; t0=Date.now(); tracking=false; edge=null;

    if (sx <= EDGE){ edge='left'; tracking=true; }
    else if (window.innerWidth - sx <= EDGE){ edge='right'; tracking=true; }
  }
  function onEnd(e){
    if(!tracking) return; tracking=false;
    const p=getP(e);
    const dx = p.clientX - sx;
    const dy = p.clientY - sy;
    const dt = Date.now() - t0;
    if (Math.abs(dy) >= MAX_OFF_Y || Math.abs(dx) < THRESH_X || dt > MAX_TIME) return;

    // 왼→오른쪽: list.html
    if (edge==='left' && dx >= THRESH_X){ navigateList(); return; }
    // 오른→왼쪽: upload.html
    if (edge==='right' && dx <= -THRESH_X){ navigateUpload(); return; }
  }

  // move 핸들러 없이 end에서만 판단 → 스크롤 충돌 최소화
  document.addEventListener('touchstart', onStart, { passive:true });
  document.addEventListener('touchend',   onEnd,   { passive:true });
  document.addEventListener('pointerdown',onStart, { passive:true });
  document.addEventListener('pointerup',  onEnd,   { passive:true });
})();

/* =========================
   초기 진입
========================= */
(function init(){
  // (필요 시) 기타 초기화가 있다면 여기에…
})();
