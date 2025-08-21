// js/manage-uploads.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  getDoc, doc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js';

const $ = s => document.querySelector(s);

/* ---------- 상단바 / 드롭다운 ---------- */
const signupLink   = $('#signupLink');
const signinLink   = $('#signinLink');
const welcome      = $('#welcome');
const menuBtn      = $('#menuBtn');
const dropdown     = $('#dropdownMenu');
const btnSignOut   = $('#btnSignOut');
const btnGoUpload  = $('#btnGoUpload');
const btnMyUploads = $('#btnMyUploads');
const btnAbout     = $('#btnAbout');

let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown.classList.remove('hidden');
  requestAnimationFrame(()=> dropdown.classList.add('show'));
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown.classList.remove('show');
  setTimeout(()=> dropdown.classList.add('hidden'), 180);
}

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);

  // ✅ 로그인 시 보이게, 로그아웃 시 숨김
  menuBtn?.classList.toggle('hidden', !loggedIn);

  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
  closeDropdown();
});


menuBtn?.addEventListener('click', (e)=>{
  e.stopPropagation();
  dropdown.classList.contains('hidden') ? openDropdown() : closeDropdown();
});
document.addEventListener('pointerdown', (e)=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());

btnGoUpload?.addEventListener('click', ()=>{ location.href = 'upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href = 'manage-uploads.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href = 'about.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

/* ---------- 카테고리 라벨 맵 ---------- */
const labelMap = new Map(CATEGORY_GROUPS.flatMap(g => g.children.map(c => [c.value, c.label])));
const labelOf  = (v) => labelMap.get(v) || `(${String(v)})`;

/* ---------- DOM ---------- */
const listEl     = $('#list');
const statusEl   = $('#status');
const adminBadge = $('#adminBadge');
const prevBtn    = $('#prevBtn');
const nextBtn    = $('#nextBtn');
const pageInfo   = $('#pageInfo');
const refreshBtn = $('#refreshBtn');

/* ---------- 상태 ---------- */
const PAGE_SIZE = 30;
let currentUser = null;
let isAdmin     = false;
let cursors     = [];   // 각 페이지 마지막 문서 스냅샷
let page        = 1;
let reachedEnd  = false;

/* ---------- 유틸 ---------- */
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function catChipsHTML(arr){
  if (!Array.isArray(arr) || !arr.length) return '<span class="sub">(카테고리 없음)</span>';
  return `<div class="cats">${arr.map(v=>`<span class="chip">${escapeHTML(labelOf(v))}</span>`).join('')}</div>`;
}
function buildSelect(name){
  // personal 그룹(로컬 전용)은 제외
  const opts = ['<option value="">선택안함</option>'];
  for (const g of CATEGORY_GROUPS){
    if (g.personal) continue;
    const inner = g.children.map(c => `<option value="${c.value}">${escapeHTML(c.label)}</option>`).join('');
    opts.push(`<optgroup label="${escapeHTML(g.label)}">${inner}</optgroup>`);
  }
  return `<select class="sel" data-name="${name}">${opts.join('')}</select>`;
}

/* ---------- 닉네임 조회 (admin 전용) ---------- */
// usernames: 문서 ID = 닉네임(소문자), 필드 uid = 사용자 uid
const nickCache = new Map();

async function preloadNicknames(uids){
  const unique = [...new Set(uids.filter(Boolean))];
  const CHUNK = 10;
  for (let i=0; i<unique.length; i+=CHUNK){
    const slice = unique.slice(i, i+CHUNK).filter(uid => !nickCache.has(uid));
    if (!slice.length) continue;
    try{
      const qs = await getDocs(query(collection(db,'usernames'), where('uid','in', slice)));
      qs.docs.forEach(d => {
        const uid = d.data()?.uid;
        const nick = d.id || '';
        if (uid) nickCache.set(uid, nick);
      });
      // 쿼리에서 못 찾은 uid는 캐시에 빈값으로 기록(다음에 재조회 방지)
      slice.forEach(uid => { if (!nickCache.has(uid)) nickCache.set(uid, ''); });
    }catch(e){
      // in 쿼리 실패 시 개별조회 폴백
      for (const uid of slice){
        try{
          const qs1 = await getDocs(query(collection(db,'usernames'), where('uid','==', uid), limit(1)));
          const nick = qs1.empty ? '' : (qs1.docs[0].id || '');
          nickCache.set(uid, nick);
        }catch(_){ nickCache.set(uid, ''); }
      }
    }
  }
}
function nicknameOf(uid){ return nickCache.get(uid) || ''; }

/* ---------- 1행 렌더 ---------- */
function renderRow(docId, data){
  const cats  = Array.isArray(data.categories) ? data.categories : [];
  const url   = data.url || '';
  const uid   = data.uid || '';
  const title = (data.title || data.ytTitle || '').trim();

  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = docId;
  row.innerHTML = `
    <div class="meta">
      <div class="title">${escapeHTML(title || url)}</div>
      <div class="sub"><a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a></div>
      ${catChipsHTML(cats)}
      ${isAdmin ? `<div class="sub __uploader" data-uid="${escapeHTML(uid)}">업로더: <span class="__name">불러오는 중…</span></div>` : ''}
    </div>
    <div class="right">
      <div class="cat-editor">
        ${buildSelect('s1')}
        ${buildSelect('s2')}
        ${buildSelect('s3')}
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-apply" type="button">카테고리변환</button>
        <button class="btn btn-danger btn-del" type="button">삭제</button>
      </div>
    </div>
  `;

  // 현재 카테고리로 프리셀렉트
  const sels = Array.from(row.querySelectorAll('select.sel'));
  cats.slice(0,3).forEach((v, i) => {
    if (sels[i]) sels[i].value = v;
  });

  // 적용 버튼
  row.querySelector('.btn-apply').addEventListener('click', async ()=>{
    const chosen = Array.from(row.querySelectorAll('select.sel')).map(s=>s.value).filter(Boolean);
    const uniq = [...new Set(chosen)].slice(0,3);
    if (uniq.length === 0){ alert('최소 1개의 카테고리를 선택하세요.'); return; }
    try{
      await updateDoc(doc(db,'videos', docId), { categories: uniq });
      statusEl.textContent = '변경 완료';
      // 칩 갱신
      const meta = row.querySelector('.meta');
      const oldCats = meta.querySelector('.cats');
      if (oldCats) oldCats.remove();
      meta.insertAdjacentHTML('beforeend', catChipsHTML(uniq));
    }catch(e){
      alert('변경 실패: ' + (e.message || e));
    }
  });

  // 삭제 버튼
  row.querySelector('.btn-del').addEventListener('click', async ()=>{
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try{
      await deleteDoc(doc(db,'videos', docId));
      row.remove();
    }catch(e){
      alert('삭제 실패: ' + (e.message || e));
    }
  });

  return row;
}

/* ---------- 리스트 렌더 ---------- */
function clearList(){ listEl.innerHTML = ''; }

/* ---------- 관리자 여부 ---------- */
async function checkAdmin(uid){
  try{
    const s = await getDoc(doc(db,'admins', uid));
    return s.exists();
  }catch{
    return false;
  }
}

/* ---------- 페이지 로드 ---------- */
async function loadPage(p){
  if (!currentUser) return;
  statusEl.textContent = '읽는 중...';

  try{
    const parts = [];
    const base  = collection(db,'videos');

    if (!isAdmin) parts.push(where('uid','==', currentUser.uid));
    parts.push(orderBy('createdAt','desc'));
    parts.push(limit(PAGE_SIZE));
    if (p > 1){
      const cursor = cursors[p-2];
      if (cursor) parts.push(startAfter(cursor));
    }

    const q = query(base, ...parts);
    const snap = await getDocs(q);

    clearList();
    if (snap.empty){
      listEl.innerHTML = '<div class="sub">목록이 없습니다.</div>';
      reachedEnd = true;
    }else{
      const rows = [];
      const uids = [];
      snap.docs.forEach(d => {
        const data = d.data();
        rows.push({ id:d.id, data });
        if (isAdmin && data?.uid) uids.push(data.uid);
      });

      // 관리자라면 닉네임 미리 당겨오기
      if (isAdmin && uids.length){
        await preloadNicknames(uids);
      }

      rows.forEach(({id, data}) => listEl.appendChild(renderRow(id, data)));

      // 관리자: 업로더명 채우기
      if (isAdmin){
        listEl.querySelectorAll('.__uploader').forEach(el => {
          const uid = el.getAttribute('data-uid') || '';
          const nameEl = el.querySelector('.__name');
          if (!nameEl) return;
          const nick = nicknameOf(uid);
          nameEl.textContent = nick || (uid ? uid.slice(0,6)+'…' : '(알 수 없음)');
        });
      }

      cursors[p-1] = snap.docs[snap.docs.length - 1];
      reachedEnd = (snap.size < PAGE_SIZE);
    }

    pageInfo.textContent = String(p);
    statusEl.textContent = '';

  }catch(e){
    // 인덱스/권한 문제 등으로 실패하면 사용자 범위 전체 가져와 정렬 후 슬라이스 (초기 데이터량 가정)
    try{
      const all = await getDocs(collection(db,'videos'));
      let rows = all.docs.map(d => ({ id:d.id, ...d.data() }));
      if (!isAdmin) rows = rows.filter(r => r.uid === currentUser.uid);
      rows.sort((a,b)=>{
        const am = a.createdAt?.toMillis?.() || 0;
        const bm = b.createdAt?.toMillis?.() || 0;
        return bm - am;
      });
      const start = (p-1)*PAGE_SIZE;
      const slice = rows.slice(start, start+PAGE_SIZE);

      clearList();
      if (isAdmin){
        await preloadNicknames(slice.map(r=>r.uid).filter(Boolean));
      }
      slice.forEach(v => listEl.appendChild(renderRow(v.id, v)));
      if (isAdmin){
        listEl.querySelectorAll('.__uploader').forEach(el => {
          const uid = el.getAttribute('data-uid') || '';
          const nameEl = el.querySelector('.__name');
          if (!nameEl) return;
          const nick = nicknameOf(uid);
          nameEl.textContent = nick || (uid ? uid.slice(0,6)+'…' : '(알 수 없음)');
        });
      }

      reachedEnd = (start + PAGE_SIZE >= rows.length);
      pageInfo.textContent = String(p);
      statusEl.textContent = '(오프라인 정렬)';

    }catch(e2){
      console.error(e, e2);
      statusEl.textContent = '읽기 실패: ' + (e.message || e);
    }
  }
}

/* ---------- 페이징 ---------- */
prevBtn.addEventListener('click', ()=>{
  if (page <= 1) return;
  page -= 1;
  loadPage(page);
});
nextBtn.addEventListener('click', ()=>{
  if (reachedEnd) return;
  page += 1;
  loadPage(page);
});
refreshBtn.addEventListener('click', ()=>{
  cursors = []; page = 1; reachedEnd = false;
  loadPage(page);
});

/* ---------- 시작 ---------- */
onAuthStateChanged(auth, async (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';

  if (!loggedIn){
    currentUser = null;
    statusEl.textContent = '로그인 후 이용하세요.';
    clearList();
    return;
  }
  currentUser = user;
  isAdmin = await checkAdmin(user.uid);
  adminBadge.style.display = isAdmin ? '' : 'none';

  cursors = []; page = 1; reachedEnd = false;
  loadPage(page);
});
