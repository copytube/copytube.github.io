// js/manage-uploads.js (v1.2.1)
/* - 내 영상 목록(본인 uid) 조회 + 무한/더보기 + 검색
   - 카테고리 수정(최대 3개, personal 제외) + 단건/다건 삭제
   - 인덱스 없을 경우 client-sort로 폴백               */
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
btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName||'회원'}님` : '');
  if (!loggedIn) location.href='signin.html';
});

/* ---------- 유틸 ---------- */
const $ = s=>document.querySelector(s);
const list   = $('#list');
const msg    = $('#msg');
const more   = $('#more');
const btnMore= $('#btnMore');
const qbox   = $('#q');
const btnReload = $('#btnReload');
const btnDeleteSel = $('#btnDeleteSel');

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
  return values.map(v=>`<span class=\"chip\">${valueToLabel.get(v)||v}</span>`).join('');
}
function rowEl(docId, v){
  const id = extractId(v.url);
  const el = document.createElement('div');
  el.className='row';
  el.dataset.id = docId;
  el.innerHTML = \`
    <div class="sel"><input type="checkbox" class="selbox"/></div>
    <div class="info">
      <div class="title" title="\${v.title||''}">\${v.title || '(제목없음)'}</div>
      <div class="url" title="\${v.url||''}">\${v.url||''}</div>
      <div class="cats">\${catChips(v.categories||[])}</div>
    </div>
    <div class="bottom">
      <div class="thumb">
        <a href="\${v.url}" target="_blank" rel="noopener">
          <img src="https://i.ytimg.com/vi/\${id}/mqdefault.jpg" alt="thumb"/>
        </a>
      </div>
      <div class="actions">
        <button class="btn" data-act="edit">카테고리변환</button>
        <button class="btn btn-danger" data-act="del">삭제</button>
      </div>
    </div>
  \`;
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
  const q = (qbox.value||'').trim().toLowerCase();
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
  msg.textContent = '불러오는 중...';
  try{
    // 선호: uid where + createdAt desc
    const base = collection(db,'videos');
    const parts = [ where('uid','==', curUser.uid), orderBy('createdAt','desc'), limit(PAGE_SIZE) ];
    const snap = await getDocs(query(base, ...parts));
    appendSnap(snap);
  }catch(e){
    // 인덱스 없으면 폴백: where(uid==)만 가져와서 클라 정렬
    console.warn('[manage-uploads] index fallback:', e?.message||e);
    usingClientFallback = true;
    const snap = await getDocs(query(collection(db,'videos'), where('uid','==', curUser.uid)));
    const arr = snap.docs.map(d=>({ id:d.id, data:d.data(), _created:(d.data().createdAt?.toMillis?.()||0) }));
    arr.sort((a,b)=> b._created - a._created);
    cache = arr;
    cache.forEach(x => list.appendChild(rowEl(x.id, x.data)));
    hasMore = false; // 한 번에 다 가져왔으므로
  }finally{
    msg.textContent = cache.length ? '' : '등록한 영상이 없습니다.';
    applyFilter();
  }
}

function appendSnap(snap){
  if(snap.empty){ hasMore=false; return; }
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

/* ---------- 카테고리 편집 ---------- */
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
      return \`<label><input type="checkbox" class="cat" value="\${c.value}" \${on}> \${c.label}</label>\`;
    }).join('');
    return \`
      <fieldset class="group" data-key="\${g.key}">
        <legend>\${g.label}</legend>
        <div class="child-grid">\${kids}</div>
      </fieldset>
    \`;
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
        alert(\`카테고리는 최대 \${limit}개까지 선택 가능합니다.\`);
      }
    });
  });
}

function openEdit(docId, curCats){
  editTargetId = docId;
  renderEditCats(curCats);
  editBackdrop.classList.add('show');
  editBackdrop.setAttribute('aria-hidden','false');
}
function closeEdit(){
  editBackdrop.classList.remove('show');
  editBackdrop.setAttribute('aria-hidden','true');
  editTargetId = null;
}

btnEditCancel?.addEventListener('click', closeEdit);
editBackdrop?.addEventListener('click', (e)=>{ if(e.target===editBackdrop) closeEdit(); });
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
  if(!confirm(\`선택한 \${ids.length}개 항목을 삭제할까요?\`)) return;
  let ok=0, fail=0;
  for(const id of ids){
    try{ await deleteDoc(doc(db,'videos', id)); ok++; }catch{ fail++; }
  }
  // 캐시/화면 반영
  cache = cache.filter(x => !ids.includes(x.id));
  applyFilter();
  alert(\`삭제 완료: 성공 \${ok}건, 실패 \${fail}건\`);
});

/* ---------- 이벤트 ---------- */
btnMore?.addEventListener('click', loadMore);
btnReload?.addEventListener('click', loadInit);
qbox?.addEventListener('input', applyFilter);

/* ---------- 시작 ---------- */
onAuthStateChanged(auth, (user)=>{ if(user) loadInit(); });
