// js/category-order.js  (모바일 3열 고정 + 드래그앤드롭/탭-스왑 + groupOrderV1 저장)
import { CATEGORY_GROUPS } from './categories.js';

const GROUP_ORDER_KEY = 'groupOrderV1';
const grid = document.getElementById('grid');

function loadSavedOrder() {
  try {
    const raw = localStorage.getItem(GROUP_ORDER_KEY);
    const arr = JSON.parse(raw || 'null');
    if (Array.isArray(arr) && arr.length) return arr;
  } catch {}
  return CATEGORY_GROUPS.map(g => g.key); // 기본 순서
}

function saveOrder(keys) {
  localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(keys));
}

function buildTiles(orderKeys) {
  const map = new Map(CATEGORY_GROUPS.map(g => [g.key, g]));
  const frags = document.createDocumentFragment();
  for (const key of orderKeys) {
    const g = map.get(key);
    if (!g) continue;
    const item = document.createElement('div');
    item.className = 'item';
    item.draggable = true; // 데스크톱 DnD
    item.dataset.key = g.key;
    // (요청) 코딩값은 표시하지 않고, 라벨만
    item.innerHTML = `<span class="title">${g.label}</span>`;
    frags.appendChild(item);
  }
  grid.innerHTML = '';
  grid.appendChild(frags);
}

function currentOrder() {
  return Array.from(grid.children).map(el => el.dataset.key);
}

/* --- 드래그앤드롭 (데스크톱) --- */
let draggingEl = null;

grid.addEventListener('dragstart', (e) => {
  const target = e.target.closest('.item');
  if (!target) return;
  draggingEl = target;
  target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // 파이어폭스 등 호환
  e.dataTransfer.setData('text/plain', target.dataset.key);
});

grid.addEventListener('dragend', () => {
  if (draggingEl) draggingEl.classList.remove('dragging');
  draggingEl = null;
  clearDropTargets();
});

grid.addEventListener('dragover', (e) => {
  e.preventDefault(); // drop 허용
  const target = e.target.closest('.item');
  if (!target || target === draggingEl) return;
  markDropTarget(target);
  const rect = target.getBoundingClientRect();
  const before = (e.clientY - rect.top) < (rect.height / 2);
  if (before) grid.insertBefore(draggingEl, target);
  else grid.insertBefore(draggingEl, target.nextSibling);
});

grid.addEventListener('drop', (e) => {
  e.preventDefault();
  clearDropTargets();
});

function markDropTarget(el){
  grid.querySelectorAll('.drop-target').forEach(x=> x.classList.remove('drop-target'));
  el.classList.add('drop-target');
}
function clearDropTargets(){
  grid.querySelectorAll('.drop-target').forEach(x=> x.classList.remove('drop-target'));
}

/* --- 모바일/터치: 탭 두 번으로 스왑 --- */
let selectedEl = null;

grid.addEventListener('click', (e) => {
  const tile = e.target.closest('.item');
  if (!tile) return;

  if (!selectedEl) {
    selectedEl = tile;
    tile.classList.add('selected');
    return;
  }

  if (selectedEl === tile) {
    // 같은 타일 다시 탭 → 선택 해제
    tile.classList.remove('selected');
    selectedEl = null;
    return;
  }

  // 서로 자리 바꾸기
  const a = selectedEl;
  const b = tile;

  const aNext = a.nextSibling;
  const bNext = b.nextSibling;
  const parent = a.parentNode;

  if (aNext === b) {
    parent.insertBefore(b, a);
  } else if (bNext === a) {
    parent.insertBefore(a, b);
  } else {
    parent.insertBefore(a, bNext);
    parent.insertBefore(b, aNext);
  }

  a.classList.remove('selected');
  selectedEl = null;
});

/* --- 버튼 --- */
document.getElementById('btnReset')?.addEventListener('click', () => {
  const def = CATEGORY_GROUPS.map(g => g.key);
  buildTiles(def);
  saveOrder(def);
});

document.getElementById('btnSave')?.addEventListener('click', () => {
  const ord = currentOrder();
  saveOrder(ord);
  // 가벼운 피드백
  const btn = document.getElementById('btnSave');
  const old = btn.textContent;
  btn.textContent = '저장됨!';
  setTimeout(()=> btn.textContent = old, 900);
});

/* --- 초기화 --- */
buildTiles(loadSavedOrder());
