import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* =========================
 * DOM
 * =======================*/
const signupLink  = document.getElementById("signupLink");
const signinLink  = document.getElementById("signinLink");
const welcome     = document.getElementById("welcome");
const menuBtn     = document.getElementById("menuBtn");
const dropdown    = document.getElementById("dropdownMenu");
const btnSignOut  = document.getElementById("btnSignOut");
const btnGoUpload = document.getElementById("btnGoUpload");
const btnGoCat    = document.getElementById("btnGoCategory");
const btnMyUploads= document.getElementById("btnMyUploads");
const brandHome   = document.getElementById("brandHome");

const videoContainer = document.getElementById("videoContainer");
const radios         = document.querySelectorAll('input.cat-radio[name="cat"]');

/* =========================
 * 상태
 * =======================*/
const ALL = "__ALL__";
let currentCat = ALL;
let lastMouseDownChecked = false;

const PAGE_SIZE = 12;
let isLoading = false;
let hasMore   = true;
let lastDoc   = null;
let loadedIds = new Set();

let userSoundConsent = false;  // 첫 사용자 제스처 이후 true
let currentActive    = null;   // 현재 화면의 활성 .video

/* =========================
 * 드롭다운
 * =======================*/
function openDropdown(){
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
}
function closeDropdown(){
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
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
  if (!dropdown.classList.contains("hidden")) closeDropdown();
});
dropdown.addEventListener("click", (e)=> e.stopPropagation());

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
btnMyUploads?.addEventListener("click", ()=>{
  location.href = "my-uploads.html";
  closeDropdown();
});

brandHome.addEventListener("click", (e)=>{
  e.preventDefault();
  closeDropdown();
  videoContainer.scrollTo({ top: 0, behavior: "auto" });
  document.getElementById("categorySection").scrollIntoView({ behavior:"smooth", block:"start" });
});

/* =========================
 * 라디오(같은 항목 재탭 → 전체 해제)
 * =======================*/
radios.forEach(r=>{
  r.addEventListener('mousedown', ()=> { lastMouseDownChecked = r.checked; });
  r.addEventListener('touchstart', ()=> { lastMouseDownChecked = r.checked; }, {passive:true});
  r.addEventListener('click', (e)=>{
    if(lastMouseDownChecked){
      r.checked = false;
      currentCat = null;   // 아무 카테고리도 선택 안 함
      resetFeed();
      showHint("카테고리를 선택하세요.");
      e.preventDefault();
      return;
    }
    currentCat = r.value;  // 새 선택
    resetFeed();
    loadMore(true);
  });
});

/* =========================
 * YouTube 제어 (자동 언뮤트)
 * =======================*/
function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  const msg = JSON.stringify({ event: "command", func, args });
  iframe.contentWindow.postMessage(msg, "*");
}

// 첫 사용자 제스처에서 소리 허용 → 현재 활성 영상 언뮤트+재생
function grantSoundAndUnmuteCurrent(){
  userSoundConsent = true;
  const iframe = currentActive?.querySelector('iframe');
  if (iframe){
    ytCmd(iframe, "unMute");
    ytCmd(iframe, "playVideo");
  }
}
const oneTimeGesture = ()=>{
  grantSoundAndUnmuteCurrent();
  window.removeEventListener('click', oneTimeGesture);
  window.removeEventListener('touchstart', oneTimeGesture);
};
window.addEventListener('click', oneTimeGesture, { once:true });
window.addEventListener('touchstart', oneTimeGesture, { once:true, passive:true });

/* =========================
 * IntersectionObserver: 활성 영상 관리
 * =======================*/
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');

    if(entry.isIntersecting && entry.intersectionRatio > 0.6){
      // 새 활성 카드
      if (currentActive && currentActive !== card){
        const prevIframe = currentActive.querySelector('iframe');
        if(prevIframe){ ytCmd(prevIframe, "mute"); ytCmd(prevIframe, "pauseVideo"); }
      }
      currentActive = card;

      // 필요 시 iframe 생성 (썸네일 → iframe 교체)
      ensureIframe(card);

      const ifr = card.querySelector('iframe');
      if (ifr){
        ytCmd(ifr, "playVideo");
        userSoundConsent ? ytCmd(ifr,"unMute") : ytCmd(ifr,"mute");
      }
    } else {
      // 비활성: 정지/음소거
      if (iframe){
        ytCmd(iframe, "mute");
        ytCmd(iframe, "pauseVideo");
      }
    }
  });
}, { root: videoContainer, threshold:[0, 0.6, 1] });

/* =========================
 * 렌더 / 카드 구성 (썸네일 프리로더)
 * =======================*/
function showHint(text){
  videoContainer.innerHTML = `
    <div class="video"><p class="hint">${text}</p></div>
  `;
}

function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;

  // 썸네일 레이어 (iframe은 활성 시점에 교체 생성)
  card.innerHTML = `
    <div class="thumb" style="
      width:100%;height:100%;display:flex;align-items:center;justify-content:center;
      background:#000;position:relative;
    ">
      <img
        src="https://i.ytimg.com/vi/${id}/hqdefault.jpg"
        alt="thumbnail"
        loading="lazy"
        style="max-width:100%;max-height:100%;object-fit:contain;border:0;"
      />
      <div class="playhint" style="
        position:absolute;bottom:16px;left:50%;transform:translateX(-50%);
        padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;
        font-size:13px;color:#fff;
      ">위로 스와이프 • 탭하면 소리</div>
    </div>
  `;

  // 탭하면 즉시 iframe 생성 + 재생 + (제스처 이후면) 언뮤트
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    if(!userSoundConsent) userSoundConsent = true;
    if (ifr){ ytCmd(ifr, "playVideo"); ytCmd(ifr, "unMute"); }
    currentActive = card;
  });

  // 활성 감시 시작
  activeIO.observe(card);
  return card;
}

function ensureIframe(card){
  if (card.querySelector('iframe')) return;
  const id = card.dataset.vid;
  const origin = encodeURIComponent(location.origin);
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&autoplay=1&mute=1&origin=${origin}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";

  const thumb = card.querySelector('.thumb');
  if (thumb) card.replaceChild(iframe, thumb);
}

// 유튜브 URL → ID
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

/* =========================
 * 데이터 로드 (무한 스크롤)
 * =======================*/
function resetFeed(){
  // 관찰 해제
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false;
  hasMore   = true;
  lastDoc   = null;
  loadedIds.clear();
  currentActive = null;
}

async function loadMore(initial=false){
  if (isLoading || !hasMore) return;
  if (currentCat === null){
    if (initial) showHint("카테고리를 선택하세요.");
    return;
  }
  isLoading = true;

  try{
    const base = collection(db, "videos");
    const parts = [];
    if (currentCat !== ALL) parts.push(where("categories","array-contains", currentCat));
    parts.push(orderBy("createdAt","desc"));
    if (lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const q = query(base, ...parts);
    const snap = await getDocs(q);

    if (snap.docs.length === 0){
      if (initial) showHint("해당 카테고리 영상이 없습니다.");
      hasMore = false;
      isLoading = false;
      return;
    }

    snap.docs.forEach(d=>{
      if (loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      const data = d.data();
      const card = makeCard(data.url, d.id);
      videoContainer.appendChild(card);
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) hasMore = false;

  } catch(e){
    console.error(e);
    if (initial) showHint("목록을 불러오지 못했습니다.");
  } finally{
    isLoading = false;
  }
}

// 스크롤 바닥 근처에서 다음 페이지 로드
videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if (nearBottom) loadMore(false);
});

// 초기 로드
loadMore(true);
