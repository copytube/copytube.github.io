// js/watch.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* 뷰포트 보정 */
function updateVh(){
  document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`);
}
updateVh();
window.addEventListener('resize', updateVh);
window.addEventListener('orientationchange', updateVh);

/* DOM */
const topbar       = document.getElementById("topbar");
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnGoCategory= document.getElementById("btnGoCategory");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnAbout     = document.getElementById("btnAbout");
const brandHome    = document.getElementById("brandHome");

const videoContainer  = document.getElementById("videoContainer");

/* 드롭다운 */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  showTopbarTemp();
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
  scheduleHide();
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

btnGoCategory?.addEventListener("click", ()=>{ location.href="./"; closeDropdown(); });
btnMyUploads?.addEventListener("click", ()=>{ location.href="manage-uploads.html"; closeDropdown(); });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href="upload.html"; closeDropdown(); });
btnAbout?.addEventListener("click", ()=>{ location.href="about.html"; closeDropdown(); });
brandHome?.addEventListener("click", (e)=>{ e.preventDefault(); location.href="./"; });

/* 상단바 자동 숨김: 1초 */
function showTopbarTemp(){
  topbar.classList.remove('hide');
  scheduleHide();
}
let hideTimer=null;
function scheduleHide(){
  cancelHide();
  if(!isMenuOpen){
    hideTimer = setTimeout(()=> topbar.classList.add('hide'), 1000);
  }
}
function cancelHide(){
  if(hideTimer){ clearTimeout(hideTimer); hideTimer=null; }
}
['scroll','wheel','touchstart','mousemove','keydown'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen){ showTopbarTemp(); } }, { passive:true });
});

/* 상태 */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
let loadedIds = new Set();

let userSoundConsent = false;
let currentActive    = null;

/* 사운드 허용 한 번만 */
const grantOnce = ()=>{
  userSoundConsent = true;
  const iframe = currentActive?.querySelector('iframe');
  if (iframe){ ytCmd(iframe,"unMute"); ytCmd(iframe,"playVideo"); }
  ['click','touchstart','pointerdown','wheel','keydown'].forEach(ev=>{
    window.removeEventListener(ev, grantOnce, opts(ev));
  });
};
const opts = (ev)=> (ev==='touchstart' ? { once:true, passive:true } : { once:true });
['click','touchstart','pointerdown','wheel','keydown'].forEach(ev=>{
  window.addEventListener(ev, grantOnce, opts(ev));
});

/* 선택 카테고리 로드 */
function getSelectedCats(){
  try{
    const raw = localStorage.getItem('selectedCats');
    const v = JSON.parse(raw);
    return v;
  }catch{ return "ALL"; }
}

/* 유튜브 제어 */
function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}

/* 활성 카드 IO */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');

    if(entry.isIntersecting && entry.intersectionRatio > 0.6){
      if(currentActive && currentActive !== card){
        const prev = currentActive.querySelector('iframe');
        if(prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }
      currentActive = card;
      ensureIframe(card);
      const ifr = card.querySelector('iframe');
      if (ifr){
        ytCmd(ifr,"playVideo");
        userSoundConsent ? ytCmd(ifr,"unMute") : ytCmd(ifr,"mute");
      }
    } else {
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

/* 카드 렌더 */
function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;

  card.innerHTML = `
    <div class="thumb" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;position:relative;">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"
           style="max-width:100%;max-height:100%;object-fit:contain;border:0;"/>
      <div class="playhint" style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;font-size:13px;color:#fff;">
        위로 스와이프 • 탭/스크롤/키 입력 시 소리 허용
      </div>
    </div>`;
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    if(!userSoundConsent) userSoundConsent = true;
    if (ifr){ ytCmd(ifr,"playVideo"); ytCmd(ifr,"unMute"); }
    currentActive = card;
  });

  activeIO.observe(card);
  return card;
}
function ensureIframe(card){
  if(card.querySelector('iframe')) return;
  const id = card.dataset.vid;
  const origin = encodeURIComponent(location.origin);
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&autoplay=1&mute=1&origin=${origin}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });
  const thumb = card.querySelector('.thumb');
  if(thumb) card.replaceChild(iframe, thumb);
}
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

/* 피드 상태 */
let selected = getSelectedCats();

/* 리셋/로딩 */
function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentActive = null;
}
async function loadMore(initial=false){
  if(isLoading || !hasMore) return;

  isLoading = true;
  try{
    const base = collection(db, "videos");
    const parts = [];

    if(selected === "ALL"){
      parts.push(orderBy("createdAt","desc"));
    }else if(Array.isArray(selected) && selected.length){
      const cats = selected.length > 10 ? null : selected; // array-contains-any 최대 10
      if(cats){
        parts.push(where("categories","array-contains-any", cats));
        parts.push(orderBy("createdAt","desc"));
      }else{
        parts.push(orderBy("createdAt","desc"));
      }
    }else{
      // 비정상 → ALL
      parts.push(orderBy("createdAt","desc"));
    }

    if(lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const q = query(base, ...parts);
    const snap = await getDocs(q);

    if(snap.docs.length === 0){
      if(initial) videoContainer.innerHTML = `<div class="video"><p class="hint">해당 카테고리 영상이 없습니다.</p></div>`;
      hasMore = false; isLoading = false; return;
    }

    snap.docs.forEach(d=>{
      if(loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      const data = d.data();
      videoContainer.appendChild(makeCard(data.url, d.id));
    });

    lastDoc = snap.docs[snap.docs.length-1];
    if(snap.docs.length < PAGE_SIZE) hasMore = false;

  }catch(e){
    console.error(e);
    if(initial) videoContainer.innerHTML = `<div class="video"><p class="hint">목록을 불러오지 못했습니다.</p></div>`;
  }finally{
    isLoading = false;
  }
}
videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom) loadMore(false);
});

/* 시작 */
resetFeed();
loadMore(true);
