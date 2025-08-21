// js/about.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { sanitizeMessage, requireAdminUI } from './admin-common.js';

/* 상단바 공통 */
const signupLink = document.getElementById("signupLink");
const signinLink = document.getElementById("signinLink");
const welcome    = document.getElementById("welcome");
const menuBtn    = document.getElementById("menuBtn");
const dropdown   = document.getElementById("dropdownMenu");
const btnSignOut = document.getElementById("btnSignOut");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnAbout     = document.getElementById("btnAbout");

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen=false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"),180); }
menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown.classList.contains('hidden')?openDropdown():closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());
document.addEventListener('pointerdown', (e)=>{ if(dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
["scroll","wheel","touchmove","keydown"].forEach(ev=> addEventListener(ev, ()=>{ if(!dropdown.classList.contains('hidden')) closeDropdown(); }, {passive:true}));

btnAbout    ?.addEventListener("click", ()=>{ location.href="about.html"; closeDropdown(); });
btnMyUploads?.addEventListener("click", ()=>{ auth.currentUser? location.href="manage-uploads.html" : location.href="signin.html"; closeDropdown(); });
btnGoUpload ?.addEventListener("click", ()=>{ auth.currentUser? location.href="upload.html" : location.href="signin.html"; closeDropdown(); });
btnSignOut  ?.addEventListener("click", async ()=>{ if(auth.currentUser) await fbSignOut(auth); closeDropdown(); });

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : '';
});

/* 관리자 전용 버튼 노출 */
const btnAdminMsgs    = document.getElementById('btnAdminMsgs');
const btnAdminMembers = document.getElementById('btnAdminMembers');
requireAdminUI([btnAdminMsgs, btnAdminMembers]);

btnAdminMsgs   ?.addEventListener('click', ()=> location.href='admin-feedback.html');
btnAdminMembers?.addEventListener('click', ()=> location.href='admin-members.html');

/* 의견 전송 */
const box = document.getElementById('feedback');
const msg = document.getElementById('msg');
document.getElementById('btnSend')?.addEventListener('click', async ()=>{
  msg.textContent = '';
  const user = auth.currentUser;
  if (!user){ msg.textContent = '로그인 후 전송할 수 있습니다.'; return; }

  let content = sanitizeMessage(box.value);
  if (!content){ msg.textContent = '내용을 입력해 주세요.'; return; }

  try{
    await addDoc(collection(db, 'messages'), {
      uid: user.uid,
      displayName: user.displayName || '회원',
      content,
      createdAt: serverTimestamp(),
    });
    box.value = '';
    msg.textContent = '전송되었습니다. 감사합니다!';
  }catch(e){
    msg.textContent = '전송 실패: ' + (e.message || e);
  }
});
