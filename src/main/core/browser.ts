import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { utilityProcess } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { logger } from '../log/logger'

let _browser: Browser | null = null
let _context: BrowserContext | null = null

/** userData 아래에 브라우저를 설치 — 관리자 권한 불필요, 앱별 격리 */
export function setupPlaywrightPath(): void {
  const browsersPath = path.join(app.getPath('userData'), 'pw-browsers')
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
}

/** 설치된 Chromium 실행 파일이 실제로 존재하는지 확인.
 *  playwright의 executablePath()는 모듈 로드 시점 env를 캐싱하므로
 *  PLAYWRIGHT_BROWSERS_PATH를 직접 읽어 파일시스템을 확인한다. */
export function isBrowserReady(): boolean {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!browsersPath) return false
  try {
    for (const entry of fs.readdirSync(browsersPath)) {
      if (!entry.startsWith('chromium-')) continue
      for (const subdir of ['chrome-win64', 'chrome-win']) {
        if (fs.existsSync(path.join(browsersPath, entry, subdir, 'chrome.exe'))) return true
      }
    }
  } catch { /* 경로 없으면 무시 */ }
  return false
}

/** Chromium을 비동기로 설치.
 *  - stdout 파싱으로 퍼센트 콜백 전달
 *  - INSTALLATION_COMPLETE 파일 감지 fallback (프로세스가 hang해도 완료 처리)
 */
export function installBrowserAsync(onProgress?: (percent: number) => void): Promise<void> {
  const cliPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright', 'cli.js')
    : path.join(process.cwd(), 'node_modules', 'playwright', 'cli.js')

  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH!
  logger.info(`playwright install: cli=${cliPath} dest=${browsersPath}`)

  return new Promise((resolve, reject) => {
    let settled = false

    const settle = (ok: boolean, err?: Error) => {
      if (settled) return
      settled = true
      clearInterval(completionPoll)
      if (ok) { onProgress?.(100); resolve() }
      else reject(err)
    }

    const child = utilityProcess.fork(cliPath, ['install', 'chromium'], {
      env: { ...process.env },
      stdio: 'pipe'
    })

    // stdout: "52% of 286.4 Mb" 패턴 파싱
    child.stdout?.on('data', (data: Buffer) => {
      const m = data.toString().match(/(\d+)%/)
      if (m && onProgress) onProgress(Math.min(parseInt(m[1]), 99))
    })
    // stderr drain — 버퍼 막힘 방지
    child.stderr?.on('data', () => undefined)

    child.once('exit', (code) => {
      logger.info(`playwright install exit: ${code}`)
      if (code === 0) settle(true)
      else settle(false, new Error(`playwright install 실패 (exit ${code})`))
    })

    // Fallback: 프로세스가 hang해도 chromium 실행 파일이 생기면 완료 처리 (1초마다 체크)
    const completionPoll = setInterval(() => {
      if (isBrowserReady()) {
        logger.info('Chromium executable detected via poll — resolving')
        settle(true)
      }
    }, 1000)
  })
}

const COMMON_HEADERS = {
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
}

export interface BrowserConfig {
  headless?: boolean   // 기본 true, false로 하면 브라우저 창 표시
}

let _config: BrowserConfig = { headless: false }   // false = 탐지 회피
export function setBrowserConfig(cfg: BrowserConfig): void { _config = { ..._config, ...cfg } }

export async function getBrowserContext(): Promise<BrowserContext> {
  if (_context) return _context

  _browser = await chromium.launch({
    headless: _config.headless ?? false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-position=9999,9999'   // 화면 밖으로 밀어서 방해 최소화
    ]
  })

  _context = await _browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    extraHTTPHeaders: COMMON_HEADERS,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1280, height: 800 }
  })

  // stealth: hide webdriver flag
  await _context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  logger.info('Browser context created')
  return _context
}

export async function newPage(): Promise<Page> {
  const ctx = await getBrowserContext()
  return ctx.newPage()
}

export async function closeBrowser(): Promise<void> {
  if (_context) { await _context.close(); _context = null }
  if (_browser) { await _browser.close(); _browser = null }
  logger.info('Browser closed')
}

/** 텍스트에서 공백 제거 + null-safe */
export function cleanText(t: string | null | undefined): string {
  return (t ?? '').replace(/\s+/g, ' ').trim()
}
