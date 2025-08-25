// js/watch.js
// - iOS: 썸네일 유지 + onReady 후 전환 + 다음 카드 프리로드 지연(네트워크 경쟁 제거)
// - ANDROID/PC: 예전 방식으로 복귀 → 액티브 시 즉시 iframe 표시, 바로 다음 카드 프리로드
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { collection, getDocs, query, where, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* viewport fix */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh(); addEventListener('resize', updateVh, {passive:true}); addEventListener('orientationchange', updateVh, {passive:true});

/* iOS 감지 */
function isIOS(){
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOS13Plus = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS || iPadOS13Plus;
}
const IS_IOS = isIOS();

/* DOM */
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

/* dropdown */
let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); menuBackdrop.classList.add('show'); }
function closeDropdown(){ isMenuOpen=false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"),180); menuBackdrop.classList.remove('show'); }
onAuthStateChanged(auth,(user)=>{ const loggedIn=!!user; signupLink?.classList.toggle("hidden", loggedIn); signinLink?.classList.toggle("hidden", loggedIn); welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : ""; closeDropdown(); });
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
dropdown?.addEventListener("click",(e)=> e.stopPropagation());
menuBackdrop?.addEventListener('click', closeDropdown);
addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
["scroll","wheel","keydown","touchmove"].forEach(ev=> addEventListener(ev, ()=>{ if(isMenuOpen) closeDropdown(); }, {passive:true}));
function goOrSignIn(path){ auth.currentUser ? (location.href=path) : (location.href='signin.html'); }
btnGoCategory?.addEventListener("click", ()=>{ location.href="index.html"; closeDropdown(); });
btnMyUploads ?.addEventListener("click", ()=>{ goOrSignIn("manage-uploads.html"); closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href="about.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if(!auth.currentUser){ location.href='signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ goOrSignIn("upload.html"); closeDropdown(); });
brandHome    ?.addEventListener("click",(e)=>{ e.preventDefault(); location.href="index.html"; });

/* topbar auto hide */
const HIDE_DELAY_MS=1000; let hideTimer=null;
function showTopbar(){ topbar.classList.remove('hide'); if(hideTimer) clearTimeout(hideTimer); if(!isMenuOpen){ hideTimer=setTimeout(()=> topbar.classList.add('hide'), HIDE_DELAY_MS); } }
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const tgt = ev==='scroll' ? videoContainer : window;
  tgt.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbar(); }, {passive:true});
});

/* selection */
function getSelectedCats(){ try{ return JSON.parse(localStorage.getItem('selectedCats')||'null'); }catch{ return "ALL"; } }
const AUTO_NEXT = localStorage.getItem('autonext')==='on';

/* YouTube control */
let userSoundConsent=false;     // 한 번 탭하면 이후 unmute 허용
let currentActive=null;
let firstAutoplayDone=false;    // 첫 카드만 자동재생
const winToCard=new Map();      // contentWindow -> card

function ytCmd(iframe, func, args=[]){ if(!iframe?.contentWindow) return; iframe.contentWindow.postMessage(JSON.stringify({event:"command", func, args}), "*"); }
function applyAudioPolicy(iframe){ if(!iframe) return; if(userSoundConsent){ ytCmd(iframe,"setVolume",[100]); ytCmd(iframe,"unMute"); } else { ytCmd(iframe,"mute"); } }

/* 카드 헬퍼 */
function getThumb(card){ return card.querySelector('.thumb'); }
function getIframe(card){ return card.querySelector('iframe'); }
function revealPlayer(card){
  const ifr = getIframe(card);
  if(!ifr) return;
  ifr.style.visibility = 'visible';
  ifr.style.pointerEvents = 'auto';
  const thumb = getThumb(card);
  if(thumb) thumb.style.display = 'none';
}
function concealPlayer(card){
  const ifr = getIframe(card);
  if(!ifr) return;
  ifr.style.visibility = 'hidden';
  ifr.style.pointerEvents = 'none';
  const thumb = getThumb(card);
  if(thumb) thumb.style.display = '';
}

/* 다음 카드 프리로드: iOS는 onReady 이후, Android/PC는 즉시 */
function preloadNext(card){
  const next = card.nextElementSibling;
  if(next && next.classList.contains('video') && !next.querySelector('iframe')){
    ensureIframe(next, /*preload*/true, /*autoplay*/false);
  }
}

