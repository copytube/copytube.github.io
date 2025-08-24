// js/watch.js  (stable 1.1.1: iOS 첫 카드 강제 초기화 + 안전 origin 처리 + >10카테고리 스캔-필터)
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { collection, getDocs, query, where, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* viewport fix */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh(); addEventListener('resize', updateVh, {passive:true}); addEventListener('orientationchange', updateVh, {passive:true});

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
let userSoundConsent=false;  // once tapped, unmute policy
let currentActive=null;
const winToCard=new Map();

function ytCmd(iframe, func, args=[]){
  try{
    if(!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(JSON.stringify({event:"command", func, args}), "*");
  }catch{/* noop */}
}
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

/* gesture capture on card */
function grantSoundFromCard(){
  userSoundConsent=true;
  document.querySelectorAll('.gesture-capture').forEach(el=> el.classList.add('hidden'));
  const ifr = currentActive?.querySelector('iframe');
  if(ifr){ ytCmd(ifr,"setVolume",[100]); ytCmd(ifr,"unMute"); ytCmd(ifr,"playVideo"); }
}

/* IO: activate current, preload only NEXT (one) */
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

/* 안전한 origin 파라미터 */
function buildPlayerSrc(id, playerId){
  const hasValidOrigin = !!(location && location.origin && location.origin !== 'null');
  const originParam = hasValidOrigin ? `&origin=${encodeURIComponent(location.origin)}` : '';
  const refParam = `&widget_referrer=${encodeURIComponent(location.href)}`;
  return `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&autoplay=1&mute=1&rel=0${originParam}${refParam}&playerapiid=${encodeURIComponent(playerId)}`;
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
  card.querySelector('.gesture-capture')?.addEventListener('pointerdown',(e)=>{ e.preventDefault(); e.stopPropagation(); grantSoundFromCard(); }, { once:false });
  activeIO.observe(card);
  return card;
}

function ensureIframe(card, preload=false){
  if(card.querySelector('iframe')) return;
  const id = card.dataset.vid;
  const playerId = `yt-${id}-${Math.random().toString(36).slice(2,8)}`;
  const iframe = document.createElement('iframe');
  iframe.id = playerId;
  iframe.src = buildPlayerSrc(id, playerId);
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
    }catch{/* noop */}
  });
  const thumb = card.querySelector('thumb'); // 안전: 잘못된 선택자 방지용
  const t = card.querySelector('.thumb');
  t ? card.replaceChild(iframe, t) : card.appendChild(iframe);
}

/* ----- 첫 카드 강제 머티리얼라이즈 (iOS 안정화 핵심) ----- */
function ensureFirstCardMaterialized(){
  const first = videoContainer.querySelector('.video');
  if(first){
    currentActive = first;
    ensureIframe(first, false);
    const ifr = first.querySelector('iframe');
    if(ifr){ applyAudioPolicy(ifr); ytCmd(ifr,"playVideo"); }
  }
}

/* feed */
const PAGE_SIZE=10;      // 화면에 실제로 추가할 개수
const SCAN_STEP=60;      // 스캔-필터 모드에서 한 번에 읽는 개수

let isLoading=false, hasMore=true;
let mode='ALL';          // 'ALL' | 'FILTER' | 'SCAN'
let lastDocAll=null;     // ALL 모드 커서
let lastDocFilter=null;  // FILTER 모드 커서(<=10개)
let lastDocScan=null;    // SCAN 모드 커서(>10개)
const loadedIds=new Set();

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML="";
  isLoading=false; hasMore=true;
  lastDocAll=null; lastDocFilter=null; lastDocScan=null;
  loadedIds.clear(); currentActive=null;
}

function intersectSelected(docCats, selectedSet){
  if(!Array.isArray(docCats) || docCats.length===0) return false;
  for(const c of docCats){ if(selectedSet.has(c)) return true; }
  return false;
}

async function loadMore(initial=false){
  if(isLoading || !hasMore) return;
  isLoading=true;

  const selected = getSelectedCats();
  try{
    const base = collection(db,"videos");

    if(selected==="ALL" || !selected){
      mode='ALL';
      const parts=[ orderBy("createdAt","desc") ];
      if(lastDocAll) parts.push(startAfter(lastDocAll));
      parts.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(base, ...parts));
      if(snap.empty){
        if(initial) videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">영상이 없습니다.</p></div>`;
        hasMore=false; return;
      }
      snap.docs.forEach(d=>{ if(!loadedIds.has(d.id)){ loadedIds.add(d.id); const v=d.data(); videoContainer.appendChild(makeCard(v.url, d.id)); } });
      lastDocAll = snap.docs[snap.docs.length-1] || lastDocAll;

      if(initial){
        // DOM 반영 직후 2프레임 뒤에 강제 초기화(사파리 호환)
        requestAnimationFrame(()=> requestAnimationFrame(ensureFirstCardMaterialized));
      }
      if(snap.size < PAGE_SIZE) hasMore=false;
      return;
    }

    if(Array.isArray(selected) && selected.length && selected.length<=10){
      mode='FILTER';
      const parts=[ where("categories","array-contains-any", selected), orderBy("createdAt","desc"), limit(PAGE_SIZE) ];
      if(lastDocFilter) parts.push(startAfter(lastDocFilter));
      const snap = await getDocs(query(base, ...parts));
      if(snap.empty){
        if(initial) videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
        hasMore=false; return;
      }
      snap.docs.forEach(d=>{ if(!loadedIds.has(d.id)){ loadedIds.add(d.id); const v=d.data(); videoContainer.appendChild(makeCard(v.url, d.id)); } });
      lastDocFilter = snap.docs[snap.docs.length-1] || lastDocFilter;

      if(initial){
        requestAnimationFrame(()=> requestAnimationFrame(ensureFirstCardMaterialized));
      }
      if(snap.size < PAGE_SIZE) hasMore=false;
      return;
    }

    // >10개 선택: 스캔-필터 모드
    mode='SCAN';
    const selectedSet = new Set(Array.isArray(selected) ? selected : []);
    const picked=[];
    let localHasMore=true;
    let protection=0; // 무한루프 보호

    while(picked.length < PAGE_SIZE && localHasMore && protection<5){
      const parts=[ orderBy("createdAt","desc"), limit(SCAN_STEP) ];
      if(lastDocScan) parts.push(startAfter(lastDocScan));
      const snap = await getDocs(query(base, ...parts));
      if(snap.empty){ localHasMore=false; break; }

      const docs = snap.docs;
      lastDocScan = docs[docs.length-1] || lastDocScan;
      if(docs.length < SCAN_STEP) localHasMore=false;

      for(const d of docs){
        if(picked.length>=PAGE_SIZE) break;
        if(loadedIds.has(d.id)) continue;
        const v = d.data();
        const cats = Array.isArray(v.categories) ? v.categories : [];
        if(intersectSelected(cats, selectedSet)){
          loadedIds.add(d.id);
          picked.push(makeCard(v.url, d.id));
        }
      }
      protection++;
    }

    if(picked.length===0){
      if(initial) videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
      hasMore = localHasMore;
      return;
    }
    picked.forEach(card=> videoContainer.appendChild(card));
    if(initial){
      requestAnimationFrame(()=> requestAnimationFrame(ensureFirstCardMaterialized));
    }
    hasMore = localHasMore;
  }catch(e){
    console.error(e);
    if(initial){
      videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">목록을 불러오지 못했습니다.</p></div>`;
    }
  }finally{
    isLoading=false;
  }
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
