// js/upload.js (v1.7.1-xss-safe)
// - XSS 방어: 카테고리 렌더에서 innerHTML 미사용(모두 createElement/textContent)
// - 개인 라벨 추가 방어: 길이/문자 제한 + DOM 주입 차단
// - URL 화이트리스트(YouTube/https만) — javascript:, data: 등 차단
// - 기존 기능/UX, Firestore 스키마(uid) 그대로 유지
import { auth, db } from './firebase-init.js?v=1.5.1';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=1.5.1';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js?v=1.5.1';

/* ------- 전역 내비 중복 방지 ------- */
window.__swipeNavigating = window.__swipeNavigating || false;

/* ------- 상단바/드롭다운 ------- */
const $ = (s)=>document.querySelector(s);
const signupLink = $('#signupLink');
const signinLink = $('#signinLink');
const welcome    = $('#welcome');
const menuBtn    = $('#menuBtn');
const dropdown   = $('#dropdownMenu');
const btnSignOut = $('#btnSignOut');
const btnGoUpload= $('#btnGoUpload');
const btnMyUploads = $('#btnMyUploads');
const btnAbout   = $('#btnAbout');
const btnList    = $('#btnList');

function openDropdown(){ dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'), 180); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `ThankU ${user.displayName||'회원'}!!` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());
btnGoUpload ?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnAbout    ?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnList     ?.addEventListener('click', ()=>{ location.href='list.html'; closeDropdown(); });
btnSignOut  ?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

/* ------- 공통 키 ------- */
const GROUP_ORDER_KEY      = 'groupOrderV1';
const PERSONAL_LABELS_KEY  = 'personalLabels';
const isPersonal = (v)=> v==='personal1' || v==='personal2';

/* ------- 메시지 ------- */
const msgTop = $('#msgTop');
const msg    = $('#msg');
function setMsg(t){ if(msgTop) msgTop.textContent=t||''; if(msg) msg.textContent=t||''; }

/* ------- 개인 라벨 ------- */
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem(PERSONAL_LABELS_KEY)||'{}'); }catch{ return {}; }
}
function setPersonalLabel(key,label){
  let s = String(label||'').replace(/\r\n?/g,'\n').trim();
  // 길이, 금지문자(꺾쇠/따옴표) 제거 — 추가 방어
  s = s.slice(0,12).replace(/[<>"]/g,'').replace(/[\u0000-\u001F]/g,'');
  const map = getPersonalLabels();
  map[key] = s;
  localStorage.setItem(PERSONAL_LABELS_KEY, JSON.stringify(map));
}

/* ------- 그룹 순서 적용 ------- */
function applyGroupOrder(groups){
  let saved=null; try{ saved=JSON.parse(localStorage.getItem(GROUP_ORDER_KEY)||'null'); }catch{}
  const order = Array.isArray(saved)? saved : [];
  if(!order.length) return groups.slice();
  const byKey = new Map(groups.map(g=>[g.key,g]));
  const sorted = order.map(k=> byKey.get(k)).filter(Boolean);
  groups.forEach(g=>{ if(!order.includes(g.key)) sorted.push(g); });
  return sorted;
}

/* ------- 카테고리 렌더 (XSS-safe: DOM API만 사용) ------- */
const catsBox = $('#cats');

function renderCats(){
  try{
    if(!Array.isArray(CATEGORY_GROUPS) || !CATEGORY_GROUPS.length){
      setMsg('카테고리 정의(CATEGORY_GROUPS)가 비어 있습니다. js/categories.js 확인 필요.');
      return;
    }
  }catch(e){
    setMsg('카테고리 로드 실패: js/categories.js import 에러');
    return;
  }

  const personalLabels = getPersonalLabels();
  const groups = applyGroupOrder(CATEGORY_GROUPS);

  // 기존 innerHTML 사용 → 모두 제거
  catsBox.replaceChildren(); // 안전하게 초기화

  const frag = document.createDocumentFragment();

  for (const g of groups){
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'group';
    fieldset.dataset.key = g.key;

    const legend = document.createElement('legend');
    legend.textContent = g.key === 'personal' ? `${g.label} ` : g.label;
    fieldset.appendChild(legend);

    if (g.key === 'personal'){
      const sub = document.createElement('span');
      sub.className = 'subnote';
      sub.textContent = '(로컬저장소)';
      legend.appendChild(sub);
    }

    const grid = document.createElement('div');
    grid.className = 'child-grid';
    fieldset.appendChild(grid);

    for (const c of g.children){
      const label = document.createElement('label');

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'cat';
      input.value = c.value;

      const text = document.createTextNode(' ' + (g.key==='personal' && personalLabels[c.value] ? personalLabels[c.value] : c.label));

      label.appendChild(input);
      label.appendChild(text);

      if (g.key==='personal'){
        const btn = document.createElement('button');
        btn.className = 'rename-btn';
        btn.type = 'button';
        btn.dataset.key = c.value;
        btn.textContent = '이름변경';
        btn.addEventListener('click', ()=>{
          const key = btn.getAttribute('data-key');
          const cur = getPersonalLabels()[key] || (key==='personal1'?'자료1':'자료2');
          const name = prompt('개인자료 이름(최대 12자):', cur);
          if(!name) return;
          setPersonalLabel(key, name);
          renderCats();
        });
        // 공백 추가
        label.appendChild(document.createTextNode(' '));
        label.appendChild(btn);
      }

      grid.appendChild(label);
    }

    if (g.key==='personal'){
      const note = document.createElement('div');
      note.className = 'muted';
      note.style.margin = '6px 4px 2px';
      // 텍스트만
      note.textContent = '개인자료는 단독 등록/재생만 가능합니다.';
      fieldset.appendChild(note);
    }

    frag.appendChild(fieldset);
  }

  catsBox.appendChild(frag);

  // 선택 제약
  catsBox.querySelectorAll('input.cat').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const v = chk.value;
      if(isPersonal(v) && chk.checked){
        catsBox.querySelectorAll('input.cat').forEach(x=>{ if(x!==chk) x.checked=false; });
        setMsg('개인자료는 단독으로만 등록/재생됩니다.');
        return;
      }
      if(!isPersonal(v) && chk.checked){
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(x=> x.checked=false);
        const normals = Array.from(catsBox.querySelectorAll('input.cat:checked'))
          .map(x=>x.value).filter(x=>!isPersonal(x));
        if(normals.length>3){ chk.checked=false; setMsg('카테고리는 최대 3개까지 선택 가능합니다.'); return; }
      }
      setMsg('');
    });
  });
}
renderCats();

