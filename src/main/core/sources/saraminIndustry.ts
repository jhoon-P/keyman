/**
 * 사람인 직무 카테고리 코드 (cat_mcls = data-mcls_cd_no)
 * URL: /zf_user/jobs/list/domestic?cat_mcls={code}&search_done=y&loc_mcd={region}&page={n}
 * 실제 페이지 btn_job 버튼의 data-mcls_cd_no 속성에서 추출한 실측값
 */
export const SARAMIN_JOB_CAT: Record<string, string> = {
  'IT개발·데이터':    '2',
  '회계·세무·재무':   '3',
  '총무·법무·사무':   '4',
  '인사·노무·HRD':   '5',
  '의료':             '6',
  '운전·운송·배송':   '7',
  '영업·판매·무역':   '8',
  '연구·R&D':         '9',
  '서비스':           '10',
  '생산':             '11',
  '상품기획·MD':      '12',
  '미디어·문화·스포츠': '13',
  '마케팅·홍보·조사': '14',
  '디자인':           '15',
  '기획·전략':        '16',
  '금융·보험':        '17',
  '구매·자재·물류':   '18',
  '교육':             '19',
  '공공·복지':        '20',
  '고객상담·TM':      '21',
  '건설·건축':        '22',
}

export const SARAMIN_JOB_CAT_LABELS = Object.keys(SARAMIN_JOB_CAT)
