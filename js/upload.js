// js/upload.js  v1.2.2  (personal-only => localStorage, public => Firestore)
// 요구사항 요약:
// - personal1/2 단독 선택 시 서버 업로드 금지, 로컬에만 저장
// - personal1/2 + 다른 카테고리 동시 선택 금지, personal1 & personal2 동시 선택 금지
// - 공개 업로드는 카테고리 1~3개 제한 (Firestore 규칙 호환)
// - 그룹 순서(localStorage groupOrderV1) 반영 렌더
// - 개인자료 라벨(localStorage personalLabels) 반영 및 즉시 업데이트

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CATEGORY_GROUPS } from './categories.js';

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------- 상단바 / 드롭다운 ---------- */
const signupLink   = $('#signupLink');
const signinLink   = $('#signinLink');
const welcome      = $('#welcome');
const menuBtn      = $('#menuBtn');
const dropdown     = $('#dropdownMenu');
const btnSignOut   = $('#btnSignOut');
const btnGoUpload  = $('#btnGoUpload');
const btnMyUploads = $('#btnMyUploads');
const btnAbout     = $('#btnAbout');

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ isMenuOpen=false; dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'),180); }
onAuthStateChanged(auth,(user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(!dropdown || dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());
btnGoUpload ?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnAbout    ?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnSignOut  ?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

/* ---------- 메시지 유틸 ---------- */
const msg    = $('#msg')    || null;
const msgTop = $('#msgTop') || null;
function setMsg(text){ if(msgTop) msgTop.textContent=text||''; if(msg) msg.textContent=text||''; }

/* ---------- 그룹 순서 적용 ---------- */
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
  if(!order.length) return groups.slice();
  const byKey = new Map(groups.map(g=>[g.key,g]));
  const sorted = order.map(k=> byKey.get(k)).filter(Boolean);
  // 새 그룹(키) 있으면 뒤에 덧붙임
  for(const g of groups){ if(!order.includes(g.key)) sorted.push(g); }
  return sorted;
}

/* ---------- 개인자료 라벨 ---------- */
function getPersonalLabels(){
  try { return JSON.parse(localStorage.getItem('personalLabels') || '{}'); }
  catch { return {}; }
}
function setPersonalLabel(key, label){
  const labels = getPersonalLabels();
  labels[key] = label;
  localStorage.setItem('personalLabels', JSON.stringify(labels));
}

/* ---------- 카테고리 렌더 ---------- */
const catsBox = $('#cats');

function renderCats(){
  const personalLabels = getPersonalLabels();
  const groups = applyGroupOrder(CATEGORY_GROUPS);

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal = (g.key === 'personal');
      // 개인자료 기본 표기: 자료1/자료2 (없으면 c.label 유지)
      const fallback = (c.value==='personal1') ? '자료1' : (c.value==='personal2' ? '자료2' : c.label);
      const labelText = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : fallback;
      const renameBtn = isPersonal ? `<button class="rename-btn" data-key="${c.value}" type="button">이름변경</button>` : '';
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}${renameBtn}</label>`;
    }).join('');

    const legend = (g.key==='personal') ? `${g.label} <span class="subnote">(로컬저장소)</span>` : g.label;

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;

  // 개인자료 이름 변경
  catsBox.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.getAttribute('data-key'); // personal1|personal2
      const cur = getPersonalLabels()[key] || (key==='personal1' ? '자료1' : '자료2');
      const name = prompt('개인자료 이름을 입력하세요 (최대 12자):', cur);
      const clean = (name||'').trim().slice(0,12).replace(/[<>"]/g,'');
      if(!clean) return;
      setPersonalLabel(key, clean);
      // 즉시 재렌더
      renderCats();
    });
  });

  // 선택 제약: personal1/2 동시 선택 금지, personal + 다른 카테고리 금지
  const boxes = $$('.cat');
  boxes.forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const selected = boxes.filter(x=> x.checked).map(x=> x.value);
      const hasPersonal1 = selected.includes('personal1');
      const hasPersonal2 = selected.includes('personal2');
      const hasPersonal  = hasPersonal1 || hasPersonal2;
      const publicCount  = selected.filter(v => v!=='personal1' && v!=='personal2').length;

      // personal1 & personal2 동시에 금지
      if(hasPersonal1 && hasPersonal2){
        chk.checked = false;
        setMsg('개인자료는 하나만 선택할 수 있습니다.');
        return;
      }
      // personal + 공개카테고리 동시 금지
      if(hasPersonal && publicCount>0){
        chk.checked = false;
        setMsg('개인자료는 다른 카테고리와 함께 선택할 수 없습니다.');
        return;
      }
      // 공개 업로드는 최대 3개 (규칙 호환)
      if(!hasPersonal && publicCount>3){
        chk.checked = false;
        setMsg('공개 카테고리는 최대 3개까지 선택 가능합니다.');
        return;
      }
      setMsg('');
    });
  });
}
renderCats();

/* ---------- URL 파싱 유틸 ---------- */
const urlsBox = $('#urls') || $('#urlBox'); // 둘 중 하나만 있어도 동작
function parseLines(){
  const raw = (urlsBox?.value || '').split(/\r?\n/);
  return raw.map(s=>s.trim()).filter(Boolean);
}
function findFirstYoutubeUrl(text){
  if (!text) return '';
  const re = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^ \n]*v=[^ \n&]+|youtube\.com\/shorts\/[^ \n?&/]+|youtube\.com\/embed\/[^ \n?&/]+|youtu\.be\/[^ \n?&/]+))/i;
  const m = text.match(re);
  return m ? m[1] : '';
}
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/);
  return m ? m[1] : '';
}

/* ---------- 로컬 저장 (개인자료) ---------- */
function saveToLocal(slot, urls){
  const key = `copytube_${slot}`; // copytube_personal1 | copytube_personal2
  let arr = [];
  try{ arr = JSON.parse(localStorage.getItem(key)||'[]'); }catch{ arr=[]; }
  const now = Date.now();
  for(const u of urls){ arr.push({ url: u, savedAt: now }); }
  localStorage.setItem(key, JSON.stringify(arr));
}

/* ---------- 붙여넣기 버튼 ---------- */
$('#btnPaste')?.addEventListener('click', async ()=>{
  try{
    const txt = await navigator.clipboard.readText();
    if(!txt){ setMsg('클립보드가 비어있습니다.'); return; }
    // 비어있지 않으면 줄바꿈 뒤에 추가
    if (urlsBox.value.trim()){
      urlsBox.value = urlsBox.value.replace(/\s*$/,'') + '\n' + txt.trim();
    }else{
      urlsBox.value = txt.trim();
    }
    setMsg('붙여넣기 완료.');
  }catch{
    setMsg('클립보드 접근이 차단되었습니다. 브라우저/OS 설정에서 허용해 주세요.');
  }
});

/* ---------- 등록(제출) ---------- */
async function handleSubmit(){
  setMsg('검사 중...');
  const user = auth.currentUser;
  if(!user){ setMsg('로그인 후 등록 가능합니다.'); return; }

  // 선택된 항목
  const picked = $$('.cat:checked').map(c=>c.value);
  if(!picked.length){ setMsg('카테고리를 선택해 주세요.'); return; }

  const hasPersonal1 = picked.includes('personal1');
  const hasPersonal2 = picked.includes('personal2');
  const hasPersonal  = hasPersonal1 || hasPersonal2;
  const publics      = picked.filter(v => v!=='personal1' && v!=='personal2');

  // 개인자료 + 공개카테고리 함께 금지 (가드)
  if(hasPersonal && publics.length){
    setMsg('개인자료는 다른 카테고리와 함께 선택할 수 없습니다.');
    return;
  }
  // personal1 & personal2 동시 금지 (가드)
  if(hasPersonal1 && hasPersonal2){
    setMsg('개인자료는 하나만 선택해 주세요.');
    return;
  }

  // URL 파싱
  const lines = parseLines();
  if(!lines.length){ setMsg('URL을 한 줄에 하나씩 입력해 주세요.'); return; }

  // 입력에서 유튜브 URL 정제
  const rawToUrl = lines.map(raw => findFirstYoutubeUrl(raw) || raw);
  const urls = [];
  for(let i=0;i<rawToUrl.length;i++){
    const u = rawToUrl[i];
    if(!extractId(u)){
      setMsg(`유효하지 않은 URL이 있습니다. (줄 ${i+1})`);
      return;
    }
    urls.push(u);
  }

  // 등록 순서: name="order" 라디오 (bottom|top), 기본 bottom
  const order = (document.querySelector('input[name="order"]:checked')?.value || 'bottom');
  const list  = (order === 'bottom') ? urls.slice().reverse() : urls.slice();

  /* --- 개인자료: 로컬 저장 --- */
  if(hasPersonal){
    const slot = hasPersonal1 ? 'personal1' : 'personal2';
    saveToLocal(slot, list);
    setMsg(`로컬 저장 완료: ${list.length}건 (${slot==='personal1' ? '개인자료1' : '개인자료2'})`);
    // UI 초기화
    if(urlsBox){ urlsBox.value=''; }
    $$('.cat:checked').forEach(c=> c.checked=false);
    return; // 서버 업로드 금지
  }

  /* --- 공개 업로드: Firestore --- */
  if(publics.length===0){ setMsg('카테고리를 최소 1개 선택해 주세요.'); return; }
  if(publics.length>3){ setMsg('공개 카테고리는 최대 3개까지 선택 가능합니다.'); return; }

  if(!confirm(`총 ${list.length}개의 영상을 선택된 카테고리로 등록합니다. 진행할까요?`)){
    setMsg('취소되었습니다.');
    return;
  }

  let ok=0, fail=0;
  for(const url of list){
    try{
      await addDoc(collection(db,'videos'), {
        url,
        categories: publics,   // Firestore에는 공개 카테고리만
        uid: user.uid,
        createdAt: serverTimestamp()
      });
      ok++;
    }catch(e){
      fail++;
    }
    setMsg(`등록 중... (${ok+fail}/${list.length})`);
  }

  setMsg(`완료: 성공 ${ok}건, 실패 ${fail}건`);
  if(ok){
    if(urlsBox){ urlsBox.value=''; }
    $$('.cat:checked').forEach(c=> c.checked=false);
  }
}

// 버튼(상/하 둘 다 지원)
$('#btnSubmitTop')   ?.addEventListener('click', handleSubmit);
$('#btnSubmitBottom')?.addEventListener('click', handleSubmit);
