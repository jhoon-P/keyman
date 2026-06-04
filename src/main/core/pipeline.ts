import { SourceAdapter, Filters, RunOptions, RawRecord } from './sources/types'
import { enrichFromHomepage } from './sources/homepage'

const EXCLUDE_INDUSTRY_RE = /헤드헌팅|인재파견|아웃소싱|용역파견|리크루팅|스태핑|staffing|headhunt/i
function isExcludedIndustry(industry?: string): boolean {
  return !!industry && EXCLUDE_INDUSTRY_RE.test(industry)
}

// 선택 업종과 파싱된 업종이 맞는지 확인 (UI의 INDUSTRY_LIST와 매칭되도록 키 수정)
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  'IT개발·데이터':    ['IT', '소프트웨어', '개발', 'SI', '솔루션', '시스템', '정보기술', 'ICT', '인터넷', '플랫폼', '데이터', 'AI', '인공지능', '빅데이터'],
  '기획·전략':        ['기획', '전략', '컨설팅', '경영지원'],
  '마케팅·홍보·조사': ['마케팅', '홍보', '광고', '브랜드', '조사'],
  '회계·세무·재무':   ['회계', '세무', '재무', '자금', '경리'],
  '인사·노무·HRD':   ['인사', '노무', 'HR', '채용', '교육'],
  '총무·법무·사무':   ['총무', '법무', '사무', '비서', '관리'],
  '영업·판매·무역':   ['영업', '판매', '무역', '유통', '도소매'],
  '서비스':           ['서비스', '호텔', '여행', '음식점', '카페'],
  '생산':             ['생산', '제조', '공장', '품질'],
  '건설·건축':        ['건설', '건축', '토목', '인테리어'],
  '의료':             ['의료', '병원', '제약', '바이오', '보건'],
  '연구·R&D':         ['연구', '개발', 'R&D', '화학', '기술'],
  '교육':             ['교육', '학원', '학교', '교구'],
  '미디어·문화·스포츠': ['미디어', '방송', '신문', '출판', '영화', '예술', '스포츠'],
  '금융·보험':        ['금융', '은행', '증권', '보험', '캐피탈', '카드', '투자'],
  '구매·자재·물류':   ['구매', '자재', '물류', '운송', 'SCM'],
  '공공·복지':        ['공공', '복지', '기관', '협회', '재단'],
  '고객상담·TM':      ['고객', '상담', 'TM', 'CS', '콜센터'],
  '운전·운송·배송':   ['운전', '운송', '배송', '택배', '화물'],
  '디자인':           ['디자인', '웹디자인', '그래픽', '산업디자인'],
  '상품기획·MD':      ['상품기획', 'MD', 'VMD', '유통'],
}

function isMatchingIndustry(parsedIndustry: string | undefined, filterIndustry: string): boolean {
  if (!parsedIndustry) return true  // 업종 파싱 안 된 경우 통과 (정보 부족)
  const keywords = INDUSTRY_KEYWORDS[filterIndustry]
  if (!keywords) return true
  const lower = parsedIndustry.toLowerCase()
  const isMatch = keywords.some(k => lower.includes(k.toLowerCase()))
  
  // 만약 검색결과가 해당 카테고리에서 나왔다면, 업종명이 조금 달라도 허용 범위를 넓힘
  // (예: 연구·R&D 카테고리 검색 결과인데 업종이 '제조업'인 경우 등)
  return isMatch
}
import { normalizePhone, normalizeCompanyName, parseAddress } from './normalize'

import { findDuplicate } from './dedup'
import { insertRawRecord, upsertCompany, Company } from '../db/repository'
import { logger } from '../log/logger'
import { withDelay, withRetry, isBlockedResponse, sleep } from './rateLimiter'

export type PipelineEvent =
  | { type: 'progress'; current: number; total?: number; company_name: string }
  | { type: 'log'; level: 'INFO' | 'WARN' | 'ERROR'; message: string }
  | { type: 'blocked'; source: string }
  | { type: 'done'; count: number; runId: string }

export interface PipelineOptions {
  sources: SourceAdapter[]
  filters: Filters
  runOptions: RunOptions
  onEvent: (evt: PipelineEvent) => void
}

let _abortFlag = false

export function abortPipeline(): void {
  _abortFlag = true
}

