// js/categories.js

/** 개인용(로컬 전용)인지 판별 */
export function isPersonalValue(v) {
  return typeof v === 'string' && v.startsWith('personal_');
}

/** 공개 카테고리(개인용 제외) 평탄화 */
export function flattenPublicCategories() {
  const out = [];
  for (const g of CATEGORY_GROUPS) {
    if (g.personal) continue;
    for (const c of g.children) out.push({ value: c.value, label: c.label, group: g.key });
  }
  return out;
}

/** 라벨로 슬러그 찾기(옵션) */
export function findSlugByLabel(label) {
  for (const g of CATEGORY_GROUPS) {
    for (const c of g.children) {
      if (c.label === label) return c.value;
    }
  }
  return '';
}

/** === 최상위 카테고리(그룹) 정의 ===
 *  순서:
 *  영상·리뷰 → 일상 → 생활정보 → 여가·미식 → 정보·IT → 제품리뷰(신설) → 생존 → 사회 → 교육 → 의학 → 기타 → 개인용
 */
export const CATEGORY_GROUPS = [
  /* ▣ 영상·리뷰 */
  {
    key: 'media',
    label: '영상·리뷰',
    children: [
      { value: 'movie',       label: '영화' },
      { value: 'drama',       label: '드라마' },
      { value: 'anime',       label: '애니' },
      { value: 'comic',       label: '만화' },
      { value: 'novel',       label: '소설' },
      { value: 'media_other', label: '그외' },
    ],
  },

  /* ▣ 일상 */
  {
    key: 'daily',
    label: '일상',
    children: [
      { value: 'humor',   label: '유머' },
      { value: 'cider',   label: '사이다' },
      { value: 'figure',  label: '인물' },
      { value: 'touch',   label: '감동' },
      { value: 'variety', label: '예능' },
      { value: 'celeb',   label: '연예' },
      { value: 'sports',  label: '스포츠' },
      { value: 'nature',  label: '자연' },
      { value: 'baby',    label: '아기' },
      { value: 'animals', label: '동물' },
    ],
  },

  /* ▣ 생활정보 */
  {
    key: 'lifeinfo',
    label: '생활정보',
    children: [
      { value: 'life_common', label: '상식' },
      { value: 'life_tips',   label: '생활팁' },
      { value: 'health',      label: '건강' },
      { value: 'exercise',    label: '운동' },
      { value: 'law',         label: '법률' },
      { value: 'estate',      label: '부동산' },
      { value: 'parenting',   label: '육아' },
      { value: 'misinfo',     label: '가짜정보' },
    ],
  },

  /* ▣ 여가·미식 */
  {
    key: 'leisure_food',
    label: '여가·미식',
    children: [
      { value: 'cooking',     label: '요리' },
      { value: 'restaurants', label: '맛집' },
      { value: 'travel',      label: '여행' },
      { value: 'activity',    label: '액티비티' },
      { value: 'hobby',       label: '취미' },
      { value: 'mental',      label: '멘탈' },
    ],
  },

  /* ▣ 정보·IT */
  {
    key: 'it',
    label: '정보·IT',
    children: [
      // ★ 라벨만 변경: 기존 '제품리뷰' → '신제품' (슬러그 product_review 유지)
      { value: 'product_review', label: '신제품' },
      { value: 'tech_future',    label: '기술미래' },
      { value: 'computer',       label: '컴퓨터' },
      { value: 'coding',         label: '코딩' },
      { value: 'app',            label: '앱·어플' },
      { value: 'game',           label: '게임' },
    ],
  },

  /* ▣ 제품리뷰 (신설, 세부 12개) */
  {
    key: 'product',
    label: '제품리뷰',
    children: [
      { value: 'pr_smart',        label: '스마트기기' },
      { value: 'pr_electronics',  label: '전자기기' },
      { value: 'pr_sports',       label: '운동스포츠' },
      { value: 'pr_mobility',     label: '자동차,이동' },
      { value: 'pr_house',        label: '가사' },
      { value: 'pr_kitchen',      label: '주방' },
      { value: 'pr_garden_hunt',  label: '원예수렵' },
      { value: 'pr_tools',        label: '도구' },
      { value: 'pr_health_med',   label: '건강의료' },
      { value: 'pr_pet',          label: '애완' },
      { value: 'pr_study',        label: '공부' },
      { value: 'pr_misc',         label: '그외' },
    ],
  },

  /* ▣ 생존 (정보·IT 아래, 교육 위로 이동) */
  {
    key: 'survival',
    label: '생존',
    children: [
      { value: 'expert',        label: '전문가·달인' },
      { value: 'agro_industry', label: '농어광공업' },
      { value: 'survival',      label: '서바이벌' },
      { value: 'military',      label: '군사' },
    ],
  },

  /* ▣ 사회 (정보·IT 아래, 교육 위로 이동) */
  {
    key: 'society',
    label: '사회',
    children: [
      { value: 'politics', label: '시사정치' },
      { value: 'finance',  label: '금융경제' },
      { value: 'insight',  label: '시대통찰' },
      { value: 'christian',label: '기독교' },
    ],
  },

  /* ▣ 교육 */
  {
    key: 'edu',
    label: '교육',
    children: [
      { value: 'edu_general', label: '일반' },
      { value: 'kids',        label: '어린이' },
      { value: 'science',     label: '과학' },
      { value: 'math',        label: '수학' },
      { value: 'english',     label: '영어' },
      { value: 'korean',      label: '국어' },
      { value: 'social',      label: '사회' },
      { value: 'history',     label: '역사' },
      { value: 'art',         label: '미술' },
      { value: 'music',       label: '음악' },
      { value: 'japanese',    label: '일본어' },
      { value: 'other_lang',  label: '기타언어' },
    ],
  },

  /* ▣ 의학 */
  {
    key: 'medical',
    label: '의학',
    children: [
      { value: 'med_general', label: '일반' },
      { value: 'pediatrics',  label: '소아과' },
    ],
  },

  /* ▣ 기타 */
  {
    key: 'etc',
    label: '기타',
    children: [
      { value: 'etc', label: '미분류' },
    ],
  },

  /* ▣ 개인용 (이 기기에서만 사용 – 서버 공유 안 함) */
  {
    key: 'personal',
    label: '개인용(로컬)',
    personal: true,
    children: [
      { value: 'personal_1', label: '개인용1(본인만보임)' },
      { value: 'personal_2', label: '개인용2(공유안됨)' },
    ],
  },
];
