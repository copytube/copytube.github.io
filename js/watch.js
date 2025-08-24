// js/watch.js — iOS 대응, 언뮤트 유지, 이전 플레이어 정지, 드롭다운 백드롭, 1장만 선로드
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 보정 (모바일 주소창 높이 변동 대응) ---------- */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh();
addEventListener('resize', updateVh, {passive:true});
addEventListener('orientationchange', updateVh, {passive:true});

/* ---------- DOM ---------- */
const topbar         = document.getElementById("topbar");
const signupLink     = document.getElementById("signupLink");
const signinLink     = document.getElementById("signinLink");
const welcome        = document.getElementById("welcome");
const menuBtn        = document.getElementById("menuBtn");
const dropdown       = document.getElementById("dropdownMenu");
const menuBackdrop   = document.getElementById("menuBackdrop"); // 없으면 null
const btnSignOut     = document.getElementById("btnSignOut");
const btnGoUpload    = document.getElementById("btnGoUpload");
const btnGoCategory  = document.getElementById("btnGoCategory");
const btnMyUploads   = document.getElementById("btnMyUploads");
const btnAbout       = document.getElementById("btnAbout");
const brandHome      = document.getElementById("brandHome");
const videoContainer = document.getElementById("videoContainer");

/* ---------- 드롭다운(아이프레임 위 바깥탭 감지용 백드롭) ---------- */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown?.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown?.classList.add("show"));
  menuBackdrop?.classList.add('show');
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown?.classList.remove("show");
  setTimeout(()=> dropdown?.classList.add("hidden"), 180);
  menuBackdrop?.classList.remove('show');
}

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});

menuBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); (dropdown?.classList.contains("hidden") ?? true) ? openDropdown() : closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());
menuBackdrop?.addEventListener('click', closeDropdown);

addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
["scroll","wheel","keydown","touchmove"].forEach(ev=>{
  addEventListener(ev, ()=>{ if(isMenuOpen) closeDropdown(); }, {passive:true});
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
btnGoUpload  ?.addEventListener("click", ()=>{ goOrSignIn("upload.html"); closeDropdown(); });
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); location.href = "index.html"; });

/* ---------- 상단바 자동 표시/숨김 ---------- */
const HIDE_DELAY_MS = 1000;
let hideTimer = null;
function showTopbar(){ topbar?.classList.remove('hide'); scheduleHide(); }
function scheduleHide(){ if(hideTimer) clearTimeout(hideTimer); if(!isMenuOpen){ hideTimer = setTimeout(()=> topbar?.classList.add('hide'), HIDE_DELAY_MS); } }
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbar(); }, {passive:true});
});
let tStart = null;
videoContainer?.addEventListener('touchstart', (e)=>{ tStart = e.touches[0]?.clientY ?? null; }, {passive:true});
videoContainer?.addEventListener('touchend', (e)=>{
  if (tStart!=null){
    const dy = (e.changedTouches[0]?.clientY ?? tStart) - tStart;
    if (Math.abs(dy) > 20) showTopbar();
  }
  tStart = null;
}, {passive:true});

/* ---------- 선택/연속재생 ---------- */
function getSelectedCats(){ try { return JSON.parse(localStorage.getItem('selectedCats')||'null'); } catch { return "ALL"; } }
function getAutoNext(){ return localStorage.getItem('autonext') === 'on'; }

/* ---------- 환경/오디오 정책 ---------- */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let userSoundAllowed = false;   // 한 번 허용 후 전체 카드에 언뮤트 적용
let currentCard      = null;    // 활성 카드
const winToCard      = new Map(); // player window → card

function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*");
}
function applyAudioPolicy(iframe){
  if (!iframe) return;
  if (userSoundAllowed){
    ytCmd(iframe, "setVolume", [100]);
    ytCmd(iframe, "unMute");
  } else {
    ytCmd(iframe, "mute");
  }
}

/* ---------- YouTube 이벤트 수신 ---------- */
addEventListener('message', (e)=>{
  if (typeof e.data !== 'string') return;
  let data; try{ data = JSON.parse(e.data); }catch{ return; }
  if (!data?.event) return;

  if (data.event === 'onReady'){
    const card   = winToCard.get(e.source);
    const iframe = card?.querySelector('iframe');
    if (!card || !iframe) return;

    // 활성 카드면 재생 시작 / 프리로드면 mute 유지
    if (card === currentCard){
      applyAudioPolicy(iframe);
      ytCmd(iframe, "playVideo");
    }else{
      ytCmd(iframe, "mute");
    }
    return;
  }

  if (data.event === 'onStateChange'){
    // 0 = ENDED → 자동다음
    if (data.info === 0 && getAutoNext()){
      const card = winToCard.get(e.source);
      const actIframe = currentCard?.querySelector('iframe');
      if (card && actIframe && actIframe.contentWindow === e.source){
        goToNextCard();
      }
    }
    // 1 = PLAYING → 이전 플레이어 정지 보강(중복 소리 방지)
    if (data.info === 1){
      const card = winToCard.get(e.source);
      if (card !== currentCard){
        // 안전장치: 활성카드가 아니면 일시정지/뮤트
        const ifr = card?.querySelector('iframe');
        if (ifr){ ytCmd(ifr, "mute"); ytCmd(ifr, "pauseVideo"); }
      }
    }
    return;
  }
}, false);

