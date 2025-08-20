import { CATEGORY_GROUPS } from './categories.js?v=20250821';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';

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

/* 드롭다운 */
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

brandHome?.addEventListener("click", (e)=>{
  e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" });
});

/* 개인자료 표시 관련 (개인자료 위치/라벨은 index에도 반영) */
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }
  catch{ return {}; }
}
function getPersonalPosition(){
  const v = localStorage.getItem('personalPosition');
  return v === 'top' ? 'top' : 'bottom';
}

/* 카테고리 렌더 */
function renderGroups(){
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
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}</label>`;
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
renderGroups();

/* 전체보기 토글 — 개인자료도 시각적으로 체크되도록 변경 */
let allSelected = false;
function selectAll(on){
  const boxes = Array.from(catsBox.querySelectorAll('.cat'));
  boxes.forEach(b=>{ b.checked = !!on; });
  allSelected = !!on;
  btnToggleAll.setAttribute('aria-pressed', on ? 'true':'false');
}
btnToggleAll.addEventListener('click', ()=>{ selectAll(!allSelected); });

/* 저장 & 이동 (시청 시 personal은 제외하여 저장) */
btnWatch.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const filtered = selected.filter(v => v !== 'personal1' && v !== 'personal2');
  const valueToSave = (filtered.length === 0 || allSelected) ? "ALL" : filtered;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  location.href = 'watch.html';
});
