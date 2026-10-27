import { agencyCompanyKey, VERIFIED_RECRUITMENT_AGENCIES } from './recruitmentAgencies'

/** 회사 정보에만 적용한다. 채용 직무나 공고 본문은 일반 기업도 HR 용어를 사용한다. */
const AGENCY_TERMS = /헤드헌[팅터]|헤드헌트|서치펌|써치펌|인재파견|인력파견|근로자파견|인력공급|인적자원공급|인재공급|용역파견|고용알선|취업알선|직업소개|채용대행|채용알선|인재알선|인재추천|리크루[팅트]|스태핑|아웃소싱|headhunt(?:ing|er)?|\bexecutive[\s-]*search\b|\bsearch[\s-]*firm\b|\brecruit(?:ing|ment)\b|\bstaffing\b/i
const AGENCY_NAMES = /맨파워|\bmanpower\b|퍼솔|\bpersol\b|휴먼컨설팅|에이치알|HR파트너/i

export function recruitmentAgencyReason(company: {
  company_name?: string
  industry?: string
  business_description?: string
  homepage_url?: string
  recruitment_agency_evidence?: string
}): string | undefined {
  if (company.recruitment_agency_evidence) return `채용업체 표시: ${company.recruitment_agency_evidence}`
  const nameKey = agencyCompanyKey(company.company_name ?? '')
  const known = VERIFIED_RECRUITMENT_AGENCIES.find(agency => agency.aliases.some(alias => agencyCompanyKey(alias) === nameKey))
  if (known) return `확인된 헤드헌팅 업체: ${known.name}`
  // 회사 표기가 달라져도 확인된 공식 도메인이면 같은 업체로 판단한다.
  if (company.homepage_url) {
    try {
      const hostname = new URL(company.homepage_url.includes('://') ? company.homepage_url : `https://${company.homepage_url}`).hostname.toLowerCase().replace(/^www\./, '')
      const byDomain = VERIFIED_RECRUITMENT_AGENCIES.find(agency => agency.domains.some(domain => domain === hostname))
      if (byDomain) return `확인된 헤드헌팅 업체 도메인: ${byDomain.name} (${hostname})`
    } catch { /* 잘못된 URL은 회사명·업종 판정을 계속한다. */ }
  }
  const fields = [
    ['회사명', company.company_name],
    ['업종', company.industry],
    ['사업내용', company.business_description]
  ] as const
  for (const [label, value] of fields) {
    if (!value) continue
    // 한국어 업종 표기는 띄어쓰기와 구분자 유무가 일정하지 않다.
    const compact = value.normalize('NFKC').replace(/[\s·ㆍ/()（）-]+/g, '')
    const match = value.match(AGENCY_TERMS) ?? compact.match(AGENCY_TERMS)
      ?? (label === '회사명' ? value.match(AGENCY_NAMES) : null)
    if (match) return `${label}: ${match[0]}`
  }
  return undefined
}
