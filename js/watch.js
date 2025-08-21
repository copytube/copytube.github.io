// js/watch.js — clean rewrite (iPad 스와이프/언뮤트 지속/초기로딩 가속/슬리버 제거)
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* =========================
   뷰포트 보정 + 카드 높이 강제 동기화
   ========================= */
let lastVhPx = 0;
function calcVhPx(){
  // iOS Safari 주소창 표시/숨김에 따라 innerHeight가 바뀌므로 매번 픽셀을 재계산
  return Math.max(1, Math.floor(window.innerHeight || document.documentElement.clientHeight || 0));
}
function updateVh(){
  lastVhPx = calcVhPx();
  document.documentElement.style.setProperty('--app-vh', `${lastVhPx}px`);
  enforceItemHeights();
}
function enforceItemHeights(){
  // 각 카드 높이를 정확히 같은 픽셀로 강제 → 스냅 시 다음 카드 "비치는" 현상 방지
  const h = `${lastVhPx}px`;
  document.querySelectorAll('#videoContainer .video').forEach(el => { el.style.height = h; });
}
updateVh();
addEventListener('resize', updateVh, { passive:true });
addEventListener('orientationchange', ()=> setTimeout(updateVh, 60), { passive:true });
document.addEventListener('visibilitychange', ()=> { if(!document.hidden) setTimeout(updateVh, 60); }, { passive:true });

/* =========================
   DOM
   ========================= */
const topbar         = document.getElementById("topbar");
const signupLink     = document.getElementById("signupLink");
const signinLink     = document.getElementById("signinLink");
const welcome        = document.getElementById("welcome");
const menuBtn        = document.getElementById("menuBtn");
const dropdown       = document.getElementById("dropdownMenu");
const menuBackdrop   = document.getElementById("menuBackdrop"); // HTML에 있음
const btnSignOut     = document.getElementById("btnSignOut");
const btnGoUpload    = document.getElementById("btnGoUpload");
const btnGoCategory  = document.getElementById("btnGoCategory");
const btnMyUploads   = document.getElementById("btnMyUploads");
const btnAbout       = document.getElementById("btnAbout");
const brandHome      = document.getElementById("brandHome");
const videoContainer = document.getElementById("videoContainer");

/* =========================
   드롭다운(백드롭 포함)
   ========================= */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
  menuBackdrop?.classList.add('show');   // 아이프레임 위 바깥 클릭도 감지
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
  menuBackdrop?.classList.remove('show');
}
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());
menuBackdrop?.addEventListener('click', closeDropdown);
addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
["scroll","wheel","keydown","touchmove"].forEach(ev=>{
  addEventListener(ev, ()=>{ if(isMenuOpen) closeDropdown(); }, { passive:true });
});
// 네비게이션
function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{
  if (!auth.currentUser){ location.href = 'signin.html'; return; }
  await fbSignOut(auth); closeDropdown();
});
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); location.href = "index.html"; });

/* =========================
   상단바 자동 표시/숨김
   ========================= */
const HIDE_DELAY_MS = 1000;
let hideTimer = null;
function showTopbar(){ topbar.classList.remove('hide'); scheduleHide(); }
function scheduleHide(){ if(hideTimer) clearTimeout(hideTimer); if(!isMenuOpen){ hideTimer = setTimeout(()=> topbar.classList.add('hide'), HIDE_DELAY_MS); } }
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbar(); }, { passive:true });
});
let tStart = null;
videoContainer.addEventListener('touchstart', (e)=>{ tStart = e.touches[0]?.clientY ?? null; }, { passive:true });
videoContainer.addEventListener('touchend', (e)=>{
  if (tStart!=null){
    const dy = (e.changedTouches[0]?.clientY ?? tStart) - tStart;
    if (Math.abs(dy) > 20) showTopbar();
  }
  tStart = null;
}, { passive:true });

/* =========================
   선택/연속재생
   ========================= */
function getSelectedCats(){ try { return JSON.parse(localStorage.getItem('selectedCats')||'null'); } catch { return "ALL"; } }
const AUTO_NEXT = localStorage.getItem('autonext') === 'on';

/* =========================
   YouTube 제어(언뮤트 지속)
   ========================= */
let userSoundConsent = false;     // 오디오 전역 허용 여부
let currentActive    = null;      // 활성 카드
const winToCard      = new Map(); // player window → card

