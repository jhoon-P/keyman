/**
 * 소스별 지역 코드 매핑.
 * 사람인 코드표 자체는 src/shared/regions.ts(실측값)가 단일 출처이고,
 * 여기서는 '시/도 이름 → loc_mcd' 폴백 매핑만 파생한다.
 */
import { REGIONS } from '../../../shared/regions'

/**
 * 시/도 이름 → 사람인 loc_mcd.
 * filters.region_code가 비어 있을 때만 쓰는 폴백이다(UI는 코드를 직접 보낸다).
 */
export const SARAMIN_REGION_MAP: Record<string, string> = {
  // 표시명('서울')과 행정 정식명('서울특별시')을 모두 키로 받는다
  ...Object.fromEntries(REGIONS.flatMap(r =>
    r.fullName ? [[r.label, r.code], [r.fullName, r.code]] : [[r.label, r.code]]
  )),
  // 개편 전 명칭 등 별칭
  '강원도': '109000',
  '전라북도': '113000',
  // 사람인은 광주광역시를 전남(112000)과 한 묶음으로 다룬다.
  // (지역 필터 패널에 광주 단독 코드는 존재하지 않음 — 자치구는 112230~112270)
  '광주광역시': '112000',
  '전라남도': '112000',
  '전남': '112000'
}

/** 잡코리아 지역 코드 (사용 예정) */
export const JOBKOREA_REGION_MAP: Record<string, string> = {
  '서울특별시': 'Seoul',
  '경기도': 'Gyeonggi',
  '부산광역시': 'Busan',
  '인천광역시': 'Incheon',
  '대구광역시': 'Daegu',
  '광주광역시': 'Gwangju',
  '대전광역시': 'Daejeon',
  '울산광역시': 'Ulsan'
}
