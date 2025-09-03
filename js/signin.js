<!-- 사용 페이지: signin.html 에서 type="module"로 로드 -->
<script type="module">
// js/signin.js — Hangul nickname sign-in supported, no hints

import { auth, db } from './firebase-init.js';
import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const form  = document.getElementById('signinForm');
const idIn  = document.getElementById('signinIdOrEmail');
const pwdIn = document.getElementById('signinPassword');

function isEmail(v){ return /.+@.+\..+/.test(String(v||'')); }

// 닉네임 정규화 키(NFC, 소문자화, 공백 제거, 허용문자만 남김)
// 허용: 한글(가-힣), 영문 a-z, 숫자 0-9, . _ -
function normalizeNickKey(raw=''){
  let s = String(raw).trim().normalize('NFC').toLowerCase();
  s = s.replace(/\s+/g, '');                           // 공백 제거
  s = s.replace(/[^\p{Script=Hangul}a-z0-9._-]/gu, ''); // 허용 외 제거
  return s;
}
// 기존(영문 소문자만) 계정 호환용: 전부 영소문자면 true
function asciiLowerCandidate(raw){
  const t = String(raw).trim().toLowerCase();
  return /^[a-z]{2,20}$/.test(t) ? t : null;
}
// 과거 ‘첫 글자 잘림’ 이슈 대응 후보
function legacyDropFirstCandidate(asciiLower){
  if (!asciiLower) return null;
  if (asciiLower.length <= 1) return null;
  return asciiLower.slice(1);
}

async function resolveEmailFromInput(rawId){
  // 이메일이면 그대로
  if (isEmail(rawId)) return String(rawId).trim();

  // 닉네임이면 usernames/{nickKey} 조회 → email 필드 사용
  const nickKey = normalizeNickKey(rawId);
  if (!nickKey) return null;

  try{
    const ref = doc(db, 'usernames', nickKey);
    const snap = await getDoc(ref);
    if (snap.exists()){
      const data = snap.data() || {};
      if (data.email) return data.email; // 새 체계: 무작위 합성 이메일 저장
    }
  }catch(e){ /* 네트워크 오류 시 아래 레거시로 진행 */ }

  // 레거시(과거 영소문자 닉네임 = nick@copytube.local)
  const ascii = asciiLowerCandidate(rawId);
  if (ascii) return `${ascii}@copytube.local`;

  return null;
}

async function trySignInCandidates(pwd, candidates=[]){
  for (const email of candidates){
    try{
      await signInWithEmailAndPassword(auth, email, pwd);
      return true; // 성공
    }catch(e){ /* 다음 후보 시도 */ }
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

  // 1차: 정상 경로(한글 닉/이메일)
  let email = await resolveEmailFromInput(raw);
  const tries = [];
  if (email) tries.push(email);

  // 2차: 레거시 보조(영문 닉네임 체계 + 첫 글자 잘림 보정)
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
</script>
