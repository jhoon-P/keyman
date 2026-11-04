/** 유한 대기열. close는 남은 작업을 처리하고, cancel은 대기 작업을 버린다. */
export class WorkQueue<T> {
  private items: T[] = []
  private closed = false
  private waiters: Array<() => void> = []
  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid queue capacity')
  }
  get size(): number { return this.items.length }
  private changed(): void { this.waiters.splice(0).forEach(resolve => resolve()) }
  async push(item: T): Promise<boolean> {
    while (!this.closed && this.items.length >= this.capacity) {
      await new Promise<void>(resolve => this.waiters.push(resolve))
    }
    if (this.closed) return false
    this.items.push(item)
    this.changed()
    return true
  }
  async take(): Promise<T | undefined> {
    while (!this.closed && this.items.length === 0) {
      await new Promise<void>(resolve => this.waiters.push(resolve))
    }
    const item = this.items.shift()
    this.changed()
    return item
  }
  close(): void { this.closed = true; this.changed() }
  cancel(): void { this.items = []; this.close() }
}
