export const DEFAULT_EXCLUSION_KEYWORDS = ['부동산', '컨설팅', '고용알선']

function comparisonKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\s·ㆍ/()（）-]+/g, '')
}

/** 줄바꿈·쉼표로 구분하며 공백·대소문자만 다른 중복은 한 번만 적용한다. */
export function parseExclusionKeywords(text: string): string[] {
  const seen = new Set<string>()
  return text.split(/[,，\r\n]+/).map(value => value.trim()).filter(value => {
    const key = comparisonKey(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 생략은 기본값, 명시적인 빈 배열은 키워드 제외 해제다. 정규식이 아닌 부분 문자열로 비교한다. */
export function excludedKeywordReason(company: {
  company_name?: string
  industry?: string
  business_description?: string
}, keywords: string[] = DEFAULT_EXCLUSION_KEYWORDS): string | undefined {
  const fields = [
    ['회사명', company.company_name], ['업종', company.industry], ['사업내용', company.business_description]
  ] as const
  for (const keyword of keywords) {
    const key = comparisonKey(keyword)
    if (!key) continue
    for (const [label, value] of fields) {
      if (value && comparisonKey(value).includes(key)) return `${label}: ${keyword}`
    }
  }
  return undefined
}
