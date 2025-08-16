// js/auth.js
export { auth, db } from './firebase-init.js';

export {
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

export {
  doc, getDoc, setDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/** 이메일/닉네임 입력을 Firebase가 이해하는 이메일로 정규화 */
export function normalizeLoginId(raw) {
  const id = raw.trim();
  if (id.includes('@')) {
    return { emailLike: id, idType: 'email' };
  } else {
    const local = id.toLowerCase();
    return { emailLike: `${local}@copytube.local`, idType: 'nickname' };
  }
}

/** 닉네임 검증: 2~20자, 한글/영문/숫자/[-_.] 허용 */
export function sanitizeNickname(raw) {
  const s = raw.trim();
  const ok = /^[\w\-\._가-힣]{2,20}$/u.test(s);
  return ok ? s : '';
}
