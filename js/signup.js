// js/signup.js  (v1.6.0 — rules 호환: usernames/nameLower 필드 추가, users.createdAt 포함)
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

function isEmail(v){
  return /.+@.+\..+/.test(v);
}
function toNickLower(raw){
  return String(raw||'').trim().toLowerCase();
}
function isValidNick(nickLower){
  // 영소문자만 (2~20자)
  return /^[a-z]{2,20}$/.test(nickLower);
}
function synthEmailFromNick(nickLower){
  // Firebase는 이메일이 필요하므로 내부용 도메인으로 전환
  return `${nickLower}@copytube.local`;
}

async function ensureNickAvailable(nickLower){
  try{
    const snap = await getDoc(doc(db,'usernames', nickLower));
    return !snap.exists();
  }catch{
    return false; // 네트워크 이슈 시 보수적으로 불가 처리
  }
}

// 규칙 요구에 맞게: uid, nameLower, createdAt 포함
async function claimNickMapping(uid, nickLower){
  await setDoc(doc(db,'usernames', nickLower), {
    uid,
    nameLower: nickLower,
    createdAt: serverTimestamp()
  });
}

// 규칙 요구에 맞게: uid, createdAt 포함
async function createUserDoc(uid, displayName){
  try{
    await setDoc(doc(db,'users', uid), {
      uid,
      displayName,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    }, { merge: true });
  }catch(e){
    console.warn('users doc write failed:', e);
  }
}

function readableError(e){
  const code = e?.code || '';
  const msg  = e?.message || '';

  if (code.includes('auth/email-already-in-use')) return '이미 사용 중인 이메일입니다.';
  if (code.includes('auth/weak-password'))       return '비밀번호가 너무 짧습니다. (Firebase 정책: 최소 6자)';
  if (code.includes('auth/invalid-email'))       return '이메일 형식이 올바르지 않습니다.';
  if (code.includes('auth/network-request-failed')) return '네트워크 오류입니다. 잠시 후 다시 시도해 주세요.';
  return msg || '알 수 없는 오류가 발생했습니다.';
}

form?.addEventListener('submit', async (e)=>{
  e.preventDefault();

  const rawId = idBox.value;
  const password = pwBox.value;

  if(!rawId || !password){
    alert('아이디(또는 이메일)와 비밀번호를 입력해 주세요.');
    return;
  }

  // (1) 이메일 가입
  if (isEmail(rawId)){
    try{
      const email = rawId.trim().toLowerCase();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      // displayName: 이메일 앞부분 기본
      const displayName = email.split('@')[0];
      try{ await updateProfile(user, { displayName }); }catch{}

      await createUserDoc(user.uid, displayName);
      location.href = 'index.html';
    }catch(err){
      console.error(err);
      alert(readableError(err));
    }
    return;
  }

  // (2) 닉네임(영소문자) 가입
  const nickLower = toNickLower(rawId);
  if (!isValidNick(nickLower)){
    alert('아이디는 영어 소문자 2~20자로 입력해 주세요.');
    return;
  }

  // 사전 중복 확인 (레이스 대비)
  const free = await ensureNickAvailable(nickLower);
  if (!free){
    alert('이미 사용 중인 아이디입니다. 다른 아이디를 선택해 주세요.');
    return;
  }

  const emailSynth = synthEmailFromNick(nickLower);

  try{
    // 1) 계정 생성
    const cred = await createUserWithEmailAndPassword(auth, emailSynth, password);
    const user = cred.user;

    // 2) 사용자 프로필
    try{ await updateProfile(user, { displayName: nickLower }); }catch{}
    await createUserDoc(user.uid, nickLower);

    // 3) usernames 맵핑(유일). 규칙 상 이미 존재하면 실패 → 계정 롤백
    try{
      await claimNickMapping(user.uid, nickLower);
    }catch(mapErr){
      console.error('mapping failed, rolling back user:', mapErr);
      try{ await deleteUser(user); }catch{}
      alert('해당 아이디가 방금 다른 분에게 선점되었습니다. 다시 시도해 주세요.');
      return;
    }

    // 성공
    location.href = 'index.html';

  }catch(err){
    console.error(err);
    alert(readableError(err));
  }
});
