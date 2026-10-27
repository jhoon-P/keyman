const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTs(relativePath, dependencies = {}, extraExports = '') {
  const filename = path.join(__dirname, '..', relativePath)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8') + extraExports, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, URL,
    require: id => {
      if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`)
      return dependencies[id]
    }
  }, { filename })
  return module.exports
}

const agencies = loadTs('src/main/core/recruitmentAgencies.ts')
const exclusion = loadTs('src/main/core/companyExclusion.ts', { './recruitmentAgencies': agencies })
const { recruitmentAgencyReason } = exclusion
for (const company of [
  { company_name: '가나 서치펌' },
  { company_name: '가나 써치펌' },
  { company_name: 'ABC Executive Search' },
  { company_name: 'ABC Recruitment' },
  { company_name: '가나 헤드헌터' },
  { industry: '고용 알선 및 인력 공급업' },
  { industry: '임시 및 일용 인력 공급업' },
  { industry: '직업 소개업' },
  { industry: '인적 자원 공급 및 인사 관리 서비스업' },
  { business_description: '채용 대행 / 인재 추천' },
  { business_description: '근로자 파견 서비스' },
  { company_name: '(주)스카우트', industry: '경영 컨설팅업' },
  { company_name: '굿커리어', industry: '경영 컨설팅업' },
  { company_name: '글로벌서치', industry: '시설관리·경비·용역' },
  { company_name: '탑커리어인사이트', industry: '서비스업' },
  { company_name: '(주)비비파트너스', industry: '경영 컨설팅업' },
  { company_name: '시너지파트너즈(주)' },
  { company_name: '(주)베스트에치알 (Best HR)', industry: '경영 컨설팅업' },
  { company_name: '(주)유비소시어스' },
  { company_name: '주식회사 스카우트' },
  { company_name: '㈜베스트에치알（Best HR）' },
  { company_name: '이름변경업체', homepage_url: 'https://www.ubsocius.com/sfs2/index.php' },
  { company_name: '신규업체', recruitment_agency_evidence: '사람인 회사 표시: 헤드헌팅' }
]) assert.ok(recruitmentAgencyReason(company), JSON.stringify(company))

for (const company of [
  {},
  { company_name: '한국정밀', industry: '자동차 부품 제조업' },
  { company_name: '한국교육', industry: '교육 서비스업' },
  { company_name: '한국소프트', business_description: '인사관리 소프트웨어 개발 및 채용 플랫폼 운영' },
  { company_name: '한국컨설팅', industry: '경영 컨설팅업' },
  { company_name: '스카우트소프트웨어', industry: '소프트웨어 개발업' },
  { company_name: '시너지파트너즈벤처스' },
  { company_name: '글로벌서치테크' },
  { company_name: '베스트', industry: '서비스업' },
  { company_name: '일반시설관리', industry: '시설관리·경비·용역' },
  { company_name: '일반업체', homepage_url: 'https://ubsocius.com.example.test/' },
  { company_name: '일반업체', homepage_url: 'not a URL' }
]) assert.equal(recruitmentAgencyReason(company), undefined, JSON.stringify(company))

async function checkPipeline(exclude, expected) {
  const saved = []
  const events = []
  const homepageVisits = []
  const rawRecords = [
    { company_name: '가나 서치펌' },
    { company_name: '나나파트너스', industry: '고용 알선업' },
    { company_name: '다다파트너스', business_description: '채용 대행' },
    { company_name: '(주)유비소시어스' },
    { company_name: '신규업체', recruitment_agency_evidence: '사람인 회사 표시: 헤드헌팅' },
    { company_name: '일반제조', industry: '자동차 부품 제조업' },
    { company_name: '일반소프트', industry: '소프트웨어 개발업' },
    { company_name: '상한초과', industry: '제조업' }
  ].map(company => ({ ...company, source: 'fixture', source_url: 'https://example.test',
    homepage_url: 'https://example.test', collected_at: '2026-10-26' }))
  const { runPipeline } = loadTs('src/main/core/pipeline.ts', {
    './companyExclusion': exclusion,
    './sources/homepage': { enrichFromHomepage: async (_url, name) => { homepageVisits.push(name); return null } },
    './normalize': {
      normalizeCompanyName: name => name,
      normalizePhone: () => null, parseAddress: () => ({})
    },
    './dedup': { findDuplicate: () => ({}) },
    '../db/repository': {
      beginCollectionRun: () => {}, insertRawRecord: () => 1, upsertCompany: company => saved.push(company.company_name),
      getCompanyById: () => undefined
    },
    './time': { nowKst: () => '2026-10-26' },
    '../log/logger': { logger: { startCollectRun() {}, endCollectRun() {}, collect() {} } },
    './rateLimiter': { withRetry: fn => fn(), isBlockedResponse: () => false, sleep: async () => {} }
  })
  await runPipeline({
    sources: [{ id: 'fixture', label: 'fixture',
      async *search() { for (let i = 0; i < rawRecords.length; i++) yield { id: i } },
      async fetchDetail(ref) { return rawRecords[ref.id] }
    }],
    filters: { max_count: 2, exclude_recruitment_agencies: exclude },
    runOptions: { runId: 'test', delayMs: 0 }, onEvent: event => events.push(event)
  })
  assert.deepEqual(saved, expected)
  assert.deepEqual(homepageVisits, expected)
  assert.equal(events.filter(event => event.type === 'progress').length, 2)
  assert.equal(events.find(event => event.type === 'done').count, 2)
  assert.equal(events.filter(event => event.message?.startsWith('제외(')).length, exclude === false ? 0 : 5)
}

async function checkSaraminParsing() {
  const { chromium } = require('playwright')
  let executablePath = chromium.executablePath()
  if (!fs.existsSync(executablePath)) {
    const cache = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'ms-playwright')
    const folder = fs.readdirSync(cache).find(name => /^chromium-/.test(name))
    executablePath = path.join(cache, folder, 'chrome-win64', 'chrome.exe')
  }
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    const page = await browser.newPage()
    const { readSaraminAgencyNotice } = loadTs('src/main/core/sources/saraminAgency.ts')
    for (const [name, html, expected] of [
      ['새업체', '<p>새업체은(는) 채용을 대행하는 헤드헌팅 기업이므로, 실제 근무할 기업정보를 확인하세요.</p>', true],
      ['㈜베스트에치알 (Best HR)', '<div>(주)베스트에치알은(는) 채용을 대행하는 헤드헌팅 기업이므로 확인하세요.</div>', true],
      ['일반제조', '<nav>헤드헌팅</nav><h1>일반제조</h1><p>채용 담당자 모집</p>', false],
      ['일반제조', '<p>일반제조</p><p>타사은(는) 채용을 대행하는 헤드헌팅 기업이므로 확인하세요.</p>', false],
      ['일반제조', '<div>일반제조 추천업체: 타사은(는) 채용을 대행하는 헤드헌팅 기업이므로 확인하세요.</div>', false]
    ]) {
      await page.setContent(html)
      assert.equal(Boolean(await page.evaluate(readSaraminAgencyNotice, name)), expected, name)
    }
    const { extractCompaniesFromSearchPage, saraminAdapter } = loadTs('src/main/core/sources/saramin.ts', {
      '../browser': { newPage: async () => page }, '../rateLimiter': {},
      '../../log/logger': {}, '../time': {}, './regions': {}, './saraminIndustry': {},
      '../companyExclusion': exclusion, './saraminAgency': { readSaraminAgencyNotice }
    }, '\nexport { extractCompaniesFromSearchPage }')
    await page.setContent(`<nav>헤드헌팅</nav><div class="list_recruiting">
      <div class="box_item"><div class="company_nm"><a href="https://www.saramin.co.kr/view-inner-recruit?id=1">새채용업체</a><span>헤드헌팅</span></div></div>
      <div class="box_item"><div class="company_nm"><a href="https://www.saramin.co.kr/view-inner-recruit?id=2">일반제조</a></div><div class="job_sector">헤드헌팅</div></div>
      <div class="box_item"><div class="company_nm"><a href="https://www.saramin.co.kr/view-inner-recruit?id=3">새파견업체</a><em>파견·도급·대행</em></div></div></div>`)
    const result = await extractCompaniesFromSearchPage(page)
    assert.equal(result.entries.length, 3)
    assert.ok(result.entries[0].recruitment_agency_evidence)
    assert.equal(result.entries[1].recruitment_agency_evidence, undefined)
    assert.equal(result.entries[1].industryHint, undefined)
    assert.ok(result.entries[2].recruitment_agency_evidence)
    assert.ok(saraminAdapter)
    console.log('Saramin DOM checks passed (company badges, notice, unrelated menu/job/recommendation text).')
  } finally { await browser.close() }
}

async function main() {
  await checkPipeline(undefined, ['일반제조', '일반소프트'])
  await checkPipeline(true, ['일반제조', '일반소프트'])
  await checkPipeline(false, ['가나 서치펌', '나나파트너스'])
  await checkSaraminParsing()
  console.log('Company exclusion checks passed (classification, defaults, opt-out, saved count, homepage skip).')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
