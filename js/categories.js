// js/categories.js

/** 그룹형 카테고리 정의
 * key: 대분류 키(내부용), label: 표시명
 * children: { value(슬러그), label } 배열
 * personal: true 인 그룹은 로컬 전용(서버 저장/쿼리 제외)
 */
export const CATEGORY_GROUPS = [
  {
    key: 'media_review', label: '영상·리뷰',
    children: [
      { value:'movie', label:'영화' },
      { value:'drama', label:'드라마' },
      { value:'anime', label:'애니' },
      { value:'comic', label:'만화' },
      { value:'novel', label:'소설' },
      { value:'media_other', label:'그외' },
    ]
  },
  {
    key: 'daily', label: '일상',
    children: [
      { value:'humor', label:'유머' },
      { value:'cider', label:'사이다' },
      { value:'figure', label:'인물' },
      { value:'touch', label:'감동' },
      { value:'variety', label:'예능' },
      { value:'celeb', label:'연예' },
      { value:'sports', label:'스포츠' },
      { value:'nature', label:'자연' },
      { value:'baby', label:'아기' },
      { value:'animals', label:'동물' },
    ]
  },
  {
    key: 'life_info', label: '생활정보',
    children: [
      { value:'life_common', label:'상식' },
      { value:'life_tips', label:'생활팁' },
      { value:'health', label:'건강' },
      { value:'exercise', label:'운동' },
      { value:'law', label:'법률' },
      { value:'estate', label:'부동산' },
      { value:'parenting', label:'육아' },
      { value:'misinfo', label:'가짜정보' },
    ]
  },
  {
    key: 'leisure_food', label: '여가·미식',
    children: [
      { value:'cooking', label:'요리' },
      { value:'restaurants', label:'맛집' },
      { value:'travel', label:'여행' },
      { value:'activity', label:'액티비티' },
      { value:'hobby', label:'취미' },
      { value:'mental', label:'멘탈' },
    ]
  },
  {
    key: 'it', label: '정보·IT',
    children: [
      { value:'product_review', label:'제품리뷰' },
      { value:'tech_future', label:'기술미래' },
      { value:'computer', label:'컴퓨터' },
      { value:'coding', label:'코딩' },
      { value:'app', label:'앱·어플' },
      { value:'game', label:'게임' },
    ]
  },
  {
    key: 'education', label: '교육',
    children: [
      { value:'edu_general', label:'일반' },
      { value:'kids', label:'어린이' },
      { value:'science', label:'과학' },
      { value:'math', label:'수학' },
      { value:'english', label:'영어' },
      { value:'korean', label:'국어' },
      { value:'social', label:'사회' },
      { value:'history', label:'역사' },
      { value:'art', label:'미술' },
      { value:'music', label:'음악' },
      { value:'japanese', label:'일본어' },
      { value:'other_lang', label:'기타언어' },
    ]
  },
  {
    key: 'medical', label: '의학',
    children: [
      { value:'med_general', label:'일반' },
      { value:'pediatrics', label:'소아과' },
    ]
  },
  {
    key: 'survival', label: '생존',
    children: [
      { value:'expert', label:'전문가·달인' },
      { value:'agro_industry', label:'농어광공업' },
      { value:'survival', label:'서바이벌' },
      { value:'military', label:'군사' },
    ]
  },
  {
    key: 'society', label: '사회',
    children: [
      { value:'politics', label:'시사정치' },
      { value:'finance', label:'금융경제' },
      { value:'insight', label:'시대통찰' },
      { value:'christian', label:'기독교' },
    ]
  },
  { key: 'misc', label: '기타', children: [ { value:'etc', label:'미분류' } ] },

  // 로컬 전용
  {
    key: 'personal', label: '개인용(내 기기에만 저장)', personal:true,
    children: [
      { value:'personal_1', label:'개인용1' },
      { value:'personal_2', label:'개인용2' },
    ]
  },
];

/** 헬퍼: 개인용 여부 */
export function isPersonalValue(v){
  return v === 'personal_1' || v === 'personal_2';
}

/** 업로드 화면 등에서 쓰는 '플랫' 카테고리(공개용만) */
export function flattenPublicCategories(){
  const list = [];
  for (const g of CATEGORY_GROUPS){
    if (g.personal) continue;
    list.push(...g.children);
  }
  return list;
}

/** 기존 API 유지: 업로드 화면 체크박스 렌더 (공개 세부만) */
export function renderCategoryCheckboxes(container, inputClass = 'cat-box') {
  const cats = flattenPublicCategories();
  container.innerHTML = cats
    .map(c => `<label><input type="checkbox" class="${inputClass}" value="${c.value}"> ${c.label}</label>`)
    .join('');
}
