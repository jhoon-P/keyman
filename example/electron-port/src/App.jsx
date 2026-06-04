/* 키맨 발굴 — 앱 셸
   설정: 사이드바 네비 · 편안한 밀도 · 모서리 10px · 액센트 #0d9488 · 라이트 기본
   (밀도/모서리/액센트는 styles.css의 :root 토큰에서 조정) */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "./icons.jsx";
import { BrandMark, Wordmark } from "./ui.jsx";
import { SAMPLE, makeCompany } from "./sample.js";
import Dashboard from "./screens/Dashboard.jsx";
import Collect from "./screens/Collect.jsx";
import DataScreen from "./screens/DataScreen.jsx";
import ExportScreen from "./screens/ExportScreen.jsx";
import Settings from "./screens/Settings.jsx";

const NAV = [
  { id: "dashboard", label: "개요", icon: "Grid" },
  { id: "collect", label: "검색 / 수집", icon: "Radar" },
  { id: "data", label: "데이터", icon: "Database" },
  { id: "export", label: "내보내기", icon: "Export" },
  { id: "settings", label: "설정", icon: "Settings" },
];

/* 로그 메시지 생성기 (데모용 — 포팅 시 실제 수집 이벤트로 교체) */
const REGIONS_L = ["서울 강남", "경기 성남", "서울 마포", "인천 연수", "부산 해운대", "서울 영등포", "경기 화성"];
const RANDOM = (a) => a[Math.floor(Math.random() * a.length)];
const now = () => new Date().toTimeString().slice(0, 8);

function makeLog(found) {
  const r = Math.random();
  const co = makeCompany(found * 13 + 3).name;
  if (r < 0.62) return { tag: "found", label: "FOUND", msg: `[${found}] ${co} · 담당자·연락처 추출 완료` };
  if (r < 0.78) return { tag: "info", label: "REQ", msg: `${RANDOM(REGIONS_L)} 지역 기업 목록 페이지 요청…` };
  if (r < 0.9) return { tag: "ok", label: "OK", msg: `상세 페이지 파싱 성공 (${(120 + Math.random() * 380) | 0}ms)` };
  return { tag: "warn", label: "RETRY", msg: `응답 지연 — 2초 후 재시도` };
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("km-theme") || "light");
  const [page, setPage] = useState("collect");
  const [rows] = useState(SAMPLE);
  const [col, setCol] = useState({ running: false, found: 0, logs: [] });
  const timer = useRef(null);
  const cfg = useRef({ maxCount: 100 });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("km-theme", theme);
  }, [theme]);

  /* 수집 시뮬레이션 — 실제 앱에서는 메인 프로세스(IPC)에서 받은 이벤트로 setCol 호출 */
  const startCollection = useCallback((opts) => {
    cfg.current = opts;
    setCol({ running: true, found: 0, logs: [
      { t: now(), tag: "info", label: "START", msg: `수집 시작 — 사람인 · 최대 ${opts.maxCount}건` },
    ] });
    clearInterval(timer.current);
    let found = 0;
    timer.current = setInterval(() => {
      setCol((c) => {
        if (!c.running) return c;
        const log = makeLog(found + 1);
        const inc = log.tag === "found";
        if (inc) found = c.found + 1;
        const nf = inc ? c.found + 1 : c.found;
        const logs = [...c.logs, { t: now(), ...log }].slice(-200);
        if (nf >= cfg.current.maxCount) {
          clearInterval(timer.current);
          return { running: false, found: cfg.current.maxCount,
            logs: [...logs, { t: now(), tag: "ok", label: "DONE", msg: `수집 완료 — 총 ${cfg.current.maxCount}건 (중복 ${(cfg.current.maxCount * 0.06) | 0}건 제거)` }] };
        }
        return { ...c, found: nf, logs };
      });
    }, 280);
  }, []);

  const stopCollection = useCallback(() => {
    clearInterval(timer.current);
    setCol((c) => ({ ...c, running: false,
      logs: [...c.logs, { t: now(), tag: "warn", label: "STOP", msg: `사용자에 의해 중지됨 — ${c.found}건 저장` }] }));
  }, []);

  useEffect(() => () => clearInterval(timer.current), []);

  const stats = { total: 12480 + col.found, today: 156 + col.found, dupRemoved: 312 };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard go={setPage} stats={stats} />;
      case "collect": return <Collect col={col} onStart={startCollection} onStop={stopCollection} />;
      case "data": return <DataScreen rows={rows} />;
      case "export": return <ExportScreen total={stats.total} />;
      case "settings": return <Settings theme={theme} setTheme={setTheme} />;
      default: return null;
    }
  };

  return (
    <div className="app-frame">
      {/* 타이틀바 — 드래그 영역. 버튼은 no-drag */}
      <div className="titlebar" style={{ WebkitAppRegion: "drag" }}>
        <div className="tb-brand">
          <span className="tb-title">키맨 발굴</span>
          <span className="tb-divider" />
          <span className="tb-sub">{NAV.find((n) => n.id === page)?.label}</span>
        </div>
        <div className="tb-spacer" />
        {col.running && (
          <span className="badge badge-accent" style={{ marginRight: 6 }}>
            <span className="status-dot run" /> 수집 중 {col.found}건
          </span>
        )}
        <div className="win-controls" style={{ WebkitAppRegion: "no-drag" }}>
          <button className="win-btn" onClick={() => window.winControls?.minimize()}><Icon name="Minimize" size={16} /></button>
          <button className="win-btn" onClick={() => window.winControls?.maximize()}><Icon name="Maximize" size={13} /></button>
          <button className="win-btn close" onClick={() => window.winControls?.close()}><Icon name="Close" size={16} /></button>
        </div>
      </div>

      <div className="app-body">
        <aside className="sidebar">
          <div className="brand-block">
            <BrandMark size={32} />
            <Wordmark />
          </div>
          <div className="nav-label">워크스페이스</div>
          <div className="nav-group">
            {NAV.map((n) => (
              <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
                <span className="ni-icon"><Icon name={n.icon} size={17} /></span>
                {n.label}
                {n.id === "data" && <span className="ni-badge">{rows.length}</span>}
                {n.id === "collect" && col.running && <span className="ni-badge" style={{ color: "var(--accent)" }}>●</span>}
              </button>
            ))}
          </div>
          <div className="sidebar-foot">
            <div className="status-pill">
              <span className={`status-dot ${col.running ? "run" : "idle"}`} />
              {col.running ? `수집 중 · ${col.found}건` : "유휴 상태"}
            </div>
            <div className="theme-toggle">
              <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>
                <Icon name="Sun" size={15} /> 라이트
              </button>
              <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>
                <Icon name="Moon" size={15} /> 다크
              </button>
            </div>
          </div>
        </aside>
        <main className="main">{renderPage()}</main>
      </div>
    </div>
  );
}
