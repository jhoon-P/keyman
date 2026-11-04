/** 안전 수집용 rate limiter: 지연 + 지터 + 지수 backoff */

export interface RateLimitOptions {
  minDelayMs?: number   // 기본 2000
  maxDelayMs?: number   // 기본 5000
  maxRetries?: number   // 기본 3
  signal?: AbortSignal
}

function jitter(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, Math.max(0, ms))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

export function abortError(): Error {
  const error = new Error('수집이 중지되었습니다.')
  error.name = 'AbortError'
  return error
}

/** 모든 작업자가 공유하는 요청 시작 간격. 대기 중 취소해도 다음 요청을 막지 않는다. */
export function createRequestGate(delayMs: number): (signal?: AbortSignal) => Promise<void> {
  const interval = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 500
  let tail = Promise.resolve()
  let lastStart: number | undefined
  return signal => {
    const request = tail.then(async () => {
      if (signal?.aborted) throw abortError()
      const wait = lastStart == null ? 0 : Math.max(0, interval - (Date.now() - lastStart))
      if (wait > 0) await sleep(wait, signal)
      if (signal?.aborted) throw abortError()
      lastStart = Date.now()
    })
    tail = request.catch(() => undefined)
    return request
  }
}

export async function withDelay(
  fn: () => Promise<void>,
  opts: RateLimitOptions = {}
): Promise<void> {
  const min = opts.minDelayMs ?? 2000
  const max = opts.maxDelayMs ?? 5000
  await fn()
  await sleep(jitter(min, max))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RateLimitOptions = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3
  let attempt = 0
  while (true) {
    try {
      if (opts.signal?.aborted) throw abortError()
      return await fn()
    } catch (err) {
      if (opts.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) throw err
      attempt++
      if (attempt > maxRetries) throw err
      const backoff = Math.min(1000 * 2 ** attempt, 30000)
      await sleep(backoff + jitter(0, 1000), opts.signal)
    }
  }
}

export function isBlockedResponse(html: string): boolean {
  const lower = html.toLowerCase()
  return (
    lower.includes('captcha') ||
    lower.includes('자동화된 접근') ||
    lower.includes('비정상적인 접근') ||
    lower.includes('access denied') ||
    lower.includes('403 forbidden')
  )
}
