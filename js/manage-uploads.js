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
  dropdown?.classList.remove('hidden');
  requestAnimationFrame(()=> dropdown?.classList.add('show'));
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown?.classList.remove('show');
  setTimeout(()=> dropdown?.classList.add('hidden'), 180);
}
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  menuBtn?.classList.toggle('hidden', !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
  closeDropdown();
});
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
let cursors     = [];
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

/* ---------- 제목: oEmbed로 가져오기 (API 키 불필요) ---------- */
const TITLE_CACHE = new Map(); // url(or id) -> title
const CONCURRENCY = 8;

async function fetchTitleOEmbed(rawUrl){
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
  try{
    const res = await fetch(url, { credentials:'omit' });
    if (!res.ok) throw new Error(`oEmbed ${res.status}`);
    const json = await res.json();
    // json.title 존재 시 사용
    return (json && json.title) ? String(json.title) : '';
  }catch(e){
    // 실패 시 빈 문자열 → 나중에 URL을 대체 표시
    return '';
  }
}

async function fillMissingTitlesForCurrentList(){
  const rows = Array.from(listEl.querySelectorAll('.row'));
  const tasks = [];
  let running = 0;

  async function runTask(fn){
    running++;
    try{ await fn(); } finally { running--; }
  }

  // 생성기: 각 행에 대한 작업 예약
  for (const row of rows){
    if (row.dataset.titleResolved === '1') continue;
    const url = row.dataset.url;
    if (!url) { row.dataset.titleResolved = '1'; continue; }

    tasks.push(async ()=>{
      // 캐시 확인
      if (!TITLE_CACHE.has(url)){
        const title = await fetchTitleOEmbed(url);
        TITLE_CACHE.set(url, title);
      }
      const title = TITLE_CACHE.get(url) || '';
      setRowTitle(row, title, url);
      row.dataset.titleResolved = '1';

      // Firestore 캐시: 본인/관리자만 시도
      const ownerUid = row.dataset.uid;
      const docId = row.dataset.id;
      if (title && (isAdmin || (currentUser && ownerUid === currentUser.uid))){
        try{ await updateDoc(doc(db,'videos', docId), { title }); }catch{}
      }
    });
  }

  // 간단한 동시성 제어
  let i = 0;
  await new Promise((resolve)=>{
    function pump(){
      while (running < CONCURRENCY && i < tasks.length){
        runTask(tasks[i++]()).then(()=> pump());
      }
      if (i >= tasks.length && running === 0) resolve();
    }
    pump();
  });
}

function setRowTitle(row, title, fallbackUrl){
  const t = (title || '').trim();
  row.querySelector('.title').textContent = t || fallbackUrl || '(제목 없음)';
}

/* ---------- 관리자: 업로더 닉네임 표기 ---------- */
const UID_NAME_CACHE = new Map(); // uid -> nickname(lower)

async function fetchNicknamesForUids(uids){
  const need = uids.filter(u => u && !UID_NAME_CACHE.has(u));
  if (!need.length) return;

  for (let i=0; i<need.length; i+=10){
    const part = need.slice(i, i+10);
    try{
      const qUsernames = query(collection(db,'usernames'), where('uid','in', part));
      const snap = await getDocs(qUsernames);
      snap.forEach(d=>{
        const uid = d.data()?.uid;
        const nickLower = d.id || '';
        if (uid) UID_NAME_CACHE.set(uid, nickLower);
      });
      part.forEach(u => { if (!UID_NAME_CACHE.has(u)) UID_NAME_CACHE.set(u, ''); });
    }catch(e){
      part.forEach(u => { if (!UID_NAME_CACHE.has(u)) UID_NAME_CACHE.set(u, ''); });
    }
  }
}

function nicknamePretty(n){ return n || ''; }

async function resolveUploaderNamesIfAdmin(){
  if (!isAdmin) return;
  const rows = Array.from(listEl.querySelectorAll('.row'));
  const uids = Array.from(new Set(rows.map(r => r.dataset.uid).filter(Boolean)));
  if (!uids.length) return;

  await fetchNicknamesForUids(uids);

  rows.forEach(row=>{
    const uid = row.dataset.uid;
    const holder = row.querySelector('.__uploader');
    if (!holder) return;
    const nick = UID_NAME_CACHE.get(uid) || '';
    holder.textContent = `업로더: ${nick ? nicknamePretty(nick) : uid.slice(0,8) + '…'}`;
  });
}

/* ---------- 1행 렌더 ---------- */
function renderRow(docId, data){
  const cats  = Array.isArray(data.categories) ? data.categories : [];
  const url   = data.url || '';
  const uid   = data.uid || '';
  const title = data.title || '';
  const vid   = extractId(url);

  if (title) TITLE_CACHE.set(url, title);

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
      <div class="sub">
        <a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a>
      </div>
      ${catChipsHTML(cats)}
      ${isAdmin ? `<div class="sub __uploader">업로더: (로딩중)</div>` : ''}
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

  // 적용
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

  // 삭제
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
function clearList(){ listEl.innerHTML = ''; }

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
      snap.docs.forEach(d => listEl.appendChild(renderRow(d.id, d.data())));
      cursors[p-1] = snap.docs[snap.docs.length - 1];
      reachedEnd = (snap.size < PAGE_SIZE);
    }

    pageInfo.textContent = String(p);
    statusEl.textContent = '';

    // 제목(oEmbed) 보정 & 업로더 닉네임(관리자)
    await fillMissingTitlesForCurrentList();
    await resolveUploaderNamesIfAdmin();

  }catch(e){
    // 폴백: 전체 가져와 필터/정렬
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

      await fillMissingTitlesForCurrentList();
      await resolveUploaderNamesIfAdmin();

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
