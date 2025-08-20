// 간단/빠른 XSS 방지 이스케이프
export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
  ));
}

// 개인자료(로컬 라벨) 허용문자 + 길이 제한(최대 20자)
export function safePersonalLabel(s) {
  const t = String(s ?? '').trim().slice(0, 20);
  // 한글/영문/숫자/공백/-_. 만 허용, 그 외 제거
  return t.replace(/[^ \w\-_.가-힣]/gu, '');
}

// 유튜브 URL만 허용 + 확실하게 ID가 추출되는 경우만 true
export function isAllowedYouTubeUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (!(host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'youtube.com')) return false;
    return !!extractYouTubeId(url);
  } catch { return false; }
}

// 유튜브 ID 추출 (watch?v= / shorts/ / youtu.be/)
export function extractYouTubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/)([A-Za-z0-9_-]{6,15})/);
  return m ? m[1] : '';
}
