// js/admin-members.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import { isAdminCurrentUser, escapeHTML, fmtDate } from './admin-common.js';
import {
  collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/* 드롭다운 */
const menuBtn = document.getElementById('menuBtn');
const dropdown = document.getElementById('dropdownMenu');
let isOpen=false; function open(){ isOpen=true; dropdown.classList.remove('hidden'); requestAnimationFrame(()=> dropdown.classList.add('show')); }
function close(){ isOpen=false; dropdown.classList.remove('show'); setTimeout(()=> dropdown.classList.add('hidden'),180); }
menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown.classList.contains('hidden')?open():close(); });
document.getElementById('btnBack')?.addEventListener('click', ()=> location.href='about.html');
document.addEventListener('pointerdown', (e)=>{ if(dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) close(); }, true);

/* DOM */
const usersBox = document.getElementById('users');
const usersMsg = document.getElementById('usersMsg');
const logsMsg  = document.getElementById('logsMsg');
const logsTbody= document.querySelector('#logsTbl tbody');

onAuthStateChanged(auth, async (user)=>{
  if (!user || !(await isAdminCurrentUser())){ location.href='about.html'; return; }
  await Promise.all([loadUsers(), loadLogs()]);
});

async function loadUsers(){
  usersMsg.textContent = '로딩중...';
  try{
    // users 컬렉션 전체 (규칙상 read 허용)
    const snap = await getDocs(collection(db,'users'));
    usersBox.innerHTML='';
    if (snap.empty){ usersBox.innerHTML='<div class="msg">사용자가 없습니다.</div>'; usersMsg.textContent=''; return; }

    for (const d of snap.docs){
      const u = d.data();
      const uid = d.id;
      const bannedSnap = await getDoc(doc(db,'banned_users', uid));
      const isBanned = bannedSnap.exists();

      const row = document.createElement('div');
      row.className='row';
      row.innerHTML = `
        <div>
          <div class="meta">
            <strong>${escapeHTML(u.displayName || '(닉네임없음)')}</strong>
            <span class="badge">UID: ${escapeHTML(uid)}</span>
            ${isBanned?'<span class="badge" style="border-color:#dc2626;color:#ffb4b4;">BANNED</span>':''}
          </div>
          <div class="meta">가입: ${fmtDate(u.createdAt)} · 최근로그인: ${fmtDate(u.lastLoginAt)}</div>
        </div>
        <div class="actions">
          ${isBanned
            ? `<button class="btn" data-act="unban" data-uid="${uid}">밴 해제</button>`
            : `<button class="btn btn-danger" data-act="ban" data-uid="${uid}">밴</button>`}
          <button class="btn" data-act="dropnick" data-uid="${uid}" data-nick="${escapeHTML((u.displayName||'').toLowerCase())}">닉 지우기</button>
        </div>
      `;
      // 핸들러
      row.querySelector('[data-act="ban"]')?.addEventListener('click', ()=> doBan(uid, true));
      row.querySelector('[data-act="unban"]')?.addEventListener('click', ()=> doBan(uid, false));
      row.querySelector('[data-act="dropnick"]')?.addEventListener('click', ()=> dropNick(uid, (u.displayName||'').toLowerCase()));
      usersBox.appendChild(row);
    }
    usersMsg.textContent='';
  }catch(e){
    usersMsg.textContent = '오류: ' + (e.message || e);
  }
}

async function loadLogs(){
  logsMsg.textContent = '로딩중...';
  try{
    const snap = await getDocs(query(collection(db,'login_logs'), orderBy('at','desc'), limit(200)));
    logsTbody.innerHTML='';
    snap.docs.forEach(d=>{
      const v = d.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHTML(fmtDate(v.at))}</td>
                      <td>${escapeHTML(v.displayName || '')}</td>
                      <td>${escapeHTML(v.uid || '')}</td>
                      <td style="white-space:nowrap; max-width:320px; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(v.ua || '')}</td>`;
      logsTbody.appendChild(tr);
    });
    logsMsg.textContent='';
  }catch(e){
    logsMsg.textContent = '오류: ' + (e.message || e);
  }
}

async function doBan(uid, on){
  try{
    if (on){
      await setDoc(doc(db,'banned_users', uid), { at: new Date(), by: auth.currentUser?.uid||'admin' });
    }else{
      await deleteDoc(doc(db,'banned_users', uid));
    }
    await loadUsers();
  }catch(e){ alert('처리 실패: ' + (e.message || e)); }
}

async function dropNick(uid, nickLower){
  if (!nickLower) { alert('닉네임이 없습니다.'); return; }
  if (!confirm(`닉네임 "${nickLower}" 맵을 삭제할까요? (사용자 계정 자체 삭제는 아님)`)) return;
  try{
    // usernames/{nickLower} 삭제 (rules: isAdmin만 허용)
    await deleteDoc(doc(db, 'usernames', nickLower));
    alert('삭제되었습니다.');
  }catch(e){ alert('삭제 실패: ' + (e.message || e)); }
}
