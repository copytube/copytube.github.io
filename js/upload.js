// js/upload.js
// 업로드 페이지 전용 스크립트

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js';

const $ = (s) => document.querySelector(s);

/* -------------------- 상단바 / 드롭다운 -------------------- */
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
function openDropdown(){
  isMenuOpen = true;
  dropdown.classList.remove('hidden');
  requestAnimationFrame(()=> dropdown.classList.add('show'));
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown.classList.remove('show');
  setTimeout(()=> dropdown.classList.add('hidden'), 180);
}

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  menuBtn?.classList.toggle('hidden', !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
  closeDropdown();
});

menuBtn?.addEventListener('click', (e)=>{
  e.stopPropagation();
  dropdown.classList.contains('hidden') ? openDropdown() : closeDropdown();
});
document.addEventListener('pointerdown', (e)=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());

btnGoUpload?.addEventListener('click', ()=>{ location.href = 'upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href = 'manage-uploads.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href = 'about.html'; closeDropdown(); });
btnSignOut?.addEventListener('click', async ()=>{
  await fbSignOut(auth);
  closeDropdown();
});

/* -------------------- 개인자료 라벨/위치 -------------------- */
function getPersonalLabels(){
  try { return JSON.parse(localStorage.getItem('personalLabels') || '{}'); }
  catch { return {}; }
}
function setPersonalLabel(key, label){
  const labels = getPersonalLabels();
  labels[key] = label;
  localStorage.setItem('personalLabels', JSON.stringify(labels));
}
function getPersonalPosition(){
  const v = localStorage.getItem('personalPosition');
  return v === 'top' ? 'top' : 'bottom';
}
function setPersonalPosition(pos){
  localStorage.setItem('personalPosition', pos === 'top' ? 'top' : 'bottom');
}

/* -------------------- 카테고리 렌더 -------------------- */
const catsBox   = $('#cats');
const msg       = $('#msg');
const urlsBox   = $('#urls');

function renderCats(){
  const personalLabels = getPersonalLabels();
  const pos = getPersonalPosition();

  const groups = CATEGORY_GROUPS.slice();
  // 개인자료를 상단으로 이동(선호 설정이 top일 때)
  if (pos === 'top'){
    const idx = groups.findIndex(g => g.key === 'personal');
    if (idx > -1){
      const [pg] = groups.splice(idx, 1);
      groups.unshift(pg);
    }
  }

  const html = groups.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal   = (g.key === 'personal');
      const defaultLabel = (c.value === 'personal1') ? '자료1'
                         : (c.value === 'personal2') ? '자료2'
                         : c.label;
      const labelText    = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : defaultLabel;

      const renameBtn    = isPersonal
        ? `<button class="rename-btn" data-key="${c.value}" type="button">이름변경</button>`
        : '';

      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}${renameBtn}</label>`;
    }).join('');

    const legend = (g.key === 'personal')
      ? `${g.label} <span class="subnote">(로컬저장소)</span>`
      : g.label;

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;

  // 이름변경
  catsBox.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.getAttribute('data-key');
      const cur = getPersonalLabels()[key] || (key==='personal1'?'자료1':'자료2');
      const name = prompt('개인자료 이름을 입력하세요 (최대 12자):', cur);
      const clean = (name||'').trim().slice(0,12).replace(/[<>"]/g,'');
      if (!clean) return;
      setPersonalLabel(key, clean);
      renderCats();
    });
  });

  // 카테고리 3개 제한(개인자료 제외)
  const limit = 3;
  catsBox.querySelectorAll('input.cat').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const checked = Array.from(catsBox.querySelectorAll('input.cat:checked'))
        .filter(x => x.value !== 'personal1' && x.value !== 'personal2');
      if (checked.length > limit){
        chk.checked = false;
        alert(`카테고리는 최대 ${limit}개까지 선택 가능합니다.`);
      }
    });
  });
}
renderCats();

/* 개인자료 위치 스위치 UI 초기화 */
(function initPersonalPosUI(){
  const row = $('#personalPosRow');
  if (!row) return;
  const cur = getPersonalPosition();
  const el  = row.querySelector(`input[name="personalPos"][value="${cur}"]`);
  if (el) el.checked = true;
  row.querySelectorAll('input[name="personalPos"]').forEach(r=>{
    r.addEventListener('change', (e)=>{
      setPersonalPosition(e.target.value);
      renderCats();
    });
  });
})();

/* -------------------- 붙여넣기 / 파싱 / 업로드 -------------------- */
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : '';
}
function parseInputUrls(){
  return urlsBox.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}
async function pasteFromClipboard(){
  try{
    const txt = await navigator.clipboard.readText();
    if (!txt){ msg.textContent = '클립보드에 텍스트가 없습니다.'; return; }
    if (urlsBox.value.trim()){
      urlsBox.value = urlsBox.value.replace(/\s*$/,'') + '\n' + txt.trim();
    }else{
      urlsBox.value = txt.trim();
    }
    msg.textContent = '붙여넣기 완료.';
  }catch(e){
    msg.textContent = '클립보드 접근이 차단되었습니다. 브라우저 설정에서 허용해 주세요.';
  }
}

async function submitAll(){
  msg.textContent = '등록 중...';

  const user = auth.currentUser;
  if (!user){ msg.textContent = '로그인 후 이용하세요.'; return; }

  const urls = parseInputUrls();
  if (!urls.length){ msg.textContent = 'URL을 한 줄에 하나씩 입력해 주세요.'; return; }

  const categories = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value)
    .filter(v => v !== 'personal1' && v !== 'personal2');
  if (!categories.length){ msg.textContent = '카테고리를 최소 1개 선택해 주세요.'; return; }
  if (categories.length > 3){ msg.textContent = '카테고리는 최대 3개까지 선택 가능합니다.'; return; }

  const order = (document.querySelector('input[name="order"]:checked')?.value || 'bottom');
  const list  = (order === 'bottom') ? urls.slice().reverse() : urls.slice();

  let ok = 0, fail = 0;
  for (const url of list){
    const id = extractId(url);
    if (!id){ fail++; continue; }
    try{
      await addDoc(collection(db, 'videos'), {
        url,
        categories,
        uid: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      ok++;
    }catch(e){
      fail++;
    }
  }
  msg.textContent = `등록 완료: ${ok}건 성공, ${fail}건 실패`;
}

/* -------------------- 버튼 바인딩 -------------------- */
$('#btnPaste')?.addEventListener('click', pasteFromClipboard);
$('#btnSubmitTop')?.addEventListener('click', submitAll);
$('#btnSubmitBottom')?.addEventListener('click', submitAll);
