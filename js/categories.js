// js/categories.js (KidsAni v0.2.1) — storageValue 제거, 시리즈 value = "{series}_{sub}"

export const CATEGORY_GROUPS = [
  /* 음악감상 */
  {
    key: 'music_listen',
    label: '음악감상',
    children: [
      { value: 'music_children',     label: '동요' },
      { value: 'music_anisong',      label: '애니송' },
      { value: 'music_english',      label: 'English' },
      { value: 'music_ost',          label: 'OST' },
      { value: 'music_kpop',         label: 'K-POP' },
      { value: 'music_instrumental', label: '연주' },
    ],
  },

  /* 재미 */
  {
    key: 'fun',
    label: '재미',
    children: [
      { value: 'fairy_tale',   label: '동화' },
      { value: 'anime',        label: '애니' },
      { value: 'baby_toddler', label: '아기유아' },
      { value: 'play',         label: '놀이' },
      { value: 'brain_play',   label: '두뇌놀이' },
      { value: 'youtuber',     label: '유투버' },
    ],
  },

  /* 자연생물 */
  {
    key: 'nature_bio',
    label: '자연생물',
    children: [
      { value: 'animal',            label: '동물' },
      { value: 'bird',              label: '새-조류' },
      { value: 'marine',            label: '바다-수생' },
      { value: 'insect_arthropod',  label: '곤충-절지' },
      { value: 'plant',             label: '식물' },
      { value: 'microscope',        label: '현미경' },
      { value: 'earth_space',       label: '지구-우주' },
    ],
  },

  /* 뽀로로 (시리즈) */
  {
    key: 'series_pororo',
    label: '뽀로로',
    series: true,
    children: [
      { value: 'pororo_s1',    label: '시즌1' },
      { value: 'pororo_s2',    label: '시즌2' },
      { value: 'pororo_s3',    label: '시즌3' },
      { value: 'pororo_movie', label: '극장판' },
    ],
  },

  /* 옥토넛 (시리즈) */
  {
    key: 'series_octonauts',
    label: '옥토넛',
    series: true,
    children: [
      { value: 'octonauts_s1', label: '시즌1' },
      { value: 'octonauts_s2', label: '시즌2' },
      { value: 'octonauts_s3', label: '시즌3' },
    ],
  },

  /* 학습 */
  {
    key: 'edu',
    label: '학습',
    children: [
      { value: 'korean',  label: '한글' },
      { value: 'math',    label: '수학' },
      { value: 'english', label: '영어' },
      { value: 'science', label: '과학' },
    ],
  },

  /* 미술만들기 */
  {
    key: 'art_making',
    label: '미술만들기',
    children: [
      { value: 'drawing', label: '그리기' },
      { value: 'craft',   label: '만들기' },
      { value: 'origami', label: '종이접기' },
      { value: 'art',     label: '예술' },
    ],
  },

  /* 뽐내기 */
  {
    key: 'showcase',
    label: '뽐내기',
    children: [
      { value: 'show_baby',       label: '아가' },
      { value: 'show_art',        label: '예술' },
      { value: 'show_sports',     label: '운동' },
      { value: 'show_music_play', label: '음악연주' },
      { value: 'show_art_making', label: '미술만들기' },
    ],
  },

  /* 코코멜론 (시리즈) */
  {
    key: 'series_cocomelon',
    label: '코코멜론',
    series: true,
    children: [
      { value: 'cocomelon_mealtime',       label: 'Mealtime' },
      { value: 'cocomelon_bedtime',        label: 'Bedtime' },
      { value: 'cocomelon_potty_training', label: 'PottyTaining' },
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
