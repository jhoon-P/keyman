const { _electron: electron } = require('playwright')
const path = require('path')
const fs = require('fs')
const PDFDocument = require('pdfkit')

const OUT_DIR  = path.join(__dirname, '../manual-screenshots')
const PDF_PATH = path.join(__dirname, '../키맨발굴_사용자메뉴얼.pdf')
const FONT_R   = 'C:\\Windows\\Fonts\\malgun.ttf'
const FONT_B   = 'C:\\Windows\\Fonts\\malgunbd.ttf'

async function capture(win, name) {
  const p = path.join(OUT_DIR, `${name}.png`)
  await win.screenshot({ path: p })
  console.log(`  ✓ ${name}.png`)
  return p
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  console.log('▸ 앱 실행...')
  const app = await electron.launch({
    executablePath: path.join(__dirname, '../dist/win-unpacked/key.exe'),
    args: [], env
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(3000)
  await win.setViewportSize({ width: 1280, height: 800 })

  const shots = []

  // ── STEP 1: 수집 탭 이동 ─────────────────────────────
  console.log('▸ 수집 탭...')
  await win.locator('.nav-item').filter({ hasText: '검색' }).first().click()
  await win.waitForTimeout(700)
  shots.push({ file: await capture(win, '01_collect_base'), title: 'STEP 1  ·  검색 / 수집 탭 열기', desc: '왼쪽 사이드바에서 [검색 / 수집] 탭을 선택합니다.' })

  // ── STEP 2: 업종 드롭다운 열기 ──────────────────────
  console.log('▸ 업종 드롭다운...')
  await win.locator('.filter-grid .custom-select, .filter-grid select').first().click()
  await win.waitForTimeout(400)
  shots.push({ file: await capture(win, '02_industry_open'), title: 'STEP 2  ·  업종 필터 선택', desc: '업종 드롭다운을 클릭해 원하는 업종을 고릅니다. "전체 업종"을 선택하면 모든 업종을 수집합니다.' })
  await win.keyboard.press('Escape')
  await win.waitForTimeout(300)

  // ── STEP 3: 지역 드롭다운 열기 ──────────────────────
  console.log('▸ 지역 드롭다운...')
  const selects = win.locator('.filter-grid .custom-select, .filter-grid select')
  await selects.nth(1).click()
  await win.waitForTimeout(400)
  shots.push({ file: await capture(win, '03_region_open'), title: 'STEP 3  ·  지역 필터 선택', desc: '지역 드롭다운에서 원하는 시/도를 선택합니다. "전체"는 전국을 대상으로 수집합니다.' })
  await win.keyboard.press('Escape')
  await win.waitForTimeout(300)

  // ── STEP 4: 건수 입력 강조 ──────────────────────────
  console.log('▸ 필터 설정 완료 화면...')
  // 최대 수집 건수 필드에 포커스
  const countInput = win.locator('input[type="number"]').first()
  await countInput.click()
  await win.waitForTimeout(300)
  shots.push({ file: await capture(win, '04_filters_ready'), title: 'STEP 4  ·  수집 건수 설정 후 [수집 시작]', desc: '최대 수집 건수를 입력하고, 설정이 완료되면 우측 상단 [수집 시작] 버튼을 클릭합니다.' })

  // ── STEP 5: 수집 진행 중 시뮬레이션 ────────────────
  // 실제 수집 없이 — 수집 탭의 진행 콘솔 영역이 보이는 기본 상태
  await win.keyboard.press('Escape')
  shots.push({ file: await capture(win, '05_collect_ready'), title: 'STEP 5  ·  수집 진행 & 로그 확인', desc: '수집이 시작되면 하단 콘솔에 실시간 로그가 표시되고, 사이드바 상단에 진행 건수가 나타납니다.' })

  // ── STEP 6: 데이터 탭 ───────────────────────────────
  console.log('▸ 데이터 탭...')
  await win.locator('.nav-item').filter({ hasText: '데이터' }).first().click()
  await win.waitForTimeout(700)
  shots.push({ file: await capture(win, '06_data_list'), title: 'STEP 6  ·  데이터 탭 — 수집 결과 목록', desc: '수집이 완료되면 [데이터] 탭에서 전체 목록을 확인할 수 있습니다. 검색창과 지역 필터로 원하는 항목을 찾을 수 있습니다.' })

  // ── STEP 7: 데이터 행 클릭 (데이터 있으면 클릭, 없으면 empty 상태) ──
  console.log('▸ 데이터 상세...')
  const firstRow = win.locator('tbody tr').first()
  const rowCount = await firstRow.count()
  if (rowCount > 0) {
    await firstRow.click()
    await win.waitForTimeout(500)
  }
  shots.push({ file: await capture(win, '07_data_detail'), title: 'STEP 7  ·  데이터 클릭 → 상세 정보 확인', desc: '목록에서 행을 클릭하면 오른쪽 패널에 담당자·연락처·기업 정보 상세가 표시됩니다.' })

  // ── STEP 8: 내보내기 탭 ─────────────────────────────
  console.log('▸ 내보내기 탭...')
  await win.locator('.nav-item').filter({ hasText: '내보내기' }).first().click()
  await win.waitForTimeout(700)
  shots.push({ file: await capture(win, '08_export'), title: 'STEP 8  ·  내보내기 — Excel / CSV로 저장', desc: '파일 형식(Excel 권장)과 포함할 필드를 선택한 뒤 [내보내기] 버튼을 클릭하면 파일 저장 창이 열립니다.' })

  // ── 다크 모드 보너스 ────────────────────────────────
  console.log('▸ 다크 모드...')
  await win.locator('.theme-toggle button').last().click()
  await win.waitForTimeout(500)
  await win.locator('.nav-item').filter({ hasText: '개요' }).first().click()
  await win.waitForTimeout(600)
  const darkFile = await capture(win, '09_dark')

  await app.close()
  console.log('▸ 앱 종료\n▸ PDF 생성 중...')

  // ════════════════════════════════════════════════════
  //  PDF 조립
  // ════════════════════════════════════════════════════
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false })
  doc.registerFont('R', FONT_R)
  doc.registerFont('B', FONT_B)
  doc.pipe(fs.createWriteStream(PDF_PATH))

  const PW = 595.28, PH = 841.89, M = 36, CW = PW - M * 2

  // ── 표지 ─────────────────────────────────────────────
  doc.addPage()
  doc.rect(0, 0, PW, PH).fill('#0f172a')
  doc.circle(PW / 2, 310, 115).fill('#1e3a5f')
  doc.circle(PW / 2, 310, 82).fill('#1d4ed8')
  doc.fillColor('#ffffff').fontSize(11).font('R')
    .text('KEYMAN FINDER', 0, 258, { align: 'center', characterSpacing: 4 })
  doc.fontSize(30).font('B')
    .text('사용자 메뉴얼', 0, 296, { align: 'center' })
  doc.fontSize(11).font('R').fillColor('#94a3b8')
    .text('v0.2.0  ·  키맨 발굴 회사 연락처 수집 프로그램', 0, 342, { align: 'center' })
  doc.fontSize(9).fillColor('#475569')
    .text('© 2026 키맨 발굴', 0, PH - 50, { align: 'center' })

  // ── 목차 ─────────────────────────────────────────────
  doc.addPage()
  doc.rect(0, 0, PW, 64).fill('#f8fafc')
  doc.fillColor('#0f172a').fontSize(20).font('B').text('사용 방법', M, 20)
  doc.moveTo(M, 56).lineTo(PW - M, 56).stroke('#e2e8f0')

  const toc = [
    'STEP 1  ·  검색 / 수집 탭 열기',
    'STEP 2  ·  업종 필터 선택',
    'STEP 3  ·  지역 필터 선택',
    'STEP 4  ·  수집 건수 설정 후 [수집 시작]',
    'STEP 5  ·  수집 진행 & 로그 확인',
    'STEP 6  ·  데이터 탭 — 수집 결과 목록',
    'STEP 7  ·  데이터 클릭 → 상세 정보 확인',
    'STEP 8  ·  내보내기 — Excel / CSV로 저장',
  ]
  let ty = 76
  toc.forEach((t, i) => {
    const pg = String(i + 3).padStart(2, '0')
    doc.fillColor('#1e293b').fontSize(12).font('R').text(t, M, ty)
    doc.fillColor('#94a3b8').fontSize(12).text(pg, 0, ty, { align: 'right', width: PW - M })
    doc.moveTo(M, ty + 18).lineTo(PW - M, ty + 18).dash(2, { space: 3 }).stroke('#e2e8f0').undash()
    ty += 30
  })

  // ── 단계별 페이지 ────────────────────────────────────
  shots.forEach(({ file, title, desc }, i) => {
    doc.addPage()

    // 상단 헤더
    doc.rect(0, 0, PW, 60).fill('#0f172a')
    doc.fillColor('#7dd3fc').fontSize(10).font('R').text(title.split('·')[0].trim(), M, 13)
    doc.fillColor('#ffffff').fontSize(15).font('B').text(title.split('·').slice(1).join('·').trim(), M, 29)
    doc.fillColor('#475569').fontSize(9).font('R').text(String(i + 3), 0, 25, { align: 'right', width: PW - M })

    // 설명 바
    doc.rect(0, 60, PW, 34).fill('#f1f5f9')
    doc.fillColor('#334155').fontSize(10).font('R').text(desc, M, 71, { width: CW })

    // 스크린샷
    const imgY = 98
    doc.image(file, M, imgY, { fit: [CW, PH - imgY - M], align: 'center', valign: 'top' })
  })

  // ── 다크 모드 페이지 ─────────────────────────────────
  doc.addPage()
  doc.rect(0, 0, PW, 60).fill('#0f172a')
  doc.fillColor('#7dd3fc').fontSize(10).font('R').text('부록', M, 13)
  doc.fillColor('#ffffff').fontSize(15).font('B').text('다크 모드', M, 29)
  doc.rect(0, 60, PW, 34).fill('#1e293b')
  doc.fillColor('#94a3b8').fontSize(10).font('R')
    .text('사이드바 하단 라이트/다크 버튼으로 언제든지 테마를 전환할 수 있습니다.', M, 71, { width: CW })
  doc.image(darkFile, M, 98, { fit: [CW, PH - 98 - M], align: 'center', valign: 'top' })

  doc.end()
  console.log(`\n✅ PDF 완료: ${PDF_PATH}`)
}

run().catch(err => { console.error('오류:', err.message); process.exit(1) })
