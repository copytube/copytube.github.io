import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { CATEGORY_GROUPS } from './categories.js';

import {
  addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 드롭다운 공통 ---------- */
const menuBtn  = document.getElementById("menuBtn");
const dropdown = document.getElementById("dropdownMenu");
const welcome  = document.getElementById("welcome");

const btnGoCategory = document.getElementById("btnGoCategory");
const btnMyUploads  = document.getElementById("btnMyUploads");
const btnAbout      = document.getElementById("btnAbout");
const btnSignOut    = document.getElementById("btnSignOut");

onAuthStateChanged(auth, (user)=>{
  welcome.textContent = user ? `안녕하세요, ${user.displayName||'회원'}님` : '';
});

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown.classList.remove('hidden'); requestAnimationFrame(()=>dropdown.classList.add('show')); }
function closeDropdown(){ isMenuOpen=false; dropdown.classList.remove('show'); setTimeout(()=>dropdown.classList.add('hidden'), 180); }
menuBtn.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown.classList.contains('hidden')?openDropdown():closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu,#menuBtn');
  if(!inside) closeDropdown();
},{capture:true});
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });

btnGoCategory?.addEventListener('click', ()=>{ location.href='index.html'; closeDropdown(); });
btnMyUploads ?.addEventListener('click', ()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnAbout     ?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnSignOut   ?.addEventListener('click', async()=>{ await fbSignOut(auth); closeDropdown(); });

/* ---------- 퍼스널 라벨/위치 ---------- */
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }catch{ return {}; }
}
function setPersonalLabel(key, val){
  const map = getPersonalLabels(); map[key]=val; localStorage.setItem('personalLabels', JSON.stringify(map));
}
function getPersonalPosition(){ return localStorage.getItem('personalPosition')==='top' ? 'top' : 'bottom'; }

/* ---------- 카테고리 렌더 (인덱스 밀도와 동일) ---------- */
const mount = document.getElementById('catMount');

function renderCats(){
  const personalLabels = getPersonalLabels();
  const pos = getPersonalPosition();

  // personal 위치 이동
  const groups = CATEGORY_GROUPS.slice();
  if(pos==='top'){
    const i = groups.findIndex(g=>g.key==='personal');
    if(i>-1){ const [g]=groups.splice(i,1); groups.unshift(g); }
  }

  const html = groups.map(g=>{
    const legend = (g.key==='personal')
      ? `${g.label} <span class="subnote">(로컬저장소)</span>`
      : g.label;

    const kids = g.children.map(c=>{
      const isPersonal = g.key==='personal';
      const defaultLabel = (c.value==='personal1')?'자료1':(c.value==='personal2'?'자료2':c.label);
      const labelText = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : defaultLabel;

      return `
        <label>
          <span class="child-left">
            <input type="checkbox" class="cat" value="${c.value}" />
            ${labelText}
          </span>
          ${isPersonal ? `<button type="button" class="rename-btn" data-target="${c.value}">이름변경</button>`:''}
        </label>`;
    }).join('');

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
      </fieldset>`;
  }).join('');

  mount.innerHTML = html;

  // 이름변경 핸들러
  mount.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.dataset.target;
      const cur = getPersonalLabels()[key] || (key==='personal1'?'자료1':'자료2');
      const val = prompt('새 이름을 입력하세요', cur);
      if(!val) return;
      const safe = sanitize(val).slice(0, 20);
      setPersonalLabel(key, safe);
      renderCats();
    });
  });
}
renderCats();

/* ---------- 입력/버튼 ---------- */
const urlInput   = document.getElementById('urlInput');
const btnPaste   = document.getElementById('btnPaste');
const btnTop     = document.getElementById('btnSubmitTop');
const btnBottom  = document.getElementById('btnSubmitBottom');

function readOrder(){ return (document.querySelector('input[name="order"]:checked')?.value || 'asc'); }

btnPaste.addEventListener('click', async()=>{
  try{
    const text = await navigator.clipboard.readText();
    if(!text) return;
    // 기존 내용 뒤에 줄바꿈 추가
    urlInput.value = (urlInput.value ? (urlInput.value.replace(/\s+$/,'')+'\n') : '') + text;
  }catch(e){
    alert('클립보드 접근이 차단되었습니다. 설정 > 사이트 설정 > 클립보드에서 허용으로 변경해주세요.');
  }
});

btnTop   .addEventListener('click', submitAll);
btnBottom.addEventListener('click', submitAll);

/* ---------- 업로드 로직 ---------- */
function parseUrls(raw){
  return raw.split(/\r?\n/)
            .map(s=>s.trim())
            .filter(s=>s && /^https?:\/\//i.test(s));
}

function selectedCats(){
  return Array.from(document.querySelectorAll('.cat:checked')).map(i=>i.value);
}

function sanitize(input){
  return String(input).replace(/[<>"'`]/g, s => ({
    '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'
  }[s]));
}

async function submitAll(){
  const urls = parseUrls(urlInput.value);
  if(urls.length===0){ alert('URL을 입력해주세요.'); return; }

  const sel = selectedCats();
  // 최대 3개
  if(sel.length===0){ alert('카테고리를 1~3개 선택해주세요.'); return; }
  if(sel.length>3){ alert('카테고리는 최대 3개까지 선택 가능합니다.'); return; }

  // 정렬
  const order = readOrder();
  const list = order==='asc' ? urls : urls.slice().reverse();

  // personal 분리
  const hasPersonal = sel.includes('personal1') || sel.includes('personal2');
  const serverCats  = sel.filter(v=> v!=='personal1' && v!=='personal2');

  // 로그인 확인 (서버 업로드가 있는 경우만)
  const user = auth.currentUser;
  if(serverCats.length>0 && !user){
    alert('로그인 후 업로드할 수 있습니다.');
    return;
  }

  // 업로드/저장
  let ok=0, fail=0;

  // 로컬 저장(개인자료)
  if(hasPersonal){
    const labels = getPersonalLabels();
    const targets = [];
    if(sel.includes('personal1')) targets.push('personal1');
    if(sel.includes('personal2')) targets.push('personal2');
    targets.forEach(key=>{
      const k = `urls_${key}`;
      const prev = JSON.parse(localStorage.getItem(k) || '[]');
      localStorage.setItem(k, JSON.stringify([...list, ...prev]));
    });
    ok += list.length;
  }

  // 서버 업로드
  if(serverCats.length>0 && user){
    for(const u of list){
      try{
        await addDoc(collection(db,'videos'), {
          url: sanitize(u),
          uid: user.uid,
          categories: serverCats.slice(0,3),
          createdAt: serverTimestamp()
        });
        ok++;
      }catch(e){
        console.error(e); fail++;
      }
    }
  }

  alert(`등록 완료: ${ok}개${fail? `, 실패 ${fail}개`:''}`);
  // 페이지는 머무름(리다이렉트 안 함)
}
