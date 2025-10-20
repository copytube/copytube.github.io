// js/admin-export.js — v1.1 (CopyTube v1.5 호환)
// - Firebase v12.1.0로 통일
// - categories.js의 CATEGORY_MODEL/children[{value,label}]까지 안전 지원
// - 4자리 코드(1000~9999) 보장 + 충돌 순환
// - 추출 중 버튼 중복 클릭 방지

import { auth, db } from "./firebase-init.js";
import {
  collection, getDocs, query, orderBy, limit, startAfter, doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* ===== 설정 ===== */
const VIDEO_COLL = "videos";

/* ===== 관리자 게이트 ===== */
async function isAdmin(uid) {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    return snap.exists();
  } catch (e) {
    console.error("isAdmin error:", e);
    return false;
  }
}
function deny() {
  alert("관리자만 접근 가능합니다.");
  location.href = "index.html";
}

/* ===== 카테고리 로딩 & 코드 매핑 =====
   - categories.js가 CATEGORY_MODEL(CopyTube v1.5) 또는 CATEGORIES를 export한다고 가정
   - 실패 시: DB cats 스캔으로 키 추정
*/
// (교체) loadCategoriesSafe
async function loadCategoriesSafe() {
  try {
    const mod = await import("./categories.js");
    // CopyTube 우선순위: CATEGORIES / CATEGORY_GROUPS / default
    const MODEL = mod.CATEGORIES || mod.CATEGORY_GROUPS || mod.default || null;
    if (!MODEL) throw new Error("CATEGORIES/CATEGORY_GROUPS export not found");
    return flattenCatsUniversal(MODEL); // 아래 2번에서 정의
  } catch (e) {
    console.warn("categories.js 로드 실패. DB 스캔으로 대체:", e);
    const keys = await scanCategoryKeysFromDB();
    return keys.map(k => ({ key: k, label: k }));
  }
}


/** CATEGORY_MODEL/CATEGORIES 어떤 형태도 최대한 수용:
 *  - 그룹: { key, label, children:[...] } or { id, ... }
 *  - 카테고리 항목: { value, label } or { key, label }
 */
// (교체) flattenCatsUniversal
function flattenCatsUniversal(model) {
  const out = [];
  const seen = new Set();

  const push = (k, label) => {
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ key: k, label: label || k });
  };

  const dfs = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(dfs); return; }
    if (typeof node !== "object") return;

    // CopyTube: { value, label } / 과거 호환: { key, label }
    const maybeKey = node.value || node.key;
    const maybeLabel = node.label || node.name || node.title;
    if (typeof maybeKey === "string") push(maybeKey, maybeLabel);

    // 흔한 중첩 컨테이너
    if (node.children) dfs(node.children);
    if (node.groups)   dfs(node.groups);
    if (node.items)    dfs(node.items);
    if (node.types)    dfs(node.types);

    // 기타 중첩 객체(광범위 탐색)
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === "object" && !["children","groups","items","types"].includes(k)) {
        dfs(v);
      }
    }
  };

  dfs(model);
  return out;
}


  dfs(model);
  return out;
}

async function scanCategoryKeysFromDB() {
  const keys = new Set();
  try {
    const q = query(collection(db, VIDEO_COLL), orderBy("createdAt"), limit(2000));
    const snap = await getDocs(q);
    snap.forEach(d => {
      const cats = d.data().cats || [];
      cats.forEach(k => keys.add(k));
    });
  } catch (e) {
    console.error("scanCategoryKeysFromDB failed:", e);
  }
  return [...keys].sort();
}

/* ===== 안정적 4자리 숫자 코드 =====
   - DJB2 해시 → 1000~9999
   - 충돌 시 1000~9999 범위 내에서 순환
*/
function keyToCodeStable4(key) {
  let h = 5381;
  for (const ch of key) h = ((h << 5) + h) + ch.charCodeAt(0);
  const base = (h >>> 0) % 9000;           // 0..8999
  return String(base + 1000);              // 1000..9999
}

function bump4(codeStr) {
  // 1000..9999 내에서 +1 순환
  const n = ((parseInt(codeStr, 10) - 1000 + 1) % 9000) + 1000;
  return String(n);
}

