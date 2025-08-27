// js/signup.js
import { auth } from './firebase-init.js';
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  normalizeIdOrEmail,
  isValidSimpleId,
} from './auth-util.js';

// 폼 요소 id (페이지와 일치해야 합니다)
const form  = document.getElementById('signupForm');
const idIn  = document.getElementById('signupIdOrEmail');
const pwdIn = document.getElementById('signupPassword');

if (!form || !idIn || !pwdIn) {
  console.warn('[signup] 필요한 폼 요소를 찾을 수 없습니다. (signupForm / signupIdOrEmail / signupPassword)');
}

// 입력란 아래에 안내문 삽입
function injectHint(afterEl, text, id) {
  if (!afterEl || !afterEl.parentElement) return;
  // 이미 있으면 갱신
  let hint = id ? document.getElementById(id) : null;
  if (!hint) {
    hint = document.createElement('div');
    if (id) hint.id = id;
    hint.style.fontSize = '12px';
    hint.style.color = '#9aa0a6';
    hint.style.marginTop = '6px';
    afterEl.parentElement.appendChild(hint);
  }
  hint.textContent = text;
}

// 초기 안내문
injectHint(
  idIn,
  '아이디 사용 시: 영어 소문자만 가능 (예: timelord). 이메일도 입력 가능합니다.',
  'idHint'
);
injectHint(
  pwdIn,
  '비밀번호 안내: Firebase 정책상 최소 6자 이상이어야 합니다.',
  'pwdHint'
);

// 아이디 입력 중 실시간 정리(공백 제거, 소문자화)
// 이메일은 그대로 두고, '@' 없는 경우만 영어 소문자 이외 문자를 제거(안내 목적)
idIn?.addEventListener('input', ()=>{
  const v = idIn.value.trim();
  if (!v.includes('@')) {
    const cleaned = v.toLowerCase().replace(/[^a-z@]/g, '').replace(/^@+/, '@');
    if (cleaned !== v) idIn.value = cleaned;
  }
});

form?.addEventListener('submit', async (e)=>{
  e.preventDefault();

  const raw = (idIn?.value || '').trim();
  const pwd = (pwdIn?.value || '');

  if (!raw) {
    alert('아이디(또는 이메일)를 입력해 주세요.');
    return;
  }
  if (!pwd) {
    alert('비밀번호를 입력해 주세요.');
    return;
  }

  // 이메일/아이디 정규화
  let email = '';
  if (raw.includes('@')) {
    // 이메일 허용
    email = raw.toLowerCase();
  } else {
    // 아이디: 영어 소문자만 허용
    const idOnly = raw.startsWith('@') ? raw.slice(1) : raw;
    if (!isValidSimpleId(idOnly.toLowerCase())) {
      alert('영어 아이디만 가능합니다. (a~z 소문자)');
      return;
    }
    email = normalizeIdOrEmail(raw);
  }

  // Firebase 제약: 최소 6자
  if (pwd.length < 6) {
    alert('비밀번호는 최소 6자 이상이어야 합니다. (Firebase 제한)');
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pwd);
    // displayName = 이메일 로컬파트
    const username = (email.split('@')[0] || '').toLowerCase();
    try { await updateProfile(cred.user, { displayName: username }); } catch {}
    location.href = 'index.html';
  } catch (err) {
    // weak-password 등 모든 에러를 사용자 친화적으로
    const msg = String(err?.message || err);
    if (/weak-password/i.test(msg)) {
      alert('비밀번호가 너무 짧습니다. 최소 6자 이상으로 설정해 주세요. (Firebase 제한)');
    } else if (/email-already-in-use/i.test(msg)) {
      alert('이미 사용 중인 아이디/이메일입니다.');
    } else if (/invalid-email/i.test(msg)) {
      alert('유효하지 않은 이메일 형식입니다.');
    } else {
      alert('회원가입 실패: ' + msg);
    }
  }
});
