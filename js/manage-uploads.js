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
const brandHome    = $('#brandHome');

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
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown.classList.contains('hidden')) return; const inside = e.target.closest('#dropdownMenu, #menuBtn'); if(!inside) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());

btnGoUpload?.addEventListener('click', ()=>{ location.href = 'upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href = 'manage-uploads.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href = 'about.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });
brandHome?.addEventListener('click', (e)=>{ e.preventDefault(); location.href = './'; });

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
  // personal 그룹은 제외
  const opts = ['<option value="">선택안함</option>'];
  for (const g of CATEGORY_GROUPS){
    if (g.personal) continue;
    const inner = g.children.map(c => `<option value="${c.value}">${escapeHTML(c.label)}</option>`).join('');
    opts.push(`<optgroup label="${escapeHTML(g.label)}">${inner}</optgroup>`);
  }
  return `<select class="sel" data-name="${name}">${opts.join('')}</select>`;
}

/* ---------- 업로더 닉네임 캐시(관리자 전용) ---------- */
const nickCache = new Map();
async function getNickname(uid){
  if (nickCache.has(uid)) return nickCache.get(uid);
  try{
    // users/{uid} 문서에서 displayName 또는 nickname 추출 시도
    const snap = await getDoc(doc(db,'users', uid));
    let nick = null;
    if (snap.exists()){
      const d = snap.data() || {};
      nick = d.displayName || d.nickname || null;
    }
    // 없으면 UID 뒤 6자리로 축약 표기
    if (!nick) nick = `uid:${String(uid).slice(-6)}`;
    nickCache.set(uid, nick);
    return nick;
  }catch{
    const nick = `uid:${String(uid).slice(-6)}`;
    nickCache.set(uid, nick);
    return nick;
  }
}

/* ---------- YouTube 제목 채우기 (oEmbed) ---------- */
async function fetchYouTubeTitle(url){
  try{
    const api = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const res = await fetch(api, { method:'GET' });
    if (!res.ok) throw new Error(res.status);
    const j = await res.json();
    return typeof j?.title === 'string' ? j.title : null;
  }catch{
    return null;
  }
}

/* ---------- 1행 렌더 ---------- */
function renderRow(docId, data){
  const cats  = Array.isArray(data.categories) ? data.categories : [];
  const url   = data.url || '';
  const uid   = data.uid || '';
  const title = data.title || '';  // 없으면 나중에 oEmbed로 채움

  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = docId;

  // URL 앵커(새창)
  const safeUrl = escapeHTML(url);
  const urlAnchor = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;

  row.innerHTML = `
    <div class="meta">
      <div class="title" data-title>${escapeHTML(title || '') || escapeHTML(url)}</div>
      <div class="sub">${urlAnchor}</div>
      ${catChipsHTML(cats)}
      ${isAdmin ? `<div class="sub __uploader">업로더: <span class="__nick">불러오는 중…</span></div>` : ''}
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
  cats.slice(0,3).forEach((v, i)
