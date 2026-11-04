const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./helpers/load-ts')
async function fixture({ delays = [0], phones = ['02-1234-5678'], timeout = 500, signal, queueDelay = 0 } = {}) {
  let closeCount = 0, navigations = 0
  const load = createLoader({
    '../browser': { async newPage(taskSignal) {
      let currentUrl, rejectNavigation, closed = false
      const page = {
        route: async () => {},
        async goto(url) {
          currentUrl = url
          const delay = delays[navigations++] ?? 0
          if (delay === Infinity) await new Promise((_resolve, reject) => { rejectNavigation = reject })
          else await new Promise((resolve, reject) => { rejectNavigation = reject; setTimeout(resolve, delay) })
        },
        waitForSelector: async () => {},
        evaluate: async fn => fn.toString().includes('telLinks') ? phones[navigations - 1] ?? null : fn.toString().includes('const depts') ? [] : 'https://company.test/contact',
        url: () => currentUrl,
        async close() { if (closed) return; closed = true; closeCount++; taskSignal.removeEventListener('abort', abort); rejectNavigation?.(new Error('page closed')) }
      }
      const abort = () => { void page.close() }
      taskSignal.addEventListener('abort', abort, { once: true })
      return page
    } }, '../../log/logger': { logger: { collect() {} } }
  })
  const { enrichFromHomepage } = load(path.resolve('src/main/core/sources/homepage.ts'))
  const began = Date.now()
  const result = await enrichFromHomepage('https://company.test', 'fixture', { timeoutMs: timeout, signal, schedulePage: async (_url, run) => { if (queueDelay) await new Promise(r => setTimeout(r, queueDelay)); return run() } })
  return { result, elapsed: Date.now() - began, closeCount, navigations }
}
async function main() {
  const found = await fixture()
  assert.equal(found.result.main_phone, '02-1234-5678'); assert.equal(found.navigations, 1); assert.equal(found.closeCount, 1)
  const sub = await fixture({ phones: [null, '02-9876-5432'] })
  assert.equal(sub.result.source_url, 'https://company.test/contact'); assert.equal(sub.navigations, 2)
  const timeout = await fixture({ delays: [Infinity], timeout: 25 })
  assert.equal(timeout.result.outcome, 'timeout'); assert.equal(timeout.closeCount, 1); assert.ok(timeout.elapsed < 250)
  const budget = await fixture({ delays: [15, Infinity], phones: [null], timeout: 35 })
  assert.equal(budget.result.outcome, 'timeout'); assert.equal(budget.navigations, 2); assert.ok(budget.elapsed < 250)
  const controller = new AbortController()
  const aborting = fixture({ delays: [Infinity], timeout: 5000, signal: controller.signal })
  setTimeout(() => controller.abort(), 15)
  const stopped = await aborting
  assert.equal(stopped.result.outcome, 'error'); assert.equal(stopped.closeCount, 1); assert.ok(stopped.elapsed < 250)
  const queued = await fixture({ timeout: 25, queueDelay: 60 })
  assert.equal(queued.result.outcome, 'found'); assert.ok(queued.elapsed >= 60, 'queue wait must not spend the network budget')
  console.log('PASS: homepage early exit, subpage provenance, whole-job deadline and cancellation close the page')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
