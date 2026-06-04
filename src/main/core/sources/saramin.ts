/**
 * 사람인 어댑터 — Phase 1
 * 수집 흐름:
 *   1. 채용공고 검색 결과에서 기업 목록 추출
 *   2. 기업 상세 페이지에서 대표번호·주소·업종·근로자수 파싱
 */
import { Page } from 'playwright'
import { SourceAdapter, Filters, RunOptions, CompanyRef, RawRecord } from './types'
import { newPage, cleanText } from '../browser'
import { isBlockedResponse, sleep } from '../rateLimiter'
import { logger } from '../../log/logger'
import { SARAMIN_REGION_MAP } from './regions'
import { SARAMIN_JOB_CAT } from './saraminIndustry'

const BASE = 'https://www.saramin.co.kr'

// 헤드헌팅·인재파견·아웃소싱 업종 키워드 — 해당 업체는 수집 제외
const EXCLUDE_INDUSTRY = /헤드헌팅|인재파견|아웃소싱|용역파견|리크루팅|스태핑|staffing|headhunt/i
const EXCLUDE_NAME = /헤드헌터|헤드헌팅|맨파워|manpower|퍼솔|persol|휴먼컨설팅|에이치알|HR파트너/i

function isExcluded(name: string, industry?: string): boolean {
  if (EXCLUDE_NAME.test(name)) return true
  if (industry && EXCLUDE_INDUSTRY.test(industry)) return true
  return false
}

type CompanyDetail = {
  main_phone?: string
  address?: string
  industry?: string
  employee_count?: number
  homepage_url?: string
  biz_reg_no?: string
  departments?: string[]
}

// ──────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────
/** goto 후 실제 콘텐츠가 있는지 확인 (타임아웃 포함) */
async function safeGoto(page: Page, url: string, waitMs = 0): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  } catch {
    // 타임아웃이어도 이미 로드된 콘텐츠 활용
  }
  if (waitMs > 0) await page.waitForTimeout(waitMs)
}

async function checkBlocked(page: Page): Promise<boolean> {
  const url = page.url()
  if (url.includes('HTTP_BAD_REQUEST') || url.includes('error/') || url === 'about:blank' || url.startsWith('chrome-error://')) {
    return true
  }
  try {
    const text = await page.content()
    return isBlockedResponse(text)
  } catch {
    return true
  }
}

function buildSearchUrl(filters: Filters, pageNum: number): string {
  // /jobs/list/domestic — 사람인 직무별 채용공고 목록
  // cat_mcls=data-mcls_cd_no (실측값), search_done=y 필수
  const params = new URLSearchParams({
    search_done: 'y',
    panel_count: 'y',
    preview: 'y',
    page: String(pageNum)
  })
  if (filters.region_sido) {
    const code = SARAMIN_REGION_MAP[filters.region_sido]
    if (code) params.set('loc_mcd', code)
  }
  if (filters.industry) {
    const code = SARAMIN_JOB_CAT[filters.industry]
    if (code) params.set('cat_mcls', code)
  }
  if (filters.keyword) params.set('searchword', filters.keyword)
  return `${BASE}/zf_user/jobs/list/domestic?${params.toString()}`
}

interface CompanyEntry {
  name: string
  companyPageUrl: string | null
  jobPageUrl: string
  industryHint?: string   // 검색 결과에서 보이는 업종 힌트
}