function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}
function applyAudioPolicy(iframe){
  if (!iframe) return;
  if (userSoundConsent){
    ytCmd(iframe, "setVolume", [100]);
    ytCmd(iframe, "unMute");
  } else {
    ytCmd(iframe, "mute");
  }
}

/* ----- 플레이어 이벤트 수신(onReady / onStateChange) ----- */
addEventListener('message', (e)=>{
  if (typeof e.data !== 'string') return;
  let data; try{ data = JSON.parse(e.data); }catch{ return; }
  if (!data?.event) return;

  if (data.event === 'onReady'){
    const card = winToCard.get(e.source);
    if (!card) return;
    const iframe = card.querySelector('iframe');
    if (card === currentActive){
      applyAudioPolicy(iframe);       // 준비 시점에 정책 재적용
      ytCmd(iframe,"playVideo");
    } else {
      ytCmd(iframe,"mute");           // 프리로드 카드는 항상 음소거
    }
    return;
  }

  if (data.event === 'onStateChange' && data.info === 0){
    // 종료 → 자동다음 (현재 활성 플레이어만)
    const card = winToCard.get(e.source);
    if (!card) return;
    const activeIframe = currentActive?.querySelector('iframe');
    if (activeIframe && e.source === activeIframe.contentWindow && AUTO_NEXT){
      goToNextCard();
    }
    return;
  }
}, false);

