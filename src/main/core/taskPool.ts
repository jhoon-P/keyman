export interface PoolState { queued: number; active: number }

/** 독립 작업자 풀. 같은 key(홈페이지 도메인)는 동시에 실행하지 않는다. */
export class TaskPool {
  private queue: Array<{ key: string; run: () => Promise<void> }> = []
  private keys = new Set<string>()
  private active = 0
  private closed = false
  private waiters: Array<() => void> = []
  constructor(
    readonly concurrency: number,
    readonly capacity: number,
    private readonly onChange: (state: PoolState) => void,
    private readonly onError: (error: unknown) => void
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid worker pool limits')
  }
  private changed(): void {
    this.onChange({ queued: this.queue.length, active: this.active })
    this.waiters.splice(0).forEach(resolve => resolve())
  }
  async add(key: string, run: () => Promise<void>): Promise<boolean> {
    while (!this.closed && this.queue.length >= this.capacity) {
      await new Promise<void>(resolve => this.waiters.push(resolve))
    }
    if (this.closed) return false
    this.queue.push({ key, run })
    this.pump()
    return true
  }
  private pump(): void {
    while (this.active < this.concurrency) {
      const index = this.queue.findIndex(task => !this.keys.has(task.key))
      if (index < 0) break
      const [task] = this.queue.splice(index, 1)
      this.keys.add(task.key)
      this.active++
      void Promise.resolve().then(task.run).catch(this.onError).finally(() => {
        this.active--
        this.keys.delete(task.key)
        this.pump()
      })
    }
    this.changed()
  }
  cancel(): void { this.queue = []; this.closed = true; this.changed() }
  async finish(): Promise<void> {
    this.closed = true
    this.changed()
    while (this.active || this.queue.length) {
      await new Promise<void>(resolve => this.waiters.push(resolve))
    }
  }
}