async function extractCompaniesFromSearchPage(page: Page): Promise<CompanyEntry[]> {
  const diag = await page.evaluate(() => {
    const scope1 = document.querySelector('#default_list_wrap section.list_recruiting > div.list_body')
    const scope2 = document.querySelector('#default_list_wrap section.list_recruiting')
    const scopeDoc = document
    return {
      '#default_list_wrap section.list_recruiting > div.list_body': scope1 ? scope1.querySelectorAll('a[href*="view-inner-recruit"]').length : 'NOT FOUND',
      '#default_list_wrap section.list_recruiting': scope2 ? scope2.querySelectorAll('a[href*="view-inner-recruit"]').length : 'NOT FOUND',
      'document': scopeDoc.querySelectorAll('a[href*="view-inner-recruit"]').length,
    }
  })
  logger.collect('DEBUG', `[DIAG scope] ${JSON.stringify(diag)}`)

  return page.evaluate((base: string) => {
    const results: { name: string; companyPageUrl: string | null; jobPageUrl: string; industryHint?: string }[] = []
    const seen = new Set<string>()

    // 전체 채용정보 공고 리스트: #default_list_wrap section.list_recruiting > div.list_body
    const searchScope: ParentNode =
      document.querySelector('#default_list_wrap section.list_recruiting > div.list_body') ??
      document.querySelector('#default_list_wrap section.list_recruiting') ??
      document.querySelector('.list_recruiting') ??
      document

    const corpLinks = Array.from(
      searchScope.querySelectorAll('a[href*="view-inner-recruit"]')
    ) as HTMLAnchorElement[]

    corpLinks.forEach(a => {
      const name = (a.textContent || '').replace(/\s+/g, ' ').trim()
      if (!name || seen.has(name) || name.length < 2) return
      seen.add(name)

      const rawHref = a.href || ''
      const companyHref = rawHref.startsWith('http') ? rawHref : base + rawHref
      // view-inner-recruit → view (상세 파싱 가능한 기업 프로필 페이지)
      const companyPageUrl = companyHref.replace('view-inner-recruit', 'view')

      // 같은 카드 내 채용공고 링크 찾기 (전화번호 보조용)
      const item = a.closest('.box_item, [class*="box_item"], li')
      const jobLink = item?.querySelector('a[href*="recruit/view"], a[href*="jobs/view"]') as HTMLAnchorElement | null
      const jobPageUrl = jobLink?.href || companyHref

      results.push({ name, companyPageUrl, jobPageUrl })
    })
    return results
  }, BASE)
}