export async function runPipeline(opts: PipelineOptions): Promise<void> {
  _abortFlag = false
  const { sources, filters, runOptions, onEvent } = opts
  const runId = runOptions.runId
  logger.startCollectRun(runId)

  let totalSaved = 0
  const maxCount = filters.max_count ?? Infinity

  try {
    for (const adapter of sources) {
      if (_abortFlag) break
      onEvent({ type: 'log', level: 'INFO', message: `[${adapter.label}] 수집 시작` })
      logger.collect('INFO', `adapter=${adapter.id} started`)

      let adapterCount = 0
      try {
        for await (const ref of adapter.search(filters, runOptions)) {
          if (_abortFlag) break
          if (totalSaved >= maxCount) break

          try {
            const raw = await withRetry(() => adapter.fetchDetail(ref, runOptions))

            // 차단 감지
            if (raw.extra?.html && isBlockedResponse(String(raw.extra.html))) {
              onEvent({ type: 'blocked', source: adapter.id })
              logger.collect('WARN', `BLOCKED by ${adapter.id}`)
              break
            }

            const rawId = insertRawRecord({
              source: raw.source,
              source_url: raw.source_url,
              raw_json: JSON.stringify(raw),
              collected_at: raw.collected_at
            })

            const company = buildCompany(raw, rawId)

            // 업종 필터: 헤드헌팅/파견 제외 (이것만 유지)
            if (isExcludedIndustry(company.industry)) {
              logger.collect('INFO', `skip(헤드헌팅/파견): name=${company.company_name} industry=${company.industry}`)
              onEvent({ type: 'log', level: 'INFO', message: `제외(헤드헌팅): ${company.company_name}` })
              continue
            }

            const dedup = findDuplicate({
              biz_reg_no: company.biz_reg_no,
              company_name: company.company_name,
              address: company.address,
              main_phone: company.main_phone
            })

            if (dedup.existingId) {
              logger.collect('INFO', `dedup hit(${dedup.matchKey}): id=${dedup.existingId} name=${company.company_name}`)
              company.id = dedup.existingId
            }

            // 홈페이지가 있으면 사람인 번호 무시하고 무조건 홈페이지에서 번호 탐색 (우선순위 1)
            if (company.homepage_url) {
              onEvent({ type: 'log', level: 'INFO', message: `홈페이지 탐색: ${company.company_name}` })
              const hp = await enrichFromHomepage(company.homepage_url, company.company_name)
              if (hp?.main_phone) {
                const pr = normalizePhone(hp.main_phone)
                if (pr && pr.type !== 'mobile') {
                  company.main_phone = pr.normalized
                  company.phone_status = pr.status
                  if (!company.field_sources) company.field_sources = {}
                  company.field_sources['main_phone'] = {
                    source: 'homepage',
                    source_url: hp.source_url,
                    collected_at: new Date().toISOString()
                  }
                } else if (company.main_phone && company.field_sources?.['main_phone']?.source === 'saramin') {
                  // 홈페이지에서 못 찾았는데 사람인에 번호가 있다면 그거라도 쓴다 (이미 세팅됨)
                } else {
                  // 둘 다 실패
                  company.main_phone = undefined
                  company.phone_status = 'none'
                }
              }

              if (hp?.departments && hp.departments.length > 0) {
                const existing = company.departments ? (Array.isArray(company.departments) ? company.departments : []) : []
                const merged = Array.from(new Set([...existing, ...hp.departments]))
                company.departments = merged
                if (!company.field_sources) company.field_sources = {}
                company.field_sources['departments'] = {
                  source: 'homepage',
                  source_url: hp.source_url,
                  collected_at: new Date().toISOString()
                }
              }
            }

            upsertCompany(company)
            totalSaved++
            adapterCount++
            onEvent({ type: 'progress', current: totalSaved, company_name: company.company_name })
            logger.collect('INFO', `saved: ${company.company_name} phone=${company.main_phone ?? '-'}`)

            await sleep(runOptions.delayMs ?? (2000 + Math.random() * 3000))
          } catch (err) {
            logger.collect('ERROR', `fetchDetail error: ${ref.detail_url}`, err as Error)
            onEvent({ type: 'log', level: 'ERROR', message: `상세 파싱 실패: ${ref.name}` })
          }
        }
      } catch (err) {
        logger.collect('ERROR', `adapter ${adapter.id} search error`, err as Error)
        onEvent({ type: 'log', level: 'ERROR', message: `[${adapter.label}] 검색 오류: ${String(err)}` })
      }

      onEvent({ type: 'log', level: 'INFO', message: `[${adapter.label}] 수집 완료: ${adapterCount}건` })
    }
  } finally {
    onEvent({ type: 'done', count: totalSaved, runId })
    logger.endCollectRun()
  }
}

function buildCompany(raw: RawRecord, rawId: number): Company {
  const normName = normalizeCompanyName(raw.company_name)
  const phoneResult = raw.main_phone ? normalizePhone(raw.main_phone) : null
  const { region_sido, region_sigungu } = raw.address ? parseAddress(raw.address) : {}
  const now = raw.collected_at

  // 모바일(010)은 대표번호가 아니라 키맨 후보로 분류
  const isMobile = phoneResult?.type === 'mobile'
  const mainPhone = isMobile ? undefined : phoneResult?.normalized
  const phoneStatus = isMobile ? 'none' : (phoneResult ? phoneResult.status : 'none')

  // 모바일이면 keyman_candidates에 추가
  const keymanFromPhone = isMobile && phoneResult
    ? [{ phone: phoneResult.normalized, source: raw.source }]
    : []
  const keyman = [
    ...keymanFromPhone,
    ...(raw.keyman_candidates?.map(k => ({ ...k, source: raw.source })) ?? [])
  ]

  const fieldSources: Record<string, { source: string; source_url?: string; collected_at: string }> = {}
  const tag = (field: string) => {
    fieldSources[field] = { source: raw.source, source_url: raw.source_url, collected_at: now }
  }

  tag('company_name')
  if (mainPhone) tag('main_phone')
  if (raw.address) tag('address')
  if (raw.industry) tag('industry')
  if (raw.employee_count) tag('employee_count')
  if (raw.homepage_url) tag('homepage_url')
  if (raw.biz_reg_no) tag('biz_reg_no')

  return {
    company_name: normName,
    main_phone: mainPhone,
    phone_status: phoneStatus,
    address: raw.address,
    region_sido,
    region_sigungu,
    industry: raw.industry,
    employee_count: raw.employee_count,
    homepage_url: raw.homepage_url,
    job_url: raw.job_url || raw.source_url,
    biz_reg_no: raw.biz_reg_no,
    departments: raw.departments,
    keyman_candidates: keyman.length ? keyman : undefined,
    field_sources: fieldSources,
    raw_record_ids: [rawId]
  }
}
