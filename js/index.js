// js/index.js
import { CATEGORY_GROUPS } from './categories.js?v=20250820'; // 1.0 그대로
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';

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

const catsBox      = document.getElementById("cats");
const btnWatch     = document.getElementById("btnWatch");
const cbAutoNext   = document.getElementById("cbAutoNext");
const cbToggleAll  = document.getElementById("cbToggleAll");
const btnOrderOpen = document.getElementById("btnOrderOpen");

/* ---------- 드롭다운 ---------- */
let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }
["scroll","wheel","touchmove","keydown"].forEach(ev=>{
  window.addEventListener(ev, ()=>{ if(!dropdown.classList.contains('hidden')) closeDropdown(); }, {passive:true});
});

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());

function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ goOrSignIn("upload.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{
  if (!auth.currentUser){ location.href = 'signin.html'; return; }
  await fbSignOut(auth); closeDropdown();
});
brandHome?.addEventListener("click", (e)=>{ e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

/* ---------- 카테고리 순서 로컬저장 ---------- */
const DEFAULT_ORDER = CATEGORY_GROUPS.map(g=>g.key);

function readOrderRaw(){
  try { return JSON.parse(localStorage.getItem('categoryOrder') || 'null'); }
  catch { return null; }
}
/** 현재 카테고리 정의에 맞게 정규화(신규/삭제 반영) */
function getCategoryOrder(){
  const raw = readOrderRaw();
  const known = new Set(DEFAULT_ORDER);
  let arr = Array.isArray(raw) ? raw.filter(k=>known.has(k)) : [];

  // 누락된 키는 기본 순서대로 뒤에 붙임
  DEFAULT_ORDER.forEach(k=>{ if(!arr.includes(k)) arr.push(k); });
  return arr;
}
/** 저장 */
function saveCategoryOrder(order){
  try { localStorage.setItem('categoryOrder', JSON.stringify(order)); } catch {}
}

/* ---------- 렌더 ---------- */
function renderGroups(){
  const personalLabels = getPersonalLabels(); // 기존 개인자료 라벨만 유지
  const order = getCategoryOrder();

  // order에 맞춰 그룹 정렬
  const keyToGroup = new Map(CATEGORY_GROUPS.map(g=>[g.key, g]));
  const groups = order.map(k => keyToGroup.get(k)).filter(Boolean);

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal = (g.key==='personal');
      const defLabel   = (c.value==='personal1') ? '자료1' : (c.value==='personal2' ? '자료2' : c.label);
      const labelText  = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : defLabel;
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}</label>`;
    }).join('');

    const legendText = (g.key==='personal') ? `${g.label} <span class="subnote">(로컬저장소)</span>` : g.label;

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>
          <label class="group-toggle">
            <input type="checkbox" class="group-check" data-group="${g.key}"/>
            <span>${legendText}</span>
          </label>
        </legend>
        <div class="child-grid">${kids}</div>
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;
  bindGroupInteractions();
}
renderGroups();

/* ---------- 개인자료 라벨 ---------- */
function getPersonalLabels(){ try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }catch{ return {}; } }

/* ---------- 부모/자식 동기화 ---------- */
function setParentStateByChildren(groupEl){
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  const parent   = groupEl.querySelector('.group-check');
  if (!parent) return;
  const total = children.length;
  const checked = children.filter(c=>c.checked).length;
  if (checked===0){ parent.checked=false; parent.indeterminate=false; }
  else if (checked===total){ parent.checked=true; parent.indeterminate=false; }
  else { parent.checked=false; parent.indeterminate=true; }
}
function setChildrenByParent(groupEl, on){
  groupEl.querySelectorAll('input.cat').forEach(c=> c.checked = !!on);
}
function refreshAllParentStates(){
  catsBox.querySelectorAll('.group').forEach(setParentStateByChildren);
}
function computeAllSelected(){
  const realChildren = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat'));
  return realChildren.length > 0 && realChildren.every(c => c.checked);
}
let allSelected = false;

function bindGroupInteractions(){
  catsBox.querySelectorAll('.group-check').forEach(parent=>{
    parent.addEventListener('change', ()=>{
      const groupEl = parent.closest('.group');
      setChildrenByParent(groupEl, parent.checked);
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
    });
  });
  catsBox.querySelectorAll('input.cat').forEach(child=>{
    child.addEventListener('change', ()=>{
      const groupEl = child.closest('.group');
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
    });
  });
}

/* ---------- 전체선택 / 저장 복원 ---------- */
function selectAll(on){
  catsBox.querySelectorAll('input.cat').forEach(b => { b.checked = !!on; });
  refreshAllParentStates();
  allSelected = !!on;
  if (cbToggleAll) cbToggleAll.checked = allSelected;
}
function applySavedSelection(){
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('selectedCats') || 'null'); } catch {}

  if (!saved || saved === "ALL"){
    selectAll(true);
  }else{
    selectAll(false);
    const set = new Set(saved);
    catsBox.querySelectorAll('.cat').forEach(ch=>{ if (set.has(ch.value)) ch.checked = true; });
    refreshAllParentStates();
    allSelected = computeAllSelected();
    if (cbToggleAll) cbToggleAll.checked = allSelected;
  }

  const auto = localStorage.getItem('autonext') === 'on';
  if (cbAutoNext){ cbAutoNext.checked = auto; }
}
applySavedSelection();

cbAutoNext?.addEventListener('change', ()=>{ /* 저장은 btnWatch에서 */ });
cbToggleAll?.addEventListener('change', ()=>{ selectAll(!!cbToggleAll.checked); });

// 시청으로 이동 (선택 저장)
btnWatch?.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const filtered = selected.filter(v => v!=='personal1' && v!=='personal2');
  const isAll = computeAllSelected();
  const valueToSave = (filtered.length === 0 || isAll) ? "ALL" : filtered;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
  location.href = 'watch.html';
});

/* ---------- 순서 설정 페이지 열기 ---------- */
btnOrderOpen?.addEventListener('click', ()=>{
  location.href = 'category-order.html';
});