function buildCodeMaps(keys) {
  const sorted = [...keys].sort();
  const used = new Set();
  const keyToCode = new Map();
  const codeToKey = new Map();

  for (const k of sorted) {
    let c = keyToCodeStable4(k);
    let guard = 0;
    while (used.has(c) && guard < 9001) {
      c = bump4(c); // 항상 4자리 유지
      guard++;
    }
    used.add(c);
    keyToCode.set(k, c);
    codeToKey.set(c, k);
  }
  return { keyToCode, codeToKey };
}

/* ===== UI ===== */
const $  = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

let ABORT = false;
let RUNNING = false;

function setRunning(on) {
  RUNNING = on;
  $("#btnExtract").disabled  = on;
  $("#btnStop").disabled     = !on;
  $("#btnCopy").disabled     = on;
  $("#btnDownload").disabled = on;
  $("#btnClear").disabled    = on;
  $("#batchSize").disabled   = on;
}

async function renderCodeTable(list, keyToCode) {
  const tb = $("#codeTable tbody");
  tb.innerHTML = "";
  for (const { key, label } of list) {
    const tr = document.createElement("tr");
    const code = keyToCode.get(key) || "";
    tr.innerHTML = `<td>${code}</td><td>${key}</td><td>${label || ""}</td>`;
    tb.appendChild(tr);
  }
}

async function extractAll(batchSize, keyToCode) {
  ABORT = false;
  setRunning(true);
  $("#exportBox").value = "";
  $("#stat").textContent = "추출 중…";
  let cursor = null;
  let total = 0;

  const append = (lines) => {
    if (!lines.length) return;
    const ta = $("#exportBox");
    ta.value += (ta.value ? "\n" : "") + lines.join("\n");
  };

  try {
    while (!ABORT) {
      const qy = cursor
        ? query(collection(db, VIDEO_COLL), orderBy("createdAt"), startAfter(cursor), limit(batchSize))
        : query(collection(db, VIDEO_COLL), orderBy("createdAt"), limit(batchSize));

      const snap = await getDocs(qy);
      if (snap.empty) break;

      const lines = [];
      snap.forEach(docu => {
        const d = docu.data();
        const url = d.url || "";
        const cats = Array.isArray(d.cats) ? d.cats : [];
        const codes = cats.map(k => keyToCode.get(k)).filter(Boolean);
        if (url) lines.push([url, ...codes].join(" ").trim());
      });

      append(lines);
      total += lines.length;
      $("#stat").textContent = `총 ${total}개 내보냄`;

      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < batchSize) break; // 마지막 배치
    }

    $("#stat").textContent = ABORT ? `중지됨 (현재 ${total}개까지)` : `완료 (총 ${total}개)`;
  } catch (e) {
    console.error(e);
    $("#stat").textContent = `오류 발생: ${e?.message || e}`;
  } finally {
    setRunning(false);
  }
}

function copyText() {
  const txt = $("#exportBox").value;
  navigator.clipboard.writeText(txt).then(() => {
    alert("복사되었습니다.");
  });
}

function downloadTxt() {
  const blob = new Blob([$("#exportBox").value], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `copytube-export-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ===== init ===== */
onAuthStateChanged(auth, async (user) => {
  if (!user || !(await isAdmin(user.uid))) return deny();

  const catsList = await loadCategoriesSafe();               // [{key,label}...]
  const { keyToCode } = buildCodeMaps(catsList.map(x => x.key));
  await renderCodeTable(catsList, keyToCode);

  $("#btnExtract").addEventListener("click", async () => {
    const bs = parseInt($("#batchSize").value || "500", 10);
    if (RUNNING) return;
    await extractAll(bs, keyToCode);
  });
  $("#btnStop").addEventListener("click", () => { ABORT = true; });
  $("#btnCopy").addEventListener("click", copyText);
  $("#btnDownload").addEventListener("click", downloadTxt);
  $("#btnClear").addEventListener("click", () => {
    if (RUNNING) return;
    $("#exportBox").value = "";
    $("#stat").textContent = "대기중";
  });
});
