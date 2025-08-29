// js/manage-uploads.js (v1.2.6)
// - v1.2 레이아웃 유지
// - 로그인 유지(세션 복원) 보강: 최초 onAuthStateChanged만 신뢰 + 안전 타이머
// - 모달 스크롤 픽스: 내부 스크롤, 배경 잠금, 백드롭 스크롤 차단
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter,
  deleteDoc, doc, updateDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js';

/* ---------- 상단바 ---------- */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnAbout     = document.getElementById("btnAbout");

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown?.classList.remove("hidden"); requestAnimationFrame(()=> dropdown?.classList.add("show")); }
function closeDropdown(){ isMenuOpen=false; dropdown?.classList.remove("show"); setTimeout(()=> dropdown?.classList.add("hidden"),180); }
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden")?openDropdown():closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());
btnAbout?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnGoUpload?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ try{ await fbSignOut(auth); }catch{} closeDropdown(); });

/* ---------- 유틸 ---------- */
const $ = s=>document.querySelector(s);
const list   = $('#list');
const msg    = $('#msg');
const more   = $('#more');
const btnMore= $('#btnMore');
const qbox   = $('#q');
const btnReload = $('#btnReload');
const btnDeleteSel = $('#btnDeleteSel');

function setStatus(text){ if(msg) msg.textContent = text || ''; }
function extractId(url){ const m=String(url||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&\/]+)/); return m?m[1]:''; }

/* 카테고리 라벨 맵 */
const valueToLabel = (()=> {
  const m = new Map();
  CATEGORY_GROUPS.forEach(g => g.children.forEach(c => m.set(c.value, c.label)));
  return m;
})();

/* ---------- 목록 상태 ---------- */
const PAGE_SIZE = 20;
let curUser = null;
let lastDoc = null;
let hasMore = true;
let isLoading = false;
let cache = [];        // 화면에 적재된 전체(검색용)
let usingClientFallback = false; // 인덱스 폴백 여부

/* ---------- 목록 렌더 ---------- */
function catChips(values=[]){
  return values.map(v=>`<span class="chip">${valueToLabel.get(v)||v}</span>`).join('');
}
function rowEl(docId, v){
  const id = extractId(v.url);
  const el = document.createElement('div');
  el.className='row';
  el.dataset.id = docId;
  el.innerHTML = `
    <label class="sel"><input type="checkbox" class="selbox"/></label>
    <a class="thumb" href="${v.url}" target="_blank" rel="noopener">
      <img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="thumb"/>
    </a>
    <div class="meta">
      <div class="title" title="${v.title||''}">${v.title || '(제목없음)'}</div>
      <div class="url" title="${v.url||''}">${v.url||''}</div>
      <div class="cats">${catChips(v.categories||[])}</div>
    </div>
    <div class="right">
      <button class="btn" data-act="edit">카테고리</button>
      <button class="btn btn-danger" data-act="del">삭제</button>
    </div>
  `;
  // 핸들러
  el.querySelector('[data-act="del"]')?.addEventListener('click', async ()=>{
    if(!confirm('이 영상을 삭제할까요?')) return;
    try{
      await deleteDoc(doc(db,'videos', docId));
      el.remove();
      cache = cache.filter(x => x.id !== docId);
    }catch(e){ alert('삭제 실패: '+(e.message||e)); }
  });
  el.querySelector('[data-act="edit"]')?.addEventListener('click', ()=> openEdit(docId, v.categories||[]));
  return el;
}

function applyFilter(){
  const q = (qbox?.value||'').trim().toLowerCase();
  list.innerHTML = '';
  const rows = !q ? cache : cache.filter(x=>{
    const t = (x.data.title||'').toLowerCase();
    const u = (x.data.url||'').toLowerCase();
    return t.includes(q) || u.includes(q);
  });
  rows.forEach(x => list.appendChild(rowEl(x.id, x.data)));
  more.style.display = hasMore && !q ? '' : 'none';
}

