/** page.evaluate에서 실행한다. 사이트 공통 메뉴나 타사 추천 공고의 '헤드헌팅'은 근거로 쓰지 않는다. */
export function readSaraminAgencyNotice(companyName: string): string | undefined {
  const key = (text: string) => text.normalize('NFKC').toLowerCase()
    .replace(/주식회사|\(주\)|㈜/g, '').replace(/\s+/g, '')
  // 사람인은 영문 별칭을 회사명 뒤에 덧붙이기도 한다.
  const name = key(companyName).replace(/\([^)]*\)$/, '')
  if (!name) return undefined
  for (const element of document.querySelectorAll('p, div, span')) {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text.length > 300) continue
    const normalized = key(text)
    if (!normalized.startsWith(name)) continue
    // 회사명 바로 뒤에 붙은 조사와 안내문만 인정한다. 추천 업체가 같은 문단에 있어도 제외한다.
    const afterName = normalized.slice(name.length).replace(/^[은는이가()]+/, '')
    if (afterName.startsWith('채용을대행하는헤드헌팅기업')) return `${companyName}: 채용을 대행하는 헤드헌팅 기업`
  }
  return undefined
}
