// js/watch.js — from-scratch rewrite
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 보정 (모바일 브라우저 주소창 높이 변화 대응) ---------- */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh();
window.addEventListener('resize', updateVh, {passive:true});
window.addEventListener('orientationchange', updateVh, {passive:true});

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
const videoContainer= document.getElementById("videoContainer");

/* ---------- 드롭다운 (index와 동일 UX) ---------- */
let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown(); // 상태 바뀌면 드롭다운 정리
});

menuBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
dropdown?.addEventListener("click", (e)=> e.stopPropagation());
document.addEventListener('pointerdown', (e)=>{ if (dropdown.classList.contains('hidden')) return; if (!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
["scroll","wheel","keydown","touchmove"].forEach(ev=>{
  window.addEventListener(ev, ()=>{ if(!dropdown.classList.contains('hidden')) closeDropdown(); }, {passive:true});
});

// 네비게이션 (로그인 필요한 메뉴는 미로그인 시 로그인 페이지로 유도)
function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if (!auth.currentUser){ location.href = 'signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ goOrSignIn("upload.html"); closeDropdown(); });
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); location.href = "index.html"; });

/* ---------- 상단바 자동 표시/숨김 (1초) ---------- */
const HIDE_DELAY_MS = 1000;
let hideTimer = null;
function showTopbar(){ topbar.classList.remove('hide'); scheduleHide(); }
function scheduleHide(){ if (hideTimer) clearTimeout(hideTimer); if(!isMenuOpen){ hideTimer = setTimeout(()=> topbar.classList.add('hide'), HIDE_DELAY_MS); } }
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbar(); }, { passive:true });
});
let tStart = null;
videoContainer.addEventListener('touchstart', (e)=>{ tStart = e.touches[0]?.clientY ?? null; }, {passive:true});
videoContainer.addEventListener('touchend', (e)=>{
  if (tStart!=null){
    const dy = (e.changedTouches[0]?.clientY ?? tStart) - tStart;
    if (Math.abs(dy) > 20) showTopbar();
  }
  tStart = null;
}, {passive:true});

/* ---------- 선택/연속재생 플래그 ---------- */
function getSelectedCats(){ try { return JSON.parse(localStorage.getItem('selectedCats')||'null'); } catch { return "ALL"; } }
const AUTO_NEXT = localStorage.getItem('autonext') === 'on';

/* ---------- YouTube 플레이어 제어 정책 ---------- */
let userSoundConsent = false;   // 한 번 허용되면 이후 카드도 언뮤트
let currentActive    = null;    // 현재 화면에 고정된 카드
const winToCard      = new Map(); // player window → card 매핑

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

/* ----- 최초 사용자 제스처로 전역 허용 ----- */
function grantSound(){
  userSoundConsent = true;
  const ifr = currentActive?.querySelector('iframe');
  if (ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
  // 한 번만 필요 → 리스너 제거
  ['click','pointerdown','wheel','keydown','touchstart'].forEach(ev=>{
    window.removeEventListener(ev, grantSound, {capture:false});
  });
}
['click','pointerdown','wheel','keydown','touchstart'].forEach(ev=>{
  window.addEventListener(ev, grantSound, { once:true });
});

/* ----- YouTube Player 이벤트 수신(onReady, onStateChange) ----- */
window.addEventListener('message', (e)=>{
  if (typeof e.data !== 'string') return;
  let data; try{ data = JSON.parse(e.data); }catch{ return; }
  if (!data?.event) return;

  // 준비 완료 → 현재 활성 카드면 언뮤트/볼륨 적용 보장
  if (data.event === 'onReady'){
    const card = winToCard.get(e.source);
    if (!card) return;
    const iframe = card.querySelector('iframe');
    if (card === currentActive){
      applyAudioPolicy(iframe);
      ytCmd(iframe, "playVideo");
    } else {
      ytCmd(iframe, "mute");
    }
    return;
  }

  // 상태 변화 → 0(ended)이면 자동다음(현재 활성 플레이어만)
  if (data.event === 'onStateChange' && data.info === 0){
    const card = winToCard.get(e.source);
    if (!card) return;
    const activeIframe = currentActive?.querySelector('iframe');
    if (activeIframe && e.source === activeIframe.contentWindow && AUTO_NEXT){
      goToNextCard();
    }
    return;
  }
}, false);

/* ---------- 카드/플레이어 관리 ---------- */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');

    // 60% 이상 보이면 활성
    if (entry.isIntersecting && entry.intersectionRatio >= 0.6){
      // 이전 카드 정리
      if (currentActive && currentActive !== card){
        const prev = currentActive.querySelector('iframe');
        if (prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }
      currentActive = card;

      // 현재 카드 재생 준비
      ensureIframe(card);
      const ifr = card.querySelector('iframe');
      if (ifr){
        ytCmd(ifr,"playVideo");
        applyAudioPolicy(ifr); // onReady에서 한 번 더 보장됨
      }

      // 다음 카드 1개 프리로드(항상 mute)
      const next = card.nextElementSibling;
      if (next && next.classList.contains('video')) ensureIframe(next, /*preload*/true);

      // 상단바 1초 표시
      showTopbar();
    } else {
      // 뷰포트에서 벗어난 카드는 정지/음소거
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

  card.innerHTML = `
    <div class="thumb">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"/>
      <div class="playhint">위로 스와이프 · 탭/스크롤/키 입력 시 소리 허용</div>
      ${userSoundConsent ? '' : '<div class="mute-tip">🔇 현재 음소거 • 한 번 허용하면 계속 소리 재생</div>'}
    </div>
  `;

  // 카드 탭으로도 사운드 허용
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    if (!userSoundConsent) userSoundConsent = true;
    if (ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
    currentActive = card;
  });

  activeIO.observe(card);
  return card;
}

function ensureIframe(card, preload=false){
  if (card.querySelector('iframe')) return;
  const id = card.dataset.vid;
  const origin = encodeURIComponent(location.origin);
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
      // YouTube IFrame API 이벤트 바인딩 (postMessage 방식)
      iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id: playerId }), '*');
      ytCmd(iframe, "addEventListener", ["onReady"]);
      ytCmd(iframe, "addEventListener", ["onStateChange"]);
      winToCard.set(iframe.contentWindow, card);

      // 프리로드 카드는 항상 음소거 유지
      if (preload){ ytCmd(iframe, "mute"); }
    }catch{}
  });

  const thumb = card.querySelector('.thumb');
  thumb ? card.replaceChild(iframe, thumb) : card.appendChild(iframe);
}

/* ---------- 데이터 로드 (무한 스크롤) ---------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
const loadedIds = new Set();

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentActive = null;
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
      // array-contains-any는 최대 10개
      const cats = selected.length > 10 ? null : selected;
      if (cats){ parts.push(where("categories","array-contains-any", cats)); }
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
  // 다음 카드로 스크롤
  const next = currentActive?.nextElementSibling;
  if (next && next.classList.contains('video')){
    next.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  // 없으면 더 불러오고 첫 새 카드로 이동
  if (!hasMore) { showTopbar(); return; }
  const before = videoContainer.querySelectorAll('.video').length;
  await loadMore(false);
  const after  = videoContainer.querySelectorAll('.video').length;
  if (after > before){
    const firstNew = videoContainer.querySelectorAll('.video')[before];
    if (firstNew) firstNew.scrollIntoView({ behavior:'smooth', block:'start' });
  } else {
    showTopbar();
  }
}

/* ---------- 시작 ---------- */
resetFeed();
loadMore(true);
showTopbar();
