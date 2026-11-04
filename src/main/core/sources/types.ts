export interface Filters {
  keyword?: string            // 회사명/공고 텍스트 검색
  region_sido?: string        // 시/도 이름 — 로그 표시 및 코드 폴백 매핑용
  region_code?: string        // 시/도 코드 (사람인 loc_mcd)
  region_sub_codes?: string[] // 시/군/구 코드 (사람인 loc_cd) — 다중 선택
  industry?: string           // 업종 (예: 'IT/소프트웨어')
  industries?: string[]       // 업종 다중 선택. 지정하면 기존 industry보다 우선하며 빈 배열은 전체
  max_count?: number
  min_employee?: number       // 최소 임직원 수 (이 값 이상만 수집)
  exclude_recruitment_agencies?: boolean // 기본 true: 헤드헌팅·채용대행·인력파견 제외
}

export type PageExecutor = <T>(url: string, run: (markRequestStart?: () => void | Promise<void>) => Promise<T>, signal?: AbortSignal) => Promise<T>

export interface RunOptions {
  delayMs?: number    // 사람인 요청 시작 간격 (기본 500ms)
  schedulerMode?: 'reserved' | 'shared' | 'staged' // 기본 reserved: 상세 슬롯 확보 후 홈페이지와 공유
  sharedWorkers?: number       // 공용 페이지 슬롯: 기본 7
  schedulePage?: PageExecutor
  filters?: Filters
  maxConcurrent?: number       // staged 상세 작업자 기본 4 / reserved 상세 예약 기본 3, 범위 1~4
  homepageConcurrent?: number // 홈페이지 작업자: 기본 3, 범위 1~4
  homepageTimeoutMs?: number
  signal?: AbortSignal
  beforeRequest?: (signal?: AbortSignal) => Promise<void>
  runId: string
  /** 어댑터 → UI 로그 전달 (차단 감지 등 사용자가 봐야 하는 이벤트) */
  onLog?: (level: 'INFO' | 'WARN' | 'ERROR', message: string) => void
}

export interface CompanyRef {
  source: string
  id: string          // 소스 내 고유 ID
  name: string
  detail_url: string
  job_url?: string    // 채용공고 URL (전화번호 보조 추출용)
  recruitment_agency_evidence?: string
}

export interface RawRecord {
  source: string
  source_url: string        // 상세 정보를 파싱한 URL (기업 프로필 등)
  job_url?: string          // 원본 채용공고 URL
  company_name: string
  main_phone?: string
  representative_name?: string
  address?: string
  industry?: string
  business_description?: string
  recruitment_agency_evidence?: string
  employee_count?: number
  homepage_url?: string
  biz_reg_no?: string
  departments?: string[]
  keyman_candidates?: Array<{ name?: string; title?: string; phone?: string }>
  extra?: Record<string, unknown>
  collected_at: string
}

export interface SourceAdapter {
  id: string
  label: string
  search(filters: Filters, opts: RunOptions): AsyncIterable<CompanyRef>
  fetchDetail(ref: CompanyRef, opts: RunOptions): Promise<RawRecord>
}
