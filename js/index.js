// js/index.js  (btnOpenOrder 클릭 안정화 + 순서 자동반영 유지)
import { CATEGORY_GROUPS } from './categories.js';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';

const GROUP_ORDER_KEY = 'groupOrderV1';

function getSavedOrder(){
  try{ const v = JSON.parse(localStorage.getItem(GROUP_ORDER_KEY) || 'null'); return Array.isArray(v) ? v : null; }catch{ return null; }
}
function orderSignature(arr){ return JSON.stringify(arr || []); }

function applyGroupOrder(groups){
  const saved = getSavedOrder();
  const order = saved && saved.length ? saved : groups.map(g=>g.key);
  const idx = new Map(order.map((k,i)=>[k,i]));
  return groups.slice().sort((a,b)=>(idx.get(a.key)??999) - (idx.get(b.key)??999));
}

/* ---------- Topbar ---------- */
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
function openDropdown(){ isMenuOpen=true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen=false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"),180); }

onAuthStateChanged(auth,(user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click",(e)=> e.stopPropagation());
btnMyUploads ?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnOrder     ?.addEventListener("click", ()=>{ location.href = "category-order.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if(!auth.currentUser){ location.href='signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
brandHome    ?.addEventListener("click",(e)=>{ e.preventDefault(); window.scrollTo({top:0,behavior:"smooth"}); });

/* ---------- Cats ---------- */
const catsBox      = document.getElementById("cats");
const btnWatch     = document.getElementById("btnWatch");
const cbAutoNext   = document.getElementById("cbAutoNext");
const cbToggleAll  = document.getElementById("cbToggleAll");
const catTitleBtn  = document.getElementById("btnOpenOrder");

let lastAppliedSig = "";

function currentCheckedSet(){
  const set=new Set();
  catsBox.querySelectorAll('.cat:checked').forEach(el=> set.add(el.value));
  return set;
}
function restoreCheckedFromSet(set){
  if(!set) return;
  catsBox.querySelectorAll('.cat').forEach(el=> el.checked = set.has(el.value));
}

function renderGroups(){
  const groups = applyGroupOrder(CATEGORY_GROUPS);
  const html = groups.map(g=>{
    const kids = g.children.map(c=> `<label><input type="checkbox" class="cat" value="${c.value}"> ${c.label}</label>`).join('');
    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>
          <label class="group-toggle">
            <input type="checkbox" class="group-check" data-group="${g.key}" />
            <span>${g.label}${g.key==='personal' ? ' <span class="subnote">(로컬저장소)</span>' : ''}</span>
          </label>
        </legend>
        <div class="child-grid">${kids}</div>
      </fieldset>
    `;
  }).join('');
  catsBox.innerHTML = html;
  bindGroupInteractions();
  lastAppliedSig = orderSignature(getSavedOrder() || CATEGORY_GROUPS.map(g=>g.key));
}

function renderGroupsPreserveSelection(){
  const before = currentCheckedSet();
  renderGroups();
  restoreCheckedFromSet(before);
  refreshAllParentStates();
  allSelected = computeAllSelected();
  if (cbToggleAll) cbToggleAll.checked = allSelected;
}

renderGroups();

/* 부모/자식 동기화 */
function setParentStateByChildren(groupEl){
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  const parent   = groupEl.querySelector('.group-check');
  if (!parent) return;
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
  catsBox.querySelectorAll('.group').forEach(setParentStateByChildren);
}
function computeAllSelected(){
  const real = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat'));
  return real.length>0 && real.every(c=>c.checked);
}
let allSelected=false;

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

/* 전체선택 + 로컬 저장 */
function selectAll(on){
  catsBox.querySelectorAll('input.cat').forEach(b => b.checked = !!on);
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
    refreshAllParentStates();
    allSelected = computeAllSelected();
    if (cbToggleAll) cbToggleAll.checked = allSelected;
  }
  const auto = localStorage.getItem('autonext')==='on';
  if (cbAutoNext) cbAutoNext.checked = auto;
}
applySavedSelection();

cbToggleAll?.addEventListener('change', ()=> selectAll(!!cbToggleAll.checked));
btnWatch?.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const filtered = selected.filter(v => v!=='personal1' && v!=='personal2');
  const isAll = computeAllSelected();
  const valueToSave = (filtered.length===0 || isAll) ? "ALL" : filtered;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
  location.href = 'watch.html';
});

/* 이 버튼이 ‘죽어보이는’ 문제 방지: 명시적 클릭 핸들러 */
const openOrder = ()=>{ location.href='category-order.html'; };
document.getElementById('btnOpenOrder')?.addEventListener('click', openOrder);

function maybeRerenderIfOrderChanged(){
  const sig = orderSignature(getSavedOrder() || CATEGORY_GROUPS.map(g=>g.key));
  if(sig !== lastAppliedSig){
    renderGroupsPreserveSelection();
  }
}
window.addEventListener('storage', (e)=>{
  if(e.key===GROUP_ORDER_KEY){ maybeRerenderIfOrderChanged(); }
});
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible'){ maybeRerenderIfOrderChanged(); }
});
