// js/firebase-init.js  (iOS Safari 대비: multi-persistence fallback)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  // iOS/Safari에서 IndexedDB 차단(프라이빗 모드 등) 대비
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdZwzeAB91VnR0yqZK9qcW6LsOdCfHm8U",
  authDomain: "copytube-daf30.firebaseapp.com",
  projectId: "copytube-daf30",
  storageBucket: "copytube-daf30.firebasestorage.app",
  messagingSenderId: "117023042089",
  appId: "1:117023042089:web:0546aa120f3ced3947ca38",
  measurementId: "G-CNPT9SCSYH"
};

const app = initializeApp(firebaseConfig);

// iOS 사파리(특히 프라이빗 모드)에서 IndexedDB가 막히면
// 기본 getAuth()가 내부에서 실패하면서 auth/network-request-failed가 날 수 있습니다.
// initializeAuth에 복수 퍼시스턴스를 주면, IndexedDB→localStorage→sessionStorage 순으로
// 자동 폴백하여 로그인 네트워크 호출이 정상 완료됩니다.
let auth;
try {
  auth = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
      browserSessionPersistence,
    ],
  });
} catch {
  // 이미 어딘가에서 getAuth(app)로 초기화된 경우 등
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
