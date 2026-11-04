const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node scripts/summarize-benchmark-50.js <benchmark directory>')
  const directory = path.resolve(process.argv[2])
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'results.json'), 'utf8'))
  assert.equal(report.completed, true, 'The live benchmark must finish before verification')
  const SQL = await initSqlJs({ locateFile: () => path.resolve('node_modules/sql.js/dist/sql-wasm.wasm') })
  let baseline
  const verified = []
  for (const run of report.results) {
    assert.equal(run.saved, report.target)
    assert.equal(run.found, report.target)
    assert.equal(run.errors, 0)
    assert.equal(run.blocked, false)
    const dbFile = path.join(directory, `${String(run.index).padStart(2, '0')}-${run.mode}`, 'data', 'companies.db')
    const db = new SQL.Database(fs.readFileSync(dbFile))
    try {
      const rows = []
      const statement = db.prepare('SELECT company_name, main_phone, field_sources FROM companies ORDER BY company_name')
      while (statement.step()) rows.push(statement.getAsObject())
      statement.free()
      const rawRows = Number(db.exec('SELECT COUNT(*) FROM raw_records')[0].values[0][0])
      assert.equal(rows.length, report.target, 'Persisted company count differs')
      assert.equal(rawRows, report.target, 'Persisted raw record count differs')
      const phones = rows.filter(row => row.main_phone).length
      assert.equal(phones, run.phones, 'Persisted phone count differs')
      const current = new Map(rows.map(row => [row.company_name, {
        phone: row.main_phone,
        source: row.field_sources ? JSON.parse(row.field_sources).main_phone?.source : undefined
      }]))
      baseline ??= current
      assert.deepEqual([...current.keys()], [...baseline.keys()], 'Persisted company names differ')
      const phoneDifferences = [], sourceDifferences = []
      for (const [name, value] of current) {
        const original = baseline.get(name)
        if (value.phone !== original.phone) phoneDifferences.push({ name, baseline: original.phone, phone: value.phone })
        if (value.source !== original.source) sourceDifferences.push(name)
      }
      if (run.mode.startsWith('reserved')) {
        const configuration = run.mode.match(/^reserved([1-8])(?:d([1-4]))?$/)
        const workers = Number(configuration[1])
        assert.equal(run.detailReserved, Math.min(Number(configuration[2] || 4), workers - 1))
        assert.ok(run.homepageCollectingPeak <= workers - run.detailReserved, 'Homepage collection used reserved detail slots')
        assert.ok(run.sharedPeak <= workers, 'Shared worker limit exceeded')
      }
      verified.push({ mode: run.mode, index: run.index, dbRows: rows.length, rawRows, phones,
        samePhoneValues: rows.length - phoneDifferences.length, phoneDifferences, sourceDifferences })
    } finally { db.close() }
  }
  const summary = [...new Set(report.results.map(run => run.mode))].map(mode => {
    const runs = report.results.filter(run => run.mode === mode)
    const mean = field => runs.reduce((sum, run) => sum + run[field], 0) / runs.length / 1000
    const median = field => {
      const values = runs.map(run => run[field]).sort((a, b) => a - b)
      const middle = Math.floor(values.length / 2)
      return (values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2) / 1000
    }
    return { mode, runs: runs.length, individualSeconds: runs.map(run => run.elapsedMs / 1000),
      baseIndividualSeconds: runs.map(run => run.lastSaveMs / 1000),
      meanSeconds: mean('elapsedMs'), baseMeanSeconds: mean('lastSaveMs'),
      medianSeconds: median('elapsedMs'), baseMedianSeconds: median('lastSaveMs'),
      firstSaveMeanSeconds: mean('firstSaveMs'),
      saraminMedianGapMsEachRun: runs.map(run => run.saraminMedianGapMs),
      remainingHomepageMeanSeconds: mean('elapsedMs') - mean('lastSaveMs'),
      savedEachRun: report.target, peakPages: Math.max(...runs.map(run => run.peakPages)),
      homepageCollectingPeak: Math.max(...runs.map(run => run.homepageCollectingPeak || 0)),
      homepageEnrichingPeak: Math.max(...runs.map(run => run.homepageEnrichingPeak || 0)) }
  })
  const baselineGroup = summary.find(group => group.mode === 'staged') || summary.find(group => group.mode === 'shared7') || summary[0]
  for (const group of summary) {
    group.totalReductionPercent = (1 - group.meanSeconds / baselineGroup.meanSeconds) * 100
    group.baseReductionPercent = (1 - group.baseMeanSeconds / baselineGroup.baseMeanSeconds) * 100
  }
  const result = { target: report.target, filters: report.filters, sourceHashes: report.sourceHashes, baselineMode: baselineGroup.mode, summary, verified,
    methodology: 'The same 50 prequalified companies are collected into a separate empty SQL DB with a fresh browser context for each run. Timing includes live search, details, homepage enrichment and DB writes; preparation and application/browser startup are excluded. Persisted databases are reopened after collection to compare all company names and phone values. Phone source differences are recorded separately.' }
  const filename = path.join(directory, 'summary.json')
  fs.writeFileSync(filename, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ output: filename, ...result }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
