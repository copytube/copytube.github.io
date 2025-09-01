// js/auth.js  (v1.6.0 — rules 호환: createdAt 필수/관리자 판별 유틸 포함)
import { auth, db } from './firebase-init.js?v=1.5.1';
export { auth, db };

import {
  onAuthStateChanged as _onAuthStateChanged,
  signInWithEmailAndPassword as _signInWithEmailAndPassword,
  createUserWithEmailAndPassword as _createUserWithEmailAndPassword,
  updateProfile as _updateProfile,
  deleteUser as _deleteUser,
  signOut as _signOut,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  doc, runTransaction, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// re-export: 페이지들이 직접 가져다 쓰는 유틸
export { doc, runTransaction, serverTimestamp };

/* ----------------- helpers ----------------- */
// 닉네임 허용: 한글/영문/숫자/[-_.], 길이 2~20
export function sanitizeNickname(raw){
  const s = String(raw||'').trim();
  if (!s) return '';
  if (!/^[\w가-힣\-_.]{2,20}$/.test(s)) return '';
  return s;
}

// 과거 코드 호환용: 아이디를 내부 도메인 이메일로 전환
export function normalizeLoginId(raw){
  const s = String(raw||'').trim();
  const emailLike = s.includes('@') ? s : `${s.toLowerCase()}@copytube.local`;
  return { emailLike };
}

/* ----------------- auth wrappers ----------------- */
export const onAuthStateChanged = _onAuthStateChanged;
export const signInWithEmailAndPassword = _signInWithEmailAndPassword;
export const createUserWithEmailAndPassword = _createUserWithEmailAndPassword;
export const updateProfile = _updateProfile;
export const deleteUser = _deleteUser;
export const signOut = _signOut;

/* ----------------- Firestore profile helpers ----------------- */
// /users/{uid} 문서를 규칙에 맞게 생성/갱신
export async function ensureUserDoc(uid, displayName){
  if (!uid) return;
  try{
    await setDoc(doc(db,'users', uid), {
      uid,
      displayName: displayName || '회원',
      createdAt: serverTimestamp(),   // 규칙: create 시 필요
      updatedAt: serverTimestamp()
    }, { merge:true });
  }catch(e){
    console.warn('[auth.ensureUserDoc] failed:', e);
  }
}

// 현재 로그인 사용자가 관리자(admns/{uid} 존재)인지 확인
export async function isCurrentUserAdmin(){
  const user = auth.currentUser;
  if (!user) return false;
  try{
    const snap = await getDoc(doc(db,'admins', user.uid));
    return snap.exists();
  }catch(e){
    console.warn('[auth.isCurrentUserAdmin] failed:', e);
    return false;
  }
}

// onAuthStateChanged 래퍼: 관리자 여부까지 함께 콜백
export function watchAuth(onChanged){
  return _onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onChanged?.({ user: null, isAdmin: false });
      return;
    }
    let isAdmin = false;
    try{
      const snap = await getDoc(doc(db,'admins', user.uid));
      isAdmin = snap.exists();
    }catch{}
    onChanged?.({ user, isAdmin });
  });
}
