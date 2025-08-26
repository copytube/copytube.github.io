// js/upload.js (v1.2.5)
// - 개인자료(personal1/2) 단독 선택 시: Firestore 업로드를 건너뛰고 localStorage에만 저장
// - 개인자료 + 일반카테고리 혼합 선택: 금지(경고)
// - 일반카테고리만 선택: Firestore 업로드 (최대 3개)
// - upload.html의 요소 ID 차이를 흡수(#urls 또는 #urlBox, order 또는 orderDir, submit 버튼 아이디들)

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CATEGORY_GROUPS } from './categories.js';

const $ = (s) => document.querySelector(s);

// ---------- 상단바 / 드롭다운 ----------
const signupLink   = $('#signupLink');
const signinLink   = $('#signinLink');
const welcome      = $('#welcome');
const menuBtn      = $('#menuBtn');
const dropdown     = $('#dropdownMenu');
const btnSignOut   = $('#btnSignOut');
const btnGoUpload  = $('#btnGoUpload');
const btnMyUploads = $('#btnMyUploads');
const btnAbout     = $('#btnAbout');

let isMenuOpen = false;
function openDropdown(){ isMenuOpen=true; dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ isMenuOpen=false; dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'), 180); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if(!dropdown || dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());
btnGoUpload?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

// ---------- 그룹 순서 적용 ----------
const GROUP_ORDER_KEY = 'groupOrderV1';
function getStoredOrder(){
  try{
    const raw = localStorage.getItem(GROUP_ORDER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function applyGroupOrder(groups){
  const order = getStoredOrder();
  if (!order.length) return groups.slice(); // 저장 없으면 기본 순서
  const byKey = new Map(groups.map(g => [g.key, g]));
  const sorted = order.map(k => byKey.get(k)).filter(Boolean);
  // 새로 생긴 그룹은 뒤에 추가
  groups.forEach(g => { if (!order.includes(g.key)) sorted.push(g); });
  return sorted;
}

// ---------- 개인자료 라벨 (local) ----------
function getPersonalLabels(){
  try { return JSON.parse(localStorage.getItem('personalLabels') || '{}'); }
  catch { return {}; }
}
function setPersonalLabel(key, label){
  const labels = getPersonalLabels();
  labels[key] = label;
  localStorage.setItem('personalLabels', JSON.stringify(labels));
}
const isPersonalVal = (v)=> v==='personal1' || v==='personal2';

// ---------- 카테고리 렌더 ----------
const catsBox = $('#cats');
const msg     = $('#msg');
const msgTop  = $('#msgTop');

// URL 입력 요소: #urls 또는 #urlBox 둘 다 지원
const urlsBox = document.getElementById('urls') || document.getElementById('urlBox');

// 붙여넣기 버튼: #btnPaste (있을 때만 바인딩)
const btnPaste = document.getElementById('btnPaste');

// 제출 버튼: 여러 아이디 지원
const submitButtons = [
  document.getElementById('btnSubmitTop'),
  document.getElementById('btnSubmitBottom'),
  document.getElementById('submitBtn')
].filter(Boolean);

function setMsg(text){
  if (msgTop) msgTop.textContent = text || '';
  if (msg)    msg.textContent    = text || '';
}

function renderCats(){
  const personalLabels = getPersonalLabels();
  const groups = applyGroupOrder(CATEGORY_GROUPS);

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal = (g.key==='personal');
      const defaultLabel = c.label;
      const labelText = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : defaultLabel;
      const renameBtn = isPersonal
        ? `<button class="rename-btn" data-key="${c.value}" type="button">이름변경</button>`
        : '';
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}${renameBtn}</label>`;
    }).join('');

    const legend = (g.key==='personal')
      ? `${g.label} <span class="subnote">(로컬저장소)</span>`
      : g.label;

    // 안내문은 목록 아래에 위치 (인덱스와 통일성)
    const noteHTML = (g.key==='personal')
      ? `<div class="muted" style="margin:6px 4px 2px;">개인자료는 <b>단독 재생만</b> 가능합니다.</div>`
      : '';

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
        ${noteHTML}
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;

  // 개인자료 이름변경
  catsBox.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.getAttribute('data-key'); // personal1 / personal2
      const cur = getPersonalLabels()[key] || (key==='personal1'?'자료1':'자료2');
      const name = prompt('개인자료 이름(최대 12자):', cur);
      const clean = (name||'').trim().slice(0,12).replace(/[<>"]/g,'');
      if(!clean) return;
      setPersonalLabel(key, clean);
      renderCats(); // 라벨 즉시 반영
    });
  });

  // 선택 제약: 개인자료는 단독, 일반은 최대 3개
  catsBox.querySelectorAll('input.cat').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const selected = Array.from(catsBox.querySelectorAll('input.cat:checked')).map(x=>x.value);
      const personals = selected.filter(isPersonalVal);
      const normals   = selected.filter(v=> !isPersonalVal(v));

      // 개인자료 단독 강제
      if (isPersonalVal(chk.value) && chk.checked){
        // 자신만 남기고 모두 해제
        catsBox.querySelectorAll('input.cat').forEach(c=>{
          if (c !== chk) c.checked = false;
        });
        setMsg('개인자료는 단독으로만 등록/재생됩니다.');
        return;
      }

      // 일반 선택 중이면 개인자료 해제
      if (!isPersonalVal(chk.value) && chk.checked){
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
      }

      // 일반 카테고리 3개 제한
      const checkedNormals = Array.from(catsBox.querySelectorAll('input.cat:checked')).map(x=>x.value).filter(v=>!isPersonalVal(v));
      if (checkedNormals.length > 3){
        chk.checked = false;
        setMsg('카테고리는 최대 3개까지 선택 가능합니다.');
      }else{
        setMsg('');
      }
    });
  });
}
renderCats();

// ---------- URL 파싱/붙여넣기 ----------
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/);
  return m ? m[1] : '';
}
function parseInputUrls(){
  if (!urlsBox) return [];
  return urlsBox.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}
async function pasteFromClipboard(){
  try{
    const txt = await navigator.clipboard.readText();
    if(!txt){ setMsg('클립보드에 텍스트가 없습니다.'); return; }
    if (!urlsBox){ setMsg('입력 박스를 찾을 수 없습니다.'); return; }
    // 뒤에 이어 붙이기
    urlsBox.value = (urlsBox.value.trim() ? (urlsBox.value.replace(/\s*$/,'') + '\n') : '') + txt.trim();
    setMsg('붙여넣기 완료.');
  }catch{
    setMsg('클립보드 접근이 차단되었습니다. 브라우저 설정에서 허용해 주세요.');
  }
}
btnPaste?.addEventListener('click', pasteFromClipboard);

// ---------- 등록 ----------
async function submitAll(){
  setMsg('검사 중...');
  const user = auth.currentUser;
  if(!user){ setMsg('로그인 후 등록 가능합니다.'); return; }

  const urls = parseInputUrls();
  if(!urls.length){ setMsg('URL을 한 줄에 하나씩 입력해 주세요.'); return; }

  c
