// 407개 로컬 데이터 검증에서 누락된 업체. 포괄적인 '컨설팅/파트너스/서치' 부분일치는 사용하지 않는다.
// 근거: 업체 공식 소개 또는 해당 업체가 게시한 채용정보의 헤드헌팅 표시.
export const VERIFIED_RECRUITMENT_AGENCIES = [
  { name: '스카우트', aliases: ['스카우트'], domains: ['scoutcorp.co.kr', 'scout.co.kr'],
    evidence: 'https://www.scoutcorp.co.kr/business/hr/headhunting' },
  { name: '굿커리어', aliases: ['굿커리어'], domains: ['goodcareer.co.kr'],
    evidence: 'https://goodcareer.co.kr/gc/' },
  { name: '글로벌서치', aliases: ['글로벌서치'], domains: [],
    evidence: 'https://www.saramin.co.kr/zf_user/company-info/view-inner-recruit?csn=eFdmWXIxMDNUam1QNmNBcm5hVEJGUT09' },
  { name: '탑커리어인사이트', aliases: ['탑커리어인사이트'], domains: ['topcareerinsight.co.kr'],
    evidence: 'https://www.topcareerinsight.co.kr/' },
  { name: '비비파트너스', aliases: ['비비파트너스'], domains: ['bbp.co.kr'],
    evidence: 'https://rds.jobkorea.co.kr/headhunting/headhunter/profile?HT_Id=23543' },
  { name: '시너지파트너즈', aliases: ['시너지파트너즈'], domains: ['jobnscout.com', 'synergypartners.co.kr'],
    evidence: 'https://m.saramin.co.kr/job-search/company-info-view/recruit?csn=TGVMWm4wck1SUWQwZ0kwc0NKNUNqQT09' },
  { name: '베스트에치알', aliases: ['베스트에치알', '베스트에치알(Best HR)'], domains: ['besthr.co.kr'],
    evidence: 'https://www.saramin.co.kr/zf_user/company-info/view-inner-recruit?csn=enJOQ0VzSnNOZ1djOGVzbTBUcjZadz09' },
  { name: '유비소시어스', aliases: ['유비소시어스'], domains: ['ubsocius.com'],
    evidence: 'https://www.ubsocius.com/sfs2/index.php' }
] as const

export function agencyCompanyKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/주식회사|\(주\)|㈜/g, '').replace(/\s+/g, '')
}
