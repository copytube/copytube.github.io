import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ---------- 뷰포트 높이 보정 ---------- */
function updateVh(){ document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`); }
updateVh(); window.addEventListener('resize', updateVh); window.addEventListener('orientationchange', updateVh);

/* ---------- DOM ---------- */
const topbar   = document.getElementById("topbar");
const menuBtn  = document.getElementById("menuBtn");
const dropdown = document.getElementById("dropdownMenu");
const btnGoCategory = document.getElementById("btnGoCategory");
const btnGoUpload   = document.getElementById("btnGoUpload");
const btnMyUploads  = document.getElementById("btnMyUploads");
const btnAbout      = document.getElementById("btnAbout");
const welcome       = document.getElementById("welcome");
const videoContainer= document.getElementById("videoContainer");

/* 로그인 표기 */
onAuthStateChanged(auth, (user)=>{
  welcome.textContent = user ? `안녕하세요, ${user.displayName||'회원'}님` : '';
});

/* ---------- 드롭다운 (밖 클릭 시 닫힘) ---------- */
let isMenuOpen = false;
function openDropdown(){ isMenuOpen = true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen = false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"), 180); }

menuBtn.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden")?openDropdown():closeDropdown(); });
// 바깥 클릭/터치로 닫기
document.addEventListener('pointerdown',(e)=>{
  if (dropdown.classList.contains('hidden')) return;
  const inside = e.target.closest('#dropdownMenu, #menuBtn');
  if (!inside) closeDropdown();
},{capture:true});
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });

btnGoCategory?.addEventListener("click", ()=>{ location.href = "index.html"; closeDropdown(); });
btnGoUpload?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
btnMyUploads?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnAbout?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });

/* ---------- 상단바 자동 숨김 (1초) + 이동 시에도 잠깐 표시 ---------- */
let hideTimer=null;
function showTopbarTemp(){ topbar.classList.remove('hide'); scheduleHide(); }
function scheduleHide(){ if(hideTimer) clearTimeout(hideTimer); hideTimer=setTimeout(()=> topbar.classList.add('hide'), 1000); }
function cancelHide(){ if(hideTimer) clearTimeout(hideTimer); }

topbar.classList.add('autohide');
showTopbarTemp();

// 바깥(iframe 외부) 입력 시 표시
['scroll','wheel','touchstart','mousemove','keydown'].forEach(ev=>{
  const target = ev==='scroll' ? videoContainer : window;
  target.addEventListener(ev, ()=>{ if(!isMenuOpen){ showTopbarTemp(); } }, { passive:true });
});

// 메뉴 버튼 누르면 실제로도 동의했다고 가정(사용성 개선)
menuBtn.addEventListener('pointerdown', ()=> { userSoundConsent = true; });

/* ---------- 선택 카테고리 ---------- */
function getSelected(){
  try{ return JSON.parse(localStorage.getItem('selectedCats')||'"ALL"'); }
  catch{ return "ALL"; }
}

/* ---------- YouTube 제어 & 무음 유지 ---------- */
function ytCmd(iframe, func, args = []){ if(iframe?.contentWindow){ iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*"); } }
function ytListen(iframe, id){
  try{
    // infoDelivery/상태 이벤트 수신하도록 handshake
    iframe.contentWindow.postMessage(JSON.stringify({ event:"listening", id }), "*");
    ytCmd(iframe, "addEventListener", ["onStateChange"]);
    ytCmd(iframe, "addEventListener", ["onApiChange"]);
  }catch{}
}

let userSoundConsent=false;
let currentActive=null;

// YouTube가 보내는 메시지를 수신하여 '언뮤트' 감지 → 동의 true 전환
window.addEventListener('message', (ev)=>{
  // 안전하게 파싱
  let data;
  try { data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; }
  catch { return; }
  if (!data) return;
  // infoDelivery에서 muted:false 또는 volume>0이면 동의 true
  if (data.event === 'infoDelivery' && data.info){
    if (data.info.muted === false) userSoundConsent = true;
    if (typeof data.info.volume === 'number' && data.info.volume > 0) userSoundConsent = true;
  }
});

/* ---------- 활성 영상 IO ---------- */
const activeIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    const card = entry.target;
    const iframe = card.querySelector('iframe');

    if(entry.isIntersecting && entry.intersectionRatio > 0.6){
      // 이전 카드 정리
      if(currentActive && currentActive !== card){
        const prev = currentActive.querySelector('iframe');
        if(prev){ ytCmd(prev,"mute"); ytCmd(prev,"pauseVideo"); }
      }

      currentActive = card;
      ensureIframe(card);

      // 이동할 때마다 상단바 잠깐 보여주기
      showTopbarTemp();

      const ifr = card.querySelector('iframe');
      if (ifr){
        ytCmd(ifr,"playVideo");
        if (userSoundConsent){
          ytCmd(ifr,"unMute");
          ytCmd(ifr,"setVolume",[100]);
        }else{
          ytCmd(ifr,"mute");
        }
      }
    } else {
      if (iframe){ ytCmd(iframe,"mute"); ytCmd(iframe,"pauseVideo"); }
    }
  });
},{ root: videoContainer, threshold:[0,0.6,1] });

/* ---------- 렌더 ---------- */
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
        위로 스와이프 • 탭/스크롤/키 입력 시 소리 허용
      </div>
    </div>`;

  // 카드(썸네일) 클릭 시 동의 true + 바로 언뮤트
  card.addEventListener('click', ()=>{
    ensureIframe(card);
    const ifr = card.querySelector('iframe');
    userSoundConsent = true;
    if (ifr){ ytCmd(ifr,"playVideo"); ytCmd(ifr,"unMute"); ytCmd(ifr,"setVolume",[100]); }
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
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  Object.assign(iframe.style, { width:"100%", height:"100%", border:"0" });

  const thumb = card.querySelector('.thumb');
  if(thumb) card.replaceChild(iframe, thumb);

  // 유튜브 메시지 수신 보장 위한 handshake
  ytListen(iframe, card.dataset.docId || id);
}

function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([^?&/]+)/);
  return m ? m[1] : url;
}

