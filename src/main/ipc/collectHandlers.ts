import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { runPipeline, abortPipeline, PipelineEvent } from '../core/pipeline'
import { ADAPTERS } from '../core/sources/registry'
import { logger } from '../log/logger'

export function registerCollectHandlers(win: BrowserWindow): void {
  ipcMain.handle('collect:start', async (_evt, payload: {
    sourceIds: string[]
    filters: {
      keyword?: string
      region_sido?: string
      region_sigungu?: string
      industry?: string
      max_count?: number
      min_employee?: number
    }
    options: { delayMs?: number }
  }) => {
    const runId = randomUUID().slice(0, 8)
    logger.info(`collect:start runId=${runId} sources=${payload.sourceIds.join(',')}`)

    const sources = ADAPTERS.filter(a => payload.sourceIds.includes(a.id))
    if (!sources.length) return { ok: false, error: '선택된 소스가 없습니다.' }

    // 비동기 실행 — 완료 전에 바로 runId 반환
    setImmediate(async () => {
      try {
        await runPipeline({
          sources,
          filters: payload.filters,
          runOptions: { runId, delayMs: payload.options.delayMs },
          onEvent: (evt: PipelineEvent) => {
            if (!win.isDestroyed()) win.webContents.send('collect:event', evt)
          }
        })
      } catch (err) {
        logger.error('pipeline error', err)
        if (!win.isDestroyed())
          win.webContents.send('collect:event', {
            type: 'log', level: 'ERROR', message: `파이프라인 오류: ${String(err)}`
          })
      }
    })

    return { ok: true, runId }
  })

  ipcMain.handle('collect:stop', async () => {
    abortPipeline()
    logger.info('collect:stop requested')
    return { ok: true }
  })
}
