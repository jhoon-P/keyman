const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./helpers/load-ts')
const pause = ms => new Promise(r => setTimeout(r, ms))
const realLimiter = createLoader()(path.resolve('src/main/core/rateLimiter.ts'))
function fixture(homepage) {
  const rows = new Map(), events = []
  let nextId = 0
  const repo = {
    beginCollectionRun() {}, insertRawRecord: () => 1,
    upsertCompany(c) { const id = c.id || ++nextId; rows.set(id, structuredClone({ ...c, id })); return id },
    getCompanyById: id => rows.has(id) ? structuredClone(rows.get(id)) : undefined
  }
  const load = createLoader({
    './sources/homepage': { enrichFromHomepage: async (url, name, opts) => {
      const run = () => homepage ? homepage(url, name, opts) : Promise.resolve(null)
      return opts.schedulePage ? opts.schedulePage(url, run, opts.signal) : run()
    } },
    './companyExclusion': { recruitmentAgencyReason: r => r.company_name === 'agency' ? 'agency' : undefined },
    './normalize': { normalizeCompanyName: x => x, parseAddress: () => ({}), normalizePhone: x => ({ normalized: x, type: 'landline', status: 'verified' }) },
    './dedup': { findDuplicate: () => ({}) }, '../db/repository': repo,
    './time': { nowKst: () => 'now' }, '../log/logger': { logger: { startCollectRun() {}, collect() {}, endCollectRun() {} } },
    './rateLimiter': { ...realLimiter, withRetry: fn => fn() }
  })
  const pipeline = load(path.resolve('src/main/core/pipeline.ts'))
  const raw = name => ({ source: 'test', company_name: name, employee_count: name === 'small' ? 1 : 100, homepage_url: `https://${name.toLowerCase()}.test`, collected_at: 'now' })
  const run = (names, opts = {}, fetch) => pipeline.runPipeline({ sources: [{ id: 'test', label: 'test',
    async *search() { for (const name of names) yield { name, detail_url: name } },
    async fetchDetail(ref, taskOpts) {
      const run = async mark => { await mark?.(); return fetch ? fetch(ref, taskOpts) : Promise.resolve(raw(ref.name)) }
      return taskOpts.schedulePage ? taskOpts.schedulePage(ref.detail_url, run, taskOpts.signal) : run()
    }
  }], filters: { max_count: 100, min_employee: 50, ...opts.filters }, runOptions: { runId: 'test', delayMs: 0, schedulerMode: 'shared', sharedWorkers: 5, ...opts.runOptions }, onEvent: e => events.push(e) })
  return { rows, events, run, pipeline, raw }
}
async function main() {
  let active = 0, peak = 0, releases = []
  const f = fixture(async () => {
    peak = Math.max(peak, ++active)
    await new Promise(r => releases.push(r)); active--
    return { main_phone: '02-1234-5678', source_url: 'https://company.test/contact', departments: ['개발팀'], outcome: 'found' }
  })
  let done = false
  const run = f.run(['agency','small','A','B','C','D'], { filters: { max_count: 4 } }).then(() => { done = true })
  await pause(15)
  assert.equal(f.rows.size, 4)
  assert.equal(peak, 4)
  assert.equal(done, false)
  f.rows.get(1).representative_name = 'user edit'; f.rows.delete(2)
  while (!done) { releases.splice(0).forEach(r => r()); await pause(2) }
  await run
  assert.equal(f.rows.size, 3); assert.equal(f.rows.get(1).representative_name, 'user edit')
  assert.equal(f.rows.get(1).main_phone, '02-1234-5678')
  assert.equal(f.events.at(-1).type, 'done'); assert.equal(f.events.at(-1).count, 4)
  assert.equal(f.events.filter(e => e.type === 'enrichment').at(-1).pending, 0)

  const limit = fixture()
  await limit.run(Array.from({ length: 30 }, (_, i) => 'A' + i), { filters: { max_count: 2 } })
  assert.equal(limit.rows.size, 2, 'concurrent responses must not exceed the save limit')
  assert.equal(limit.events.filter(e => e.type === 'progress').length, 2)

  const failure = fixture()
  await failure.run(['A','fail','B'], {}, async ref => { if (ref.name === 'fail') throw new Error('test failure'); return failure.raw(ref.name) })
  assert.equal(failure.rows.size, 2)
  assert.equal(failure.events.filter(e => e.type === 'log' && e.level === 'ERROR').length, 1)

  const blocked = fixture()
  await blocked.run(['A','block','B','C','D'], {}, async (ref, opts) => {
    await pause(ref.name === 'A' ? 1 : 10)
    if (ref.name === 'block') return { ...blocked.raw(ref.name), extra: { html: 'access denied' } }
    if (opts.signal.aborted) throw new Error('cancelled')
    return blocked.raw(ref.name)
  })
  assert.ok(blocked.events.some(e => e.type === 'blocked'))
  assert.equal(blocked.rows.size, 1)

  let hpStarted
  const started = new Promise(r => { hpStarted = r })
  const stopped = fixture(async (_url, _name, opts) => {
    hpStarted()
    await new Promise(r => opts.signal.addEventListener('abort', r, { once: true }))
    return { main_phone: 'must-not-save', outcome: 'found' }
  })
  const stopping = stopped.run(Array.from({ length: 30 }, (_, i) => 'A' + i))
  await started
  await assert.rejects(stopped.run(['other']), /이전 수집/)
  stopped.pipeline.abortPipeline()
  await stopping
  assert.ok([...stopped.rows.values()].every(r => r.main_phone !== 'must-not-save'))
  assert.equal(stopped.events.filter(e => e.type === 'status').at(-1).status.phase, 'stopped')
  assert.equal(stopped.events.at(-1).type, 'done')
  const savedBefore = stopped.rows.size
  await stopped.run(['small'])
  assert.equal(stopped.rows.size, savedBefore, 'a new run must be allowed after cleanup')

  const timeout = fixture(async () => ({ outcome: 'timeout' }))
  await timeout.run(['A'])
  const state = timeout.events.filter(e => e.type === 'status').at(-1).status
  assert.equal(state.homepageTimedOut, 1)
  assert.equal(state.homepageActive + state.homepageQueued, 0)

  const reservedReleases = []
  const reserved = fixture(async () => {
    await new Promise(resolve => reservedReleases.push(resolve))
    return { outcome: 'missing' }
  })
  let reservedDone = false
  const reservedRun = reserved.run(Array.from({ length: 10 }, (_, i) => 'R' + i), {
    filters: { max_count: 10 }, runOptions: { schedulerMode: 'reserved', sharedWorkers: 7, maxConcurrent: 4 }
  }).then(() => { reservedDone = true })
  while (!reserved.events.some(event => event.type === 'status' && event.status.phase === 'enriching' && event.status.homepageActive === 7)) await pause(1)
  assert.equal(reserved.rows.size, 10, 'homepage jobs must not block base collection from completing')
  const collectingStates = reserved.events.filter(event => event.type === 'status' && event.status.phase === 'collecting').map(event => event.status)
  assert.ok(collectingStates.some(status => status.homepageActive === 3))
  assert.ok(collectingStates.every(status => status.homepageActive <= 3 && status.detailReserved === 4))
  while (!reservedDone) { reservedReleases.splice(0).forEach(resolve => resolve()); await pause(1) }
  await reservedRun
  const reservedFinal = reserved.events.filter(event => event.type === 'status').at(-1).status
  assert.equal(reservedFinal.detailReserved, 0)
  assert.equal(reservedFinal.homepageCompleted, 10)
  assert.equal(reservedFinal.homepageActive + reservedFinal.homepageQueued, 0)
  const singleSlot = fixture()
  await singleSlot.run(Array.from({ length: 25 }, (_, i) => 'S' + i), { runOptions: { schedulerMode: 'reserved', sharedWorkers: 1 } })
  assert.equal(singleSlot.rows.size, 25, 'a single-slot override must not deadlock the homepage admission queue')
  const defaults = fixture()
  await defaults.run(['Default A', 'Default B'], { runOptions: { schedulerMode: undefined, sharedWorkers: undefined } })
  const defaultStates = defaults.events.filter(event => event.type === 'status').map(event => event.status)
  assert.ok(defaultStates.every(status => status.sharedWorkers === 7), 'new runs must use the measured seven-slot configuration')
  assert.ok(defaultStates.filter(status => status.phase === 'collecting').every(status => status.detailReserved === 3), 'new runs must reserve three detail slots')
  assert.equal(defaults.rows.size, 2)
  const sharedDefaults = fixture()
  await sharedDefaults.run(['Shared default'], { runOptions: { schedulerMode: 'shared', sharedWorkers: undefined } })
  assert.ok(sharedDefaults.events.filter(event => event.type === 'status').every(event => event.status.sharedWorkers === 7 && event.status.detailReserved === 0))
  console.log('PASS: independent stages, worker counts, save limit, exclusions, errors, blocking, cancellation, drain, merge and timeout reporting')
}
const timer = setTimeout(() => { console.error('pipeline test timed out'); process.exit(1) }, 10000)
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => clearTimeout(timer))
