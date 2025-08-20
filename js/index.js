// js/index.js
import { CATEGORY_GROUPS } from './categories.js?v=20250821';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { safePersonalLabel } from './sanitize.js';

/* DOM */
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

/* 드롭다운 공통 */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
}
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn.addEventListener("click", (e)=>{
  e.stopPropagation();
  dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown();
});
document.addEventListener('pointerdown', (e)=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown.addEventListener("click", (e)=> e.stopPropagation());
btnMyUploads?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
btnAbout?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
brandHome?.addEventListener("click", (e)=>{ e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

/* 개인자료 라벨/위치 */
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }
  catch{ return {}; }
}
function getPersonalPosition(){
  const v = localStorage.getItem('personalPosition');
  return v === 'top' ? 'top' : 'bottom'; // 기본 하단
}

/* 카테고리 렌더 */
function renderGroups(prechecked=null){
  const personalLabels = getPersonalLabels();
  const pos = getPersonalPosition();

  const groups = CATEGORY_GROUPS.slice();
  if (pos === 'top'){
    const idx = groups.findIndex(g => g.key === 'personal');
    if (idx > -1){
      const [pg] = groups.splice(idx, 1);
      groups.unshift(pg);
    }
  }

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal = (g.key==='personal');
      const defaultLabel = (c.value==='personal1') ? '자료1' : (c.value==='personal2' ? '자료2' : c.label);
      const labelText = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : defaultLabel;
      const checked = prechecked?.has(c.value) ? 'checked' : '';
      return `<label><input type="checkbox" class="cat" value="${c.value}" ${checked}> ${labelText}</label>`;
    }).join('');

    const legend = (g.key==='personal')
      ? `${g.label} <span class="subnote">(로컬저장소)</span>`
      : g.label;

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;
}

/* 전체보기 토글 */
let allSelected = false;
function selectAll(on){
  const boxes = Array.from(catsBox.querySelectorAll('.cat'));
  boxes.forEach(b=>{ b.checked = !!on; }); // 개인자료 포함해서 UI 일관
  allSelected = !!on;
  btnToggleAll.setAttribute('aria-pressed', on ? 'true':'false');
}

/* 초기 선택값: 저장된 값이 없으면 전체선택 ON */
function initSelection(){
  const raw = localStorage.getItem('selectedCats');
  let preset = null;
  if (raw){
    try{
      const parsed = JSON.parse(raw);
      if (parsed === "ALL"){ selectAll(true); return; }
      if (Array.isArray(parsed) && parsed.length){
        preset = new Set(parsed);
      }
    }catch{}
  }
  renderGroups(preset);
  if (!raw){ selectAll(true); } // 최초 진입은 전체선택
}
renderGroups(new Set()); // 일단 렌더
initSelection();

/* 전체보기 버튼 */
btnToggleAll.addEventListener('click', ()=>{ selectAll(!allSelected); });

/* 저장 & 이동 */
btnWatch.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);

  // 개인자료는 시청 페이지에서는 의미 없음 → 제외하여 저장
  const filtered = selected.filter(v => v !== 'personal1' && v !== 'personal2');
  const valueToSave = (filtered.length === 0 || allSelected) ? "ALL" : filtered;

  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  location.href = 'watch.html';
});
