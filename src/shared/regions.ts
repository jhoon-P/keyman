/**
 * 사람인 지역 코드 (loc_mcd = 시/도, loc_cd = 시/군/구)
 *
 * 실측 출처: /zf_user/jobs/list/domestic 지역 필터 패널의
 *   input[name="loc_mcd[]"] / input[name="loc_cd[]"] value (2026-08 수집).
 * 검색 URL 형식도 실측 확인:
 *   - 시/군/구 다중 선택은 콤마 결합 — loc_cd=101010,101150
 *   - loc_cd[]=... 배열 형식은 결과 0건이 되므로 사용 금지
 *   - loc_cd가 있으면 loc_mcd는 무시되므로 둘을 함께 보내지 않는다
 *
 * 사람인 분류를 그대로 따르므로 행정구역과 다른 부분이 있다:
 *   - 전남과 광주광역시가 112000 한 묶음 (112230~112270이 광주 자치구)
 *   - 세종(118000)·전국(117000)은 하위 지역 없음
 */

export interface SubRegion {
  /** 사람인 loc_cd */
  code: string
  label: string
}

export interface Region {
  /** 사람인 loc_mcd */
  code: string
  /** 화면 표시명 */
  label: string
  /** 행정 정식명 — DB의 region_sido 값과 맞춘다. 사람인 전용 묶음은 null */
  fullName: string | null
  subs: SubRegion[]
}

