// Run after npm run build. Uses fixture data; never touches the user's database.
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
    await page.route('http://pagination.test/**', route => {
      const file = path.join(__dirname, '../out/renderer', new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html')
      const contentType = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'
      return route.fulfill({ body: fs.readFileSync(file), contentType })
    })
    await page.addInitScript(() => {
      window.fixture = Array.from({ length: 829 }, (_, i) => ({ id: i + 1, company_name: `회사 ${i + 1}`, region_sido: i % 2 ? '서울특별시' : '경기도' }))
      const noop = () => () => {}
      window.api = {
        app: { version: async () => 'test' },
        updater: {
          onAvailable: cb => { window.updateAvailable = cb; return noop() },
          onProgress: cb => { window.updateProgress = cb; return noop() },
          onReady: cb => { window.updateReady = cb; return noop() },
          onIdle: cb => { window.updateIdle = cb; return noop() }
        },
        collect: {
          onEvent: cb => { window.collectEvent = cb; return () => {} },
          start: async () => ({ ok: false, reason: 'policy-unavailable', error: 'Saramin collection is unavailable.' })
        },
        data: {
          stats: async () => ({ total: window.fixture.length }),
          query: async q => {
            const rows = window.fixture.filter(r => (!q.recent_collection_only || r.id <= 200) && (!q.search || r.company_name.includes(q.search)) && (!q.region_sido || r.region_sido === q.region_sido))
            return { total: rows.length, rows: rows.slice(q.offset || 0, (q.offset || 0) + (q.limit || 100)) }
          },
          delete: async id => { window.fixture = window.fixture.filter(r => r.id !== id) }
        }
      }
    })
    await page.goto('http://pagination.test/')
    await page.waitForFunction(() => typeof window.updateAvailable === 'function')
    await page.evaluate(() => window.updateAvailable({ version: '1.1.2' }))
    const updateBanner = page.locator('.update-banner')
    await updateBanner.getByText('v1.1.2 자동 업데이트 중').waitFor()
    assert.equal(await updateBanner.getByRole('button').count(), 0)
    await page.evaluate(() => window.updateProgress({ percent: 50 }))
    await updateBanner.getByText('다운로드 중 50%').waitFor()
    await page.evaluate(() => window.updateReady())
    await updateBanner.getByText('업데이트를 위해 재시작합니다').waitFor()
    assert.equal(await updateBanner.getByRole('button').count(), 0)
    await page.evaluate(() => window.updateIdle())
    await updateBanner.waitFor({ state: 'hidden' })
    await page.locator('.nav-item').filter({ hasText: '데이터' }).click()
    const range = page.locator('.data-range')
    const expectRange = async text => {
      await page.waitForFunction(text => document.querySelector('.data-range')?.textContent === text, text)
    }
    await expectRange('전체 829건 중 1–100건')
    assert.equal(await page.locator('tbody tr').count(), 100)
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await expectRange('전체 829건 중 101–200건')
    await page.getByRole('button', { name: '9페이지', exact: true }).click()
    await expectRange('전체 829건 중 801–829건')
    assert.equal(await page.getByRole('button', { name: '다음', exact: true }).isDisabled(), true)
    await page.getByLabel('표시 개수').selectOption('200')
    await expectRange('전체 829건 중 1–200건')
    await page.getByLabel('최근 수집만 보기').check()
    await expectRange('최근 수집 200건 중 1–200건')
    await page.getByLabel('표시 개수').selectOption('100')
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await expectRange('최근 수집 200건 중 101–200건')
    await page.getByPlaceholder('회사명·담당자·업종 검색').fill('없는 회사')
    await expectRange('최근 수집 0건 중 0–0건')
    await page.getByPlaceholder('회사명·담당자·업종 검색').fill('')
    await expectRange('최근 수집 200건 중 1–100건')
    await page.locator('.table-toolbar select').selectOption('서울')
    await expectRange('최근 수집 100건 중 1–100건')
    await page.locator('.nav-item').filter({ hasText: '검색 / 수집' }).click()
    const time = Date.now()
    await page.clock.install({ time })
    await page.clock.pauseAt(time + 1000)
    const start = page.getByRole('button', { name: '수집 시작', exact: true })
    const notice = page.locator('.collection-notice')
    await start.evaluate(button => button.click())
    await page.clock.runFor(4999)
    assert.equal(await notice.count(), 0)
    await page.clock.runFor(1)
    assert.equal(await notice.textContent(), 'Saramin collection is unavailable.')
    assert.equal(await notice.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return window.innerWidth - rect.right === 18 && window.innerHeight - rect.bottom === 18
    }), true)
    await page.clock.runFor(2999)
    assert.equal(await notice.count(), 1)
    await page.clock.runFor(1)
    assert.equal(await notice.count(), 0)
    await page.clock.resume()
    assert.equal(await page.locator('.log-msg').filter({ hasText: 'Saramin collection is unavailable.' }).count(), 0)
    assert.equal(await page.locator('.log-tag').filter({ hasText: 'START' }).count(), 0)
    assert.equal(await page.locator('.collect-progress').count(), 0)
    assert.equal(await start.isEnabled(), true)
    await page.evaluate(() => window.collectEvent({ type: 'done', count: 200, runId: 'fixture' }))
    await page.getByRole('button', { name: '최근 수집 결과 보기' }).click()
    await expectRange('최근 수집 200건 중 1–100건')
    await page.locator('.nav-item').filter({ hasText: '데이터' }).click()
    await expectRange('전체 829건 중 1–100건')
    await page.getByLabel('표시 개수').selectOption('500')
    await expectRange('전체 829건 중 1–500건')
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await expectRange('전체 829건 중 501–829건')
    await page.evaluate(() => { window.fixture = window.fixture.slice(0, 200) })
    await page.getByRole('button', { name: '새로고침', exact: true }).click()
    await expectRange('전체 200건 중 1–200건')
    assert.deepEqual(errors, [])
    console.log('Pagination UI passed: 829 rows, page boundaries, 100/200/500 sizes, recent scope, search, region, empty results, collection navigation, shortened last page.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
