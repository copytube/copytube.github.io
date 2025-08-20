// js/upload.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { CATEGORY_GROUPS } from './categories.js';

/* ----------------- 공통 UI ----------------- */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnAbout     = document.getElementById("btnAbout");
const brandHome    = document.getElementById("brandHome");

const urlBox       = document.getElementById("urlBox");
const btnPaste     = document.getElementById("btnPaste");
const btnSubmitTop = document.getElementById("btnSubmitTop");
const btnSubmitBottom = document.getElementById("btnSubmitBottom");
const catsBox      = document.getElementById("cats");
const msg          = document.getElementById("msg");

/* ----------------- 드롭다운 ----------------- */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
}
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn.addEventListener("click", (e)=>{
  e.stopPropagation();
  dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown();
});
document.addEventListener('pointerdown', (e)=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown.addEventListener("click", (e)=> e.stopPropagation());

btnMyUploads?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); location.href = "index.html"; });

/* ----------------- 개인자료 라벨 저장 ----------------- */
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem('personalLabels')||'{}'); }catch{ return {}; }
}
function setPersonalLabels(m){
  localStorage.setItem('personalLabels', JSON.stringify(m||{}));
}

/* ----------------- 카테고리 렌더 ----------------- */
function renderCategories(){
  const personalLabels = getPersonalLabels();

  const html = CATEGORY_GROUPS.map(g=>{
    const kids = g.children.map(c=>{
      const isPersonal   = (g.key==='personal');
      const defaultLabel = (c.value==='personal1') ? '자료1' : (c.value==='personal2' ? '자료2' : c.label);
      const labelText    = isPersonal && personalLabels[c.value] ? personalLabels[c.value] : defaultLabel;

      const rename = isPersonal
        ? `<button class="rename-btn" data-key="${c.value}" type="button">이름변경</button>`
        : '';

      return `
        <label>
          <input type="checkbox" class="cat" value="${c.value}">
          <span>${labelText}</span>
          ${rename}
        </label>`;
    }).join('');

    const legend = (g.key==='personal')
      ? `${g.label} <span class="subnote">(로컬저장소)</span>`
      : g.label;

    return `
      <fieldset class="group" data-key="${g.key}">
        <legend>${legend}</legend>
        <div class="child-grid">${kids}</div>
      </fieldset>`;
  }).join('');

  catsBox.innerHTML = html;

  // 개인자료 이름변경
  catsBox.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.dataset.key;
      const map = getPersonalLabels();
      const current = map[key] || (key==='personal1'?'자료1':'자료2');
      const next = prompt('개인자료 이름을 입력하세요.', current);
      if(!next) return;
      map[key] = next.trim().slice(0,20);
      setPersonalLabels(map);
      renderCategories(); // 즉시 반영
    });
  });

  // 최대 3개 체크 제한(개인자료 제외)
  const limit = 3;
  catsBox.querySelectorAll('input.cat').forEach(ch=>{
    ch.addEventListener('change', ()=>{
      const checked = Array.from(catsBox.querySelectorAll('input.cat:checked'))
        .filter(x=> x.value!=='personal1' && x.value!=='personal2');
      if (checked.length > limit){
        ch.checked = false;
        showMsg(`카테고리는 최대 ${limit}개까지 선택 가능합니다.`);
      }else{
        showMsg('');
      }
    });
  });
}

/* ----------------- 클립보드 붙여넣기 ----------------- */
btnPaste.addEventListener('click', async ()=>{
  try{
    const text = await navigator.clipboard.readText();
    if (!text){ showMsg('클립보드에 텍스트가 없습니다.'); return; }
    const cur = urlBox.value.trim();
    urlBox.value = cur ? (cur + '\n' + text) : text;
    showMsg('붙여넣기 완료.');
  }catch(e){
    showMsg('클립보드 접근이 거부되었습니다. 브라우저 설정에서 허용해 주세요.');
  }
});

/* ----------------- 업로드 로직 ----------------- */
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : '';
}
function parseLines(raw){
  return raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}
function currentOrder(){
  const r = document.querySelector('input[name="order"]:checked');
  return r ? r.value : 'bottom'; // 기본 아래부터
}

async function doSubmit(){
  showMsg('등록 중...');
  const user = auth.currentUser;
  if(!user){ showMsg('로그인 후 이용하세요.'); return; }

  const lines = parseLines(urlBox.value);
  if(lines.length===0){ showMsg('URL을 입력해 주세요.'); return; }

  // 선택 카테고리(개인자료 제외)
  const selected = Array.from(catsBox.querySelectorAll('.cat:checked')).map(c=>c.value);
  const cats = selected.filter(v => v!=='personal1' && v!=='personal2');
  if (cats.length > 3){ showMsg('카테고리는 최대 3개까지입니다.'); return; }

  // 순서: 아래부터(역순) / 위부터(그대로)
  const order = currentOrder();
  const toUpload = (order==='bottom') ? lines.slice().reverse() : lines.slice();

  let ok=0, fail=0;
  for (const url of toUpload){
    const id = extractId(url);
    if(!id){ fail++; continue; }
    try{
      await addDoc(collection(db,'videos'), {
        url, title: url, categories: (cats.length? cats : ['etc']),
        uid: user.uid, createdAt: serverTimestamp()
      });
      ok++;
    }catch(e){
      console.error(e); fail++;
    }
  }
  showMsg(`완료: ${ok}건 성공, ${fail}건 실패`);
}

btnSubmitTop.addEventListener('click', doSubmit);
btnSubmitBottom.addEventListener('click', doSubmit);

/* ----------------- 메시지 ----------------- */
function showMsg(t){ msg.textContent = t || ''; }

/* ----------------- 시작 ----------------- */
renderCategories();
showMsg('');
