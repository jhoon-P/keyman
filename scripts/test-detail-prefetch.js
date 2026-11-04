const assert = require('node:assert/strict')
const path = require('node:path')
const load = require('./helpers/load-ts')()
const { prefetchDetails } = load(path.resolve('src/main/core/prefetchDetails.ts'))
const { WorkQueue } = load(path.resolve('src/main/core/workQueue.ts'))
const { TaskPool } = load(path.resolve('src/main/core/taskPool.ts'))
const { createRequestGate } = load(path.resolve('src/main/core/rateLimiter.ts'))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function* refs(n) { for (let i = 0; i < n; i++) yield { id: String(i) } }
async function main() {
  // A is slow: B must be consumed and C launched without waiting for A or the consumer.
  const a = deferred(), cStarted = deferred(), consumerGate = deferred(), seen = []
  let active = 0, peak = 0
  const run = (async () => {
    for await (const r of prefetchDetails(() => refs(4), async ref => {
      peak = Math.max(peak, ++active)
      if (ref.id === '0') await a.promise
      if (ref.id === '2') cStarted.resolve()
      active--
      return { company_name: ref.id }
    }, { concurrency: 2, shouldContinue: () => true, delayMs: 0 })) {
      seen.push(r.raw.company_name)
      if (seen.length === 1) await consumerGate.promise
    }
  })()
  await cStarted.promise
  assert.equal(seen[0], '1', 'fast result must not wait for the earlier slow result')
  assert.equal(peak, 2)
  a.resolve(); consumerGate.resolve(); await run
  assert.equal(new Set(seen).size, 4)

  const starts = [], gate = createRequestGate(25)
  await Promise.all(Array.from({ length: 4 }, async () => { await gate(); starts.push(Date.now()) }))
  starts.slice(1).forEach((t, i) => assert.ok(t - starts[i] >= 22, 'shared request spacing'))
  const cancelGate = createRequestGate(5000), aborted = new AbortController()
  await cancelGate()
  const waiting = cancelGate(aborted.signal)
  aborted.abort()
  await assert.rejects(waiting, /중지/)

  const queue = new WorkQueue(1)
  await queue.push(1)
  let accepted = false
  const pushing = queue.push(2).then(x => { accepted = x })
  await sleep(1); assert.equal(accepted, false)
  assert.equal(await queue.take(), 1); await pushing; assert.equal(accepted, true)
  queue.close(); assert.equal(await queue.take(), 2); assert.equal(await queue.take(), undefined)
  const cancelled = new WorkQueue(1)
  await cancelled.push(1)
  const held = cancelled.push(2)
  cancelled.cancel(); assert.equal(await held, false); assert.equal(await cancelled.take(), undefined)

  const done = [], domainA = deferred(), domainB = deferred()
  let domainActive = 0
  const pool = new TaskPool(2, 4, () => {}, error => { throw error })
  await pool.add('a', async () => { domainActive++; await domainA.promise; domainActive--; done.push('a1') })
  await pool.add('a', async () => { assert.equal(domainActive, 0); done.push('a2') })
  await pool.add('b', async () => { domainB.resolve(); done.push('b') })
  await domainB.promise
  assert.ok(!done.includes('a1'), 'other domain must run while a queued same-domain job waits')
  domainA.resolve(); await pool.finish()
  assert.equal(done.length, 3)

  const outcomes = []
  for await (const r of prefetchDetails(() => refs(3), async ref => {
    if (ref.id === '1') throw new Error('fixture')
    return { company_name: ref.id }
  }, { concurrency: 2, shouldContinue: () => true, delayMs: 0 })) outcomes.push(r.ok)
  assert.equal(outcomes.filter(Boolean).length, 2)
  assert.equal(outcomes.filter(x => !x).length, 1)

  let producerClosed = false, activeAtStop = 0
  const signal = new AbortController()
  const stopping = (async () => {
    for await (const r of prefetchDetails(async function* () {
      try { yield* refs(20) } finally { producerClosed = true }
    }, async (_ref, taskSignal) => {
      activeAtStop++
      await new Promise(resolve => taskSignal.addEventListener('abort', resolve, { once: true }))
      activeAtStop--
      return { company_name: 'cancelled' }
    }, { concurrency: 2, shouldContinue: () => true, delayMs: 0, signal: signal.signal })) assert.fail(r)
  })()
  await sleep(10); signal.abort(); await stopping
  assert.equal(activeAtStop, 0); assert.ok(producerClosed)
  const retained = []
  await assert.rejects(async () => {
    for await (const r of prefetchDetails(async function* () { yield { id: 'kept' }; throw new Error('search failed') }, async ref => ({ company_name: ref.id }), {
      concurrency: 2, shouldContinue: () => true, delayMs: 0
    })) retained.push(r.raw.company_name)
  }, /search failed/)
  assert.deepEqual(retained, ['kept'])
  console.log('PASS: independent refill, completion-order results, shared request gate, bounded queues, per-domain scheduling, errors and cancellation')
}
const timer = setTimeout(() => { console.error('test timed out'); process.exit(1) }, 10000)
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => clearTimeout(timer))
