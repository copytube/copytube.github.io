// js/watch.js — iOS Safari 최적화: 현재 카드 최우선 로딩 + 프리로드 1개 제한 + 탭 일시정지 유지
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* =========================
   뷰포트 보정 + 카드 높이 동기화
   ========================= */
let lastVhPx = 0;
const vh = () => Math.max(1, Math.floor(window.innerHeight || document.documentElement.clientHeight || 0));
function updateVh(){
  lastVhPx = vh();
  document.documentElement.style.setProperty('--app-vh', `${lastVhPx}px`);
  document.querySelectorAll('#videoContainer .video').forEach(el => { el.style.height = `${lastVhPx}px`; });
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
const menuBackdrop   = document.getElementById("menuBackdrop");
const btnSignOut     = document.getElementById("btnSignOut");
const btnGoUpload    = document.getElementById("btnGoUpload");
const btnGoCategory  = document.getElementById("btnGoCategory");
const btnMyUploads   = document.getElementById("btnMyUploads");
const btnAbout       = document.getElementById("btnAbout");
const brandHome      = document.getElementById("brandHome");
const videoContainer = document.getElementById("videoContainer");

/* =========================
   드롭다운
   ========================= */
let isMenuOpen = false;
function openDropdown(){
  isMenuOpen = true;
  dropdown.classList.remove("hidden");
  requestAnimationFrame(()=> dropdown.classList.add("show"));
  menuBackdrop?.classList.add('show');
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
function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if (!auth.currentUser){ location.href = 'signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
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
   YouTube 제어(언뮤트 지속 + 사용자 일시정지 유지)
   ========================= */
let userSoundConsent = false;
let currentActive    = null;
const winToCard      = new Map();
const lastState      = new WeakMap(); // card → YT state
const userPaused     = new WeakMap(); // card → 사용자가 일시정지했는가

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
function togglePlay(card){
  const ifr = card?.querySelector('iframe');
  if (!ifr) return;
  const st = lastState.get(card);
  if (st === 1 || st === 3){ // playing/buffering
    ytCmd(ifr, 'pauseVideo');
    userPaused.set(card, true);
  } else {
    ytCmd(ifr, 'playVideo');
    if (userSoundConsent) ytCmd(ifr, 'unMute');
    userPaused.set(card, false);
  }
}

/* ----- 플레이어 이벤트 수신 ----- */
addEventListener('message', (e)=>{
  if (typeof e.data !== 'string') return;
  let data; try{ data = JSON.parse(e.data); }catch{ return; }
  if (!data?.event) return;

  if (data.event === 'onReady'){
    const card = winToCard.get(e.source);
    if (!card) return;
    const iframe = card.querySelector('iframe');
    if (card === currentActive){
      applyAudioPolicy(iframe);
      if (!userPaused.get(card)) ytCmd(iframe,"playVideo");
    } else {
      ytCmd(iframe,"mute");
    }
    return;
  }

  if (data.event === 'onStateChange'){
    const card = winToCard.get(e.source);
    if (!card) return;
    lastState.set(card, data.info);
    if (data.info === 1) userPaused.set(card, false);
    if (data.info === 2) userPaused.set(card, true);
    if (data.info === 0 && AUTO_NEXT){
      const activeIframe = currentActive?.querySelector('iframe');
      if (activeIframe && e.source === activeIframe.contentWindow){
        goToNextCard();
      }
    }
  }
}, false);

/* =========================
   소리 허용 오버레이
   ========================= */
function grantSoundFromCard(){
  userSoundConsent = true;
  document.querySelectorAll('.gesture-capture').forEach(el => el.classList.add('hidden'));
  const ifr = currentActive?.querySelector('iframe');
  if (ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
}

/* =========================
   ★ 플레이어 생성 우선순위 큐 (동시 1개)
   ========================= */
const BuildQueue = (() => {
  let busy = false;
  let epoch = 0;         // 스크롤/활성 변경 시 증가 → 이전 작업 무효화
  const q = [];          // {card, preload, tag, epoch}

  function hasIframe(card){ return !!card.querySelector('iframe'); }

  function insertIframe(card, preload){
    if (hasIframe(card)) return Promise.resolve();
    return new Promise((resolve)=>{
      const id      = card.dataset.vid;
      const origin  = encodeURIComponent(location.origin);
      const playerId= `yt-${id}-${Math.random().toString(36).slice(2,8)}`;
      const iframe  = document.createElement('iframe');
      iframe.id     = playerId;
      iframe.src =
        `https://www.youtube.com/embed/${id}` +
        `?enablejsapi=1&playsinline=1&autoplay=1&mute=1&rel=0` +
        `&origin=${origin}&widget_referrer=${encodeURIComponent(location.href)}` +
        `&playerapiid=${encodeURIComponent(playerId)}`;
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.setAttribute('loading', preload ? 'lazy' : 'eager'); // 사파리 일부 버전 무시해도 무해
      Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });

      iframe.addEventListener('load', ()=>{
        try{
          iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id: playerId }), '*');
          ytCmd(iframe, "addEventListener", ["onReady"]);
          ytCmd(iframe, "addEventListener", ["onStateChange"]);
          winToCard.set(iframe.contentWindow, card);
          if (preload) ytCmd(iframe, "mute");
        }catch{}
        resolve();
      });

      const thumb = card.querySelector('.thumb');
      if (thumb) card.replaceChild(iframe, thumb); else card.appendChild(iframe);
    });
  }

  async function pump(){
    if (busy) return;
    busy = true;
    while(q.length){
      const { card, preload, e } = q.shift();
      if (e !== epoch) continue;              // 무효화된 작업 스킵
      if (!document.body.contains(card)) continue;
      if (hasIframe(card)) continue;
      try{
        await insertIframe(card, preload);
      }catch(_){}
      // 한 번에 1개만 만들고 살짝 양보 (iOS 디코더/네트워크 보호)
      await new Promise(r=> setTimeout(r, 50));
    }
    busy = false;
  }

  return {
    bumpEpoch(){ epoch++; q.length = 0; }, // 모두 취소
    ensureNow(card){ if (!hasIframe(card)){ q.unshift({ card, preload:false, e:++epoch }); pump(); } }, // 최우선
    preloadNext(card){ if (!hasIframe(card)){ q.push({ card, preload:true, e:epoch }); pump(); } },
  };
})();

