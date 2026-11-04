const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require('playwright')
const { PageScheduler } = require('./helpers/load-ts')()(path.resolve('src/main/core/pageScheduler.ts'))
async function main() {
  const trace = []
  const server = http.createServer((request, response) => {
    if (!request.url.startsWith('/page-')) { response.writeHead(204); response.end(); return }
    trace.push({ event: 'request', url: request.url, at: Date.now() })
    const timer = setTimeout(() => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(`<link rel="icon" href="data:,"><h1>${request.url}</h1>`); trace.push({ event: 'response', url: request.url, at: Date.now() }) }, 1000)
    response.on('close', () => clearTimeout(timer))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  const results = []
  try {
    browser = await chromium.launch({ headless: false, args: ['--window-position=9999,9999'] })
    for (const workers of [1,5]) {
      const context = await browser.newContext()
      let peak = 0
      const scheduler = new PageScheduler(workers, 10, state => { peak = Math.max(peak, state.active) })
      const began = Date.now()
      const pages = await Promise.all(Array.from({ length: 5 }, (_, i) => scheduler.schedule({ kind: 'detail' }, async () => {
        const page = await context.newPage()
        trace.push({ event: 'page-created', workers, i, at: Date.now() })
        try {
          await page.goto(`http://127.0.0.1:${server.address().port}/page-${i}`, { waitUntil: 'domcontentloaded' })
          trace.push({ event: 'dom-ready', workers, i, at: Date.now() }); return await page.evaluate(() => document.querySelector('h1').textContent)
        } finally { await page.close() }
      })))
      await scheduler.finish()
      assert.deepEqual([...pages].sort(), ['/page-0','/page-1','/page-2','/page-3','/page-4'])
      assert.equal(peak, workers)
      results.push({ workers, elapsedMs: Date.now() - began, pages: pages.length, peak })
      console.log(JSON.stringify(results.at(-1)))
      await context.close()
    }
    fs.mkdirSync('logs', { recursive: true })
    fs.writeFileSync('logs/shared-pool-fixture-results.json', JSON.stringify({ pageDelayMs: 1000, results, trace }, null, 2))
    assert.ok(results[1].elapsedMs < results[0].elapsedMs * 0.5, 'five independent page waits must overlap')
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
