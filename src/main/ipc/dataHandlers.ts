import { ipcMain } from 'electron'
import {
  queryCompanies,
  getCompanyById,
  deleteCompany,
  deleteAllCompanies,
  upsertCompany,
  getStats,
  CompanyQuery
} from '../db/repository'
import { logger } from '../log/logger'

export function registerDataHandlers(): void {
  ipcMain.handle('data:query', (_evt, q: CompanyQuery) => {
    try {
      return queryCompanies(q)
    } catch (err) {
      logger.error('data:query error', err)
      return { rows: [], total: 0 }
    }
  })

  ipcMain.handle('data:getById', (_evt, id: number) => {
    try {
      return getCompanyById(id)
    } catch (err) {
      logger.error('data:getById error', err)
      return null
    }
  })

  ipcMain.handle('data:delete', (_evt, id: number) => {
    try {
      deleteCompany(id)
      return { ok: true }
    } catch (err) {
      logger.error('data:delete error', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:update', (_evt, company) => {
    try {
      const id = upsertCompany({ ...company, phone_status: company.phone_status ?? 'unverified' })
      return { ok: true, id }
    } catch (err) {
      logger.error('data:update error', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:deleteAll', () => {
    try {
      deleteAllCompanies()
      return { ok: true }
    } catch (err) {
      logger.error('data:deleteAll error', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:stats', () => {
    try {
      return getStats()
    } catch (err) {
      logger.error('data:stats error', err)
      return { total: 0, verified: 0, unverified: 0 }
    }
  })
}
