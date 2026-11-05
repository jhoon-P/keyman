/** 사람인 기업형태 검색 항목과 company_type 값. */
export const SARAMIN_COMPANY_TYPES = [
  { value: 'scale001', label: '대기업' },
  { value: 'foreign', label: '외국계(법인/투자)' },
  { value: 'kosdaq', label: '코스닥' },
  { value: 'stock', label: '주식회사' },
  { value: 'military', label: '병역특례 인증 업체' }
] as const

export type CompanyTypeCode = typeof SARAMIN_COMPANY_TYPES[number]['value']
