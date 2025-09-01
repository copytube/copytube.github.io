// js/categories.js

export const CATEGORY_GROUPS = [
  /* 영상·리뷰 */
  {
    key: 'media',
    label: '영상·리뷰',
    children: [
      { value: 'movie',      label: '영화' },
      { value: 'drama',      label: '드라마' },
      { value: 'anime',      label: '애니' },
      { value: 'comic',      label: '만화' },
      { value: 'novel',      label: '소설' },
      { value: 'media_etc',  label: '그외' },
    ],
  },

  /* ★ 음악감상 (학' },
    ],
  },

  /* 제품리뷰 (대분류) */
  {
    key: 'product_review',
    label: '제품리뷰',
    children: [
      { value: 'prd_smart',     label: '스마트기기' },
      { value: 'prd_electro',   label: '전자기기' },
      { value: 'prd_sports',    label: '운동·스포츠' },
      { value: 'prd_vehicle',   label: '자동차·이동' },
      { value: 'prd_housework', label: '가사' },
      { value: 'prd_kitchen',   label: '주방' },
      { value: 'prd_garden',    label: '원예·수렵' },
      { value: 'prd_tools',     label: '도구' },
      { value: 'prd_health',    label: '건강·의료' },
      { value: 'prd_pet',       label: '애완' },
      { value: 'prd_study',     label: '공부' },
      { value: 'prd_misc',      label: '그외' },
    ],
  },

  /* 생존 */
  {
    key: 'survival',
    label: '생존',
    children: [
      { value: 'expert_master',  label: '전문가·달인' },
      { value: 'agri_fish_ind',  label: '농어광공업' },
      { value: 'survival',       label: '서바이벌' },
      { value: 'military',       label: '군사' },
    ],
  },

  /* 사회 */
  {
    key: 'society',
    label: '사회',
    children: [
      { value: 'politics',    label: '시사정치' },
      { value: 'finance',     label: '금융경제' },
      { value: 'era_insight', label: '시대통찰' },
      { value: 'christian',   label: '기독교' },
    ],
  },

  /* 교육 */
  {
    key: 'edu',
    label: '교육',
    children: [
      { value: 'edu_general', label: '일반' },
      { value: 'edu_child',   label: '어린이' },
      { value: 'science',     label: '과학' },
      { value: 'math',        label: '수학' },
      { value: 'english',     label: '영어' },
      { value: 'korean',      label: '국어' },
      { value: 'edu_social',  label: '사회' }, // 충돌 방지용 확정 키
      { value: 'geography',     label: '지리' },
      { value: 'history',     label: '역사' },
      { value: 'art',         label: '미술' },
      { value: 'music',       label: '음악' },
      { value: 'japanese',    label: '일본어' },
      { value: 'other_lang',  label: '기타언어' },
    ],
  },

  /* 의학 */
  {
    key: 'medical',
    label: '의학',
    children: [
      { value: 'med_general', label: '일반' },
      { value: 'internal',    label: '내과' },
      { value: 'surgery',     label: '외과' },
      { value: 'pediatrics',  label: '소아과' },
      { value: 'obgy',        label: '산부인과' },
      { value: 'urology',     label: '신비뇨기과' },
      { value: 'os',          label: '근골격계' },
      { value: 'dermacos',    label: '피부성형' },
      { value: 'neuro',       label: '신경' },
      { value: 'ophthalmo',   label: '안과' },
      { value: 'ent',         label: '이비인후과' },
      { value: 'dental',      label: '구강치과' },
      { value: 'saib',        label: '대체의학' },
    ],
  },

  /* 기타 */
  {
    key: 'etc',
    label: '기타',
    children: [
      { value: 'etc', label: '미분류' },
    ],
  },

  /* 성별·연령 (신규 대분류) */
  {
    key: 'demographics',
    label: '성별·연령',
    children: [
      { value: 'female', label: '여성용' },
      { value: 'male',   label: '남성용' },
      { value: 'youth',  label: '잼민이' },
      { value: 'senior', label: '노인' },
    ],
  },

  /* 시리즈 — ★ 개인자료 바로 앞에 배치 */
  {
    key: 'series',
    label: '시리즈',
    children: [
      { value: 'series_miraculous', label: '미라큘러스' },
      { value: 'series_marvel',     label: '마블' },
    ],
  },

  /* 개인자료 (로컬 저장 전용) — 항상 최하단 */
  {
    key: 'personal',
    label: '개인자료',
    personal: true,
    children: [
      { value: 'personal1',  label: '자료1' },
      { value: 'personal2',  label: '자료2' },
    ],
  },
];

export function ALL_CATEGORY_VALUES() {
  return CATEGORY_GROUPS.flatMap(g => g.children.map(c => c.value));
}
