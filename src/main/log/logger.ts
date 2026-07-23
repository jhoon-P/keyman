import { createWriteStream, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

let _logDir: string | null = null

function resolveLogDir(): string {
  if (_logDir) return _logDir
  _logDir = process.env['NODE_ENV'] !== 'development'
    ? join(app.getPath('userData'), 'logs')
    : join(process.cwd(), 'logs')
  return _logDir
}

function ensureDir(): void {
  try {
    mkdirSync(resolveLogDir(), { recursive: true })
  } catch {
    // already exists
  }
}

/** 한국시간(UTC+9) 기준 Date — 로그·파일명이 DB 저장 시각(KST)과 같은 기준을 쓰도록 통일 */
function kstDate(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function dateTag(): string {
  return kstDate().toISOString().slice(0, 10).replace(/-/g, '')
}

function timestamp(): string {
  // 예: 2026-07-24 09:15:30.123+09:00
  return kstDate().toISOString().replace('T', ' ').replace('Z', '+09:00')
}

let appStream: ReturnType<typeof createWriteStream> | null = null
let collectStream: ReturnType<typeof createWriteStream> | null = null
let currentRunId: string | null = null

function getAppStream(): ReturnType<typeof createWriteStream> {
  ensureDir()
  if (!appStream) {
    const p = join(resolveLogDir(), `app-${dateTag()}.txt`)
    appStream = createWriteStream(p, { flags: 'a', encoding: 'utf8' })
  }
  return appStream
}

function writeLine(stream: ReturnType<typeof createWriteStream>, level: Level, msg: string): void {
  stream.write(`[${timestamp()}] [${level}] ${msg}\n`)
}

export const logger = {
  debug: (msg: string) => writeLine(getAppStream(), 'DEBUG', msg),
  info: (msg: string) => writeLine(getAppStream(), 'INFO', msg),
  warn: (msg: string) => writeLine(getAppStream(), 'WARN', msg),
  error: (msg: string, err?: unknown) => {
    const detail = err instanceof Error ? `\n${err.stack}` : err != null ? ` ${String(err)}` : ''
    writeLine(getAppStream(), 'ERROR', msg + detail)
  },

  startCollectRun(runId: string): void {
    ensureDir()
    currentRunId = runId
    const p = join(resolveLogDir(), `collect-${runId}.txt`)
    collectStream = createWriteStream(p, { flags: 'a', encoding: 'utf8' })
    this.collect('INFO', `=== collect run started: ${runId} ===`)
  },

  collect(level: Level, msg: string, err?: unknown): void {
    const detail = err instanceof Error
      ? `\n${err.stack ?? err.message}`
      : err != null ? ` ${String(err)}` : ''
    const full = msg + detail
    if (collectStream) writeLine(collectStream, level, full)
    writeLine(getAppStream(), level, `[run:${currentRunId ?? '?'}] ${full}`)
  },

  endCollectRun(): void {
    if (collectStream) {
      this.collect('INFO', `=== collect run ended: ${currentRunId} ===`)
      collectStream.end()
      collectStream = null
    }
    currentRunId = null
  },

  getLogDir: () => resolveLogDir()
}
