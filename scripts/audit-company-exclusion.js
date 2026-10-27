// Read the installed app's database into memory; never initialize the app repository or write the DB.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const vm = require('node:vm')
const ts = require('typescript')
const initSqlJs = require('sql.js')

const confirmedAgencies = new Map([
  [348, { name: '(주)스카우트', evidence: 'https://www.scoutcorp.co.kr/business/hr/headhunting' }],
  [350, { name: '굿커리어', evidence: 'https://goodcareer.co.kr/gc/' }],
  [351, { name: '글로벌서치', evidence: 'https://www.saramin.co.kr/zf_user/company-info/view-inner-recruit?csn=eFdmWXIxMDNUam1QNmNBcm5hVEJGUT09' }],
  [355, { name: '탑커리어인사이트', evidence: 'https://www.topcareerinsight.co.kr/' }],
  [359, { name: '(주)비비파트너스', evidence: 'https://rds.jobkorea.co.kr/headhunting/headhunter/profile?HT_Id=23543' }],
  [362, { name: '시너지파트너즈(주)', evidence: 'https://m.saramin.co.kr/job-search/company-info-view/recruit?csn=TGVMWm4wck1SUWQwZ0kwc0NKNUNqQT09' }],
  [363, { name: '(주)베스트에치알 (Best HR)', evidence: 'https://www.saramin.co.kr/zf_user/company-info/view-inner-recruit?csn=enJOQ0VzSnNOZ1djOGVzbTBUcjZadz09' }],
  [390, { name: '(주)유비소시어스', evidence: 'https://www.ubsocius.com/sfs2/index.php' }]
])

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function query(db, sql) {
  const result = db.exec(sql)[0]
  return result ? result.values.map(row => Object.fromEntries(result.columns.map((key, i) => [key, row[i]]))) : []
}

