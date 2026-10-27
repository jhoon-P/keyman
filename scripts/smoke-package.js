const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const executablePath = path.resolve(process.argv[2] || 'dist/win-unpacked/key.exe')
  const expectedVersion = require('../package.json').version
  const testDir = fs.mkdtempSync(path.resolve('dist/smoke-'))
  const snapshotPath = process.argv[3] ? path.resolve(process.argv[3]) : null
  let snapshot, expectedCount = 0, expectedRecent = 0
  if (snapshotPath) {
    snapshot = fs.readFileSync(snapshotPath)
    const SQL = await require('sql.js')()
    const database = new SQL.Database(snapshot)
    expectedCount = database.exec('SELECT COUNT(*) FROM companies')[0].values[0][0]
    if (database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='collection_runs'").length) {
      expectedRecent = database.exec('SELECT COUNT(*) FROM companies WHERE collection_run_id = (SELECT run_id FROM collection_runs ORDER BY id DESC LIMIT 1)')[0].values[0][0]
    }
    database.close()
    fs.mkdirSync(path.join(testDir, 'data'), { recursive: true })
    fs.writeFileSync(path.join(testDir, 'data', 'companies.db'), snapshot)
  }
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${testDir}`],
    env,
    timeout: 30000
  })
  const errors = []
  app.on('window', page => page.on('pageerror', error => errors.push(error.message)))
  try {
    const deadline = Date.now() + 180000
    let page
    while (Date.now() < deadline) {
      page = app.windows().find(window => window.url().startsWith('file:'))
      if (page) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    assert.ok(page, 'Main window did not open within 3 minutes')
    await page.waitForSelector('.app-frame', { timeout: 30000 })
    const info = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged }))
    assert.equal(info.version, expectedVersion)
    assert.equal(info.packaged, true)
    const result = await page.evaluate(async () => ({
      version: await window.api.app.version(),
      companies: await window.api.data.query({ limit: 1 }),
      stats: await window.api.data.stats(),
      exportSummary: await window.api.export.summary(),
      adapters: await window.api.app.adapterCatalog()
    }))
    assert.equal(result.version, expectedVersion)
    assert.equal(result.companies.total, expectedCount, 'Profile data count must be preserved')
    assert.equal(result.stats.total, expectedCount)
    assert.equal(result.exportSummary.total, expectedCount)
    assert.equal(result.exportSummary.recent, expectedRecent)
    assert.ok(result.adapters.length > 0)
    for (const label of ['검색 / 수집', '데이터', '내보내기', '개요']) {
      await page.locator('.nav-item').filter({ hasText: label }).click()
      await page.waitForFunction(text => document.querySelector('.tb-sub')?.textContent === text, label)
      if (label === '검색 / 수집') {
        const filter = page.locator('.check-row').filter({ hasText: '헤드헌팅·채용대행 업체 제외' })
        assert.equal(await filter.count(), 1)
        assert.ok((await filter.locator('.check-box').getAttribute('class')).includes('on'))
      }
      if (label === '내보내기') {
        assert.ok(await page.getByText('최근 수집한 항목 또는 전체를 선택할 수 있습니다.', { exact: false }).count())
        if (expectedCount > 0) {
          await page.getByRole('main').getByRole('button', { name: '내보내기', exact: true }).click()
          const scopeDialog = page.getByRole('dialog')
          await scopeDialog.waitFor()
          assert.equal(await scopeDialog.getByRole('button', { name: /최근 수집한 항목만/ }).isDisabled(), expectedRecent === 0)
          assert.ok(await scopeDialog.getByRole('button', { name: new RegExp(`전체 내보내기.*${expectedCount}`) }).isEnabled())
          await scopeDialog.getByRole('button', { name: '취소', exact: true }).click()
        }
      }
    }
    await page.screenshot({ path: path.join(testDir, 'startup.png') })
    assert.deepEqual(errors, [], 'Renderer raised an uncaught error')
    if (snapshotPath) assert.ok(fs.readFileSync(snapshotPath).equals(snapshot), 'Installed database must remain untouched')
    console.log(`Packaged app smoke test passed: ${info.version}; startup, preload, DB (${expectedCount} companies), agency option, export scope, navigation (${testDir})`)
  } finally {
    await app.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