/* ---------- 로딩 ---------- */
async function loadInit(){
  if(!auth.currentUser) return;
  curUser = auth.currentUser;
  cache = []; list.innerHTML=''; lastDoc=null; hasMore=true; usingClientFallback=false;
  setStatus('불러오는 중...');
  try{
    // 선호: uid where + createdAt desc
    const base = collection(db,'videos');
    const parts = [ where('uid','==', curUser.uid), orderBy('createdAt','desc'), limit(PAGE_SIZE) ];
    const snap = await getDocs(query(base, ...parts));
    appendSnap(snap);
  }catch(e){
    console.warn('[manage-uploads] index fallback:', e?.message||e);
    usingClientFallback = true;
    const snap = await getDocs(query(collection(db,'videos'), where('uid','==', curUser.uid)));
    const arr = snap.docs.map(d=>({ id:d.id, data:d.data(), _created:(d.data().createdAt?.toMillis?.()||0) }));
    arr.sort((a,b)=> b._created - a._created);
    cache = arr;
    cache.forEach(x => list.appendChild(rowEl(x.id, x.data)));
    hasMore = false; // 한 번에 다 가져왔으므로
  }finally{
    setStatus(cache.length ? `총 ${cache.length}개 불러옴` : '등록한 영상이 없습니다.');
    applyFilter();
  }
}

function appendSnap(snap){
  if(snap.empty){ hasMore=false; setStatus(cache.length ? `총 ${cache.length}개 불러옴` : '등록한 영상이 없습니다.'); return; }
  snap.docs.forEach(d => cache.push({ id:d.id, data:d.data() }));
  lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
  if(snap.size < PAGE_SIZE) hasMore=false;
  applyFilter();
}

async function loadMore(){
  if(isLoading || !hasMore || usingClientFallback) return;
  isLoading = true;
  try{
    const base = collection(db,'videos');
    const parts = [ where('uid','==', curUser.uid), orderBy('createdAt','desc'), startAfter(lastDoc), limit(PAGE_SIZE) ];
    const snap = await getDocs(query(base, ...parts));
    appendSnap(snap);
  }catch(e){
    console.error(e);
    hasMore=false;
  }finally{
    isLoading=false;
  }
}

/* ---------- 카테고리 편집 (모달 스크롤 픽스 포함) ---------- */
const editBackdrop = document.getElementById('editBackdrop');
const editCatsBox  = document.getElementById('editCats');
const btnEditSave  = document.getElementById('btnEditSave');
const btnEditCancel= document.getElementById('btnEditCancel');

let editTargetId = null;

function applyGroupOrder(groups){
  let saved=null; try{ saved = JSON.parse(localStorage.getItem('groupOrderV1') || 'null'); }catch{}
  const order = Array.isArray(saved)&&saved.length ? saved : groups.map(g=>g.key);
  const idx = new Map(order.map((k,i)=>[k,i]));
  return groups.slice().sort((a,b)=>(idx.get(a.key)??999)-(idx.get(b.key)??999));
}

function renderEditCats(selected){
  const groups = applyGroupOrder(CATEGORY_GROUPS)
    .filter(g => g.key!=='personal'); // 개인자료 제외(서버 저장 X)

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const on = selected.includes(c.value) ? 'checked' : '';
      return `<label style="display:flex; gap:6px; align-items:center; background:#0b0b0b; border:1px solid #2a2a2a; border-radius:8px; padding:6px 8px;">
                <input type="checkbox" class="cat" value="${c.value}" ${on}> ${c.label}
              </label>`;
    }).join('');
    return `
      <fieldset class="group" data-key="${g.key}" style="border:1px solid var(--border); border-radius:10px; background:#101010; padding:8px; margin:6px 0;">
        <legend style="padding:0 4px; font-weight:800; font-size:14px; color:#eee;">${g.label}</legend>
        <div class="child-grid" style="display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:6px; margin-top:6px;">${kids}</div>
      </fieldset>
    `;
  }).join('');
  editCatsBox.innerHTML = html;

  // 최대 3개 제한
  const limit=3;
  const boxes = Array.from(editCatsBox.querySelectorAll('input.cat'));
  boxes.forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const count = boxes.filter(b=> b.checked).length;
      if(count > limit){
        chk.checked = false;
        alert(`카테고리는 최대 ${limit}개까지 선택 가능합니다.`);
      }
    });
  });
}

