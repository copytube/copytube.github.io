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
    <div class="thumb" style="width:100%;height:100%;display:flex;align-items:center;justify-