/* =========================
   카드/플레이어 관리 (IO)
   ========================= */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    if (entry.isIntersecting && entry.intersectionRatio >= 0.6){
      if (currentActive && currentActive !== card){
        const prev = currentActive.querySelector('iframe');
        if (prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }
      currentActive = card;

      // ★ 현재 카드 즉시 생성 (큐 무시) + 이전 프리로드 모두 취소
      BuildQueue.bumpEpoch();
      BuildQueue.ensureNow(card);

      // 다음 카드 1개만 프리로드 (큐에 천천히)
      const next = card.nextElementSibling;
      if (next && next.classList.contains('video')) BuildQueue.preloadNext(next);

      // 탭-토글/오디오 정책 적용은 onReady 이벤트에서 처리
      showTopbar();
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

/* =========================
   카드 DOM 생성
   ========================= */
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
  card.style.height = `${lastVhPx}px`;

  card.innerHTML = `
    <div class="thumb" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative;background:#000;">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;border:0;"/>
      <div class="playhint" style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;font-size:13px;color:#fff;text-align:center;">
        위로 스와이프 · 탭(재생/일시정지) · 탭하여 소리 허용
      </div>
      ${userSoundConsent ? '' : '<div class="mute-tip" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;color:#fff;font-size:12px;">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
    </div>
  `;

  // 소리 허용 오버레이(한 번만) — 스와이프는 통과
  const overlay = document.createElement('div');
  overlay.className = `gesture-capture ${userSoundConsent ? 'hidden':''}`;
  Object.assign(overlay.style, { position:'absolute', inset:'0', zIndex:'20', background:'transparent', touchAction:'pan-y', cursor:'pointer' });
  overlay.addEventListener('click', (e)=>{ e.stopPropagation(); grantSoundFromCard(); }, { passive:true });
  card.appendChild(overlay);

  // 탭-토글(재생/일시정지) — 스와이프는 통과
  const tap = document.createElement('div');
  tap.className = 'tap-toggle';
  Object.assign(tap.style, { position:'absolute', inset:'0', zIndex:'10', background:'transparent', touchAction:'pan-y' });
  tap.addEventListener('click', (e)=>{ e.stopPropagation(); togglePlay(card); }, { passive:true });
  card.appendChild(tap);

  activeIO.observe(card);
  return card;
}

/* =========================
   데이터 로드 (초기 소량 + 이어받기)
   ========================= */
const PAGE_SIZE = 12;
const INITIAL_PAGE_SIZE = (() => {
  const t = navigator.connection?.effectiveType || '';
  if (/slow-2g|2g/.test(t)) return 2;
  if (/3g/.test(t)) return 3;
  return 4;
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
  updateVh();
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
      const cats = selected.length > 10 ? null : selected; // array-contains-any ≤ 10
      if (cats) parts.push(where("categories","array-contains-any", cats));
      parts.push(orderBy("createdAt","desc"));
    }else{
      parts.push(orderBy("createdAt","desc"));
    }

    if (lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(pageSize));

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
  // iOS에서 스크롤 중에 뷰포트가 바뀌는 현상 보정
  if (!updateVh._t){
    updateVh._t = setTimeout(()=>{ updateVh._t = null; updateVh(); }, 120);
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
// 처음엔 소량만 DOM에 그려서 첫 카드가 빨리 보이게
loadMore(true, INITIAL_PAGE_SIZE).then(() => {
  // 첫 카드가 IO로 활성화되면 BuildQueue가 즉시 플레이어 생성
  // 그 다음에 나머지는 천천히 추가
  setTimeout(() => loadMore(false, PAGE_SIZE), 60);
});
showTopbar();
