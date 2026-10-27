import { ipcMain, dialog } from 'electron'
import { exportToCsv, ALL_EXPORT_FIELDS } from '../export/csv'
import { exportToXlsx } from '../export/xlsx'
import { queryCompanies, getExportSummary, recordExport, CompanyQuery } from '../db/repository'
import { nowKst } from '../core/time'
import { logger } from '../log/logger'
import type { ExportScope } from '../../shared/export'

type ExportPayload = { query?: CompanyQuery; fields?: string[]; scope?: ExportScope }

export function registerExportHandlers(): void {
  let busy = false
  ipcMain.handle('export:summary', () => getExportSummary())
  for (const format of ['csv', 'xlsx'] as const) {
    ipcMain.handle(`export:${format}`, async (_evt, payload: ExportPayload = {}) => {
      if (busy) return { ok: false, error: '이미 내보내기가 진행 중입니다.' }
      busy = true
      try {
        const scope = payload.scope ?? 'recent'
        if (scope !== 'recent' && scope !== 'all') throw new Error('내보내기 대상을 확인해 주세요.')
        const fields = (payload.fields ?? ALL_EXPORT_FIELDS).filter(field => ALL_EXPORT_FIELDS.includes(field as typeof ALL_EXPORT_FIELDS[number]))
        if (!fields.length) throw new Error('포함할 필드를 하나 이상 선택해 주세요.')
        // 저장 대화창을 연 뒤 새 수집이 시작되어도 선택한 회사 목록을 유지한다.
        const { rows } = queryCompanies({ ...(payload.query ?? {}), recent_collection_only: scope === 'recent', limit: -1, offset: 0 })
        if (!rows.length) return { ok: false, error: '내보낼 데이터가 없습니다. 대상을 변경하거나 새 데이터를 수집해 주세요.' }
        const { filePath } = await dialog.showSaveDialog({
          title: `${format.toUpperCase()}로 내보내기`,
          defaultPath: `companies-${scope}-${nowKst().replace(/[^0-9]/g, '')}.${format}`,
          filters: [{ name: format === 'csv' ? 'CSV' : 'Excel', extensions: [format] }]
        })
        if (!filePath) return { ok: false, cancelled: true }
        await (format === 'csv' ? exportToCsv : exportToXlsx)(rows, filePath, fields)
        try {
          recordExport(rows.map(row => row.id!), filePath, format, scope)
        } catch (error) {
          logger.error('export history save error', error)
          return { ok: false, error: `파일은 저장되었지만 내보내기 이력 저장에 실패했습니다. 최근 내보내기 목록에 표시되지 않을 수 있습니다. (${filePath})` }
        }
        logger.info(`export:${format} saved to ${filePath} (${rows.length} rows, ${scope})`)
        return { ok: true, filePath, count: rows.length }
      } catch (err) {
        logger.error(`export:${format} error`, err)
        return { ok: false, error: String(err) }
      } finally {
        busy = false
      }
    })
  }
}
