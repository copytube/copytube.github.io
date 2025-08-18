// js/watch.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter,
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 높이 보정 ---------- */
function updateVh(){
  document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`);
}
updateVh();
window.addEventListener('resize', updateVh);
window.addEventListener('orientationchange', updateVh);

/* ---------- DOM ---------- */
const topbar       = document.getElementById("topbar");
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnGoCategory= document.getElementById("btnGoCategory");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const brandHome    = document.getElementById("brandHome");
const videoContainer  = document.getElementById("videoContainer");

/* ---------- 상단 드롭다운 ---------- */
function openDropdown(){
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
  dropdown.setAttribute('aria-hidden','false');
  showTopbarTemp();
}
function closeDropdown(){
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
  dropdown.setAttribute('aria-hidden','true');
  scheduleHide();
}
menuBtn?.addEventListener("click", (e)=>{
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
btnGoCategory?.addEventListener("click", ()=>{ location.href = "./"; });
btnMyUploads?.addEventListener("click", ()=>{ location.href = "my-uploads.html"; });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); location.href="./"; });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; });
brandHome?.addEventListener("click", (e)=>{ e.preventDefault(); location.href="./"; });

/* ---------- 로그인 상태 표시 ---------- */
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
});

/* ---------- 상단바 자동 숨김 ---------- */
topbar.classList.add('autohide');
let hideTimer = null;
function showTopbarTemp(){
  topbar.classList.remove('hide');
  scheduleHide();
}
function scheduleHide(){
  cancelHide();
  hideTimer = setTimeout(()=> topbar.classList.add('hide'), 1000); // 1초
}
function cancelHide(){
  if(hideTimer){ clearTimeout(hideTimer); hideTimer = null; }
}

// 모든 제스처(위/아래 스와이프 포함)에서 상단바 잠깐 노출
videoContainer.addEventListener('scroll', showTopbarTemp, { passive:true });
['touchstart','touchmove','wheel','mousemove','keydown','pointerdown'].forEach(ev=>{
  const target = window;
  target.addEventListener(ev, showTopbarTemp, { passive:true });
});

/* ---------- 선택 불러오기 ---------- */
const LS_KEY = 'copytube_selected_categories';
async function loadSelection(){
  // 로그인 우선
  if(auth.currentUser){
    try{
      const s = await getDoc(doc(db,'users', auth.currentUser.uid));
      if (s.exists()){
        const d = s.data();
        if (d?.selectAll) return { all:true, cats:[] };
        const arr = Array.isArray(d?.selectedCategories) ? d.selectedCategories : [];
        return { all:false, cats:arr };
      }
    }catch{}
  }
  // 비로그인 또는 실패 → localStorage
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const st = JSON.parse(raw);
      if (st?.selectAll) return { all:true, cats:[] };
      const arr = Array.isArray(st?.selected) ? st.selected : [];
      return { all:false, cats:arr };
    }
  }catch{}
  // 기본: 전체
  return { all:true, cats:[] };
}

/* ---------- 시청(무한 스크롤) ---------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
let loadedIds = new Set();
let userSoundConsent = false;
let currentActive    = null;

function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}
function grantSoundAndUnmuteCurrent(){
  userSoundConsent = true;
  const iframe = currentActive?.querySelector('iframe');
  if (iframe){ ytCmd(iframe,"unMute"); ytCmd(iframe,"playVideo"); }
}
const grantOnce = ()=>{
  grantSoundAndUnmuteCurrent();
  ['click','touchstart','pointerdown','wheel','keydown'].forEach(ev=>{
    window.removeEventListener(ev, grantOnce, opts(ev));
  });
};
const opts = (ev)=> (ev==='touchstart' ? { once:true, passive:true } : { once:true });
['click','touchstart','pointerdown','wheel','keydown'].forEach(ev=>{
  window.addEventListener(ev, grantOnce, opts(ev));
});

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

function showHint(text){
  videoContainer.innerHTML = `<div class="video"><p class="hint">${text}</p></div>`;
}
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
        위/아래 스와이프 시 상단바가 표시됩니다 • 탭/스크롤/키 입력으로 소리 허용
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
  const params = 'enablejsapi=1&playsinline=1&rel=0&autoplay=1&mute=1';
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}?${params}&origin=${origin}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });
  const thumb = card.querySelector('.thumb');
  if(thumb) card.replaceChild(iframe, thumb);
}
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/);
  return m ? m[1] : url;
}

async function loadMore(initial=false, selection){
  if(isLoading || !hasMore) return;

  isLoading = true;
  try{
    const base = collection(db, "videos");
    const parts = [];

    if(selection.all){
      parts.push(orderBy("createdAt","desc"));
    }else{
      const cats = selection.cats.length > 10 ? null : selection.cats; // array-contains-any 한계(10)
      if(cats){
        parts.push(where("categories","array-contains-any", cats));
        parts.push(orderBy("createdAt","desc"));
      }else{
        parts.push(orderBy("createdAt","desc"));
      }
    }

    if(lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const q = query(base, ...parts));
    const snap = await getDocs(q);

    if(snap.docs.length === 0){
      if(initial) showHint("해당 카테고리 영상이 없습니다.");
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
    if(initial) showHint("목록을 불러오지 못했습니다.");
  }finally{
    isLoading = false;
  }
}

videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom) loadMore(false, SELECTION);
});

/* ---------- 시작 ---------- */
let SELECTION = { all:true, cats:[] };

(async ()=>{
  SELECTION = await loadSelection();
  showTopbarTemp(); // 진입 시 한 번 노출
  await loadMore(true, SELECTION);
})();