/** 사람인 지역 패널과 동일한 순서 */
export const REGIONS: Region[] = [
  {
    code: '101000',
    label: '서울',
    fullName: '서울특별시',
    subs: [
      { code: '101010', label: '강남구' },
      { code: '101020', label: '강동구' },
      { code: '101030', label: '강북구' },
      { code: '101040', label: '강서구' },
      { code: '101050', label: '관악구' },
      { code: '101060', label: '광진구' },
      { code: '101070', label: '구로구' },
      { code: '101080', label: '금천구' },
      { code: '101090', label: '노원구' },
      { code: '101100', label: '도봉구' },
      { code: '101110', label: '동대문구' },
      { code: '101120', label: '동작구' },
      { code: '101130', label: '마포구' },
      { code: '101140', label: '서대문구' },
      { code: '101150', label: '서초구' },
      { code: '101160', label: '성동구' },
      { code: '101170', label: '성북구' },
      { code: '101180', label: '송파구' },
      { code: '101190', label: '양천구' },
      { code: '101200', label: '영등포구' },
      { code: '101210', label: '용산구' },
      { code: '101220', label: '은평구' },
      { code: '101230', label: '종로구' },
      { code: '101240', label: '중구' },
      { code: '101250', label: '중랑구' },
    ]
  },
  {
    code: '102000',
    label: '경기',
    fullName: '경기도',
    subs: [
      { code: '102010', label: '가평군' },
      { code: '102020', label: '고양시' },
      { code: '102030', label: '고양시 덕양구' },
      { code: '102040', label: '고양시 일산동구' },
      { code: '102050', label: '고양시 일산서구' },
      { code: '102060', label: '과천시' },
      { code: '102070', label: '광명시' },
      { code: '102080', label: '광주시' },
      { code: '102090', label: '구리시' },
      { code: '102100', label: '군포시' },
      { code: '102110', label: '김포시' },
      { code: '102120', label: '남양주시' },
      { code: '102130', label: '동두천시' },
      { code: '102140', label: '부천시' },
      { code: '102150', label: '부천시 소사구' },
      { code: '102160', label: '부천시 오정구' },
      { code: '102170', label: '부천시 원미구' },
      { code: '102180', label: '성남시' },
      { code: '102190', label: '성남시 분당구' },
      { code: '102200', label: '성남시 수정구' },
      { code: '102210', label: '성남시 중원구' },
      { code: '102220', label: '수원시' },
      { code: '102230', label: '수원시 권선구' },
      { code: '102240', label: '수원시 영통구' },
      { code: '102250', label: '수원시 장안구' },
      { code: '102260', label: '수원시 팔달구' },
      { code: '102270', label: '시흥시' },
      { code: '102280', label: '안산시' },
      { code: '102290', label: '안산시 단원구' },
      { code: '102300', label: '안산시 상록구' },
      { code: '102310', label: '안성시' },
      { code: '102320', label: '안양시' },
      { code: '102330', label: '안양시 동안구' },
      { code: '102340', label: '안양시 만안구' },
      { code: '102350', label: '양주시' },
      { code: '102360', label: '양평군' },
      { code: '102370', label: '여주시' },
      { code: '102380', label: '연천군' },
      { code: '102390', label: '오산시' },
      { code: '102400', label: '용인시' },
      { code: '102410', label: '용인시 기흥구' },
      { code: '102420', label: '용인시 수지구' },
      { code: '102430', label: '용인시 처인구' },
      { code: '102440', label: '의왕시' },
      { code: '102450', label: '의정부시' },
      { code: '102460', label: '이천시' },
      { code: '102470', label: '파주시' },
      { code: '102480', label: '평택시' },
      { code: '102490', label: '포천시' },
      { code: '102500', label: '하남시' },
      { code: '102510', label: '화성시' },
      { code: '102520', label: '화성시 동탄구' },
      { code: '102530', label: '화성시 만세구' },
      { code: '102540', label: '화성시 병점구' },
      { code: '102550', label: '화성시 효행구' },
    ]
  },
  {
    code: '108000',
    label: '인천',
    fullName: '인천광역시',
    subs: [
      { code: '108010', label: '강화군' },
      { code: '108110', label: '검단구' },
      { code: '108020', label: '계양구' },
      { code: '108040', label: '남동구' },
      { code: '108030', label: '미추홀구' },
      { code: '108060', label: '부평구' },
      { code: '108120', label: '서해구' },
      { code: '108080', label: '연수구' },
      { code: '108130', label: '영종구' },
      { code: '108090', label: '옹진군' },
      { code: '108140', label: '제물포구' },
    ]
  },
  {
    code: '106000',
    label: '부산',
    fullName: '부산광역시',
    subs: [
      { code: '106010', label: '강서구' },
      { code: '106020', label: '금정구' },
      { code: '106030', label: '기장군' },
      { code: '106040', label: '남구' },
      { code: '106050', label: '동구' },
      { code: '106060', label: '동래구' },
      { code: '106070', label: '부산진구' },
      { code: '106080', label: '북구' },
      { code: '106090', label: '사상구' },
      { code: '106100', label: '사하구' },
      { code: '106110', label: '서구' },
      { code: '106120', label: '수영구' },
      { code: '106130', label: '연제구' },
      { code: '106140', label: '영도구' },
      { code: '106150', label: '중구' },
      { code: '106160', label: '해운대구' },
    ]
  },
  {
    code: '104000',
    label: '대구',
    fullName: '대구광역시',
    subs: [
      { code: '104090', label: '군위군' },
      { code: '104010', label: '남구' },
      { code: '104020', label: '달서구' },
      { code: '104030', label: '달성군' },
      { code: '104040', label: '동구' },
      { code: '104050', label: '북구' },
      { code: '104060', label: '서구' },
      { code: '104070', label: '수성구' },
      { code: '104080', label: '중구' },
    ]
  },
  {
    code: '112000',
    label: '전남·광주',
    fullName: null,
    subs: [
      { code: '112010', label: '강진군' },
      { code: '112020', label: '고흥군' },
      { code: '112030', label: '곡성군' },
      { code: '112230', label: '광산구' },
      { code: '112040', label: '광양시' },
      { code: '112050', label: '구례군' },
      { code: '112060', label: '나주시' },
      { code: '112240', label: '남구' },
      { code: '112070', label: '담양군' },
      { code: '112250', label: '동구' },
      { code: '112080', label: '목포시' },
      { code: '112090', label: '무안군' },
      { code: '112100', label: '보성군' },
      { code: '112260', label: '북구' },
      { code: '112270', label: '서구' },
      { code: '112110', label: '순천시' },
      { code: '112120', label: '신안군' },
      { code: '112130', label: '여수시' },
      { code: '112140', label: '영광군' },
      { code: '112150', label: '영암군' },
      { code: '112160', label: '완도군' },
      { code: '112170', label: '장성군' },
      { code: '112180', label: '장흥군' },
      { code: '112190', label: '진도군' },
      { code: '112200', label: '함평군' },
      { code: '112210', label: '해남군' },
      { code: '112220', label: '화순군' },
    ]
  },
  {
    code: '105000',
    label: '대전',
    fullName: '대전광역시',
    subs: [
      { code: '105010', label: '대덕구' },
      { code: '105020', label: '동구' },
      { code: '105030', label: '서구' },
      { code: '105040', label: '유성구' },
      { code: '105050', label: '중구' },
    ]
  },
  {
    code: '107000',
    label: '울산',
    fullName: '울산광역시',
    subs: [
      { code: '107010', label: '남구' },
      { code: '107020', label: '동구' },
      { code: '107030', label: '북구' },
      { code: '107040', label: '울주군' },
      { code: '107050', label: '중구' },
    ]
  },
  {
    code: '118000',
    label: '세종',
    fullName: '세종특별자치시',
    subs: []
  },
  {
    code: '109000',
    label: '강원',
    fullName: '강원특별자치도',
    subs: [
      { code: '109010', label: '강릉시' },
      { code: '109020', label: '고성군' },
      { code: '109030', label: '동해시' },
      { code: '109040', label: '삼척시' },
      { code: '109050', label: '속초시' },
      { code: '109060', label: '양구군' },
      { code: '109070', label: '양양군' },
      { code: '109080', label: '영월군' },
      { code: '109090', label: '원주시' },
      { code: '109100', label: '인제군' },
      { code: '109110', label: '정선군' },
      { code: '109120', label: '철원군' },
      { code: '109130', label: '춘천시' },
      { code: '109140', label: '태백시' },
      { code: '109150', label: '평창군' },
      { code: '109160', label: '홍천군' },
      { code: '109170', label: '화천군' },
      { code: '109180', label: '횡성군' },
    ]
  },
  {
    code: '110000',
    label: '경남',
    fullName: '경상남도',
    subs: [
      { code: '110010', label: '거제시' },
      { code: '110020', label: '거창군' },
      { code: '110030', label: '고성군' },
      { code: '110040', label: '김해시' },
      { code: '110050', label: '남해군' },
      { code: '110070', label: '밀양시' },
      { code: '110080', label: '사천시' },
      { code: '110090', label: '산청군' },
      { code: '110100', label: '양산시' },
      { code: '110110', label: '의령군' },
      { code: '110120', label: '진주시' },
      { code: '110140', label: '창녕군' },
      { code: '110150', label: '창원시' },
      { code: '110055', label: '창원시 마산합포구' },
      { code: '110053', label: '창원시 마산회원구' },
      { code: '110057', label: '창원시 성산구' },
      { code: '110059', label: '창원시 의창구' },
      { code: '110130', label: '창원시 진해구' },
      { code: '110160', label: '통영시' },
      { code: '110170', label: '하동군' },
      { code: '110180', label: '함안군' },
      { code: '110190', label: '함양군' },
      { code: '110200', label: '합천군' },
    ]
  },
  {
    code: '111000',
    label: '경북',
    fullName: '경상북도',
    subs: [
      { code: '111010', label: '경산시' },
      { code: '111020', label: '경주시' },
      { code: '111030', label: '고령군' },
      { code: '111040', label: '구미시' },
      { code: '111050', label: '군위군' },
      { code: '111060', label: '김천시' },
      { code: '111070', label: '문경시' },
      { code: '111080', label: '봉화군' },
      { code: '111090', label: '상주시' },
      { code: '111100', label: '성주군' },
      { code: '111110', label: '안동시' },
      { code: '111120', label: '영덕군' },
      { code: '111130', label: '영양군' },
      { code: '111140', label: '영주시' },
      { code: '111150', label: '영천시' },
      { code: '111160', label: '예천군' },
      { code: '111170', label: '울릉군' },
      { code: '111180', label: '울진군' },
      { code: '111190', label: '의성군' },
      { code: '111200', label: '청도군' },
      { code: '111210', label: '청송군' },
      { code: '111220', label: '칠곡군' },
      { code: '111230', label: '포항시' },
      { code: '111240', label: '포항시 남구' },
      { code: '111250', label: '포항시 북구' },
    ]
  },
  {
    code: '113000',
    label: '전북',
    fullName: '전북특별자치도',
    subs: [
      { code: '113010', label: '고창군' },
      { code: '113020', label: '군산시' },
      { code: '113030', label: '김제시' },
      { code: '113040', label: '남원시' },
      { code: '113050', label: '무주군' },
      { code: '113060', label: '부안군' },
      { code: '113070', label: '순창군' },
      { code: '113080', label: '완주군' },
      { code: '113090', label: '익산시' },
      { code: '113100', label: '임실군' },
      { code: '113110', label: '장수군' },
      { code: '113120', label: '전주시' },
      { code: '113130', label: '전주시 덕진구' },
      { code: '113140', label: '전주시 완산구' },
      { code: '113150', label: '정읍시' },
      { code: '113160', label: '진안군' },
    ]
  },
  {
    code: '115000',
    label: '충남',
    fullName: '충청남도',
    subs: [
      { code: '115010', label: '계룡시' },
      { code: '115020', label: '공주시' },
      { code: '115030', label: '금산군' },
      { code: '115040', label: '논산시' },
      { code: '115050', label: '당진시' },
      { code: '115060', label: '보령시' },
      { code: '115070', label: '부여군' },
      { code: '115080', label: '서산시' },
      { code: '115090', label: '서천군' },
      { code: '115100', label: '아산시' },
      { code: '115110', label: '연기군' },
      { code: '115120', label: '예산군' },
      { code: '115130', label: '천안시' },
      { code: '115133', label: '천안시 동남구' },
      { code: '115135', label: '천안시 서북구' },
      { code: '115140', label: '청양군' },
      { code: '115150', label: '태안군' },
      { code: '115160', label: '홍성군' },
    ]
  },
  {
    code: '114000',
    label: '충북',
    fullName: '충청북도',
    subs: [
      { code: '114010', label: '괴산군' },
      { code: '114020', label: '단양군' },
      { code: '114030', label: '보은군' },
      { code: '114040', label: '영동군' },
      { code: '114050', label: '옥천군' },
      { code: '114060', label: '음성군' },
      { code: '114070', label: '제천시' },
      { code: '114080', label: '증평군' },
      { code: '114090', label: '진천군' },
      { code: '114100', label: '청원군' },
      { code: '114110', label: '청주시' },
      { code: '114120', label: '청주시 상당구' },
      { code: '114160', label: '청주시 서원구' },
      { code: '114150', label: '청주시 청원구' },
      { code: '114130', label: '청주시 흥덕구' },
      { code: '114140', label: '충주시' },
    ]
  },
  {
    code: '116000',
    label: '제주',
    fullName: '제주특별자치도',
    subs: [
      { code: '116030', label: '서귀포시' },
      { code: '116040', label: '제주시' },
    ]
  },
  {
    code: '117000',
    label: '전국',
    fullName: null,
    subs: []
  },
]

const BY_CODE = new Map(REGIONS.map(r => [r.code, r]))

export function findRegion(code: string | undefined): Region | undefined {
  return code ? BY_CODE.get(code) : undefined
}

/** 시/군/구 코드 목록 → 화면 표시용 라벨 목록 */
export function subLabels(regionCode: string | undefined, subCodes: string[]): string[] {
  const region = findRegion(regionCode)
  if (!region) return []
  return subCodes
    .map(c => region.subs.find(s => s.code === c)?.label)
    .filter((l): l is string => !!l)
}
