import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { CATEGORY_GROUPS } from './categories.js';

/* ----------------- DOM ----------------- */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnMyUploads = document.getElementById("btnMyUploads");
const brandHome    = document.getElementById("brandHome");
const catsBox      = document.getElementById("cats");
const btnWatch     = document.getElementById("btnWatch");

/* ----------------- 드롭다운 ----------------- */
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
btnMyUploads?.addEventListener("click", ()=>{
  location.href = "list-url-and-categories.html";
  closeDropdown();
});
btnSignOut?.addEventListener("click", async ()=>{
  await fbSignOut(auth);
  closeDropdown();
});
btnGoUpload?.addEventListener("click", ()=>{
  location.href = "upload.html";
  closeDropdown();
});
brandHome?.addEventListener("click", (e)=>{
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* ----------------- 개인자료 라벨 로드 ----------------- */
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }
  catch{ return {}; }
}

/* ----------------- 카테고리 렌더 ----------------- */
function renderGroups(){
  const personalLabels = getPersonalLabels();

  const html = CATEGORY_GROUPS.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal = (g.key==='personal');
      const labelText = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : c.label;
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}</label>`;
    }).join('');

    // 개인자료 그룹에는 (이 기기에만 저장) 표시를 legend 옆에 붙임
    const legend = (g.key==='personal')
      ? `${g.label} <span class="subnote">(이 기기에만 저장)</span>`
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

/* ----------------- 저장 & 이동 ----------------- */
btnWatch.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);

  // 개인자료(personal1/2)는 시청 페이지에서는 의미가 없으므로 저장에서 제외
  const filtered = selected.filter(v => v !== 'personal1' && v !== 'personal2');

  const valueToSave = (filtered.length === 0) ? "ALL" : filtered;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  // 시청 페이지로 이동
  location.href = 'watch.html';
});
