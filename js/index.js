// js/index.js
import { CATEGORY_GROUPS } from './categories.js?v=20250820';
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
const btnToggleAll = document.getElementById("btnToggleAll");
const cbAutoNext   = document.getElementById("cbAutoNext");
const autoNextWrap = document.getElementById("autoNextWrap");

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

/* ---------- 개인자료 라벨/위치 ---------- */
function getPersonalLabels(){ try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }catch{ return {}; } }
function getPersonalPosition(){ const v = localStorage.getItem('personalPosition'); return v === 'top' ? 'top' : 'bottom'; }

/* ---------- 렌더 ---------- */
function renderGroups(){
  const personalLabels = getPersonalLabels();
  const pos = getPersonalPosition();

  const groups = CATEGORY_GROUPS.slice();
  if (pos === 'top'){
    const idx = groups.findIndex(g => g.key === 'personal');
    if (idx > -1){ const [pg] = groups.splice(idx, 1); groups.unshift(pg); }
  }

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

  // 이벤트 바인딩
  bindGroupInteractions();
}
renderGroups();

/* ---------- 선택 상태 동기화 ---------- */
function setParentStateByChildren(groupEl){
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  const parent   = groupEl.querySelector('.group-check');
  if (!parent) return;

  const total = children.length;
  const checked = children.filter(c => c.checked).length;

  if (checked === 0){
    parent.checked = false;
    parent.indeterminate = false;
  } else if (checked === total){
    parent.checked = true;
    parent.indeterminate = false;
  } else {
    parent.checked = false;
    parent.indeterminate = true; // 일부만
  }
}
function setChildrenByParent(groupEl, on){
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  children.forEach(c => { c.checked = !!on; });
}

/* 모든 그룹의 부모 상태 갱신 */
function refreshAllParentStates(){
  catsBox.querySelectorAll('.group').forEach(setParentStateByChildren);
}

/* 전체 선택 여부 계산(개인자료 제외) */
function computeAllSelected(){
  const realChildren = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat'));
  return realChildren.length > 0 && realChildren.every(c => c.checked);
}

/* ---------- 바인딩 ---------- */
let allSelected = false;

function bindGroupInteractions(){
  // 부모 → 자식
  catsBox.querySelectorAll('.group-check').forEach(parent=>{
    parent.addEventListener('change', ()=>{
      const groupEl = parent.closest('.group');
      setChildrenByParent(groupEl, parent.checked);
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      btnToggleAll?.setAttribute('aria-pressed', allSelected ? 'true' : 'false');
    });
  });

  // 자식 → 부모
  catsBox.querySelectorAll('input.cat').forEach(child=>{
    child.addEventListener('change', ()=>{
      const groupEl = child.closest('.group');
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      btnToggleAll?.setAttribute('aria-pressed', allSelected ? 'true' : 'false');
    });
  });
}

/* ---------- 전체보기 토글 + 저장 복원 ---------- */
function selectAll(on){
  // 모든 자식 체크박스에 적용 (개인자료 포함)
  catsBox.querySelectorAll('input.cat').forEach(b => { b.checked = !!on; });
  refreshAllParentStates();
  allSelected = !!on;
  btnToggleAll?.setAttribute('aria-pressed', on ? 'true':'false');
}

function applySavedSelection(){
  // 카테고리 선택 복원 (없으면 전체)
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
    btnToggleAll?.setAttribute('aria-pressed', allSelected ? 'true' : 'false');
  }

  // 연속재생 복원
  const auto = localStorage.getItem('autonext') === 'on';
  if (cbAutoNext){ cbAutoNext.checked = auto; autoNextWrap?.setAttribute('aria-pressed', auto ? 'true' : 'false'); }
}
applySavedSelection();

btnToggleAll?.addEventListener('click', ()=>{
  selectAll(!allSelected);
});

cbAutoNext?.addEventListener('change', ()=>{
  autoNextWrap?.setAttribute('aria-pressed', cbAutoNext.checked ? 'true' : 'false');
});

// 시청으로 이동 (선택 저장)
btnWatch?.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  // 개인자료 제외
  const filtered = selected.filter(v => v!=='personal1' && v!=='personal2');
  // 전체 판단은 실제 카테고리 기준으로 재계산
  const isAll = computeAllSelected();
  const valueToSave = (filtered.length === 0 || isAll) ? "ALL" : filtered;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
  location.href = 'watch.html';
});
