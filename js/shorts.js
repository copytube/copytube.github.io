import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// DOM
const signupLink = document.getElementById("signupLink");
const signinLink = document.getElementById("signinLink");
const welcome    = document.getElementById("welcome");
const menuBtn    = document.getElementById("menuBtn");
const dropdown   = document.getElementById("dropdownMenu");
const btnSignOut = document.getElementById("btnSignOut");
const btnGoUpload= document.getElementById("btnGoUpload");
const btnGoCat   = document.getElementById("btnGoCategory");
const btnMyUploads = document.getElementById("btnMyUploads");
const brandHome  = document.getElementById("brandHome");

const videoContainer = document.getElementById("videoContainer");
const radios   = document.querySelectorAll('input.cat-radio[name="cat"]');

const ALL = "__ALL__";
let currentCat = ALL;               // 기본: 전체선택
let lastMouseDownChecked = false;   // 라디오 재탭 해제 구현용

// 드롭다운 제어
function openDropdown(){
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
}
function closeDropdown(){
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
}

// 로그인 상태 반영
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});

// 三 버튼 → 드롭다운 토글
menuBtn.addEventListener("click", (e)=>{
  e.stopPropagation();
  if (dropdown.classList.contains("hidden")) openDropdown();
  else closeDropdown();
});

// 바깥 클릭 → 드롭다운 닫기
document.addEventListener("click", ()=>{
  if (!dropdown.classList.contains("hidden")) closeDropdown();
});
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
btnMyUploads.addEventListener("click", ()=>{
  location.href = "my-uploads.html";
  closeDropdown();
});

// 로고 → 첫 화면으로
brandHome.addEventListener("click", (e)=>{
  e.preventDefault();
  closeDropdown();
  videoContainer.scrollTo({ top: 0, behavior: "auto" });
  document.getElementById("categorySection").scrollIntoView({ behavior:"smooth", block:"start" });
});

// ---------- 라디오(단일 선택, 같은 항목 재탭 → 전체 해제) ----------
radios.forEach(r=>{
  r.addEventListener('mousedown', ()=> { lastMouseDownChecked = r.checked; });
  r.addEventListener('touchstart', ()=> { lastMouseDownChecked = r.checked; }, {passive:true});
  r.addEventListener('click', (e)=>{
    if(lastMouseDownChecked){
      r.checked = false;
      currentCat = null;           // 아무 카테고리도 선택 안 함
      loadVideos();
      e.preventDefault();
      return;
    }
    currentCat = r.value;          // 새 선택
    loadVideos();
  });
});

// ---------- 렌더 ----------
function renderVideos(urls, hint){
  videoContainer.innerHTML="";
  if(hint){
    const div=document.createElement("div");
    div.className="video";
    div.innerHTML = `<p class="hint">${hint}</p>`;
    videoContainer.appendChild(div);
    return;
  }
  if(urls.length===0){
    const div=document.createElement("div");
    div.className="video";
    div.innerHTML="<p class='hint'>해당 카테고리 영상은 모두 보셨습니다.</p>";
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

// 유튜브 URL → ID
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

// ---------- 데이터 로드 ----------
async function loadVideos(){
  if(currentCat === null){
    renderVideos([], "카테고리를 선택하세요.");
    return;
  }

  let q;
  if(currentCat === ALL){
    q = query(collection(db,"videos"), orderBy("createdAt","desc"));
  } else {
    q = query(
      collection(db,"videos"),
      where("categories","array-contains", currentCat),
      orderBy("createdAt","desc")
    );
  }

  const snap = await getDocs(q);
  renderVideos(snap.docs.map(d=>d.data().url));
}

// 초기 로드
loadVideos();