/* player events */
addEventListener('message',(e)=>{
  if(typeof e.data!=='string') return; let data; try{ data=JSON.parse(e.data); }catch{ return; }
  if(!data?.event) return;

  if(data.event==='onReady'){
    const card = winToCard.get(e.source); if(!card) return;
    card.dataset.ready = '1';

    const iframe = getIframe(card);
    ytCmd(iframe,"mute"); // 기본 mute

    // 현재 액티브 + 자동재생 대상이면 준비 직후 전환 & 재생
    if(card===currentActive && card.dataset.autoplay==='1'){
      if(IS_IOS) revealPlayer(card); // iOS는 숨겨놨다가 전환
      applyAudioPolicy(iframe);
      ytCmd(iframe,"playVideo");
    }

    // iOS만: 현재 카드 준비 끝난 뒤 다음 카드 프리로드 (네트워크 경쟁 제거)
    if(IS_IOS && card===currentActive){ preloadNext(card); }
    return;
  }

  if(data.event==='onStateChange' && data.info===0){
    const card = winToCard.get(e.source); if(!card) return;
    const activeIframe = currentActive?.querySelector('iframe');
    if(activeIframe && e.source===activeIframe.contentWindow && AUTO_NEXT){ goToNextCard(); }
  }
}, false);

/* 제스처 사운드 허용 */
function grantSoundFromCard(){
  userSoundConsent=true;
  document.querySelectorAll('.gesture-capture').forEach(el=> el.classList.add('hidden'));
  const ifr = currentActive?.querySelector('iframe');
  if(ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
}

/* 가시성 기반 활성화 */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = getIframe(card);
    if(entry.isIntersecting && entry.intersectionRatio>=0.6){
      // 이전 카드 정리
      if(currentActive && currentActive!==card){
        const prev = getIframe(currentActive);
        if(prev){ ytCmd(prev,"pauseVideo"); ytCmd(prev,"mute"); }
        if(IS_IOS) concealPlayer(currentActive); // iOS는 썸네일로 복귀(프리로드 유지)
      }
      currentActive = card;

      const shouldAutoplay = !firstAutoplayDone;
      ensureIframe(card, /*preload*/false, /*autoplay*/shouldAutoplay);

      if(shouldAutoplay){
        const ifr = getIframe(card);
        if(card.dataset.ready==='1'){
          if(IS_IOS) revealPlayer(card); // iOS만 전환
          applyAudioPolicy(ifr);
          ytCmd(ifr,"playVideo");
        } // 준비 전이면 onReady에서 처리
        firstAutoplayDone = true;
      }else{
        // 자동재생 아님
        if(IS_IOS){
          // iOS: 준비되어 있으면 즉시 전환(▶︎ 오버레이 보이게)
          if(card.dataset.ready==='1'){ revealPlayer(card); }
        }else{
          // ANDROID/PC: 예전처럼 이미 iframe이 보이는 상태
        }
      }

      // ANDROID/PC: 액티브 시 바로 다음 카드 프리로드(체감 속도 ↑)
      if(!IS_IOS){ preloadNext(card); }

      showTopbar();
    }else{
      if(iframe){ ytCmd(iframe,"pauseVideo"); ytCmd(iframe,"mute"); }
    }
  });
},{ root: videoContainer, threshold:[0,0.6,1] });

/* ID 추출 */
function extractId(url){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/); return m?m[1]:url; }

/* 카드 생성: 기본은 썸네일(공통), iOS만 onReady까지 썸네일 유지 */
function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;
  card.dataset.ready = '0';
  card.dataset.autoplay = '0';

  card.innerHTML = `
    <div class="thumb" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;border:0;"/>
      <div class="playhint" style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;font-size:13px;color:#fff;text-align:center;">
        위로 스와이프 · 탭하여 소리 허용
      </div>
      ${userSoundConsent ? '' : '<div class="mute-tip" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;color:#fff;font-size:12px;">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
    </div>
    <div class="gesture-capture ${userSoundConsent ? 'hidden':''}" aria-label="tap to enable sound" style="position:absolute;inset:0;z-index:20;background:transparent;cursor:pointer;"></div>
  `;
  card.querySelector('.gesture-capture')?.addEventListener('pointerdown',(e)=>{ e.preventDefault(); e.stopPropagation(); grantSoundFromCard(); }, { once:false });

  activeIO.observe(card); // 관찰 시작
  return card;
}

