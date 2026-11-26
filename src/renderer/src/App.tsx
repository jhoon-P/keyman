import type { CollectionStatus } from '../../shared/collection';
import React, { useState, useEffect, useCallback, useRef } from "react";
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
const COLLECTION_NOTICE_DELAY_MS = 5_000;
const COLLECTION_NOTICE_DURATION_MS = 3_000;

type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; percent: number }
  | { phase: "ready" };

export default function App() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("km-theme") || "light");
  const [page, setPage] = useState("dashboard");
  const [dataRecentOnly, setDataRecentOnly] = useState(false);
  const navigate = (tab: string) => { setDataRecentOnly(false); setPage(tab); };
  const [stats, setStats] = useState({ total: 0, today: 0, verified: 0, unverified: 0, dupRemoved: 0 });
  const [recentRows, setRecentRows] = useState<any[]>([]);
  const [col, setCol] = useState<{ running: boolean; found: number; targetCount?: number; enriched?: number; enrichmentPending?: number; stopping?: boolean; status?: CollectionStatus; logs: any[] }>({
    running: false,
    found: 0,
    logs: []
  });
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<UpdateState>({ phase: "idle" });
  const [collectionNotice, setCollectionNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number>();
  const startPending = useRef(false);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // 테마 적용
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("km-theme", theme);
  }, [theme]);

  // 버전 로드
  useEffect(() => {
    window.api.app.version().then(setVersion).catch(() => undefined);
  }, []);

  // 업데이트 이벤트 구독
  useEffect(() => {
    const unsubIdle = window.api.updater.onIdle(() => setUpdate({ phase: "idle" }));
    const unsub1 = window.api.updater.onAvailable((info) =>
      setUpdate({ phase: "available", version: info.version })
    );
    const unsub2 = window.api.updater.onProgress((p) =>
      setUpdate({ phase: "downloading", percent: p.percent })
    );
    const unsub3 = window.api.updater.onReady(() =>
      setUpdate({ phase: "ready" })
    );
    return () => { unsubIdle(); unsub1(); unsub2(); unsub3(); };
  }, []);

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
      if (evt.type === 'started') {
        setCol({ running: true, found: 0, targetCount: evt.targetCount, logs: [
          { t: now(), tag: 'info', label: 'START', msg: `수집 시작 — ${evt.sourceIds.join(', ')}` }
        ] });
      } else if (evt.type === 'progress') {
        setCol((c) => ({ ...c, found: evt.current }));
      } else if (evt.type === 'status') {
        setCol(c => ({ ...c, status: evt.status }));
      } else if (evt.type === 'enrichment') {
        setCol(c => ({ ...c, enriched: evt.completed, enrichmentPending: evt.pending }));
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
          stopping: false,
          found: evt.count,
          logs: [...c.logs, { t: now(), tag: 'ok', label: 'DONE', msg: `${c.status?.stopReason === 'blocked' ? '접근 제한으로 수집 종료' : c.status?.stopReason === 'error' ? '일부 오류로 수집 종료' : c.status?.stopReason === 'stopped' ? '수집 중지' : '수집 완료'} — 총 ${evt.count}건` }].slice(-200)
        }));
        fetchDashboardData();
      }
    });
    return unsub;
  }, [fetchDashboardData]);

  const startCollection = useCallback(async (payload: any) => {
    if (startPending.current) return;
    startPending.current = true;
    const clickedAt = performance.now();
    window.clearTimeout(noticeTimer.current);
    setCollectionNotice(null);
    try {
      const res = await window.api.collect.start(payload);
      if (!res.ok && res.reason === 'policy-unavailable') {
        const delay = Math.max(0, COLLECTION_NOTICE_DELAY_MS - (performance.now() - clickedAt));
        noticeTimer.current = window.setTimeout(() => {
          setCollectionNotice(res.error);
          noticeTimer.current = window.setTimeout(() => setCollectionNotice(null), COLLECTION_NOTICE_DURATION_MS);
        }, delay);
        return;
      }
      if (!res.ok) throw new Error(res.error);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '수집을 시작하지 못했습니다.';
      setCol(c => ({
        ...c, logs: [...c.logs, { t: now(), tag: 'error', label: 'ERROR', msg }].slice(-200)
      }));
    } finally {
      startPending.current = false;
    }
  }, []);

  const stopCollection = useCallback(async () => {
    await window.api.collect.stop();
    setCol((c) => ({ ...c, stopping: true,
      logs: [...c.logs, { t: now(), tag: "warn", label: "STOP", msg: `중지 요청 — 실행 중인 작업을 정리하고 있습니다.` }] }));
  }, []);

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard go={navigate} stats={stats} recentRows={recentRows} />;
      case "collect": return <Collect col={col} onStart={startCollection} onStop={stopCollection}
        onViewRecent={() => { setDataRecentOnly(true); setPage('data'); }} />;
      case "data": return <DataScreen key={String(dataRecentOnly)} go={navigate} initialRecentOnly={dataRecentOnly} />;
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
              <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}>
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
            {update.phase !== "idle" && (
              <div className="update-banner" role="status">
                {update.phase === "available" && (
                  <div className="update-text">
                    <span className="update-dot" />
                    v{update.version} 자동 업데이트 중
                  </div>
                )}
                {update.phase === "downloading" && (
                  <div className="update-text">
                    <span className="update-dot blink" />
                    다운로드 중 {update.percent}%
                  </div>
                )}
                {update.phase === "ready" && (
                  <div className="update-text">
                    <span className="update-dot ok" />
                    업데이트를 위해 재시작합니다
                  </div>
                )}
              </div>
            )}
            {version && (
              <div className="sidebar-version">v{version}</div>
            )}
          </div>
        </aside>
        <main className="main">{renderPage()}</main>
      </div>
      {collectionNotice && <div className="collection-notice" role="status">{collectionNotice}</div>}
    </div>
  );
}
