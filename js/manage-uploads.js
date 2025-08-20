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

async fu
