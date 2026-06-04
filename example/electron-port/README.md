# 키맨 발굴 — Electron 포팅 패키지

미니멀 리디자인을 **Vite + React** 렌더러로 정리한 버전입니다.
적용된 설정: **사이드바 네비 · 편안한 밀도 · 모서리 10px · 액센트 `#0d9488` · 라이트 기본**.

## 바로 실행
```bash
cd electron-port
npm install
npm run electron:dev      # vite dev 서버 + electron 동시 실행
# 또는 브라우저에서만 확인
npm run dev
```
프로덕션 빌드:
```bash
npm run build             # dist/ 생성
npm run electron:build    # electron-builder 패키징
```

## 폴더 구조
```
electron-port/
├─ index.html              # Vite 엔트리 (Pretendard CDN 로드)
├─ vite.config.js          # base: "./" (Electron file:// 대응)
├─ package.json
├─ electron/
│  ├─ main.cjs             # 메인 프로세스 (frame:false 커스텀 타이틀바)
│  └─ preload.cjs          # window.winControls (최소화/최대화/닫기)
└─ src/
   ├─ main.jsx             # ReactDOM 렌더 엔트리
   ├─ App.jsx              # 셸: 사이드바·라우팅·테마·수집 상태
   ├─ styles.css           # 전체 디자인 토큰 + 컴포넌트 (라이트/다크)
   ├─ icons.jsx            # 인라인 SVG 아이콘 세트
   ├─ ui.jsx               # 공통 컴포넌트 (Btn, Card, Field, Badge…)
   ├─ sample.js            # 데모 데이터 (실데이터로 교체)
   └─ screens/             # Dashboard / Collect / DataScreen / ExportScreen / Settings
```

## 기존 Electron 앱에 붙이는 경우
- `src/` 전체를 렌더러 소스로 복사하고 `main.jsx`를 엔트리로 지정하세요.
- React 18 + `@vitejs/plugin-react`(또는 동등한 JSX 빌드)만 있으면 됩니다.

## 실제 데이터 연결 포인트
1. **수집 이벤트** — `App.jsx`의 `startCollection`은 데모용 타이머입니다.
   실제로는 메인 프로세스에서 IPC로 진행 상황을 받아 `setCol({running, found, logs})`만 갱신하면 됩니다.
   ```js
   // preload.cjs 에 추가
   onCollectLog: (cb) => ipcRenderer.on("collect:log", (_e, line) => cb(line)),
   // App.jsx
   useEffect(() => window.api.onCollectLog((line) =>
     setCol(c => ({...c, found: line.found, logs: [...c.logs, line].slice(-200)}))), []);
   ```
2. **데이터 테이블** — `sample.js`의 `SAMPLE` 대신 DB/파일에서 읽은 배열을 `App.jsx`의 `rows`로 전달.
3. **내보내기** — `ExportScreen.run()`을 실제 xlsx/csv 생성 IPC 호출로 교체.

## 디자인 토큰 조정 (styles.css 상단 `:root`)
```css
--accent: #0d9488;   /* 액센트 색 */
--r: 10px;           /* 모서리 둥글기 */
--u: 1;              /* 밀도 (컴팩트는 0.74) */
```
라이트/다크 팔레트는 `[data-theme="light"]` / `[data-theme="dark"]` 블록에서 관리합니다.
다크 모드가 필요 없으면 `App.jsx`의 테마 토글 버튼만 제거하면 됩니다 (CSS는 그대로 둬도 무방).

## 폰트 오프라인 패키징
CDN 대신 번들에 포함하려면:
```bash
npm i pretendard
```
```js
// main.jsx
import "pretendard/dist/web/variable/pretendardvariable.css";
```
후 `index.html`의 `<link>` 제거.
