// js/watch.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 높이 보정 ---------- */
function updateVh(){
  document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`);
}
updateVh();
window.addEventListener('resize', updateVh);
window.addEventListener('orientationchange', updateVh);

/* ----------------- DOM ----------------- */
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
const brandHome    = document.getElementById("brandHome");

const videoContainer  = document.getElementById("videoContainer");

/* ----------------- 상태 ----------------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
let loadedIds = new Set();

let userSoundConsent = false;
let currentActive    = null;

// 선택된 카테고리: index/select에서 저장한 값을 불러옴
// 저장 키는 localStorage 또는 sessionStorage 둘 다 대비
function loadSelected(){
  let raw = localStorage.getItem('selectedCats') || sessionStorage.getItem('selectedCats');
  try {
    if (!raw) return "ALL";
    const parsed = JSON.parse(raw);
    if (parsed === "ALL" || parsed === "__ALL__") return "ALL";
    if (Array.isArray(parsed) && parsed.length) return parsed;
    return "ALL";
  } catch { return "ALL"; }
}
let selected = loadSelected();

// 상단바 자동숨김
let isMenuOpen = false;
let hideTimer = null;

/* ----------------- 드롭다운 ----------------- */
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
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  menuBtn?.classList.toggle("hidden", !loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});

menuBtn?.addEventListener("click", (e)=>{
  e.stopPropagation();
  dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown();
});

function onOutsidePointer(e){
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
}
document.addEventListener('pointerdown', onOutsidePointer, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());

btnGoCategory?.addEventListener("click", ()=>{
  location.href = "./"; // 카테고리 선택 화면(홈)으로
  closeDropdown();
});
btnMyUploads?.addEventListener("click", ()=>{
  // 운영 중인 관리 페이지로 연결
  location.href = "list-url-and-categories.html";
  closeDropdown();
});
btnSignOut?.addEventListener("click", async ()=>{
  await fbSignOut(auth);
  closeDropdown();
});
btnGoUpload?.addEventListener("click", ()=>{
  location.href = "upload.html";
  closeDropdown();
});

brandHome?.addEventListener("click", (e)=>{
  e.preventDefault();
  closeDropdown();
  location.href = "./";
});

/* ----------------- 상단바 자동 숨김 ----------------- */
function enterWatchMode(on){
  if(on){
    topbar.classList.add('autohide');
    showTopbarTemp();
    scheduleHide();
  }else{
    cancelHide();
    topbar.classList.remove('hide','autohide');
  }
}
function showTopbarTemp(){
  topbar.classList.remove('hide');
  scheduleHide();
}
function scheduleHide(){
  cancelHide();
  if(!isMenuOpen){
    hideTimer = setTimeout(()=> topbar.classList.add('hide'), 1000); // 1초 후 숨김
  }
}
function cancelHide(){
  if(hideTimer){ clearTimeout(hideTimer); hideTimer = null; }
}
// 스크롤/터치/이동에 반응해 잠깐 나타났다 다시 숨김
['scroll','wheel','touchstart','mousemove','keydown'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen){ showTopbarTemp(); } }, { passive:true });
});

/* ---------- YouTube 제어 & 언뮤트 보강 ---------- */
function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}

// onReady 타이밍/지연 대비: 여러 번 언뮤트 재시도
const pendingUnmuteIds = new Set();
function attemptUnmute(iframe){
  if (!iframe || !userSoundConsent) return;
  [0, 120, 400, 1000].forEach(t =>
    setTimeout(() => {
      ytCmd(iframe, "unMute");
      ytCmd(iframe, "playVideo");
    }, t)
  );
}

// 사용자가 한 번 소리 허용(임의 제스처)
function grantSoundAndUnmuteCurrent(){
  userSoundConsent = true;
  const iframe = currentActive?.querySelector('iframe');
  if (iframe) attemptUnmute(iframe);
}
// 최초 제스처 한 번만 감지
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

// IFrame API onReady에서도 최종 보정
window.addEventListener('message', (e)=>{
  if (!e || !e.data) return;
  let data;
  try { data = JSON.parse(e.data); } catch { return; }
  if (data && data.event === 'onReady' && data.id && pendingUnmuteIds.has(data.id)) {
    const ifr = document.getElementById(data.id);
    if (ifr) attemptUnmute(ifr);
    pendingUnmuteIds.delete(data.id);
  }
}, { passive:true });

/* ----------------- 활성 영상 관리 ----------------- */
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
        if (userSoundConsent) {
          attemptUnmute(ifr);      // ✅ 소리 허용된 상태면 즉시 언뮤트 시도
        } else {
          ytCmd(ifr,"mute");
        }
      }
    } else {
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

/* ----------------- 렌더 ----------------- */
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
        위로 스와이프 • 탭/스크롤/키 입력 시 소리 허용
      </div>
    </div>`;
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    userSoundConsent = true;   // 탭은 명확한 제스처로 간주
    if (ifr){ attemptUnmute(ifr); }
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

  // ✅ 소리 허용 시 처음부터 mute=0로 시작
  const muteParam = userSoundConsent ? 0 : 1;

  iframe.id  = `yt_${id}_${Date.now()}`;
  iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&autoplay=1&mute=${muteParam}&origin=${origin}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });

  // 로드 이후에도 안전하게 언뮤트 재시도
  iframe.addEventListener('load', ()=> attemptUnmute(iframe));
  if (userSoundConsent) pendingUnmuteIds.add(iframe.id);

  const thumb = card.querySelector('.thumb');
  if(thumb) card.replaceChild(iframe, thumb);
}
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/);
  return m ? m[1] : url;
}

/* ----------------- 데이터 로드(무한 스크롤) ----------------- */
function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentActive = null;
}
async function loadMore(initial=false){
  if(isLoading || !hasMore) return;

  if(selected === null){
    if(initial) showHint("카테고리를 선택하세요.");
    return;
  }
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
    }

    if(lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const q = query(base, ...parts);
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
  if(nearBottom) loadMore(false);
});

// watch 페이지에 들어오면 바로 감상 모드
enterWatchMode(true);
resetFeed();
loadMore(true);
