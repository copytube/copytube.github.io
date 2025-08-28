// js/manage-uploads.js (v1.5.2)
import { auth, db } from './firebase-init.js?v=1.5.1';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=1.5.1';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  getDoc, doc, updateDoc, deleteDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js?v=1.5.1';

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

/* ---------- 카테고리 라벨 ---------- */
const labelMap = new Map(CATEGORY_GROUPS.flatMap(g => g.children.map(c => [c.value, c.label])));
const labelOf  = (v) => labelMap.get(v) || `(${String(v)})`;

/* ---------- DOM ---------- */
const listEl   = $('#list');
const statusEl = $('#status');
const adminBadge = $('#adminBadge');
const prevBtn  = $('#prevBtn');
const nextBtn  = $('#nextBtn');
const pageInfo = $('#pageInfo');
const refreshBtn = $('#refreshBtn');

/* ---------- 상태 ---------- */
const PAGE_SIZE = 30;
let currentUser = null;
let isAdmin = false;
let cursors = [];
let page = 1;
let reachedEnd = false;

/* ---------- 유틸 ---------- */
function escapeHTML(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function catChipsHTML(arr){
  if (!Array.isArray(arr) || !arr.length) {
    return '<div class="cats" tabindex="0" role="button" aria-label="카테고리 변경 펼치기"><span class="sub">(카테고리 없음)</span></div>';
  }
  return `<div class="cats" tabindex="0" role="button" aria-label="카테고리 변경 펼치기">
            ${arr.map(v=>`<span class="chip">${escapeHTML(labelOf(v))}</span>`).join('')}
          </div>`;
}
function buildSelect(name){
  const opts = ['<option value="">선택안함</option>'];
  for (const g of CATEGORY_GROUPS){
    if (g.personal) continue; // 개인자료 제외
    const inner = g.children.map(c => `<option value="${c.value}">${escapeHTML(c.label)}</option>`).join('');
    opts.push(`<optgroup label="${escapeHTML(g.label)}">${inner}</optgroup>`);
  }
  return `<select class="sel" data-name="${name}">${opts.join('')}</select>`;
}

/* ---------- 드롭다운 토글: .row.open on/off ---------- */
function wireRowDropdown(row){
  const catsEl = row.querySelector('.cats');
  if (!catsEl) return;
  catsEl.style.cursor = 'pointer';
  const toggle = ()=>{
    const willOpen = !row.classList.contains('open');
    document.querySelectorAll('.row.open').forEach(r=>{ if(r!==row) r.classList.remove('open'); });
    row.classList.toggle('open', willOpen);
  };
  catsEl.addEventListener('click', toggle);
  catsEl.addEventListener('keydown', (e)=>{
    if (e.key==='Enter' || e.key===' ') { e.preventDefault(); toggle(); }
  });
}

/* ---------- 1행 ---------- */
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

  const sels = Array.from(row.querySelectorAll('select.sel'));
  cats.slice(0,3).forEach((v,i)=>{ if(sels[i]) sels[i].value = v; });

  // 제목 비었으면 oEmbed로 보강
  if (!title && url){
    (async ()=>{
      try{
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (res.ok){
          const j = await res.json();
          const t = String(j.title || '').trim();
          if (t){
            const tEl = row.querySelector('.js-title');
            if (tEl) tEl.textContent = t;
            try{ await updateDoc(doc(db,'videos', docId), { title: t, updatedAt: serverTimestamp() }); }catch{}
          }
        }
      }catch{}
    })();
  }

  if (isAdmin && uid){
    (async ()=>{
      try{
        const snap = await getDoc(doc(db,'users', uid));
        const name = snap.exists() ? (snap.data().displayName || snap.data().nickname || `uid:${uid.slice(0,6)}…`) : `uid:${uid.slice(0,6)}…`;
        const uEl = row.querySelector('.js-uploader');
        if (uEl) uEl.textContent = name;
      }catch{}
    })();
  }

  row.querySelector('.btn-apply').addEventListener('click', async ()=>{
    const chosen = Array.from(row.querySelectorAll('select.sel')).map(s=>s.value).filter(Boolean);
    const uniq = [...new Set(chosen)].slice(0,3);
    if (uniq.length===0){ alert('최소 1개의 카테고리를 선택하세요.'); return; }
    try{
      await updateDoc(doc(db,'videos', docId), { categories: uniq, updatedAt: serverTimestamp() });
      statusEl.textContent = '변경 완료';
      // 칩 갱신 + 드롭다운 이벤트 재연결
      const meta = row.querySelector('.meta');
      const old = meta.querySelector('.cats');
      if (old) old.remove();
      meta.insertAdjacentHTML('beforeend', catChipsHTML(uniq));
      wireRowDropdown(row);
    }catch(e){
      alert('변경 실패: ' + (e.message || e));
    }
  });

  row.querySelector('.btn-del').addEventListener('click', async ()=>{
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try{ await deleteDoc(doc(db,'videos', docId)); row.remove(); }
    catch(e){ alert('삭제 실패: ' + (e.message || e)); }
  });

  wireRowDropdown(row);
  return row;
}

/* ---------- 렌더/페이지 ---------- */
function clearList(){ listEl.innerHTML=''; }

async function loadPage(p){
  if (!currentUser){ statusEl.textContent = '로그인 후 이용하세요.'; clearList(); return; }
  statusEl.textContent = '읽는 중...';

  try{
    const parts = [];
    const base = collection(db,'videos');
    if (!isAdmin) parts.push(where('uid','==', currentUser.uid));
    parts.push(orderBy('createdAt','desc'));
    parts.push(limit(PAGE_SIZE));
    if (p>1 && cursors[p-2]) parts.push(startAfter(cursors[p-2]));

    const snap = await getDocs(query(base, ...parts));
    clearList();
    if (snap.empty){
      listEl.innerHTML = '<div class="sub">목록이 없습니다.</div>';
      reachedEnd = true;
    }else{
      snap.docs.forEach(d => listEl.appendChild(renderRow(d.id, d.data())));
      cursors[p-1] = snap.docs[snap.docs.length-1];
      reachedEnd = (snap.size < PAGE_SIZE);
    }
    pageInfo.textContent = String(p);
    statusEl.textContent = '';
  }catch(e){
    // 오류 표시 (디버깅에 도움)
    statusEl.textContent = '읽기 실패: ' + (e.message || e);
    console.error(e);
  }
}

/* ---------- 페이징 ---------- */
prevBtn.addEventListener('click', ()=>{ if (page<=1) return; page-=1; loadPage(page); });
nextBtn.addEventListener('click', ()=>{ if (reachedEnd) return; page+=1; loadPage(page); });
refreshBtn.addEventListener('click', ()=>{ cursors=[]; page=1; reachedEnd=false; loadPage(page); });

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

  try{
    const s = await getDoc(doc(db,'admins', user.uid));
    isAdmin = s.exists();
  }catch{ isAdmin = false; }
  adminBadge.style.display = isAdmin ? '' : 'none';

  cursors=[]; page=1; reachedEnd=false;
  loadPage(page);
});

/* ---------- 전역 오류를 화면에 표시(디버깅용, 필요 없으면 지워도 됨) ---------- */
window.addEventListener('error', (e)=>{
  if (statusEl) statusEl.textContent = '오류: ' + (e.message || 'unknown');
});
window.addEventListener('unhandledrejection', (e)=>{
  if (statusEl) statusEl.textContent = '오류: ' + (e.reason?.message || String(e.reason||''));
});
