const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./helpers/load-ts')
const { parseExclusionKeywords, excludedKeywordReason } = createLoader()(path.resolve('src/shared/exclusionKeywords.ts'))

assert.equal(parseExclusionKeywords(' 부동산,컨설팅\n고용 알선\r\n고용알선,IT,it, , - ').join('|'), '부동산|컨설팅|고용 알선|IT')
for (const record of [
  { company_name: '한국부동산' }, { industry: '경영 컨설팅업' },
  { business_description: '고용 알선 및 인력 공급' }
]) assert.ok(excludedKeywordReason(record))
assert.equal(excludedKeywordReason({ company_name: '컨설팅' }, []), undefined)
assert.equal(excludedKeywordReason({ industry: '광고 대행업' }, ['광고대행']), '업종: 광고대행')
assert.equal(excludedKeywordReason({ industry: 'ＢＰＯ Services' }, ['bpo']), '업종: bpo')
assert.equal(excludedKeywordReason({ company_name: '제조기업', job_title: '부동산 컨설팅 담당자', extra: { html: '고용알선' } }), undefined)
assert.equal(excludedKeywordReason({ company_name: '정상기업' }, ['.*', '(', ' ', '-']), undefined)
assert.equal(excludedKeywordReason({}, ['광고']), undefined)
assert.equal(excludedKeywordReason({
  company_name: '정밀제조', industry: '자동차 부품 제조업',
  business_description: '자동차 부품 제조, 사옥 보유 및 부동산 임대'
}), undefined, 'real estate mentioned in business activities must not exclude a manufacturer')
assert.equal(excludedKeywordReason({ business_description: '부 동 산 임대' }, ['부동산']), undefined)
assert.equal(excludedKeywordReason({ company_name: '사옥보유기업', industry: '제조업, 부동산 임대업' }), undefined)
assert.equal(excludedKeywordReason({ industry: '부동산업' }, ['부 동 산']), undefined)
assert.equal(excludedKeywordReason({ company_name: '한국부동산' }, ['부 동 산']), '회사명: 부 동 산')
assert.equal(excludedKeywordReason({ industry: '부동산 임대업' }, ['부동산 임대']), '업종: 부동산 임대',
  'explicit custom keywords must retain their normal field scope')
assert.equal(excludedKeywordReason({ business_description: '부동산 임대, 경영 컨설팅' }), '사업내용: 컨설팅',
  'the real estate exception must not bypass other exclusion keywords')

async function checkPipeline(keywords, records, expected) {
  const saved = [], homepage = [], events = []
  const pipeline = createLoader({
    '../db/repository': {
      beginCollectionRun() {}, insertRawRecord: () => 1,
      upsertCompany: company => { saved.push(company.company_name); return saved.length },
      getCompanyById: () => null
    },
    './dedup': { findDuplicate: () => ({ existingId: null }) },
    './sources/homepage': { enrichFromHomepage: async (_url, name) => { homepage.push(name); return null } },
    '../log/logger': { logger: { startCollectRun() {}, collect() {}, endCollectRun() {} } }
  })(path.resolve('src/main/core/pipeline.ts'))
  await pipeline.runPipeline({
    sources: [{ id: 'test', label: 'test',
      async *search() { for (const record of records) yield record },
      async fetchDetail(record) { return { source: 'test', source_url: 'https://example.test',
        homepage_url: 'https://example.test', collected_at: '2026-11-26', ...record } }
    }],
    filters: { max_count: 1, exclude_recruitment_agencies: false, excluded_keywords: keywords },
    runOptions: { runId: 'keywords', delayMs: 0 }, onEvent: event => events.push(event)
  })
  assert.deepEqual(saved, expected)
  assert.deepEqual(homepage, expected, 'excluded companies must not trigger homepage enrichment')
  assert.equal(events.at(-1).count, expected.length)
  assert.equal(events.filter(event => event.type === 'progress').length, expected.length)
  assert.ok(!events.some(event => event.level === 'ERROR'))
  return events
}

async function main() {
  const records = [
    { company_name: '부동산회사' },
    { company_name: '경영회사', industry: '경영 컨설팅업' },
    { company_name: '알선회사', business_description: '고용 알선업' },
    { company_name: '정상제조', industry: '자동차 부품 제조업', job_title: '부동산 컨설팅 담당' }
  ]
  const defaults = await checkPipeline(undefined, records, ['정상제조'])
  assert.equal(defaults.filter(event => event.message?.startsWith('제외(키워드)')).length, 3)
  await checkPipeline([], records, ['부동산회사'])
  await checkPipeline(['광고'], [{ company_name: '광고회사' }, { company_name: '정상제조' }], ['정상제조'])
  await checkPipeline(['제조'], [{ company_name: '정상제조' }], [])
  await checkPipeline(undefined, [{ company_name: '사옥보유제조', industry: '제조업',
    business_description: '정밀 부품 제조 및 부동산 임대' }], ['사옥보유제조'])
  await checkPipeline(undefined, [{ company_name: '일반제조기업', industry: '제조업, 부동산 임대업',
    business_description: '전자 부품 생산' }], ['일반제조기업'])
  console.log('Exclusion keyword checks passed: defaults, custom/empty lists, field scope, normalization, literal matching, save limit, homepage skip, logs.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
