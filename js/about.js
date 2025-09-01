// js/about.js (v1.2.0) — 드롭다운 로직 index 패턴으로 통일 + 기존 기능 유지
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { requireAdminUI, sanitizeMessage } from './admin-common.js';

/* ---------- 상단바 요소 ---------- */
const signupLink   = document.getElementById('signupLink');
const signinLink   = document.getElementById('signinLink');
const welcome      = document.getElementById('welcome');

const menuBtn      = document.getElementById('menuBtn');
const dropdown     = document.getElementById('dropdownMenu');
const btnAbout     = document.getElementById('btnAbout');
const btnMyUploads = document.getElementById('btnMyUploads');
const btnGoUpload  = document.getElementById('btnGoUpload');
const btnSignOut   = document.getElementById('btnSignOut');

let isMenuOpen = false;
function openDropdown(){
  if (!dropdown) return;
  isMenuOpen = true;
  dropdown.classList.remove('hidden');                     // display 차단 해제
  requestAnimationFrame(()=> dropdown.classList.add('show')); // 트랜지션 시작(opacity/pointer-events)
}
function closeDropdown(){
  if (!dropdown) return;
  isMenuOpen = false;
  dropdown.classList.remove('show');                       // 서서히 숨김
  setTimeout(()=> dropdown.classList.add('hidden'), 180);  // 전환 후 완전 숨김
}

/* ---------- 로그인 상태 동기화 ---------- */
onAuthStateChanged(auth, (user)=>{
  const logged = !!user;
  signupLink?.classList.toggle('hidden', logged);
  signinLink?.classList.toggle('hidden', logged);
  if (welcome) welcome.textContent = logged ? `Hi! ${user?.displayName || '회원'}님` : '';
  closeDropdown(); // 상태 변화 시 메뉴 닫기
});

/* ---------- 드롭다운 동작 ---------- */
menuBtn?.addEventListener('click', (e)=>{
  e.stopPropagation();
  if (!dropdown) return;
  dropdown.classList.contains('hidden') ? openDropdown() : closeDropdown();
});
document.addEventListener('pointerdown', (e)=>{
  if (!dropdown || dropdown.classList.contains('hidden')) return;
  if (!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());

/* ---------- 드롭다운 내 네비게이션 ---------- */
btnAbout    ?.addEventListener('click', ()=>{ location.href = 'about.html';          closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href = 'manage-uploads.html'; closeDropdown(); });
btnGoUpload ?.addEventListener('click', ()=>{ location.href = 'upload.html';         closeDropdown(); });
btnSignOut  ?.addEventListener('click', async ()=>{
  if (!auth.currentUser){ location.href = 'signin.html'; return; }
  try { await fbSignOut(auth); } catch {}
  closeDropdown();
});

/* ---------- 관리자 전용 영역 & 버튼 표시 ---------- */
const adminSection    = document.getElementById('adminSection');   // 표 컨테이너 전체
const btnAdminMsgs    = document.getElementById('btnAdminMsgs');
const btnAdminMembers = document.getElementById('btnAdminMembers');
const btnAdminExport  = document.getElementById('btnAdminExport');
const btnAdminBulk    = document.getElementById('btnAdminBulk');

// admin만 보이게: 섹션 자체와 버튼 모두 전달
requireAdminUI([adminSection, btnAdminMsgs, btnAdminMembers, btnAdminExport, btnAdminBulk]);

// 이동
btnAdminMsgs   ?.addEventListener('click', ()=> location.href='admin-feedback.html');
btnAdminMembers?.addEventListener('click', ()=> location.href='admin-members.html');
btnAdminExport ?.addEventListener('click', ()=> location.href='admin-export.html');
btnAdminBulk   ?.addEventListener('click', ()=> location.href='admin-bulk-upload.html');

/* ---------- 의견 전송 ---------- */
const btnSend  = document.getElementById('btnSend');
const feedback = document.getElementById('feedback');
const msgEl    = document.getElementById('msg');

btnSend?.addEventListener('click', async ()=>{
  const user = auth.currentUser;
  if (!user){ msgEl.textContent = '로그인 후 전송할 수 있어요.'; return; }

  const raw = feedback.value;
  const clean = sanitizeMessage(raw);
  if (!clean){ msgEl.textContent = '내용을 입력해 주세요.'; return; }

  msgEl.textContent = '전송 중...';
  try{
    await addDoc(collection(db,'messages'), {
      uid: user.uid,
      displayName: user.displayName || '회원',
      content: clean,
      ua: navigator.userAgent || '',
      createdAt: serverTimestamp()
    });
    feedback.value = '';
    msgEl.textContent = '전송되었습니다. 감사합니다!';
  }catch(e){
    msgEl.textContent = '전송 실패: ' + (e?.message || e);
  }
});
