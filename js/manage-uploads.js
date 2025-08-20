// js/manage-uploads.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  getDoc, doc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js';

/* ===================== 기본 셋업 ===================== */
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
  dropdown?.classList.remove('hidden');
  requestAnimationFrame(()=> dropdown?.classList.add('show'));
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown?.classList.remove('show');
  setTimeout(()=> dropdown?.classList.add('hidden'), 180);
}
menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{
  if (dropdown?.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());

btnGoUpload?.addEventListener('click', ()=>{ location.href = 'upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href = 'manage-uploads.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href = 'about.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

/* ---------- 카테고리 라벨 ---------- */
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

/* ===================== 유틸/헬퍼 ===================== */
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function catChipsHTML(arr){
  if (!Array.isArray(arr) || !arr.length) return '<span class="sub">(카테고리 없음)</span>';
  return `<div class="cats">${arr.map(v=>`<span class="chip">${escapeHTML(labelOf(v))}</span>`).join('')}</div>`;
}
function buildSelect(name){
  // personal 그룹은 제외
  const opts = ['<option value="">선택안함</option>'];
  for (const g of CATEGORY_GROUPS){
    if (g.personal) continue;
    const inner = g.children.map(c => `<option value="${c.value}">${escapeHTML(c.label)}</option>`).join('');
    opts.push(`<optgroup label="${escapeHTML(g.label)}">${inner}</optgroup>`);
  }
  return `<select class="sel" data-name="${name}">${opts.join('')}</select>`;
}
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : '';
}

/* ===================== YouTube 제목 가져오기 ===================== */
/** 필요시 프로젝트 API 키 사용 (동일 키 사용 가능). 
 *  YouTube Data API v3 가 GCP에서 활성화되어 있어야 합니다. */
const YOUTUBE_API_KEY = 'AIzaSyBdZwzeAB91VnR0yqZK9qcW6LsOdCfHm8U'; // 제공해주신 키 사용

/** 메모리 캐시 */
const TITLE_CACHE = new Map(); // id -> title

async function fetchTitlesBatch(videoIds){
  // 이미 있는 것 제외
  const need = videoIds.filter(id => id && !TITLE_CACHE.has(id));
  if (need.length === 0) return;

  // 50개씩 배치
  const chunks = [];
  for (let i=0; i<need.length; i+=50) chunks.push(need.slice(i, i+50));

  for (const ids of chunks){
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.join(',')}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;
    try{
      const res = await fetch(url);
      if (!res.ok) throw new Error(`YouTube API ${res.status}`);
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      // 매칭
      for (const it of items){
        const id = it?.id;
        const title = it?.snippet?.title || '';
        if (id && title) TITLE_CACHE.set(id, title);
      }
      // 못 찾은 id는 빈 문자열 캐시(불필요 반복요청 방지)
      ids.forEach(id => { if (!TITLE_CACHE.has(id)) TITLE_CACHE.set(id, ''); });
    }catch(e){
      // 실패 시, 반복 요청 방지를 위해 임시 캐시
      ids.forEach(id => { if (!TITLE_CACHE.has(id)) TITLE_CACHE.set(id, ''); });
      console.warn('YouTube title fetch failed:', e);
    }
  }
}

function setRowTitle(row, title, fallbackUrl){
  const titleEl = row.querySelector('.title');
  titleEl.textContent = title?.trim() ? title : (fallbackUrl || '(제목 없음)');
}

/** row들에 대해 제목이 없으면 일괄 요청 후 DOM 업데이트 + Firestore 캐시 */
async function fillMissingTitlesForCurrentList(){
  // 수집
  const rows = Array.from(listEl.querySelectorAll('.row'));
  const tasks = [];
  const idToRow = new Map();
  const idToDoc = new Map();

  for (const row of rows){
    if (row.dataset.titleResolved === '1') continue;
    const vid = row.dataset.vid;
    const url = row.dataset.url;
    const docId = row.dataset.id;

    if (!vid) continue;
    idToRow.set(vid, row);
    idToDoc.set(vid, docId);
    tasks.push(vid);
  }

  if (tasks.length === 0) return;

  // 배치로 한 번에 가져오기
  await fetchTitlesBatch(tasks);

  // DOM 반영 + Firestore 캐시 (권한 있는 경우에만)
  for (const vid of tasks){
    const row = idToRow.get(vid);
    if (!row) continue;
    const docId = idToDoc.get(vid);
    const title = TITLE_CACHE.get(vid) || '';

    setRowTitle(row, title, row.dataset.url);
    row.dataset.titleResolved = '1';

    // 캐시 저장 (소유자 또는 관리자만)
    const ownerUid = row.dataset.uid;
    if (title && (isAdmin || (currentUser && ownerUid === currentUser.uid))){
      try{
        await updateDoc(doc(db,'videos', docId), { title });
      }catch(e){
        // 권한/규칙으로 막히면 조용히 패스
        console.debug('skip cache write', e?.message || e);
      }
    }
  }
}

/* ===================== 행 렌더 ===================== */
function renderRow(docId, data){
  const cats  = Array.isArray(data.categories) ? data.categories : [];
  const url   = data.url || '';
  const uid   = data.uid || '';
  const title = data.title || '';
  const vid   = extractId(url);

  // 미리 메모리에 있으면 사용
  if (title) TITLE_CACHE.set(vid, title);

  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id   = docId;
  row.dataset.url  = url;
  row.dataset.uid  = uid;
  row.dataset.vid  = vid;
  row.dataset.titleResolved = title ? '1' : '0';

  row.innerHTML = `
    <div class="meta">
      <div class="title">${escapeHTML(title || '제목 불러오는 중…')}</div>
      <div class="sub">${escapeHTML(url)}</div>
      ${catChipsHTML(cats)}
      ${isAdmin ? `<div class="sub __uploader">업로더: ${escapeHTML(uid)}</div>` : ''}
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

  // 현재 카테고리 프리셀렉트
  const sels = Array.from(row.querySelectorAll('select.sel'));
  cats.slice(0,3).forEach((v, i) => { if (sels[i]) sels[i].value = v; });

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

/* ===================== 관리자 여부 ===================== */
async function checkAdmin(uid){
  try{
    const s = await getDoc(doc(db,'admins', uid));
    return s.exists();
  }catch{
    // 권한 거부(비관리자)는 false 처리
    return false;
  }
}

/* ===================== 페이지 로드 ===================== */
function clearList(){ listEl.innerHTML = ''; }

async function loadPage(p){
  if (!currentUser) return;
  statusEl.textContent = '읽는 중...';

  try{
    const parts = [];
    const base  = collection(db,'videos');

    // 🔒 비관리자는 자신의 것만
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
      snap.docs.forEach(d => listEl.appendChild(renderRow(d.id, d.data())));
      cursors[p-1] = snap.docs[snap.docs.length - 1];
      reachedEnd = (snap.size < PAGE_SIZE);
    }

    pageInfo.textContent = String(p);
    statusEl.textContent = '';

    // 🔎 제목 비어있는 것들 일괄 채우기
    fillMissingTitlesForCurrentList();

  }catch(e){
    // 인덱스/권한 문제 등 → 폴백: 전체 읽고 클라이언트 필터/정렬
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
      slice.forEach(v => listEl.appendChild(renderRow(v.id, v)));
      reachedEnd = (start + PAGE_SIZE >= rows.length);
      pageInfo.textContent = String(p);
      statusEl.textContent = '(오프라인 정렬)';

      // 폴백에서도 제목 채우기 시도
      fillMissingTitlesForCurrentList();

    }catch(e2){
      console.error(e, e2);
      statusEl.textContent = '읽기 실패: ' + (e.message || e);
    }
  }
}

/* ===================== 페이징 ===================== */
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

/* ===================== 시작 ===================== */
onAuthStateChanged(auth, async (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '');

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
