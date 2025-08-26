// js/watch.js  (v1.0 base + category expansion & unlimited multi-select & exclude support)
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { CATEGORY_GROUPS } from './categories.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- viewport fix ---------- */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh(); addEventListener('resize', updateVh, {passive:true}); addEventListener('orientationchange', updateVh, {passive:true});

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

/* ---------- topbar auto hide ---------- */
const HIDE_DELAY_MS=1000; let hideTimer=null;
function showTopbar(){ topbar.classList.remove('hide'); if(hideTimer) clearTimeout(hideTimer); if(!isMenuOpen){ hideTimer=setTimeout(()=> topbar.classList.add('hide'), HIDE_DELAY_MS); } }
['scroll','wheel','mousemove','keydown','pointermove','touchmove'].forEach(ev=>{
  const tgt = ev==='scroll' ? videoContainer : window;
  tgt.addEventListener(ev, ()=>{ if(!isMenuOpen) showTopbar(); }, {passive:true});
});

/* ---------- category maps (group -> children) ---------- */
const groupToChildren = new Map(CATEGORY_GROUPS.map(g => [g.key, g.children.map(c=>c.value)]));
const validChildren = new Set(CATEGORY_GROUPS.flatMap(g=> g.children.map(c=>c.value)));

/* ---------- selection parsing ---------- */
/* 읽기 순서:
   1) ?cats=... 있으면 최우선 (쉼표구분, -또는! 접두어는 제외 의미)
   2) localStorage('selectedCats') 사용 ("ALL" | 배열 | 문자열)
   3) 결과를 group/child 토큰으로 해석 → { include:Set(child), exclude:Set(child) } 로 확장
*/
function rawSelectedFromStorage(){
  // querystring 우선
  try{
    const qs = new URLSearchParams(location.search);
    const cats = qs.get('cats');
    if(cats){
      return cats.split(',').map(s=>s.trim()).filter(Boolean);
    }
  }catch{}

  // localStorage
  const raw = localStorage.getItem('selectedCats');
  if(raw == null) return "ALL";
  try{
    const v = JSON.parse(raw);
    if(v === "ALL") return "ALL";
    if(Array.isArray(v)) return v.filter(Boolean);
    if(typeof v === 'string' && v && v !== 'ALL') return [v];
  }catch{
    if(raw && raw !== 'ALL'){
      if(raw.includes(',')) return raw.split(',').map(s=>s.trim()).filter(Boolean);
      return [raw.trim()];
    }
  }
  return "ALL";
}

function resolveSelectionTokens(raw){
  const include = new Set();
  const exclude = new Set();

  if(raw === "ALL") return { include, exclude };

  const toks = Array.isArray(raw) ? raw : [raw];
  for(let t of toks){
    if(!t) continue;
    let neg=false;
    if(t[0]==='-' || t[0]==='!'){ neg=true; t=t.slice(1); }
    if(!t) continue;

    // group?
    if(groupToChildren.has(t)){
      const kids = groupToChildren.get(t);
      kids.forEach(v => (neg ? exclude.add(v) : include.add(v)));
      continue;
    }
    // child?
    if(validChildren.has(t)){
      neg ? exclude.add(t) : include.add(t);
    }
    // 모르는 토큰은 무시
  }

  // 로컬 개인자료 값은 강제 제외
  exclude.add('personal1'); exclude.add('personal2');

  return { include, exclude };
}

function getSelection(){ return resolveSelectionTokens(rawSelectedFromStorage()); }

const AUTO_NEXT = localStorage.getItem('autonext')==='on';

/* ---------- YouTube control ---------- */
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

/* gesture capture */
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

/* ---------- feed ---------- */
const PAGE_SIZE=10;
let isLoading=false, lastDoc=null, hasMore=true;
const loadedIds=new Set();

/* >10 include 대응용 */
let chunkMode=false;
let includeChunks=[];     // [[..10], [..10], ...]
let chunkCursors=[];      // 각 청크 커서
let chunkDone=[];         // 각 청크 완료 여부
let bufferDocs=[];        // 머지 결과 중 아직 미표시

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML="";
  isLoading=false; hasMore=true; lastDoc=null;
  loadedIds.clear(); currentActive=null;

  chunkMode=false; includeChunks=[]; chunkCursors=[]; chunkDone=[]; bufferDocs=[];
}

function createdAtMs(v){
  if(!v) return 0;
  if(typeof v.toMillis === 'function') return v.toMillis();
  if(typeof v.seconds === 'number') return v.seconds*1000 + (v.nanoseconds||0)/1e6;
  if(v instanceof Date) return v.getTime();
  if(typeof v === 'number') return v;
  return 0;
}
function makeChunks(arr, n=10){ const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; }
function docPassesExclude(data, excludeSet){
  const cats = Array.isArray(data?.categories) ? data.categories : [];
  for(const c of cats){ if(excludeSet.has(c)) return false; }
  return true;
}

