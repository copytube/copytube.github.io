/* list.js
 * - 로그인 없이도 읽기 가능(보안은 Firestore 규칙에서 공개 읽기 대상만 허용 전제)
 * - index 선택 카테고리(localStorage 'selectedCats')를 기준으로 필터링
 * - 검색(제목/URL 포함) 지원
 * - 카드 2열: 왼쪽(제목/URL/칩), 오른쪽(썸네일)
 * - 썸네일 클릭 → watch.html 로 이동 + 현재 필터링된 목록 큐를 sessionStorage에 전달
 *   (watch.js에서 세로 스와이프 이전/다음 구현 시 sessionStorage의 playQueue/playIndex 사용)
 */

import { app, db, auth } from './firebase-init.js';      // 프로젝트 기존 모듈 사용
// auth 상태는 유지만 하면 되므로 추가 작업 불필요. 필요 시 import './auth.js' 로 헤더 표시 유지 가능.
// import './auth.js';
import {
  collection, getDocs, query, orderBy, limit, startAfter
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// === 설정: 컬렉션 이름(프로젝트 구조에 맞게 필요시 수정) =========================
const COLLECTION_NAME = 'videos'; // manage-uploads와 동일한 문서 구조를 가정 (title,url,categories[],createdAt,thumbnail 등)

// === 상태 ====================================================================
let allDocs = [];        // Firestore에서 가져온 전체(페이지 분할 누적)
let lastCursor = null;   // 페이지네이션 커서
let reachedEnd = false;

const PAGE_SIZE = 60;    // 1회 로드 개수(필요 시 조정)

// === DOM =====================================================================
const $q        = document.getElementById('q');
const $btnSearch= document.getElementById('btnSearch');
const $btnClear = document.getElementById('btnClear');
const $cards    = document.getElementById('cards');
const $msg      = document.getElementById('resultMsg');
const $btnMore  = document.getElementById('btnMore');

// === 유틸: 카테고리 라벨 조회 (categories.js가 노출하는 전역을 시도하고, 없으면 key 그대로) ===
function getCategoryLabel(key) {
  // 가능한 전역 후보들을 점검(프로젝트마다 네이밍이 조금씩 달 수 있어 방어적으로 처리)
  if (window.CATEGORIES?.labelMap?.[key]) return window.CATEGORIES.labelMap[key];
  if (window.CATEGORY_LABELS?.[key]) return window.CATEGORY_LABELS[key];
  if (window.COPYTUBE?.categories?.labels?.[key]) return window.COPYTUBE.categories.labels[key];
  // 일부 페이지는 categories.js에서 getLabel(key)를 제공할 수도 있음
  try {
    if (typeof window.getLabel === 'function') return window.getLabel(key) ?? key;
  } catch (_) {}
  return key;
}

// === 유틸: YouTube 썸네일/ID 추출 =================================================
function extractYouTubeId(rawUrl='') {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace('/', '');
    }
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return id;
      // /shorts/{id} 형태
      const m = u.pathname.match(/\/shorts\/([^/]+)/);
      if (m) return m[1];
    }
  } catch (_) { /* not a valid URL */ }
  return ''; // 실패 시 빈 문자열
}
function toThumb(url, fallback='') {
  const id = extractYouTubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : (fallback || '');
}