/* iframe 생성
   - iOS: 최초엔 숨김(visibility:hidden)으로 카드 위에 겹쳐 두고, onReady 때 썸네일→플레이어 전환
   - ANDROID/PC: 예전처럼 즉시 보이게 붙이고(thumb 교체), 스피너 노출을 굳이 숨기지 않음 */
function buildPlayerSrc(id, playerId, autoplay){
  const origin = encodeURIComponent(location.origin);
  const ref = encodeURIComponent(location.href);
  const ap = autoplay ? 1 : 0;
  return `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&autoplay=${ap}&mute=1&rel=0&origin=${origin}&widget_referrer=${ref}&playerapiid=${encodeURIComponent(playerId)}`;
}
function ensureIframe(card, preload=false, autoplay=false){
  if(getIframe(card)) return;
  const id = card.dataset.vid;
  const playerId = `yt-${id}-${Math.random().toString(36).slice(2,8)}`;
  const iframe = document.createElement('iframe');
  iframe.id = playerId;
  iframe.src = buildPlayerSrc(id, playerId, autoplay);
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;

  if(IS_IOS){
    // iOS: 준비될 때까지 숨김
    Object.assign(iframe.style,{ visibility:'hidden', pointerEvents:'none' });
    card.appendChild(iframe);
  }else{
    // ANDROID/PC: 기존처럼 즉시 보이게 삽입 (thumb 교체)
    Object.assign(iframe.style,{ width:"100%", height:"100%", border:"0" });
    const thumb = getThumb(card);
    thumb ? card.replaceChild(iframe, thumb) : card.appendChild(iframe);
  }

  iframe.addEventListener('load',()=>{
    try{
      iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id: playerId }), '*');
      ytCmd(iframe,"addEventListener",["onReady"]);
      ytCmd(iframe,"addEventListener",["onStateChange"]);
      winToCard.set(iframe.contentWindow, card);
      ytCmd(iframe,"mute");
    }catch{}
  });

  card.dataset.autoplay = autoplay ? '1' : '0';
}

/* feed */
const PAGE_SIZE=10;
let isLoading=false, hasMore=true, lastDoc=null;
const loadedIds=new Set();

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML=""; isLoading=false; hasMore=true; lastDoc=null; loadedIds.clear(); currentActive=null; firstAutoplayDone=false;
}
async function loadMore(initial=false){
  if(isLoading || !hasMore) return;
  isLoading=true;
  const selected = getSelectedCats();
  try{
    const base = collection(db,"videos");
    const parts=[];
    if(selected==="ALL" || !selected){ parts.push(orderBy("createdAt","desc")); }
    else if(Array.isArray(selected) && selected.length){
      const cats = selected.length>10 ? null : selected; // 10개 초과면 where 생략
      if(cats) parts.push(where("categories","array-contains-any", cats));
      parts.push(orderBy("createdAt","desc"));
    }else{ parts.push(orderBy("createdAt","desc")); }
    if(lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));
    const snap = await getDocs(query(base, ...parts));
    if(snap.empty){
      if(initial) videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
      hasMore=false; isLoading=false; return;
    }
    snap.docs.forEach(d=>{
      if(loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      const data = d.data();
      videoContainer.appendChild(makeCard(data.url, d.id));
    });
    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if(snap.size < PAGE_SIZE) hasMore=false;
  }catch(e){
    console.error(e);
    if(initial){
      videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">목록을 불러오지 못했습니다.</p></div>`;
    }
  }finally{ isLoading=false; }
}
videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom) loadMore(false);
});

/* auto-next */
async function goToNextCard(){
  const next = currentActive?.nextElementSibling;
  if(next && next.classList.contains('video')){ next.scrollIntoView({behavior:'smooth', block:'start'}); return; }
  if(!hasMore){ showTopbar(); return; }
  const before = videoContainer.querySelectorAll('.video').length;
  await loadMore(false);
  const after  = videoContainer.querySelectorAll('.video').length;
  if(after>before){ videoContainer.querySelectorAll('.video')[before]?.scrollIntoView({ behavior:'smooth', block:'start' }); }
  else{ showTopbar(); }
}

/* start */
resetFeed(); loadMore(true); showTopbar();