/* ------- URL 유틸 ------- */
const urlsBox = $('#urls');
function parseUrls(){ return urlsBox.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
function extractId(url){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/); return m?m[1]:''; }

// (XSS/악성 URL 방지) — https + YouTube만 허용
const YT_WHITELIST = /^(https:\/\/(www\.)?youtube\.com\/(watch\?v=|shorts\/)|https:\/\/youtu\.be\/)/i;

/* ------- 제목 가져오기: oEmbed ------- */
async function fetchTitleById(id){
  if(!id) return '';
  try{
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(`https://www.youtube.com/watch?v=${id}`));
    if(!res.ok) throw 0;
    const data = await res.json();
    return String(data?.title || '').slice(0,200);
  }catch{ return ''; }
}

/* ------- 붙여넣기 ------- */
$('#btnPaste')?.addEventListener('click', async ()=>{
  try{
    const txt = await navigator.clipboard.readText();
    if(!txt){ setMsg('클립보드가 비어있습니다.'); return; }
    urlsBox.value = (urlsBox.value.trim()? (urlsBox.value.replace(/\s*$/,'')+'\n') : '') + txt.trim();
    setMsg('붙여넣기 완료.');
  }catch{
    setMsg('클립보드 접근이 차단되었습니다. 브라우저 설정에서 허용해 주세요.');
  }
});

/* ------- 등록 ------- */
function getOrderValue(){ return document.querySelector('input[name="order"]:checked')?.value || 'bottom'; }

