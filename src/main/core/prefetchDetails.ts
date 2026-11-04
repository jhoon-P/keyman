import { CompanyRef, RawRecord } from './sources/types'
import { createRequestGate } from './rateLimiter'
import { WorkQueue } from './workQueue'

type DetailResult =
  | { ref: CompanyRef; ok: true; raw: RawRecord }
  | { ref: CompanyRef; ok: false; error: unknown }
export interface DetailState { queued: number; active: number; ready: number; completed: number }

/** 목록 생산자와 상세 작업자는 소비자/저장 순서와 독립적으로 실행한다. 결과는 완료 순서다. */
export async function* prefetchDetails(
  refs: (signal: AbortSignal) => AsyncIterable<CompanyRef>,
  fetch: (ref: CompanyRef, signal: AbortSignal) => Promise<RawRecord>,
  opts: {
    concurrency: number
    shouldContinue: () => boolean
    delayMs: number
    signal?: AbortSignal
    onState?: (state: DetailState) => void
  }
): AsyncGenerator<DetailResult> {
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) throw new Error('Invalid detail worker count')
  const controller = new AbortController()
  const input = new WorkQueue<CompanyRef>(opts.concurrency * 2)
  const output = new WorkQueue<DetailResult>(opts.concurrency * 2)
  const cancel = () => { controller.abort(); input.cancel(); output.cancel() }
  opts.signal?.addEventListener('abort', cancel, { once: true })
  if (opts.signal?.aborted) cancel()
  const gate = createRequestGate(opts.delayMs)
  let active = 0
  let completed = 0
  let searchFailure: { error: unknown } | undefined
  const report = () => opts.onState?.({ queued: input.size, active, ready: output.size, completed })
  const producer = (async () => {
    try {
      for await (const ref of refs(controller.signal)) {
        if (controller.signal.aborted || !opts.shouldContinue() || !await input.push(ref)) break
        report()
      }
    } catch (error) {
      if (!controller.signal.aborted) searchFailure = { error }
    } finally { input.close(); report() }
  })()
  const workers = Array.from({ length: opts.concurrency }, async () => {
    while (!controller.signal.aborted) {
      const ref = await input.take()
      if (!ref) break
      if (!opts.shouldContinue()) { input.cancel(); break }
      try { await gate(controller.signal) } catch { break }
      if (controller.signal.aborted || !opts.shouldContinue()) { input.cancel(); break }
      active++; report()
      let result: DetailResult
      try { result = { ref, ok: true, raw: await fetch(ref, controller.signal) } }
      catch (error) { result = { ref, ok: false, error } }
      finally { active--; completed++; report() }
      if (controller.signal.aborted || !await output.push(result)) break
      report()
    }
  })
  const finished = Promise.all(workers).then(() => { output.close(); report() })
  try {
    while (true) {
      const result = await output.take()
      report()
      if (!result) break
      yield result
    }
    if (searchFailure) throw searchFailure.error
  } finally {
    cancel()
    await Promise.allSettled([producer, finished])
    opts.signal?.removeEventListener('abort', cancel)
    report()
  }
}
