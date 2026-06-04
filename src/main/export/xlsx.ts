import ExcelJS from 'exceljs'
import { Company } from '../db/repository'
import { FIELD_MAP, ALL_EXPORT_FIELDS } from './csv'

const COL_WIDTHS: Record<string, number> = {
  '회사명': 30, '대표번호': 18, '전화상태': 12, '주소': 40,
  '시/도': 14, '시군구': 14, '업종': 20, '근로자수': 12,
  '조직도(부서)': 30, '홈페이지': 30, '채용공고링크': 50, '수집시각': 20,
}

export async function exportToXlsx(rows: Company[], filePath: string, fields: string[] = ALL_EXPORT_FIELDS): Promise<void> {
  const selected = fields.filter((f): f is keyof typeof FIELD_MAP => f in FIELD_MAP)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('기업목록')

  ws.columns = selected.map(f => ({
    header: f,
    key: f,
    width: COL_WIDTHS[f] ?? 20
  }))

  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' }
  }

  for (const r of rows) {
    const rowData: Record<string, unknown> = {}
    selected.forEach(f => { rowData[f] = FIELD_MAP[f](r) })
    const row = ws.addRow(rowData)

    if (r.phone_status === 'unverified') {
      const cell = row.getCell('전화상태')
      if (cell) cell.font = { color: { argb: 'FFE26B0A' } }
    }
  }

  const lastCol = String.fromCharCode(64 + selected.length)
  ws.autoFilter = { from: 'A1', to: `${lastCol}1` }

  await wb.xlsx.writeFile(filePath)
}
