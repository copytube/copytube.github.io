// 축약 카테고리: 라벨 통합, 슬러그는 아래 값으로 고정
export const CATEGORIES = [
  { value: 'review',           label: '영상리뷰' },
  { value: 'fun',              label: '유머' },
  { value: 'touch',            label: '감동' },
  { value: 'variety_celeb',    label: '예능연예' },
  { value: 'sports',           label: '스포츠' },
  { value: 'baby',             label: '아기' },
  { value: 'animal',           label: '동물' },
  { value: 'edu',              label: '교육' },
  { value: 'science',          label: '과학수학' },
  { value: 'english',          label: '영어' },
  { value: 'korean',           label: '국어' },
  { value: 'history',          label: '역사' },
  { value: 'music',            label: '음악' },
  { value: 'art',              label: '미술' },
  { value: 'common_life',      label: '상식생활팁' },
  { value: 'health',           label: '건강' },
  { value: 'exercise',         label: '운동' },
  { value: 'medical',          label: '의학' },
  { value: 'cook_food',        label: '요리맛집' },
  { value: 'travel',           label: '여행' },
  { value: 'computer',         label: '컴퓨터' },
  { value: 'it',               label: '정보IT' },
  { value: 'product',          label: '제품리뷰' },
  { value: 'expert',           label: '전문가' },
  { value: 'nature_survival',  label: '자연서바이벌' },
  { value: 'politics',         label: '시사정치' },
  { value: 'finance',          label: '금융경제' },
  { value: 'christian',        label: '기독교' },
  { value: 'etc',              label: '미분류' },
];

// 업로드 화면 등에서 체크박스 묶음 렌더링(선택 사용)
export function renderCategoryCheckboxes(container, inputClass = 'cat-box') {
  container.innerHTML = CATEGORIES
    .map(c => `<label><input type="checkbox" class="${inputClass}" value="${c.value}"> ${c.label}</label>`)
    .join('');
}
