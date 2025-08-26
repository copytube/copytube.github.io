// js/watch.js (v1.0.4)
// - v1.0.3 기반
// - 삼성인터넷(Samsung Internet)에서 다음 카드가 살짝 보이는 문제 보정:
//   UA 감지 → <html class="ua-sbrowser"> + --snap-h를 videoContainer 실높이로 동기화
// - iOS 스크롤 방해 없는 제스처 처리 유지
// - 개인저장소(personal1/personal2) 재생 지원
// - 공용 카테고리 10개 초과 시 서버 최신순 + 클라이언트 필터

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { collection, getDocs, query, where, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- viewport fix ---------- */
function updateVh(){
  document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`);
}
updateVh();
addEventListener('resize', updateVh, {passive:true});
addEventListener('orientationchange', updateVh, {passive:true});

/* ---------- Samsung Internet 전용 보정 ---------- */
const isSamsungInternet = /SamsungBrowser/i.test(navigator.userAgent);
if (isSamsungInternet) {
  document.documentElement.classList.add('ua-sbrowser');
}
function updateSnapHeightForSamsung(){
  if (!isSamsungInternet) return;
  const vc = document.getElementById('videoContainer');
  if (!vc) return;
  // 스크롤 컨테이너의 '현재 보이는 영역 높이'로 카드 높이 고정
  const h = vc.clientHeight;
  document.documentElement.style.setProperty('--snap-h', h + 'px');
}
// 초기 한 번 + 각종 리사이즈 계열 이벤트에서 갱신
updateSnapHeightForSamsung();
addEventListener('resize', updateSnapHeightForSamsung, {passive:true});
addEventListener('orientationchange', updateSnapHeightForSamsung, {passive:true});
if (window.visualViewport) {
  visualViewport.addEventListener('resize', updateSnapHeightForSamsung, {passive:true});
}

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

/* ---------- dropdown ---------- */
let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown?.classList.remove("hidden"); requestAnimationFrame(()=> dropdown?.classList.add("show")); menuBackdrop?.classList.add('show'); }
function closeDropdown(){ isMenuOpen=false; dropdown?.classList.remove("show"); setTimeout(()=> dropdown?.classList.add("hidden"),180); menuBackdrop?.classList.remove('show'); }
onAuthStateChanged(auth,(user)=>{ const loggedIn=!!user; signupLink?.classList.toggle("hidden", loggedIn); signinLink?.classList.toggle("hidden", loggedIn); if(welcome) welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : ""; closeDropdown(); });
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
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

/* ---------- topbar auto hide ---------- */
const HIDE_DELAY_MS=1000; let hideTimer=null;
function showTopbar(){ topbar?.classList.remove('hide'); if(hideTimer) clearTimeout(hideTimer); if(!isMenuOpen){ hideTimer=setTimeout(()=> topbar?.classList.add('hide'), HIDE_DELAY_MS); } }
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const tgt = ev==='scroll' ? videoContainer : window;
  tgt.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbar(); }, {passive:true});
});

/* ---------- selection ---------- */
function parseCatsFromQuery(){
  try{
    const p = new URL(location.href).searchParams.get('cats');
    if(!p) return null;
    const arr = p.split(',').map(s=>s.trim()).filter(Boolean);
    return arr.length ? arr : null;
  }catch{ return null; }
}
function getSelectedCats(){
  const fromUrl = parseCatsFromQuery();
  if (fromUrl) return fromUrl;
  try{ return JSON.parse(localStorage.getItem('selectedCats')||'null'); }catch{ return "ALL"; }
}
const AUTO_NEXT = localStorage.getItem('autonext')==='on';

/* ---- 개인자료 모드 판정 ---- */
const sel = getSelectedCats();
const SEL_SET = Array.isArray(sel) ? new Set(sel) : (sel==="ALL" ? null : null);
const wantsPersonal1 = SEL_SET?.has?.('personal1') || parseCatsFromQuery()?.includes('personal1');
const wantsPersonal2 = SEL_SET?.has?.('personal2') || parseCatsFromQuery()?.includes('personal2');
const PERSONAL_MODE = (wantsPersonal1 || wantsPersonal2) && !(SEL_SET && ([...SEL_SET].some(v => v!=='personal1' && v!=='personal2')));

/* ---------- YouTube control ---------- */
let userSoundConsent=false;
let currentActive=null;
const winToCard=new Map();

function ytCmd(iframe, func, args=[]){ if(!iframe?.contentWindow) return; iframe.contentWindow.postMessage(JSON.stringify({event:"command", func, args}), "*"); }
function applyAudioPolicy(iframe){ if(!iframe) return; if(userSoundConsent){ ytCmd(iframe,"setVolume",[100]); ytCmd(iframe,"unMute"); } else { ytCmd(iframe,"mute"); } }

/* player events */
addEventListener('message',(e)=>{
  if(typeof e.data!=='string') return; let data; try{ data=JSON.parse(e.data); }catch{ return; }
  if(!data?.event) return;
  if(data.event==='onReady'){
    const card = winToCard.get(e.source); if(!card) return;
    const iframe = card.querySelector('iframe');
    if(card===currentActive){ applyAudioPolicy(iframe); ytCmd(iframe,"playVideo"); }
    else{ ytCmd(iframe,"mute"); }
    return;
  }
  if(data.event==='onStateChange' && data.info===0){
    const card = winToCard.get(e.source); if(!card) return;
    const activeIframe = currentActive?.querySelector('iframe');
    if(activeIframe && e.source===activeIframe.contentWindow && AUTO_NEXT){ goToNextCard(); }
  }
}, false);

/* gesture capture on card — iOS 스크롤 방해 X */
function grantSoundFromCard(){
  userSoundConsent=true;
  document.querySelectorAll('.gesture-capture').forEach(el=> el.classList.add('hidden'));
  const ifr = currentActive?.querySelector('iframe');
  if(ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
}

/* ---------- IO: activate current, preload NEXT ---------- */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');
    if(entry.isIntersecting && entry.intersectionRatio>=0.6){
      if(currentActive && currentActive!==card){
        const prev = currentActive.querySelector('iframe');
        if(prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }
      currentActive = card;
      ensureIframe(card);
      const ifr = card.querySelector('iframe');
      if(ifr){ ytCmd(ifr,"playVideo"); applyAudioPolicy(ifr); }
      const next = card.nextElementSibling;
      if(next && next.classList.contains('video')) ensureIframe(next, true);
      showTopbar();
    }else{
      if(iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
},{ root: videoContainer, threshold:[0,0.6,1] });

function extractId(url){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/); return m?m[1]:url; }

function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId || '';
  card.innerHTML = `
    <div class="thumb">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"/>
      <div class="playhint">위로 스와이프 · 탭하여 소리 허용</div>
      ${userSoundConsent ? '' : '<div class="mute-tip">🔇 현재 음소거 • 한 번만 허용하면 계속 소리 재생</div>'}
    </div>
    <div class="gesture-capture ${userSoundConsent ? 'hidden':''}" aria-label="tap to enable sound"></div>
  `;
  card.querySelector('.gesture-capture')?.addEventListener('pointerdown', ()=>{ grantSoundFromCard(); }, { once:false });
  activeIO.observe(card);
  return card;
}

function ensureIframe(card, preload=false){
  if(card.querySelector('iframe')) return;
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
  Object.assign(iframe.style,{ width:"100%", height:"100%", border:"0" });
  iframe.addEventListener('load',()=>{
    try{
      iframe.contentWindow.postMessage(JSON.stringify({ event:'listening', id: playerId }), '*');
      ytCmd(iframe,"addEventListener",["onReady"]);
      ytCmd(iframe,"addEventListener",["onStateChange"]);
      winToCard.set(iframe.contentWindow, card);
      if(preload) ytCmd(iframe,"mute");
    }catch{}
  });
  const thumb = card.querySelector('.thumb');
  thumb ? card.replaceChild(iframe, thumb) : card.appendChild(iframe);
}

/* ---------- Feed (개인/공용) ---------- */
const PAGE_SIZE=10;
let isLoading=false, hasMore=true, lastDoc=null;
const loadedIds=new Set();

// 공용 카테고리 필터
function resolveCatFilter(){
  if(PERSONAL_MODE) return null; // 개인 모드일 땐 공용 필터 사용 안 함
  const sel = getSelectedCats();
  if (sel==="ALL" || !sel) return null;
  if (Array.isArray(sel) && sel.length){
    // personal 값은 무시(섞어보기 비활성)
    const filtered = sel.filter(v=> v!=='personal1' && v!=='personal2');
    return filtered.length ? new Set(filtered) : null;
  }
  return null;
}
let CAT_FILTER = resolveCatFilter();

function matchesFilter(data){
  if(!CAT_FILTER) return true;
  const cats = Array.isArray(data?.categories) ? data.categories : [];
  for(const v of cats){ if(CAT_FILTER.has(v)) return true; }
  return false;
}

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML=""; isLoading=false; hasMore=true; lastDoc=null; loadedIds.clear(); currentActive=null;
}

/* ---- 개인모드: 로컬에서 읽어 페이징 ---- */
let personalItems=[], personalOffset=0;
const PERSONAL_PAGE_SIZE = 12;

function loadPersonalInit(){
  const slot = wantsPersonal1 ? 'personal1' : 'personal2';
  const key  = `copytube_${slot}`;
  try{
    personalItems = JSON.parse(localStorage.getItem(key) || '[]');
    if(!Array.isArray(personalItems)) personalItems=[];
  }catch{ personalItems=[]; }
  // 최신 저장 먼저 보이게 정렬(desc)
  personalItems.sort((a,b)=> (b?.savedAt||0) - (a?.savedAt||0));
  personalOffset = 0;
  hasMore = personalItems.length > 0;
}

function loadMorePersonal(initial=false){
  if(isLoading || !hasMore) return;
  isLoading=true;

  if(initial && personalItems.length===0){
    videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">개인자료가 없습니다. 업로드에서 개인자료에 저장해 보세요.</p></div>`;
    isLoading=false; hasMore=false; return;
  }

  const end = Math.min(personalOffset + PERSONAL_PAGE_SIZE, personalItems.length);
  for(let i=personalOffset; i<end; i++){
    const u = personalItems[i]?.url;
    if(!u) continue;
    const fakeId = `local-${i}`;
    if(loadedIds.has(fakeId)) continue;
    loadedIds.add(fakeId);
    videoContainer.appendChild(makeCard(u, fakeId));
  }
  personalOffset = end;
  if(personalOffset >= personalItems.length) hasMore=false;
  isLoading=false;

  // 높이 재계산(삼성인터넷에서 붙임)
  updateSnapHeightForSamsung();
}

