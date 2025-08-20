// js/manage-uploads.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, query, where, getDocs, deleteDoc, doc, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CATEGORY_GROUPS } from './categories.js';

const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnGoCategory= document.getElementById("btnGoCategory");
const brandHome    = document.getElementById("brandHome");

const list = document.getElementById('list');
const msg  = document.getElementById('msg');
const pager= document.getElementById('pager');

let isAdmin = false;
let pageDocs = [];
let lastVisible = null;

const labelMap = new Map(CATEGORY_GROUPS.flatMap(g => g.children.map(c => [c.value, c.label])));
const labelOf = v => labelMap.get(v) || `(${v})`;

/* dropdown close outside */
let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }
menuBtn.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu') && !e.target.closest('#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown.addEventListener("click", (e)=> e.stopPropagation());

btnGoCategory?.addEventListener("click", ()=>{ location.href = "./"; closeDropdown(); });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
brandHome?.addEventListener("click", (e)=>{ e.preventDefault(); location.href="./"; });

onAuthStateChanged(auth, async (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";

  if(!user){
    msg.textContent = '로그인 후 이용하세요.';
    list.innerHTML=''; pager.innerHTML='';
    return;
  }
  msg.textContent = '불러오는 중...';

  // admin check
  try{
    const asnap = await getDocs(query(collection(db,'admins'), where('__name__','==',user.uid)));
    isAdmin = !asnap.empty;
  }catch{ isAdmin = false; }

  await loadPage(true, user.uid);
});

async function loadPage(initial, uid){
  list.innerHTML = ''; pager.innerHTML = '';
  pageDocs = [];

  const parts = [orderBy('createdAt','desc'), limit(30)];
  let qref = collection(db,'videos');

  if(!isAdmin){ parts.unshift(where('uid','==',uid)); }
  if(lastVisible && !initial){ parts.push(startAfter(lastVisible)); }

  const q = query(qref, ...parts);
  const snap = await getDocs(q);

  if(snap.empty){ msg.textContent = '영상이 없습니다.'; return; }

  pageDocs = snap.docs;
  lastVisible = pageDocs[pageDocs.length-1];

  msg.textContent = '';
  renderRows(pageDocs);

  // simple pager: just "더보기" if we filled 30
  if(pageDocs.length === 30){
    const more = document.createElement('button');
    more.textContent = '더보기';
    more.addEventListener('click', ()=> loadPage(false, uid));
    pager.appendChild(more);
  }
}

function renderRows(docs){
  for(const d of docs){
    const v = d.data();
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div>
        <div style="font-weight:800;">${escapeHtml(v.title || v.url)}</div>
        <div class="meta">${escapeHtml(v.url)}${v.uid ? ' • 업로더: '+escapeHtml(v.uid) : ''}</div>
        <div class="cats">${(Array.isArray(v.categories)?v.categories:[]).map(c=>`<span>• ${escapeHtml(labelOf(c))}</span>`).join('')}</div>
      </div>
      <div class="actions">
        <button class="btn del">삭제</button>
      </div>
    `;
    row.querySelector('.btn.del').addEventListener('click', async ()=>{
      if(!confirm('정말 삭제하시겠습니까?')) return;
      try{ await deleteDoc(doc(db,'videos', d.id)); row.remove(); }
      catch(e){ alert('삭제 실패: '+(e.message||e)); }
    });
    list.appendChild(row);
  }
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
