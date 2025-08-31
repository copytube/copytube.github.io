// js/admin-members.js (닉네임 폴백 적용판)
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import { isAdminCurrentUser, escapeHTML, fmtDate } from './admin-common.js';
import {
  collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc, deleteDoc,
  where, writeBatch
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
const usersBox  = document.getElementById('users');     // admin-members.html 기준 id 확인됨
const usersMsg  = document.getElementById('usersMsg');
const logsMsg   = document.getElementById('logsMsg');
const logsTbody = document.querySelector('#logsTbl tbody');

/* 최신 닉네임 캐시 (uid -> displayName) */
const latestNameByUid = new Map();

onAuthStateChanged(auth, async (user)=>{
  // 관리자만 접근
  if (!user || !(await isAdminCurrentUser())){ location.href='about.html'; return; }
  // 1) 로그인 기록 먼저 → 폴백 닉 확보
  await loadLogs();
  // 2) 사용자 목록에서 폴백 적용해 렌더
  await loadUsers();
});

async function loadUsers(){
  usersMsg.textContent = '로딩중...';
  try{
    const snap = await getDocs(collection(db,'users')); // 전체 사용자
    usersBox.innerHTML='';
    if (snap.empty){ usersBox.innerHTML='<div class="msg">사용자가 없습니다.</div>'; usersMsg.textContent=''; return; }

    for (const d of snap.docs){
      const u = d.data();
      const uid = d.id;

      // 닉네임: users.displayName → login_logs 폴백 → 기본표시
      let displayName = (u.displayName || '').toString().trim();
      if (!displayName) {
        const fb = (latestNameByUid.get(uid) || '').toString().trim();
        if (fb) displayName = fb;
      }
      if (!displayName) displayName = '(닉네임없음)';

      // 밴 여부
      const bannedSnap = await getDoc(doc(db,'banned_users', uid));
      const isBanned = bannedSnap.exists();

      const row = document.createElement('div');
      row.className='row';
      row.innerHTML = `
        <div>
          <div class="meta">
            <strong>${escapeHTML(displayName)}</strong>
            <span class="badge">UID: ${escapeHTML(uid)}</span>
            ${isBanned?'<span class="badge" style="border-color:#dc2626;color:#ffb4b4;">BANNED</span>':''}
          </div>
          <div class="meta">가입: ${fmtDate(u.createdAt)} · 최근로그인: ${fmtDate(u.lastLoginAt)}</div>
        </div>
        <div class="actions">
          ${isBanned
            ? `<button class="btn" data-act="unban" data-uid="${uid}">밴 해제</button>`
            : `<button class="btn btn-danger" data-act="ban"  data-uid="${uid}">밴</button>`}
          <button class="btn" data-act="dropnick" data-uid="${uid}">닉 지우기</button>
          <button class="btn btn-danger" data-act="force" data-uid="${uid}">강제탈퇴(소프트)</button>
        </div>
      `;
      // 핸들러
      row.querySelector('[data-act="ban"]')?.addEventListener('click', ()=> doBan(uid, true));
      row.querySelector('[data-act="unban"]')?.addEventListener('click', ()=> doBan(uid, false));
      row.querySelector('[data-act="dropnick"]')?.addEventListener('click', ()=> dropNick(uid));
      row.querySelector('[data-act="force"]')?.addEventListener('click', ()=> forceDeleteSoft(uid));
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
    latestNameByUid.clear();
    snap.docs.forEach(d=>{
      const v = d.data();
      // 최신순이므로 최초 세팅이 가장 최신 닉
      if (v.uid && v.displayName && !latestNameByUid.has(v.uid)){
        latestNameByUid.set(v.uid, String(v.displayName));
      }
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

async function dropNick(uid){
  try{
    const uSnap = await getDoc(doc(db,'users', uid));
    if (!uSnap.exists()){ alert('사용자 문서가 없습니다.'); return; }
    const dn = String(uSnap.data().displayName || '').toLowerCase();
    if (!dn){ alert('닉네임이 없습니다.'); return; }
    if (!confirm(`닉네임 "${dn}" 맵을 삭제할까요? (계정 삭제 아님)`)) return;
    await deleteDoc(doc(db,'usernames', dn));
    alert('닉네임 맵이 삭제되었습니다.');
  }catch(e){ alert('실패: ' + (e.message || e)); }
}

async function forceDeleteSoft(uid){
  if (!confirm('강제탈퇴(소프트)를 진행할까요?\n- 밴 적용\n- 해당 사용자의 영상 삭제\n- users 문서 삭제\n- usernames 맵 삭제\n\n※ Auth 계정 삭제는 콘솔에서 별도 수행')) return;

  usersMsg.textContent = '강제탈퇴 작업 중...';
  try{
    // 1) 밴
    await setDoc(doc(db,'banned_users', uid), { at: new Date(), by: auth.currentUser?.uid||'admin' });

    // 2) 닉네임 맵 준비
    let nickLower = '';
    try{
      const uSnap = await getDoc(doc(db,'users', uid));
      if (uSnap.exists()){
        const dn = (uSnap.data().displayName || '').toString();
        nickLower = dn ? dn.toLowerCase() : '';
      }
    }catch(_){}

    // 3) 영상 일괄 삭제
    while(true){
      const snap = await getDocs(query(collection(db,'videos'), where('uid','==',uid), limit(300)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // 4) users 문서 삭제
    await deleteDoc(doc(db,'users', uid)).catch(()=>{});

    // 5) usernames 맵 삭제
    if (nickLower){
      await deleteDoc(doc(db,'usernames', nickLower)).catch(()=>{});
    }

    usersMsg.textContent = '강제탈퇴(소프트) 완료. Auth 계정은 콘솔(Authentication)에서 삭제하세요.';
    await loadUsers();
  }catch(e){
    usersMsg.textContent = '실패: ' + (e.message || e);
  }
}
