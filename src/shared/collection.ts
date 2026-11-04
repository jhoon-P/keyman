export interface CollectionStatus {
  phase: 'collecting' | 'enriching' | 'stopping' | 'stopped' | 'done'
  stopReason?: 'limit' | 'exhausted' | 'blocked' | 'stopped' | 'error'
  sharedWorkers?: number
  sharedActive?: number
  detailReserved?: number
  saved: number
  detailFailed: number
  detailWorkers: number
  detailActive: number
  detailQueued: number
  detailReady: number
  detailCompleted: number
  homepageWorkers: number
  homepageActive: number
  homepageQueued: number
  homepageCompleted: number
  homepageFailed: number
  homepageTimedOut: number
}