/* ---- 공용모드: Firestore ---- */
async function loadMoreCommon(initial=false){
  if(isLoading || !hasMore) return;
  isLoading=true;

  try{
    const base = collection(db,"videos");
    const filterSize = CAT_FILTER ? CAT_FILTER.size : 0;

    // ALL
    if(!CAT_FILTER){
      const parts=[ orderBy("createdAt","desc") ];
      if(lastDoc) parts.push(startAfter(lastDoc));
      parts.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(base, ...parts));
      await appendFromSnap(snap, initial);
    }
    // filter <= 10 → server-side contains-any
    else if(filterSize <= 10){
      const whereVals = Array.from(CAT_FILTER);
      const parts=[ where("categories","array-contains-any", whereVals), orderBy("createdAt","desc") ];
      if(lastDoc) parts.push(startAfter(lastDoc));
      parts.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(base, ...parts));
      await appendFromSnap(snap, initial, /*clientFilter*/false);
    }
    // filter > 10 → server 최신순 + client 필터
    else{
      let appended = 0;
      let guardFetches = 0;
      let localLast = lastDoc;

      while(appended < PAGE_SIZE && hasMore && guardFetches < 3){
        const parts=[ orderBy("createdAt","desc") ];
        if(localLast) parts.push(startAfter(localLast));
        parts.push(limit(PAGE_SIZE));
        const snap = await getDocs(query(base, ...parts));
        if(snap.empty){
          hasMore=false;
          if(initial && appended===0){
            videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
          }
          break;
        }
        let addedThisRound = 0;
        for(const d of snap.docs){
          localLast = d;
          if(loadedIds.has(d.id)) continue;
          const data = d.data();
          if(matchesFilter(data)){
            loadedIds.add(d.id);
            videoContainer.appendChild(makeCard(data.url, d.id));
            appended++; addedThisRound++;
            if(appended >= PAGE_SIZE) break;
          }
        }
        lastDoc = localLast || lastDoc;
        if(snap.size < PAGE_SIZE){ hasMore=false; }
        guardFetches++;
        if(addedThisRound===0 && snap.size < PAGE_SIZE){ hasMore=false; break; }
      }
      if(initial && videoContainer.children.length===0){
        videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
      }
    }

  }catch(e){
    console.error(e);
    if(initial){
      videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">목록을 불러오지 못했습니다.</p></div>`;
    }
  }finally{
    isLoading=false;
    // 높이 재계산(삼성인터넷)
    updateSnapHeightForSamsung();
  }
}

