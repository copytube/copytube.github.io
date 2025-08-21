// js/watch.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 높이 보정 ---------- */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh();
window.addEventListener('resize', updateVh);
window.addEventListener('orientationchange', updateVh);

/* ----------------- DOM ----------------- */
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

/* ----------------- 드롭다운 ----------------- */
let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});

menuBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if (dropdown.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());
["scroll","wheel","keydown","touchmove"].forEach(ev=>{
  window.addEventListener(ev, ()=>{ if(!dropdown.classList.contains('hidden')) closeDropdown(); }, {passive:true});
});

// 로그인 필요 메뉴는 미로그인 시 로그인 페이지로 유도
function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if (!auth.currentUser){ location.href = 'signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ goOrSignIn("upload.html"); closeDropdown(); });
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); location.href = "index.html"; });

/* ----------------- 상단바 자동 숨김 ----------------- */
const HIDE_DELAY_MS = 1000;
let hideTimer = null;
function showTopbarTemp(){ topbar.classList.remove('hide'); scheduleHide(); }
function scheduleHide(){ if(hideTimer) clearTimeout(hideTimer); if(!isMenuOpen){ hideTimer = setTimeout(()=> topbar.classList.add('hide'), HIDE_DELAY_MS); } }
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbarTemp(); }, { passive:true });
});
let touchStartY = null;
videoContainer.addEventListener('touchstart', (e)=>{ touchStartY = e.touches[0]?.clientY ?? null; }, {passive:true});
videoContainer.addEventListener('touchend', (e)=>{
  if(touchStartY!=null){
    const dy = (e.changedTouches[0]?.clientY ?? touchStartY) - touchStartY;
    if(Math.abs(dy) > 20) showTopbarTemp();
  }
  touchStartY = null;
}, {passive:true});

/* ----------------- 선택/연속재생 플래그 ----------------- */
function getSelectedCats(){ try { return JSON.parse(localStorage.getItem('selectedCats')||'null'); } catch { return "ALL"; } }
const AUTO_NEXT = localStorage.getItem('autonext') === 'on';

/* ----------------- YouTube 제어 ----------------- */
let userSoundConsent = false;   // 한 번 허용되면 이후 카드도 소리 재생
let currentActive    = null;

// ▶ postMessage 유틸
function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}
// ▶ 현재 정책을 iframe에 적용
function applyAudioPolicy(iframe){
  if (!iframe) return;
  if (userSoundConsent){
    ytCmd(iframe, "setVolume", [100]);
    ytCmd(iframe, "unMute");
  } else {
    ytCmd(iframe, "mute");
  }
}

/* ----- 최초 사용자 제스처로 전역 허용 ----- */
function grantSoundAndUnmuteCurrent(){
  userSoundConsent = true;
  const iframe = currentActive?.querySelector('iframe');
  if (iframe){
    ytCmd(iframe, "setVolume", [100]);
    ytCmd(iframe, "unMute");
    ytCmd(iframe, "playVideo");
  }
}
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

/* ----- 각 플레이어 onReady 보장 처리 ----- */
// iframe.contentWindow -> card 매핑
const winToCard = new Map();

window.addEventListener('message', (e)=>{
  if (typeof e.data !== 'string') return;
  let data; try{ data = JSON.parse(e.data); }catch{ return; }
  if (!data || !data.event) return;

  // 동영상 종료 → 자동 다음
  if (data.event === 'onStateChange' && data.info === 0){
    const card = winToCard.get(e.source);
    if (!card) return;
    const activeIframe = currentActive?.querySelector('iframe');
    if (!activeIframe || e.source !== activeIframe.contentWindow) return;
    if (AUTO_NEXT){ goToNextCard(); }
    return;
  }

  // 플레이어 준비 완료 → 현재 활성 카드면 정책 적용
  if (data.event === 'onReady'){
    const card = winToCard.get(e.source);
    if (!card) return;
    const iframe = card.querySelector('iframe');
    if (card === currentActive){
      applyAudioPolicy(iframe);
      ytCmd(iframe, "playVideo"); // 준비 직후 보장
    }else{
      // 프리로드 카드는 항상 음소거 유지
      ytCmd(iframe, "mute");
    }
    return;
  }
}, false);

/* ----------------- 활성 영상 ----------------- */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');

    if(entry.isIntersecting && entry.intersectionRatio >= 0.6){
      if(currentActive && currentActive !== card){
        const prev = currentActive.querySelector('iframe');
        if(prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }
      currentActive = card;
      ensureIframe(card);

      const ifr = card.querySelector('iframe');
      if (ifr){
        ytCmd(ifr,"playVideo");
        applyAudioPolicy(ifr);      // ✅ 준비 전이라도 시도, onReady에서 한 번 더 보장
      }
      const next = card.nextElementSibling;
      if (next && next.classList.contains('video')) ensureIframe(next); // 프리로드(음소거 유지)
      showTopbarTemp();
    } else {
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

/* ----------------- 렌더 ----------------- */
function showHint(text){ videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto">${text}</p></div>`; }

function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;

  card.innerHTML = `
    <div class="thumb">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"/>
      <div class="playhint">위로 스와이프 · 탭/스크롤/키 입력 시 소리 허용</div>
      ${userSoundConsent ? '' : '<div class="mute-tip">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
    </div>
  `;
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    if(!userSoundConsent) userSoundConsent = true; // 카드 탭으로도 허용
    if (ifr){
      ytCmd(ifr,"setVolume",[100]);
      ytCmd(ifr,"unMute");
      ytCmd(ifr,"playVideo");
    }
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
  const playerId = `yt-${id}-${Math.random().toString(36).slice(2,8)}`;
  iframe.id = playerId;
  iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&autoplay=1&mute=1&rel=0&origin=${origin}&widget_referrer=${encodeURIComponent(location.href)}&playerapiid=${encodeURIComponent(playerId)}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });
  iframe.addEventListener('load', ()=>{
    try{
      // onReady, onStateChange 구독
      iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id: playerId }), '*');
      ytCmd(iframe, "addEventListener", ["onStateChange"]);
      ytCmd(iframe, "addEventListener", ["onReady"]);
      // 매핑 등록
      winToCard.set(iframe.contentWindow, card);
    }catch{}
  });
  const thumb = card.querySelector('.thumb');
  thumb ? card.replaceChild(iframe, thumb) : card.appendChild(iframe);
}

function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

/* ----------------- 데이터 로드 ----------------- */
const PAGE_SIZE = 12;
let isLoading = false, lastDoc = null;
let loadedIds = new Set();
let hasMore = true;
let isLoadingMore = false;

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentActive = null;
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
      const cats = selected.length > 10 ? null : selected;
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

videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom) loadMore(false);
});

/* ----------------- 자동 다음 ----------------- */
async function goToNextCard(){
  const next = currentActive?.nextElementSibling;
  if (next && next.classList.contains('video')){
    next.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  if (!hasMore || isLoadingMore) return;
  isLoadingMore = true;
  const prevCount = videoContainer.querySelectorAll('.video').length;
  await loadMore(false);
  const nowCount = videoContainer.querySelectorAll('.video').length;
  if (nowCount > prevCount){
    const firstNew = videoContainer.querySelectorAll('.video')[prevCount];
    if (firstNew) firstNew.scrollIntoView({ behavior:'smooth', block:'start' });
  }else{
    showTopbarTemp();
  }
  isLoadingMore = false;
}

/* ----------------- 시작: 인증 무관 ----------------- */
resetFeed();
loadMore(true);
showTopbarTemp();
