import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { runPipeline, abortPipeline, PipelineEvent } from '../core/pipeline'
import { getPublicCollectionStatus } from '../core/collectionPolicy'
import { ADAPTERS } from '../core/sources/registry'
import { logger } from '../log/logger'
import type { CompanyTypeCode } from '../../shared/companyTypes'

export function registerCollectHandlers(win: BrowserWindow, checkForUpdates: () => void): void {
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
      excluded_keywords?: string[]
    }
    options: { delayMs?: number; schedulerMode?: 'reserved' | 'staged' | 'shared' }
  }) => {
    if (collecting) return { ok: false, error: '수집 또는 보강이 진행 중입니다.' }
    const sources = ADAPTERS.filter(a => payload.sourceIds.includes(a.id))
    if (!sources.length) return { ok: false, error: '선택된 소스가 없습니다.' }

    collecting = true
    const policyStatus = __LOCAL_COLLECTION__ ? 'allowed' : await getPublicCollectionStatus()
    if (policyStatus !== 'allowed') {
      collecting = false
      if (policyStatus === 'update-required') checkForUpdates()
      const error = policyStatus === 'update-required'
        ? '수집에 새 버전이 필요합니다. 업데이트를 확인합니다.'
        : 'Saramin collection is unavailable.'
      return { ok: false, error }
    }

    const runId = randomUUID().slice(0, 8)
    logger.info(`collect:start runId=${runId} sources=${payload.sourceIds.join(',')}`)
    // 비동기 실행 — 완료 전에 바로 runId 반환
    setImmediate(async () => {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('collect:event', {
            type: 'started', sourceIds: payload.sourceIds, targetCount: payload.filters.max_count
          })
        }
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
