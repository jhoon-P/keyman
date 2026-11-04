const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { chromium } = require('playwright')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'logs', 'benchmark-detail-' + Date.now())
fs.mkdirSync(output, { recursive: true })
const results = []
const filters = { region_code: '101000', region_sub_codes: ['101010'], industry: 'IT개발·데이터', min_employee: 50, exclude_recruitment_agencies: true, max_count: 16 }
function loader(context, concurrency, rows) {
  const cache = new Map()
  const logger = { startCollectRun() {}, endCollectRun() {}, collect(level, text) { fs.appendFileSync(path.join(output, 'trace.txt'), `${new Date().toISOString()} [${level}] ${text}\n`) }, info() {} }
  const repo = { beginCollectionRun() {}, insertRawRecord: () => 1, getCompanyById: id => rows.has(id) ? structuredClone(rows.get(id)) : undefined, upsertCompany(c) { const id = c.id || rows.size + 1; rows.set(id, structuredClone({ ...c, id })); return id } }
  function load(filename) {
    filename = path.resolve(filename)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }; cache.set(filename, module)
    let source = fs.readFileSync(filename, 'utf8')

    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(code, { module, exports: module.exports, Date, URL, URLSearchParams, Set, Map, Promise, AbortController, setTimeout, clearTimeout, console, require(id) {
      if (id.endsWith('/browser')) return { newPage: async signal => {
        if (signal?.aborted) throw new Error('cancelled')
        const page = await context.newPage()
        const abort = () => { void page.close().catch(() => {}) }
        signal?.addEventListener('abort', abort, { once: true })
        page.once('close', () => signal?.removeEventListener('abort', abort))
        if (signal?.aborted) { await page.close(); throw new Error('cancelled') }
        return page
      }, cleanText: s => (s || '').replace(/\s+/g, ' ').trim() }
      if (id.endsWith('/log/logger')) return { logger }
      if (id.endsWith('/db/repository')) return repo
      if (id === './dedup') return { findDuplicate(c) { for (const r of rows.values()) if (r.company_name === c.company_name && (r.address === c.address || r.main_phone === c.main_phone)) return { existingId: r.id, matchKey: 'fixture' }; return {} } }
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id + '.ts'))
      return require(id)
    } }, { filename })
    return module.exports
  }
  return load
}
async function newContext(browser) {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' } })
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }))
  return context
}
async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-position=9999,9999'] })
  try {
    const refPath = process.env.KEY_BENCH_REFS
    const discovery = await newContext(browser)
    const adapter = loader(discovery, 1, new Map())(path.join(root, 'src/main/core/sources/saramin.ts')).saraminAdapter
    const refs = refPath ? JSON.parse(fs.readFileSync(refPath, 'utf8')) : []
    if (!refPath) for await (const ref of adapter.search(filters, { runId: 'benchmark', delayMs: 500 })) { refs.push(ref); if (refs.length === 16) break }
    await discovery.close()
    if (refs.length < 4) throw new Error(`Insufficient real search results: ${refs.length}`)
    fs.writeFileSync(path.join(output, 'refs.json'), JSON.stringify(refs, null, 2))
    const configs = (process.env.KEY_BENCH_WORKERS || '2/2,3/3,4/4,4/4,3/3,2/2').split(',').map(pair => pair.split('/').map(Number))
    if (configs.some(pair => pair.length !== 2 || pair.some(n => !Number.isInteger(n) || n < 1 || n > 4))) throw new Error('Invalid worker configuration')
    console.log(`Fixed sample: ${refs.length} companies. Configs: ${JSON.stringify(configs)}. Output: ${output}`)
    for (const [concurrency, homepageConcurrency] of configs) {
      const context = await newContext(browser)
      try {
        const warmup = await context.newPage(); await warmup.goto('https://www.saramin.co.kr', { waitUntil: 'domcontentloaded', timeout: 45000 }); await warmup.close()
        const rows = new Map(), events = []
        const load = loader(context, concurrency, rows)
        const realAdapter = load(path.join(root, 'src/main/core/sources/saramin.ts')).saraminAdapter
        const pipeline = load(path.join(root, 'src/main/core/pipeline.ts'))
        let detailDone = 0, firstProgress, lastProgress, collectionEnd, detailPeak = 0, homepagePeak = 0, finalStatus
        const started = performance.now()
        console.log(`START detail=${concurrency} homepage=${homepageConcurrency}`)
        await pipeline.runPipeline({ sources: [{ ...realAdapter, async *search() { yield* refs }, async fetchDetail(...args) { const raw = await realAdapter.fetchDetail(...args); detailDone++; return raw } }], filters, runOptions: { runId: 'benchmark-' + results.length, delayMs: 500, maxConcurrent: concurrency, homepageConcurrent: homepageConcurrency, schedulerMode: 'staged' }, onEvent(e) { events.push(e); if (e.type === 'status') { finalStatus = e.status; detailPeak = Math.max(detailPeak, e.status.detailActive); homepagePeak = Math.max(homepagePeak, e.status.homepageActive); if (e.status.phase === 'enriching') collectionEnd ??= performance.now() - started }; if (e.type === 'progress') { firstProgress ??= performance.now() - started; lastProgress = performance.now() - started } } })
        const result = { concurrency, homepageConcurrency, detailPeak, homepagePeak, homepageTimeouts: finalStatus?.homepageTimedOut, homepageFailed: finalStatus?.homepageFailed, collectionEndMs: Math.round(collectionEnd || 0), elapsedMs: Math.round(performance.now() - started), lastSaveMs: Math.round(lastProgress || 0), firstSaveMs: Math.round(firstProgress || 0), detailDone, saved: rows.size, phones: [...rows.values()].filter(r => r.main_phone).length, errors: events.filter(e => e.type === 'log' && e.level === 'ERROR').length, blocked: events.some(e => e.type === 'blocked'), companies: [...rows.values()].map(r => ({ name: r.company_name, phone: r.main_phone, employees: r.employee_count })) }
        results.push(result)
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ filters, sample: refs.length, results }, null, 2))
        console.log(JSON.stringify(result))
        if (result.blocked || !result.saved) throw new Error('Blocked or empty run; stopping benchmark')
      } finally { await context.close() }
    }
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
