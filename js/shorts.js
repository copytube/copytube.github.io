import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// DOM
const signupLink = document.getElementById("signupLink");
const signinLink = document.getElementById("signinLink");
const welcome    = document.getElementById("welcome");
const menuBtn    = document.getElementById("menuBtn");
const dropdown   = document.getElementById("dropdownMenu");
const videoContainer = document.getElementById("videoContainer");
const catBoxes   = document.querySelectorAll(".cat");

// 로그인 상태 반영
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  dropdown.classList.add("hidden");      // 상태 바뀔 때 항상 닫기
  dropdown.classList.remove("show");     // 애니메이션 클래스 제거
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName||'회원'}님` : "";
});

// 三 클릭 → 드롭다운 토글
menuBtn.addEventListener("click", (e)=>{
  e.stopPropagation();
  // hidden ↔ show 토글 (완전 비노출 보장)
  const willOpen = dropdown.classList.contains("hidden");
  dropdown.classList.toggle("hidden", !willOpen ? true : false);
  dropdown.classList.toggle("show",   willOpen);
});

// 바깥 클릭 → 드롭다운 닫기
document.addEventListener("click", ()=>{
  if(!dropdown.classList.contains("hidden")){
    dropdown.classList.add("hidden");
    dropdown.classList.remove("show");
  }
});

// HTML에서 호출할 함수
export function signOut(){ fbSignOut(auth); }
export function scrollToCategory(){
  document.getElementById("categorySection").scrollIntoView({behavior:"smooth"});
}

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

// 유튜브 공유 URL → ID
function extractId(url){
  // youtu.be/ID  또는  youtube.com/watch?v=ID  또는 /shorts/ID
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

// Firestore에서 영상 로드
async function loadVideos(){
  const active = [...catBoxes].filter(c=>c.checked).map(c=>c.value);
  let q = query(collection(db,"videos"), orderBy("createdAt","desc"));
  if(!active.includes("all")){
    q = query(collection(db,"videos"), where("categories","array-contains-any", active), orderBy("createdAt","desc"));
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