/* ---------- 데이터 로드 ---------- */
const PAGE_SIZE = 12;
let isLoading=false, hasMore=true, lastDoc=null, loadedIds=new Set();

function resetFeed(){
  document.querySelectorAll('#videoContainer .video').forEach(el=> activeIO.unobserve(el));
  videoContainer.innerHTML = "";
  isLoading=false; hasMore=true; lastDoc=null; loadedIds.clear(); currentActive=null;
}
async function loadMore(initial=false){
  if(isLoading || !hasMore) return;
  const selected = getSelected();
  if(selected === null){ if(initial) showHint("카테고리를 선택하세요."); return; }
  isLoading = true;
  try{
    const base = collection(db, "videos");
    const parts = [];
    if(selected === "ALL"){
      parts.push(orderBy("createdAt","desc"));
    }else if(Array.isArray(selected) && selected.length){
      const cats = selected.length > 10 ? null : selected;
      if(cats){
        parts.push(where("categories","array-contains-any", cats));
        parts.push(orderBy("createdAt","desc"));
      }else{
        parts.push(orderBy("createdAt","desc"));
      }
    }
    if(lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const q = query(base, ...parts);
    const snap = await getDocs(q);
    if(snap.docs.length === 0){ if(initial) showHint("영상이 없습니다."); hasMore=false; isLoading=false; return; }

    snap.docs.forEach(d=>{
      if(loadedIds.has(d.id)) return;
      loadedIds.add(d.id);
      const data = d.data();
      videoContainer.appendChild(makeCard(data.url, d.id));
    });
    lastDoc = snap.docs[snap.docs.length-1];
    if(snap.docs.length < PAGE_SIZE) hasMore=false;
  }catch(e){
    console.error(e);
    if(initial) showHint("목록을 불러오지 못했습니다.");
  }finally{
    isLoading=false;
  }
}
videoContainer.addEventListener('scroll', ()=>{
  const nearBottom = videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 200;
  if(nearBottom) loadMore(false);
});

/* 시작 */
resetFeed();
loadMore(true);
