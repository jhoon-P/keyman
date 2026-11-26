// Run after building the public renderer. Uses a separate browser context and fixture IPC.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://exclusions.test/**', route => {
      const file = path.join(__dirname, '../out/renderer', new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html')
      return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' })
    })
    await page.addInitScript(() => {
      const noop = () => () => {}
      window.api = {
        app: { version: async () => 'test' },
        updater: { onAvailable: noop, onProgress: noop, onReady: noop, onRetry: noop },
        collect: {
          onEvent: cb => { window.collectEvent = cb; return () => {} },
          start: async payload => { window.lastCollection = payload; return { ok: true } }
        },
        data: { stats: async () => ({ total: 0 }), query: async () => ({ rows: [], total: 0 }) }
      }
    })
    const openCollect = () => page.locator('.nav-item').filter({ hasText: '검색 / 수집' }).click()
    const input = page.getByLabel('제외 키워드', { exact: false })
    const agency = page.locator('.check-row').filter({ hasText: '헤드헌팅·채용대행 업체 제외' })
    const start = async () => {
      await page.getByRole('button', { name: '수집 시작', exact: true }).click()
      assert.equal(await page.evaluate(() => window.lastCollection), undefined)
    }
    await page.goto('http://exclusions.test/')
    await openCollect()
    assert.equal(await input.inputValue(), '부동산\n컨설팅\n고용알선')
    assert.ok((await page.locator('#exclusion-help').textContent()).includes('‘부동산’ 키워드는 회사명만 검사'))
    await start()
    await input.fill('광고대행, 보험\n고용 알선\n보험')
    await agency.click()
    await page.locator('.nav-item').filter({ hasText: '데이터' }).click()
    await openCollect()
    assert.equal(await input.inputValue(), '광고대행, 보험\n고용 알선\n보험')
    await page.reload()
    await openCollect()
    await start()
    await input.fill('')
    await page.reload()
    await openCollect()
    assert.equal(await input.inputValue(), '')
    await start()
    await page.getByRole('button', { name: '기본 키워드 복원' }).click()
    assert.equal(await input.inputValue(), '부동산\n컨설팅\n고용알선')
    await start()
    await page.locator('.page-scroll').evaluate(element => { element.scrollTop = 500 })
    fs.mkdirSync('dist', { recursive: true })
    await page.screenshot({ path: 'dist/exclusion-keywords-ui.png' })
    await page.setViewportSize({ width: 1024, height: 600 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    assert.deepEqual(errors, [])
    console.log('Exclusion keyword UI passed: defaults, manual entry, deduplication, navigation/reload persistence, empty list, restore, blocked collection, minimum width.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
