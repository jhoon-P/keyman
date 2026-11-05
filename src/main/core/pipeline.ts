import { SourceAdapter, Filters, RunOptions, RawRecord } from './sources/types'
import { prefetchDetails } from './prefetchDetails'
import { TaskPool } from './taskPool'
import { PageScheduler, PageScheduleState } from './pageScheduler'
import type { CollectionStatus } from '../../shared/collection'
import { enrichFromHomepage } from './sources/homepage'

import { recruitmentAgencyReason } from './companyExclusion'

import { normalizePhone, normalizeCompanyName, parseAddress } from './normalize'

import { findDuplicate } from './dedup'
import { insertRawRecord, upsertCompany, getCompanyById, beginCollectionRun, Company } from '../db/repository'
import { nowKst } from './time'
import { logger } from '../log/logger'
import { withRetry, isBlockedResponse, createRequestGate } from './rateLimiter'

export type PipelineEvent =
  | { type: 'progress'; current: number; total?: number; company_name: string }
  | { type: 'log'; level: 'INFO' | 'WARN' | 'ERROR'; message: string }
  | { type: 'blocked'; source: string }
  | { type: 'status'; status: CollectionStatus }
  | { type: 'enrichment'; completed: number; pending: number }
  | { type: 'done'; count: number; runId: string }

export interface PipelineOptions {
  sources: SourceAdapter[]
  filters: Filters
  runOptions: RunOptions
  onEvent: (evt: PipelineEvent) => void
}

let _activeRun: AbortController | null = null

export function abortPipeline(): void {
  _activeRun?.abort()
}

