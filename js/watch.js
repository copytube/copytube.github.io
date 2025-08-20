// js/watch.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 상단바/드롭다운 + 자동숨김 ---------- */
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

const videoContainer  = document.getElementById("videoContainer");

let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; topbar.classList.remove('hide'); dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});

menuBtn.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); grantSoundConsent(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown.addEventListener("click", (e)=> e.stopPropagation());
btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnMyUploads?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnAbout?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });

// 스크롤/휠/스와이프/키 입력 시 드롭다운 자동 닫힘 + 상단바 자동숨김 스케줄
["scroll","wheel","touchstart","keydown"].forEach(ev=>{
  const target = (ev==='scroll') ? videoContainer : window;
  target.addEventListener(ev, ()=>{
    if(!dropdown.classList.contains('hidden')) closeDropdown();
    showTopbarTemp();
  }, {passive:true});
});

// 상단바 자동 숨김
let hideTimer = null;
function showTopbarTemp(){ topbar.classList.remove('hide'); scheduleHide(); }
function scheduleHide(){ cancelHide(); if(!isMenuOpen){ hideTimer = setTimeout(()=> topbar.classList.add('hide'), 1000); } }
function cancelHide(){ if(hideTimer){ clearTimeout(hideTimer); hideTimer = null; } }
topbar.classList.add('autohide'); scheduleHide();

/* ---------- 뷰포트 높이 보정 ---------- */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh(); window.addEventListener('resize', updateVh); window.addEventListener('orientationchange', updateVh);

/* ---------- 사운드 동의 지속 ---------- */
const SOUND_KEY = 'soundConsent';
let userSoundConsent = (localStorage.getItem(SOUND_KEY)==='1');

function grantSoundConsent(){
  if (userSoundConsent) return;
  userSoundConsent = true;
  localStorage.setItem(SOUND_KEY,'1');
  const iframe = currentActive?.querySelector('iframe');
  if (iframe){ ytCmd(iframe,"unMute"); ytCmd(iframe,"playVideo"); }
}

// 제스처로 동의 감지
['click','touchstart','pointerdown','wheel','keydown'].forEach(ev=>{
  window.addEventListener(ev, grantSoundConsent, {passive:true});
});
videoContainer.addEventListener('pointerdown', grantSoundConsent, {passive:true});

/* ---------- YouTube 제어 ---------- */
function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}

/* ---------- 피드/카테고리 로딩 ---------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
let loadedIds = new Set();
let currentActive = null;

function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

function getSelectedCategories(){
  try{
    const saved = JSON.parse(localStorage.getItem('selectedCats') || '"ALL"');
    if (saved === "ALL") return "ALL";
    if (Array.isArray(saved) && saved.length) return saved;
    return "ALL";
  }catch{ return "ALL"; }
}

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentActive = null;
}

async function loadMore(initial=false){
  if(isLoading || !hasMore) return;

  const selected = getSelectedCategories();
  isLoading = true;
  try{
    const base = collection(db, "videos");
    const parts = [];

    if(selected === "ALL"){
      parts.push(orderBy("createdAt","desc"));
    }else if(Array.isArray(selected) && selected.length){
      const cats = selected.length > 10 ? null : selected; // 안전
      if(cats){ parts.push(where("categories","array-contains-any", cats)); parts.push(orderBy("createdAt","desc")); }
      else    { parts.push(orderBy("createdAt","desc")); }
    }else{
      // 선택이 비정상인 경우
      parts.push(orderBy("createdAt","desc"));
    }

    if(lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const q = query(base, ...parts);
    const snap = await getDocs(q);

    if(snap.docs.length === 0){
      if(initial) videoContainer.innerHTML = `<div class="video"><p class="hint">영상이 없습니다.</p></div>`;
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

function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;

  // 썸네일(첫 탭에서 사운드 동의 유도)
  card.innerHTML = `
    <div class="thumb" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;position:relative;">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"
           style="max-width:100%;max-height:100%;object-fit:contain;border:0;"/>
      <div class="playhint" style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;font-size:13px;color:#fff;">
        위로 스와이프 • 화면을 탭하면 소리 허용
      </div>
    </div>`;
  card.addEventListener('pointerdown', grantSoundConsent, {passive:true});
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    if (ifr){ ytCmd(ifr,"playVideo"); if (userSoundConsent) ytCmd(ifr,"unMute"); }
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
  iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&autoplay=1&mute=${userSoundConsent?0:1}&origin=${origin}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });
  const thumb = card.querySelector('.thumb');
  if(thumb) card.replaceChild(iframe, thumb);
}

// 활성 카드 제어(새 카드 진입 시)
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');

    if(entry.isIntersecting && entry.intersectionRatio > 0.6){
      if(currentActive && currentActive !== card){
        const prev = currentActive.querySelector('iframe');
        if(prev){ ytCmd(prev,"pauseVideo"); /* mute는 유지하되 다음 카드에서 unmute 처리 */ }
      }
      currentActive = card;
      ensureIframe(card);
      const ifr = card.querySelector('iframe');
      if (ifr){
        ytCmd(ifr,"playVideo");
        if (userSoundConsent) ytCmd(ifr,"unMute"); else ytCmd(ifr,"mute");
      }
    } else {
      if (iframe){ ytCmd(iframe,"pauseVideo"); /* offscreen mute는 유지 */ }
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom) loadMore(false);
});

// 시작
resetFeed();
loadMore(true);
