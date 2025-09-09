// js/categories.js

export const CATEGORY_GROUPS = [

  /* 일상 (스포츠 제거, 뉴스 추가) */
  {
    key: 'daily',
    label: '일상',
    children: [
      { value: 'fun',            label: '유머짤' },
      { value: 'funstory',       label: '유머스토리' },
      { value: 'proman',         label: '달인마술' },
      { value: 'saida',          label: '사이다' },
      { value: 'person',         label: '인물' },
      { value: 'touch',          label: '감동' },
      { value: 'variety',        label: '예능' },
      { value: 'celeb',          label: '연예' },
      { value: 'news',           label: '뉴스' },     // ★ 신규
      { value: 'nature',         label: '자연' },
      { value: 'meme',           label: '밈' },
      { value: 'national_pride', label: '국뽕' },
      { value: 'baby',           label: '아기' },
      { value: 'animal',         label: '동물' },
    ],
  },

  /* 생활정보 */
  {
    key: 'lifeinfo',
    label: '생활정보',
    children: [
      { value: 'common',     label: '상식' },
      { value: 'life',       label: '생활팁' },
      { value: 'beauty',     label: '미용' },
      { value: 'housework',  label: '가사' },
      { value: 'health',     label: '건강' },
      { value: 'exercise',   label: '운동' },
      { value: 'self',       label: '자기관리' },
      { value: 'social',     label: '사회생활' },
      { value: 'law',        label: '법률' },
      { value: 'estate',     label: '부동산' },
      { value: 'parenting',  label: '육아' },
      { value: 'misinfo',    label: '가짜정보' },
    ],
  },

  /* 여가·미식 (게임 이동, 독서/악기연주 추가, 집꾸미기 라벨 변경) */
  {
    key: 'leisure_food',
    label: '여가·취미',
    children: [
      { value: 'cook',            label: '요리' },
      { value: 'activity',        label: '액티비티' },
      { value: 'proart',          label: '예술' },
      { value: 'hobby',           label: '취미' },
      { value: 'play',            label: '놀이' },
      { value: 'making',          label: '제작수리' },
      { value: 'mobility',        label: '모빌리티' },
      듭' },
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

    /* 영상·리뷰 */
  {
    key: 'media',
    label: '영상·리뷰',
    children: [
      { value: 'movie',      label: '영화' },
      { value: 'movie_s',      label: '영화짤' },
      { value: 'drama',      label: '드라마' },
      { value: 'drama_s',      label: '드라마짤' },
      { value: 'anime',      label: '애니' },
      { value: 'anime_s',      label: '애니짤' },
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
      { value: 'music_kpop',           label: 'K-pop' },
      { value: 'music_kayo',           label: 'K가요' },
      { value: 'music_ballad',         label: '발라드' },
      { value: 'music_rock',           label: 'Rock' },
      { value: 'music_hiphop_rnb',     label: '힙합 & R&B' },
      { value: 'music_pop',            label: 'Pop' },
      { value: 'music_jpop',            label: 'J-Pop' },
      { value: 'music_3pop',            label: '3rd_Pop' },
      { value: 'music_classic',        label: '클래식' },
      { value: 'music_ost_musical',    label: '영화/뮤지컬' },
      { value: 'music_ani',            label: '애니메이션' },
      { value: 'music_children',       label: '동요/어린이' },
      { value: 'music_internet',       label: '인터넷/Creator' },
      { value: 'music_jazz',           label: '재즈(Jazz)' },
      { value: 'music_newage_healing', label: '뉴에이지/힐링' },
      { value: 'music_gospel',         label: '가스펠' },
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
      { value: 'history',     label: '국사' },
      { value: 'whistory',     label: '세계사' },
       { value: 'geography',     label: '지리' },
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