export async function runPipeline(opts: PipelineOptions): Promise<void> {
  if (_activeRun) throw new Error('이전 수집이 종료 중입니다. 완료 후 다시 시작하세요.')
  const controller = new AbortController()
  const signal = controller.signal
  _activeRun = controller
  const { sources, filters, runOptions, onEvent } = opts
  const runId = runOptions.runId

  let totalSaved = 0
  const maxCount = filters.max_count ?? Infinity

  const startedAt = Date.now()
  let homepageCompleted = 0
  let homepageQueued = 0
  let homepageMs = 0
  const workerCount = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? Math.min(4, Math.max(1, Math.floor(value!))) : fallback
  const schedulerMode = runOptions.schedulerMode ?? 'reserved'
  const reservedMode = schedulerMode === 'reserved'
  const sharedMode = reservedMode || schedulerMode === 'shared'
  const sharedWorkers = Number.isFinite(runOptions.sharedWorkers) ? Math.min(8, Math.max(1, Math.floor(runOptions.sharedWorkers!))) : 7
  const detailReserved = reservedMode ? Math.min(sharedWorkers - 1, workerCount(runOptions.maxConcurrent, 3)) : 0
  const detailWorkers = sharedMode ? sharedWorkers : workerCount(runOptions.maxConcurrent, 4)
  const homepageWorkers = sharedMode ? sharedWorkers : workerCount(runOptions.homepageConcurrent, 3)
  let detailInputQueued = 0
  let homepageInputQueued = 0
  let pageState: PageScheduleState = { active: 0, detailReserved, detailActive: 0, homepageActive: 0, detailQueued: 0, homepageQueued: 0 }
  const homepageIds = new Set<number>()
  const status: CollectionStatus = {
    sharedWorkers: sharedMode ? sharedWorkers : undefined, sharedActive: 0, detailReserved,
    phase: 'collecting', saved: 0, detailFailed: 0, detailWorkers, detailActive: 0, detailQueued: 0,
    detailReady: 0, detailCompleted: 0, homepageWorkers, homepageActive: 0,
    homepageQueued: 0, homepageCompleted: 0, homepageFailed: 0, homepageTimedOut: 0
  }
  const report = () => onEvent({ type: 'status', status: { ...status, saved: totalSaved } })
  const scheduler = sharedMode ? new PageScheduler(sharedWorkers, 20, state => {
    pageState = state
    status.sharedActive = state.active
    status.detailReserved = state.detailReserved
    status.detailActive = state.detailActive
    status.homepageActive = state.homepageActive
    status.detailQueued = detailInputQueued + state.detailQueued
    status.homepageQueued = homepageInputQueued + state.homepageQueued
    report()
  }, { detailReserved }) : undefined
  const pool = new TaskPool(homepageWorkers, 16, state => {
    homepageInputQueued = state.queued
    if (!scheduler) status.homepageActive = state.active
    status.homepageQueued = state.queued + pageState.homepageQueued
    status.homepageCompleted = homepageCompleted
    onEvent({ type: 'enrichment', completed: homepageCompleted, pending: state.active + state.queued })
    report()
  }, error => { logger.collect('ERROR', '홈페이지 작업자 오류', error) })
  const stop = () => { status.stopReason = 'stopped'; status.phase = 'stopping'; pool.cancel(); scheduler?.cancel(); report() }
  signal.addEventListener('abort', stop, { once: true })

  // 어댑터가 차단 감지 등 사용자에게 보여야 할 이벤트를 UI로 올릴 수 있게 연결
  const adapterOptions: RunOptions = {
    ...runOptions,
    filters,
    onLog: (level, message) => onEvent({ type: 'log', level, message })
  }

  try {
    beginCollectionRun(runId)
    logger.startCollectRun(runId)
    report()
    for (const adapter of sources) {
      if (signal.aborted) break
      onEvent({ type: 'log', level: 'INFO', message: `[${adapter.label}] 수집 시작` })
      logger.collect('INFO', `adapter=${adapter.id} started`)

      // 수지 검증용 카운터: 전달받음 = 저장 + 제외(헤드헌팅) + 제외(임직원) + 오류 + 미처리
      let adapterCount = 0
      let received = 0
      let skipHeadhunt = 0
      let skipEmployee = 0
      let errorCount = 0
      let dedupHits = 0
      let endReason = '소스 소진(더 이상 결과 없음)'
      try {
        const requestGate = createRequestGate(runOptions.delayMs ?? 500)
        const sourceOptions: RunOptions = scheduler ? {
          ...adapterOptions,
          beforeRequest: requestSignal => scheduler.schedule({ kind: 'detail', rateKey: adapter.id, intervalMs: runOptions.delayMs ?? 500, signal: requestSignal, usesSlot: false, deferRateUntilRequest: reservedMode, prepareDuringRateWait: reservedMode }, async mark => { await mark() }),
          schedulePage: (_url, run, requestSignal) => scheduler.schedule({ kind: 'detail', rateKey: adapter.id, intervalMs: runOptions.delayMs ?? 500, deferRateUntilRequest: true, prepareDuringRateWait: reservedMode, signal: requestSignal }, run)
        } : { ...adapterOptions, beforeRequest: requestGate }
        const completedBefore = status.detailCompleted
        const details = prefetchDetails(
          sourceSignal => adapter.search(filters, { ...sourceOptions, signal: sourceSignal }),
          async (ref, detailSignal) => {
            const detailStarted = Date.now()
            const raw = await withRetry(() => adapter.fetchDetail(ref, { ...sourceOptions, signal: detailSignal }), { signal: detailSignal })
            logger.collect('DEBUG', `[성능] 상세=${Date.now() - detailStarted}ms name=${ref.name}`)
            return raw
          },
          {
            concurrency: Math.min(detailWorkers, Math.max(1, maxCount - totalSaved)),
            shouldContinue: () => !signal.aborted && totalSaved < maxCount,
            delayMs: scheduler ? 0 : runOptions.delayMs ?? 500,
            signal,
            onState: state => {
              detailInputQueued = state.queued
              if (!scheduler) status.detailActive = state.active
              status.detailQueued = state.queued + pageState.detailQueued
              status.detailReady = state.ready
              status.detailCompleted = completedBefore + state.completed
              report()
            }
          }
        )
        for await (const result of details) {
          const { ref } = result
          if (signal.aborted) { endReason = '사용자 중지'; break }
          if (totalSaved >= maxCount) { endReason = `최대 저장 건수 도달(${maxCount}건)`; break }
          received++

          try {
            if (!result.ok) throw result.error
            const raw = result.raw

            if (signal.aborted) { endReason = '사용자 중지'; break }

            // 차단 감지
            if (raw.extra?.html && isBlockedResponse(String(raw.extra.html))) {
              endReason = '차단 감지(상세 페이지)'
              status.stopReason = 'blocked'
              onEvent({ type: 'blocked', source: adapter.id })
              logger.collect('WARN', `BLOCKED by ${adapter.id}`)
              break
            }

            const rawId = insertRawRecord({
              source: raw.source,
              source_url: raw.source_url,
              raw_json: JSON.stringify(raw),
              collected_at: raw.collected_at
            })

            const company = buildCompany(raw, rawId)

            // 옵션 생략 시에도 기본 제외. 홈페이지 탐색·기업 저장 전에 판정한다.
            const exclusionReason = filters.exclude_recruitment_agencies !== false
              ? recruitmentAgencyReason(raw) : undefined
            if (exclusionReason) {
              skipHeadhunt++
              logger.collect('INFO', `skip(헤드헌팅/파견): name=${company.company_name} reason=${exclusionReason}`)
              onEvent({ type: 'log', level: 'INFO', message: `제외(헤드헌팅·채용대행): ${company.company_name} (${exclusionReason})` })
              continue
            }

            // 임직원 수 필터: 최소 인원 미만 제외 (사원수가 파악된 경우만 적용)
            if (filters.min_employee && company.employee_count != null && company.employee_count < filters.min_employee) {
              skipEmployee++
              logger.collect('INFO', `skip(임직원<${filters.min_employee}): name=${company.company_name} emp=${company.employee_count}`)
              onEvent({ type: 'log', level: 'INFO', message: `제외(임직원 ${company.employee_count}명): ${company.company_name}` })
              continue
            }

            const dedup = findDuplicate({
              biz_reg_no: company.biz_reg_no,
              company_name: company.company_name,
              address: company.address,
              main_phone: company.main_phone
            })

            if (dedup.existingId) {
              dedupHits++
              logger.collect('INFO', `dedup hit(${dedup.matchKey}): id=${dedup.existingId} name=${company.company_name}`)
              company.id = dedup.existingId
            }

            // 이미 전화번호를 확보한 기존 기업이면 홈페이지 재탐색 생략 — 건당 최대 수십 초가 걸리는
            // 가장 느린 구간이므로, 기존 번호를 이어받고 스킵한다.
            let skipHomepage = false
            if (dedup.existingId) {
              const existing = getCompanyById(dedup.existingId)
              for (const field of ['representative_name', 'address', 'region_sido', 'region_sigungu', 'company_type'] as const) {
                if (!company[field] && existing?.[field]) {
                  company[field] = existing[field]
                  const src = existing.field_sources?.[field]
                  if (src) {
                    company.field_sources ??= {}
                    company.field_sources[field] = src
                  }
                }
              }
              if (existing?.main_phone) {
                if (!company.main_phone) {
                  company.main_phone = existing.main_phone
                  company.phone_status = existing.phone_status
                  const src = existing.field_sources?.['main_phone']
                  if (src) {
                    if (!company.field_sources) company.field_sources = {}
                    company.field_sources['main_phone'] = src
                  }
                }
                skipHomepage = true
                logger.collect('INFO', `skip homepage(기존 번호 보유): name=${company.company_name} phone=${existing.main_phone}`)
                onEvent({ type: 'log', level: 'INFO', message: `홈페이지 탐색 생략(기존 번호 보유): ${company.company_name}` })
              }
            }

            company.collection_run_id = runId
            const companyId = upsertCompany(company)
            totalSaved++
            adapterCount++
            onEvent({ type: 'progress', current: totalSaved, company_name: company.company_name })
            logger.collect('INFO', `saved: ${company.company_name} phone=${company.main_phone ?? '-'}`)

            // 유한 대기열에 등록만 한다. 독립 홈페이지 작업자가 완료 즉시 다음 도메인을 맡는다.
            if (company.homepage_url && !skipHomepage && !homepageIds.has(companyId) && !signal.aborted) {
              const url = company.homepage_url
              const name = company.company_name
              let key: string
              try { key = new URL(url).hostname.replace(/^www\./, '') } catch { key = url }
              homepageIds.add(companyId)
              homepageQueued++
              await pool.add(key, async () => {
                const started = Date.now()
                try {
                  if (signal.aborted) return
                  const hp = await enrichFromHomepage(url, name, {
                    signal, timeoutMs: runOptions.homepageTimeoutMs ?? 12000,
                    schedulePage: scheduler ? (pageUrl, run, requestSignal) => {
                      let host: string
                      try { host = new URL(pageUrl).hostname.replace(/^www\./, '') } catch { host = pageUrl }
                      return scheduler.schedule({ kind: 'homepage', key: `homepage:${host}`, signal: requestSignal }, run)
                    } : undefined
                  })
                  if (signal.aborted) return
                  const pr = hp?.main_phone ? normalizePhone(hp.main_phone) : null
                  const usablePhone = pr && pr.type !== 'mobile'
                  if (hp?.outcome === 'timeout') status.homepageTimedOut++
                  else if (!usablePhone) status.homepageFailed++
                  const company = getCompanyById(companyId)
                  if (!company) return
                  if (usablePhone && hp) {
                    company.main_phone = pr.normalized
                    company.phone_status = pr.status
                    company.field_sources ??= {}
                    company.field_sources['main_phone'] = {
                      source: 'homepage', source_url: hp.source_url, collected_at: nowKst()
                    }
                  }

                  if (hp?.departments && hp.departments.length > 0) {
                    const existing = company.departments ? (Array.isArray(company.departments) ? company.departments : []) : []
                    const merged = Array.from(new Set([...existing, ...hp.departments]))
                    company.departments = merged
                    if (!company.field_sources) company.field_sources = {}
                    company.field_sources['departments'] = {
                      source: 'homepage',
                      source_url: hp.source_url,
                      collected_at: nowKst()
                    }
                  }

                  upsertCompany(company)
                } catch (err) {
                  if (!signal.aborted) {
                    status.homepageFailed++
                    logger.collect('WARN', `homepage 보강 실패: ${name}`, err)
                  }
                } finally {
                  homepageMs += Date.now() - started
                  homepageCompleted++
                  logger.collect('DEBUG', `[성능] 홈페이지=${Date.now() - started}ms name=${name}`)
                }
              })
            }
            if (totalSaved >= maxCount) { endReason = `최대 저장 건수 도달(${maxCount}건)`; break }

          } catch (err) {
            errorCount++
            status.detailFailed++
            logger.collect('ERROR', `fetchDetail error: ${ref.detail_url}`, err as Error)
            onEvent({ type: 'log', level: 'ERROR', message: `상세 파싱 실패: ${ref.name}` })
          }
        }
      } catch (err) {
        if (!signal.aborted) status.stopReason = 'error'
        endReason = `검색 오류: ${String(err).slice(0, 120)}`
        logger.collect('ERROR', `adapter ${adapter.id} search error`, err as Error)
        onEvent({ type: 'log', level: 'ERROR', message: `[${adapter.label}] 검색 오류: ${String(err)}` })
      }

      if (totalSaved >= maxCount) status.stopReason ??= 'limit'
      // 루프 안에서 break 없이 중지된 경우(다음 ref 대기 중 중지 등) 사유 보정
      if (signal.aborted && !endReason.startsWith('사용자')) endReason = '사용자 중지'

      // 수지 요약 — 전달받음 = 저장 + 제외 + 오류 가 맞는지로 파이프라인 누락을 검증한다
      const summary =
        `[수지] ${adapter.id}: 전달받음=${received} 저장=${adapterCount}` +
        ` 제외(헤드헌팅)=${skipHeadhunt} 제외(임직원)=${skipEmployee}` +
        ` 오류=${errorCount} 중복병합=${dedupHits} 종료사유=${endReason}`
      logger.collect('INFO', summary)
      onEvent({
        type: 'log', level: 'INFO',
        message: `[${adapter.label}] 수집 완료: 저장 ${adapterCount}건 / 전달 ${received}건` +
          ` (제외 ${skipHeadhunt + skipEmployee}, 오류 ${errorCount}) — ${endReason}`
      })
    }
  } catch (error) {
    status.stopReason = 'error'
    throw error
  } finally {
    status.stopReason ??= 'exhausted'
    status.phase = signal.aborted ? 'stopping' : 'enriching'
    scheduler?.releaseDetailReservation()
    report()
    await pool.finish()
    await scheduler?.finish()
    signal.removeEventListener('abort', stop)
    status.phase = signal.aborted ? 'stopped' : 'done'
    report()
    logger.collect('INFO', `[성능] 전체=${Date.now() - startedAt}ms 구조=${reservedMode ? '상세우선' : sharedMode ? '공용' : '단계별'} 공용슬롯=${sharedMode ? sharedWorkers : 0} 상세예약=${detailReserved} 홈페이지=${homepageQueued}건 누적작업=${homepageMs}ms 홈페이지동시작업=${homepageWorkers} 상세동시작업=${detailWorkers} 보강실패=${status.homepageFailed} 보강시간초과=${status.homepageTimedOut}`)
    _activeRun = null
    onEvent({ type: 'done', count: totalSaved, runId })
    logger.endCollectRun()
  }
}