// === 인덱스에서 선택된 카테고리 가져오기 ==========================================
function loadSelectedCats() {
  try {
    const s = localStorage.getItem('selectedCats');
    if (!s) return [];
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return [];
}

// === Firestore 로드 (페이지 단위) ================================================
async function loadPage() {
  if (reachedEnd) return;

  const baseQ = lastCursor
    ? query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'), startAfter(lastCursor), limit(PAGE_SIZE))
    : query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

  const snap = await getDocs(baseQ);
  if (snap.empty) {
    reachedEnd = true;
    toggleMore(false);
    return;
  }

  const batch = [];
  snap.forEach(doc => {
    const d = doc.data();
    batch.push({
      id: doc.id,
      title: d.title || '(제목 없음)',
      url: d.url || '',
      cats: Array.isArray(d.categories) ? d.categories : [],
      thumb: d.thumbnail || toThumb(d.url),
      createdAt: d.createdAt || null,
    });
  });

  allDocs = allDocs.concat(batch);
  lastCursor = snap.docs[snap.docs.length - 1];
  toggleMore(true);
}

// === 렌더링 / 필터링 ============================================================
function render() {
  const cats = loadSelectedCats();
  const q = ($q.value || '').trim().toLowerCase();

  // 카테고리 필터
  let list = cats.length
    ? allDocs.filter(v => v.cats?.some(c => cats.includes(c)))
    : allDocs.slice();

  // 검색어 필터(제목/URL)
  if (q) {
    list = list.filter(v => (v.title || '').toLowerCase().includes(q) || (v.url || '').toLowerCase().includes(q));
  }

  // 화면 렌더
  $cards.innerHTML = '';
  if (list.length === 0) {
    $cards.innerHTML = `<div style="color:var(--muted,#9aa0a6);padding:16px;border:1px dashed var(--border,#333);border-radius:12px;">결과가 없습니다.</div>`;
    $msg.textContent = '0건';
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((v, idx) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="left">
        <div class="title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
        <div class="url" title="${escapeHtml(v.url)}">${escapeHtml(v.url)}</div>
        <div class="chips">${(v.cats || []).map(c => `<span class="chip" title="${escapeHtml(c)}">${escapeHtml(getCategoryLabel(c))}</span>`).join('')}</div>
      </div>
      <div class="right">
        <div class="thumb-wrap">
          <img class="thumb" alt="썸네일" loading="lazy" src="${escapeAttr(v.thumb || toThumb(v.url))}">
        </div>
      </div>
    `;
    // 썸네일 클릭 시: watch로 이동 + 큐 전달
    const thumb = card.querySelector('.thumb');
    thumb.addEventListener('click', () => openInWatch(list, idx));

    frag.appendChild(card);
  });
  $cards.appendChild(frag);
  $msg.textContent = `${list.length}건`;
}

// === watch로 이동(현재 목록 큐 전달) =============================================
function openInWatch(list, index) {
  // 큐: 최소한 id와 url 정도만 넘겨도 되지만, watch에서 title/카테고리도 쓸 수 있게 전달
  const queue = list.map(v => ({ id: v.id, url: v.url, title: v.title, cats: v.cats }));
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(index));

  // docId 파라미터로도 넘겨서 watch가 바로 해당 문서를 로드할 수 있게 함
  const docId = encodeURIComponent(list[index].id);
  location.href = `watch.html?doc=${docId}`;
}

// === 이벤트 =====================================================================
$q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    render();
  }
});
$btnSearch.addEventListener('click', () => render());
$btnClear.addEventListener('click', () => { $q.value = ''; render(); });

$btnMore.addEventListener('click', async () => {
  $btnMore.disabled = true; $btnMore.textContent = '불러오는 중…';
  try {
    await loadPage();
    render();
  } finally {
    $btnMore.disabled = false; $btnMore.textContent = '더 보기';
  }
});

// === 초기화 =====================================================================
(async function init() {
  try {
    // 첫 페이지 로드
    await loadPage();
    render();
  } catch (err) {
    console.error(err);
    $msg.textContent = '목록을 불러오지 못했습니다.';
    $cards.innerHTML = `<div style="color:#ff6b6b;padding:16px;border:1px dashed var(--border,#333);border-radius:12px;">
      오류가 발생했습니다. 콘솔을 확인해 주세요.
    </div>`;
  }
})();

// === 헬퍼 =======================================================================
function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s='') { return escapeHtml(s); }

function toggleMore(show) {
  $btnMore.style.display = show && !reachedEnd ? '' : 'none';
}
