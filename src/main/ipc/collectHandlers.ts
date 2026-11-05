import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { runPipeline, abortPipeline, PipelineEvent } from '../core/pipeline'
import { ADAPTERS } from '../core/sources/registry'
import { logger } from '../log/logger'
import type { CompanyTypeCode } from '../../shared/companyTypes'

export function registerCollectHandlers(win: BrowserWindow): void {
  let collecting = false
  ipcMain.handle('collect:start', async (_evt, payload: {
    sourceIds: string[]
    filters: {
      keyword?: string
      region_sido?: string
      region_code?: string
      region_sub_codes?: string[]
      industry?: string
      industries?: string[]
      company_types?: CompanyTypeCode[]
      max_count?: number
      min_employee?: number
      exclude_recruitment_agencies?: boolean
    }
    options: { delayMs?: number; schedulerMode?: 'reserved' | 'staged' | 'shared' }
  }) => {
    if (collecting) return { ok: false, error: '수집 또는 보강이 진행 중입니다.' }
    const runId = randomUUID().slice(0, 8)
    logger.info(`collect:start runId=${runId} sources=${payload.sourceIds.join(',')}`)

    const sources = ADAPTERS.filter(a => payload.sourceIds.includes(a.id))
    if (!sources.length) return { ok: false, error: '선택된 소스가 없습니다.' }

    collecting = true
    // 비동기 실행 — 완료 전에 바로 runId 반환
    setImmediate(async () => {
      try {
        await runPipeline({
          sources,
          filters: payload.filters,
          runOptions: { runId, delayMs: payload.options.delayMs, schedulerMode: payload.options.schedulerMode },
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
      } finally {
        collecting = false
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
