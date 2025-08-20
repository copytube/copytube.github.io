// js/firebase-init.js
// Firebase SDK v12.x (CDN 모듈) 초기화

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/**
 * ⚠️ 프로젝트 SDK 설정값으로 교체 가능.
 * 사용자가 공유한 설정(예시):
 * projectId: copytube-daf30
 */
const firebaseConfig = {
  apiKey: "AIzaSyBdZwzeAB91VnR0yqZK9qcW6LsOdCfHm8U",
  authDomain: "copytube-daf30.firebaseapp.com",
  projectId: "copytube-daf30",
  storageBucket: "copytube-daf30.firebasestorage.app",
  messagingSenderId: "117023042089",
  appId: "1:117023042089:web:0546aa120f3ced3947ca38",
  measurementId: "G-CNPT9SCSYH"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
