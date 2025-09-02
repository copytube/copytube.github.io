// js/manage-uploads.js (목록1.3, v1.3.3-secure)
// - Firestore 규칙 대응: ownerUid 기준 쿼리로 통일
// - 업데이트 시 금지 필드 미전송(ownerUid/status)
// - DOM 출력 안전화(textContent), oEmbed 백필은 본인 문서에서만 수행
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
const btnSearch = $('#btnSearch');
const btnDeleteSel = $('#btnDeleteSel');

function setStatus(text){ if(msg) msg.textContent = text || ''; }
function extractId(url){ const m=String(url||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&\/]+)/); return m?m[1]:''; }

/* 카테고리 라벨 맵 */
const valueToLabel = (()=> {
  const m = new Map();
  CATEGORY_GROUPS.forEach(g => g.children.forEach(c => m.set(c.value, c.label)));
  return m;
})();

/* ---------- 제목 가져오기(oEmbed) + 백필 ---------- */
async function fetchTitle(url){
  try{
    const id = extractId(url);
    const u  = id ? ('https://www.youtube.com/watch?v=' + id) : url;
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u));
    if(!res.ok) throw new Error('oEmbed ' + res.status);
    const data = await res.json();
    return (data?.title || '').slice(0, 200);
  }catch(e){ console.warn('[manage-uploads] fetchTitle 실패:', e); return ''; }
}
async function ensureTitle(elRow, docId, v){
  if(v.title) return;
  const t = await fetchTitle(v.url);
  if(!t) return;
  try{
    // 본인 문서에서만 호출되므로 규칙 충족(소유자 고정)
    await updateDoc(doc(db,'videos', docId), { title: t });
    const item = cache.find(x => x.id === docId);
    if(item){ item.data.title = t; }
    const titleEl = elRow.querySelector('.title');
    titleEl.replaceChildren(document.createTextNode(t));
  }catch(e){ console.warn('[manage-uploads] title 백필 실패:', e); }
}

/* ---------- 목록 상태 ---------- */
const PAGE_SIZE = 20;
let curUser = null;
let lastDoc = null;
let hasMore = true;
let isLoading = false;
let cache = [];
let usingClientFallback = false;

/* ---------- DOM 안전 생성 ---------- */
function catChips(values=[]){
  const wrap = document.createElement('span');
  values.forEach(v=>{
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = valueToLabel.get(v) || v;
    wrap.appendChild(chip);
  });
  return wrap.childNodes; // NodeList-like
}

function rowEl(docId, v){
  const id = extractId(v.url);
  const el = document.createElement('div');
  el.className='row';
  el.dataset.id = docId;

  // 구조
  const sel = document.createElement('label');
  sel.className = 'sel';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'selbox';
  sel.appendChild(cb);

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = v.title || '(제목없음)';

  const url = document.createElement('div');
  url.className = 'url';
  url.textContent = v.url || '';

  const cats = document.createElement('div');
  cats.className = 'cats';
  const chips = catChips(v.categories||[]);
  chips.forEach(node => cats.appendChild(node));

  const a = document.createElement('a');
  a.className = 'thumb';
  a.target = '_blank';
  a.rel = 'noopener';
  a.href = v.url || '#';
  const img = document.createElement('img');
  img.alt = 'thumb';
  if (id) img.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  a.appendChild(img);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const btnCat = document.createElement('button');
  btnCat.className = 'btn btn-cat';
  btnCat.dataset.act = 'edit';
  btnCat.textContent = '카테고리';
  const btnDel = document.createElement('button');
  btnDel.className = 'btn btn-danger';
  btnDel.dataset.act = 'del';
  btnDel.textContent = '삭제';
  actions.appendChild(btnCat);
  actions.appendChild(btnDel);

  el.appendChild(sel);
  el.appendChild(title);
  el.appendChild(url);
  el.appendChild(cats);
  el.appendChild(a);
  el.appendChild(actions);

  // 핸들러
  btnDel.addEventListener('click', async ()=>{
    if(!confirm('이 영상을 삭제할까요?')) return;
    try{
      await deleteDoc(doc(db,'videos', docId));
      el.remove();
      cache = cache.filter(x => x.id !== docId);
    }catch(e){ alert('삭제 실패: '+(e.message||e)); }
  });

  btnCat.addEventListener('click', ()=> openEdit(docId, v.categories||[]));

  // 제목 백필 시도(본인 문서만 조회 중)
  ensureTitle(el, docId, v);

  return el;
}

