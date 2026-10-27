const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const initSqlJs = require('sql.js')

function loadTs(relativePath, dependencies) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, process, URL,
    require: id => { if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`); return dependencies[id] }
  }, { filename })
  return module.exports
}

async function main() {
  const SQL = await initSqlJs()
  // 기존 버전 DB에서 시작해 실제 SQL 마이그레이션과 재시작을 검증한다.
  const old = new SQL.Database()
  old.run(`CREATE TABLE companies (id INTEGER PRIMARY KEY AUTOINCREMENT, company_name TEXT NOT NULL,
    main_phone TEXT, phone_status TEXT NOT NULL, address TEXT, region_sido TEXT, region_sigungu TEXT,
    industry TEXT, employee_count INTEGER, homepage_url TEXT, biz_reg_no TEXT, departments TEXT,
    keyman_candidates TEXT, field_sources TEXT, raw_record_ids TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`)
  old.run("INSERT INTO companies (company_name, phone_status, created_at, updated_at) VALUES ('기존회사', 'unverified', '2026-01-01', '2026-01-01')")
  let disk = Buffer.from(old.export())
  old.close()
  let diskFailure = false
  const repo = loadTs('src/main/db/repository.ts', {
    'sql.js': async () => SQL, path,
    fs: { existsSync: () => true, readFileSync: () => disk, mkdirSync() {},
      writeFileSync: (_file, bytes) => { if (diskFailure) throw new Error('disk full'); disk = Buffer.from(bytes) } },
    electron: { app: { getPath: () => '/test' } },
    '../core/time': { nowKst: () => '2026-10-26T17:00:00+09:00' }
  })
  await repo.initDb()
  assert.equal(repo.getExportSummary().recent, 0)
  repo.beginCollectionRun('run-1')
  const ids = [repo.upsertCompany({ company_name: 'A', phone_status: 'unverified', collection_run_id: 'run-1' }),
    repo.upsertCompany({ company_name: 'B', phone_status: 'verified', collection_run_id: 'run-1' })]
  const handlers = {}
  let savePath = '/test/output.csv', writeFailure = false, writes = [], pauseWriter
  const handle = loadTs('src/main/ipc/exportHandlers.ts', {
    electron: { ipcMain: { handle: (name, fn) => { handlers[name] = fn } },
      dialog: { showSaveDialog: async () => ({ filePath: savePath }) } },
    '../export/csv': { ALL_EXPORT_FIELDS: ['회사명'], exportToCsv: async rows => {
      if (writeFailure) throw new Error('write failed'); writes.push(rows.map(r => r.id)); if (pauseWriter) await pauseWriter
    } },
    '../export/xlsx': { exportToXlsx: async rows => { writes.push(rows.map(r => r.id)) } },
    '../db/repository': repo,
    '../core/time': { nowKst: () => '2026-10-26T17:00:00+09:00' },
    '../log/logger': { logger: { info() {}, error() {} } }
  })
  handle.registerExportHandlers()
  const csv = payload => handlers['export:csv'](null, payload)
  savePath = undefined
  assert.equal((await csv({})).cancelled, true)
  assert.equal(repo.getExportSummary().recent, 2)
  savePath = '/test/output.csv'
  writeFailure = true
  assert.equal((await csv({})).ok, false)
  assert.equal(repo.getExportSummary().history.length, 0)
  writeFailure = false
  diskFailure = true
  assert.match((await csv({})).error, /이력 저장에 실패/)
  assert.equal(repo.getExportSummary().recent, 2)
  assert.equal(repo.getExportSummary().history.length, 0)
  diskFailure = false
  assert.equal((await csv({ fields: [] })).ok, false)
  assert.equal((await csv({ scope: 'invalid' })).ok, false)
  assert.equal((await csv({ query: { search: 'A', limit: 0, offset: 50 } })).count, 1)
  assert.equal(repo.queryCompanies({ recent_collection_only: true }).total, 2)
  repo.upsertCompany({ id: ids[0], company_name: 'A updated', phone_status: 'verified' })
  assert.equal(repo.queryCompanies({ recent_collection_only: true }).total, 2)
  repo.closeDb()
  const csvWriter = loadTs('src/main/export/csv.ts', { fs })
  const xlsxWriter = loadTs('src/main/export/xlsx.ts', { exceljs: require('exceljs'), './csv': csvWriter })
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'key-export-test-'))
  const csvFile = path.join(temp, 'test.csv'), xlsxFile = path.join(temp, 'test.xlsx')
  try {
    const rows = [{ company_name: '테스트,회사', phone_status: 'unverified' }]
    await csvWriter.exportToCsv(rows, csvFile, ['회사명'])
    assert.ok(fs.readFileSync(csvFile, 'utf8').includes('"테스트,회사"'))
    await xlsxWriter.exportToXlsx(rows, xlsxFile, ['회사명'])
    const workbook = new (require('exceljs').Workbook)()
    await workbook.xlsx.readFile(xlsxFile)
    assert.equal(workbook.worksheets[0].getCell('A2').value, '테스트,회사')
    assert.equal(workbook.worksheets[0].columnCount, 1)
  } finally {
    for (const file of [csvFile, xlsxFile]) if (fs.existsSync(file)) fs.unlinkSync(file)
    fs.rmdirSync(temp)
  }
  await repo.initDb()
  assert.equal(repo.getExportSummary().recent, 2)
  assert.equal(repo.getExportSummary().history.length, 1)
  assert.equal((await handlers['export:xlsx'](null, {})).count, 2)
  assert.equal(repo.getExportSummary().recent, 2)
  // 최근 수집은 내보내기 여부와 무관하게 같은 실행의 항목을 재출력할 수 있다.
  assert.equal((await csv({})).count, 2)
  repo.beginCollectionRun('run-2')
  assert.equal((await csv({})).ok, false)
  const fresh = repo.upsertCompany({ company_name: '새회사', phone_status: 'none', collection_run_id: 'run-2' })
  assert.equal((await csv({})).count, 1)
  assert.equal(writes.at(-1)[0], fresh)
  assert.equal((await csv({ scope: 'all' })).count, 4)
  repo.upsertCompany({ id: ids[0], company_name: 'A recollected', phone_status: 'verified', collection_run_id: 'run-2' })
  assert.equal(repo.getExportSummary().recent, 2)
  assert.equal((await csv({})).count, 2)
  repo.beginCollectionRun('empty-run')
  assert.equal(repo.getExportSummary().recent, 0)
  assert.equal((await csv({})).ok, false)
  assert.equal((await csv({ scope: 'all' })).count, 4)
  let release
  pauseWriter = new Promise(resolve => { release = resolve })
  const running = csv({ scope: 'all' })
  assert.equal((await csv({ scope: 'all' })).ok, false)
  await Promise.resolve()
  release()
  await running
  pauseWriter = null
  repo.deleteAllCompanies()
  const afterDelete = repo.upsertCompany({ company_name: '삭제 후 신규', phone_status: 'none' })
  assert.equal(afterDelete, 1)
  assert.equal(repo.getExportSummary().recent, 0)
  const agencyData = loadTs('src/main/core/recruitmentAgencies.ts', {})
  const exclusion = loadTs('src/main/core/companyExclusion.ts', { './recruitmentAgencies': agencyData })
  const { runPipeline } = loadTs('src/main/core/pipeline.ts', {
    './companyExclusion': exclusion,
    './sources/homepage': { enrichFromHomepage: async () => null },
    './normalize': { normalizeCompanyName: name => name, normalizePhone: () => null, parseAddress: () => ({}) },
    './dedup': { findDuplicate: () => ({}) },
    '../db/repository': repo,
    './time': { nowKst: () => '2026-10-26' },
    '../log/logger': { logger: { startCollectRun() {}, endCollectRun() {}, collect() {} } },
    './rateLimiter': { withRetry: fn => fn(), isBlockedResponse: () => false, sleep: async () => {} }
  })
  await runPipeline({ sources: [{ id: 'test', label: 'test',
    async *search() { yield { id: 1 } },
    async fetchDetail() { return { company_name: '수집 연동 확인', source: 'test', collected_at: '2026-10-26' } }
  }], filters: {}, runOptions: { runId: 'pipeline-test', delayMs: 0 }, onEvent() {} })
  assert.equal(repo.getExportSummary().recent, 1)
  assert.equal(repo.queryCompanies({ recent_collection_only: true }).rows[0].company_name, '수집 연동 확인')
  await runPipeline({ sources: [{ id: 'test', label: 'test',
    async *search() { for (const name of ['(주)스카우트', '(주)유비소시어스', '일반제조']) yield { name } },
    async fetchDetail(ref) { return { company_name: ref.name, source: 'test', collected_at: '2026-10-26' } }
  }], filters: {}, runOptions: { runId: 'combined-filter-export-test', delayMs: 0 }, onEvent() {} })
  assert.equal(repo.getExportSummary().recent, 1)
  assert.equal(repo.queryCompanies({ recent_collection_only: true }).rows[0].company_name, '일반제조')
  assert.equal((await csv({ scope: 'recent' })).count, 1)
  assert.equal(repo.getExportSummary().history[0].count, 1)
  repo.deleteAllCompanies()
  repo.closeDb()
  console.log('Export checks passed: legacy migration, recent/all, CSV/XLSX selection, cancellation, write failure, history failure rollback, restart, recollection, empty run, filters, concurrency, deletion, combined agency filter + recent export.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
