// js/about.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { requireAdminUI, sanitizeMessage } from './admin-common.js';

/* 상단바 로그인 표시 (원본 유지) */
const signupLink = document.getElementById('signupLink');
const signinLink = document.getElementById('signinLink');
const welcome    = document.getElementById('welcome');

onAuthStateChanged(auth, (user)=>{
  const logged = !!user;
  signupLink?.classList.toggle('hidden', logged);
  signinLink?.classList.toggle('hidden', logged);
  welcome && (welcome.textContent = logged ? `Hi! ${user.displayName || '회원'}님` : '');
});

/* 관리자 전용 영역 & 버튼 */
const adminSection   = document.getElementById('adminSection');   // 표 컨테이너 전체
const btnAdminMsgs    = document.getElementById('btnAdminMsgs');
const btnAdminMembers = document.getElementById('btnAdminMembers');
const btnAdminExport  = document.getElementById('btnAdminExport');
const btnAdminBulk    = document.getElementById('btnAdminBulk');

/* admin만 보이게: 섹션 자체와 버튼 모두 전달 */
requireAdminUI([adminSection, btnAdminMsgs, btnAdminMembers, btnAdminExport, btnAdminBulk]);

/* 이동 */
btnAdminMsgs   ?.addEventListener('click', ()=> location.href='admin-feedback.html');
btnAdminMembers?.addEventListener('click', ()=> location.href='admin-members.html');
btnAdminExport ?.addEventListener('click', ()=> location.href='admin-export.html');
btnAdminBulk   ?.addEventListener('click', ()=> location.href='admin-bulk-upload.html');

/* 의견 전송 (원본 유지) */
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
    msgEl.textContent = '전송 실패: ' + (e.message || e);
  }
});
