// js/manage-uploads.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  getDoc, doc, updateDoc, deleteDoc, serverTimestamp
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
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove('hidden'); requestAnimationFrame(()=> dropdown.classList.add('show')); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove('show'); setTimeout(()=> dropdown.classList.add('hidden'), 180); }
menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());
btnGoUpload ?.addEventListener('click', ()=>{ location.href = 'upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href = 'manage-uploads.html'; closeDropdown(); });
btnAbout    ?.addEventListener('click', ()=>{ location.href = 'about.html'; closeDropdown(); });
btnSignOut  ?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

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
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
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
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : '';
}

/* ---------- YouTube 제목(oEmbed) with 캐시 ---------- */
const titleCache = new Map(); // url -> title
async function fetchYouTubeTitle(url){
  if (titleCache.has(url)) return titleCache.get(url);
  try{
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(endpoint, { mode:'cors' });
    if (!res.ok) throw new Error('oEmbed fetch failed');
    const j = await res.json();
    const title = String(j.title || '').trim();
    if (title) titleCache.set(url, title);
    return title || '';
  }catch(_){
    return '';
  }
}

/* ---------- 관리자 여부 ---------- */
async function checkAdmin(uid){
  try{
    const s = await getDoc(doc(db,'admins', uid)); // 규칙상: 관리자면 읽힘, 아니면 PERMISSION_DENIED
    return s.exists();
  }catch{
    return false;
  }
}

/* ---------- 업로더 닉네임 ---------- */
async function getUploaderDisplay(uid){
  try{
    const snap = await getDoc(doc(db,'users', uid));
    if (!snap.exists()) return `uid:${uid.slice(0,6)}…`;
    const d = snap.data() || {};
    const nick = d.displayName || d.nickname || '';
    return nick ? nick : `uid:${uid.slice(0,6)}…`;
  }catch{
    return `uid:${uid.slice(0,6)}…`;
  }
}

/* ---------- 1행 렌더 ---------- */
function renderRow(docId, data){
  const cats  = Array.isArray(data.categories) ? data.categories : [];
  const url   = data.url || '';
  const uid   = data.uid || '';
  const title = data.title || '';

  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = docId;
  row.innerHTML = `
    <div class="meta">
      <div class="title js-title">${escapeHTML(title || '제목 불러오는 중…')}</div>
      <div class="sub"><a href="${escapeHTML(url)}" target="_blank" rel="noopener" class="js-url">${escapeHTML(url)}</a></div>
      ${catChipsHTML(cats)}
      ${isAdmin ? `<div class="sub __uploader">업로더: <span class="js-uploader">불러오는 중…</span></div>` : ''}
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

  // 카테고리 프리셀렉트
  const sels = Array.from(row.querySelectorAll('select.sel'));
  cats.slice(0,3).forEach((v, i) => { if (sels[i]) sels[i].value = v; });

  // 제목이 비어있으면 비동기로 가져오고, 가져오면 Firestore에 title 저장(권한 허용 시)
  if (!title && url){
    (async ()=>{
      const t = await fetchYouTubeTitle(url);
      if (t){
        const tEl = row.querySelector('.js-title');
        if (tEl) tEl.textContent = t;
        // 문서에 title 저장(소유자 또는 관리자만 성공)
        try{
          await updateDoc(doc(db,'videos', docId), { title: t, updatedAt: serverTimestamp() });
        }catch{/* 권한 안되면 무시 */}
      }else{
        const tEl = row.querySelector('.js-title');
        if (tEl) tEl.textContent = url; // 최소한 url 노출
      }
    })();
  }

  // 업로더 닉네임 (관리자 전용)
  if (isAdmin && uid){
    (async ()=>{
      const name = await getUploaderDisplay(uid);
      const uEl = row.querySelector('.js-uploader');
      if (uEl) uEl.textContent = name;
    })();
  }

  // 카테고리 적용
  row.querySelector('.btn-apply').addEventListener('click', async ()=>{
    const chosen = Array.from(row.querySelectorAll('select.sel')).map(s=>s.value).filter(Boolean);
    const uniq = [...new Set(chosen)].slice(0,3);
    if (uniq.length === 0){ alert('최소 1개의 카테고리를 선택하세요.'); return; }
    try{
      await updateDoc(doc(db,'videos', docId), { categories: uniq, updatedAt: serverTimestamp() });
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

/* ---------- 리스트 렌더 ---------- */
function clearList(){ listEl.innerHTML = ''; }

/* ---------- 페이지 로드 ---------- */
async function loadPage(p){
  if (!currentUser){ statusEl.textContent = '로그인 후 이용하세요.'; clearList(); return; }
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

    const snap = await getDocs(query(base, ...parts));

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

  }catch(e){
    // 인덱스/권한 문제 등 → 전체를 받아 로컬 정렬(최대 1000개 안전장치)
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
      statusEl.textContent = '(로컬 정렬 표시)';

    }catch(e2){
      console.error(e, e2);
      statusEl.textContent = '읽기 실패: ' + (e.message || e);
    }
  }
}

/* ---------- 페이징 ---------- */
prevBtn.addEventListener('click', ()=>{ if (page <= 1) return; page -= 1; loadPage(page); });
nextBtn.addEventListener('click', ()=>{ if (reachedEnd) return; page += 1; loadPage(page); });
refreshBtn.addEventListener('click', ()=>{ cursors = []; page = 1; reachedEnd = false; loadPage(page); });

/* ---------- 시작 ---------- */
onAuthStateChanged(auth, async (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
  menuBtn?.classList.toggle('hidden', !loggedIn);

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
