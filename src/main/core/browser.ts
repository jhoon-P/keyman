import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { utilityProcess } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { logger } from '../log/logger'

let _browser: Browser | null = null
let _context: BrowserContext | null = null

/** chromium 실행 파일 경로 (playwright 기본 ms-playwright 캐시 기준). 실패 시 null. */
function chromiumExecPath(): string | null {
  try {
    return chromium.executablePath()
  } catch {
    return null
  }
}

/** 해당 브라우저 폴더의 설치 완료 마커 경로.
 *  executablePath = <cache>/chromium-XXXX/chrome-win64/chrome.exe
 *  marker         = <cache>/chromium-XXXX/INSTALLATION_COMPLETE
 *  playwright는 다운로드+압축해제가 모두 끝난 뒤에만 이 마커를 쓴다. */
function completeMarkerPath(execPath: string): string {
  return path.join(path.dirname(path.dirname(execPath)), 'INSTALLATION_COMPLETE')
}

/** Chromium 설치 완료 여부 확인.
 *  실행 파일 존재 + playwright 완료 마커(INSTALLATION_COMPLETE)를 둘 다 확인한다.
 *  마커까지 봐야 '다운로드 도중 끊긴 반쪽 설치'를 정확히 걸러낼 수 있다.
 *  (chrome.exe는 압축 해제 중간에 미리 생기므로 단독으로는 신뢰 불가) */
export function isBrowserReady(): boolean {
  const execPath = chromiumExecPath()
  if (!execPath) return false
  try {
    return fs.existsSync(execPath) && fs.existsSync(completeMarkerPath(execPath))
  } catch {
    return false
  }
}

/** Chromium을 비동기로 설치.
 *  playwright 기본 경로(ms-playwright)에 설치 — import 캐시와 일치.
 *  - 완료 판단은 '프로세스 종료(exit 0) + 완료 마커 검증'으로만 한다.
 *    chrome.exe 존재만 보고 미리 끝내면 압축 해제 도중에 100%로 오판하므로 금지.
 *  - stdout 파싱으로 퍼센트 콜백 전달.
 */
export function installBrowserAsync(onProgress?: (percent: number) => void): Promise<void> {
  const cliPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright', 'cli.js')
    : path.join(process.cwd(), 'node_modules', 'playwright', 'cli.js')

  logger.info(`playwright install: cli=${cliPath}`)

  // 자식 프로세스가 Node 모드 충돌 없이 돌도록 ELECTRON_RUN_AS_NODE 제거.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  return new Promise((resolve, reject) => {
    let settled = false

    const child = utilityProcess.fork(cliPath, ['install', 'chromium'], {
      env,
      stdio: 'pipe'
    })

    const settle = (ok: boolean, err?: Error): void => {
      if (settled) return
      settled = true
      clearInterval(markerPoll)
      if (ok) { onProgress?.(100); resolve() }
      else reject(err)
    }

    // stdout: "52% of 286.4 Mb" 패턴 파싱 (실제 완료 전까지 99%로 캡)
    child.stdout?.on('data', (data: Buffer) => {
      const m = data.toString().match(/(\d+)%/)
      if (m && onProgress) onProgress(Math.min(parseInt(m[1]), 99))
    })
    // stderr drain — 버퍼 막힘 방지
    child.stderr?.on('data', () => undefined)

    // 완료의 1차 기준: 프로세스 정상 종료 + 마커 검증.
    child.once('exit', (code) => {
      logger.info(`playwright install exit: ${code}, ready=${isBrowserReady()}`)
      if (code === 0 && isBrowserReady()) settle(true)
      else if (code === 0)
        settle(false, new Error('설치가 종료됐지만 Chromium 실행 파일을 확인할 수 없습니다.'))
      else settle(false, new Error(`playwright install 실패 (exit ${code})`))
    })

    // Fallback: 프로세스가 hang해도 '완료 마커'가 생기면 완료 처리.
    // chrome.exe가 아니라 마커를 보기 때문에 더 이상 조기 완료되지 않는다.
    const markerPoll = setInterval(() => {
      if (isBrowserReady()) {
        logger.info('install: completion marker detected — resolving')
        settle(true)
      }
    }, 3000)
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

  // launch 직전 readiness 재확인 — 설치가 반쪽이거나 폴더가 지워진 경우
  // playwright의 원시 "Executable doesn't exist" 대신 명확한 메시지로 안내.
  if (!isBrowserReady()) {
    const execPath = chromiumExecPath()
    logger.info(`Browser not ready before launch: execPath=${execPath}`)
    throw new Error(
      'Chromium이 설치되어 있지 않거나 설치가 완전하지 않습니다. 앱을 다시 실행하면 자동으로 재설치됩니다.'
    )
  }

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
