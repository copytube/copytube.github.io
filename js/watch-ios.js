// js/watch-ios.js — iPhone/iPad 전용: 중앙 요소 판정, 1장 선로딩, 안전한 언마운트, iOS 오디오 정책 준수
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 보정 (visualViewport 동기화) ---------- */
function setAppVh(px){ document.documentElement.style.setProperty('--app-vh', `${Math.round(px)}px`); }
function updateVh(){ const vv = window.visualViewport; setAppVh(vv && typeof vv.height==='number' ? vv.height : window.innerHeight); }
updateVh();
const vv = window.visualViewport;
vv?.addEventListener('resize', updateVh, { passive:true });
vv?.addEventListener('scroll', updateVh, { passive:true });
addEventListener('resize', updateVh, { passive:true });
addEventListener('orientationchange', updateVh, { passive:true });
addEventListener('pageshow', updateVh);

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

/* ---------- 드롭다운 (index 동일 UX) ---------- */
let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); menuBackdrop.classList.add('show'); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); menuBackdrop.classList.remove('show'); }

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
["scroll","wheel","keydown","touchmove","pointermove"].forEach(ev=>{
  addEventListener(ev, ()=>{ if(isMenuOpen) closeDropdown(); }, {passive:true});
});
function goOrSignIn(path){ auth.currentUser ? (location.href = path) : (location.href = 'signin.html'); }
btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if (!auth.currentUser){ location.href = 'signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
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

/* ---------- 설정/상태 ---------- */
function getSelectedCats(){ try { return JSON.parse(localStorage.getItem('selectedCats')||'null'); } catch { return "ALL"; } }
const AUTO_NEXT = localStorage.getItem('autonext') === 'on';

// iOS 정책: 사용자 제스처 전에는 mute
let userSoundConsent = false;
let currentActive = null;
const winToCard = new Map(); // iframe.contentWindow → card

/* ---------- YouTube 제어 ---------- */
function ytCmd(iframe, func, args = []) {
  if (!iframe || !iframe.contentWindow) return;
  try { iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*"); } catch {}
}
function applyAudioPolicy(iframe){
  if (!iframe) return;
  if (userSoundConsent){ ytCmd(iframe, "setVolume", [100]); ytCmd(iframe, "unMute"); }
  else { ytCmd(iframe, "mute"); }
}

/* ---------- YouTube 이벤트 ---------- */
addEventListener('message', (e)=>{
  if (typeof e.data !== 'string') return;
  let data; try{ data = JSON.parse(e.data); }catch{ return; }
  if (!data?.event) return;

  if (data.event === 'onReady'){
    const card = winToCard.get(e.source);
    if (!card) return;
    const iframe = card.querySelector('iframe');
    if (card === currentActive){ applyAudioPolicy(iframe); ytCmd(iframe,"playVideo"); }
    else { ytCmd(iframe,"mute"); }
    return;
  }

  // info === 0 (ENDED) → 활성 플레이어일 때만 다음으로
  if (data.event === 'onStateChange' && data.info === 0){
    const card = winToCard.get(e.source);
    if (!card) return;
    const activeIframe = currentActive?.querySelector('iframe');
    if (activeIframe && e.source === activeIframe.contentWindow && AUTO_NEXT){
      goToNextCard();
    }
  }
}, false);

/* ---------- 제스처로 소리 허용 ---------- */
function grantSoundFromCard(){
  userSoundConsent = true;
  document.querySelectorAll('.gesture-capture').forEach(el => el.classList.add('hidden'));
  const ifr = currentActive?.querySelector('iframe');
  if (ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
}

/* ---------- 카드/썸네일 ---------- */
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}
function thumbHTML(id){
  return `
    <div class="thumb">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy" decoding="async" />
      <div class="playhint">위로 스와이프 · 탭하여 소리 허용</div>
      ${userSoundConsent ? '' : '<div class="mute-tip">🔇 현재 음소거 • 한 번만 탭하면 이후에도 소리 재생</div>'}
    </div>`;
}
function makeCard(url, docId, isFirst=false){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;
  card.dataset.mounted = '0';
  card.innerHTML = thumbHTML(id) + (userSoundConsent ? '' : `<div class="gesture-capture" aria-label="tap to enable sound"></div>`);

  if (isFirst){ card.querySelector('img')?.setAttribute('fetchpriority', 'high'); }
  card.querySelector('.gesture-capture')?.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); grantSoundFromCard(); });
  return card;
}