async function submitAll(){
  setMsg('검사 중...');
  const user = auth.currentUser;
  if(!user){ setMsg('로그인 후 이용하세요.'); return; }

  const lines = parseUrls();
  if(!lines.length){ setMsg('URL을 한 줄에 하나씩 입력해 주세요.'); return; }

  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  if(!selected.length){ setMsg('카테고리를 최소 1개 선택해 주세요.'); return; }

  const personals = selected.filter(isPersonal);
  const normals   = selected.filter(v=> !isPersonal(v));

  // A) 개인자료 단독 → 로컬 저장
  if(personals.length===1 && normals.length===0){
    const slot = personals[0]; // 'personal1' | 'personal2'
    const key  = `copytube_${slot}`;
    let arr=[]; try{ arr=JSON.parse(localStorage.getItem(key)||'[]'); }catch{ arr=[]; }
    let added=0;
    for(const raw of lines){
      if(!YT_WHITELIST.test(raw)) { continue; } // 안전하지 않은 URL 차단
      if(!extractId(raw)) continue;
      arr.push({ url: raw, savedAt: Date.now() });
      added++;
    }
    localStorage.setItem(key, JSON.stringify(arr));
    urlsBox.value='';
    document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false);
    setMsg(`로컬 저장 완료: ${added}건 (${slot==='personal1'?'개인자료1':'개인자료2'})`);
    return;
  }

  // 혼합 금지
  if(personals.length>=1 && normals.length>=1){
    setMsg('개인자료는 다른 카테고리와 함께 선택할 수 없습니다.');
    return;
  }

  // B) 일반 카테고리 → Firestore
  if(normals.length===0){
    setMsg('카테고리를 최소 1개 선택해 주세요.');
    return;
  }
  if(normals.length>3){
    setMsg('카테고리는 최대 3개까지 선택 가능합니다.');
    return;
  }

  const order = getOrderValue();
  const list  = (order==='bottom') ? lines.slice().reverse() : lines.slice();

  setMsg(`등록 중... (0/${list.length})`);
  let ok=0, fail=0;

  // 순차 처리(간단/안전)
  for(let i=0;i<list.length;i++){
    const url = list[i];

    // 안전 URL 검사
    if(!YT_WHITELIST.test(url)){ fail++; setMsg(`YouTube 링크만 등록할 수 있습니다. (${ok+fail}/${list.length})`); continue; }

    const id  = extractId(url);
    if(!id){ fail++; setMsg(`등록 중... (${ok+fail}/${list.length})`); continue; }

    // 제목 oEmbed — 실패해도 진행
    let title = '';
    try{ title = await fetchTitleById(id); }catch{}

    try{
      const docData = {
        url,
        ...(title ? { title } : {}),     // 빈 문자열이면 필드 생략
        categories: normals,
        uid: user.uid,                   // (레거시 스키마 유지) — 규칙 ownerOf()가 uid/ownerUid 모두 수용
        createdAt: serverTimestamp(),
        // thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
      await addDoc(collection(db,'videos'), docData);
      ok++;
    }catch(e){
      console.error('[upload] addDoc failed:', e?.code, e?.message, e);
      fail++;
    }
    setMsg(`등록 중... (${ok+fail}/${list.length})`);
  }

  setMsg(`완료: 성공 ${ok}건, 실패 ${fail}건`);
  if(ok){ urlsBox.value=''; document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false); }
}

$('#btnSubmitTop')   ?.addEventListener('click', submitAll);
$('#btnSubmitBottom')?.addEventListener('click', submitAll);

// 디버깅 힌트
try{
  console.debug('[upload] CATEGORY_GROUPS keys:', CATEGORY_GROUPS.map(g=>g.key));
  console.debug('[upload] groupOrderV1:', localStorage.getItem('groupOrderV1'));
}catch{}

/* ===================== */
/* Slide-out CSS (단순형/백업용) */
/* ===================== */
(function injectSlideCSS(){
  if (document.getElementById('slide-css-152')) return;
  const style = document.createElement('style');
  style.id = 'slide-css-152';
  style.textContent = `
@keyframes pageSlideLeft { from { transform: translateX(0); opacity:1; } to { transform: translateX(-22%); opacity:.92; } }
@keyframes pageSlideRight{ from { transform: translateX(0); opacity:1; } to { transform: translateX(22%);  opacity:.92; } }
:root.slide-out-left  body { animation: pageSlideLeft 0.26s ease forwards; }
:root.slide-out-right body { animation: pageSlideRight 0.26s ease forwards; }
@media (prefers-reduced-motion: reduce){
  :root.slide-out-left  body,
  :root.slide-out-right body { animation:none; }
}`;
  document.head.appendChild(style);
})();

