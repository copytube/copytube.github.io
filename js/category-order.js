// js/category-order.js v3.1
// 스펙: 왼쪽(현재 순서)에서 탭→오른쪽(새 순서)로 이동. 오른쪽 항목 탭→왼쪽으로 복귀.
// 저장: 최종 = 오른쪽(새 순서) + 왼쪽(남은 순서 그 자체) → index.html 이동
import { CATEGORY_GROUPS } from './categories.js';

const GROUP_ORDER_KEY = 'groupOrderV1';
const listLeft  = document.getElementById('listLeft');   // 현재 순서(남은 것들)
const listRight = document.getElementById('listRight');  // 새 순서(탭 순서대로 쌓임)

const keyToLabel  = new Map(CATEGORY_GROUPS.map(g => [g.key, g.label]));
const defaultOrder = CATEGORY_GROUPS.map(g => g.key);

let baseOrder = []; // 왼쪽/오른쪽의 '기준 순서' (현재 저장된 순서). 되돌릴 때 위치 계산에 사용.
let leftKeys  = []; // 아직 안 옮긴 것들(왼쪽)
let rightKeys = []; // 새 순서(오른쪽)

function loadSavedOrder(){
  try{
    const raw = localStorage.getItem(GROUP_ORDER_KEY);
    const arr = JSON.parse(raw || 'null');
    if (Array.isArray(arr) && arr.length) return arr;
  }catch{}
  return defaultOrder.slice();
}
function saveOrder(keys){
  localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(keys));
}

function render(){
  // 왼쪽
  listLeft.innerHTML = '';
  leftKeys.forEach(k=>{
    const el = document.createElement('div');
    el.className = 'item';
    el.textContent = keyToLabel.get(k) || k; // 라벨만 노출
    el.dataset.key = k;
    el.addEventListener('click', ()=> moveLeftToRight(k), { passive:true });
    listLeft.appendChild(el);
  });

  // 오른쪽
  listRight.innerHTML = '';
  rightKeys.forEach(k=>{
    const el = document.createElement('div');
    el.className = 'item';
    el.textContent = keyToLabel.get(k) || k;
    el.dataset.key = k;
    // ✅ 오른쪽 항목 탭 시 왼쪽으로 복귀
    el.addEventListener('click', ()=> moveRightToLeft(k), { passive:true });
    listRight.appendChild(el);
  });
}

function moveLeftToRight(key){
  const i = leftKeys.indexOf(key);
  if (i < 0) return;
  leftKeys.splice(i,1);
  if (!rightKeys.includes(key)) rightKeys.push(key); // 중복 방지
  render();
}

function moveRightToLeft(key){
  const i = rightKeys.indexOf(key);
  if (i < 0) return;
  rightKeys.splice(i,1);

  if (!leftKeys.includes(key)) {
    // baseOrder(저장된 기준 순서)에서의 상대 위치를 유지하며 왼쪽으로 복귀
    const baseIdx = baseOrder.indexOf(key);
    let insertAt = leftKeys.length; // 기본은 맨 끝
    for (let j = 0; j < leftKeys.length; j++) {
      const curBase = baseOrder.indexOf(leftKeys[j]);
      if (curBase > baseIdx) { insertAt = j; break; }
    }
    leftKeys.splice(insertAt, 0, key);
  }
  render();
}

function resetFromSaved(){
  baseOrder = loadSavedOrder();   // 기준 순서를 갱신
  leftKeys  = baseOrder.slice();  // 모두 왼쪽으로
  rightKeys = [];                 // 오른쪽 비움
  render();
}

// 버튼
document.getElementById('btnReset')?.addEventListener('click', resetFromSaved);
document.getElementById('btnSave') ?.addEventListener('click', ()=>{
  // 최종 = 오른쪽(새 순서) + 왼쪽(남은 순서 그대로)
  const finalOrder = rightKeys.concat(leftKeys);
  if (!finalOrder.length) { alert('순서를 비울 수 없습니다.'); return; }
  saveOrder(finalOrder);
  location.href = 'index.html';
});

// 초기화
resetFromSaved();
