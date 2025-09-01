// js/signin.js
import { auth } from './firebase-init.js';
import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { normalizeIdOrEmail, dropFirstCharVariant } from './auth-util.js';

const form  = document.getElementById('signinForm');
const idIn  = document.getElementById('signinIdOrEmail');
const pwdIn = document.getElementById('signinPassword');

if (!form || !idIn || !pwdIn) {
  console.warn('[signin] 필요한 폼 요소를 찾을 수 없습니다. (signinForm / signinIdOrEmail / signinPassword)');
}

// 로그인 입력 힌트(선택)
(function injectHint(){
  const host = idIn?.parentElement;
  if (!host) return;
  let h = document.createElement('div');
  h.style.fontSize = '12px';
  h.style.color = '#9aa0a6';
  h.style.marginTop = '6px';
  h.textContent = '아이디는 영어 소문자만 허용됩니다. 이메일 로그인도 가능합니다.';
  host.appendChild(h);
})();

form?.addEventListener('submit', async (e)=>{
  e.preventDefault();

  const raw = (idIn?.value || '').trim();
  const pwd = (pwdIn?.value || '');

  if (!raw || !pwd) {
    alert('아이디/이메일과 비밀번호를 입력해 주세요.');
    return;
  }

  const email = normalizeIdOrEmail(raw);
  if (!email) {
    alert('아이디는 영어 소문자만 가능합니다. (이메일은 그대로 입력 가능)');
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, pwd);
    location.href = 'index.html';
  } catch (err1) {
    // 과거 ‘첫 글자 잘림’ 계정 호환 보조 시도
    try {
      const legacy = dropFirstCharVariant(email);
      if (legacy !== email) {
        await signInWithEmailAndPassword(auth, legacy, pwd);
        location.href = 'index.html';
        return;
      }
      throw err1;
    } catch (err2) {
      alert('로그인 실패: ' + (err2?.message || err2));
    }
  }
});
