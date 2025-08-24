// js/category-order.js
import { CATEGORY_GROUPS } from './categories.js?v=20250820';
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';

/* ---------- 상단바 ---------- */
const $ = s => document.querySelector(s);
const signupLink   = $('#signupLink');
const signinLink   = $('#signinLink');
const welcome      = $('#welcome');
const menuBtn      = $('#menuBtn');
const dropdown     = $('#dropdownMenu');
const btnSignOut   = $('#btnSignOut');
const btnGoUpload  = $('#btnGoUpload');
const btnMyUploads = $('#btnMyUploads');
const btnAbout     = $('#btnAbout');
const brandHome    = $('#brandHome');

let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ isMenuOpen = false; dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'), 180); }
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "");
  closeDropdown();
});
menuBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown?.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());
btnMyUploads ?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); location.href = "index.html"; });

/* ---------- 순서 상태 ---------- */
const DEFAULT_ORDER = CATEGORY_GROUPS.map(g=>g.key);
function readOrderRaw(){
  try { return JSON.parse(localStorage.getItem('categoryOrder') || 'null'); }
  catch { return null; }
}
function normalizeOrder(raw){
  const known = new Set(DEFAULT_ORDER);
  let arr = Array.isArray(raw) ? raw.filter(k=>known.has(k)) : [];
  DEFAULT_ORDER.forEach(k=>{ if(!arr.includes(k)) arr.push(k); });
  return arr;
}
function saveOrder(arr){
  try{ localStorage.setItem('categoryOrder', JSON.stringify(arr)); }catch{}
}

/* ---------- UI 리스트 ---------- */
const leftList  = $('#leftList');
const rightList = $('#rightList');
const btnReset  = $('#btnReset');
const btnApply  = $('#btnApply');

// 기준 순서(페이지 진입 시점) — 리셋할 때 이걸로 복귀
const baseline = normalizeOrder(readOrderRaw());

// 동적 상태
let left  = baseline.slice(); // 왼쪽에 남아있는 키들 (현재 상태)
let right = [];               // 오른쪽으로 보낸 키들 (현재 상태)

/* 원래 위치로 되돌릴 때, '기준 순서' 내 상대 위치 유지 삽입 */
function moveRight(key){
  const i = left.indexOf(key);
  if (i>-1){ left.splice(i,1); right.push(key); render(); }
}
function moveLeft(key){
  const j = right.indexOf(key);
  if (j>-1){
    right.splice(j,1);
    // baseline에서 이 key 다음으로 오는, 아직 LEFT에 남아있는 첫 키를 찾아 그 앞에 삽입
    const afterKeys = baseline.slice(baseline.indexOf(key)+1);
    let insertIdx = left.length;
    for (const k of afterKeys){
      const p = left.indexOf(k);
      if (p>-1){ insertIdx = p; break; }
    }
    left.splice(insertIdx, 0, key);
    render();
  }
}

function render(){
  leftList.innerHTML  = left .map(k => itemHTML(k)).join('');
  rightList.innerHTML = right.map(k => itemHTML(k)).join('');

  leftList.querySelectorAll('.item').forEach(el=>{
    el.addEventListener('click', ()=> moveRight(el.dataset.key));
  });
  rightList.querySelectorAll('.item').forEach(el=>{
    el.addEventListener('click', ()=> moveLeft(el.dataset.key));
  });
}
function labelOf(key){
  const g = CATEGORY_GROUPS.find(x=>x.key===key);
  return g ? g.label : key;
}
function itemHTML(key){
  return `<div class="item" data-key="${key}">${labelOf(key)}</div>`;
}

btnReset.addEventListener('click', ()=>{
  // 최근 저장된 순서(= baseline) 기준으로 모두 LEFT로
  left  = baseline.slice();
  right = [];
  render();
});
btnApply.addEventListener('click', ()=>{
  const finalOrder = right.concat(left);
  saveOrder(finalOrder);
  // 적용 후 index로 이동
  location.href = 'index.html';
});

// 초기도면
render();
