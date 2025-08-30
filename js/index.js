// js/index.js (v1.8.0)
import { CATEGORY_GROUPS } from './categories.js?v=1.5.1';
import { auth } from './firebase-init.js?v=1.5.1';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=1.5.1';

const GROUP_ORDER_KEY = 'groupOrderV1';
const isPersonalVal = (v)=> v==='personal1' || v==='personal2';

// helper: "전체선택"에서 제외할 그룹 키
const EXCLUDED_GROUPS_FOR_ALL = new Set(['personal','series']);

/* ---------- group order ---------- */
function applyGroupOrder(groups){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(GROUP_ORDER_KEY) || 'null'); }catch{}
  const order = Array.isArray(saved) && saved.length ? saved : groups.map(g=>g.key);
  const idx = new Map(order.map((k,i)=>[k,i]));
  return groups.slice().sort((a,b)=>(idx.get(a.key)??999) - (idx.get(b.key)??999));
}

/* ---------- personal labels (local) ---------- */
function getPersonalLabels(){
  try { return JSON.parse(localStorage.getItem('personalLabels') || '{}'); }
  catch { return {}; }
}

/* ---------- topbar ---------- */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnAbout     = document.getElementById("btnAbout");
const btnOrder     = document.getElementById("btnOrder");
const brandHome    = document.getElementById("brandHome");

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen=false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"),180); }

