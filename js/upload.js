// js/upload.js (v1.3.2)
// 기존 기능 유지 + 제목 저장 추가(oEmbed)
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

function extractId(url){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/); return m?m[1]:''; }
// --- 유튜브 제목(oEmbed) 가져오기 ---
async function fetchTitle(url){
  try{
    const id = extractId(url);
    const u  = id ? ('https://www.youtube.com/watch?v=' + id) : url;
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u));
    if(!res.ok) throw new Error('oEmbed ' + res.status);
    const data = await res.json();
    const t = (data && data.title) ? String(data.title) : '';
    return t.slice(0, 200);
  }catch(e){ console.warn('[upload] fetchTitle 실패:', e); return ''; }
}

// 예시: submit 로직
async function saveOne(url, cats){
  const user = auth.currentUser;
  if(!user) throw new Error('로그인이 필요합니다');
  const normals = Array.isArray(cats)? cats: [];
  const title = await fetchTitle(url);
  await addDoc(collection(db,'videos'), { url, title, categories:normals, uid:user.uid, createdAt: serverTimestamp() });
}

export { fetchTitle, saveOne };
