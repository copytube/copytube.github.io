// js/category-order.js
import { CATEGORY_GROUPS } from './categories.js';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';

const GROUP_ORDER_KEY = 'groupOrder.v1';
const LEGACY_KEYS = ['groupOrder']; // 혹시 예전 키로 저장된 경우 대비

/* ---------- 상단바(공용) ---------- */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnAbout     = document.getElementById("btnAbout");

let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown?.classList.remove("hidden"); requestAnimationFrame(()=> dropdown?.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown?.classList.remove("show"); setTimeout(()=> dropdown?.classList.add("hidden"), 180); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "");
  menuBtn?.classList.remove("hidden");
  closeDropdown();
});
menuBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown?.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());
function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ goOrSignIn("upload.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if (!auth.currentUser){ location.href = 'signin.html'; return; } await fbSignOut(auth); closeDropdown(); });

/* ---------- 로컬 저장 ---------- */
function getSavedOrder(){
  try{
    const v = localStorage.getItem(GROUP_ORDER_KEY);
    if (v) return JSON.parse(v);
    // fallback
    for (const k of LEGACY_KEYS){
      const lv = localStorage.getItem(k);
      if (lv) return JSON.parse(lv);
    }
  }catch{}
  return null;
}
function saveOrder(arr){
  localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(arr));
  localStorage.setItem(GROUP_ORDER_KEY + '.ts', String(Date.now()));
}
function defaultOrder(){
  return CATEGORY_GROUPS.map(g => g.key);
}

/* ---------- UI 상태 ---------- */
const leftListEl  = document.getElementById('leftList');
const rightListEl = document.getElementById('rightList');
const btnReset    = document.getElementById('btnReset');
const btnConfirm  = document.getElementById('btnConfirm');
const msgEl       = document.getElementById('msg');

const initialOrder = getSavedOrder() || defaultOrder();
const keyToInitialIndex = new Map(initialOrder.map((k, i) => [k, i]));

// 시작 상태: 모두 왼쪽(현재 순서), 오른쪽 비움
let left  = initialOrder.slice();
let right = [];

/* ---------- 렌더링 ---------- */
function labelOf(key){
  const g = CATEGORY_GROUPS.find(x => x.key === key);
  return g ? g.label : key;
}
function render(){
  leftListEl.innerHTML  = left .map(k => `<div class="item" data-k="${k}">${labelOf(k)}</div>`).join('');
  rightListEl.innerHTML = right.map(k => `<div class="item" data-k="${k}">${labelOf(k)}</div>`).join('');

  // 왼쪽 → 오른쪽
  leftListEl.querySelectorAll('.item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const k = el.dataset.k;
      const i = left.indexOf(k);
      if (i > -1){
        left.splice(i,1);
        right.push(k);
        render();
      }
    });
  });

  // 오른쪽 → 왼쪽(원래 자리 기준으로 정렬 복귀)
  rightListEl.querySelectorAll('.item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const k = el.dataset.k;
      const i = right.indexOf(k);
      if (i > -1){
        right.splice(i,1);
        left.push(k);
        // 왼쪽은 초기 인덱스 순으로 재정렬
        left.sort((a,b)=> (keyToInitialIndex.get(a) ?? 999) - (keyToInitialIndex.get(b) ?? 999));
        render();
      }
    });
  });
}
render();

/* ---------- 동작 ---------- */
btnReset.addEventListener('click', ()=>{
  const recent = getSavedOrder() || defaultOrder();
  left  = recent.slice(); // 모두 왼쪽
  right = [];
  // 초기 인덱스 맵 갱신 (최근 상태 기준으로 돌아가게)
  keyToInitialIndex.clear();
  recent.forEach((k,i)=> keyToInitialIndex.set(k,i));
  render();
  msgEl.textContent = '최근 적용된 순서로 리셋되었습니다.';
});

btnConfirm.addEventListener('click', ()=>{
  // 새 순서 = 오른쪽(사용자 지정) + 왼쪽(남은 것들)
  const finalOrder = right.concat(left);
  saveOrder(finalOrder);
  msgEl.textContent = '저장 완료! 적용 중…';
  // index로 이동
  location.href = 'index.html';
});
