// js/about.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { requireAdminUI, sanitizeMessage } from './admin-common.js';

/* 상단바 로그인 표시 */
const signupLink = document.getElementById('signupLink');
const signinLink = document.getElementById('signinLink');
const welcome    = document.getElementById('welcome');

onAuthStateChanged(auth, (user)=>{
  const logged = !!user;
  signupLink?.classList.toggle('hidden', logged);
  signinLink?.classList.toggle('hidden', logged);
  welcome && (welcome.textContent = logged ? `안녕하세요, ${user.displayName || '회원'}님` : '');
});

/* 관리자 전용 버튼 표시 */
const btnAdminMsgs    = document.getElementById('btnAdminMsgs');
const btnAdminMembers = document.getElementById('btnAdminMembers');
const btnAdminExport  = document.getElementById('btnAdminExport');   // 추가
const btnAdminBulk    = document.getElementById('btnAdminBulk');     // 추가

// 관리자면 네 버튼 모두 표시
requireAdminUI([btnAdminMsgs, btnAdminMembers, btnAdminExport, btnAdminBulk]);

// 이동
btnAdminMsgs   ?.addEventListener('click', ()=> location.href='admin-feedback.html');
btnAdminMembers?.addEventListener('click', ()=> location.href='admin-members.html');
btnAdminExport ?.addEventListener('click', ()=> location.href='admin-export.html');
btnAdminBulk   ?.addEventListener('click', ()=> location.href='admin-bulk-upload.html');

/* 의견 전송 */
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
