// js/index.js
import { CATEGORY_GROUPS } from './categories.js?v=20250820';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';

/* ---------- 상단바 DOM ---------- */
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

/* ---------- 본문 DOM ---------- */
const catsBox      = document.getElementById("cats");
const btnWatch     = document.getElementById("btnWatch");
const cbAutoNext   = document.getElementById("cbAutoNext");
const cbToggleAll  = document.getElementById("cbToggleAll");
const catTitleBtn  = document.querySelector(".cat-title"); // h3 (검은 버튼처럼)

/* ---------- 드롭다운 ---------- */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown?.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown?.classList.add("show"));
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown?.classList.remove("show");
  setTimeout(()=> dropdown?.classList.add("hidden"), 180);
}
["scroll","wheel","touchmove","keydown"].forEach(ev=>{
  window.addEventListener(ev, ()=>{ if(!dropdown?.classList.contains('hidden')) closeDropdown(); }, {passive:true});
});

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "");
  // index는 로그인 없어도 사용 가능 → menuBtn은 항상 표시(사양 따라 조정)
  menuBtn?.classList.remove("hidden");
  closeDropdown();
});
menuBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown?.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());

function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ goOrSignIn("upload.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if (!auth.currentUser){ location.href = 'signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

/* ---------- 대분류 순서(로컬 저장) ---------- */
const GROUP_ORDER_KEY = 'groupOrder.v1';

function getSavedGroupOrder(){
  try { return JSON.parse(localStorage.getItem(GROUP_ORDER_KEY) || '[]'); }
  catch { return []; }
}
function applyGroupOrder(groups){
  const order = getSavedGroupOrder();
  if (!Array.isArray(order) || order.length === 0) return groups.slice();
  const map = new Map(groups.map(g => [g.key, g]));
  const out = [];
  for (const k of order){
    const g = map.get(k);
    if (g){ out.push(g); map.delete(k); }
  }
  // 새로 추가된 대분류는 뒤에 이어붙임
  for (const g of map.values()) out.push(g);
  return out;
}

/* ---------- 개인자료 라벨 ---------- */
function getPersonalLabels(){ try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }catch{ return {}; } }

/* ---------- 렌더 ---------- */
function renderGroups(){
  const personalLabels = getPersonalLabels();

  // 대분류 순서 적용
  const groups = applyGroupOrder(CATEGORY_GROUPS);

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

/* ---------- 부모/자식 동기화 ---------- */
function setParentStateByChildren(groupEl){
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  const parent   = groupEl.querySelector('.group-check');
  if (!parent) return;

  const total   = children.length;
  const checked = children.filter(c => c.checked).length;

  if (checked === 0){
    parent.checked = false;
    parent.indeterminate = false;
  } else if (checked === total){
    parent.checked = true;
    parent.indeterminate = false;
  } else {
    parent.checked = false;
    parent.indeterminate = true; // 일부 선택 시 indeterminate
  }
}
function setChildrenByParent(groupEl, on){
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  children.forEach(c => { c.checked = !!on; });
}
function refreshAllParentStates(){
  catsBox.querySelectorAll('.group').forEach(setParentStateByChildren);
}
function computeAllSelected(){
  // 전체선택 판단은 공유 카테고리만(개인자료 제외)
  const realChildren = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat'));
  return realChildren.length > 0 && realChildren.every(c => c.checked);
}

let allSelected = false;

function bindGroupInteractions(){
  // 부모 → 자식
  catsBox.querySelectorAll('.group-check').forEach(parent=>{
    parent.addEventListener('change', ()=>{
      const groupEl = parent.closest('.group');
      setChildrenByParent(groupEl, parent.checked);
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
    });
  });

  // 자식 → 부모
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

cbAutoNext?.addEventListener('change', ()=>{ /* UI만, 저장은 btnWatch에서 */ });
cbToggleAll?.addEventListener('change', ()=>{ selectAll(!!cbToggleAll.checked); });

/* ---------- 카테고리 제목(검은버튼) → 순서설정 페이지 ---------- */
if (catTitleBtn){
  catTitleBtn.style.cursor = 'pointer';
  catTitleBtn.title = '카테고리 순서 설정';
  catTitleBtn.addEventListener('click', ()=>{ location.href = 'category-order.html'; });
}

/* ---------- 시청으로 이동 (선택 저장) ---------- */
btnWatch?.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const filtered = selected.filter(v => v!=='personal1' && v!=='personal2');
  const isAll    = computeAllSelected();
  const valueToSave = (filtered.length === 0 || isAll) ? "ALL" : filtered;

  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
  location.href = 'watch.html';
});
