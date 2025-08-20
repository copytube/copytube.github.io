// js/manage-uploads.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js';

const $ = (s)=>document.querySelector(s);

/* ---------- 상단바 / 드롭다운(모든 페이지 공통 패턴) ---------- */
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
  menuBtn?.classList.toggle('hidden', !loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());

btnGoUpload?.addEventListener('click', ()=>{ location.href = 'upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href = 'manage-uploads.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href = 'about.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

/* ---------- 카테고리 라벨 맵(알 수 없는 코드도 표시) ---------- */
const labelMap = new Map(CATEGORY_GROUPS.flatMap(g => g.children.map(c => [c.value, c.label])));
const labelOf = (v) => labelMap.get(v) || `(${String(v)})`;

/* ---------- DOM ---------- */
const list      = $('#list');
const msg       = $('#msg');
const adminBadge= $('#adminBadge');
const btnPrev   = $('#btnPrev');
const btnNext   = $('#btnNext');
const pageInfo  = $('#pageInfo');
const btnRefresh= $('#btnRefresh');

/* ---------- 상태 ---------- */
const PAGE_SIZE = 30;
let isAdmin = false;
let cursors = []; // 각 페이지의 시작점 스냅샷 누적
let page = 0;
let lastDoc = null;
let usingFallback = false; // 인덱스 없이 전량 가져오기 사용 여부
let fallbackRows = [];     // fallback 모드일 때 전체 행 캐시

/* ---------- 유틸 ---------- */
function toMs(t){
  try{ return t?.toMillis ? t.toMillis() : (typeof t==='number' ? t : 0); }catch{ return 0; }
}
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

/* ---------- 관리자 여부 확인 ---------- */
async function checkAdmin(uid){
  try{
    const s = await getDoc(doc(db,'admins', uid));
    return s.exists();
  }catch{ return false; }
}

/* ---------- 행 렌더 ---------- */
function renderRows(rows){
  list.innerHTML = '';
  for (const v of rows){
    const cats = Array.isArray(v.categories) ? v.categories : [];
    const catsHtml = cats.map(c => `<span class="catline">${escapeHTML(labelOf(c))}</span>`).join('<br/>');

    const urlSafe = escapeHTML(v.url || '');
    const title   = escapeHTML(v.title || v.url || '(제목 없음)');

    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `
      <input class="sel" type="radio" name="sel" value="${v.id}">
      <div class="meta">
        <div class="title">${title}</div>
        <div class="url">${urlSafe}${v.uid ? ' • 업로더: '+escapeHTML(v.uid) : ''}</div>
        <div class="catbox">${catsHtml || '<span class="catline">(카테고리 없음)</span>'}</div>
      </div>
      <div>
        <button class="btn delete" data-id="${v.id}" type="button">삭제</button>
      </div>
    `;
    el.querySelector('.btn.delete').addEventListener('click', async ()=>{
      const id = el.querySelector('.btn.delete').getAttribute('data-id');
      if (!confirm('정말 삭제하시겠습니까?')) return;
      try{
        await deleteDoc(doc(db,'videos', id));
        el.remove();
      }catch(e){
        alert('삭제 실패: ' + (e.message || e.code || e));
      }
    });
    list.appendChild(el);
  }
}

/* ---------- 페이지 정보 ---------- */
function updatePager(hasPrev, hasNext){
  btnPrev.classList.toggle('hidden', !hasPrev);
  btnNext.classList.toggle('hidden', !hasNext);
  pageInfo.textContent = `페이지 ${page+1}${usingFallback ? ' (오프라인 정렬)' : ''}`;
}

/* ---------- Firestore 페이지 로드 ---------- */
async function loadPage(direction = 'stay'){
  msg.textContent = '불러오는 중...';
  list.innerHTML = '';
  btnPrev.classList.add('hidden'); btnNext.classList.add('hidden');

  const user = auth.currentUser;
  if (!user){ msg.textContent = '로그인 후 이용하세요.'; return; }

  // 관리자 체크 1회
  if (page === 0 && cursors.length === 0){
    isAdmin = await checkAdmin(user.uid);
    adminBadge.classList.toggle('hidden', !isAdmin);
  }

  // 1) 기본: 서버 페이지네이션 쿼리
  try{
    const base = collection(db,'videos');
    const parts = [];
    if (!isAdmin){
      parts.push(where('uid','==', user.uid));
    }
    parts.push(orderBy('createdAt','desc'));
    if (direction === 'next' && lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const q = query(base, ...parts);
    const snap = await getDocs(q);

    if (direction === 'prev'){
      // prev는 커서 스택으로만 이동 (서버 prev 페이지는 생략)
      if (page > 0){
        page -= 1;
        lastDoc = cursors[page] || null;
        // 다시 앞으로(현재 커서 기준) 로딩
        return loadPage('stay');
      }
    }else{
      // 현재 위치 커서 저장
      if (snap.docs.length){
        if (direction === 'next' || (direction === 'stay' && cursors.length===0)){
          cursors[page] = snap.docs[0]; // 각 페이지의 첫 문서를 커서로 기록
        }
        lastDoc = snap.docs[snap.docs.length-1];
      }
      const rows = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      renderRows(rows);
      // 다음 페이지 존재 추정
      updatePager(page>0, snap.docs.length === PAGE_SIZE);
      msg.textContent = rows.length ? '' : '영상이 없습니다.';
      usingFallback = false;
      return;
    }
  }catch(e){
    // 2) 실패 시(인덱스/권한/네트워크), 전량 읽기 후 클라이언트 정렬/페이징
    //    데이터가 적은 현재 단계에서만 권장; 커지면 Cloud Function/집계로 이전
  }

  // Fallback 모드
  try{
    usingFallback = true;
    const snap = await getDocs(collection(db,'videos'));
    let rows = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    if (!isAdmin) rows = rows.filter(r => r.uid === auth.currentUser.uid);
    rows.sort((a,b)=> toMs(b.createdAt) - toMs(a.createdAt));
    fallbackRows = rows;

    // 페이지 슬라이싱
    const start = page * PAGE_SIZE;
    const slice = rows.slice(start, start + PAGE_SIZE);
    renderRows(slice);
    updatePager(page>0, (start + PAGE_SIZE) < rows.length);
    msg.textContent = slice.length ? '' : '영상이 없습니다.';
  }catch(e){
    console.error(e);
    msg.textContent = `목록을 불러오지 못했습니다: ${e.message || e.code || e}`;
  }
}

/* ---------- 페이지 이동 ---------- */
btnNext.addEventListener('click', ()=>{
  if (usingFallback){
    const start = (page+1)*PAGE_SIZE;
    if (start < fallbackRows.length){
      page += 1;
      const slice = fallbackRows.slice(start, start + PAGE_SIZE);
      renderRows(slice);
      updatePager(page>0, (start + PAGE_SIZE) < fallbackRows.length);
    }
  }else{
    page += 1;
    loadPage('next');
  }
});
btnPrev.addEventListener('click', ()=>{
  if (usingFallback){
    if (page > 0){
      page -= 1;
      const start = page*PAGE_SIZE;
      const slice = fallbackRows.slice(start, start + PAGE_SIZE);
      renderRows(slice);
      updatePager(page>0, (start + PAGE_SIZE) < fallbackRows.length);
    }
  }else{
    // 커서 스택으로 이전 페이지 근사
    if (page > 0){
      page -= 1;
      lastDoc = cursors[page] || null;
      loadPage('stay');
    }
  }
});
btnRefresh.addEventListener('click', ()=>{
  page = 0; cursors = []; lastDoc = null; usingFallback = false; fallbackRows = [];
  loadPage('stay');
});

/* ---------- 시작 ---------- */
onAuthStateChanged(auth, async (user)=>{
  if (!user){
    msg.textContent = '로그인 후 이용하세요.';
    list.innerHTML = '';
    return;
  }
  page = 0; cursors = []; lastDoc = null; usingFallback = false; fallbackRows = [];
  await loadPage('stay');
});
