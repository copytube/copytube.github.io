// js/signin.js — Hangul nickname sign-in supported, no inline hints

import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const form  = document.getElementById('signinForm');
const idIn  = document.getElementById('signinIdOrEmail');
const pwdIn = document.getElementById('signinPassword');

function isEmail(v){ return /.+@.+\..+/.test(String(v||'')); }

// 닉네임 정규화 키(NFC, 소문자, 공백 제거, 허용문자만)
// 허용: 한글(가-힣), 영문 a-z, 숫자 0-9, . _ -
function normalizeNickKey(raw=''){
  let s = String(raw).trim().normalize('NFC').toLowerCase();
  s = s.replace(/\s+/g, '');
  s = s.replace(/[^\p{Script=Hangul}a-z0-9._-]/gu, '');
  return s;
}

// 과거 영문 소문자 닉네임 계정 호환
function asciiLowerCandidate(raw){
  const t = String(raw).trim().toLowerCase();
  return /^[a-z]{2,20}$/.test(t) ? t : null;
}
function legacyDropFirstCandidate(asciiLower){
  if (!asciiLower) return null;
  if (asciiLower.length <= 1) return null;
  return asciiLower.slice(1);
}

async function resolveEmailFromInput(rawId){
  if (isEmail(rawId)) return String(rawId).trim(); // 이메일은 그대로

  const nickKey = normalizeNickKey(rawId);
  if (!nickKey) return null;

  // 새 체계: usernames/{nickKey}에서 email 역참조
  try{
    const ref = doc(db, 'usernames', nickKey);
    const snap = await getDoc(ref);
    if (snap.exists()){
      const data = snap.data() || {};
      if (data.email) return data.email;
    }
  }catch(e){ /* 네트워크 오류 시 레거시로 이어감 */ }

  // 레거시: 영문 닉 → nick@copytube.local
  const ascii = asciiLowerCandidate(rawId);
  if (ascii) return `${ascii}@copytube.local`;
  return null;
}

async function trySignInCandidates(pwd, candidates=[]){
  for (const email of candidates){
    try{
      await signInWithEmailAndPassword(auth, email, pwd);
      return true;
    }catch(e){ /* 다음 후보 */ }
  }
  return false;
}

form?.addEventListener('submit', async (e)=>{
  e.preventDefault();

  const raw = (idIn?.value || '').trim();
  const pwd = (pwdIn?.value || '');

  if (!raw || !pwd){
    alert('아이디/이메일과 비밀번호를 입력해 주세요.');
    return;
  }

  let email = await resolveEmailFromInput(raw);
  const tries = [];
  if (email) tries.push(email);

  // 레거시 보조(영문 닉/첫 글자 잘림)
  const ascii = asciiLowerCandidate(raw);
  const legacyDrop = legacyDropFirstCandidate(ascii);
  if (ascii && !tries.includes(`${ascii}@copytube.local`)){
    tries.push(`${ascii}@copytube.local`);
  }
  if (legacyDrop){
    const legacyEmail = `${legacyDrop}@copytube.local`;
    if (!tries.includes(legacyEmail)) tries.push(legacyEmail);
  }

  if (tries.length === 0){
    alert('아이디 또는 이메일 형식이 올바르지 않습니다.');
    return;
  }

  const ok = await trySignInCandidates(pwd, tries);
  if (ok){
    location.href = 'index.html';
  }else{
    alert('로그인에 실패했습니다. 아이디/이메일 또는 비밀번호를 다시 확인해 주세요.');
  }
});
