// js/index.js
import { CATEGORY_GROUPS } from './categories.js';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';

const GROUP_ORDER_KEY = 'groupOrderV1';

function applyGroupOrder(groups){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(GROUP_ORDER_KEY) || 'null'); }catch{}
  const order = Array.isArray(saved) && saved.length ? saved : groups.map(g=>g.key);
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

// 추가: 개인 라벨 로더
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }
  catch{ return {}; }
}

function renderGroups(){
  const personalLabels = getPersonalLabels();
  const groups = applyGroupOrder(CATEGORY_GROUPS); // 기존 함수 그대로 사용

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal = (g.key === 'personal');
      const fallback   = (c.value==='personal1') ? '자료1' : (c.value==='personal2' ? '자료2' : c.label);
      const labelText  = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : fallback;
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}</label>`;
    }).join('');

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
  bindGroupInteractions(); // 기존 함수 그대로 호출
}

// (선택) 다른 탭/페이지에서 개인자료 이름 변경 시 자동 반영
window.addEventListener('storage', (e)=>{
  if(e.key==='personalLabels') renderGroups();
});

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
  // 'personal' 그룹은 전체선택 계산에서 제외
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
  if (!saved || saved==="ALL"){
    selectAll(true);
  }else if (Array.isArray(saved)){
    selectAll(false);
    const set = new Set(saved);
    catsBox.querySelectorAll('.cat').forEach(ch=>{ if (set.has(ch.value)) ch.checked=true; });
    refreshAllParentStates();
  }else if (saved && typeof saved==='object' && saved.personal){
    // 개인자료만 선택되어 저장된 경우
    selectAll(false);
    const v = saved.personal;
    const el = catsBox.querySelector(`.cat[value="${v}"]`);
    if(el) el.checked = true;
    refreshAllParentStates();
  }else{
    selectAll(true);
  }
  // autonext
  const auto = localStorage.getItem('autonext')==='on';
  if (cbAutoNext) cbAutoNext.checked = auto;
}
applySavedSelection();

cbToggleAll?.addEventListener('change', ()=> selectAll(!!cbToggleAll.checked));
btnWatch?.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const hasPersonal1 = selected.includes('personal1');
  const hasPersonal2 = selected.includes('personal2');
  const normals = selected.filter(v => v!=='personal1' && v!=='personal2');

  let toSave = null;
  if ((hasPersonal1 ^ hasPersonal2) && normals.length===0){
    // 개인자료만 단독 선택
    toSave = { personal: hasPersonal1 ? 'personal1' : 'personal2' };
  }else{
    // 일반 카테고리만 저장(개인자료와 혼합된 경우 개인자료는 무시)
    const isAll = computeAllSelected();
    toSave = (normals.length===0 || isAll) ? "ALL" : normals;
  }

  localStorage.setItem('selectedCats', JSON.stringify(toSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
  location.href = 'watch.html';
});
catTitleBtn?.addEventListener('click', ()=> location.href='category-order.html');
