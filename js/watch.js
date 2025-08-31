// js/watch.js (v1.0.4 기반, 큐/인덱스 우선 재생 추가)
// - 기존 기능은 유지(삼성인터넷 보정, 자동 상단바, 개인자료, 공용 카테고리, IntersectionObserver, AUTO_NEXT 등)
// - 추가: list.html에서 넘겨준 sessionStorage.playQueue/playIndex 및 URL의 doc/idx를 최우선으로 사용하여
//         해당 "목록의 n번째 영상"부터 재생하는 QUEUE_MODE를 지원

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { collection, getDocs, query, where, orderBy, limit, startAfter, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

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
  const h = vc.clientHeight;
  document.documentElement.style.setProperty('--snap-h', h + 'px');
}
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
onAuthStateChanged(auth,(user)=>{ const loggedIn=!!user; signupLink?.classList.toggle("hidden", loggedIn); signinLink?.classList.toggle("hidden", loggedIn); if(welcome) welcome.textContent = loggedIn ? `Hi! ${user.displayName || '회원'}님` : ""; closeDropdown(); });
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

function resolveCatFilter(){
  if(PERSONAL_MODE) return null;
  const sel = getSelectedCats();
  if (sel==="ALL" || !sel) return null;
  if (Array.isArray(sel) && sel.length){
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

  updateSnapHeightForSamsung();
}

/* ---- 공용모드: Firestore ---- */
async function loadMoreCommon(initial=false){
  if(isLoading || !hasMore) return;
  isLoading=true;

  try{
    const base = collection(db,"videos");
    const filterSize = CAT_FILTER ? CAT_FILTER.size : 0;

    if(!CAT_FILTER){
      const parts=[ orderBy("createdAt","desc") ];
      if(lastDoc) parts.push(startAfter(lastDoc));
      parts.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(base, ...parts));
      await appendFromSnap(snap, initial);
    }
    else if(filterSize <= 10){
      const whereVals = Array.from(CAT_FILTER);
      const parts=[ where("categories","array-contains-any", whereVals), orderBy("createdAt","desc") ];
      if(lastDoc) parts.push(startAfter(lastDoc));
      parts.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(base, ...parts));
      await appendFromSnap(snap, initial, false);
    }
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
    if(QUEUE_MODE) return; // 큐 모드에서는 더 불러오지 않음
    if(PERSONAL_MODE) loadMorePersonal(false);
    else loadMoreCommon(false);
  }
});

/* ---------- auto-next ---------- */
async function goToNextCard(){
  const next = currentActive?.nextElementSibling;
  if(next && next.classList.contains('video')){ next.scrollIntoView({behavior:'smooth', block:'start'}); return; }
  if(QUEUE_MODE){ showTopbar(); return; } // 큐 모드에선 고정
  if(!hasMore){ showTopbar(); return; }
  const before = videoContainer.querySelectorAll('.video').length;
  if(PERSONAL_MODE) loadMorePersonal(false);
  else await loadMoreCommon(false);
  const after  = videoContainer.querySelectorAll('.video').length;
  if(after>before){ videoContainer.querySelectorAll('.video')[before]?.scrollIntoView({ behavior:'smooth', block:'start' }); }
  else{ showTopbar(); }
}

/* ---------- 큐 모드(목록에서 전달받은 재생목록을 그대로 사용) ---------- */
let QUEUE_MODE = false;
function getParam(name){ try{ return new URL(location.href).searchParams.get(name); }catch{ return null; } }

function tryLoadFromQueue(){
  const hasIdx = getParam('idx') !== null;
  const hasDoc = !!getParam('doc');
  if (!hasIdx && !hasDoc) return false;
  let queue = [];
  try { queue = JSON.parse(sessionStorage.getItem('playQueue') || '[]'); } catch { queue = []; }
  if (!Array.isArray(queue) || queue.length === 0) return false;

  // idx: sessionStorage 우선, URL 보정
  let idx = sessionStorage.getItem('playIndex');
  const urlIdx = getParam('idx');
  if (urlIdx !== null) idx = urlIdx;
  const docParam = getParam('doc');

  // doc 제공 시 큐에서 위치 동기화
  if (docParam) {
    const found = queue.findIndex(it => it.id === docParam);
    if (found >= 0) idx = String(found);
  }

  const startIndex = Math.max(0, Math.min(queue.length - 1, parseInt(idx || '0', 10) || 0));

  // 피드 초기화 후 큐로 카드 구성
  resetFeed();
  QUEUE_MODE = true;
  hasMore = false;

  queue.forEach((item, i) => {
    const url = item?.url || '';
    const did = item?.id  || `q-${i}`;
    if (loadedIds.has(did)) return;
    loadedIds.add(did);
    videoContainer.appendChild(makeCard(url, did));
  });

  // startIndex로 이동 → IO가 활성화/재생 처리
  const target = videoContainer.querySelectorAll('.video')[startIndex];
  if (target) {
    target.scrollIntoView({ behavior:'instant', block:'start' });
    // 보수적으로 iframe 준비
    ensureIframe(target);
    currentActive = target;
  }

  // 현재 인덱스 저장(재진입 대비)
  sessionStorage.setItem('playIndex', String(startIndex));

  // 삼성인터넷 높이 보정
  updateSnapHeightForSamsung();
  showTopbar();
  return true;
}

/* ---------- start ---------- */
(async ()=>{
  // 1) 목록에서 온 경우(큐 모드)를 최우선 적용
  if (tryLoadFromQueue()) {
    return;
  }

  // 2) 큐가 없고 doc 파라미터만 있는 경우(단일 진입) — 기존 흐름 보강
  const docId = getParam('doc');
  if (docId) {
    try{
      const ref = doc(db, 'videos', docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        resetFeed();
        const d = snap.data();
        const u = d?.url || '';
        loadedIds.add(docId);
        videoContainer.appendChild(makeCard(u, docId));
        const target = videoContainer.querySelector('.video');
        if (target) { ensureIframe(target); currentActive = target; }
        updateSnapHeightForSamsung();
        showTopbar();
        return;
      }
    }catch(e){ console.warn('[watch] doc load fail:', e?.message||e); }
  }

  // 3) 기존 로직 유지(개인/공용)
  resetFeed();
  if(PERSONAL_MODE){ loadPersonalInit(); loadMorePersonal(true); }
  else{ await loadMoreCommon(true); }
  showTopbar();
  updateSnapHeightForSamsung();
})();