async function main() {
  const dbPath = path.resolve(process.argv[2] || path.join(process.env.APPDATA, 'key', 'data', 'companies.db'))
  const outputDir = path.resolve(__dirname, '..', 'data', 'agency-filter-audit')
  const original = fs.readFileSync(dbPath)
  const SQL = await initSqlJs()
  const db = new SQL.Database(original)
  const module = { exports: {} }
  const classifierPath = path.resolve(__dirname, '..', 'src/main/core/companyExclusion.ts')
  const classifierSource = fs.readFileSync(classifierPath, 'utf8')
  const agenciesModule = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', 'src/main/core/recruitmentAgencies.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { module: agenciesModule, exports: agenciesModule.exports })
  vm.runInNewContext(ts.transpileModule(classifierSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { module, exports: module.exports, URL,
    require: id => {
      if (id === './recruitmentAgencies') return agenciesModule.exports
      throw new Error(`Unexpected dependency: ${id}`)
    }
  }, { filename: classifierPath })
  const { recruitmentAgencyReason } = module.exports
  const raw = new Map(query(db, 'SELECT id, raw_json FROM raw_records').map(row => [row.id, JSON.parse(row.raw_json)]))
  const companies = query(db, 'SELECT id, company_name, industry, homepage_url, raw_record_ids FROM companies ORDER BY id')
  const rows = companies.map(company => {
    const records = JSON.parse(company.raw_record_ids || '[]').map(id => raw.get(id)).filter(Boolean)
    const reasons = [...new Set([recruitmentAgencyReason(company), ...records.map(recruitmentAgencyReason)].filter(Boolean))]
    const verified = confirmedAgencies.get(company.id)
    // IDs are specific to this installed database; require a matching name as well.
    const evidence = verified?.name === company.company_name ? verified.evidence : undefined
    return { id: company.id, company_name: company.company_name, industry: company.industry,
      reasons, excluded: reasons.length > 0, evidence,
      has_business_description: records.some(record => Boolean(record.business_description)),
      linked_raw_records: records.length }
  })
  db.close()
  const excluded = rows.filter(row => row.excluded)
  const misses = rows.filter(row => row.evidence && !row.excluded)
  const baselinePath = path.join(outputDir, 'before-improvement.json')
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : undefined
  const sameDatabase = baseline?.summary.database_sha256 === hash(original)
  const previousExcluded = new Set(sameDatabase ? baseline.rows.filter(row => row.excluded).map(row => row.id) : [])
  const newlyExcluded = sameDatabase ? excluded.filter(row => !previousExcluded.has(row.id)) : []
  const reasonCounts = {}
  for (const row of excluded) for (const reason of row.reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
  const summary = {
    database: dbPath, database_sha256: hash(original), classifier_sha256: hash(classifierSource),
    companies: rows.length, raw_records: raw.size, excluded: excluded.length, passed: rows.length - excluded.length,
    confirmed_misses_at_least: misses.length, missing_industry: rows.filter(row => !row.industry).length,
    confirmed_agencies: rows.filter(row => row.evidence).length,
    baseline_excluded: sameDatabase ? baseline.summary.excluded : null,
    newly_excluded: sameDatabase ? newlyExcluded.length : null,
    with_business_description: rows.filter(row => row.has_business_description).length,
    reason_counts: reasonCounts, database_unchanged: hash(fs.readFileSync(dbPath)) === hash(original)
  }
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify({ summary, rows }, null, 2))
  const table = entries => ['| ID | 회사명 | 저장 업종 | 결과 / 근거 |', '|---|---|---|---|',
    ...entries.map(row => `| ${row.id} | ${row.company_name} | ${row.industry || '미수집'} | ${row.reasons.join(', ') || `[헤드헌팅 확인](${row.evidence})`} |`)].join('\n')
  fs.writeFileSync(path.join(outputDir, 'results.md'), [
    '# 설치된 Key 데이터 필터 검증', '',
    `- 검증 시각: ${new Date().toISOString()}`,
    `- 대상: ${dbPath}`, `- 회사 ${summary.companies}개 / 원본 ${summary.raw_records}개`,
    `- 현재 필터: 제외 ${summary.excluded}개 / 통과 ${summary.passed}개`,
    `- 외부 근거로 확인한 누락: 최소 ${summary.confirmed_misses_at_least}개`,
    `- 이전 필터 제외 ${summary.baseline_excluded ?? '비교 불가'}개 / 이번 보강 추가 제외 ${summary.newly_excluded ?? '비교 불가'}개`,
    `- 업종 누락: ${summary.missing_industry}개 / 사업내용 보유: ${summary.with_business_description}개`,
    `- 원본 DB 변경 없음: ${summary.database_unchanged}`, '',
    '## 제외되는 회사', '', table(excluded), '',
    '## 확인된 누락', '', table(misses), '',
    '통과한 회사를 모두 일반 기업으로 확정한 것은 아닙니다.', '',
    '## 이번 보강으로 추가 제외', '', table(newlyExcluded), '',
    '기존 8개 누락은 회사명에 일반 키워드가 없고 업종이 경영 컨설팅업·서비스업·시설관리·경비·용역 또는 공란이었기 때문입니다.',
    '사업내용은 기존 407개 모두 미수집 상태였습니다. 확인된 회사명 전체 및 공식 도메인 대조를 추가하고, 향후 수집에서는 사람인 회사 표시·업체별 안내문을 원본에 보관해 판별합니다.', '',
    '## 해석', '',
    '고용 알선업 7개, 상용 인력 공급 및 인사관리 서비스업 7개, 임시 및 일용 인력 공급업 3개는 띄어쓰기 정규화 후 검출됩니다.',
    '경영 컨설팅업·서비스업·시설관리·경비·용역 전체를 제외하면 일반 기업도 제외될 수 있습니다. 회사명 전체 또는 사람인의 해당 업체 헤드헌팅 표식을 추가 근거로 사용해야 합니다.',
    '이 결과는 기존 저장 정보에 현재 키워드 판별 함수를 적용한 검증이며, 새 수집 화면의 표식 추출이나 전체 업체의 실제 업종을 완전히 검증한 결과는 아닙니다.',
    '개발 코드의 필터를 보강한 검증 결과입니다. 설치된 앱 업데이트나 기존 회사 삭제는 수행하지 않았습니다.', ''
  ].join('\n'))
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Report: ${path.join(outputDir, 'results.md')}`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
