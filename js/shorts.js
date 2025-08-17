import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 높이 보정 (모바일 100vh 이슈) ---------- */
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

const categorySection = document.getElementById("categorySection");
const videoContainer  = document.getElementById("videoContainer");
const boxes           = Array.from(document.querySelectorAll('input.cat-box'));
const allBox          = boxes.find(b=>b.value==="__ALL__");
const catBoxes        = boxes.filter(b=>b!==allBox);

/* ----------------- 상태 ----------------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
let loadedIds = new Set();

let userSoundConsent = false;  // 첫 제스처 이후
let currentActive    = null;   // 현재 화면의 활성 .video

// 선택 상태: null=아무것도 선택 안 함, "ALL"=전체선택, array=특정 카테고리들
let selected = "ALL";

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
document.addEventListener("click", ()=>{
  if(!dropdown.classList.contains("hidden")) closeDropdown();
});
dropdown.addEventListener("click", (e)=> e.stopPropagation());

// 메뉴 동작
btnGoCategory.addEventListener("click", ()=>{
  categorySection.scrollIntoView({behavior:"smooth"});
  closeDropdown();
});
btnMyUploads?.addEventListener("click", ()=>{
  location.href = "my-uploads.html";
  closeDropdown();
});
btnSignOut.addEventListener("click", async ()=>{
  await fbSignOut(auth);
  closeDropdown();
});
btnGoUpload.addEventListener("click", ()=>{
  location.href = "upload.html";
  closeDropdown();
});

brandHome.addEventListener("click", (e)=>{
  e.preventDefault();
  closeDropdown();
  videoContainer.scrollTo({ top: 0, behavior: "auto" });
  categorySection.scrollIntoView({ behavior:"smooth", block:"start" });
});

/* ----------------- 카테고리 로직 ----------------- */
// 전체선택 = 전부 체크 / 해제 = 전부 해제
function checkAll(on){
  allBox.checked = !!on;
  catBoxes.forEach(b=> b.checked = !!on);
  selected = on ? "ALL" : null;
  resetFeed();
  if (selected === null) showHint("카테고리를 선택하세요.");
  else loadMore(true);
}
// 초기 디폴트: 전체선택 ON
checkAll(true);

// 전체선택: change 이벤트로 단순화
allBox.addEventListener('change', ()=>{
  checkAll(allBox.checked);
});

// 개별 카테고리: change 시 동기화
function syncSelection(){
  const any  = catBoxes.some(x=>x.checked);
  const all  = catBoxes.every(x=>x.checked);

  if(all){
    allBox.checked = true;
    selected = "ALL";
  }else{
    allBox.checked = false;
    selected = any ? catBoxes.filter(x=>x.checked).map(x=>x.value) : null;
  }

  resetFeed();
  if(selected === null) showHint("카테고리를 선택하세요.");
  else loadMore(true);
}
catBoxes.forEach(b=> b.addEventListener('change', syncSelection));

/* ----------------- 상단바 자동 숨김 ----------------- */
function enterWatchMode(on){
  // 카테고리 화면이 벗어나면 watch-mode
  if(on){
    topbar.classList.add('autohide');
    showTopbarTemp();
    scheduleHide();
  }else{
    cancelHide();
    topbar.classList.remove('hide','autohide');
  }
}
// 카테고리 섹션 가시성으로 watch-mode 판단
const catIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const inView = entry.isIntersecting && entry.intersectionRatio > 0.15;
    enterWatchMode(!inView);
  });
}, { root:null, threshold:[0,0.15,1] });
catIO.observe(categorySection);

// “보이기 + 2초 후 숨기기”
function showTopbarTemp(){
  topbar.classList.remove('hide');
  scheduleHide();
}
function scheduleHide(){
  cancelHide();
  if(!isMenuOpen){
    hideTimer = setTimeout(()=> topbar.classList.add('hide'), 2000);
  }
}
function cancelHide(){
  if(hideTimer){ clearTimeout(hideTimer); hideTimer = null; }
}

// 사용자 인터랙션 시 잠깐 보였다가 다시 숨김
['scroll','wheel','touchstart','mousemove','keydown'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{
    if(!isMenuOpen){
      showTopbarTemp();
    }
  }, { passive:true });
});

/* ----------------- YouTube 제어 (첫 제스처 후 언뮤트) ----------------- */
function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}
function grantSoundAndUnmuteCurrent(){
  userSoundConsent = true;
  const iframe = currentActive?.querySelector('iframe');
  if (iframe){ ytCmd(iframe,"unMute"); ytCmd(iframe,"playVideo"); }
}
const oneTimeGesture = ()=>{
  grantSoundAndUnmuteCurrent();
  window.removeEventListener('click', oneTimeGesture);
  window.removeEventListener('touchstart', oneTimeGesture);
};
window.addEventListener('click', oneTimeGesture, { once:true });
window.addEventListener('touchstart', oneTimeGesture, { once:true, passive:true });

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
        userSoundConsent ? ytCmd(ifr,"unMute") : ytCmd(ifr,"mute");
      }
    } else {
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

/* ----------------- 렌더(썸네일 프리로더) ----------------- */
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
        위로 스와이프 • 탭하면 소리
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
      // array-contains-any 최대 10개 제한
      const cats = selected.length > 10 ? null : selected;
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

// 초기 로드
loadMore(true);
