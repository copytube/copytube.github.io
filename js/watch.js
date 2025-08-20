// js/watch.js
import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db } from './firebase-init.js';

/* ---------- viewport ---------- */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh(); window.addEventListener('resize', updateVh); window.addEventListener('orientationchange', updateVh);

/* ---------- DOM ---------- */
const topbar       = document.getElementById("topbar");
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnGoCategory= document.getElementById("btnGoCategory");
const btnMyUploads = document.getElementById("btnMyUploads");
const brandHome    = document.getElementById("brandHome");
const videoContainer  = document.getElementById("videoContainer");

/* ---------- state ---------- */
const PAGE_SIZE = 12;
let isLoading = false, hasMore = true, lastDoc = null;
let loadedIds = new Set();
let userSoundConsent = false;
let currentActive    = null;
let selected = null;
try{ selected = JSON.parse(localStorage.getItem('selectedCats')||'"ALL"'); }catch{ selected="ALL"; }

/* ---------- dropdown ---------- */
let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; showTopbarTemp(); dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }
onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink.classList.toggle("hidden", loggedIn);
  signinLink.classList.toggle("hidden", loggedIn);
  menuBtn.classList.toggle("hidden", !loggedIn);
  welcome.textContent = loggedIn ? `안녕하세요, ${user.displayName || '회원'}님` : "";
  closeDropdown();
});
menuBtn.addEventListener("click", (e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{
  if (dropdown.classList.contains('hidden')) return;
  if (!e.target.closest('#dropdownMenu') && !e.target.closest('#menuBtn')) closeDropdown();
}, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown.addEventListener("click", (e)=> e.stopPropagation());

btnGoCategory?.addEventListener("click", ()=>{ location.href = "./"; closeDropdown(); });
btnMyUploads?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnSignOut?.addEventListener("click", async ()=>{ await fbSignOut(auth); closeDropdown(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
brandHome?.addEventListener("click", (e)=>{ e.preventDefault(); location.href="./"; });

/* ---------- topbar autohide (1s) ---------- */
topbar.classList.add('autohide');
let hideTimer = null;
function scheduleHide(){ cancelHide(); if(!isMenuOpen){ hideTimer = setTimeout(()=> topbar.classList.add('hide'), 1000); } }
function cancelHide(){ if(hideTimer){ clearTimeout(hideTimer); hideTimer=null; } }
function showTopbarTemp(){ topbar.classList.remove('hide'); scheduleHide(); }
['scroll','wheel','touchstart','mousemove','keydown'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbarTemp(); }, { passive:true });
});
showTopbarTemp();

/* ---------- YouTube ---------- */
function ytCmd(iframe, func, args = []) { if (!iframe || !iframe.contentWindow) return; iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*"); }
function grantSoundAndUnmuteCurrent(){
  userSoundConsent = true;
  const iframe = currentActive?.querySelector('iframe');
  if (iframe){ ytCmd(iframe,"unMute"); ytCmd(iframe,"playVideo"); }
}
const grantOnce = ()=>{ grantSoundAndUnmuteCurrent(); ['click','touchstart','pointerdown','wheel','keydown'].forEach(ev=>{ window.removeEventListener(ev, grantOnce, opts(ev)); }); };
const opts = (ev)=> (ev==='touchstart' ? { once:true, passive:true } : { once:true });
['click','touchstart','pointerdown','wheel','keydown'].forEach(ev=>{ window.addEventListener(ev, grantOnce, opts(ev)); });

/* ---------- active card ---------- */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');
    if(entry.isIntersecting && entry.intersectionRatio > 0.6){
      if(currentActive && currentActive !== card){
        const prev = currentActive.querySelector('iframe');
        if(prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }
      currentActive = card;
      ensureIframe(card);
      const ifr = card.querySelector('iframe');
      if (ifr){ ytCmd(ifr,"playVideo"); userSoundConsent ? ytCmd(ifr,"unMute") : ytCmd(ifr,"mute"); }
    } else {
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
}, { root: videoContainer, threshold:[0,0.6,1] });

/* ---------- render ---------- */
function showHint(text){ videoContainer.innerHTML = `<div class="video"><p class="hint">${text}</p></div>`; }
function makeCard(url, docId){
  const id = extractId(url);
  const card = document.createElement('div');
  card.className = 'video';
  card.dataset.vid = id;
  card.dataset.docId = docId;
  card.innerHTML = `
    <div class="thumb" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;position:relative;">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="thumbnail" loading="lazy"
           style="max-width:100%;max-height:100%;object-fit:contain;border:0;"/>
      <div class="playhint" style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 10px;background:rgba(0,0,0,.45);border-radius:6px;font-size:13px;color:#fff;">
        위로 스와이프 • 첫 제스처 후 소리 허용
      </div>
    </div>`;
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    if(!userSoundConsent) userSoundConsent = true;
    if (ifr){ ytCmd(ifr,"playVideo"); ytCmd(ifr,"unMute"); }
    currentActive = card;
  });
  activeIO.observe(card);
  return card;
}
function ensureIframe(card){
  if(card.querySelector('iframe')) return;
  const id = card.dataset.vid;
  const origin = encodeURIComponent(location.origin);
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&autoplay=1&mute=1&origin=${origin}`;
  iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });
  const thumb = card.querySelector('.thumb');
  if(thumb) card.replaceChild(iframe, thumb);
}
function extractId(url){ const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/); return m ? m[1] : url; }

/* ---------- fetch ---------- */
function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading = false; hasMore = true; lastDoc = null; loadedIds.clear(); currentActive = null;
}
async function loadMore(initial=false){
  if(isLoading || !hasMore) return;
  if(selected === null){ if(initial) showHint("카테고리를 선택하세요."); return; }
  isLoading = true;
  try{
    const base = collection(db, "videos");
    const parts = [];
    if(selected === "ALL"){ parts.push(orderBy("createdAt","desc")); }
    else if(Array.isArray(selected) && selected.length){
      const cats = selected.length > 10 ? null : selected;
      if(cats){ parts.push(where("categories","array-contains-any", cats)); parts.push(orderBy("createdAt","desc")); }
      else { parts.push(orderBy("createdAt","desc")); }
    }
    if(lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const q = query(base, ...parts);
    const snap = await getDocs(q);

    if(snap.docs.length === 0){ if(initial) showHint("해당 카테고리 영상이 없습니다."); hasMore=false; isLoading=false; return; }

    snap.docs.forEach(d=>{
      if(loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      const data = d.data();
      videoContainer.appendChild(makeCard(data.url, d.id));
    });

    lastDoc = snap.docs[snap.docs.length-1];
    if(snap.docs.length < PAGE_SIZE) hasMore = false;
  }catch(e){ console.error(e); if(initial) showHint("목록을 불러오지 못했습니다."); }
  finally{ isLoading = false; }
}
videoContainer.addEventListener('scroll', ()=>{ const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200; if(nearBottom) loadMore(false); });

resetFeed(); loadMore(true);
