import { allRows } from '../db/repository'
import { normalizeCompanyName } from './normalize'

interface DedupResult {
  existingId: number | null
  matchKey: string
}

function query(sql: string, params: (string | number | null)[]): { id: number } | undefined {
  const rows = allRows(sql, params) as { id: number }[]
  return rows[0]
}

export function findDuplicate(opts: {
  biz_reg_no?: string
  company_name: string
  address?: string
  main_phone?: string
}): DedupResult {
  if (opts.biz_reg_no) {
    const row = query(
      `SELECT id FROM companies WHERE biz_reg_no = ? AND biz_reg_no IS NOT NULL`,
      [opts.biz_reg_no]
    )
    if (row) return { existingId: row.id, matchKey: 'biz_reg_no' }
  }

  const normName = normalizeCompanyName(opts.company_name)

  if (opts.address) {
    const row = query(
      `SELECT id FROM companies WHERE company_name = ? AND address IS NOT NULL AND address = ?`,
      [normName, opts.address]
    )
    if (row) return { existingId: row.id, matchKey: 'name+address' }
  }

  if (opts.main_phone) {
    const row = query(
      `SELECT id FROM companies WHERE company_name = ? AND main_phone IS NOT NULL AND main_phone = ?`,
      [normName, opts.main_phone]
    )
    if (row) return { existingId: row.id, matchKey: 'name+phone' }
  }

  return { existingId: null, matchKey: '' }
}
