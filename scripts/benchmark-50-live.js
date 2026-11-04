const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createHash } = require('node:crypto')
const { chromium } = require('playwright')
const initSqlJs = require('sql.js')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'logs', `benchmark-50-${Date.now()}`)
fs.mkdirSync(output, { recursive: true })
const target = 50
const filters = { region_code: '101000', region_sub_codes: ['101010'], industry: 'IT개발·데이터', min_employee: 50, exclude_recruitment_agencies: true, max_count: target }
const modes = (process.env.KEY_BENCH_50_MODES || 'staged,shared7,reserved7d3,reserved7d3,shared7,staged').split(',')
if (modes.some(mode => !/^(staged|shared[1-8]|reserved[1-8](?:d[1-4])?)$/.test(mode))) throw new Error('Invalid benchmark modes')
const results = []
const sourceHashes = Object.fromEntries(['src/main/core/pipeline.ts', 'src/main/core/pageScheduler.ts', 'src/main/core/sources/saramin.ts', 'src/main/core/sources/homepage.ts'].map(filename => [filename, createHash('sha256').update(fs.readFileSync(path.join(root, filename))).digest('hex')]))
function loader(context, directory, SQL) {
  const cache = new Map()
  const logger = { startCollectRun() {}, endCollectRun() {}, collect(level, message, error) {
    fs.appendFileSync(path.join(directory, 'trace.txt'), `${new Date().toISOString()} [${level}] ${message}${error ? ' ' + String(error) : ''}\n`)
  }, info() {} }
  function load(filename) {
    filename = path.resolve(filename)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }; cache.set(filename, module)
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText
    vm.runInNewContext(code, {
      module, exports: module.exports, Date, URL, URLSearchParams, Set, Map, Promise, AbortController,
      setTimeout, clearTimeout, Buffer, console,
      process: { env: { NODE_ENV: 'production' }, resourcesPath: root, cwd: () => root },
      require(id) {
        if (id === 'electron') return { app: { getPath: () => directory } }
        if (id === 'sql.js') return { default: async () => SQL }
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
        if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id + '.ts'))
        return require(id)
      }
    }, { filename })
    return module.exports
  }
  return load
}
async function newContext(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' }
  })
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }))
  return context
}
function saveReport(extra = {}) {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ target, filters, modes, sourceHashes, results, ...extra }, null, 2))
}
async function main() {
  console.log(`OUTPUT ${output}`)
  const SQL = await initSqlJs({ locateFile: () => path.join(root, 'node_modules/sql.js/dist/sql-wasm.wasm') })
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-position=9999,9999'] })
  try {
    let refs
    if (process.env.KEY_BENCH_50_REFS) refs = JSON.parse(fs.readFileSync(process.env.KEY_BENCH_50_REFS, 'utf8'))
    else {
      console.log('QUALIFY: select exactly 50 distinct eligible companies; homepage work is excluded from this preparation')
      const dir = path.join(output, 'qualification'); fs.mkdirSync(dir)
      const context = await newContext(browser)
      try {
        const load = loader(context, dir, SQL)
        const { saraminAdapter } = load(path.join(root, 'src/main/core/sources/saramin.ts'))
        const { prefetchDetails } = load(path.join(root, 'src/main/core/prefetchDetails.ts'))
        const { recruitmentAgencyReason } = load(path.join(root, 'src/main/core/companyExclusion.ts'))
        const { normalizeCompanyName } = load(path.join(root, 'src/main/core/normalize.ts'))
        const { createRequestGate, withRetry, isBlockedResponse } = load(path.join(root, 'src/main/core/rateLimiter.ts'))
        const gate = createRequestGate(500), names = new Set()
        refs = []
        let examined = 0
        for await (const result of prefetchDetails(
          signal => saraminAdapter.search({ ...filters, max_count: 100 }, { runId: 'qualification', delayMs: 500, beforeRequest: gate, signal }),
          (ref, signal) => withRetry(() => saraminAdapter.fetchDetail(ref, { runId: 'qualification', filters, beforeRequest: gate, signal }), { signal }),
          { concurrency: 4, shouldContinue: () => refs.length < target, delayMs: 0 }
        )) {
          examined++
          if (!result.ok) { console.log(`QUALIFY detail error: ${result.ref.name}`); continue }
          const raw = result.raw
          if (raw.extra?.html && isBlockedResponse(String(raw.extra.html))) throw new Error('Source blocked during qualification')
          if (recruitmentAgencyReason(raw) || (raw.employee_count != null && raw.employee_count < filters.min_employee)) continue
          const name = normalizeCompanyName(raw.company_name)
          if (names.has(name)) continue
          names.add(name); refs.push(result.ref)
          if (refs.length % 10 === 0) console.log(`QUALIFY eligible=${refs.length}/50 examined=${examined}`)
          if (refs.length === target) break
        }
        if (refs.length !== target) throw new Error(`Only ${refs.length} eligible companies found`)
      } finally { await context.close() }
    }
    if (refs.length !== target) throw new Error('Benchmark requires exactly 50 fixed refs')
    fs.writeFileSync(path.join(output, 'refs.json'), JSON.stringify(refs, null, 2))
    const qualificationLoader = loader(null, output, SQL)
    const { normalizeCompanyName } = qualificationLoader(path.join(root, 'src/main/core/normalize.ts'))
    const selected = new Map(refs.map(ref => [normalizeCompanyName(ref.name), ref]))
    if (selected.size !== target) throw new Error('Ref set contains duplicate company names')
    saveReport()
    for (const [index, mode] of modes.entries()) {
      const configuration = mode.match(/^(shared|reserved)([1-8])(?:d([1-4]))?$/)
      const directory = path.join(output, `${String(index + 1).padStart(2, '0')}-${mode}`)
      fs.mkdirSync(directory)
      const context = await newContext(browser)
      const load = loader(context, directory, SQL)
      const repo = load(path.join(root, 'src/main/db/repository.ts'))
      try {
        await repo.initDb()
        if (repo.queryCompanies({ limit: 1 }).total) throw new Error('Benchmark DB must start empty')
        const { saraminAdapter } = load(path.join(root, 'src/main/core/sources/saramin.ts'))
        const { runPipeline } = load(path.join(root, 'src/main/core/pipeline.ts'))
        const events = [], found = new Set()
        let detailDone = 0, firstSaveMs, lastSaveMs, collectionEndMs, finalStatus, peakPages = 0, sharedPeak = 0, navigationRequests = 0
        let detailPeak = 0, homepageCollectingPeak = 0, homepageEnrichingPeak = 0, detailReserved = 0
        const saraminRequestStarts = []
        context.on('page', () => { peakPages = Math.max(peakPages, context.pages().length) })
        context.on('request', request => {
          if (request.resourceType() !== 'document') return
          try {
            if (!request.frame().parentFrame()) {
              navigationRequests++
              if (new URL(request.url()).hostname.endsWith('saramin.co.kr') && !request.redirectedFrom()) saraminRequestStarts.push(performance.now())
            }
          } catch {}
        })
        const began = performance.now()
        const heartbeat = setInterval(() => console.log(`RUN ${index + 1}/${modes.length} ${mode} elapsed=${((performance.now() - began)/1000).toFixed(1)}s saved=${finalStatus?.saved || 0}/50 detail=${detailDone} hp=${finalStatus?.homepageCompleted || 0} hpPending=${(finalStatus?.homepageActive || 0)+(finalStatus?.homepageQueued || 0)}`), 20000)
        console.log(`START ${index + 1}/${modes.length} ${mode}; fresh SQL DB; timed search + detail + homepage + writes`)
        try {
          await runPipeline({
            sources: [{ ...saraminAdapter,
              async *search(runFilters, opts) {
                for await (const candidate of saraminAdapter.search({ ...runFilters, max_count: 100 }, opts)) {
                  const key = normalizeCompanyName(candidate.name)
                  if (found.has(key) || !selected.has(key)) continue
                  found.add(key)
                  yield selected.get(key)
                  if (found.size === target) break
                }
              },
              async fetchDetail(...args) { const raw = await saraminAdapter.fetchDetail(...args); detailDone++; return raw }
            }],
            filters,
            runOptions: { runId: `bench50-${index}-${mode}`, delayMs: 500, schedulerMode: mode === 'staged' ? 'staged' : configuration[1], maxConcurrent: Number(configuration?.[3] || 4), homepageConcurrent: 3, sharedWorkers: configuration ? Number(configuration[2]) : undefined, homepageTimeoutMs: 12000 },
            onEvent(event) {
              events.push(event)
              if (event.type === 'status') {
                finalStatus = event.status; sharedPeak = Math.max(sharedPeak, event.status.sharedActive || 0)
                detailPeak = Math.max(detailPeak, event.status.detailActive)
                detailReserved = Math.max(detailReserved, event.status.detailReserved || 0)
                if (event.status.phase === 'collecting') homepageCollectingPeak = Math.max(homepageCollectingPeak, event.status.homepageActive)
                if (event.status.phase === 'enriching') { collectionEndMs ??= performance.now() - began; homepageEnrichingPeak = Math.max(homepageEnrichingPeak, event.status.homepageActive) }
              }
              if (event.type === 'progress') { firstSaveMs ??= performance.now() - began; lastSaveMs = performance.now() - began; if (event.current % 10 === 0) console.log(`PROGRESS ${mode} saved=${event.current}/50 elapsed=${((performance.now() - began)/1000).toFixed(1)}s`) }
            }
          })
        } finally { clearInterval(heartbeat) }
        const elapsedMs = Math.round(performance.now() - began)
        const companies = repo.queryCompanies({ limit: 10000 }).rows
        const saraminGaps = saraminRequestStarts.slice(1).map((time, i) => time - saraminRequestStarts[i]).sort((a, b) => a - b)
        const result = {
          mode, index: index + 1, elapsedMs, firstSaveMs: Math.round(firstSaveMs || 0), lastSaveMs: Math.round(lastSaveMs || 0), collectionEndMs: Math.round(collectionEndMs || 0),
          found: found.size, detailDone, saved: companies.length, reportedSaved: finalStatus?.saved, phones: companies.filter(c => c.main_phone).length,
          homepageTimeouts: finalStatus?.homepageTimedOut, homepageFailed: finalStatus?.homepageFailed, errors: events.filter(e => e.type === 'log' && e.level === 'ERROR').length,
          blocked: events.some(e => e.type === 'blocked'), stopReason: finalStatus?.stopReason, peakPages, sharedPeak, navigationRequests,
          detailReserved, detailPeak, homepageCollectingPeak, homepageEnrichingPeak,
          saraminRequestCount: saraminRequestStarts.length,
          saraminMedianGapMs: Math.round(saraminGaps[Math.floor(saraminGaps.length / 2)] || 0),
          saraminMinGapMs: Math.round(saraminGaps[0] || 0),
          companies: companies.map(c => ({ name: c.company_name, phone: c.main_phone, phoneSource: c.field_sources?.main_phone?.source, employees: c.employee_count, homepage: c.homepage_url })).sort((a,b) => a.name.localeCompare(b.name, 'ko'))
        }
        results.push(result); saveReport()
        console.log(`RESULT ${JSON.stringify({ ...result, companies: undefined })}`)
        if (result.blocked || result.saved !== target || result.found !== target || result.reportedSaved !== target || result.errors) throw new Error('Run did not collect 50 clean records; not a valid comparison')
        if (results.length > 1) {
          const a = JSON.stringify(results[0].companies.map(c => c.name)), b = JSON.stringify(result.companies.map(c => c.name))
          if (a !== b) throw new Error('Saved company set differs between runs')
        }
      } finally { repo.closeDb(); await context.close() }
    }
    saveReport({ completed: true })
    console.log(`COMPLETE ${path.join(output, 'results.json')}`)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); saveReport({ error: String(error), completed: false }); process.exitCode = 1 })
