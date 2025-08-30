// js/upload.js (v1.3.3)
// URL 여러 개 입력 → oEmbed로 제목 받아 Firestore에 {url,title,categories,uid,createdAt} 저장
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js';

const $ = s=>document.querySelector(s);
const msg = $('#msg');
const urlsBox = $('#urls');
const catList = $('#catList');
const btnSubmit = $('#btnSubmit');
const signupLink = document.getElementById('signupLink');
const signinLink = document.getElementById('signinLink');
const welcome    = document.getElementById('welcome');

function setStatus(t){ if(msg) msg.textContent = t || ''; }

function extractId(url){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/); return m?m[1]:''; }
async function fetchTitle(url){
  try{
    const id = extractId(url);
    const u  = id ? ('https://www.youtube.com/watch?v=' + id) : url;
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u));
    if(!res.ok) throw new Error('oEmbed ' + res.status);
    const data = await res.json();
    return (data?.title || '').slice(0, 200);
  }catch(e){ console.warn('[upload] fetchTitle 실패:', e); return ''; }
}

function renderCategories(){
  const groups = CATEGORY_GROUPS.filter(g => g.key !== 'personal'); // 개인자료 그룹 제외
  const kids = groups.flatMap(g => g.children);
  catList.innerHTML = kids.map(c=>`
    <label class="chip"><input type="checkbox" value="${c.value}"> ${c.label}</label>
  `).join('');
  const boxes = Array.from(catList.querySelectorAll('input[type="checkbox"]'));
  boxes.forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const count = boxes.filter(b=> b.checked).length;
      if(count > 3){
        chk.checked = false;
        alert('카테고리는 최대 3개까지 선택 가능합니다.');
      }
    });
  });
  return ()=> boxes.filter(b=> b.checked).map(b=> b.value);
}

function parseUrls(text){
  return Array.from(new Set(
    String(text)
      .split(/\s|,|;|\n|\r/g)
      .map(s=>s.trim())
      .filter(Boolean)
  ));
}

async function saveOne(url, cats){
  const user = auth.currentUser;
  if(!user) throw new Error('로그인이 필요합니다.');
  const title = await fetchTitle(url);
  await addDoc(collection(db,'videos'), {
    url, title, categories: cats.slice(0,3), uid: user.uid, createdAt: serverTimestamp()
  });
}

async function onSubmit(getSelectedCats){
  const urls = parseUrls(urlsBox.value);
  if(urls.length===0){ alert('URL을 입력해 주세요.'); return; }
  const cats = getSelectedCats();
  if(cats.length===0){ if(!confirm('카테고리 없이 저장할까요?')) return; }

  let ok=0, fail=0;
  setStatus('등록 중...');
  for(const u of urls){
    try{ await saveOne(u, cats); ok++; }
    catch(e){ console.warn(e); fail++; }
  }
  setStatus(`등록 완료: 성공 ${ok}건, 실패 ${fail}건`);
  if(ok>0) urlsBox.value='';
}

/* ---------- 시작 ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  const getSelectedCats = renderCategories();
  btnSubmit?.addEventListener('click', ()=> onSubmit(getSelectedCats));
  setStatus('로그인 상태 확인 중...');
});

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  welcome && (welcome.textContent = loggedIn ? `안녕하세요, ${user?.displayName||'회원'}님` : '');
  if(!loggedIn){
    setStatus('로그인이 필요합니다. 상단에서 로그인해 주세요.');
  }else{
    setStatus('');
  }
});
