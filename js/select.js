// js/select.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CATEGORY_GROUPS, isPersonalValue } from './categories.js';

/* ---------- DOM ---------- */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");

const catWrap      = document.getElementById("catWrap");
const btnStart     = document.getElementById("btnStart");
const msg          = document.getElementById("msg");
const allToggle    = document.getElementById("allToggle");

/* ---------- 상단 드롭다운 ---------- */
function openDropdown(){
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
  dropdown.setAttribute('aria-hidden','false');
}
function closeDropdown(){
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
  dropdown.setAttribute('aria-hidden','true');
}
menuBtn?.addEventListener("click", (e)=>{
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
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); location.reload(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });

/* ---------- 그룹 UI 렌더 ---------- */
function renderGroups(){
  const html = CATEGORY_GROUPS.map(g=>{
    const kids = g.children.map(c=>(
      `<label><input type="checkbox" class="child" data-group="${g.key}" value="${c.value}"> ${c.label}</label>`
    )).join('');
    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>
          <label class="parent"><input type="checkbox" class="parent" data-group="${g.key}"> ${g.label}</label>
        </legend>
        <div class="child-grid">${kids}</div>
        ${g.personal ? `<div class="note-local">이 그룹은 이 기기에만 저장/표시됩니다.</div>` : ``}
      </fieldset>
    `;
  }).join('');
  catWrap.innerHTML = html;

  const parentBoxes = Array.from(catWrap.querySelectorAll('input.parent'));
  const childBoxes  = Array.from(catWrap.querySelectorAll('input.child'));

  parentBoxes.forEach(p=>{
    p.addEventListener('change', ()=>{
      const key = p.dataset.group;
      const children = childBoxes.filter(c=> c.dataset.group === key);
      children.forEach(c=> c.checked = p.checked);
      p.indeterminate = false;
      syncAllToggle();
    });
  });
  childBoxes.forEach(c=>{
    c.addEventListener('change', ()=>{
      const key = c.dataset.group;
      const parent = parentBoxes.find(p=> p.dataset.group === key);
      const sibs = childBoxes.filter(x=> x.dataset.group === key);
      const any = sibs.some(x=>x.checked);
      const all = sibs.every(x=>x.checked);
      parent.checked = all;
      parent.indeterminate = any && !all;
      syncAllToggle();
    });
  });
  allToggle.addEventListener('change', ()=>{
    const on = allToggle.checked;
    parentBoxes.forEach(p=>{ p.checked = on; p.indeterminate = false; });
    childBoxes.forEach(c=> c.checked = on);
  });
}
renderGroups();

/* ---------- 저장/복원 ---------- */
const LS_KEY_V2      = 'copytube_selected_categories_v2';
const LS_PERSONAL_V1 = 'copytube_personal_flags_v1';

function readSelectionFromUI(){
  const childBoxes = Array.from(catWrap.querySelectorAll('input.child'));
  const selectedAll = !!allToggle.checked;

  const selectedPublic = [];
  const selectedPersonal = [];
  for (const b of childBoxes){
    if (!b.checked) continue;
    const v = b.value;
    if (isPersonalValue(v)) selectedPersonal.push(v);
    else selectedPublic.push(v);
  }
  return { all: selectedAll, selectedPublic, selectedPersonal };
}

function applySelectionToUI({ all, publicValues = [], personalValues = [] }){
  allToggle.checked = !!all;
  const parentBoxes = Array.from(catWrap.querySelectorAll('input.parent'));
  const childBoxes  = Array.from(catWrap.querySelectorAll('input.child'));
  const publicSet   = new Set(publicValues || []);
  const personalSet = new Set(personalValues || []);
  childBoxes.forEach(c=>{
    const v = c.value;
    if (all) c.checked = true;
    else if (isPersonalValue(v)) c.checked = personalSet.has(v);
    else c.checked = publicSet.has(v);
  });
  parentBoxes.forEach(p=>{
    const key = p.dataset.group;
    const sibs = childBoxes.filter(x=> x.dataset.group === key);
    const any = sibs.some(x=>x.checked);
    const allKids = sibs.every(x=>x.checked);
    p.checked = allKids;
    p.indeterminate = any && !allKids;
  });
}

function syncAllToggle(){
  const childBoxes = Array.from(catWrap.querySelectorAll('input.child'));
  const every = childBoxes.every(c=> c.checked);
  const some  = childBoxes.some(c=> c.checked);
  allToggle.indeterminate = some && !every;
  allToggle.checked = every;
}

async function restoreSelection(){
  let personalValues = [];
  try{ const raw = localStorage.getItem(LS_PERSONAL_V1); if (raw){ const j = JSON.parse(raw); if (Array.isArray(j?.selected)) personalValues = j.selected; } }catch{}
  let all = false;
  let publicValues = [];
  if (auth.currentUser){
    try{
      const s = await getDoc(doc(db,'users', auth.currentUser.uid));
      if (s.exists()){
        const d = s.data();
        all = !!d?.selectAll;
        publicValues = Array.isArray(d?.selectedCategories) ? d.selectedCategories : [];
      }
    }catch{}
  }else{
    try{ const raw = localStorage.getItem(LS_KEY_V2); if (raw){ const j = JSON.parse(raw); all=!!j?.selectAll; publicValues=Array.isArray(j?.selected)? j.selected:[]; } }catch{}
  }
  if (!all && publicValues.length === 0 && personalValues.length === 0){ all = true; }
  applySelectionToUI({ all, publicValues, personalValues });
  syncAllToggle();
}

onAuthStateChanged(auth, async (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  await restoreSelection();
});

/* ---------- 저장 & 이동 ---------- */
btnStart?.addEventListener('click', async ()=>{
  const sel = readSelectionFromUI();
  if (!sel.all && sel.selectedPublic.length === 0 && sel.selectedPersonal.length === 0){
    msg.textContent = '카테고리를 하나 이상 선택해 주세요.'; return;
  }
  msg.textContent = '저장 중…';
  try{ localStorage.setItem(LS_PERSONAL_V1, JSON.stringify({ selected: sel.selectedPersonal, ts: Date.now() })); }catch{}
  try{
    if (auth.currentUser){
      await setDoc(doc(db,'users', auth.currentUser.uid), {
        selectAll: !!sel.all,
        selectedCategories: sel.selectedPublic,
        updatedAt: serverTimestamp()
      }, { merge:true });
    }else{
      localStorage.setItem(LS_KEY_V2, JSON.stringify({ selectAll: !!sel.all, selected: sel.selectedPublic, ts: Date.now() }));
    }
    msg.textContent = '완료! 영상 보기로 이동합니다…';
    location.href = 'watch.html';
  }catch(e){
    msg.textContent = `오류: ${e.message||e}`;
  }
});
