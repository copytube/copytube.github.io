// js/watch.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 높이 보정 (모바일 주소창 높이 대응) ---------- */
function updateVh(){
  document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`);
}
updateVh();
window.addEventListener('resize', updateVh);
window.addEventListener('orientationchange', updateVh);

/* ---------- DOM ---------- */
const topbar        = document.getElementById("topbar");
const signupLink    = document.getElementById("signupLink");
const signinLink    = document.getElementById("signinLink");
const welcome       = document.getElementById("welcome");
const menuBtn       = document.getElementById("menuBtn");
const dropdown      = document.getElementById("dropdownMenu");
const btnSignOut    = document.getElementById("btnSignOut");
const btnGoUpload   = document.getElementById("btnGoUpload");
const btnGoCategory = document.getElementById("btnGoCategory");
const btnMyUploads  = document.getElementById("btnMyUploads");
const btnAbout      = document.getElementById("btnAbout");
const brandHome     = document.getElementById("brandHome");
const videoContainer = document.getElementById("videoContainer");

/* ---------- 드롭다운 (index와 동일한 터치 처리) ---------- */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
}
function closeDropdown(){
  isMenuOpen = false;
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
// 바깥 조작 시 닫기 (pointerdown; touchstart 아님)
document.addEventListener('pointerdown', (e)=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
}, true);
// 스크롤/휠/키 입력 시 닫기
["scroll","wheel","keydown","touchmove"].forEach(ev=>{
  window.addEventListener(ev, ()=>{ if(!dropdown.classList.contains('hidden')) closeDropdown(); }, {passive:true});
});
// 내부 클릭 버블 차단
dropdown.addEventListener("click", (e)=> e.stopPropagation());
// 내비게이션
btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnMyUploads ?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); location.href = "index.html"; });

/* ---------- 상단바: 스와이프/조작 시 1초 노출 후 숨김 ---------- */
const HIDE_DELAY_MS = 1000;
let hideTimer = null;
function showTopbarTemp(){
  topbar.classList.remove('hide');
  scheduleHide();
}
function scheduleHide(){
  if(hideTimer) clearTimeout(hideTimer);
  if(!isMenuOpen){
    hideTimer = setTimeout(()=> topbar.classList.add('hide'), HIDE_DELAY_MS);
  }
}
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbarTemp(); }, { passive:true });
});
// 모서리(첫/마지막)에서 스와이프만 해도 1초 표시되도록
let touchStartY = null;
videoContainer.addEventListener('touchstart', (e)=>{ touchStartY = e.touches[0]?.clientY ?? null; }, {passive:true});
videoContainer.addEventListener('touchend', (e)=>{
  if(touchStartY!=null){
    const dy = (e.changedTouches[0]?.clientY ?? touchStartY) - touchStartY;
    if(Math.abs(dy) > 20) showTopbarTemp();
  }
  touchStartY = null;
}, {passive:true});

/* ---------- 선택 카테고리 ---------- */
function getSelectedCats(){
  try { return JSON.parse(localStorage.getItem('selectedCats')||'null'); }
  catch { return "ALL"; }
}

/* ---------- YouTube 제어: 최초 언뮤트 후 전 카드 자동 언뮤트 ---------- */
let userSoundConsent = false;   // 사용자가 한 번이라도 소리 허용했는지
let currentActive    = null;    // 현재 재생 중인 카드(div.video)

function ytCmd(iframe, func, args = []){
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}

// 명시적 언뮤트(탭/키/클릭 등 사용자 제스처) → 상태 저장 + 현재 카드 언뮤트/재생
function grantSoundAndUnmuteCurrent(){
  userSoundConsent = true;
  const iframe = currentActive?.querySelector('iframe');
  if (iframe){
    ytCmd(iframe, "unMute");
    ytCmd(iframe, "playVideo");
  }
}

// 한 번만: 아무 사용자 제스처에서 소리 허용으로 간주
const onceOpts = (ev)=> (ev==='touchstart' ? { once:true, passive:true } : { once:true });
const grantOnce = ()=>{
  grantSoundAndUnmuteCurrent();
  ['click','pointerdown','wheel','keydown','touchstart'].forEach(ev=>{
    window.removeEventListener(ev, grantOnce, onceOpts(ev));
  });
};
['click','pointerdown','wheel','keydown','touchstart'].forEach(ev=>{
  window.addEventListener(ev, grantOnce, onceOpts(ev));
});

/* ---------- 활성 카드 관리 (IntersectionObserver) ---------- */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');

    if (entry.isIntersecting && entry.intersectionRatio >= 0.6){
      // 이전 카드 정리
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
      showTopbarTemp(); // 새 카드 진입 시 1초 노출
    }else{
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
}, { root: videoContainer, threshold: [0, 0.6, 1] });

/* ---------- 카드/임베드 ---------- */
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}
function ensureIframe(card){
  if(card.querySelector('iframe')) return;
  const id = card.dataset.vid;
  const origin = encodeURIComponent(location.origin);
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&autoplay=1&mute=1&rel=0&origin=${origin}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });

  // 바꿔치기
  const thumb = card.querySelector('.thumb');
  thumb ? card.replaceChild(iframe, thumb) : card.appendChild(iframe);
}

function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;

  // 썸네일 + 첫 방문 안내
  card.innerHTML = `
    <div class="thumb">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"/>
      <div class="playhint">위로 스와이프 · 탭/스크롤/키 입력 시 소리 허용</div>
      ${userSoundConsent ? '' : '<div class="mute-tip">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
    </div>
  `;

  // 카드 탭 → 임베드 생성 + 소리 허용
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    if (!userSoundConsent) userSoundConsent = true;
    if (ifr){ ytCmd(ifr,"playVideo"); ytCmd(ifr,"unMute"); }
    currentActive = card;
  });

  activeIO.observe(card);
  return card;
}

/* ---------- 데이터 로드(무한 스크롤) ---------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
let loadedIds = new Set();

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentActive = null;
}

function showHint(text){
  videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto">${text}</p></div>`;
}

async function loadMore(initial=false){
  if(isLoading || !hasMore) return;
  isLoading = true;

  const selected = getSelectedCats();

  try{
    const base = collection(db, "videos");
    const parts = [];

    if(selected === "ALL" || !selected){
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
      parts.push(orderBy("createdAt","desc"));
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

    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if(snap.docs.length < PAGE_SIZE) hasMore = false;

  }catch(e){
    console.error(e);
    if(initial) showHint("목록을 불러오지 못했습니다.");
  }finally{
    isLoading = false;
  }
}

// 바닥 근처 프리페치
videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom) loadMore(false);
});

/* ---------- 시작 ---------- */
resetFeed();
loadMore(true);
showTopbarTemp();   // 초기 1초 노출
