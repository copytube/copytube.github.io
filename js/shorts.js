import { auth, db } from './firebase-init.js';
import { 
  onAuthStateChanged, 
  signOut as fbSignOut 
} from './auth.js';
import { 
  collection, getDocs, query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// DOM 요소
const signupLink=document.getElementById("signupLink");
const signinLink=document.getElementById("signinLink");
const welcome=document.getElementById("welcome");
const menuBtn=document.getElementById("menuBtn");
const floating=document.getElementById("floatingMenu");
const videoContainer=document.getElementById("videoContainer");
const catBoxes=document.querySelectorAll(".cat");

// 로그인 상태 감시
onAuthStateChanged(auth, (user)=>{
  if(user){
    // 로그인 상태
    signupLink.style.display="none";
    signinLink.style.display="none";
    welcome.textContent=`안녕하세요, ${user.displayName||'회원'}님`;
    menuBtn.classList.remove("hidden");
  } else {
    // 로그아웃 상태
    signupLink.style.display="inline";
    signinLink.style.display="inline";
    welcome.textContent="";
    menuBtn.classList.add("hidden");
    floating.classList.add("hidden");
  }
});

// 메뉴 토글
menuBtn.onclick=()=> floating.classList.toggle("hidden");

// export된 함수 (HTML에서 호출)
export function signOut(){ fbSignOut(auth); }
export function scrollToCategory(){ 
  document.getElementById("categorySection")
    .scrollIntoView({behavior:"smooth"}); 
}

// ▶ 영상 렌더링
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
    div.innerHTML=`<iframe src="https://www.youtube.com/embed/${extractId(u)}?mute=1" 
                    frameborder="0" allowfullscreen></iframe>`;
    videoContainer.appendChild(div);
  });
}

// ▶ 유튜브 URL → 영상 ID 추출
function extractId(url){
  const m=url.match(/(?:youtu\.be\/|v=)([^&]+)/);
  return m?m[1]:url;
}

// ▶ Firestore에서 영상 불러오기
async function loadVideos(){
  const active=[...catBoxes].filter(c=>c.checked).map(c=>c.value);
  let q=query(collection(db,"videos"), orderBy("createdAt","desc"));
  if(!active.includes("all")){
    q=query(
      collection(db,"videos"), 
      where("categories","array-contains-any", active), 
      orderBy("createdAt","desc")
    );
  }
  const snap=await getDocs(q);
  renderVideos(snap.docs.map(d=>d.data().url));
}

// ▶ 카테고리 체크박스 로직
catBoxes.forEach(cb=>cb.addEventListener("change",()=>{
  if(cb.value==="all"){
    if(cb.checked){
      catBoxes.forEach(c=>c.checked=true);
    } else {
      catBoxes.forEach(c=>c.checked=false);
    }
  } else {
    if(!cb.checked){ 
      document.querySelector('.cat[value="all"]').checked=false; 
    }
  }
  loadVideos();
}));

// 초기 실행
loadVideos();
