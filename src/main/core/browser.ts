import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { utilityProcess } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { logger } from '../log/logger'

let _browser: Browser | null = null
let _context: BrowserContext | null = null

/** Chromium 설치 완료 여부 확인.
 *  playwright가 import 시점에 캐싱한 경로(기본 ms-playwright)를 그대로 사용.
 *  설치/launch/체크 모두 같은 경로를 보도록 커스텀 경로 없이 운영. */
export function isBrowserReady(): boolean {
  try {
    const execPath = chromium.executablePath()
    return fs.existsSync(execPath)
  } catch {
    return false
  }
}

/** Chromium을 비동기로 설치.
 *  playwright 기본 경로(ms-playwright)에 설치 — import 캐시와 일치.
 *  - stdout 파싱으로 퍼센트 콜백 전달
 *  - isBrowserReady() polling fallback (프로세스 hang 대비)
 */
export function installBrowserAsync(onProgress?: (percent: number) => void): Promise<void> {
  const cliPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright', 'cli.js')
    : path.join(process.cwd(), 'node_modules', 'playwright', 'cli.js')

  logger.info(`playwright install: cli=${cliPath}`)

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