async function appendFromSnap(snap, initial, clientFilter=false){
  if(snap.empty){
    if(initial) videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
    hasMore=false; return;
  }
  let appended=0;
  snap.docs.forEach(d=>{
    if(loadedIds.has(d.id)) return;
    const data=d.data();
    if(clientFilter && !matchesFilter(data)) return;
    loadedIds.add(d.id);
    videoContainer.appendChild(makeCard(data.url, d.id));
    appended++;
  });
  lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
  if(snap.size < PAGE_SIZE) hasMore=false;
  if(initial && appended===0){
    videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
  }
}

/* ---------- scroll 페이징 ---------- */
videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom){
    if(PERSONAL_MODE) loadMorePersonal(false);
    else loadMoreCommon(false);
  }
});

/* ---------- auto-next ---------- */
async function goToNextCard(){
  const next = currentActive?.nextElementSibling;
  if(next && next.classList.contains('video')){ next.scrollIntoView({behavior:'smooth', block:'start'}); return; }
  if(!hasMore){ showTopbar(); return; }
  const before = videoContainer.querySelectorAll('.video').length;
  if(PERSONAL_MODE) loadMorePersonal(false);
  else await loadMoreCommon(false);
  const after  = videoContainer.querySelectorAll('.video').length;
  if(after>before){ videoContainer.querySelectorAll('.video')[before]?.scrollIntoView({ behavior:'smooth', block:'start' }); }
  else{ showTopbar(); }
}

/* ---------- start (TLA 회피: IIFE) ---------- */
(async ()=>{
  resetFeed();
  if(PERSONAL_MODE){ loadPersonalInit(); loadMorePersonal(true); }
  else{ await loadMoreCommon(true); }
  showTopbar();
  // 시작 시점에도 삼성인터넷 높이 보정(안전망)
  updateSnapHeightForSamsung();
})();