/* ---------- iframe mount/unmount (메모리 보호) ---------- */
function mountIframe(card, {preload=false} = {}){
  if (!card || card.dataset.mounted === '1') return;
  const id = card.dataset.vid;
  const origin   = encodeURIComponent(location.origin);
  const playerId = `yt-${id}-${Math.random().toString(36).slice(2,8)}`;
  const iframe = document.createElement('iframe');
  iframe.id = playerId;
  iframe.src =
    `https://www.youtube.com/embed/${id}` +
    `?enablejsapi=1&playsinline=1&autoplay=1&mute=1&rel=0&modestbranding=1&iv_load_policy=3` +
    `&origin=${origin}&widget_referrer=${encodeURIComponent(location.href)}` +
    `&playerapiid=${encodeURIComponent(playerId)}`;
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.setAttribute('playsinline', '');
  iframe.allowFullscreen = true;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";

  iframe.addEventListener('load', ()=>{
    try{
      iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id: playerId }), '*');
      ytCmd(iframe, "addEventListener", ["onReady"]);
      ytCmd(iframe, "addEventListener", ["onStateChange"]);
      winToCard.set(iframe.contentWindow, card);
      if (preload) ytCmd(iframe, "mute");
    }catch{}
  });

  const thumb = card.querySelector('.thumb');
  if (thumb) card.replaceChild(iframe, thumb); else card.appendChild(iframe);
  card.dataset.mounted = '1';

  if (card === currentActive){ ytCmd(iframe,"playVideo"); applyAudioPolicy(iframe); }
  else { ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
}
function unmountIframe(card){
  if (!card || card.dataset.mounted !== '1') return;
  const iframe = card.querySelector('iframe');
  if (iframe){
    try{ const w = iframe.contentWindow; if (w) winToCard.delete(w); }catch{}
    iframe.remove();
  }
  card.insertAdjacentHTML('afterbegin', thumbHTML(card.dataset.vid));
  if (!userSoundConsent){
    const cap = document.createElement('div');
    cap.className = 'gesture-capture';
    cap.setAttribute('aria-label','tap to enable sound');
    cap.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); grantSoundFromCard(); });
    card.appendChild(cap);
  }
  card.dataset.mounted = '0';
}

/* ---------- 활성 카드 판정(컨테이너 중앙 요소) ---------- */
let scrollTicking = false, scrollIdleTimer = null;
function getCardAtCenter(){
  const r = videoContainer.getBoundingClientRect();
  const x = r.left + r.width/2;
  const y = r.top  + r.height/2;
  let el = document.elementFromPoint(x, y);
  while (el && el !== document.body && !el.classList?.contains('video')) el = el.parentElement;
  return el && el.classList?.contains('video') ? el : null;
}
function preloadNextFrom(card){
  const next = card?.nextElementSibling;
  if (next && next.classList?.contains('video')){
    (window.requestIdleCallback ? requestIdleCallback : setTimeout)(()=> mountIframe(next, {preload:true}), 120);
  }
}
function onScroll(){
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(()=>{
    const centered = getCardAtCenter();
    if (centered && centered !== currentActive){
      if (currentActive){
        const prevIframe = currentActive.querySelector('iframe');
        if (prevIframe){ ytCmd(prevIframe,"pauseVideo"); ytCmd(prevIframe,"mute"); }
      }
      currentActive = centered;
      mountIframe(currentActive, {preload:false});
      preloadNextFrom(currentActive);
      cleanupFarFrames();
      showTopbar();
    }
    scrollTicking = false;
  });

  clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(()=> {
    const centered = getCardAtCenter();
    if (centered && centered.dataset.mounted !== '1') mountIframe(centered, {preload:false});
  }, 140);
}
videoContainer.addEventListener('scroll', onScroll, {passive:true});
addEventListener('resize', onScroll, {passive:true});

function cleanupFarFrames(){
  const cards = Array.from(videoContainer.querySelectorAll('.video'));
  const idx = cards.indexOf(currentActive);
  cards.forEach((c, i)=>{
    const dist = Math.abs(i - idx);
    if (dist >= 2 && c.dataset.mounted === '1') unmountIframe(c); // 현재±1만 유지
  });
}

/* ---------- 가시성 ---------- */
document.addEventListener('visibilitychange', ()=>{
  const ifr = currentActive?.querySelector('iframe');
  if (!ifr) return;
  if (document.hidden) ytCmd(ifr,"pauseVideo");
  else { ytCmd(ifr,"playVideo"); applyAudioPolicy(ifr); }
});

/* ---------- 데이터 로드 (무한 스크롤) ---------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
const loadedIds = new Set();

function resetFeed(){
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

    const first = videoContainer.querySelectorAll('.video').length === 0;
    snap.docs.forEach((d, i)=>{
      if (loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      const data = d.data();
      videoContainer.appendChild(makeCard(data.url, d.id, first && i===0));
    });

    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if (snap.size < PAGE_SIZE) hasMore = false;

    if (initial){
      requestAnimationFrame(()=>{
        const centered = getCardAtCenter() || videoContainer.querySelector('.video');
        if (centered){
          currentActive = centered;
          mountIframe(centered, {preload:false});
          preloadNextFrom(centered);
          cleanupFarFrames();
          showTopbar();
        }
      });
    }

  }catch(e){
    console.error(e);
    if (initial){
      videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">목록을 불러오지 못했습니다.</p></div>`;
    }
  }finally{
    isLoading = false;
  }
}

// 바닥 근접 시 추가 로드
videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 180;
  if (nearBottom) loadMore(false);
}, {passive:true});

/* ---------- 자동 다음 ---------- */
async function goToNextCard(){
  const next = currentActive?.nextElementSibling;
  if (next && next.classList.contains('video')){
    next.scrollIntoView({ behavior: ('scrollBehavior' in document.documentElement.style ? 'smooth' : 'auto'), block:'start' });
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
