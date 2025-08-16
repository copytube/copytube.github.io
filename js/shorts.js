import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// DOM 레퍼런스
const signupLink = document.getElementById("signupLink");
const signinLink = document.getElementById("signinLink");
const welcome    = document.getElementById("welcome");
const menuBtn    = document.getElementById("menuBtn");
const dropdown   = document.getElementById("dropdownMenu");
const btnSignOut = document.getElementById("btnSignOut");
const btnGoUpload= document.getElementById("btnGoUpload");
const btnGoCat   = document.getElementById("btnGoCategory");

const videoContainer = document.getElementById("videoContainer");
const catBoxes   = document.querySelectorAll(".cat");

// 드롭다운 제어 함수
function openDropdown(){
  dropdown.classList.remove("hidden");
  // 리플로우 후 show 적용(애니메이션)
  requestAnimationFrame(()=> dropdown.classList.add("show"));
}
function closeDropdown(){
  dropdown.classList.remove("show");
  // transition 끝난 뒤 hidden 처리
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
}

// 로그인 상태 반영
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown(); // 상태 전환 시 드롭다운 닫기
});

// 三 클릭 → 드롭다운 토글
menuBtn.addEventListener("click", (e)=>{
  e.stopPropagation();
  if (dropdown.classList.contains("hidden")) openDropdown();
  else closeDropdown();
});

// 바깥 클릭 → 드롭다운 닫기
document.addEventListener("click", ()=>{
  if (!dropdown.classList.contains("hidden")) closeDropdown();
});

// 드롭다운 내부 클릭 버블 방지
dropdown.addEventListener("click", (e)=> e.stopPropagation());

// 드롭다운 버튼 동작
btnSignOut.addEventListener("click", async ()=>{
  await fbSignOut(auth);
  closeDropdown();
});
btnGoUpload.addEventListener("click", ()=>{
  location.href = "upload.html";
  closeDropdown();
});
btnGoCat.addEventListener("click", ()=>{
  document.getElementById("categorySection").scrollIntoView({behavior:"smooth"});
  closeDropdown();
});

// -------------------- 영상 목록 --------------------
function renderVideos(urls){
  videoContainer.innerHTML="";
  if(urls.length===0){
    const div=document.createElement("div");
    div.className="video";
    div.innerHTML="<p>해당 카테고리 영상은 모두 보셨습니다.</p>";
    videoContainer.appendChild(div);
    return;
  }
  urls.forEach(u=>{
    const div=document.createElement("div");
    div.className="video";
    div.innerHTML = `<iframe src="https://www.youtube.com/embed/${extractId(u)}?mute=1" allowfullscreen></iframe>`;
    videoContainer.appendChild(div);
  });
}

// 유튜브 공유 URL → ID (youtu.be / watch?v= / shorts/)
function extractId(url){
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

// Firestore에서 영상 로드
async function loadVideos(){
  const active = [...catBoxes].filter(c=>c.checked).map(c=>c.value);

  // 아무것도 선택 안 된 경우
  if (active.length === 0){
    renderVideos([]);
    return;
  }

  let q = query(collection(db,"videos"), orderBy("createdAt","desc"));
  if(!active.includes("all")){
    q = query(
      collection(db,"videos"),
      where("categories","array-contains-any", active),
      orderBy("createdAt","desc")
    );
  }
  const snap = await getDocs(q);
  renderVideos(snap.docs.map(d=>d.data().url));
}

// 카테고리 로직
catBoxes.forEach(cb=>cb.addEventListener("change",()=>{
  if(cb.value==="all"){
    if(cb.checked){ catBoxes.forEach(c=>c.checked=true); }
    else { catBoxes.forEach(c=>c.checked=false); }
  }else{
    if(!cb.checked){ document.querySelector('.cat[value="all"]').checked=false; }
  }
  loadVideos();
}));

// 초기 로드
loadVideos();
