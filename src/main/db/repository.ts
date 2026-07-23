import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { mkdirSync } from 'fs'
import { nowKst } from '../core/time'

export type PhoneStatus = 'verified' | 'unverified' | 'none'

export interface RawRecord {
  id?: number
  source: string
  source_url?: string
  raw_json: string
  collected_at?: string
}

export interface Company {
  id?: number
  company_name: string
  main_phone?: string
  phone_status: PhoneStatus
  address?: string
  region_sido?: string
  region_sigungu?: string
  industry?: string
  employee_count?: number
  homepage_url?: string
  job_url?: string
  biz_reg_no?: string
  departments?: string[]
  keyman_candidates?: KeymanCandidate[]
  field_sources?: Record<string, FieldSource>
  raw_record_ids?: number[]
  contacted?: boolean   // 사용자가 '연락했음' 체크한 곳 (수집이 아닌 수동 플래그)
  created_at?: string
  updated_at?: string
}

export interface KeymanCandidate {
  name?: string
  title?: string
  phone?: string
  source: string
}

export interface FieldSource {
  source: string
  source_url?: string
  collected_at: string
}

export type CompanyQuery = {
  search?: string
  region_sido?: string
  industry?: string
  phone_status?: string
  limit?: number
  offset?: number
}

// ---------- DB 초기화 ----------

let _SQL: SqlJsStatic | null = null
let _db: Database | null = null
let _dbPath: string | null = null

function getDbPath(): string {
  const isProd = process.env['NODE_ENV'] !== 'development'
  const dir = isProd ? join(app.getPath('userData'), 'data') : join(process.cwd(), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'companies.db')
}

function getWasmPath(): string {
  const isProd = process.env['NODE_ENV'] !== 'development'
  if (isProd) {
    return join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  }
  return join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

export async function initDb(): Promise<void> {
  if (_db) return
  _SQL = await initSqlJs({ locateFile: () => getWasmPath() })
  _dbPath = getDbPath()
  if (existsSync(_dbPath)) {
    _db = new _SQL.Database(readFileSync(_dbPath))
  } else {
    _db = new _SQL.Database()
  }
  applySchema()
  persist()
}

function applySchema(): void {
  getDb().run(`
    CREATE TABLE IF NOT EXISTS raw_records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source      TEXT NOT NULL,
      source_url  TEXT,
      raw_json    TEXT NOT NULL,
      collected_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS companies (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name     TEXT NOT NULL,
      main_phone       TEXT,
      phone_status     TEXT NOT NULL DEFAULT 'unverified',
      address          TEXT,
      region_sido      TEXT,
      region_sigungu   TEXT,
      industry         TEXT,
      employee_count   INTEGER,
      homepage_url     TEXT,
      job_url          TEXT,
      biz_reg_no       TEXT,
      departments      TEXT,
      keyman_candidates TEXT,
      field_sources    TEXT,
      raw_record_ids   TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name);
    CREATE INDEX IF NOT EXISTS idx_companies_biz_reg_no ON companies(biz_reg_no);
    CREATE INDEX IF NOT EXISTS idx_companies_phone ON companies(main_phone);
  `)
  try { getDb().run(`ALTER TABLE companies ADD COLUMN job_url TEXT;`) } catch (e) { /* ignore */ }
  try { getDb().run(`ALTER TABLE companies ADD COLUMN contacted INTEGER NOT NULL DEFAULT 0;`) } catch (e) { /* ignore */ }
}

export function getDb(): Database {
  if (!_db) throw new Error('DB not initialized — call initDb() first')
  return _db
}

export function persist(): void {
  if (!_db || !_dbPath) return
  writeFileSync(_dbPath, Buffer.from(_db.export()))
}

export function closeDb(): void {
  if (_db) {
    persist()
    _db.close()
    _db = null
  }
}

// ---------- Helper ----------

type Row = Record<string, unknown>

function runQuery(sql: string, params: (string | number | null | undefined)[] = []): void {
  const stmt = getDb().prepare(sql)
  stmt.run(params as (string | number | null)[])
  stmt.free()
}

export function allRows(sql: string, params: (string | number | null | undefined)[] = []): Row[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as (string | number | null)[])
  const rows: Row[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Row)
  }
  stmt.free()
  return rows
}

function firstRow(sql: string, params: (string | number | null | undefined)[] = []): Row | null {
  const rows = allRows(sql, params)
  return rows[0] ?? null
}

function getLastInsertId(): number {
  const row = firstRow(`SELECT last_insert_rowid() as id`)
  return (row?.id as number) ?? 0
}

// ---------- Raw Records ----------

export function insertRawRecord(record: Omit<RawRecord, 'id'>): number {
  runQuery(
    `INSERT INTO raw_records (source, source_url, raw_json, collected_at)
     VALUES (?, ?, ?, ?)`,
    [record.source, record.source_url ?? null, record.raw_json, record.collected_at ?? nowKst()]
  )
  const id = getLastInsertId()
  persist()
  return id
}

// ---------- Companies ----------

