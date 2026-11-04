import { abortError, sleep } from './rateLimiter'

export type PageKind = 'detail' | 'homepage'
export interface PageScheduleState {
  active: number
  detailReserved: number
  detailActive: number
  homepageActive: number
  detailQueued: number
  homepageQueued: number
}
interface TaskOptions {
  kind: PageKind
  key?: string
  signal?: AbortSignal
  rateKey?: string
  intervalMs?: number
  usesSlot?: boolean
  deferRateUntilRequest?: boolean
  prepareDuringRateWait?: boolean
}
interface Job extends TaskOptions {
  run: (markRequestStart: () => void | Promise<void>) => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  detach: () => void
}

/** 페이지 슬롯을 공유하고 상세 자리를 확보한다. 탭을 미리 준비하면 대기도 활성 슬롯에 포함한다. */
export class PageScheduler {
  private queue: Job[] = []
  private active = 0
  private running = 0
  private byKind = { detail: 0, homepage: 0 }
  private keys = new Set<string>()
  private preparing = new Set<string>()
  private nextStart = new Map<string, number>()
  private turn: PageKind = 'detail'
  private closed = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private waiters: Array<() => void> = []
  private detailReserved: number

  constructor(
    readonly concurrency: number,
    private readonly capacity: number,
    private readonly onChange: (state: PageScheduleState) => void,
    options: { detailReserved?: number } = {}
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid page scheduler limits')
    const reserved = options.detailReserved ?? 0
    if (!Number.isInteger(reserved) || reserved < 0 || reserved >= concurrency) throw new Error('Invalid detail reservation')
    this.detailReserved = reserved
  }

  private changed(): void {
    this.onChange({ active: this.active, detailReserved: this.detailReserved, detailActive: this.byKind.detail, homepageActive: this.byKind.homepage,
      detailQueued: this.queue.filter(job => job.kind === 'detail').length,
      homepageQueued: this.queue.filter(job => job.kind === 'homepage').length })
    this.waiters.splice(0).forEach(resolve => resolve())
  }

  async schedule<T>(opts: TaskOptions, run: (markRequestStart: () => void | Promise<void>) => Promise<T>): Promise<T> {
    if (opts.prepareDuringRateWait && !opts.deferRateUntilRequest) throw new Error('Page preparation requires an explicit request marker')
    while (!this.closed && !opts.signal?.aborted && this.queue.length >= this.capacity) {
      await new Promise<void>(resolve => {
        const wake = () => { opts.signal?.removeEventListener('abort', wake); resolve() }
        this.waiters.push(wake)
        opts.signal?.addEventListener('abort', wake, { once: true })
      })
    }
    if (this.closed || opts.signal?.aborted) throw abortError()
    return new Promise<T>((resolve, reject) => {
      const job: Job = { ...opts, run, resolve: value => resolve(value as T), reject, detach: () => {} }
      const abort = () => {
        const index = this.queue.indexOf(job)
        if (index < 0) return
        this.queue.splice(index, 1)
        job.detach()
        reject(abortError())
        this.pump()
      }
      job.detach = () => opts.signal?.removeEventListener('abort', abort)
      opts.signal?.addEventListener('abort', abort, { once: true })
      this.queue.push(job)
      this.pump()
    })
  }

  private available(job: Job): boolean {
    const hasSlot = job.usesSlot === false || (this.active < this.concurrency &&
      (job.kind !== 'homepage' || this.byKind.homepage < this.concurrency - this.detailReserved))
    return hasSlot && (!job.key || !this.keys.has(job.key)) && (!job.rateKey || !this.preparing.has(job.rateKey))
  }
  private readyAt(job: Job): number { return job.rateKey && !job.prepareDuringRateWait ? this.nextStart.get(job.rateKey) ?? 0 : 0 }

  private pump(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    while (true) {
      const now = Date.now()
      const ready = (job: Job) => this.available(job) && this.readyAt(job) <= now
      const preferred = this.detailReserved > 0 ? 'detail' : this.turn
      let index = this.queue.findIndex(job => job.kind === preferred && ready(job))
      if (index < 0) index = this.queue.findIndex(ready)
      if (index < 0) break
      const [job] = this.queue.splice(index, 1)
      job.detach()
      if (job.signal?.aborted) { job.reject(abortError()); continue }
      const usesSlot = job.usesSlot !== false
      if (usesSlot) {
        this.active++
        this.byKind[job.kind]++
        this.turn = job.kind === 'detail' ? 'homepage' : 'detail'
      }
      this.running++
      if (job.key) this.keys.add(job.key)
      let marked = false
      const commitRequestStart = () => {
        if (marked || !job.rateKey) return
        marked = true
        this.preparing.delete(job.rateKey)
        const interval = Number.isFinite(job.intervalMs) ? Math.max(0, job.intervalMs!) : 0
        this.nextStart.set(job.rateKey, Date.now() + interval)
        if (job.deferRateUntilRequest) this.pump()
      }
      let requestStart: Promise<void> | undefined
      const markRequestStart = (): void | Promise<void> => {
        if (!job.prepareDuringRateWait) return commitRequestStart()
        requestStart ??= (async () => {
          if (job.signal?.aborted) throw abortError()
          // 확보한 상세 슬롯 하나에서 다음 탭을 미리 준비한다. 실제 요청은 기존 간격을 지킨다.
          while (job.rateKey && (this.nextStart.get(job.rateKey) ?? 0) > Date.now()) {
            await sleep(this.nextStart.get(job.rateKey)! - Date.now(), job.signal)
          }
          if (job.signal?.aborted) throw abortError()
          commitRequestStart()
        })()
        return requestStart
      }
      if (job.rateKey && job.deferRateUntilRequest) this.preparing.add(job.rateKey)
      else markRequestStart()
      const settle = (ok: boolean, value: unknown) => {
        this.running--
        if (job.rateKey && !marked) this.preparing.delete(job.rateKey)
        if (usesSlot) { this.active--; this.byKind[job.kind]-- }
        if (job.key) this.keys.delete(job.key)
        if (ok) job.resolve(value)
        else job.reject(value)
        this.pump()
      }
      void Promise.resolve().then(() => job.run(markRequestStart)).then(value => settle(true, value), error => settle(false, error))
    }
    const delayed = this.queue.filter(job => this.available(job)).map(job => this.readyAt(job))
    if (delayed.length) this.timer = setTimeout(() => this.pump(), Math.max(1, Math.min(...delayed) - Date.now()))
    this.changed()
  }

  /** 상세 생산/조회 정리가 끝난 뒤 예약을 풀어 잔여 홈페이지가 모든 슬롯을 사용하게 한다. */
  releaseDetailReservation(): void {
    this.detailReserved = 0
    this.pump()
  }

  cancel(): void {
    this.closed = true
    clearTimeout(this.timer)
    this.timer = undefined
    this.queue.splice(0).forEach(job => { job.detach(); job.reject(abortError()) })
    this.changed()
  }

  async finish(): Promise<void> {
    this.closed = true
    this.changed()
    while (this.running || this.queue.length) await new Promise<void>(resolve => this.waiters.push(resolve))
    clearTimeout(this.timer)
  }
}
