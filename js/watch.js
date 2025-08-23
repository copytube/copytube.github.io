// js/watch.js — fresh build: 안정된 언뮤트 지속, 1-전후만 iframe 유지, 활성 우선 로딩
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 보정 ---------- */
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
const menuBackdrop   = document.getElementById("menuBackdrop");
const btnSignOut     = document.getElementById("btnSignOut");
const btnGoUpload    = document.getElementById("btnGoUpload");
const btnGoCategory  = document.getElementById("btnGoCategory");
const btnMyUploads   = document.getElementById("btnMyUploads");
const btnAbout       = document.getElementById("btnAbout");
const brandHome      = document.getElementById("brandHome");
const videoContainer = document.getElementById("videoContainer");

/* ---------- 드롭다운(백드롭 포함) ---------- */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
  menuBackdrop.classList.add('show');
}
function closeDropdown(){
  isMenuOpen = false;
  dropdown.classList.remove("show");
  setTimeout(()=> dropdown.classList.add("hidden"), 180);
  menuBackdrop.classList.remove('show');
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
  addEventListener(ev, ()=>{ if(isMenuOpen) closeDropdown(); }, {passive:true});
});
function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if (!auth.currentUser){ location.href = 'signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ goOrSignIn("upload.html"); closeDropdown(); });
brandHome    ?.addEventListener("click", (e)=>{ e.preventDefault(); location.href = "index.html"; });

/* ---------- 상단바 자동 표시/숨김 ---------- */
const HIDE_DELAY_MS = 1000;
let hideTimer = null;
function showTopbar(){ topbar.classList.remove('hide'); scheduleHide(); }
function scheduleHide(){ if(hideTimer) clearTimeout(hideTimer); if(!isMenuOpen){ hideTimer = setTimeout(()=> topbar.classList.add('hide'), HIDE_DELAY_MS); } }
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbar(); }, {passive:true});
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

/* ---------- 선택/연속재생 ---------- */
function getSelectedCats(){ try { return JSON.parse(localStorage.getItem('selectedCats')||'null'); } catch { return "ALL"; } }
const AUTO_NEXT = localStorage.getItem('autonext') === 'on';

/* ---------- YouTube 제어(언뮤트 지속) ---------- */
let userSoundConsent = false;     // 오디오 전역 허용 여부
let currentIndex     = -1;        // 활성 카드 인덱스
const cards          = [];        // DOM 카드 배열(순서)
const winToIndex     = new Map(); // player window → index
const playerState    = new Map(); // index → last YT state (1/2/3/0 등)

/* postMessage helper */
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
  // (안정성 위해) 유튜브 기원만 필터링 시도
  if (e.origin && !/youtube\.com$/i.test(new URL(e.origin).hostname || '')) {
    // 일부 브라우저는 origin 빈 값일 수 있어, 그땐 통과
  }
  let data; try{ data = JSON.parse(e.data); }catch{ return; }
  if (!data?.event) return;

  if (data.event === 'onReady'){
    const idx = winToIndex.get(e.source);
    if (idx == null) return;
    const iframe = getIframeAt(idx);
    if (!iframe) return;

    // 활성이면 재생 + 오디오 정책 적용, 프리로드면 무조건 mute
    if (idx === currentIndex){
      applyAudioPolicy(iframe);
      ytCmd(iframe,"playVideo");
    }else{
      ytCmd(iframe,"mute");
      ytCmd(iframe,"pauseVideo");
    }
    return;
  }

  if (data.event === 'onStateChange'){
    const idx = winToIndex.get(e.source);
    if (idx == null) return;
    playerState.set(idx, data.info);

    // 종료(0) → 자동 다음
    if (data.info === 0 && idx === currentIndex && AUTO_NEXT){
      goToNext();
    }
    return;
  }
}, false);

