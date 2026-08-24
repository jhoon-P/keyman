export interface Filters {
  keyword?: string            // 회사명/공고 텍스트 검색
  region_sido?: string        // 시/도 이름 — 로그 표시 및 코드 폴백 매핑용
  region_code?: string        // 시/도 코드 (사람인 loc_mcd)
  region_sub_codes?: string[] // 시/군/구 코드 (사람인 loc_cd) — 다중 선택
  industry?: string           // 업종 (예: 'IT/소프트웨어')
  max_count?: number
  min_employee?: number       // 최소 임직원 수 (이 값 이상만 수집)
}

export interface RunOptions {
  delayMs?: number    // 요청 간 지연 (기본 2000~5000)
  maxConcurrent?: number
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
}

export interface RawRecord {
  source: string
  source_url: string        // 상세 정보를 파싱한 URL (기업 프로필 등)
  job_url?: string          // 원본 채용공고 URL
  company_name: string
  main_phone?: string
  address?: string
  industry?: string
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