function rowToCompany(row: Row): Company {
  return {
    id: row.id as number,
    company_name: row.company_name as string,
    main_phone: (row.main_phone as string) || undefined,
    phone_status: (row.phone_status as PhoneStatus) || 'unverified',
    address: (row.address as string) || undefined,
    region_sido: (row.region_sido as string) || undefined,
    region_sigungu: (row.region_sigungu as string) || undefined,
    industry: (row.industry as string) || undefined,
    employee_count: row.employee_count != null ? Number(row.employee_count) : undefined,
    homepage_url: (row.homepage_url as string) || undefined,
    job_url: (row.job_url as string) || undefined,
    biz_reg_no: (row.biz_reg_no as string) || undefined,
    departments: row.departments ? JSON.parse(row.departments as string) : undefined,
    keyman_candidates: row.keyman_candidates ? JSON.parse(row.keyman_candidates as string) : undefined,
    field_sources: row.field_sources ? JSON.parse(row.field_sources as string) : undefined,
    raw_record_ids: row.raw_record_ids ? JSON.parse(row.raw_record_ids as string) : undefined,
    contacted: !!row.contacted,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string
  }
}

export function upsertCompany(company: Company): number {
  const now = nowKst()
  const params = [
    company.company_name,
    company.main_phone ?? null,
    company.phone_status,
    company.address ?? null,
    company.region_sido ?? null,
    company.region_sigungu ?? null,
    company.industry ?? null,
    company.employee_count ?? null,
    company.homepage_url ?? null,
    company.job_url ?? null,
    company.biz_reg_no ?? null,
    company.departments ? JSON.stringify(company.departments) : null,
    company.keyman_candidates ? JSON.stringify(company.keyman_candidates) : null,
    company.field_sources ? JSON.stringify(company.field_sources) : null,
    company.raw_record_ids ? JSON.stringify(company.raw_record_ids) : null,
    now
  ]
  if (company.id) {
    runQuery(
      `UPDATE companies SET
        company_name=?, main_phone=?, phone_status=?,
        address=?, region_sido=?, region_sigungu=?,
        industry=?, employee_count=?, homepage_url=?, job_url=?,
        biz_reg_no=?, departments=?, keyman_candidates=?,
        field_sources=?, raw_record_ids=?, updated_at=?
       WHERE id=?`,
      [...params, company.id]
    )
    persist()
    return company.id
  }
  runQuery(
    `INSERT INTO companies
      (company_name, main_phone, phone_status, address, region_sido, region_sigungu,
       industry, employee_count, homepage_url, job_url, biz_reg_no, departments, keyman_candidates,
       field_sources, raw_record_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...params, now]
  )
  const id = getLastInsertId()
  persist()
  return id
}

export function queryCompanies(q: CompanyQuery = {}): { rows: Company[]; total: number } {
  const conditions: string[] = []
  const params: (string | number | null)[] = []

  if (q.search) {
    conditions.push(`(company_name LIKE ? OR address LIKE ? OR industry LIKE ?)`)
    const s = `%${q.search}%`
    params.push(s, s, s)
  }
  if (q.region_sido) { conditions.push(`region_sido = ?`); params.push(q.region_sido) }
  if (q.industry) { conditions.push(`industry LIKE ?`); params.push(`%${q.industry}%`) }
  if (q.phone_status) { conditions.push(`phone_status = ?`); params.push(q.phone_status) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const countRow = firstRow(`SELECT COUNT(*) as cnt FROM companies ${where}`, params)
  const total = Number(countRow?.cnt ?? 0)

  const limit = q.limit ?? 100
  const offset = q.offset ?? 0
  const rows = allRows(
    `SELECT * FROM companies ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )
  return { rows: rows.map(rowToCompany), total }
}

export function getCompanyById(id: number): Company | null {
  const row = firstRow(`SELECT * FROM companies WHERE id = ?`, [id])
  return row ? rowToCompany(row) : null
}

/** 연락 여부 플래그만 갱신. upsertCompany와 분리해 재수집 시에도 체크 상태가 보존된다. */
export function setContacted(id: number, contacted: boolean): void {
  runQuery(`UPDATE companies SET contacted = ? WHERE id = ?`, [contacted ? 1 : 0, id])
  persist()
}

export function deleteCompany(id: number): void {
  runQuery(`DELETE FROM companies WHERE id = ?`, [id])
  persist()
}

export function deleteAllCompanies(): void {
  runQuery(`DELETE FROM companies`)
  runQuery(`DELETE FROM raw_records`)
  runQuery(`DELETE FROM sqlite_sequence WHERE name IN ('companies','raw_records')`)
  persist()
}

export function getStats(): { total: number; verified: number; unverified: number } {
  const total = Number(firstRow(`SELECT COUNT(*) as cnt FROM companies`)?.cnt ?? 0)
  const verified = Number(firstRow(`SELECT COUNT(*) as cnt FROM companies WHERE phone_status='verified'`)?.cnt ?? 0)
  const unverified = Number(firstRow(`SELECT COUNT(*) as cnt FROM companies WHERE phone_status='unverified'`)?.cnt ?? 0)
  return { total, verified, unverified }
}
