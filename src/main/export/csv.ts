import { writeFileSync } from 'fs'
import { Company } from '../db/repository'

type FieldKey = keyof typeof FIELD_MAP
export const FIELD_MAP = {
  '회사명':       (r: Company) => r.company_name,
  '대표번호':     (r: Company) => r.main_phone ?? '',
  '전화상태':     (r: Company) => r.phone_status === 'verified' ? '검증됨' : r.phone_status === 'unverified' ? '미검증' : '없음',
  '주소':         (r: Company) => r.address ?? '',
  '시/도':        (r: Company) => r.region_sido ?? '',
  '시군구':       (r: Company) => r.region_sigungu ?? '',
  '업종':         (r: Company) => r.industry ?? '',
  '근로자수':     (r: Company) => r.employee_count ?? '',
  '조직도(부서)': (r: Company) => r.departments ? r.departments.join(', ') : '',
  '홈페이지':     (r: Company) => r.homepage_url ?? '',
  '채용공고링크': (r: Company) => r.job_url ?? '',
  '수집시각':     (r: Company) => r.updated_at ?? '',
} as const

export const ALL_EXPORT_FIELDS = Object.keys(FIELD_MAP) as FieldKey[]

export async function exportToCsv(rows: Company[], filePath: string, fields: string[] = ALL_EXPORT_FIELDS): Promise<void> {
  const selected = fields.filter((f): f is FieldKey => f in FIELD_MAP)

  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const lines = [selected.join(',')]
  for (const r of rows) {
    lines.push(selected.map(f => escape(FIELD_MAP[f](r))).join(','))
  }

  writeFileSync(filePath, '﻿' + lines.join('\r\n'), 'utf8') // BOM for Excel
}
