// js/upload.js (v1.3.0 - from scratch)
// ✅ 개인자료(personal1/2) 단독 선택 시: Firestore를 건너뛰고 localStorage에만 저장
// ✅ 개인자료 + 일반 카테고리 혼합 선택: 금지(경고)
// ✅ 일반 카테고리만: Firestore 업로드(최대 3개)
// ✅ 그룹 순서(localStorage groupOrderV1) 반영
// ✅ 개인 라벨(localStorage personalLabels) 반영 & 즉시 재렌더
// ✅ URL 입력칸(#urls | #urlBox), 라디오 name(order | orderDir), 제출 버튼 id(여러개) 호환
// ✅ 붙여넣기 버튼(#btnPaste) 있으면 동작, 없어도 문제없음

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CATEGORY_GROUPS } from './categories.js';

const $ = (s)=>document.querySelector(s);

/* ---------------- Topbar ---------------- */
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
  const loggedIn=!!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(!dropdown || dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());
btnGoUpload?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

/* ---------------- Group Order & Labels ---------------- */
const GROUP_ORDER_KEY='groupOrderV1';
const PERSONAL_LABELS_KEY='personalLabels';
const isPersonal = (v)=> v==='personal1' || v==='personal2';

function getGroupOrder(){
  try{ const j = JSON.parse(localStorage.getItem(GROUP_ORDER_KEY)||'null'); return Array.isArray(j)? j : []; }
  catch{ return []; }
}
function applyGroupOrder(groups){
  const order = getGroupOrder();
  if(!order.length) return groups.slice();
  const byKey = new Map(groups.map(g=>[g.key,g]));
  const sorted = order.map(k=> byKey.get(k)).filter(Boolean);
  groups.forEach(g=>{ if(!order.includes(g.key)) sorted.push(g); });
  return sorted;
}
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem(PERSONAL_LABELS_KEY)||'{}'); }
  catch{ return {}; }
}
function setPersonalLabel(key, value){
  const map = getPersonalLabels();
  map[key] = String(value||'').slice(0,12).replace(/[<>"]/g,'').trim();
  localStorage.setItem(PERSONAL_LABELS_KEY, JSON.stringify(map));
}

/* ---------------- DOM refs ---------------- */
const catsBox = $('#cats');
const msg     = $('#msg') || $('#msgBottom') || $('#msgTop');
const urlsBox = document.getElementById('urls') || document.getElementById('urlBox');
const pasteBtn= document.getElementById('btnPaste');

function setMsg(t){ if(msg) msg.textContent = t || ''; }

/* ---------------- Render Cats ---------------- */
function renderCats(){
  const groups = applyGroupOrder(CATEGORY_GROUPS);
  const labels = getPersonalLabels();

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const labelText = (g.key==='personal' && labels[c.value]) ? labels[c.value] : c.label;
      const rename = (g.key==='personal')
        ? ` <button class="rename-btn" data-key="${c.value}" type="button">이름변경</button>`
        : '';
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}${rename}</label>`;
    }).join('');

    const legend = (g.key==='personal')
      ? `${g.label} <span class="subnote">(로컬저장소)</span>`
      : g.label;

    const note = (g.key==='personal')
      ? `<div class="muted" style="margin:6px 4px 2px;">개인자료는 <b>단독 재생/등록</b>만 가능합니다.</div>`
      : '';

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
        ${note}
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;

  // 이름변경
  catsBox.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.getAttribute('data-key'); // personal1|personal2
      const cur = getPersonalLabels()[key] || (key==='personal1'?'자료1':'자료2');
      const name = prompt('개인자료 이름(최대 12자):', cur);
      if(!name) return;
      setPersonalLabel(key, name);
      renderCats();
    });
  });

  // 선택 제약: 개인 단독, 일반 최대 3
  catsBox.querySelectorAll('input.cat').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const v = chk.value;
      if(isPersonal(v) && chk.checked){
        // 개인 체크 → 나머지 전부 해제
        catsBox.querySelectorAll('input.cat').forEach(x=>{ if(x!==chk) x.checked=false; });
        setMsg('개인자료는 단독으로만 등록/재생됩니다.');
        return;
      }
      if(!isPersonal(v) && chk.checked){
        // 일반 체크 → 개인 해제
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(x=> x.checked=false);
        // 일반 3개 제한
        const normals = Array.from(catsBox.querySelectorAll('input.cat:checked')).map(x=>x.value).filter(x=>!isPersonal(x));
        if(normals.length>3){ chk.checked=false; setMsg('카테고리는 최대 3개까지 선택 가능합니다.'); return; }
      }
      setMsg('');
    });
  });
}
renderCats();

/* ---------------- URL utils ---------------- */
function parseUrls(){
  if(!urlsBox) return [];
  return urlsBox.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/);
  return m ? m[1] : '';
}

/* ---------------- Paste (optional) ---------------- */
pasteBtn?.addEventListener('click', async ()=>{
  try{
    const txt = await navigator.clipboard.readText();
    if(!txt){ setMsg('클립보드가 비어있습니다.'); return; }
    if(!urlsBox){ setMsg('입력 칸을 찾을 수 없습니다.'); return; }
    urlsBox.value = (urlsBox.value.trim() ? (urlsBox.value.replace(/\s*$/,'')+'\n') : '') + txt.trim();
    setMsg('붙여넣기 완료.');
  }catch{
    setMsg('클립보드 접근이 차단되었습니다. 브라우저 설정에서 허용해 주세요.');
  }
});

/* ---------------- Submit ---------------- */
function getOrderValue(){
  const r = document.querySelector('input[name="order"]:checked') || document.querySelector('input[name="orderDir"]:checked');
  return r ? r.value : 'bottom'; // bottom|top
}
async function submitAll(){
  setMsg('검사 중...');
  const user = auth.currentUser;
  if(!user){ setMsg('로그인 후 등록 가능합니다.'); return; }

  const lines = parseUrls();
  if(!lines.length){ setMsg('URL을 한 줄에 하나씩 입력해 주세요.'); return; }

  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  if(!selected.length){ setMsg('카테고리를 최소 1개 선택해 주세요.'); return; }

  const personals = selected.filter(isPersonal);
  const normals   = selected.filter(v=> !isPersonal(v));

  // --- Case A: 개인자료 단독 저장 ---
  if(personals.length===1 && normals.length===0){
    const slot = personals[0]; // personal1|personal2
    const key  = `copytube_${slot}`;
    let arr = [];
    try{ arr = JSON.parse(localStorage.getItem(key)||'[]'); }catch{ arr=[]; }

    let added=0;
    for(const raw of lines){
      const id = extractId(raw);
      if(!id) continue;           // 무효 URL은 건너뜀
      arr.push({ url: raw, savedAt: Date.now() });
      added++;
    }
    localStorage.setItem(key, JSON.stringify(arr));
    if(urlsBox) urlsBox.value='';
    document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false);
    setMsg(`로컬 저장 완료: ${added}건 (${slot==='personal1'?'개인자료1':'개인자료2'})`);
    return;
  }

  // --- 혼합 금지 ---
  if(personals.length>=1 && normals.length>=1){
    setMsg('개인자료는 다른 카테고리와 함께 선택할 수 없습니다.');
    return;
  }

  // --- Case B: 일반 카테고리 업로드 ---
  if(normals.length===0){
    setMsg('카테고리를 최소 1개 선택해 주세요.'); // 여기 오면 개인/일반 둘 다 없음
    return;
  }
  if(normals.length>3){
    setMsg('카테고리는 최대 3개까지 선택 가능합니다.');
    return;
  }

  const order = getOrderValue();
  const list  = (order==='bottom') ? lines.slice().reverse() : lines.slice();

  setMsg(`등록 중... (0/${list.length})`);
  let ok=0, fail=0;
  for(let i=0;i<list.length;i++){
    const url = list[i];
    const id  = extractId(url);
    if(!id){ fail++; setMsg(`등록 중... (${ok+fail}/${list.length})`); continue; }
    try{
      await addDoc(collection(db,'videos'),{
        url, categories: normals, uid: user.uid, createdAt: serverTimestamp()
      });
      ok++;
    }catch{ fail++; }
    setMsg(`등록 중... (${ok+fail}/${list.length})`);
  }
  setMsg(`완료: 성공 ${ok}건, 실패 ${fail}건`);
  if(ok){
    if(urlsBox) urlsBox.value='';
    document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false);
  }
}

/* 제출 버튼(존재하는 것만) 바인딩 */
[
  document.getElementById('btnSubmitTop'),
  document.getElementById('btnSubmitBottom'),
  document.getElementById('submitBtn'),
].filter(Boolean).forEach(btn=> btn.addEventListener('click', submitAll));