async function parseCompanyPage(page: Page): Promise<CompanyDetail> {
  return page.evaluate((): CompanyDetail => {
    const detail: CompanyDetail = {}

    const clean = (el: Element | null) =>
      (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

    // ── dl 형식: 페이지 전체 dl dt 순회 ──
    document.querySelectorAll('dl dt').forEach(dtEl => {
      const dt = clean(dtEl)
      if (!dt || /사람인|사내동호회/i.test(dt)) return

      let ddEl: Element | null = dtEl.nextElementSibling
      while (ddEl && ddEl.tagName !== 'DD') ddEl = ddEl.nextElementSibling
      const dd = clean(ddEl)
      if (!dd) return

      if (/전화|대표.*번호|연락처|TEL/.test(dt) && !detail.main_phone) {
        detail.main_phone = dd
      } else if (/주소|소재지/.test(dt) && !detail.address) {
        detail.address = dd.replace(/지도보기/g, '').trim()
      } else if (/업종|산업/.test(dt) && !detail.industry) {
        detail.industry = dd
      } else if (/사원수|근로자|직원|임직원/.test(dt) && !detail.employee_count) {
        const n = dd.replace(/[^0-9]/g, '')
        if (n) detail.employee_count = parseInt(n, 10)
      } else if (/홈페이지|homepage/i.test(dt) && !detail.homepage_url) {
        const a = ddEl?.querySelector('a') as HTMLAnchorElement | null
        detail.homepage_url = a?.href ?? (dd.startsWith('http') ? dd : undefined)
      } else if (/사업자.*등록/.test(dt) && !detail.biz_reg_no) {
        const n = dd.replace(/[^0-9]/g, '')
        if (n.length >= 10) detail.biz_reg_no = n
      }
    })

    // ── 사람인 요약 카드 (숫자가 위, 라벨이 아래인 구조) ──
    // 예: <em>10 명</em><span>사원수</span>
    if (!detail.employee_count) {
      const bodyText = document.body?.innerText ?? ''
      const m = bodyText.match(/(\d[\d,]*)\s*명\s*\n?\s*사원수/)
             ?? bodyText.match(/사원수\s*\n?\s*(\d[\d,]*)\s*명/)
      if (m) {
        const n = m[1].replace(/,/g, '')
        if (n) detail.employee_count = parseInt(n, 10)
      }
    }

    // ── table th/td fallback ──
    if (!detail.employee_count || !detail.address) {
      document.querySelectorAll('table tr').forEach(tr => {
        const th = clean(tr.querySelector('th'))
        const td = clean(tr.querySelector('td'))
        if (!th || !td) return
        if (!detail.employee_count && /사원수|근로자|직원|임직원/.test(th)) {
          const n = td.replace(/[^0-9]/g, '')
          if (n) detail.employee_count = parseInt(n, 10)
        }
        if (!detail.address && /주소|소재지/.test(th)) {
          detail.address = td.replace(/지도보기/g, '').trim()
        }
      })
    }

    // ── 전화번호: 페이지 전체에서 패턴 탐색 (dt에 없을 때) ──
    if (!detail.main_phone) {
      const bodyText = document.body?.textContent ?? ''
      const phoneRe = /(?:대표번호|代表番号|전화|TEL)[^\d]*((?:\+?82[-\s]?)?(?:0?2|0?[3-9]\d|0?70)[-\s]?\d{3,4}[-\s]?\d{4}|\d{4}[-\s]?\d{4}|1[5678]\d{2}[-\s]?\d{4})/i
      const m = bodyText.match(phoneRe)
      if (m) detail.main_phone = m[1].replace(/\s/g, '-')
    }

    // ── 홈페이지 링크 보완 ──
    if (!detail.homepage_url) {
      const a = document.querySelector('[class*="homepage"] a, [class*="website"] a') as HTMLAnchorElement | null
      if (a) detail.homepage_url = a.href
    }

    return detail
  })
}

async function parseJobDetailForCompany(page: Page): Promise<CompanyDetail> {
  return page.evaluate((): CompanyDetail => {
    const detail: CompanyDetail = {}

    // 근무부서: 채용공고 요약 dl 테이블에서만 가져옴
    const depts: string[] = []
    document.querySelectorAll('.jv_summary dl, .jv_cont .jv_summary dl').forEach(row => {
      const dt = (row.querySelector('dt')?.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (/근무부서|담당부서|부서/.test(dt)) {
        const dd = (row.querySelector('dd')?.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (dd && dd.length < 30 && !depts.includes(dd)) depts.push(dd)
      }
    })
    if (depts.length > 0) detail.departments = depts

    // 연락처 및 주소
    const section = document.querySelector(
      '.company_info_box, .recruiter_info, .company_detail, [class*="corp_info"]'
    )
    if (!section) return detail
    const text = section.textContent ?? ''
    const phoneMatch = text.match(
      /(?:대표번호|전화|TEL)[^0-9]*((?:\+?82[-\s]?)?(?:0?2|0?[3-9]\d|0?70)[-\s]?\d{3,4}[-\s]?\d{4}|[0-9]{4}[-\s]?[0-9]{4}|1[0-9]{3}[-\s]?[0-9]{4})/i
    )
    if (phoneMatch) detail.main_phone = phoneMatch[1]
    const addrEl = section.querySelector('[class*="address"], .addr, .location')
    if (addrEl) detail.address = (addrEl.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/지도보기/g, '').trim()
    return detail
  })
}

// ──────────────────────────────────────────────
// 어댑터
// ──────────────────────────────────────────────
export const saraminAdapter: SourceAdapter = {
  id: 'saramin',
  label: '사람인',

  async *search(filters: Filters, opts: RunOptions): AsyncIterable<CompanyRef> {
    const page = await newPage()
    const maxCount = filters.max_count ?? 200
    let yielded = 0
    let pageNum = 1
    const seenNames = new Set<string>()

    try {
      // 메인 페이지 방문으로 세션/쿠키 확보
      logger.collect('INFO', 'saramin: 메인 페이지 방문 (세션 초기화)')
      await safeGoto(page, BASE)
      try {
        await page.waitForFunction(() => document.body && document.body.innerHTML.length > 1000, { timeout: 10000 })
      } catch { /* 무시 */ }
      await page.waitForTimeout(800)

      while (yielded < maxCount) {
        const url = buildSearchUrl(filters, pageNum)
        logger.collect('INFO', `saramin search page=${pageNum}`)

        await safeGoto(page, url)
        await page.waitForTimeout(800)

        if (await checkBlocked(page)) {
          logger.collect('WARN', 'saramin: 차단 감지')
          break
        }

        const companies = await extractCompaniesFromSearchPage(page)
        logger.collect('INFO', `saramin: page=${pageNum} found=${companies.length}`)

        if (companies.length === 0) break

        for (const c of companies) {
          if (yielded >= maxCount) break
          if (seenNames.has(c.name)) continue
          seenNames.add(c.name)

          // 이름 또는 검색 결과 업종 힌트로 헤드헌팅 업체 조기 제외
          if (isExcluded(c.name, c.industryHint)) {
            logger.collect('INFO', `saramin: 제외(헤드헌팅/파견) name=${c.name}`)
            continue
          }

          yield {
            source: 'saramin',
            id: c.name,
            name: c.name,
            detail_url: c.companyPageUrl ?? c.jobPageUrl,
            job_url: c.jobPageUrl
          }
          yielded++
        }

        const diagPagination = await page.evaluate(() => {
          const res: any = {}
          const selectors = ['.pagination', '.page_count', '#default_list_wrap .list_body + div', '.list_recruiting + div']
          selectors.forEach(s => {
            const el = document.querySelector(s)
            res[s] = el ? { html: el.outerHTML.slice(0, 300), text: el.textContent?.trim().slice(0, 100) } : 'NOT FOUND'
          })
          res['all_links_with_page'] = Array.from(document.querySelectorAll('a[href*="page="]')).map(a => (a as HTMLAnchorElement).href).slice(0, 5)
          return res
        })
        logger.collect('DEBUG', `[DIAG pagination] ${JSON.stringify(diagPagination)}`)

        const hasNext = await page.evaluate((pNum: number) => {
          // 1. PageBox 내의 버튼/링크 확인 (사람인 최신 구조)
          const pageButtons = Array.from(document.querySelectorAll('.PageBox button, .PageBox a, .pagination a'))
          const nextExists = pageButtons.some(el => {
            const p = el.getAttribute('page') || el.textContent?.trim()
            return p === String(pNum + 1)
          })
          if (nextExists) return true

          // 2. '다음' 버튼이나 특정 텍스트 확인
          const nextBtn = document.querySelector('.btn_next, .next, [class*="Next"]')
          if (nextBtn) return true

          // 3. URL 패턴 확인 (기존 방식 보완)
          const allLinks = Array.from(document.querySelectorAll('a[href*="page="]'))
          return allLinks.some(a => (a as HTMLAnchorElement).href.includes('page=' + (pNum + 1)))
        }, pageNum)
        if (!hasNext) {
          logger.collect('INFO', `saramin: No more pages after ${pageNum}`)
          break
        }

        pageNum++
        await sleep((opts.delayMs ?? 3000) + Math.random() * 500)
      }
    } finally {
      await page.close()
    }
  },

  async fetchDetail(ref: CompanyRef, opts: RunOptions): Promise<RawRecord> {
    const page = await newPage()
    const now = new Date().toISOString()

    try {
      await safeGoto(page, ref.detail_url)
      await page.waitForTimeout(800)

      if (await checkBlocked(page)) {
        logger.collect('WARN', `saramin: 차단 감지 detail name=${ref.name}`)
        return makeRaw(ref.name, ref.detail_url, {}, now)
      }

      // 기업 상세 페이지 여부 판별
      const isCompanyPage = await page.evaluate(() =>
        !!document.querySelector('.company_summary, .company_info, .corporate_info, [class*="company_profile"]')
      )

      let detail: CompanyDetail
      if (isCompanyPage) {
        detail = await parseCompanyPage(page)
      } else {
        // 채용공고 페이지 → 기업 링크 추적
        const corpUrl = await page.evaluate((base: string) => {
          const a = document.querySelector(
            '.company_info .corp_link a, .recruiter_info .corp_name a, [class*="corp_name"] a'
          ) as HTMLAnchorElement | null
          if (!a) return null
          return a.href.startsWith('http') ? a.href : base + a.href
        }, BASE)

        if (corpUrl) {
          await safeGoto(page, corpUrl)
          await page.waitForTimeout(800)
          detail = await parseCompanyPage(page)
        } else {
          detail = await parseJobDetailForCompany(page)
        }
      }

      // 전화번호 없으면 채용공고 페이지에서 추가 시도
      if (!detail.main_phone && ref.job_url && ref.job_url !== ref.detail_url) {
        await safeGoto(page, ref.job_url)
        await page.waitForTimeout(800)
        const jobPhone = await page.evaluate((): string | null => {
          const bodyText = document.body?.textContent ?? ''
          // 접수방법·담당자·회사 연락처 영역에서 전화번호 패턴 탐색
          const re = /(?:전화|연락처|TEL|담당자)[^0-9\n]{0,10}((?:\+?82[-\s]?)?(?:0?2|0?[3-9]\d|0?70)[-\s]?\d{3,4}[-\s]?\d{4}|1[5678]\d{2}[-\s]?\d{4})/i
          const m = bodyText.match(re)
          if (m && !m[1].includes('6226-5000') && !m[1].includes('2025-4733')) return m[1].replace(/\s/g, '-')

          // 페이지 전체에서 전화번호 패턴 (유선/070/1588류)
          const re2 = /\b((?:\+?82[-.\s]?)?(?:0?2|0?[3-9]\d|0?70)[-\s]?\d{3,4}[-\s]?\d{4}|1[5678]\d{2}[-\s]?\d{4})\b/ig
          const matches = Array.from(bodyText.matchAll(re2))
          for (const match of matches) {
            const num = match[1].replace(/\s/g, '-')
            // 사람인 고객센터 번호 및 팩스 제외
            if (!num.includes('6226-5000') && !num.includes('2025-4733')) {
               const index = match.index ?? 0
               const prefix = bodyText.substring(Math.max(0, index - 15), index).toLowerCase()
               const isFax = /fax|팩스|f\s*a\s*x/.test(prefix)
               if (!isFax) return num
            }
          }
          return null
        })
        if (jobPhone) {
          detail.main_phone = jobPhone
          logger.collect('DEBUG', `saramin: phone from job page name=${ref.name} phone=${jobPhone}`)
        }
      }

      logger.collect(
        'DEBUG',
        `saramin: detail name=${ref.name} phone=${detail.main_phone ?? '-'} addr=${detail.address?.slice(0, 20) ?? '-'} emp=${detail.employee_count ?? '-'}`
      )

      // 사원수 누락 시 실제 dt/th 라벨 로깅 (처음 3건만)
      if (!detail.employee_count) {
        const empDiag = await page.evaluate(() => {
          const dtLabels = Array.from(document.querySelectorAll('dl dt')).map(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
          const thLabels = Array.from(document.querySelectorAll('th')).map(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
          return { dtLabels, thLabels }
        })
        logger.collect('DEBUG', `[EMP_DIAG] name=${ref.name} dt=${JSON.stringify(empDiag.dtLabels)} th=${JSON.stringify(empDiag.thLabels)}`)
      }

      // 셀렉터 진단: phone, address 둘 다 없을 때
      if (!detail.main_phone && !detail.address) {
        const diagHtml = await page.evaluate(() => {
          const url = location.href
          // 주요 구조 정보
          const selCheck: Record<string, number> = {}
          const toCheck = [
            '.company_summary', '.company_info', '.corporate_info',
            '[class*="company_profile"]', '[class*="corp_info"]',
            '.info_group', '.info_table', 'dl', 'table',
            '[class*="company_view"]', '.company_view',
            '.basic_info', '[class*="basic_info"]'
          ]
          toCheck.forEach(s => { selCheck[s] = document.querySelectorAll(s).length })

          // 첫 번째 dl의 dt 목록
          const dtTexts: string[] = []
          document.querySelectorAll('dl dt').forEach(el => {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
            if (t && !dtTexts.includes(t)) dtTexts.push(t)
          })

          // 첫 번째 th 목록
          const thTexts: string[] = []
          document.querySelectorAll('th').forEach(el => {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
            if (t && !thTexts.includes(t)) thTexts.push(t)
          })

          return { url, selCheck, dtTexts: dtTexts.slice(0, 20), thTexts: thTexts.slice(0, 20) }
        })
        // dt → 다음형제 태그 + 값 쌍
        const dtPairs = await page.evaluate(() => {
          const pairs: string[] = []
          document.querySelectorAll('dl dt').forEach(dtEl => {
            const dt = (dtEl.textContent ?? '').replace(/\s+/g, ' ').trim()
            let sib: Element | null = dtEl.nextElementSibling
            const sibTag = sib?.tagName ?? 'null'
            const sibText = (sib?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
            pairs.push(`${dt} → [${sibTag}] ${sibText}`)
          })
          return pairs
        })
        logger.collect('WARN', `[DIAG] url=${diagHtml.url}`)
        logger.collect('WARN', `[DIAG] sel=${JSON.stringify(diagHtml.selCheck)}`)
        logger.collect('WARN', `[DIAG] dtPairs=${JSON.stringify(dtPairs)}`)
      }

      return makeRaw(ref.name, page.url(), detail, now, ref.job_url)
    } finally {
      await page.close()
    }
  }
}

function makeRaw(name: string, url: string, detail: CompanyDetail, now: string, jobUrl?: string): RawRecord {
  return {
    source: 'saramin',
    source_url: url,
    job_url: jobUrl,
    company_name: name,
    main_phone: detail.main_phone,
    address: detail.address,
    industry: detail.industry,
    employee_count: detail.employee_count,
    homepage_url: detail.homepage_url,
    departments: detail.departments,
    collected_at: now
  }
}

// cleanText 미사용 경고 방지
void cleanText
