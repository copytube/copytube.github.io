// js/index.js (v1.2.3)
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

const isPersonalVal = (v)=> v==='personal1' || v==='personal2';

function renderGroups(){
  const groups = applyGroupOrder(CATEGORY_GROUPS);
  const html = groups.map(g=>{
    const isPersonalGroup = g.key==='personal';
    const kids = g.children.map(c=> `<label><input type="checkbox" class="cat" value="${c.value}"> ${c.label}</label>`).join('');

    // 개인자료: 부모체크 없음 + 안내문 포함
    const legendHTML = isPersonalGroup
      ? `<legend><span style="font-weight:800;">${g.label}</span> <span class="muted">(로컬저장소)</span></legend>`
      : `<legend>
           <label class="group-toggle">
             <input type="checkbox" class="group-check" data-group="${g.key}" />
             <span>${g.label}</span>
           </label>
         </legend>`;

    const noteHTML = isPersonalGroup
      ? `<div class="muted" style="margin:6px 4px 2px;">개인자료는 <b>단독 재생만</b> 가능합니다.</div>`
      : '';

    return `
      <fieldset class="group" data-key="${g.key}">
        ${legendHTML}
        ${noteHTML}
        <div class="child-grid">${kids}</div>
      </fieldset>
    `;
  }).join('');
  catsBox.innerHTML = html;
  bindGroupInteractions();
}
renderGroups();

/* 부모/자식 동기화 */
function setParentStateByChildren(groupEl){
  const parent   = groupEl.querySelector('.group-check');
  if (!parent) return; // 개인자료 그룹: 부모체크 없음
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
  catsBox.querySelectorAll('.group').forEach(setParentStateByChildren);
}
function computeAllSelected(){
  // 전체선택/해제 판단은 개인자료 제외
  const real = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat'));
  return real.length>0 && real.every(c=>c.checked);
}
let allSelected=false;

function bindGroupInteractions(){
  // 부모체크(개인자료 그룹 없음)
  catsBox.querySelectorAll('.group-check').forEach(parent=>{
    const groupKey = parent.getAttribute('data-group');
    if (groupKey === 'personal') return; // 안전차단
    parent.addEventListener('change', ()=>{
      const groupEl = parent.closest('.group');
      setChildrenByParent(groupEl, parent.checked);
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;

      // 개인자료가 체크돼 있었다면 해제(섞기 금지)
      catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
    });
  });

  // 자식체크
  catsBox.querySelectorAll('input.cat').forEach(child=>{
    child.addEventListener('change', ()=>{
      const v = child.value;
      const isPersonal = isPersonalVal(v);

      if (isPersonal && child.checked){
        // 개인자료는 단독: 다른 개인/일반 모두 해제하고 자기만 유지
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat').forEach(c=>{ if(c!==child) c.checked=false; });
        catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat:checked').forEach(c=> c.checked=false);
      }
      if (!isPersonal && child.checked){
        // 일반 체크 시 개인자료 해제
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
      }

      // 부모상태 갱신
      const groupEl = child.closest('.group');
      setParentStateByChildren(groupEl);
      refreshAllParentStates();

      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
    });
  });
}

/* 전체선택 + 로컬 저장 */
function selectAll(on){
  // 개인자료는 전체선택에 포함하지 않음
  catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat').forEach(b => b.checked = !!on);
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
    // 개인자료 단독 규칙 적용(보호)
    const personals = Array.from(catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked'));
    const normals   = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat:checked'));
    if (personals.length >= 1 && normals.length >= 1){
      // 일반이 있다면 개인 해제
      personals.forEach(c=> c.checked=false);
    }else if (personals.length >= 2){
      // 개인 두 개면 첫 번째만
      personals.slice(1).forEach(c=> c.checked=false);
    }
    refreshAllParentStates();
  }
  const auto = localStorage.getItem('autonext')==='on';
  if (cbAutoNext) cbAutoNext.checked = auto;
}
applySavedSelection();

cbToggleAll?.addEventListener('change', ()=> selectAll(!!cbToggleAll.checked));

btnWatch?.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const personals = selected.filter(isPersonalVal);
  const normals   = selected.filter(v=> !isPersonalVal(v));

  // 개인자료 단독 재생
  if (personals.length === 1 && normals.length === 0){
    localStorage.setItem('selectedCats', JSON.stringify(personals));
    localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
    location.href = `watch.html?cats=${encodeURIComponent(personals[0])}`;
    return;
  }

  // 일반 카테고리(개인자료는 섞지 않음)
  const isAll = computeAllSelected();
  const valueToSave = (normals.length===0 || isAll) ? "ALL" : normals;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
  location.href = 'watch.html';
});

catTitleBtn?.addEventListener('click', ()=> location.href='category-order.html');
