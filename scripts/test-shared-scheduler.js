const assert = require('node:assert/strict')
const path = require('node:path')
const { PageScheduler } = require('./helpers/load-ts')()(path.resolve('src/main/core/pageScheduler.ts'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function timing(workers) {
  let peak = 0
  const pool = new PageScheduler(workers, 20, state => { peak = Math.max(peak, state.active); assert.ok(state.active <= workers) })
  const began = Date.now()
  await Promise.all(Array.from({ length: 5 }, (_, i) => pool.schedule({ kind: i % 2 ? 'homepage' : 'detail' }, () => sleep(100))))
  await pool.finish()
  assert.equal(peak, workers)
  return Date.now() - began
}
async function main() {
  const serial = await timing(1), shared = await timing(5)
  assert.ok(shared < serial * 0.45, 'five independent pages must run as one batch')
  const order = [], states = []
  const pool = new PageScheduler(1, 20, state => states.push(state))
  const jobs = [
    pool.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 100 }, async () => { order.push('D1'); await sleep(5) }),
    pool.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 100 }, async () => { order.push('D2') }),
    pool.schedule({ kind: 'homepage' }, async () => { order.push('H') })
  ]
  await Promise.all(jobs); await pool.finish()
  assert.deepEqual(order, ['D1','H','D2'], 'rate wait must leave the slot available to homepage work')
  assert.ok(states.some(s => s.active === 0 && s.detailQueued === 1), 'cooldown is queued, not an active worker')

  const hold = deferred(), other = deferred(), domainOrder = []
  const domains = new PageScheduler(2, 10, () => {})
  const domainJobs = [
    domains.schedule({ kind: 'homepage', key: 'same' }, async () => { await hold.promise; domainOrder.push('a') }),
    domains.schedule({ kind: 'homepage', key: 'same' }, async () => { domainOrder.push('b') }),
    domains.schedule({ kind: 'homepage', key: 'other' }, async () => { other.resolve(); domainOrder.push('c') })
  ]
  await other.promise
  assert.ok(!domainOrder.includes('a'))
  hold.resolve(); await Promise.all(domainJobs); await domains.finish()
  assert.ok(domainOrder.indexOf('a') < domainOrder.indexOf('b'))

  const starts = [], ratePool = new PageScheduler(5, 10, () => {})
  await Promise.all(Array.from({ length: 5 }, () => ratePool.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 20 }, async () => { starts.push(Date.now()); await sleep(110) })))
  starts.slice(1).forEach((t, i) => assert.ok(t - starts[i] >= 17))
  await ratePool.finish()

  const requestStarts = [], exactGate = new PageScheduler(5, 10, () => {})
  await Promise.all(Array.from({ length: 3 }, () => exactGate.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 25, deferRateUntilRequest: true }, async mark => {
    await sleep(15) // Browser page setup happens before the request is sent.
    mark(); requestStarts.push(Date.now()); await sleep(15)
  })))
  requestStarts.slice(1).forEach((t, i) => assert.ok(t - requestStarts[i] >= 22, 'rate limit must be measured at request start, not page creation'))
  await exactGate.finish()

  async function preparationTiming(prepareDuringRateWait) {
    const requestTimes = [], pool = new PageScheduler(4, 10, () => {}, { detailReserved: 2 })
    const began = Date.now()
    await Promise.all(Array.from({ length: 4 }, () => pool.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 90,
      deferRateUntilRequest: true, prepareDuringRateWait }, async mark => {
      await sleep(60) // Opening a tab is allowed to overlap the previous request's cooldown.
      await mark(); requestTimes.push(Date.now()); await sleep(10)
    })))
    requestTimes.slice(1).forEach((time, index) => assert.ok(time - requestTimes[index] >= 88, 'prepared pages must retain the actual request interval'))
    await pool.finish()
    return Date.now() - began
  }
  const preparationAfterWait = await preparationTiming(false), preparationDuringWait = await preparationTiming(true)
  assert.ok(preparationDuringWait < preparationAfterWait * 0.85, 'tab setup must overlap cooldown rather than extending every request interval')

  const preparedController = new AbortController(), cancelledPreparation = new PageScheduler(2, 10, () => {}, { detailReserved: 1 })
  await cancelledPreparation.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 500 }, async () => {})
  let preparationReached
  const preparing = new Promise(resolve => { preparationReached = resolve })
  const cancelledRequest = cancelledPreparation.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 500,
    deferRateUntilRequest: true, prepareDuringRateWait: true, signal: preparedController.signal }, async mark => {
    preparationReached(); await mark(); assert.fail('an aborted prepared page must not send a request')
  })
  const preparedRejection = assert.rejects(cancelledRequest, /중지/)
  await preparing; preparedController.abort(); await preparedRejection; await cancelledPreparation.finish()

  const producerOrder = [], producerPool = new PageScheduler(3, 10, () => {}, { detailReserved: 1 })
  await producerPool.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 20 }, async () => {})
  await Promise.all([
    producerPool.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 20, usesSlot: false, deferRateUntilRequest: true, prepareDuringRateWait: true }, async mark => { await mark(); producerOrder.push('list') }),
    producerPool.schedule({ kind: 'detail', rateKey: 'saramin', intervalMs: 20, deferRateUntilRequest: true, prepareDuringRateWait: true }, async mark => { await mark(); producerOrder.push('detail') })
  ])
  assert.deepEqual(producerOrder, ['list', 'detail'], 'prepared detail pages must not starve an earlier queued search request')
  await producerPool.finish()

  const homepageHold = deferred(), detailHold = deferred(), reservedStates = []
  let homepageStarted = 0, detailStarted = 0
  const reserved = new PageScheduler(7, 20, state => {
    reservedStates.push(state)
    assert.ok(state.active <= 7)
    if (state.detailReserved) assert.ok(state.homepageActive <= 3, 'homepage work must leave four detail slots available')
  }, { detailReserved: 4 })
  const reservedHomepages = Array.from({ length: 7 }, () => reserved.schedule({ kind: 'homepage' }, async () => { homepageStarted++; await homepageHold.promise }))
  await sleep(0)
  assert.equal(homepageStarted, 3, 'future detail requests must retain their reserved slots even during rate waits')
  const reservedDetails = Array.from({ length: 4 }, () => reserved.schedule({ kind: 'detail' }, async () => { detailStarted++; await detailHold.promise }))
  await sleep(0)
  assert.equal(detailStarted, 4, 'all four detail slots must be available while homepages are running')
  detailHold.resolve(); await Promise.all(reservedDetails)
  assert.equal(homepageStarted, 3, 'a temporary gap between detail pages must preserve the reservation')
  reserved.releaseDetailReservation(); await sleep(0)
  assert.equal(homepageStarted, 7, 'all seven slots must be available to homepage work after detail collection ends')
  assert.ok(reservedStates.some(state => state.homepageActive === 7 && state.detailReserved === 0))
  homepageHold.resolve(); await Promise.all(reservedHomepages); await reserved.finish()

  const firstDetail = deferred(), firstHomepage = deferred(), nextDetail = deferred(), priorityOrder = []
  const priority = new PageScheduler(2, 10, () => {}, { detailReserved: 1 })
  const priorityJobs = [
    priority.schedule({ kind: 'detail' }, () => firstDetail.promise),
    priority.schedule({ kind: 'homepage' }, () => firstHomepage.promise),
    priority.schedule({ kind: 'homepage' }, async () => { priorityOrder.push('homepage') }),
    priority.schedule({ kind: 'detail' }, async () => { priorityOrder.push('detail'); await nextDetail.promise })
  ]
  firstHomepage.resolve(); await sleep(0)
  assert.deepEqual(priorityOrder, ['detail'], 'ready detail work must take a free slot before an earlier queued homepage')
  nextDetail.resolve(); firstDetail.resolve(); await Promise.all(priorityJobs); await priority.finish()
  assert.deepEqual(priorityOrder, ['detail', 'homepage'])
  assert.throws(() => new PageScheduler(1, 10, () => {}, { detailReserved: 1 }), /reservation/, 'at least one homepage slot must remain to avoid backpressure deadlocks')

  const controller = new AbortController(), cancelPool = new PageScheduler(1, 1, () => {}), running = deferred()
  const first = cancelPool.schedule({ kind: 'detail' }, () => running.promise)
  const second = cancelPool.schedule({ kind: 'homepage', signal: controller.signal }, async () => assert.fail('cancelled queued page started'))
  const third = cancelPool.schedule({ kind: 'detail', signal: controller.signal }, async () => assert.fail('cancelled capacity waiter started'))
  const rejected = Promise.all([assert.rejects(second, /중지/), assert.rejects(third, /중지/)])
  controller.abort(); await rejected
  cancelPool.cancel(); running.resolve(); await first; await cancelPool.finish()

  const failure = new PageScheduler(1, 10, () => {})
  await assert.rejects(failure.schedule({ kind: 'detail' }, async () => { throw new Error('fixture') }), /fixture/)
  assert.equal(await failure.schedule({ kind: 'homepage' }, async () => 42), 42, 'error must return its slot')
  await failure.finish()
  console.log(`PASS: shared slots, detail reservation/priority/release, prepared request intervals, fairness, per-domain limits, cancellation and error cleanup. Five 100ms tasks: serial=${serial}ms shared=${shared}ms. Tab preparation: after-wait=${preparationAfterWait}ms during-wait=${preparationDuringWait}ms`)
}
const timer = setTimeout(() => { console.error('scheduler test timed out'); process.exit(1) }, 10000)
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => clearTimeout(timer))
