// js/index.js
import { CATEGORY_GROUPS } from './categories.js?v=20250821';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { escapeHTML, safePersonalLabel } from './sanitize.js';

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

/* ---------- dropdown ---------- */
let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{
  if (dropdown.classList.contains('hidden')) return;
  if (!e.target.closest('#dropdownMenu') && !e.target.closest('#menuBtn')) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown.addEventListener("click", (e)=> e.stopPropagation());

btnAbout?.addEventListener("click", ()=>{ location.href="about.html"; closeDropdown(); });
btnMyUploads?.addEventListener("click", ()=>{ location.href="manage-uploads.html"; closeDropdown(); });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href="upload.html"; closeDropdown(); });
brandHome?.addEventListener("click", (e)=>{ e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

/* ---------- personal label helpers ---------- */
function getPersonalLabels(){ try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }catch{ return {}; } }
function getPersonalPosition(){ const v = localStorage.getItem('personalPosition'); return v === 'top' ? 'top' : 'bottom'; }

/* ---------- render categories ---------- */
function renderGroups(){
  const personalLabels = getPersonalLabels();
  const pos = getPersonalPosition();

  const groups = CATEGORY_GROUPS.slice();
  if (pos === 'top'){
    const idx = groups.findIndex(g => g.key==='personal');
    if (idx>-1){ const [pg]=groups.splice(idx,1); groups.unshift(pg); }
  }

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal = (g.key==='personal');
      const defaultLabel = (c.value==='personal1') ? '자료1' : (c.value==='personal2' ? '자료2' : c.label);
      const storedRaw = isPersonal ? (personalLabels[c.value] || '') : '';
      const safeLabel  = isPersonal ? (safePersonalLabel(storedRaw) || defaultLabel) : c.label;
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${escapeHTML(safeLabel)}</label>`;
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

/* ---------- selection restore / select-all ---------- */
let allSelected = false;

function getStoredSelectedCats(){
  try{ const raw = localStorage.getItem('selectedCats'); return raw ? JSON.parse(raw) : null; }catch{ return null; }
}
function selectAll(on){
  const boxes = Array.from(catsBox.querySelectorAll('.cat'));
  boxes.forEach(b=> b.checked = !!on); // 개인자료 포함해서 체크 (요청 반영)
  allSelected = !!on;
  btnToggleAll.setAttribute('aria-pressed', on ? 'true':'false');
}
function applyStoredSelection(){
  const stored = getStoredSelectedCats();
  if (!stored || stored === "ALL"){ selectAll(true); return; }
  if (Array.isArray(stored) && stored.length){
    selectAll(false);
    const set = new Set(stored);
    Array.from(catsBox.querySelectorAll('.cat')).forEach(b=>{ if (set.has(b.value)) b.checked = true; });
    allSelected = false; btnToggleAll.setAttribute('aria-pressed','false');
  }else{
    selectAll(true);
  }
}
applyStoredSelection();

btnToggleAll.addEventListener('click', ()=> selectAll(!allSelected));

/* ---------- save & go ---------- */
btnWatch.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  // 시청페이지 전달에서는 개인자료 제거
  const filtered = selected.filter(v => v!=='personal1' && v!=='personal2');
  const valueToSave = (filtered.length === 0 || allSelected) ? "ALL" : filtered;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  location.href = 'watch.html';
});