/* ===================== */
/* 단순형 스와이프 정의(중앙 30% 데드존 추가) — 호출 안 함 */
/* ===================== */
function simpleSwipeNav({ goLeftHref=null, goRightHref=null, animateMs=260, deadZoneCenterRatio=0.30 } = {}){
  let sx=0, sy=0, t0=0, tracking=false;
  const THRESH_X = 70, MAX_OFF_Y = 80, MAX_TIME = 600;

  const getPoint = (e) => e.touches?.[0] || e.changedTouches?.[0] || e;

  function onStart(e){
    const p = getPoint(e);
    if(!p) return;

    // 중앙 데드존
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const dz = Math.max(0, Math.min(0.9, deadZoneCenterRatio));
    const L  = vw * (0.5 - dz/2);
    const R  = vw * (0.5 + dz/2);
    if (p.clientX >= L && p.clientX <= R) { tracking = false; return; }

    sx = p.clientX; sy = p.clientY; t0 = Date.now(); tracking = true;
  }
  function onEnd(e){
    if(!tracking) return; tracking = false;
    if (window.__swipeNavigating) return;

    const p = getPoint(e);
    const dx = p.clientX - sx;
    const dy = p.clientY - sy;
    const dt = Date.now() - t0;
    if (Math.abs(dy) > MAX_OFF_Y || dt > MAX_TIME) return;

    if (dx <= -THRESH_X && goLeftHref){
      window.__swipeNavigating = true;
      document.documentElement.classList.add('slide-out-left');
      setTimeout(()=> location.href = goLeftHref, animateMs);
    } else if (dx >= THRESH_X && goRightHref){
      window.__swipeNavigating = true;
      document.documentElement.classList.add('slide-out-right');
      setTimeout(()=> location.href = goRightHref, animateMs);
    }
  }
  document.addEventListener('touchstart', onStart, { passive:true });
  document.addEventListener('touchend',   onEnd,   { passive:true });
  document.addEventListener('pointerdown',onStart, { passive:true });
  document.addEventListener('pointerup',  onEnd,   { passive:true });
}

