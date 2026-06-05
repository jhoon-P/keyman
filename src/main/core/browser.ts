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

/** 설치된 Chromium 실행 파일이 실제로 존재하는지 확인 */
export function isBrowserReady(): boolean {
  try {
    return fs.existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

/** Chromium을 비동기로 설치 — stdout에서 퍼센트를 파싱해 onProgress 콜백으로 전달 */
export function installBrowserAsync(onProgress?: (percent: number) => void): Promise<void> {
  const cliPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright', 'cli.js')
    : path.join(process.cwd(), 'node_modules', 'playwright', 'cli.js')

  logger.info(`playwright install via utilityProcess: cli=${cliPath} dest=${process.env.PLAYWRIGHT_BROWSERS_PATH}`)

  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(cliPath, ['install', 'chromium'], {
      env: { ...process.env },
      stdio: 'pipe'
    })

    // playwright stdout: "100% of 286.4 Mb" 또는 진행 중 "52% of 286.4 Mb"
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      const m = text.match(/(\d+)%/)
      if (m && onProgress) onProgress(Math.min(parseInt(m[1]), 99))
    })

    child.once('exit', (code) => {
      logger.info(`playwright install exit code: ${code}`)
      if (code === 0) { onProgress?.(100); resolve() }
      else reject(new Error(`playwright install chromium 실패 (exit ${code})`))
    })
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
