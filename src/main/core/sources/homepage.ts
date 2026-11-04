/**
 * 회사 홈페이지 크롤러 — 대표번호 보강
 * 사람인 수집과 병렬로 실행하며 홈페이지 번호를 우선 보강한다.
 */
import { Page } from 'playwright'
import { newPage } from '../browser'
import { logger } from '../../log/logger'
import type { PageExecutor } from './types'

export interface HomepageResult {
  main_phone?: string
  source_url: string
  departments?: string[]
  outcome?: 'found' | 'missing' | 'timeout' | 'error'
}

async function extractDepartmentsFromPage(page: Page): Promise<string[]> {
  return page.evaluate((): string[] => {
    const depts = new Set<string>()

    // ── 1순위: 구조적 요소 (조직도/부서 목록 태그) ──
    const structSelectors = [
      '.org_chart li', '.organization_chart li', '[class*="org_chart"] li',
      '.dept_list li', '[class*="dept_list"] li', '.org_list li',
      '.org_wrap li', '.chart_wrap li', '.team_list li'
    ]
    structSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t && t.length < 30) depts.add(t)
      })
    })

    // ── 2순위: 텍스트 패턴 (구조 없을 때만) ──
    if (depts.size === 0) {
      const re = /(?:^|\s|>|\[|【)([가-힣a-zA-Z0-9&/]{2,12}(?:본부|연구소|센터|사업부|사업단|팀|실))(?=\s|$|<|\]|】)/g
      const bodyText = document.body?.innerText ?? ''
      const matches = Array.from(bodyText.matchAll(re))

      // 정부부처·일반명사·동사 어미 제외
      const excludeRe = /고객|AS|A\/S|콜|서비스|문의|이벤트|회원|로그인|공지|게시판|복지|보건|환경|국방|교육|문화|과학|농림|산업|고용|행정|외교|법무|국토|해수|중기/
      for (const match of matches) {
        const d = match[1].trim()
        if (!excludeRe.test(d)) depts.add(d)
      }
    }

    return Array.from(depts)
  })
}

async function extractPhoneFromPage(page: Page): Promise<string | null> {
  return page.evaluate((): string | null => {
    // 1. tel: 링크 (가장 신뢰도 높음)
    const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'))
    for (const a of telLinks) {
      const num = (a as HTMLAnchorElement).href.replace('tel:', '').replace(/[-.\s()]/g, '')
      if (/^(0[2-9]\d{7,8}|070\d{8}|1[5678]\d{6})$/.test(num)) return num
    }

    // 2. 푸터·연락처 영역에서 패턴 탐색
    const searchAreas = [
      document.querySelector('footer'),
      document.querySelector('#footer'),
      document.querySelector('.footer'),
      document.querySelector('[class*="contact"]'),
      document.querySelector('[class*="footer"]'),
      document.querySelector('[id*="contact"]'),
    ].filter(Boolean) as Element[]

    // 푸터가 없으면 body 전체
    const targets = searchAreas.length > 0 ? searchAreas : [document.body]

    // 유선(02포함)/070/전국대표번호 패턴 (앞뒤 숫자가 아닌 문자로 경계 구분, +82 국제번호 지원)
    const phoneRe = /(?:^|[^\d])((?:\+?82[-.\s]?)?(?:0?2|0?[3-9]\d|0?70)[-.\s]?\d{3,4}[-.\s]?\d{4}|1[5678]\d{2}[-.\s]?\d{4})(?=[^\d]|$)/gi

    for (const el of targets) {
      const text = el.textContent ?? ''
      const matches = Array.from(text.matchAll(phoneRe))
      
      for (const match of matches) {
        const index = match.index ?? 0
        // 매칭된 번호 앞의 15글자를 가져와서 FAX 여부 판별
        const prefix = text.substring(Math.max(0, index - 15), index).toLowerCase()
        const isFax = /fax|팩스|f\s*a\s*x/.test(prefix)
        
        if (!isFax) {
          // FAX가 아닌 가장 먼저 나온 유선/대표번호 반환
          return match[1].replace(/[.\s]/g, '-')
        }
      }
    }
    return null
  })
}

export async function enrichFromHomepage(
  homepageUrl: string,
  companyName: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; schedulePage?: PageExecutor } = {}
): Promise<HomepageResult | null> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  opts.signal?.addEventListener('abort', abort, { once: true })
  if (opts.signal?.aborted) abort()
  let timedOut = false
  let activeMs = 0
  const budget = opts.timeoutMs ?? 12000
  const visit = (url: string, findLink: boolean, referer?: string) => {
    const run = async () => {
      const started = Date.now()
      const remaining = budget - activeMs
      if (remaining <= 0) { timedOut = true; controller.abort(); throw new Error('homepage budget exceeded') }
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, remaining)
      let page: Page | undefined
      try {
        page = await newPage(controller.signal)
        await page.route('**/*', route => ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue())
        try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining, referer }) }
        catch { if (controller.signal.aborted) throw new Error('homepage navigation aborted') }
        await page.waitForSelector('footer, #footer, .footer, a[href^="tel:"], [class*="contact"]', { timeout: 1200 }).catch(() => undefined)
        if (controller.signal.aborted) throw new Error('homepage navigation aborted')
        const phone = await extractPhoneFromPage(page)
        const departments = await extractDepartmentsFromPage(page)
        const targetUrl = findLink && !phone ? await page.evaluate((): string | null => {
          const links = Array.from(document.querySelectorAll('a'))
          const usable = links.filter(a => /^https?:/.test(a.href) && a.href.split('#')[0] !== location.href.split('#')[0])
          const target = usable.find(a => /연락처|문의|contact/i.test((a.textContent || '').replace(/\s/g, '')))
            ?? usable.find(a => /회사소개|기업소개|about|organization/i.test((a.textContent || '').replace(/\s/g, '')))
          return target?.href ?? null
        }) : null
        return { phone, departments, targetUrl, url: page.url() }
      } finally {
        clearTimeout(timer)
        await page?.close().catch(() => undefined)
        activeMs += Date.now() - started
      }
    }
    return opts.schedulePage ? opts.schedulePage(url, run, controller.signal) : run()
  }
  try {
    const main = await visit(homepageUrl, true)
    let phone = main.phone
    let finalUrl = main.url
    const departments = main.departments
    if (!phone && main.targetUrl) {
      logger.collect('DEBUG', `homepage: navigating to subpage for more info name=${companyName} url=${main.targetUrl}`)
      const sub = await visit(main.targetUrl, false, main.url)
      if (sub.phone) { phone = sub.phone; finalUrl = sub.url }
      for (const dept of sub.departments) if (!departments.includes(dept)) departments.push(dept)
    }
    logger.collect(phone ? 'INFO' : 'DEBUG', `homepage: ${phone ? 'phone found' : 'no phone'} name=${companyName} phone=${phone ?? '-'} url=${finalUrl}`)
    return { main_phone: phone ?? undefined, source_url: finalUrl, departments: departments.length ? departments : undefined, outcome: phone ? 'found' : 'missing' }
  } catch (err) {
    logger.collect('WARN', `homepage: ${timedOut ? 'timeout' : 'error'} name=${companyName} err=${String(err).slice(0, 80)}`)
    return { source_url: homepageUrl, outcome: timedOut ? 'timeout' : 'error' }
  } finally { opts.signal?.removeEventListener('abort', abort) }
}
