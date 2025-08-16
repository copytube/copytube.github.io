import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const menuBtn=document.getElementById("menuBtn");
const floating=document.getElementById("floatingMenu");
menuBtn.onclick=()=> floating.classList.toggle("hidden");

export function signOut(){ fbSignOut(auth); }
export function scrollToCategory(){ document.getElementById("categorySection").scrollIntoView({behavior:"smooth"}); }

const videoContainer=document.getElementById("videoContainer");
const catBoxes=document.querySelectorAll(".cat");

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
    div.innerHTML=`<iframe src="https://www.youtube.com/embed/${extractId(u)}?mute=1" allowfullscreen></iframe>`;
    videoContainer.appendChild(div);
  });
}
function extractId(url){
  const m=url.match(/(?:youtu\.be\/|v=)([^&]+)/);
  return m?m[1]:url;
}

async function loadVideos(){
  const active=[...catBoxes].filter(c=>c.checked).map(c=>c.value);
  let q=query(collection(db,"videos"), orderBy("createdAt","desc"));
  if(!active.includes("all")){
    q=query(collection(db,"videos"), where("categories","array-contains-any", active), orderBy("createdAt","desc"));
  }
  const snap=await getDocs(q);
  renderVideos(snap.docs.map(d=>d.data().url));
}
catBoxes.forEach(cb=>cb.addEventListener("change",()=>{
  if(cb.value==="all"){
    if(cb.checked){
      catBoxes.forEach(c=>c.checked=true);
    } else {
      catBoxes.forEach(c=>c.checked=false);
    }
  } else {
    if(!cb.checked){ document.querySelector('.cat[value="all"]').checked=false; }
  }
  loadVideos();
}));

loadVideos();
