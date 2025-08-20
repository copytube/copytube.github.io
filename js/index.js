// js/index.js
import { CATEGORY_GROUPS } from './categories.js?v=20250820'; // 최신 카테고리
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

let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }

// 드롭다운: 스크롤/휠/스와이프/키 입력 시 자동 닫힘
["scroll","wheel","touchstart","keydown"].forEach(ev=>{
  window.addEventListener(ev, ()=>{ if(!dropdown.classList.contains('hidden')) closeDropdown(); }, {passive:true});
});

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});

menuBtn.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown.addEventListener("click", (e)=> e.stopPropagation());
btnMyUploads?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnAbout?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
brandHome?.addEventListener("click", (e)=>{ e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

/* ----------------- 개인자료 라벨/위치 ----------------- */
function getPersonalLabels(){ try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }catch{ return {}; } }
function getPersonalPosition(){ const v = localStorage.getItem('personalPosition'); return v === 'top' ? 'top' : 'bottom'; }

/* ----------------- 렌더 ----------------- */
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
      const defaultLabel = (c.value==='personal1') ? '자료1' : (c.value==='personal2' ? '자료2' : c.label);
      const labelText = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : defaultLabel;
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}</label>`;
    }).join('');

    const legend = (g.key==='personal') ? `${g.label} <span class="subnote">(로컬저장소)</span>` : g.label;

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;
}
renderGroups();

/* ----------------- 전체보기 토글 + 저장 복원 ----------------- */
let allSelected = false;

function selectAll(on){
  const boxes = Array.from(catsBox.querySelectorAll('.cat'));
  boxes.forEach(b => { b.checked = !!on; });  // ← 제외 로직 제거
  allSelected = !!on;
  btnToggleAll.setAttribute('aria-pressed', on ? 'true':'false');
}


// 최초 진입 시 이전 선택 복원
function applySavedSelection(){
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('selectedCats') || 'null'); } catch {}
  if (!saved){
    // 아무 저장값이 없으면 "ALL"로 간주해 자동 전체 선택
    selectAll(true);
    return;
  }
  if (saved === "ALL"){
    selectAll(true);
    return;
  }
  // 배열이면 해당 코드만 체크
  selectAll(false);
  const set = new Set(saved);
  catsBox.querySelectorAll('.cat').forEach(ch=>{
    if (set.has(ch.value)) ch.checked = true;
  });
  allSelected = false;
  btnToggleAll.setAttribute('aria-pressed','false');
}
applySavedSelection();

btnToggleAll.addEventListener('click', ()=>{ selectAll(!allSelected); });

// 시청으로 이동(현재 선택 저장)
btnWatch.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const filtered = selected.filter(v => v!=='personal1' && v!=='personal2');
  const valueToSave = (filtered.length === 0 || allSelected) ? "ALL" : filtered;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  location.href = 'watch.html';
});
