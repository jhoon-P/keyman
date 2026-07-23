import { ipcMain, dialog } from 'electron'
import { exportToCsv } from '../export/csv'
import { exportToXlsx } from '../export/xlsx'
import { queryCompanies, CompanyQuery } from '../db/repository'
import { nowKst } from '../core/time'
import { logger } from '../log/logger'

export function registerExportHandlers(): void {
  ipcMain.handle('export:csv', async (_evt, payload: { query?: CompanyQuery; fields?: string[] }) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'CSV로 내보내기',
        defaultPath: `companies-${nowKst().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (!filePath) return { ok: false, cancelled: true }

      const { rows } = queryCompanies({ ...(payload.query ?? {}), limit: 100000 })
      await exportToCsv(rows, filePath, payload.fields)
      logger.info(`export:csv saved to ${filePath} (${rows.length}rows)`)
      return { ok: true, filePath, count: rows.length }
    } catch (err) {
      logger.error('export:csv error', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('export:xlsx', async (_evt, payload: { query?: CompanyQuery; fields?: string[] }) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'XLSX로 내보내기',
        defaultPath: `companies-${nowKst().slice(0, 10)}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      })
      if (!filePath) return { ok: false, cancelled: true }

      const { rows } = queryCompanies({ ...(payload.query ?? {}), limit: 100000 })
      await exportToXlsx(rows, filePath, payload.fields)
      logger.info(`export:xlsx saved to ${filePath} (${rows.length}rows)`)
      return { ok: true, filePath, count: rows.length }
    } catch (err) {
      logger.error('export:xlsx error', err)
      return { ok: false, error: String(err) }
    }
  })
}