/* ===================== */
/* 고급형 스와이프 — 끌리는 모션 + 방향 잠금 + 중앙 데드존(15%) */
/* ===================== */
(function(){
  function initDragSwipe({ goLeftHref=null, goRightHref=null, threshold=60, slop=45, timeMax=700, feel=1.0, deadZoneCenterRatio=0.15 }={}){
    const page = document.querySelector('main') || document.body;
    if(!page) return;

    // 드래그 성능 힌트
    if(!page.style.willChange || !page.style.willChange.includes('transform')){
      page.style.willChange = (page.style.willChange ? page.style.willChange + ', transform' : 'transform');
    }

    let x0=0, y0=0, t0=0, active=false, canceled=false;
    const isInteractive = (el)=> !!(el && (el.closest('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')));

    function reset(anim=true){
      if(anim) page.style.transition = 'transform 180ms ease';
      requestAnimationFrame(()=>{ page.style.transform = 'translateX(0px)'; });
      setTimeout(()=>{ if(anim) page.style.transition = ''; }, 200);
    }

    function start(e){
      if (window.__swipeNavigating) return;
      const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      if(isInteractive(e.target)) return;

      // 중앙 데드존
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const dz = Math.max(0, Math.min(0.9, deadZoneCenterRatio));
      const L  = vw * (0.5 - dz/2);
      const R  = vw * (0.5 + dz/2);
      if (t.clientX >= L && t.clientX <= R) return;

      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
      active = true; canceled = false;
      page.style.transition = 'none';
    }

    function move(e){
      if(!active) return;
      const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
      if(!t) return;

      const dx = t.clientX - x0;
      const dy = t.clientY - y0;

      if(Math.abs(dy) > slop){
        canceled = true; active = false;
        reset(true);
        return;
      }

      // 방향 잠금: upload는 오른쪽으로만 이동 허용(goRightHref만 설정)
      let dxAdj = dx;
      if (dx < 0) dxAdj = 0; // 왼쪽 이동 완전 차단
      if (dxAdj === 0){
        page.style.transform = 'translateX(0px)';
        return;
      }

      e.preventDefault(); // 수평 제스처 시 스크롤 방지
      page.style.transform = 'translateX(' + (dxAdj * feel) + 'px)';
    }

    function end(e){
      if(!active) return; active = false;
      const t = (e.changedTouches && e.changedTouches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      const dt = Date.now() - t0;

      if(canceled || Math.abs(dy) > slop || dt > timeMax){
        reset(true);
        return;
      }

      // 오른쪽 스와이프만 성공 처리
      if(dx >= threshold && goRightHref){
        window.__swipeNavigating = true;
        page.style.transition = 'transform 160ms ease';
        page.style.transform  = 'translateX(100vw)';
        setTimeout(()=>{ location.href = goRightHref; }, 150);
      } else {
        reset(true);
      }
    }

    // 터치 & 포인터 (end/up은 capture:true 권장)
    document.addEventListener('touchstart',  start, { passive:true });
    document.addEventListener('touchmove',   move,  { passive:false });
    document.addEventListener('touchend',    end,   { passive:true, capture:true });

    document.addEventListener('pointerdown', start, { passive:true });
    document.addEventListener('pointermove', move,  { passive:false });
    document.addEventListener('pointerup',   end,   { passive:true, capture:true });
  }

  // upload: 오른쪽으로 스와이프하면 index로 (왼쪽은 아예 안 움직임)
  initDragSwipe({ goLeftHref: null, goRightHref: 'index.html', threshold:60, slop:45, timeMax:700, feel:1.0, deadZoneCenterRatio: 0.15 });
})();
// ===== URLFIND (모달 + 파서 + 폼적용) =====
(function(){
  const dlg = document.getElementById('dlg-urlfind');
  const ta = document.getElementById('urlfind-input');
  const btnParse = document.getElementById('urlfind-parse');
  const btnApply = document.getElementById('urlfind-apply');
  const btnCancel = document.getElementById('urlfind-cancel');
  const list = document.getElementById('urlfind-list');
  const chkMeta = document.getElementById('urlfind-meta');

  // 드롭다운 메뉴에서 열기 (HTML에 항목이 없으면 동적으로 추가)
  const menuContainer = document.querySelector('.dropdown .menu, .menu, #menu, #moreMenu');
  if(menuContainer && !menuContainer.querySelector('[data-cmd="urlfind"]')){
    const btn = document.createElement('button');
    btn.className = 'menu-item';
    btn.dataset.cmd = 'urlfind';
    btn.textContent = 'URL 가져오기…';
    menuContainer.appendChild(btn);
  }
  document.addEventListener('click', (e)=>{
    const t = e.target.closest('[data-cmd="urlfind"]');
    if(t){ e.preventDefault(); openModal(); }
  });

  function openModal(){
    if(!dlg) return;
    dlg.classList.remove('hidden');
    ta && ta.focus();
  }
  function closeModal(){
    dlg && dlg.classList.add('hidden');
    ta && (ta.value = '');
    list && (list.innerHTML = '');
    btnApply && (btnApply.disabled = true);
  }
  btnCancel && btnCancel.addEventListener('click', closeModal);

  btnParse && btnParse.addEventListener('click', async ()=>{
    const lines = (ta.value || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const parsed = uniqBy(
      lines.map(parseYouTubeURL).filter(Boolean),
      x => x.videoId
    );
    if(parsed.length === 0){
      list.innerHTML = '<div class="muted">유효한 유튜브 URL이 없습니다.</div>';
      btnApply.disabled = true;
      return;
    }

    // (선택) 메타데이터 채우기
    if(chkMeta.checked){
      await Promise.all(parsed.map(async it=>{
        // 1) API 키가 있으면 사용
        if(window.YT_API_KEY){
          try{
            const meta = await fetchByYouTubeAPI(it.videoId, window.YT_API_KEY);
            it.title = meta?.title || it.title;
            it.channelTitle = meta?.channelTitle || it.channelTitle;
            it.publishedAt = meta?.publishedAt || it.publishedAt;
            return;
          }catch(_){}
        }
        // 2) oEmbed fallback
        try{
          const om = await fetchByOEmbed(it.videoId);
          it.title = om?.title || it.title;
          it.channelTitle = om?.author_name || it.channelTitle;
        }catch(_){}
      }));
    }

    renderList(parsed);
    btnApply.disabled = false;

    // 적용 버튼
    btnApply.onclick = ()=>{
      const chosen = [...list.querySelectorAll('input[type="checkbox"]:checked')].map(cb=>{
        const vid = cb.dataset.id;
        return parsed.find(x=>x.videoId === vid);
      }).filter(Boolean);
      applyToForm(chosen);
      closeModal();
    };
  });

  function renderList(items){
    list.innerHTML = items.map(it=>{
      const url = toWatchUrl(it);
      const meta = [
        it.title ? `제목: ${escapeHtml(it.title)}` : '',
        it.channelTitle ? `채널: ${escapeHtml(it.channelTitle)}` : '',
        it.publishedAt ? `업로드: ${escapeHtml(it.publishedAt)}` : ''
      ].filter(Boolean).join(' · ');
      return `
        <label class="row" style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <input type="checkbox" data-id="${it.videoId}" checked>
          <div style="flex:1;">
            <div style="font-weight:600;">${escapeHtml(url)}</div>
            ${meta ? `<div class="muted" style="font-size:12px;">${meta}</div>` : ''}
          </div>
        </label>
      `;
    }).join('');
  }

  function applyToForm(items){
    if(!items || items.length === 0) return;
    const urls = items.map(toWatchUrl);

    // 1) 다중 입력 textarea 우선
    const taMulti = document.querySelector('#txtUrls, textarea[name="urls"]');
    if(taMulti){
      taMulti.value = urls.join('\n');
      taMulti.dispatchEvent(new Event('input', {bubbles:true}));
    }else{
      // 2) 단일 입력 input
      const inp = document.querySelector('#txtUrl, input[name="url"]');
      if(inp){
        inp.value = urls[0];
        inp.dispatchEvent(new Event('input', {bubbles:true}));
      }
    }

    // (선택) 제목/업로드시각 필드가 있으면 자동 채움 (단일 항목일 때)
    if(items.length === 1){
      const one = items[0];
      const titleInput = document.querySelector('#seriesTitle, input[name="title"]');
      if(titleInput && one.title){ titleInput.value = one.title; }

      const upAtInput = document.querySelector('#ytPublishedAt, input[name="yt_uploaded_at"]');
      if(upAtInput && one.publishedAt){ upAtInput.value = one.publishedAt; }
    }
  }

  function parseYouTubeURL(raw){
    try{
      const u = new URL(raw);
      if(/youtu\.be$/.test(u.hostname)){
        const videoId = u.pathname.slice(1);
        if(!videoId) return null;
        const start = parseStart(u.searchParams);
        const listId = u.searchParams.get('list') || null;
        return { videoId, listId, start };
      }
      if(/youtube\.com$/.test(u.hostname)){
        const path = u.pathname.replace(/^\/+/, '');
        if(path === 'watch'){
          const videoId = u.searchParams.get('v');
          if(!videoId) return null;
          const start = parseStart(u.searchParams);
          const listId = u.searchParams.get('list') || null;
          return { videoId, listId, start };
        }
        // shorts 링크도 처리
        if(path.startsWith('shorts/')){
          const videoId = path.split('/')[1];
          if(!videoId) return null;
          const start = parseStart(u.searchParams);
          const listId = u.searchParams.get('list') || null;
          return { videoId, listId, start };
        }
      }
      return null;
    }catch(e){
      return null;
    }
  }

  function parseStart(sp){
    // t=123 또는 t=1h2m3s 형식 모두 지원
    const t = sp.get('t') || sp.get('start');
    if(!t) return 0;
    if(/^\d+$/.test(t)) return parseInt(t,10);
    const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(t);
    if(!m) return 0;
    const h = parseInt(m[1]||'0',10), mnt = parseInt(m[2]||'0',10), s = parseInt(m[3]||'0',10);
    return h*3600 + mnt*60 + s;
  }

  function toWatchUrl(it){
    const p = new URLSearchParams();
    p.set('v', it.videoId);
    if(it.listId) p.set('list', it.listId);
    if(it.start) p.set('t', `${it.start}s`);
    return `https://www.youtube.com/watch?${p.toString()}`;
  }

  function uniqBy(arr, keyFn){
    const seen = new Set();
    const out = [];
    for(const x of arr){
      const k = keyFn(x);
      if(!seen.has(k)){ seen.add(k); out.push(x); }
    }
    return out;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  // 메타데이터 가져오기 (선택)
  async function fetchByOEmbed(videoId){
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v='+videoId)}&format=json`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('oEmbed fail');
    return await res.json(); // {title, author_name, ...}
  }

  async function fetchByYouTubeAPI(videoId, apiKey){
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('YT API fail');
    const data = await res.json();
    const item = data.items && data.items[0];
    if(!item) return null;
    return {
      title: item.snippet?.title,
      channelTitle: item.snippet?.channelTitle,
      publishedAt: item.snippet?.publishedAt
    };
  }

  // ESC로 닫기
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && dlg && !dlg.classList.contains('hidden')) closeModal();
  });
})();
