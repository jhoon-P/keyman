/** 한국(Asia/Seoul, UTC+9 고정 — 한국은 DST 없음) 기준 'YYYY-MM-DD HH:mm:ss' 문자열.
 *  DB 저장 값이 화면·엑셀에 그대로 표시되므로 사람이 읽는 형식으로 통일한다.
 *  문자열 정렬 = 시간 정렬이 성립한다. */
export function nowKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
}