/* ----- 제스처 허용 + 탭 재생/일시정지 ----- */
function grantSoundFromCard(idx){
  userSoundConsent = true;
  document.querySelectorAll('.gesture-capture').forEach(el => el.classList.add('hidden'));
  const ifr = getIframeAt(idx);
  if (ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
}
function togglePlayPause(idx){
  const st = playerState.get(idx);
  const ifr = getIframeAt(idx);
  if (!ifr) return;
  if (st === 1 || st === 3){ // playing/buffering → pause
    ytCmd(ifr,"pauseVideo");
    flashTapIndicator(idx, "일시정지");
  }else{ // paused or unknown → play
    ytCmd(ifr,"playVideo");
    if (userSoundConsent){ ytCmd(ifr,"unMute"); }
    flashTapIndicator(idx, "재생");
  }
}
function flashTapIndicator(idx, text){
  const card = cards[idx];
  if (!card) return;
  let ind = card.querySelector('.tap-indicator');
  if (!ind){
    ind = document.createElement('div');
    ind.className = 'tap-indicator';
    card.appendChild(ind);
  }
  ind.textContent = text;
  ind.classList.add('show');
  setTimeout(()=> ind.classList.remove('show'), 600);
}

/* ---------- 카드/플레이어 관리 ---------- */
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
      <div class="playhint">위로 스와이프 · 탭하여 소리 허용</div>
      ${userSoundConsent ? '' : '<div class="mute-tip">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
    </div>
    <div class="gesture-capture ${userSoundConsent ? 'hidden':''}" aria-label="tap to enable sound"></div>
  `;

  const idx = cards.length;
  cards.push(card);

  // 제스처 허용
  card.querySelector('.gesture-capture')?.addEventListener('pointerdown', (e)=>{
    e.preventDefault(); e.stopPropagation();
    grantSoundFromCard(idx);
  });

  // 탭으로 재생/일시정지
  card.addEventListener('pointerup', (e)=>{
    // 메뉴 열림/오버레이 시 무시
    if (isMenuOpen) return;
    // 제스처 캡처가 보이는 동안엔 허용 동작이 우선
    if (!userSoundConsent) return;
    // 살짝 탭만 허용(스와이프는 제외)
    if (e.pointerType === 'touch' && (Math.abs(e.movementY) > 2)) return;
    if (idx === currentIndex) togglePlayPause(idx);
  });

  activeIO.observe(card);
  return card;
}

function getIframeAt(idx){
  const card = cards[idx];
  if (!card) return null;
  return card.querySelector('iframe');
}
function ensureIframe(idx, mode /* 'active' | 'preload' */ = 'active'){
  const card = cards[idx];
  if (!card || card.querySelector('iframe')) return;
  const id = card.dataset.vid;
  const origin   = encodeURIComponent(location.origin);
  const playerId = `yt-${id}-${Math.random().toString(36).slice(2,8)}`;

  const iframe = document.createElement('iframe');
  iframe.id = playerId;
  iframe.src =
    `https://www.youtube.com/embed/${id}` +
    `?enablejsapi=1&playsinline=1&autoplay=1&mute=1&rel=0&controls=0&modestbranding=1&iv_load_policy=3` +
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
      winToIndex.set(iframe.contentWindow, idx);

      if (mode === 'preload'){
        ytCmd(iframe, "mute");
        ytCmd(iframe, "pauseVideo");
      }
    }catch{}
  });

  const thumb = card.querySelector('.thumb');
  thumb ? card.replaceChild(iframe, thumb) : card.appendChild(iframe);
}

function destroyIframe(idx){
  const card = cards[idx];
  if (!card) return;
  const ifr = card.querySelector('iframe');
  if (!ifr) return;
  try{
    // 정리
    ytCmd(ifr, "stopVideo");
    ytCmd(ifr, "mute");
    winToIndex.delete(ifr.contentWindow);
  }catch{}
  // 썸네일 복구
  const id = card.dataset.vid;
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.innerHTML = `
    <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"/>
    <div class="playhint">위로 스와이프 · 탭하여 소리 허용</div>
    ${userSoundConsent ? '' : '<div class="mute-tip">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
  `;
  card.replaceChild(thumb, ifr);
}

