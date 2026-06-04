/** 안전 수집용 rate limiter: 지연 + 지터 + 지수 backoff */

export interface RateLimitOptions {
  minDelayMs?: number   // 기본 2000
  maxDelayMs?: number   // 기본 5000
  maxRetries?: number   // 기본 3
}

function jitter(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
      return await fn()
    } catch (err) {
      attempt++
      if (attempt > maxRetries) throw err
      const backoff = Math.min(1000 * 2 ** attempt, 30000)
      await sleep(backoff + jitter(0, 1000))
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
