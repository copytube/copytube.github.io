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

  /* ★ 음악감상 (영상·리뷰 아래) */
  {
    key: 'music_listen',
    label: '음악감상',
    children: [
      { value: 'music_kpop',          label: 'K-pop' },
      { value: 'music_kayo',          label: 'K가요' },
      { value: 'music_ballad',        label: '발라드' },
      { value: 'music_rock',          label: 'Rock' },
      { value: 'music_hiphop_rnb',    label: '힙합 & R&B' },
      { value: 'music_pop',           label: 'Pop' },
      { value: 'music_classic',       label: '클래식' },
      { value: 'music_ost_musical',   label: '영화/뮤지컬' },
      { value: 'music_ani',           label: '애니메이션' },
      { value: 'music_children',      label: '동요/어린이' },
      { value: 'music_internet',      label: '인터넷/Creator' },
      { value: 'music_jazz',          label: '재즈(Jazz)' },
      { value: 'music_newage_healing',label: '뉴에이지/힐링' },
      { value: 'music_gospel',        label: '가스펠' },
    ],
  },

  /* 일상 (자연 다음에 ‘밈’, ‘국뽕’ 추가) */
  {
    key: 'daily',
    label: '일상',
    children: [
      { value: 'fun',        label: '유머' },
      { value: 'saida',      label: '사이다' },
      { value: 'person',     label: '인물' },
      { value: 'touch',      label: '감동' },
      { value: 'variety',    label: '예능' },
      { value: 'celeb',      label: '연예' },
      { value: 'sports',     label: '스포츠' },
      { value: 'nature',     label: '자연' },
      { value: 'meme',       label: '밈' },
      { value: 'national_pride', label: '국뽕' },
      { value: 'baby',       label: '아기' },
      { value: 'animal',     label: '동물' },
    ],
  },

  /* 생활정보 (요청 순서) */
  {
    key: 'lifeinfo',
    label: '생활정보',
    children: [
      { value: 'common',  label: '상식' },
      { value: 'life',  label: '생활팁' },
      { value: 'beauty',     label: '미용' },
      { value: 'housework',     label: '가사' },
      { value: 'health',       label: '건강' },
      { value: 'exercise',     label: '운동' },
      { value: 'self',     label: '자기관리' },
      { value: 'social',     label: '사회생활' },
      { value: 'law',          label: '법률' },
      { value: 'estate',       label: '부동산' },
      { value: 'parenting',    label: '육아' },
      { value: 'misinfo',      label: '가짜정보' },
    ],
  },

  /* 여가·미식 */
  {
    key: 'leisure_food',
    label: '여가·미식',
    children: [
      { value: 'cook',     label: '요리' },
      { value: 'foodie',   label: '맛집' },
      { value: 'travel',   label: '여행' },
      { value: 'activity', label: '액티비티' },
      { value: 'proart',    label: '예술' },
      { value: 'hobby',    label: '취미' },
      { value: 'making',     label: '제작수리' },
      { value: 'mobility',     label: '모빌리티' },
      { value: 'interior',   label: '집꾸미기' },
    ],
  },

  /* 정보·IT */
  {
    key: 'infoit',
    label: '정보·IT',
    children: [
      { value: 'new_product', label: '신제품' },
      { value: 'tech_future', label: '기술미래' },
      { value: 'computer',    label: '컴퓨터' },
      { value: 'coding',      label: '코딩' },
      { value: 'app',         label: '앱·어플' },
      { value: 'game',        label: '게임' },
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

  /* 생존 (정보·IT 아래, 교육 위) */
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

  /* 사회 (정보·IT 아래, 교육 위) */
  {
    key: 'society',
    label: '사회',
    children: [
      { value: 'politics',   label: '시사정치' },
      { value: 'finance',    label: '금융경제' },
      { value: 'era_insight',label: '시대통찰' },
      { value: 'christian',  label: '기독교' },
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
      { value: 'edu_social',      label: '사회' },
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
      { value: 'internal',  label: '내과' },
      { value: 'surgery',  label: '외과' },
      { value: 'pediatrics',  label: '소아과' },
      { value: 'obgy',  label: '산부인과' },
      { value: 'urology',  label: '신비뇨기과' },
      { value: 'os',  label: '근골격계' },
      { value: 'dermacos',  label: '피부성형' },
      { value: 'neuro',  label: '신경' },
      { value: 'ophthalmo',  label: '안과' },
      { value: 'ent',  label: '이비인후과' },
      { value: 'dental',  label: '구강치과' },
      { value: 'saib',  label: '대체의학' },
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

  /* 개인자료 (로컬 저장 전용) — 기본은 하단 */
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
