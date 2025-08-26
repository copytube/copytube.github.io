// js/personal-labels.js
const KEY_V1 = 'personalLabelsV1';
const KEY_LEGACY = 'personalLabels'; // 예전 키 호환

const DEFAULTS = { personal1: '자료1', personal2: '자료2' };

export function loadPersonalLabels(){
  try{
    const cur = JSON.parse(localStorage.getItem(KEY_V1) || 'null') || {};
    // 레거시가 있으면 합쳐서 승계
    const legacy = JSON.parse(localStorage.getItem(KEY_LEGACY) || 'null') || {};
    return { ...DEFAULTS, ...legacy, ...cur };
  }catch{
    return { ...DEFAULTS };
  }
}

export function getPersonalLabel(value){
  return loadPersonalLabels()[value] || value;
}

export function setPersonalLabel(value, label){
  const name = String(label||'').trim().slice(0, 20);
  if(!/^[\w가-힣\-_.\s]{1,20}$/.test(name)) throw new Error('허용: 한글/영문/숫자/공백/[-_.], 1~20자');

  const cur = loadPersonalLabels();
  cur[value] = name;
  localStorage.setItem(KEY_V1, JSON.stringify(cur));

  // 다른 탭/페이지 실시간 반영용
  window.dispatchEvent(new Event('personal-labels:changed'));
}