async function loadMore(initial=false){
  if(isLoading || !hasMore) return;
  isLoading=true;
  const sel = getSelection();
  const base = collection(db,"videos");

  try{
    // ===== case A: include 아무것도 없음 (ALL 또는 exclude-only) =====
    if(sel.include.size === 0){
      // createdAt desc 순으로 긁되 exclude는 클라이언트에서 걸러냄
      let appended=0;
      while(appended < PAGE_SIZE && hasMore){
        const parts=[orderBy("createdAt","desc")];
        if(lastDoc) parts.push(startAfter(lastDoc));
        parts.push(limit(PAGE_SIZE));
        const snap = await getDocs(query(base, ...parts));
        if(snap.empty){ hasMore=false; break; }

        lastDoc = snap.docs[snap.docs.length-1] || lastDoc;

        for(const d of snap.docs){
          if(loadedIds.has(d.id)) continue;
          const data = d.data();
          if(!docPassesExclude(data, sel.exclude)) continue; // 제외 카테고리 skip
          loadedIds.add(d.id);
          videoContainer.appendChild(makeCard(data.url, d.id));
          appended++;
          if(appended >= PAGE_SIZE) break;
        }
        if(snap.size < PAGE_SIZE){ hasMore=false; }
        if(snap.size === 0) break;
        // while 루프는 필요한 만큼만 추가 fetch
      }
      if(initial && videoContainer.children.length===0){
        videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
      }
      return;
    }

    // ===== case B: include 1~10 (단일 where) =====
    if(sel.include.size <= 10){
      const parts=[ where("categories","array-contains-any", Array.from(sel.include)), orderBy("createdAt","desc") ];
      if(lastDoc) parts.push(startAfter(lastDoc));
      parts.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(base, ...parts));

      if(snap.empty){
        if(initial) videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
        hasMore=false; return;
      }

      let appended=0;
      for(const d of snap.docs){
        if(loadedIds.has(d.id)) continue;
        const data = d.data();
        if(!docPassesExclude(data, sel.exclude)) continue;
        loadedIds.add(d.id);
        videoContainer.appendChild(makeCard(data.url, d.id));
        appended++;
      }
      lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
      if(snap.size < PAGE_SIZE && appended===0) hasMore=false;
      return;
    }

    // ===== case C: include 11+ (청크 병렬 머지) =====
    if(!chunkMode){
      chunkMode   = true;
      includeChunks = makeChunks(Array.from(sel.include), 10);
      chunkCursors  = new Array(includeChunks.length).fill(null);
      chunkDone     = new Array(includeChunks.length).fill(false);
      bufferDocs    = [];
    }

    // buffer 먼저 소진
    if(bufferDocs.length > 0){
      const slice = bufferDocs.splice(0, PAGE_SIZE);
      slice.forEach(d=>{
        if(loadedIds.has(d.id)) return;
        loadedIds.add(d.id);
        videoContainer.appendChild(makeCard(d.url, d.id));
      });
      hasMore = bufferDocs.length > 0 || chunkDone.some(done=>!done);
      return;
    }

    // 각 청크에서 1페이지씩 병렬 수집
    const promises = includeChunks.map((cats, idx)=>{
      if(chunkDone[idx]) return Promise.resolve({ idx, snap:null });
      const parts=[ where("categories","array-contains-any", cats), orderBy("createdAt","desc") ];
      if(chunkCursors[idx]) parts.push(startAfter(chunkCursors[idx]));
      parts.push(limit(PAGE_SIZE));
      return getDocs(query(base, ...parts)).then(snap=>({ idx, snap }));
    });

    const results = await Promise.all(promises);
    let merged = [];

    results.forEach(({idx, snap})=>{
      if(!snap){ return; }
      if(snap.empty){ chunkDone[idx] = true; return; }

      chunkCursors[idx] = snap.docs[snap.docs.length-1];
      if(snap.size < PAGE_SIZE) chunkDone[idx] = true;

      snap.docs.forEach(d=>{
        const data = d.data();
        if(!docPassesExclude(data, sel.exclude)) return;
        merged.push({ id:d.id, url:data.url, createdAt:data.createdAt });
      });
    });

    // 중복 제거 + 시간 역정렬
    const seen = new Set();
    merged = merged.filter(x=> (seen.has(x.id) ? false : (seen.add(x.id), true)));
    merged.sort((a,b)=> createdAtMs(b.createdAt) - createdAtMs(a.createdAt));

    if(merged.length===0){
      if(initial && videoContainer.children.length===0){
        videoContainer.innerHTML = `<div class="video"><p class="playhint" style="position:static;margin:0 auto;">해당 카테고리 영상이 없습니다.</p></div>`;
      }
      hasMore = chunkDone.some(done=>!done);
      return;
    }

    const slice = merged.slice(0, PAGE_SIZE);
    bufferDocs = merged.slice(PAGE_SIZE);

    slice.forEach(d=>{
      if(loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      videoContainer.appendChild(makeCard(d.url, d.id));
    });

    hasMore = bufferDocs.length > 0 || chunkDone.some(done=>!done);
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