/* ---------- 제스처로 오디오 허용 ---------- */
function grantAudioFromCard(){
  userSoundAllowed = true;
  // 모든 카드의 캡처 오버레이 제거
  document.querySelectorAll('.gesture-capture').forEach(el => el.classList.add('hidden'));
  // 현재 카드에 즉시 반영
  const ifr = currentCard?.querySelector('iframe');
  if (ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
}

/* ---------- 카드/플레이어 ---------- */
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

  // iOS: 최초엔 썸네일 + 제스처; 그 외: 썸네일 → 관찰 시 iframe 생성
  card.innerHTML = `
    <div class="thumb">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"/>
      <div class="playhint">위로 스와이프 · 탭하여 소리 허용</div>
      ${userSoundAllowed ? '' : '<div class="mute-tip">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
    </div>
    <div class="gesture-capture ${userSoundAllowed ? 'hidden':''}" aria-label="tap to enable sound"></div>
  `;

  // 카드 제스처로만 오디오 허용
  card.querySelector('.gesture-capture')?.addEventListener('pointerdown', (e)=>{
    e.preventDefault(); e.stopPropagation();
    grantAudioFromCard();
  });

  activeIO.observe(card);
  return card;
}

function ensureIframe(card, { preload = false } = {}){
  if (!card || card.querySelector('iframe')) return;

  // iOS에서는 '다음 카드' 프리로드를 만들지 않음(두 번째 카드 멈춤 방지)
  if (isIOS && preload) return;

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
      iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id: playerId }), '*');
      ytCmd(iframe, "addEventListener", ["onReady"]);
      ytCmd(iframe, "addEventListener", ["onStateChange"]);
      winToCard.set(iframe.contentWindow, card);

      // 프리로드면 항상 음소거
      if (preload) ytCmd(iframe, "mute");
    }catch{}
  });

  const thumb = card.querySelector('.thumb');
  thumb ? card.replaceChild(iframe, thumb) : card.appendChild(iframe);
}

/* ---------- IntersectionObserver (활성 카드 전환) ---------- */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card   = entry.target;
    const iframe = card.querySelector('iframe');

    if (entry.isIntersecting && entry.intersectionRatio >= 0.67){
      // 이전 플레이어 완전 정지
      if (currentCard && currentCard !== card){
        const prev = currentCard.querySelector('iframe');
        if (prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }
      currentCard = card;

      // 현재 카드 플레이어 생성/재생
      ensureIframe(card, { preload:false });
      const ifr = card.querySelector('iframe');
      if (ifr){
        applyAudioPolicy(ifr);
        ytCmd(ifr,"playVideo");
      }

      // 다음 카드 1장만 프리로드(비 iOS에서만)
      const next = card.nextElementSibling;
      if (next && next.classList.contains('video')){
        ensureIframe(next, { preload:true });
      }

      showTopbar(); // 새 카드 진입 시 상단바 1초 노출
    } else {
      // 뷰포트에서 벗어나면 정지/뮤트
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
}, { root: videoContainer, threshold:[0,0.67,1] });

/* ---------- 데이터 로드(무한 스크롤) ---------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
const loadedIds = new Set();

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentCard = null;
}

async function loadMore(initial=false){
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
    parts.push(limit(PAGE_SIZE));

    const snap = await getDocs(query(base, ...parts));
    if (snap.empty){
      if (initial) videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
      hasMore = false; isLoading = false; return;
    }

    snap.docs.forEach(d=>{
      if (loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      const data = d.data();
      videoContainer.appendChild(makeCard(data.url, d.id));
    });

    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if (snap.size < PAGE_SIZE) hasMore = false;

  }catch(e){
    console.error(e);
    if (initial){
      videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">목록을 불러오지 못했습니다.</p></div>`;
    }
  }finally{
    isLoading = false;
  }
}

videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if (nearBottom) loadMore(false);
});

/* ---------- 자동 다음 ---------- */
async function goToNextCard(){
  const next = currentCard?.nextElementSibling;
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

/* ---------- 시작 ---------- */
resetFeed();
loadMore(true);
showTopbar();
