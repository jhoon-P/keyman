import React, { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "./components/icons";
import { BrandMark, Wordmark } from "./components/ui";
import Dashboard from "./screens/Dashboard";
import Collect from "./screens/Collect";
import DataScreen from "./screens/DataScreen";
import ExportScreen from "./screens/ExportScreen";
const NAV = [
  { id: "dashboard", label: "개요", icon: "Grid" as const },
  { id: "collect", label: "검색 / 수집", icon: "Radar" as const },
  { id: "data", label: "데이터", icon: "Database" as const },
  { id: "export", label: "내보내기", icon: "Export" as const },
];

const now = () => new Date().toTimeString().slice(0, 8);

export default function App() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("km-theme") || "light");
  const [page, setPage] = useState("dashboard");
  const [stats, setStats] = useState({ total: 0, today: 0, verified: 0, unverified: 0, dupRemoved: 0 });
  const [recentRows, setRecentRows] = useState<any[]>([]);
  const [col, setCol] = useState<{ running: boolean; found: number; logs: any[] }>({
    running: false,
    found: 0,
    logs: []
  });

  // 테마 적용
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("km-theme", theme);
  }, [theme]);

  // 통계 및 최근 데이터 초기 로드
  const fetchDashboardData = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        window.api.data.stats(),
        window.api.data.query({ limit: 5 })
      ]);
      setStats((prev) => ({
        ...prev,
        ...s,
        dupRemoved: s.dupRemoved ?? prev.dupRemoved ?? 0
      }));
      setRecentRows(r.rows);
    } catch (err) {
      console.error("Dashboard data fetch error", err);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData, page]);

  // 수집 이벤트 리스너
  useEffect(() => {
    const unsub = window.api.collect.onEvent((evt) => {
      if (evt.type === 'progress') {
        setCol((c) => ({ ...c, found: evt.current }));
      } else if (evt.type === 'log') {
        const tagMap = { INFO: 'info', WARN: 'warn', ERROR: 'warn' };
        setCol((c) => ({
          ...c,
          logs: [...c.logs, { t: now(), tag: tagMap[evt.level] || 'info', label: evt.level, msg: evt.message }].slice(-200)
        }));
      } else if (evt.type === 'done') {
        setCol((c) => ({
          ...c,
          running: false,
          found: evt.count,
          logs: [...c.logs, { t: now(), tag: 'ok', label: 'DONE', msg: `수집 완료 — 총 ${evt.count}건` }].slice(-200)
        }));
        fetchDashboardData();
      }
    });
    return unsub;
  }, [fetchDashboardData]);

  const startCollection = useCallback(async (payload: any) => {
    setCol({ running: true, found: 0, logs: [
      { t: now(), tag: "info", label: "START", msg: `수집 시작 — ${payload.sourceIds.join(', ')}` },
    ] });
    const res = await window.api.collect.start(payload);
    if (!res.ok) {
      setCol((c) => ({
        ...c,
        running: false,
        logs: [...c.logs, { t: now(), tag: 'warn', label: 'ERROR', msg: res.error }]
      }));
    }
  }, []);

  const stopCollection = useCallback(async () => {
    await window.api.collect.stop();
    setCol((c) => ({ ...c, running: false,
      logs: [...c.logs, { t: now(), tag: "warn", label: "STOP", msg: `사용자에 의해 중지됨` }] }));
  }, []);

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard go={setPage} stats={stats} recentRows={recentRows} />;
      case "collect": return <Collect col={col} onStart={startCollection} onStop={stopCollection} />;
      case "data": return <DataScreen go={setPage} />;
      case "export": return <ExportScreen total={stats.total} />;
      default: return null;
    }
  };

  return (
    <div className="app-frame">
      <div className="titlebar">
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
        <div className="win-controls">
          <button className="win-btn" onClick={() => window.api.win.minimize()}><Icon name="Minimize" size={16} /></button>
          <button className="win-btn" onClick={() => window.api.win.maximize()}><Icon name="Maximize" size={13} /></button>
          <button className="win-btn close" onClick={() => window.api.win.close()}><Icon name="Close" size={16} /></button>
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
                {n.id === "data" && <span className="ni-badge">{stats.total}</span>}
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
