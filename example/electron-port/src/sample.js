/* 키맨 발굴 — 샘플 데이터 (포팅 시 실제 수집 데이터로 교체) */
const FIRST = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "신"];
const NAME2 = ["민준", "서연", "도윤", "지우", "하준", "수빈", "예준", "지호", "현우", "유진", "성민", "다은"];
const ROLES = ["대표이사", "영업본부장", "구매팀장", "기술이사", "마케팅 이사", "총무부장", "사업개발 매니저", "인사팀장"];
const INDUSTRIES = ["제조", "IT·소프트웨어", "도소매", "건설", "물류·운송", "식음료", "헬스케어", "교육", "금융", "미디어"];
const REGIONS = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종", "경남"];
const SUFFIX = ["테크", "산업", "물산", "이엔지", "솔루션", "글로벌", "시스템", "네트웍스", "바이오", "로지스", "에너지", "파트너스"];
const STEM = ["대한", "한솔", "미래", "정원", "삼익", "유진", "현대", "성광", "동방", "케이", "제일", "우진", "신성", "다온", "예성", "광일", "태성", "은성"];

function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

export function makeCompany(i) {
  const r = rng(i * 7919 + 13);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const stem = pick(STEM);
  const name = stem + pick(SUFFIX);
  const person = pick(FIRST) + pick(NAME2);
  const region = pick(REGIONS);
  const phone = "0" + (10 + Math.floor(r() * 60)) + "-" + (200 + Math.floor(r() * 799)) + "-" + (1000 + Math.floor(r() * 8999));
  const dom = ["co.kr", "com", "kr", "net"][Math.floor(r() * 4)];
  const slug = ["dawon", "hansol", "miraetech", "jeongwon", "samik", "kgroup", "jeil", "woojin", "shinsung", "taesung"][i % 10];
  return {
    id: i,
    name,
    industry: pick(INDUSTRIES),
    region,
    person,
    role: pick(ROLES),
    phone,
    mobile: "010-" + (2000 + Math.floor(r() * 7999)) + "-" + (1000 + Math.floor(r() * 8999)),
    email: slug + (i % 7 === 0 ? "" : i) + "@" + slug + "." + dom,
    site: "www." + slug + "." + dom,
    employees: [12, 24, 38, 57, 86, 120, 240, 15, 33, 410][i % 10],
    collectedAt: ["방금", "2분 전", "5분 전", "11분 전", "26분 전", "1시간 전", "3시간 전", "어제", "2일 전", "3일 전"][i % 10],
    verified: r() > 0.45,
  };
}

export const SAMPLE = Array.from({ length: 42 }, (_, i) => makeCompany(i + 1));