function setActiveIndex(idx){
  if (idx === currentIndex) return;

  const prev = currentIndex;
  currentIndex = idx;

  // 1) 이전 활성 정지/음소거
  if (prev >= 0){
    const p = getIframeAt(prev);
    if (p){ ytCmd(p,"mute"); ytCmd(p,"pauseVideo"); ytCmd(p,"stopVideo"); }
  }

  // 2) 현재 활성 보장(최우선 로딩)
  ensureIframe(currentIndex, 'active');
  const cur = getIframeAt(currentIndex);
  if (cur){
    applyAudioPolicy(cur);
    ytCmd(cur,"playVideo");
  }

  // 3) 다음 1장만 프리로드(항상 음소거)
  const next = currentIndex + 1;
  if (next < cards.length){
    // idle 시점에 생성 (활성 완성 우선)
    (window.requestIdleCallback || setTimeout)(()=> ensureIframe(next, 'preload'), 100);
  }

  // 4) 메모리 절약: 활성의 ±1만 iframe 유지, 그 외는 제거
  for (let i=0;i<cards.length;i++){
    if (i === currentIndex || i === currentIndex-1 || i === currentIndex+1) continue;
    destroyIframe(i);
  }

  showTopbar(); // 1초 노출
}

/* 가시성 감시자: 스냅 정착 비율 0.6 이상일 때 활성화 */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const idx  = cards.indexOf(card);
    if (idx < 0) return;

    if (entry.isIntersecting && entry.intersectionRatio >= 0.6){
      setActiveIndex(idx);
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

/* ---------- 데이터 로드 (무한 스크롤) ---------- */
const PAGE_SIZE = 8; // 초기/추가 로딩 덜어 느린 단말 최적화
let isLoading = false, hasMore = true, lastDoc = null;
const loadedIds = new Set();

function resetFeed(){
  activeIO.disconnect();
  videoContainer.innerHTML = "";
  cards.length = 0;
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentIndex = -1;

  // 다시 관찰 시작은 카드 추가 후 makeCard에서
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
      if (initial && cards.length === 0){
        const empty = document.createElement('div');
        empty.className = 'video';
        empty.innerHTML = `<p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p>`;
        videoContainer.appendChild(empty);
        cards.push(empty);
        activeIO.observe(empty);
      }
      hasMore = false; isLoading = false; return;
    }

    const startLen = cards.length;
    snap.docs.forEach(d=>{
      if (loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      const data = d.data();
      const card = makeCard(data.url, d.id);
      videoContainer.appendChild(card);
    });

    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if (snap.size < PAGE_SIZE) hasMore = false;

    // 첫 로딩이면 첫 카드 활성
    if (initial && startLen === 0 && cards.length > 0){
      setActiveIndex(0);
    }

  }catch(e){
    console.error(e);
    if (initial && cards.length === 0){
      const err = document.createElement('div');
      err.className = 'video';
      err.innerHTML = `<p class="playhint" style="position:static;margin:0 auto;">목록을 불러오지 못했습니다.</p>`;
      videoContainer.appendChild(err);
      cards.push(err);
      activeIO.observe(err);
    }
  }finally{
    isLoading = false;
  }
}

/* 스크롤 하단 근접 시 추가 로드 */
videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if (nearBottom) loadMore(false);
});

/* ---------- 자동 다음 ---------- */
async function goToNext(){
  const nextIdx = currentIndex + 1;
  if (nextIdx < cards.length){
    cards[nextIdx].scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  if (!hasMore) { showTopbar(); return; }
  const before = cards.length;
  await loadMore(false);
  if (cards.length > before){
    cards[before].scrollIntoView({ behavior:'smooth', block:'start' });
  }else{
    showTopbar();
  }
}

/* ---------- 시작 ---------- */
resetFeed();
loadMore(true);
showTopbar();