function buildCompany(raw: RawRecord, rawId: number): Company {
  const normName = normalizeCompanyName(raw.company_name)
  const phoneResult = raw.main_phone ? normalizePhone(raw.main_phone) : null
  const { region_sido, region_sigungu } = raw.address ? parseAddress(raw.address) : {}
  const now = raw.collected_at

  // 모바일(010)은 대표번호가 아니라 키맨 후보로 분류
  const isMobile = phoneResult?.type === 'mobile'
  const mainPhone = isMobile ? undefined : phoneResult?.normalized
  const phoneStatus = isMobile ? 'none' : (phoneResult ? phoneResult.status : 'none')

  // 모바일이면 keyman_candidates에 추가
  const keymanFromPhone = isMobile && phoneResult
    ? [{ phone: phoneResult.normalized, source: raw.source }]
    : []
  const keyman = [
    ...keymanFromPhone,
    ...(raw.keyman_candidates?.map(k => ({ ...k, source: raw.source })) ?? [])
  ]

  const fieldSources: Record<string, { source: string; source_url?: string; collected_at: string }> = {}
  const tag = (field: string) => {
    fieldSources[field] = { source: raw.source, source_url: raw.source_url, collected_at: now }
  }

  tag('company_name')
  if (mainPhone) tag('main_phone')
  if (raw.representative_name) tag('representative_name')
  if (raw.address) tag('address')
  if (raw.industry) tag('industry')
  if (raw.company_type) tag('company_type')
  if (raw.employee_count) tag('employee_count')
  if (raw.homepage_url) tag('homepage_url')
  if (raw.biz_reg_no) tag('biz_reg_no')

  return {
    company_name: normName,
    main_phone: mainPhone,
    phone_status: phoneStatus,
    representative_name: raw.representative_name,
    address: raw.address,
    region_sido,
    region_sigungu,
    industry: raw.industry,
    company_type: raw.company_type,
    employee_count: raw.employee_count,
    homepage_url: raw.homepage_url,
    job_url: raw.job_url || raw.source_url,
    biz_reg_no: raw.biz_reg_no,
    departments: raw.departments,
    keyman_candidates: keyman.length ? keyman : undefined,
    field_sources: fieldSources,
    raw_record_ids: [rawId]
  }
}
