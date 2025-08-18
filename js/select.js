// js/select.js
import { auth, db } from './firebase-init.js';
import {
  onAuthStateChanged, signOut as fbSignOut
} from './auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CATEGORIES } from './categories.js';

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
btnMyUploads?.addEventListener("click", ()=>{ location.href = "my-uploads.html"; closeDropdown(); });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); location.reload(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });

/* ---------- 카테고리 UI ---------- */
let boxes = [], allBox, catBoxes;

function renderCategoryUI() {
  const all = `<label><input type="checkbox" class="cat-box" value="__ALL__"> 전체선택</label>`;
  const rest = CATEGORIES.map(c => (
    `<label><input type="checkbox" class="cat-box" value="${c.value}"> ${c.label}</label>`
  )).join('');
  catWrap.innerHTML = all + rest;

  boxes = Array.from(catWrap.querySelectorAll('input.cat-box'));
  allBox = boxes.find(b => b.value === "__ALL__");
  catBoxes = boxes.filter(b => b !== allBox);

  allBox.addEventListener('change', ()=> {
    const on = allBox.checked;
    catBoxes.forEach(b=> b.checked = on);
  });
  catBoxes.forEach(b => b.addEventListener('change', ()=>{
    const allOn = catBoxes.every(x=>x.checked);
    allBox.checked = allOn;
  }));
}

renderCategoryUI();

/* ---------- 로그인 상태 + 환영문구 ---------- */
onAuthStateChanged(auth, async (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";

  await restoreSelection(); // 로그인 여부에 따라 복원
});

/* ---------- 저장/복원 ---------- */
const LS_KEY = 'copytube_selected_categories';

async function restoreSelection(){
  // 1) 로그인: Firestore /users/{uid}
  if (auth.currentUser){
    try{
      const s = await getDoc(doc(db,'users', auth.currentUser.uid));
      const data = s.exists() ? s.data() : null;
      if (data?.selectAll){
        allBox.checked = true; catBoxes.forEach(b=> b.checked = true);
        return;
      }
      const arr = Array.isArray(data?.selectedCategories) ? data.selectedCategories : [];
      if (arr.length){
        applyArray(arr);
        return;
      }
    }catch(e){
      // 실패 시 localStorage로 폴백
    }
  }
  // 2) 비로그인: localStorage
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const st = JSON.parse(raw);
      if (st?.selectAll){ allBox.checked = true; catBoxes.forEach(b=> b.checked = true); return; }
      const arr = Array.isArray(st?.selected) ? st.selected : [];
      if (arr.length){ applyArray(arr); return; }
    }
  }catch{}

  // 3) 폴백: 저장된 게 전혀 없으면 전체선택 ON (요청사항)
  allBox.checked = true; catBoxes.forEach(b=> b.checked = true);
}

function applyArray(arr){
  allBox.checked = false;
  const set = new Set(arr);
  catBoxes.forEach(b=> b.checked = set.has(b.value));
}

/* ---------- 버튼: 영상보기 ---------- */
btnStart.addEventListener('click', async ()=>{
  const all = allBox.checked;
  const selected = catBoxes.filter(x=>x.checked).map(x=>x.value);
  if (!all && selected.length === 0){
    msg.textContent = '카테고리를 하나 이상 선택해 주세요.'; return;
  }
  msg.textContent = '저장 중…';

  const payload = all
    ? { selectAll:true, selectedCategories:[], updatedAt: serverTimestamp() }
    : { selectAll:false, selectedCategories:selected, updatedAt: serverTimestamp() };

  // 로그인/비로그인 저장
  try{
    if(auth.currentUser){
      await setDoc(doc(db,'users', auth.currentUser.uid), payload, { merge:true });
    }else{
      localStorage.setItem(LS_KEY, JSON.stringify({
        selectAll: all, selected, ts: Date.now()
      }));
    }
    msg.textContent = '완료! 영상 보기로 이동합니다…';
    location.href = 'watch.html';
  }catch(e){
    msg.textContent = `오류: ${e.message||e}`;
  }
});
