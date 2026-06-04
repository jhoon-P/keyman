// 전화번호·주소·회사명 정규화 및 검증

const AREA_CODES = [
  '02', '031', '032', '033', '041', '042', '043', '044',
  '051', '052', '053', '054', '055', '061', '062', '063', '064'
]

export type PhoneType = 'landline' | 'voip' | 'tollfree' | 'mobile' | 'unknown'
export type PhoneStatus = 'verified' | 'unverified'

export interface PhoneResult {
  normalized: string        // 하이픈 포맷 (예: 02-1234-5678)
  digits: string            // 숫자만
  type: PhoneType
  status: PhoneStatus
}

/** 전화번호 추출·정규화·검증 */
export function normalizePhone(raw: string): PhoneResult | null {
  // 국가코드 제거: +82, 82- 등
  let stripped = raw.trim()
  if (/^\+?82/.test(stripped)) {
    stripped = stripped.replace(/^\+?82[-\s]?/, '')
    if (!stripped.startsWith('0') && !/^(15|16|18)/.test(stripped)) {
      stripped = '0' + stripped
    }
  }
  const digits = stripped.replace(/\D/g, '')
  if (digits.length < 7) return null

  // 전국대표번호 15xx, 16xx, 18xx + 080 무료전화
  if (/^(15|16|18)\d{2}\d{4}$/.test(digits)) {
    return { digits, normalized: `${digits.slice(0, 4)}-${digits.slice(4)}`, type: 'tollfree', status: 'verified' }
  }
  if (/^080\d{7,8}$/.test(digits)) {
    const rest = digits.slice(3)
    const n = rest.length === 7
      ? `080-${rest.slice(0, 3)}-${rest.slice(3)}`
      : `080-${rest.slice(0, 4)}-${rest.slice(4)}`
    return { digits, normalized: n, type: 'tollfree', status: 'verified' }
  }

  // 인터넷전화 070
  if (digits.startsWith('070') && (digits.length === 10 || digits.length === 11)) {
    const n = digits.length === 10
      ? `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`
      : `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`
    return { digits, normalized: n, type: 'voip', status: 'verified' }
  }

  // 휴대폰 010/011/016/017/018/019
  if (/^01[016789]/.test(digits) && (digits.length === 10 || digits.length === 11)) {
    const n = digits.length === 10
      ? `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`
      : `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`
    return { digits, normalized: n, type: 'mobile', status: 'verified' }
  }

  // 지역번호 유선
  for (const code of AREA_CODES) {
    if (digits.startsWith(code)) {
      const rest = digits.slice(code.length)
      if (rest.length === 7 || rest.length === 8) {
        const mid = rest.length === 7 ? rest.slice(0, 3) : rest.slice(0, 4)
        const last = rest.length === 7 ? rest.slice(3) : rest.slice(4)
        return { digits, normalized: `${code}-${mid}-${last}`, type: 'landline', status: 'verified' }
      }
    }
  }

  // 형식 불명 — unverified
  return { digits, normalized: digits, type: 'unknown', status: 'unverified' }
}

/** 회사명 정규화: 법인격 표기 통일 */
export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\(주\)\s*/g, '(주)')
    .replace(/\s*\(주\)/g, '(주)')
    .replace(/주식회사\s+/g, '(주)')
    .replace(/\s+주식회사$/g, '(주)')
}

const SIDO_MAP: Record<string, string> = {
  서울: '서울특별시', 서울특별시: '서울특별시',
  부산: '부산광역시', 부산광역시: '부산광역시',
  대구: '대구광역시', 대구광역시: '대구광역시',
  인천: '인천광역시', 인천광역시: '인천광역시',
  광주: '광주광역시', 광주광역시: '광주광역시',
  대전: '대전광역시', 대전광역시: '대전광역시',
  울산: '울산광역시', 울산광역시: '울산광역시',
  세종: '세종특별자치시', 세종특별자치시: '세종특별자치시',
  경기: '경기도', 경기도: '경기도',
  강원: '강원도', 강원도: '강원도', 강원특별자치도: '강원특별자치도',
  충북: '충청북도', 충청북도: '충청북도',
  충남: '충청남도', 충청남도: '충청남도',
  전북: '전라북도', 전라북도: '전라북도', 전북특별자치도: '전북특별자치도',
  전남: '전라남도', 전라남도: '전라남도',
  경북: '경상북도', 경상북도: '경상북도',
  경남: '경상남도', 경상남도: '경상남도',
  제주: '제주특별자치도', 제주특별자치도: '제주특별자치도'
}

/** 주소에서 시/도, 시군구 파싱 */
export function parseAddress(address: string): { region_sido?: string; region_sigungu?: string } {
  if (!address) return {}
  const parts = address.trim().split(/\s+/)
  let sido: string | undefined
  let sigungu: string | undefined

  for (const part of parts) {
    if (!sido) {
      const matched = Object.keys(SIDO_MAP).find(k => part.startsWith(k))
      if (matched) { sido = SIDO_MAP[matched]; continue }
    } else if (!sigungu) {
      if (/시$|군$|구$/.test(part)) { sigungu = part; break }
    }
  }
  return { region_sido: sido, region_sigungu: sigungu }
}
