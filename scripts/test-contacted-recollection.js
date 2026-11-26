const assert = require('node:assert/strict')
const path = require('node:path')
const initSqlJs = require('sql.js')
const createLoader = require('./helpers/load-ts')

async function main() {
  const SQL = await initSqlJs()
  let disk
  let now = '2026-11-01T09:00:00+09:00'
  const repo = createLoader({
    'sql.js': { default: async () => SQL },
    fs: {
      existsSync: () => !!disk, readFileSync: () => disk, mkdirSync() {},
      writeFileSync: (_file, bytes) => { disk = Buffer.from(bytes) }
    },
    electron: { app: { getPath: () => '/test' } },
    '../core/time': { nowKst: () => now }
  })(path.resolve('src/main/db/repository.ts'))
  await repo.initDb()
  let homepageCalls = 0
  let onHomepage = async () => null
  const pipeline = createLoader({
    '../db/repository': repo,
    './sources/homepage': { enrichFromHomepage: async () => { homepageCalls++; return onHomepage() } },
    '../log/logger': { logger: { startCollectRun() {}, collect() {}, endCollectRun() {} } }
  })(path.resolve('src/main/core/pipeline.ts'))
  const raw = (company_name, address) => ({
    company_name, address, homepage_url: 'https://example.test', source: 'test', collected_at: now
  })
  async function run(runId, records, max_count = 100) {
    const events = []
    await pipeline.runPipeline({
      sources: [{ id: 'test', label: 'test',
        async *search() { for (const record of records) yield record },
        async fetchDetail(record) { return record }
      }],
      filters: { max_count },
      runOptions: { runId, delayMs: 0, maxConcurrent: 1, schedulerMode: 'staged' },
      onEvent: event => events.push(event)
    })
    assert.ok(!events.some(event => event.type === 'log' && event.level === 'ERROR'))
    return events
  }

  const completed = raw('완료업체', '서울특별시 강남구 테스트로 1')
  await run('initial', [completed])
  const id = repo.queryCompanies().rows[0].id
  repo.setContacted(id, true)
  repo.closeDb()
  await repo.initDb()
  const before = repo.getCompanyById(id)
  now = '2026-11-02T09:00:00+09:00'
  const newerId = repo.upsertCompany({ company_name: '다음 연락 업체', phone_status: 'none' })
  const orderBefore = repo.queryCompanies().rows.map(row => row.id).join(',')
  now = '2026-11-03T09:00:00+09:00'
  homepageCalls = 0
  const skipped = await run('completed-only', [{ ...completed, representative_name: '재수집 변경' }])
  assert.deepEqual(repo.getCompanyById(id), before, 'completed company must keep its fields, timestamps, run ID and check')
  assert.equal(repo.queryCompanies().rows.map(row => row.id).join(','), orderBefore, 'completed company must not move to the top')
  assert.equal(repo.getExportSummary().recent, 0)
  assert.equal(repo.queryCompanies({ recent_collection_only: true }).total, 0)
  assert.equal(homepageCalls, 0, 'completed company must skip homepage enrichment')
  assert.equal(skipped.at(-1).count, 0)
  assert.ok(skipped.some(event => event.type === 'log' && event.message.includes('제외(연락 완료)')))

  const mixed = await run('mixed', [completed, raw('신규업체', '부산광역시 테스트로 2')], 1)
  assert.equal(mixed.at(-1).count, 1, 'skipped companies must not consume the collection limit')
  assert.equal(repo.queryCompanies({ recent_collection_only: true }).rows[0].company_name, '신규업체')
  assert.equal(repo.queryCompanies().total, 3)
  assert.equal(repo.getCompanyById(newerId).contacted, false)

  repo.setContacted(id, false)
  await run('unchecked', [completed])
  assert.equal(repo.getCompanyById(id).collection_run_id, 'unchecked')
  assert.equal(repo.getCompanyById(id).updated_at, now)
  assert.equal(repo.queryCompanies({ recent_collection_only: true }).total, 1)
  assert.equal(repo.queryCompanies().total, 3, 'unchecked recollection must update the same company')

  // A checkbox clicked while a homepage request is in flight must also win.
  let checkedDuringRequest
  onHomepage = async () => {
    const row = repo.queryCompanies({ search: '보강중업체' }).rows[0]
    repo.setContacted(row.id, true)
    checkedDuringRequest = repo.getCompanyById(row.id)
    now = '2026-11-04T09:00:00+09:00'
    return { main_phone: '02-1234-5678', departments: ['영업팀'], outcome: 'found' }
  }
  await run('in-flight', [raw('보강중업체', '서울특별시 테스트로 3')])
  assert.deepEqual(repo.getCompanyById(checkedDuringRequest.id), checkedDuringRequest)
  repo.closeDb()
  console.log('Contacted recollection checks passed: persistence, stable order, recent list/export, skip count, limit, uncheck, in-flight enrichment.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
