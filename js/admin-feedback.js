// js/admin-feedback.js  (실시간 반영 + 삭제)
import { auth } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import { requireAdminUI, escapeHTML, fmtDate, isAdminCurrentUser } from './admin-common.js';
import {
  collection, query, orderBy, onSnapshot, deleteDoc, doc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { db } from './firebase-init.js';

const msg   = document.getElementById('msg');
const list  = document.getElementById('list');

/* 드롭다운 (간단) */
const menuBtn  = document.getElementById('menuBtn');
const dropdown = document.getElementById('dropdownMenu');
let isOpen=false;
function open(){ isOpen=true; dropdown.classList.remove('hidden'); requestAnimationFrame(()=> dropdown.classList.add('show')); }
function close(){ isOpen=false; dropdown.classList.remove('show'); setTimeout(()=> dropdown.classList.add('hidden'),180); }
menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown.classList.contains('hidden')?open():close(); });
document.addEventListener('pointerdown', (e)=>{ if(dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) close(); }, true);
document.getElementById('btnBack')?.addEventListener('click', ()=> location.href='about.html');

/* 관리자만 접근 */
let unsub = null;
onAuthStateChanged(auth, async (user)=>{
  if (!user || !(await isAdminCurrentUser())){ location.href = 'about.html'; return; }
  startLive();
});

function startLive(){
  msg.textContent = '불러오는 중...';
  const q = query(collection(db,'messages'), orderBy('createdAt','desc'));
  if (unsub) unsub();
  unsub = onSnapshot(q, (snap)=>{
    list.innerHTML='';
    if (snap.empty){
      list.innerHTML = '<div class="msg">메시지가 없습니다.</div>';
      msg.textContent='';
      return;
    }
    snap.forEach(d=>{
      const v = d.data();
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div>
          <div class="meta">${escapeHTML(v.displayName || '회원')} · ${fmtDate(v.createdAt)}</div>
          <div class="content">${escapeHTML(v.content || '')}</div>
        </div>
        <div class="actions">
          <button class="btn btn-danger" data-id="${d.id}">삭제</button>
        </div>
      `;
      row.querySelector('.btn-danger')?.addEventListener('click', async ()=>{
        if (!confirm('삭제할까요?')) return;
        try{ await deleteDoc(doc(db,'messages', d.id)); }catch(e){ alert('삭제 실패: '+(e.message||e)); }
      });
      list.appendChild(row);
    });
    msg.textContent='';
  }, (e)=>{
    msg.textContent = '오류: ' + (e.message || e);
  });
}

window.addEventListener('beforeunload', ()=>{ try{ unsub && unsub(); }catch{} });
