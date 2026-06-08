import { contextBridge, ipcRenderer } from 'electron'

export type CollectEvent =
  | { type: 'progress'; current: number; total?: number; company_name: string }
  | { type: 'log'; level: 'INFO' | 'WARN' | 'ERROR'; message: string }
  | { type: 'blocked'; source: string }
  | { type: 'done'; count: number; runId: string }

const api = {
  // --- 수집 ---
  collect: {
    start: (payload: {
      sourceIds: string[]
      filters: {
        keyword?: string
        region_sido?: string
        region_sigungu?: string
        job_category?: string
        max_count?: number
      }
      options: { delayMs?: number }
    }) => ipcRenderer.invoke('collect:start', payload),

    stop: () => ipcRenderer.invoke('collect:stop'),

    onEvent: (cb: (evt: CollectEvent) => void) => {
      ipcRenderer.on('collect:event', (_e, evt) => cb(evt))
      return () => ipcRenderer.removeAllListeners('collect:event')
    }
  },

  // --- 데이터 ---
  data: {
    query: (q: {
      search?: string
      region_sido?: string
      industry?: string
      phone_status?: string
      limit?: number
      offset?: number
    }) => ipcRenderer.invoke('data:query', q),

    getById: (id: number) => ipcRenderer.invoke('data:getById', id),
    delete: (id: number) => ipcRenderer.invoke('data:delete', id),
    deleteAll: () => ipcRenderer.invoke('data:deleteAll'),
    update: (company: unknown) => ipcRenderer.invoke('data:update', company),
    stats: () => ipcRenderer.invoke('data:stats')
  },

  // --- 내보내기 ---
  export: {
    csv: (payload: { query?: unknown; fields?: string[] }) => ipcRenderer.invoke('export:csv', payload),
    xlsx: (payload: { query?: unknown; fields?: string[] }) => ipcRenderer.invoke('export:xlsx', payload)
  },

  // --- 앱 정보 ---
  app: {
    adapterCatalog: () => ipcRenderer.invoke('app:adapterCatalog'),
    logDir: () => ipcRenderer.invoke('app:logDir'),
    version: () => ipcRenderer.invoke('app:version')
  },

  // --- 자동 업데이트 ---
  updater: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onAvailable: (cb: (info: { version: string }) => void) => {
      ipcRenderer.on('update:available', (_e, info) => cb(info))
      return () => ipcRenderer.removeAllListeners('update:available')
    },
    onProgress: (cb: (p: { percent: number }) => void) => {
      ipcRenderer.on('update:progress', (_e, p) => cb(p))
      return () => ipcRenderer.removeAllListeners('update:progress')
    },
    onReady: (cb: () => void) => {
      ipcRenderer.on('update:ready', () => cb())
      return () => ipcRenderer.removeAllListeners('update:ready')
    }
  },

  // --- 창 제어 ---
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close')
  }
}

contextBridge.exposeInMainWorld('api', api)

// 타입 선언용 (renderer에서 import 없이 window.api 사용)
export type ElectronAPI = typeof api
