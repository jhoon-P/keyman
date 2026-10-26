const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const executablePath = path.resolve(process.argv[2] || 'dist/win-unpacked/key.exe')
  const expectedVersion = require('../package.json').version
  const testDir = fs.mkdtempSync(path.resolve('dist/smoke-'))
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
      adapters: await window.api.app.adapterCatalog()
    }))
    assert.equal(result.version, expectedVersion)
    assert.equal(result.companies.total, 0, 'Fresh profile must not contain development data')
    assert.equal(result.stats.total, 0)
    assert.ok(result.adapters.length > 0)
    for (const label of ['검색 / 수집', '데이터', '내보내기', '개요']) {
      await page.locator('.nav-item').filter({ hasText: label }).click()
      await page.waitForFunction(text => document.querySelector('.tb-sub')?.textContent === text, label)
    }
    await page.screenshot({ path: path.join(testDir, 'startup.png') })
    assert.deepEqual(errors, [], 'Renderer raised an uncaught error')
    console.log(`Packaged app smoke test passed: ${info.version}; startup, preload, DB, navigation (${testDir})`)
  } finally {
    await app.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
