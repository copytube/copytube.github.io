// js/upload.js v1.3p
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db } from './firebase-init.js';
import { CATEGORY_GROUPS } from './categories.js';
import { getPersonalLabel, setPersonalLabel } from './personal-labels.js';

const $ = s => document.querySelector(s);

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

onAuthStateChanged(auth, (user)=>{
  const loggedIn=!!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '');
  closeDropdown();
});
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden')?openDropdown():closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(!dropdown || dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());
btnGoUpload?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

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
  if (!order.length) return groups.slice(); // 저장 없으면 기본
  const byKey = new Map(groups.map(g => [g.key, g]));
  const sorted = order.map(k => byKey.get(k)).filter(Boolean);
  groups.forEach(g => { if (!order.includes(g.key)) sorted.push(g); }); // 신규키 맨뒤
  return sorted;
}

/* ---------- 카테고리 렌더 ---------- */
const catsBox = $('#cats');
const msg     = $('#msg');
const msgTop  = $('#msgTop');
const urlsBox = document.querySelector('#urls') || document.querySelector('#urlBox'); // 양쪽 id 지원

function setMsg(text){ if(msgTop) msgTop.textContent=text||''; if(msg) msg.textContent=text||''; }

function renderCats(){
  const groups = applyGroupOrder(CATEGORY_GROUPS);

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal   = (g.key === 'personal');
      const labelText    = isPersonal ? (getPersonalLabel(c.value) || (c.value==='personal1'?'자료1':'자료2')) : c.label;
      const renameBtn    = isPersonal ? `<button class="rename-btn" data-key="${c.value}" type="button">이름변경</button>` : '';
      return `<label><input type="checkbox" class="cat" value="${c.value}"> <span class="label-text">${labelText}</span>${renameBtn}</label>`;
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

  // 개인자료 이름변경
  catsBox.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.getAttribute('data-key'); // personal1/personal2
      const cur = getPersonalLabel(key) || (key==='personal1'?'자료1':'자료2');
      const name = prompt('개인자료 이름을 입력하세요 (최대 20자):', cur);
      if(!name) return;
      const clean = name.trim();
      if(!clean) return;
      try{
        setPersonalLabel(key, clean);
      }catch(e){
        alert(e.message || e);
        return;
      }
      const host = btn.closest('label')?.querySelector('.label-text');
      if(host) host.textContent = getPersonalLabel(key) || clean;
    });
  });

  // 선택 제약
  const allBoxes = Array.from(catsBox.querySelectorAll('input.cat'));
  const limit=3;
  const isPersonal = v => (v==='personal1' || v==='personal2');

  function enforce(changed){
    const selected = allBoxes.filter(x=>x.checked).map(x=>x.value);
    const personals = selected.filter(isPersonal);
    const normals   = selected.filter(v=> !isPersonal(v));
    if(personals.length > 1){ changed.checked=false; setMsg('개인자료는 하나만 선택할 수 있습니다.'); return false; }
    if(personals.length===1 && normals.length>0){ changed.checked=false; setMsg('개인자료는 다른 카테고리와 함께 선택할 수 없습니다.'); return false; }
    if(normals.length>limit){ changed.checked=false; setMsg(`카테고리는 최대 ${limit}개까지 선택 가능합니다.`); return false; }
    setMsg(''); return true;
  }
  allBoxes.forEach(b=> b.addEventListener('change', ()=> enforce(b)));
}
renderCats();

/* ---------- 붙여넣기 / 파싱 / 업로드 ---------- */
function extractId(url){
  const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/);
  return m?m[1]:'';
}
function parseInputUrls(){
  const el = urlsBox;
  if(!el){ setMsg('URL 입력칸을 찾을 수 없습니다.'); return []; }
  return el.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}

async function pasteFromClipboard(){
  if(!('clipboard' in navigator)){ setMsg('클립보드 API 미지원 브라우저입니다.'); return; }
  try{
    const txt=await navigator.clipboard.readText();
    if(!txt){ setMsg('클립보드가 비어있습니다.'); return; }
    if (urlsBox.value.trim()){
      urlsBox.value = urlsBox.value.replace(/\s*$/,'') + '\n' + txt.trim();
    }else{
      urlsBox.value = txt.trim();
    }
    setMsg('붙여넣기 완료.');
  }catch{ setMsg('클립보드 접근이 차단되었습니다. 브라우저 설정에서 허용해 주세요.'); }
}

async function submitAll(){
  setMsg('등록 중...');
  const user=auth.currentUser;
  if(!user){ setMsg('로그인 후 이용하세요.'); return; }

  const urls=parseInputUrls();
  if(!urls.length){ setMsg('URL을 한 줄에 하나씩 입력해 주세요.'); return; }

  const selectedAll = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  if(!selectedAll.length){ setMsg('카테고리를 최소 1개 선택해 주세요.'); return; }

  const personals = selectedAll.filter(v=> v==='personal1' || v==='personal2');
  const normals   = selectedAll.filter(v=> !(v==='personal1' || v==='personal2'));

  if(personals.length > 1){ setMsg('개인자료는 하나만 선택할 수 있습니다.'); return; }
  if(personals.length === 1 && normals.length > 0){ setMsg('개인자료는 다른 카테고리와 함께 선택할 수 없습니다.'); return; }

  // 등록 순서(top/bottom 라디오가 페이지마다 name이 다를 수 있어 안전 처리)
  const orderInput = document.querySelector('input[name="orderDir"]:checked') || document.querySelector('input[name="order"]:checked');
  const order = (orderInput?.value || 'bottom');
  const list  = (order==='bottom') ? urls.slice().reverse() : urls.slice();

  // 개인자료 => 로컬 저장
  if(personals.length === 1){
    const slot = personals[0];
    const key  = `copytube_${slot}`;
    let arr=[];
    try{ arr = JSON.parse(localStorage.getItem(key)||'[]'); }catch{ arr=[]; }

    let ok=0, fail=0;
    for(const u of list){
      if(extractId(u)){ arr.push({ url:u, savedAt: Date.now() }); ok++; } else { fail++; }
    }
    localStorage.setItem(key, JSON.stringify(arr));
    setMsg(`로컬 저장 완료: ${ok}건 성공, ${fail}건 실패 (${getPersonalLabel(slot) || (slot==='personal1'?'자료1':'자료2')})`);
    document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false);
    if(urlsBox){ urlsBox.value=''; }
    return;
  }

  // 일반 카테고리 => Firestore
  if(normals.length>3){ setMsg('카테고리는 최대 3개까지 선택 가능합니다.'); return; }
  let ok=0, fail=0;
  for(const url of list){
    const id=extractId(url);
    if(!id){ fail++; continue; }
    try{
      await addDoc(collection(db,'videos'),{
        url, categories: normals, uid:user.uid, createdAt: serverTimestamp()
      });
      ok++;
    }catch{ fail++; }
  }
  setMsg(`등록 완료: ${ok}건 성공, ${fail}건 실패`);
  document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false);
  if(urlsBox){ urlsBox.value=''; }
}

/* ---------- 버튼 바인딩 ---------- */
document.getElementById('btnPaste')?.addEventListener('click', pasteFromClipboard);
document.getElementById('btnSubmitTop')?.addEventListener('click', submitAll);
document.getElementById('btnSubmitBottom')?.addEventListener('click', submitAll);
