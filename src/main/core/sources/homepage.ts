/**
 * 회사 홈페이지 크롤러 — 대표번호 보강
 * phone이 없고 homepage_url이 있을 때 호출
 */
import { Page } from 'playwright'
import { newPage } from '../browser'
import { logger } from '../../log/logger'
import { sleep } from '../rateLimiter'

export interface HomepageResult {
  main_phone?: string
  source_url: string
  departments?: string[]
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
      const num = (a as HTMLAnchorElement).href.replace('tel:', '').replace(/\s/g, '')
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
  companyName: string
): Promise<HomepageResult | null> {
  const page = await newPage()
  try {
    try {
      await page.goto(homepageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } catch {
      // 타임아웃이어도 로드된 내용 활용
    }
    await page.waitForTimeout(600)

    let phone = await extractPhoneFromPage(page)
    let departments = await extractDepartmentsFromPage(page)
    const finalUrl = page.url()

    // 부서 정보가 적거나 전화번호를 못 찾았다면 조직도/회사소개 페이지 추가 탐색 시도
    if (!phone || departments.length < 3) {
      const targetUrl = await page.evaluate((): string | null => {
        const links = Array.from(document.querySelectorAll('a'))
        // 조직도, 회사소개, About 관련 링크 찾기
        const target = links.find(a => {
          const txt = (a.textContent || '').trim().replace(/\s/g, '')
          return /조직도|조직안내|회사소개|기업소개|about|organization/i.test(txt) || /organization/i.test(a.href)
        })
        return target ? target.href : null
      })

      if (targetUrl && targetUrl.startsWith('http') && targetUrl !== finalUrl) {
        logger.collect('DEBUG', `homepage: navigating to subpage for more info name=${companyName} url=${targetUrl}`)
        try {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
          await page.waitForTimeout(600)
          
          if (!phone) {
            const subPhone = await extractPhoneFromPage(page)
            if (subPhone) phone = subPhone
          }
          
          const subDepts = await extractDepartmentsFromPage(page)
          subDepts.forEach(d => {
            if (!departments.includes(d)) departments.push(d)
          })
        } catch {
          // 서브페이지 이동 실패 무시
        }
      }
    }

    if (phone) {
      logger.collect('INFO', `homepage: phone found name=${companyName} phone=${phone} url=${finalUrl}`)
    } else {
      logger.collect('DEBUG', `homepage: no phone name=${companyName} url=${finalUrl}`)
    }

    if (departments.length > 0) {
      logger.collect('INFO', `homepage: depts found name=${companyName} count=${departments.length}`)
    }

    return { 
      main_phone: phone ?? undefined, 
      source_url: finalUrl,
      departments: departments.length > 0 ? departments : undefined
    }
  } catch (err) {
    logger.collect('WARN', `homepage: error name=${companyName} err=${String(err).slice(0, 80)}`)
    return null
  } finally {
    await page.close()
  }
}
