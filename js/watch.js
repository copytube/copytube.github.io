// js/watch.js (v1.0.1: 1.0 기반 + 개인자료 로컬 재생 모드)
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

/* 개인자료 재생 모드 판정 */
const urlq = new URLSearchParams(location.search);
const PERSONAL_MODE = urlq.has('personal');
const PERSONAL_SLOT = localStorage.getItem('selectedPersonal'); // 'personal1' | 'personal2'
function getPersonalList(){
  const key = PERSONAL_SLOT==='personal2' ? 'copytube_personal2' : 'copytube_personal1';
  try{ return JSON.parse(localStorage.getItem(key)||'[]'); }catch{ return []; }
}

/* YouTube control */
let userSoundConsent=false;  // once tapped, unmute policy
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
  card.querySelector('.gesture-capture')?.addEventListener('pointerdown',(e)=>{ e.preventDefault(); e.stopPropagation(); grantSoundFromCard(); }, { once:false });
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

/* feed */
const PAGE_SIZE=10;
let isLoading=false, hasMore=true, lastDoc=null;
const loadedIds=new Set();

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML=""; isLoading=false; hasMore=true; lastDoc=null; loadedIds.clear(); currentActive=null;
}

async function loadMorePublic(initial=false){
  if(isLoading || !hasMore) return;
  isLoading=true;
  const selected = getSelectedCats();
  try{
    const base = collection(db,"videos");
    const parts=[];
    if(selected==="ALL" || !selected){ parts.push(orderBy("createdAt","desc")); }
    else if(Array.isArray(selected) && selected.length){
      const cats = selected; // 공개 피드는 무제한 허용(단, Firestore array-contains-any는 10개 제한 → 필요시 페이지 파라미터 사용)
      if(Array.isArray(cats) && cats.length<=10) parts.push(where("categories","array-contains-any", cats));
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

/* 개인자료: 로컬에서 페이징 */
let personalOffset = 0;
let personalList = [];
function loadMorePersonal(initial=false){
  if(isLoading || !hasMore) return;
  isLoading = true;
  if(initial){
    personalList = (getPersonalList() || []).map(x=> x.url).filter(Boolean);
    personalOffset = 0;
    if(!personalList.length){
      videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">개인자료가 비어 있습니다.</p></div>`;
      hasMore=false; isLoading=false; return;
    }
  }
  const slice = personalList.slice(personalOffset, personalOffset + PAGE_SIZE);
  slice.forEach(u=> videoContainer.appendChild(makeCard(u, 'local')));
  personalOffset += slice.length;
  if(personalOffset >= personalList.length) hasMore=false;
  isLoading=false;
}

videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom){
    if(PERSONAL_MODE) loadMorePersonal(false);
    else loadMorePublic(false);
  }
});

/* auto-next */
async function goToNextCard(){
  const next = currentActive?.nextElementSibling;
  if(next && next.classList.contains('video')){ next.scrollIntoView({behavior:'smooth', block:'start'}); return; }
  if(!hasMore){ showTopbar(); return; }
  const before = videoContainer.querySelectorAll('.video').length;
  if(PERSONAL_MODE) loadMorePersonal(false);
  else await loadMorePublic(false);
  const after  = videoContainer.querySelectorAll('.video').length;
  if(after>before){ videoContainer.querySelectorAll('.video')[before]?.scrollIntoView({ behavior:'smooth', block:'start' }); }
  else{ showTopbar(); }
}

/* start */
resetFeed();
if(PERSONAL_MODE){ loadMorePersonal(true); }
else{ loadMorePublic(true); }
showTopbar();
