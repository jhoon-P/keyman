export type ExportScope = 'recent' | 'all'

export interface ExportHistoryEntry {
  id: number
  filePath: string
  format: 'csv' | 'xlsx'
  scope: ExportScope
  count: number
  exportedAt: string
}

export interface ExportSummary {
  total: number
  recent: number
  history: ExportHistoryEntry[]
}