/* ----- 소리 허용: 카드 위 탭으로만 (스와이프 방해 금지) ----- */
function grantSoundFromCard(){
  userSoundConsent = true;
  document.querySelectorAll('.gesture-capture').forEach(el => el.classList.add('hidden'));
  const ifr = currentActive?.querySelector('iframe');
  if (ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
}

/* =========================
   카드/플레이어 관리
   ========================= */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');

    if (entry.isIntersecting && entry.intersectionRatio >= 0.6){
      if (currentActive && currentActive !== card){
        const prev = currentActive.querySelector('iframe');
        if (prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }
      currentActive = card;

      ensureIframe(card);               // 필요 시 플레이어 생성
      const ifr = card.querySelector('iframe');
      if (ifr){
        ytCmd(ifr,"playVideo");
        applyAudioPolicy(ifr);          // onReady에서도 한 번 더 적용
      }

      // 다음 카드 1장 프리로드(항상 mute)
      const next = card.nextElementSibling;
      if (next && next.classList.contains('video')) ensureIframe(next, true);

      showTopbar();
    } else {
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;
  card.style.height = `${lastVhPx}px`;  // JS 강제 높이

  // 카드 본문
  card.innerHTML = `
    <div class="thumb" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative;background:#000;">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;border:0;"/>
      <div class="playhint" style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;font-size:13px;color:#fff;text-align:center;">
        위로 스와이프 · 탭하여 소리 허용
      </div>
      ${userSoundConsent ? '' : '<div class="mute-tip" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;color:#fff;font-size:12px;">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
    </div>
  `;

  // 제스처 캡처 오버레이: 스와이프 방해하지 않도록 클릭만 사용 + pan-y 허용
  const overlay = document.createElement('div');
  overlay.className = `gesture-capture ${userSoundConsent ? 'hidden':''}`;
  Object.assign(overlay.style, {
    position:'absolute', inset:'0', zIndex:'20',
    display:'flex', alignItems:'center', justifyContent:'center',
    background:'transparent', cursor:'pointer'
  });
  overlay.style.touchAction = 'pan-y';  // 세로 스와이프 통과
  overlay.addEventListener('click', grantSoundFromCard, { passive:true });
  card.appendChild(overlay);

  activeIO.observe(card);
  return card;
}

function ensureIframe(card, preload=false){
  if (card.querySelector('iframe')) return;
  const id = card.dataset.vid;
  const origin   = encodeURIComponent(location.origin);
  const playerId = `yt-${id}-${Math.random().toString(36).slice(2,8)}`;
  const iframe = document.createElement('iframe');
  iframe.id = playerId;
  iframe.src =
    `https://www.youtube.com/embed/${id}` +
    `?enablejsapi=1&playsinline=1&autoplay=1&mute=1&rel=0` +
    `&origin=${origin}&widget_referrer=${encodeURIComponent(location.href)}` +
    `&playerapiid=${encodeURIComponent(playerId)}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });

  iframe.addEventListener('load', ()=>{
    try{
      // YouTube IFrame postMessage API (event 등록)
      iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id: playerId }), '*');
      ytCmd(iframe, "addEventListener", ["onReady"]);
      ytCmd(iframe, "addEventListener", ["onStateChange"]);
      winToCard.set(iframe.contentWindow, card);
      if (preload) ytCmd(iframe, "mute"); // 프리로드는 항상 음소거
    }catch{}
  });

  const thumb = card.querySelector('.thumb');
  thumb ? card.replaceChild(iframe, thumb) : card.appendChild(iframe);
}

/* =========================
   데이터 로드 (첫 배치 작게 + 이어받기)
   ========================= */
const PAGE_SIZE = 12;
const INITIAL_PAGE_SIZE = (() => {
  // 네트워크 느리면 더 작게 시작
  const t = navigator.connection?.effectiveType || '';
  if (/slow-2g|2g/.test(t)) return 2;
  if (/3g/.test(t)) return 3;
  return 4; // 기본
})();

let isLoading = false, hasMore = true, lastDoc = null;
const loadedIds = new Set();

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentActive = null;
}

function appendCardsFromSnap(snap){
  snap.docs.forEach(d=>{
    if (loadedIds.has(d.id)) return;
    loadedIds.add(d.id);
    const data = d.data();
    videoContainer.appendChild(makeCard(data.url, d.id));
  });
  // DOM 붙인 뒤 높이 동기화(슬리버 방지)
  enforceItemHeights();
}

async function loadMore(initial=false, pageSize = PAGE_SIZE){
  if (isLoading || !hasMore) return;
  isLoading = true;

  const selected = getSelectedCats();

  try{
    const base  = collection(db, "videos");
    const parts = [];

    if (selected === "ALL" || !selected){
      parts.push(orderBy("createdAt","desc"));
    }else if (Array.isArray(selected) && selected.length){
      const cats = selected.length > 10 ? null : selected; // Firestore array-contains-any ≤ 10
      if (cats) parts.push(where("categories","array-contains-any", cats));
      parts.push(orderBy("createdAt","desc"));
    }else{
      parts.push(orderBy("createdAt","desc"));
    }

    if (lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(pageSize));  // ← 초기엔 더 작게

    const snap = await getDocs(query(base, ...parts));
    if (snap.empty){
      if (initial){
        const empty = document.createElement('div');
        empty.className = 'video';
        empty.style.height = `${lastVhPx}px`;
        empty.innerHTML = `<p class="playhint" style="position:static;margin:0 auto;color:#cfcfcf;">해당 카테고리 영상이 없습니다.</p>`;
        videoContainer.appendChild(empty);
      }
      hasMore = false; isLoading = false; return;
    }

    appendCardsFromSnap(snap);
    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if (snap.size < pageSize) hasMore = false;

  }catch(e){
    console.error(e);
    if (initial){
      const err = document.createElement('div');
      err.className = 'video';
      err.style.height = `${lastVhPx}px`;
      err.innerHTML = `<p class="playhint" style="position:static;margin:0 auto;color:#cfcfcf;">목록을 불러오지 못했습니다.</p>`;
      videoContainer.appendChild(err);
    }
  }finally{
    isLoading = false;
  }
}

videoContainer.addEventListener('scroll', ()=>{
  // 주소창 수축/확장으로 innerHeight가 바뀌었을 수 있어 주기적으로 보정
  // (과도한 호출 방지를 위해 약하게 디바운스)
  if (!enforceItemHeights._t){
    enforceItemHeights._t = setTimeout(()=>{
      enforceItemHeights._t = null;
      const now = calcVhPx();
      if (now !== lastVhPx){ updateVh(); }
    }, 120);
  }

  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if (nearBottom) loadMore(false);
});

/* =========================
   자동 다음
   ========================= */
async function goToNextCard(){
  const next = currentActive?.nextElementSibling;
  if (next && next.classList.contains('video')){
    next.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  if (!hasMore) { showTopbar(); return; }
  const before = videoContainer.querySelectorAll('.video').length;
  await loadMore(false);
  const after  = videoContainer.querySelectorAll('.video').length;
  if (after > before){
    videoContainer.querySelectorAll('.video')[before]?.scrollIntoView({ behavior:'smooth', block:'start' });
  }else{
    showTopbar();
  }
}

/* =========================
   시작
   ========================= */
resetFeed();
// ① 아주 작은 초기 배치로 화면 먼저 띄우고
loadMore(true, INITIAL_PAGE_SIZE).then(() => {
  // ② UI가 뜬 뒤 나머지 이어받기
  setTimeout(() => loadMore(false, PAGE_SIZE), 60);
});
showTopbar();
