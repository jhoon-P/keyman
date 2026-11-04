const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const createLoader = require('./helpers/load-ts')
async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--window-position=9999,9999'] })
  const rows = []
  try {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'ko-KR' })
    const load = createLoader({ '../browser': { newPage: () => context.newPage(), cleanText: s => (s || '').trim() }, '../../log/logger': { logger: { collect() {} } } })
    const { saraminAdapter } = load(path.resolve('src/main/core/sources/saramin.ts'))
    const refs = JSON.parse(fs.readFileSync('logs/benchmark-detail-1793727966185/refs.json', 'utf8'))
    for (const name of ['휴젤']) {
      const ref = refs.find(r => r.name.includes(name))
      const raw = await saraminAdapter.fetchDetail(ref, { runId: 'probe', filters: { min_employee: 50 } })
      const start = Date.now()
      try {
        const response = await context.request.get(raw.homepage_url.replace(/^http:/, 'https:'), { timeout: 4000 })
        const text = await response.text()
        const row = { name: ref.name, url: raw.homepage_url, elapsedMs: Date.now() - start, status: response.status(), finalUrl: response.url(), bytes: text.length, hasPhone: /(?:tel:|033[- .]?815|070[- .]?4042)/i.test(text) }
        rows.push(row); console.log(JSON.stringify(row))
        fs.writeFileSync(`logs/probe-homepage-${name}.html`, text)
        await response.dispose()
      } catch (error) { const row = { name: ref.name, url: raw.homepage_url, elapsedMs: Date.now() - start, error: String(error).slice(0, 500) }; rows.push(row); console.log(JSON.stringify(row)) }
    }
    fs.writeFileSync('logs/probe-homepages.json', JSON.stringify(rows, null, 2))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