qbox?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); applyFilter(); }});
btnSearch?.addEventListener('click', ()=> applyFilter());

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
    // ownerUid where + createdAt desc
    const base = collection(db,'videos');
    const parts = [ where('ownerUid','==', curUser.uid), orderBy('createdAt','desc'), limit(PAGE_SIZE) ];
    const snap = await getDocs(query(base, ...parts));
    appendSnap(snap);
  }catch(e){
    console.warn('[manage-uploads] index fallback:', e?.message||e);
    usingClientFallback = true;
    const snap = await getDocs(query(collection(db,'videos'), where('ownerUid','==', curUser.uid)));
    const arr = snap.docs.map(d=>({ id:d.id, data:d.data(), _created:(d.data().createdAt?.toMillis?.()||0) }));
    arr.sort((a,b)=> b._created - a._created);
    cache = arr;
    cache.forEach(x => list.appendChild(rowEl(x.id, x.data)));
    hasMore = false;
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
    const parts = [ where('ownerUid','==', curUser.uid), orderBy('createdAt','desc'), startAfter(lastDoc), limit(PAGE_SIZE) ];
    const snap = await getDocs(query(base, ...parts));
    appendSnap(snap);
  }catch(e){
    console.error(e);
    hasMore=false;
  }finally{
    isLoading=false;
  }
}

/* ---------- 카테고리 편집 (모달) ---------- */
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
  const limitSel=3;
  const boxes = Array.from(editCatsBox.querySelectorAll('input.cat'));
  boxes.forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const count = boxes.filter(b=> b.checked).length;
      if(count > limitSel){
        chk.checked = false;
        alert(`카테고리는 최대 ${limitSel}개까지 선택 가능합니다.`);
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
// 배경 스크롤 차단
function preventBgScroll(e){ if(e.target===editBackdrop){ e.preventDefault(); } }
editBackdrop?.addEventListener('wheel', preventBgScroll, {passive:false});
editBackdrop?.addEventListener('touchmove', preventBgScroll, {passive:false});

btnEditSave?.addEventListener('click', async ()=>{
  if(!editTargetId) return;
  const sel = Array.from(editCatsBox.querySelectorAll('input.cat:checked')).map(b=>b.value);
  // 금지 필드 미전송(ownerUid/status 등)
  try{
    await updateDoc(doc(db,'videos', editTargetId), { categories: sel });
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
  cache = cache.filter(x => !ids.includes(x.id));
  applyFilter();
  alert(`삭제 완료: 성공 ${ok}건, 실패 ${fail}건`);
});

/* ---------- 시작(로그인 유지 보강) ---------- */
let _authFirstHandled = false;
let _authFallbackTimer = null;

document.addEventListener('DOMContentLoaded', ()=>{
  setStatus('로그인 상태 확인 중...');
  _authFallbackTimer = setTimeout(()=>{
    try{
      if(!_authFirstHandled && auth.currentUser){
        _authFirstHandled = true;
        loadInit();
      }else if(!_authFirstHandled){
        if(msg){
          msg.innerHTML = `<span style="color:#ffb4b4;font-weight:700;">로그인이 필요합니다.</span>
            <a href="signin.html" class="btn" style="background:#4ea1ff; border:0; font-weight:800; margin-left:8px;">로그인하기</a>`;
        }
      }
    }catch(e){ console.error(e); }
  }, 1800);
});

onAuthStateChanged(auth, (user)=>{
  try{
    const loggedIn = !!user;
    signupLink?.classList.toggle('hidden', loggedIn);
    signinLink?.classList.toggle('hidden', loggedIn);
    welcome && (welcome.textContent = loggedIn ? `Hi! ${user?.displayName||'회원'}님` : '');

    if(_authFirstHandled) return;
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
