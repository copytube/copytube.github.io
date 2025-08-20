import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CATEGORY_GROUPS } from './categories.js';

const $ = (s)=>document.querySelector(s);

/* 헤더 드롭다운 */
const signupLink = $('#signupLink');
const signinLink = $('#signinLink');
const welcome    = $('#welcome');
const menuBtn    = $('#menuBtn');
const dropdown   = $('#dropdownMenu');
const btnSignOut = $('#btnSignOut');
const btnMyUploads = $('#btnMyUploads');
const btnGoUpload  = $('#btnGoUpload');
const btnAbout   = $('#btnAbout');

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown.classList.remove('hidden'); requestAnimationFrame(()=>dropdown.classList.add('show')); }
function closeDropdown(){ isMenuOpen=false; dropdown.classList.remove('show'); setTimeout(()=>dropdown.classList.add('hidden'),180); }
menuBtn.addEventListener('click', e=>{ e.stopPropagation(); dropdown.classList.contains('hidden')?openDropdown():closeDropdown(); });
document.addEventListener('pointerdown', e=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn'); if(!inside) closeDropdown();
}, {capture:true});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDropdown(); });
dropdown.addEventListener('click', e=> e.stopPropagation());

btnSignOut?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href = 'manage-uploads.html'; closeDropdown(); });
btnGoUpload?.addEventListener('click', ()=>{ location.href = 'upload.html'; closeDropdown(); });
btnAbout?.addEventListener('click', ()=>{ location.href = 'about.html'; closeDropdown(); });

/* 로그인 상태표시 */
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
});

/* URL/컨트롤 */
const urlBox = $('#url');
const btnPaste = $('#btnPaste');
const btnSubmitTop = $('#btnSubmitTop');
const btnSubmit = $('#btnSubmit');
const msg  = $('#msg');

/* 클립보드 붙여넣기 */
btnPaste.addEventListener('click', async ()=>{
  try{
    const text = await navigator.clipboard.readText();
    if(!text) { msg.textContent='클립보드에 텍스트가 없습니다.'; return; }
    // 기존 내용 뒤에 줄바꿈 추가
    const base = urlBox.value ? (urlBox.value.replace(/\s*$/,'')+'\n') : '';
    urlBox.value = base + text;
    msg.textContent = '붙여넣기 완료';
  }catch(e){
    msg.textContent = '클립보드 권한을 허용해 주세요(브라우저 설정 참고).';
  }
});

/* 카테고리 렌더 (개인자료는 선택 비활성화 + 이름변경 버튼은 라벨 옆) */
const catsWrap = $('#cats');

function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }
  catch{ return {}; }
}
function setPersonalLabel(key, val){
  const map = getPersonalLabels(); map[key]=val; localStorage.setItem('personalLabels', JSON.stringify(map));
}
function openRename(key, current){
  const name = prompt('개인자료 이름 변경', current||'');
  if(!name) return;
  setPersonalLabel(key, name);
  renderCategories(); // 즉시 반영
}

function renderCategories(){
  const personalLabels = getPersonalLabels();
  const groups = CATEGORY_GROUPS.slice();

  const html = groups.map(g=>{
    const isPersonalGroup = (g.key==='personal');
    const kids = g.children.map(c=>{
      const defaultLabel = (c.value==='personal1') ? '자료1' : (c.value==='personal2' ? '자료2' : c.label);
      const labelText = isPersonalGroup && personalLabels[c.value] ? personalLabels[c.value] : defaultLabel;

      // 개인자료는 서버 업로드 대상 아님 → 체크박스 disabled
      const disabled = isPersonalGroup ? 'disabled' : '';
      // 개인자료 이름변경 버튼(라벨 내부 오른쪽)
      const renameBtn = isPersonalGroup
        ? `<button type="button" class="rename-inline" data-rename="${c.value}">이름변경</button>`
        : '';

      return `
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="cat" value="${c.value}" ${disabled}>
          <span style="flex:0 1 auto;">${labelText}</span>
          ${renameBtn}
        </label>
      `;
    }).join('');

    const legend = isPersonalGroup ? `${g.label} <span class="subnote">(로컬저장소)</span>` : g.label;

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
      </fieldset>
    `;
  }).join('');

  catsWrap.innerHTML = html;

  // 이름변경 이벤트 위임
  catsWrap.querySelectorAll('button[data-rename]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.getAttribute('data-rename');
      const current = personalLabels[key] || (key==='personal1'?'자료1': (key==='personal2'?'자료2':''));
      openRename(key, current);
    });
  });
}
renderCategories();

/* 업로드 처리 */
function extractId(url){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/); return m?m[1]:''; }

async function fetchYTTitle(url){
  try{
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if(!r.ok) throw 0;
    const j = await r.json();
    return j.title || '';
  }catch{ return ''; }
}

async function doSubmit(){
  msg.textContent = '등록 중...';
  const user = auth.currentUser;
  if(!user){ msg.textContent = '로그인 후 이용하세요.'; return; }

  const urls = urlBox.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!urls.length){ msg.textContent = 'URL을 입력해 주세요.'; return; }

  const selected = Array.from(document.querySelectorAll('.cat:checked'))
    .map(c=>c.value)
    .filter(v => v!=='personal1' && v!=='personal2'); // 개인자료 제외(서버 업로드 대상 아님)

  if(selected.length===0){ msg.textContent = '카테고리를 1개 이상 선택해 주세요.'; return; }
  if(selected.length>3){ msg.textContent = '카테고리는 최대 3개까지 선택 가능합니다.'; return; }

  const order = (document.querySelector('input[name="order"]:checked')?.value) || 'bottom';
  const list = (order==='bottom') ? urls : urls.slice().reverse();

  let ok=0, fail=0;
  for(const raw of list){
    const id = extractId(raw);
    if(!id){ fail++; continue; }
    const title = (await fetchYTTitle(raw)) || raw;
    try{
      await addDoc(collection(db,'videos'), {
        url: raw, title, categories: selected, uid: user.uid, createdAt: serverTimestamp()
      });
      ok++;
    }catch(e){ fail++; }
  }
  msg.textContent = `완료: ${ok} 성공, ${fail} 실패`;
}

/* 위/아래 등록 버튼 */
btnSubmitTop.addEventListener('click', doSubmit);
btnSubmit.addEventListener('click', doSubmit);