function openEdit(docId, curCats){
  editTargetId = docId;
  renderEditCats(curCats);
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
  editBackdrop.classList.add('show');
  editBackdrop.setAttribute('aria-hidden','false');
}
function closeEdit(){
  editBackdrop.classList.remove('show');
  editBackdrop.setAttribute('aria-hidden','true');
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  editTargetId = null;
}

btnEditCancel?.addEventListener('click', closeEdit);
editBackdrop?.addEventListener('click', (e)=>{ if(e.target===editBackdrop) closeEdit(); });
// 백드롭에서의 바깥 스크롤 차단(PC/모바일)
function preventBgScroll(e){ if(e.target===editBackdrop){ e.preventDefault(); } }
editBackdrop?.addEventListener('wheel', preventBgScroll, {passive:false});
editBackdrop?.addEventListener('touchmove', preventBgScroll, {passive:false});

btnEditSave?.addEventListener('click', async ()=>{
  if(!editTargetId) return;
  const sel = Array.from(editCatsBox.querySelectorAll('input.cat:checked')).map(b=>b.value);
  try{
    await updateDoc(doc(db,'videos', editTargetId), { categories: sel });
    // 캐시 갱신 + UI 갱신
    const item = cache.find(x => x.id === editTargetId);
    if(item){ item.data.categories = sel; }
    applyFilter();
    closeEdit();
  }catch(e){ alert('저장 실패: ' + (e.message||e)); }
});

/* ---------- 선택 삭제 ---------- */
btnDeleteSel?.addEventListener('click', async ()=>{
  const ids = Array.from(document.querySelectorAll('.row .selbox:checked'))
    .map(cb => cb.closest('.row')?.dataset.id).filter(Boolean);
  if(ids.length===0){ alert('선택된 항목이 없습니다.'); return; }
  if(!confirm(`선택한 ${ids.length}개 항목을 삭제할까요?`)) return;
  let ok=0, fail=0;
  for(const id of ids){
    try{ await deleteDoc(doc(db,'videos', id)); ok++; }catch{ fail++; }
  }
  // 캐시/화면 반영
  cache = cache.filter(x => !ids.includes(x.id));
  applyFilter();
  alert(`삭제 완료: 성공 ${ok}건, 실패 ${fail}건`);
});

/* ---------- 시작(로그인 유지 보강) ---------- */
let _authFirstHandled = false;
let _authFallbackTimer = null;

document.addEventListener('DOMContentLoaded', ()=>{
  setStatus('로그인 상태 확인 중...');
  // 안전 타이머: onAuthStateChanged가 늦거나 유실된 경우 대비
  _authFallbackTimer = setTimeout(()=>{
    try{
      if(!_authFirstHandled && auth.currentUser){
        _authFirstHandled = true;
        loadInit();
      }else if(!_authFirstHandled){
        // 여전히 비로그인이라면 안내만
        if(msg){
          msg.innerHTML = `<span style="color:#ffb4b4;font-weight:700;">로그인이 필요합니다.</span>
            <a href="signin.html" class="btn" style="background:#4ea1ff; border:0; font-weight:800; margin-left:8px;">로그인하기</a>`;
        }
      }
    }catch(e){ console.error(e); }
  }, 1800); // 1.8s 정도 대기 후 폴백
});

onAuthStateChanged(auth, (user)=>{
  try{
    const loggedIn = !!user;
    signupLink?.classList.toggle('hidden', loggedIn);
    signinLink?.classList.toggle('hidden', loggedIn);
    welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user?.displayName||'회원'}님` : '');

    if(_authFirstHandled) return;      // 최초 이벤트만 신뢰
    _authFirstHandled = true;
    clearTimeout(_authFallbackTimer);

    if (loggedIn) {
      loadInit();
    } else {
      if(msg){
        msg.innerHTML = `<span style="color:#ffb4b4;font-weight:700;">로그인이 필요합니다.</span> 
          <a href="signin.html" class="btn" style="background:#4ea1ff; border:0; font-weight:800; margin-left:8px;">로그인하기</a>`;
      }
    }
  }catch(e){
    console.error(e);
    setStatus('인증 처리 오류: '+(e.message||e));
  }
});
