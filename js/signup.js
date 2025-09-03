<!-- 사용 페이지: signup.html 에서 type="module"로 로드 -->
<script type="module">
// js/signup.js — Hangul nickname allowed + password confirm

import { auth, db } from './firebase-init.js';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  deleteUser
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const $ = (s)=>document.querySelector(s);
const form   = $('#signupForm');
const idBox  = $('#signupIdOrEmail');
const pwBox  = $('#signupPassword');
const pw2Box = $('#signupPassword2');

function isEmail(v){ return /.+@.+\..+/.test(v); }

// 닉네임 정규화 키(NFC, 소문자화, 공백 제거, 허용문자만 남김)
// 허용: 한글(가-힣), 영문 a-z, 숫자 0-9, . _ -
function normalizeNickKey(raw=''){
  let s = String(raw).trim().normalize('NFC').toLowerCase();
  s = s.replace(/\s+/g, '');
  s = s.replace(/[^\p{Script=Hangul}a-z0-9._-]/gu, '');
  return s;
}
// 닉네임 표시용(원문) 검증: 공백 금지 + 허용문자만
function isDisplayNickValid(raw){
  if (!raw) return false;
  if (/\s/.test(raw)) return false;
  return /^[\p{Script=Hangul}A-Za-z0-9._-]{2,20}$/u.test(raw);
}

function randomHex(nBytes=8){
  const a = new Uint8Array(nBytes);
  crypto.getRandomValues(a);
  return Array.from(a, x=>x.toString(16).padStart(2,'0')).join('');
}
// 새 체계: 닉네임 기반이 아닌 무작위 합성 이메일(유니코드 이슈 회피)
function synthEmail(){
  return `u-${randomHex(10)}@copytube.local`;
}

async function ensureNickAvailable(nickKey){
  try{
    const snap = await getDoc(doc(db,'usernames', nickKey));
    return !snap.exists();
  }catch{
    return false;
  }
}

async function claimNickMapping(nickKey, payload){
  // Rules에서 존재하면 create 불가하도록 설정되어 있어야 합니다.
  await setDoc(doc(db,'usernames', nickKey), payload);
}

async function createUserDoc(uid, displayName){
  try{
    await setDoc(doc(db,'users', uid), {
      displayName,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    }, { merge: true });
  }catch(e){
    console.warn('users doc write failed:', e);
  }
}

form?.addEventListener('submit', async (e)=>{
  e.preventDefault();

  const rawId = idBox.value?.trim();
  const pw1   = pwBox.value || '';
  const pw2   = pw2Box.value || '';

  if (!rawId || !pw1 || !pw2){
    alert('아이디(또는 이메일), 비밀번호, 비밀번호 확인을 모두 입력해 주세요.');
    return;
  }
  if (pw1 !== pw2){
    alert('비밀번호가 서로 일치하지 않습니다.');
    pw2Box.focus();
    return;
  }

  // 이메일 가입 경로
  if (isEmail(rawId)){
    try{
      const cred = await createUserWithEmailAndPassword(auth, rawId, pw1);
      const user = cred.user;
      const displayName = String(rawId).split('@')[0]; // 기본 표기명
      try{ await updateProfile(user, { displayName }); }catch{}
      await createUserDoc(user.uid, displayName);
      location.href = 'index.html';
    }catch(err){
      alert(readableError(err));
    }
    return;
  }

  // 닉네임 가입 경로(한글/영문/숫자 2~20자, 공백 불가)
  if (!isDisplayNickValid(rawId)){
    alert('아이디(닉네임)는 한글/영문/숫자 2~20자, 공백 없이 입력해 주세요. (허용: . _ -)');
    return;
  }
  const nickKey = normalizeNickKey(rawId);
  if (!nickKey || nickKey.length < 2 || nickKey.length > 20){
    alert('아이디(닉네임) 길이는 2~20자여야 합니다.');
    return;
  }

  const free = await ensureNickAvailable(nickKey);
  if (!free){
    alert('이미 사용 중인 아이디입니다. 다른 아이디를 선택해 주세요.');
    return;
  }

  const emailSynth = synthEmail();

  try{
    // 1) 계정 생성
    const cred = await createUserWithEmailAndPassword(auth, emailSynth, pw1);
    const user = cred.user;

    // 2) 사용자 프로필/문서
    try{ await updateProfile(user, { displayName: rawId }); }catch{}
    await createUserDoc(user.uid, rawId);

    // 3) usernames 맵핑(유일)
    try{
      await claimNickMapping(nickKey, {
        uid: user.uid,
        email: emailSynth,     // 로그인 시 역참조용(중요)
        nick: rawId,           // 표시용 원문 닉네임
        nickKey,               // 정규화 키
        createdAt: serverTimestamp()
      });
    }catch(mapErr){
      // 레이스 충돌 시 계정 롤백
      try{ await deleteUser(user); }catch{}
      alert('해당 아이디가 방금 다른 사람에게 선점되었습니다. 다시 시도해 주세요.');
      return;
    }

    // 성공
    location.href = 'index.html';
  }catch(err){
    alert(readableError(err));
  }
});

function readableError(e){
  const code = e?.code || '';
  const msg  = e?.message || '';

  if (code.includes('auth/email-already-in-use')) return '이미 사용 중인 이메일입니다.';
  if (code.includes('auth/weak-password'))       return '비밀번호가 너무 짧습니다. (최소 6자)';
  if (code.includes('auth/invalid-email'))       return '이메일 형식이 올바르지 않습니다.';
  if (code.includes('auth/network-request-failed')) return '네트워크 오류입니다. 잠시 후 다시 시도해 주세요.';
  return msg || '알 수 없는 오류가 발생했습니다.';
}
</script>