onAuthStateChanged(auth,(user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click",(e)=> e.stopPropagation());
btnMyUploads ?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnOrder     ?.addEventListener("click", ()=>{ location.href = "category-order.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if(!auth.currentUser){ location.href='signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
brandHome    ?.addEventListener("click",(e)=>{ e.preventDefault(); window.scrollTo({top:0,behavior:"smooth"}); });

/* ---------- cats ---------- */
const catsBox      = document.getElementById("cats");
const btnWatch     = document.getElementById("btnWatch");
const cbAutoNext   = document.getElementById("cbAutoNext");
const cbToggleAll  = document.getElementById("cbToggleAll");
const catTitleBtn  = document.getElementById("btnOpenOrder");

function renderGroups(){
  const groups = applyGroupOrder(CATEGORY_GROUPS);
  const personalLabels = getPersonalLabels();

  const html = groups.map(g=>{
    const isPersonalGroup = g.key==='personal';

    // children with personal label override
    const kids = g.children.map(c=>{
      const labelText = isPersonalGroup && personalLabels[c.value]
        ? personalLabels[c.value]
        : c.label;
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}</label>`;
    }).join('');

    // legend: personal has no parent checkbox + "(로컬저장소)" 유지
    const legendHTML = isPersonalGroup
      ? `<legend><span style="font-weight:800;">${g.label}</span> <span class="muted">(로컬저장소)</span></legend>`
      : `<legend>
           <label class="group-toggle">
             <input type="checkbox" class="group-check" data-group="${g.key}" />
             <span>${g.label}</span>
           </label>
         </legend>`;

    // 안내문은 "아래"로
    const noteHTML = isPersonalGroup
      ? `<div class="muted" style="margin:6px 4px 2px;">개인자료는 <b>단독 재생만</b> 가능합니다.</div>`
      : '';

    return `
      <fieldset class="group" data-key="${g.key}">
        ${legendHTML}
        <div class="child-grid">${kids}</div>
        ${noteHTML}
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;
  bindGroupInteractions();
}
renderGroups();

/* ---------- parent/child sync ---------- */
function setParentStateByChildren(groupEl){
  const parent   = groupEl.querySelector('.group-check');
  if (!parent) return; // personal: no parent toggle
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  const total = children.length;
  const checked = children.filter(c => c.checked).length;
  if (checked===0){ parent.checked=false; parent.indeterminate=false; }
  else if (checked===total){ parent.checked=true; parent.indeterminate=false; }
  else { parent.checked=false; parent.indeterminate=true; }
}
function setChildrenByParent(groupEl,on){
  groupEl.querySelectorAll('input.cat').forEach(c=> c.checked = !!on);
}
function refreshAllParentStates(){
  catsBox.querySelectorAll('.group').forEach(setParentStateByChildren);
}
function computeAllSelected(){
  // 전체선택 비교는 personal/series 제외
  const real = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]):not([data-key="series"]) input.cat'));
  return real.length>0 && real.every(c=>c.checked);
}
let allSelected=false;

function bindGroupInteractions(){
  // parent toggles (not for personal)
  catsBox.querySelectorAll('.group-check').forEach(parent=>{
    const groupKey = parent.getAttribute('data-group');
    if (groupKey === 'personal') return;
    parent.addEventListener('change', ()=>{
      const groupEl = parent.closest('.group');
      setChildrenByParent(groupEl, parent.checked);
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;

      // deselect personals if any were on
      catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
    });
  });

  // child toggles
  catsBox.querySelectorAll('input.cat').forEach(child=>{
    child.addEventListener('change', ()=>{
      const v = child.value;
      const isPersonal = isPersonalVal(v);

      if (isPersonal && child.checked){
        // personal = single-mode: clear others
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat').forEach(c=>{ if(c!==child) c.checked=false; });
        catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat:checked').forEach(c=> c.checked=false);
      }
      if (!isPersonal && child.checked){
        // selecting normal → clear personals
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
      }

      const groupEl = child.closest('.group');
      setParentStateByChildren(groupEl);
      refreshAllParentStates();

      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
    });
  });
}

/* ---------- select all & load saved ---------- */
function selectAll(on){
  // 일반 카테고리 전체 on/off (personal/series 제외)
  catsBox
    .querySelectorAll('.group:not([data-key="personal"]):not([data-key="series"]) input.cat')
    .forEach(b => { b.checked = !!on; });

  // ✅ 전체선택 시 personal/series는 항상 해제
  catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked, .group[data-key="series"] input.cat:checked')
    .forEach(c => { c.checked = false; });

  refreshAllParentStates();
  allSelected = !!on;
  if (cbToggleAll) cbToggleAll.checked = allSelected;
}
function applySavedSelection(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('selectedCats')||'null'); }catch{}
  if (!saved || saved==="ALL"){ selectAll(true); }
  else{
    selectAll(false);
    const set = new Set(saved);
    catsBox.querySelectorAll('.cat').forEach(ch=>{ if (set.has(ch.value)) ch.checked=true; });
    // guard: personal single-mode
    const personals = Array.from(catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked'));
    const normals   = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat:checked'));
    if (personals.length >= 1 && normals.length >= 1){
      personals.forEach(c=> c.checked=false);
    }else if (personals.length >= 2){
      personals.slice(1).forEach(c=> c.checked=false);
    }
    refreshAllParentStates();
  }
  const auto = localStorage.getItem('autonext')==='on';
  if (cbAutoNext) cbAutoNext.checked = auto;
}
applySavedSelection();

cbToggleAll?.addEventListener('change', ()=> selectAll(!!cbToggleAll.checked));

/* ---------- go watch ---------- */
btnWatch?.addEventListener('click', ()=>{
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const personals = selected.filter(isPersonalVal);
  const normals   = selected.filter(v=> !isPersonalVal(v));

  // personal-only
  if (personals.length === 1 && normals.length === 0){
    localStorage.setItem('selectedCats', JSON.stringify(personals));
    localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
    try{ sessionStorage.setItem('nav_from','index'); }catch{}
    location.href = `watch.html?cats=${encodeURIComponent(personals[0])}`;
    return;
  }

  // normal only (no personals mixed)
  const isAll = computeAllSelected(); // personal/series 제외 기준으로 판정
  const valueToSave = (normals.length===0 || isAll) ? "ALL" : normals;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? 'on' : 'off');
  try{ sessionStorage.setItem('nav_from','index'); }catch{}
  location.href = 'watch.html';
});

catTitleBtn?.addEventListener('click', ()=> location.href='category-order.html');

/* ---------- storage listener: other-tab updates ---------- */
window.addEventListener('storage', (e)=>{
  if (e.key === 'personalLabels' || e.key === 'groupOrderV1') {
    renderGroups();
    applySavedSelection();
  }
});

/* ===================== */
/* Interactive Edge Swipe + CSS inject (v1.8.0) */
/* ===================== */
(function injectSlideCSS(){
  if (document.getElementById('slide-css-180')) return;
  const style = document.createElement('style');
  style.id = 'slide-css-180';
  style.textContent = `
@keyframes pageSlideLeft { from { transform: translateX(0); opacity:1; } to { transform: translateX(-22%); opacity:.92; } }
@keyframes pageSlideRight{ from { transform: translateX(0); opacity:1; } to { transform: translateX(22%);  opacity:.92; } }
:root.slide-out-left  body { animation: pageSlideLeft 0.26s ease-out forwards; }
:root.slide-out-right body { animation: pageSlideRight 0.26s ease-out forwards; }
@media (prefers-reduced-motion: reduce){
  :root.slide-out-left  body,
  :root.slide-out-right body { animation:none; }
}
html, body { overscroll-behavior-x: contain; }
`;
  document.head.appendChild(style);
})();

function initInteractiveEdgeSwipe({ leftHref=null, rightHref=null } = {}){
  let tracking=false, edgeSide=null;
  let sx=0, sy=0, dx=0, dy=0, t0=0, dominated=false;

  const EDGE_PX   = 18;                    // 엣지 감지 폭
  const THRESH_X  = 80;                    // 내비게이션 임계값(px)
  const MAX_OFF_Y = 80;                    // 수직 허용 오차(px)
  const MAX_TIME  = 700;                   // 제스처 최대 시간(ms)
  const MAX_DRAG  = Math.round(window.innerWidth * 0.28); // 드래그 시 최대 이동(px)
  const FINISH    = Math.round(window.innerWidth * 0.22); // 성공 시 마무리 이동(px)

  const $root = document.documentElement;
  const $body = document.body;

  function setTransform(x){
    $body.style.transform = `translateX(${x}px)`;
  }
  function clearTransform(withBounce=false, to=0, ms=200){
    if (withBounce){
      $body.style.transition = `transform ${ms}ms ease-out`;
      setTransform(to);
      setTimeout(()=>{ $body.style.transition=''; setTransform(0); }, ms);
    }else{
      $body.style.transition = `transform ${ms}ms ease-out`;
      setTransform(to);
      setTimeout(()=>{ $body.style.transition=''; setTransform(0); }, ms);
    }
  }
  function finishAndGo(toHref, direction){ // direction: 'left' | 'right'
    // direction 'left' → 페이지가 왼쪽으로 미끄러져 나감 (upload로)
    // direction 'right' → 페이지가 오른쪽으로 미끄러져 나감 (list로)
    const target = (direction==='left') ? -FINISH : +FINISH;
    $body.style.transition = `transform 220ms ease-out`;
    setTransform(target);
    setTimeout(()=>{
      // 추가로 클래스 애니메이션을 원하는 경우(보조)
      if(direction==='left'){ $root.classList.add('slide-out-left'); }
      else{ $root.classList.add('slide-out-right'); }
      location.href = toHref;
    }, 220);
  }

  function getPoint(e){ return e.touches?.[0] || e.changedTouches?.[0] || e; }

  function onStart(e){
    const p = getPoint(e);
    sx = p.clientX; sy = p.clientY; dx=0; dy=0; dominated=false;
    t0 = Date.now();
    edgeSide = null; tracking = false;

    if (sx <= EDGE_PX){ edgeSide='left'; tracking = true; }
    else if (innerWidth - sx <= EDGE_PX){ edgeSide='right'; tracking = true; }
    else { return; }

    // 드래그 중심 감각(선택)
    $body.style.willChange = 'transform';
    $body.style.transformOrigin = `${(sx / innerWidth) * 100}% 50%`;
  }

  function onMove(e){
    if(!tracking) return;
    const p = getPoint(e);
    dx = p.clientX - sx;
    dy = p.clientY - sy;

    // 수직 이동이 커지면 취소
    if (Math.abs(dy) > MAX_OFF_Y){ cancel(); return; }

    // 방향 판정(좌엣지→오른쪽, 우엣지→왼쪽만 허용)
    let drag = 0;
    if (edgeSide==='left'){
      if (dx < 0){ drag = 0; } else { drag = Math.min(dx, MAX_DRAG); }
    }else if (edgeSide==='right'){
      if (dx > 0){ drag = 0; } else { drag = Math.max(dx, -MAX_DRAG); }
    }
    // 화면과 함께 살짝 움직이기
    if (Math.abs(drag) > 2){
      e.preventDefault(); // 수평 드래그 우선
      setTransform(drag);
    }
  }

  function onEnd(e){
    if(!tracking) return;
    tracking=false;
    $body.style.willChange = '';

    const dt = Date.now() - t0;
    if (Math.abs(dy) > MAX_OFF_Y || dt > MAX_TIME){
      clearTransform(true, 0, 160);
      return;
    }

    // 성공 임계 체크
    if (edgeSide==='right' && dx <= -THRESH_X && rightHref){
      finishAndGo(rightHref, 'left');   // 오른→왼 → upload
      return;
    }
    if (edgeSide==='left' && dx >= THRESH_X && leftHref){
      finishAndGo(leftHref, 'right');   // 왼→오 → list
      return;
    }

    // 실패: 원위치
    clearTransform(true, 0, 160);
  }

  function cancel(){
    tracking=false;
    $body.style.willChange = '';
    clearTransform(true, 0, 120);
  }

  // touch + pointer
  document.addEventListener('touchstart', onStart, {passive:true});
  document.addEventListener('touchmove',  onMove,  {passive:false});
  document.addEventListener('touchend',   onEnd,   {passive:true});
  document.addEventListener('touchcancel',cancel,  {passive:true});

  document.addEventListener('pointerdown',onStart, {passive:true});
  document.addEventListener('pointermove', onMove, {passive:false});
  document.addEventListener('pointerup',   onEnd,  {passive:true});
  document.addEventListener('pointercancel',cancel,{passive:true});
}

// Index: 왼→오(좌엣지) → list.html ,  오른→왼(우엣지) → upload.html
initInteractiveEdgeSwipe({ leftHref: 'list.html', rightHref: 'upload.html' });

// End of js/index.js (v1.8.0)
