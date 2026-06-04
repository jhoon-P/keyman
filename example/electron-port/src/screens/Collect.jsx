/* 키맨 발굴 — 검색/수집 */
import React, { useState, useRef, useEffect } from "react";
import { Icon } from "../icons.jsx";
import { Btn, Card, Field, Select, Input, Badge } from "../ui.jsx";

export default function Collect({ col, onStart, onStop }) {
  const [site, setSite] = useState(true);
  const [industry, setIndustry] = useState("전체 업종");
  const [region, setRegion] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [maxCount, setMaxCount] = useState(100);
  const [reqInterval, setReqInterval] = useState(3000);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [col.logs.length]);

  const running = col.running;
  const pct = Math.min(100, Math.round((col.found / maxCount) * 100));

  return (
    <div className="fade-page" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="page-head">
        <div>
          <div className="ph-title">회사 연락처 수집</div>
          <div className="ph-desc">조건을 설정하고 키맨 연락처를 자동으로 수집합니다.</div>
        </div>
        <div className="ph-actions">
          {!running ? (
            <Btn variant="primary" icon="Play" onClick={() => onStart({ maxCount, interval: reqInterval })}>수집 시작</Btn>
          ) : (
            <Btn variant="danger" icon="Stop" onClick={onStop}>중지</Btn>
          )}
        </div>
      </div>

      <div className="page-scroll" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 수집 사이트 */}
        <Card title="수집 사이트" sub="연락처를 가져올 소스를 선택하세요">
          <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
            <div className={`site-chip ${site ? "on" : ""}`} onClick={() => setSite(!site)}>
              <span className="site-logo"><Icon name="Building" size={18} /></span>
              <div style={{ flex: 1 }}>
                <div className="site-name">사람인</div>
                <div className="site-meta">기업정보 · 채용공고</div>
              </div>
              <span className={`check-box ${site ? "on" : ""}`} style={{ width: 20, height: 20 }}>
                {site && <Icon name="Check" size={13} />}
              </span>
            </div>
            <div className="site-chip" style={{ opacity: 0.55 }}>
              <span className="site-logo" style={{ color: "var(--text-4)" }}>+</span>
              <div style={{ flex: 1 }}>
                <div className="site-name">소스 추가</div>
                <div className="site-meta">잡코리아 · 워크넷</div>
              </div>
              <Badge tone="neutral">준비중</Badge>
            </div>
          </div>
        </Card>

        {/* 검색 필터 */}
        <Card title="검색 필터">
          <div className="filter-grid" style={{ marginTop: 4 }}>
            <Field label="업종 필터" hint="수집 후 적용">
              <Select value={industry} onChange={setIndustry}
                options={["전체 업종", "IT·소프트웨어", "제조", "도소매", "건설", "물류·운송", "식음료", "헬스케어"]} />
            </Field>
            <Field label="지역 (시/도)">
              <Select value={region} onChange={setRegion}
                options={["전체", "서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산"]} />
            </Field>
            <Field label="키워드 (회사명)">
              <Input placeholder="회사명 일부 입력" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </Field>
            <Field label="최대 수집 건수">
              <Input type="number" value={maxCount} onChange={(e) => setMaxCount(+e.target.value || 0)} />
            </Field>
            <Field label="요청 간격" hint="밀리초">
              <Input type="number" value={reqInterval} onChange={(e) => setReqInterval(+e.target.value || 0)} />
            </Field>
            <Field label="중복 처리">
              <Select defaultValue="자동 병합" options={["자동 병합", "건너뛰기", "모두 유지"]} />
            </Field>
          </div>
        </Card>

        {/* 진행 + 로그 */}
        <Card pad={false} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 320, overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
            <div className="progress-wrap">
              <div className="progress-meta">
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className={`status-dot ${running ? "run" : "idle"}`} />
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    {running ? "수집 진행 중" : col.found > 0 ? "수집 완료" : "대기 중"}
                  </span>
                  {running && <span style={{ color: "var(--text-3)", fontSize: 12 }}>· {region}{region !== "전체" ? "" : " 전체"} · {industry}</span>}
                </span>
                <span style={{ color: "var(--text-2)", fontWeight: 600 }}>
                  <span style={{ color: "var(--accent)" }}>{col.found}</span>
                  <span style={{ color: "var(--text-4)" }}> / {maxCount}건</span>
                </span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: 8 }}>
            <div className="console" ref={logRef}>
              {col.logs.length === 0 ? (
                <div className="log-empty">› 수집을 시작하면 로그가 여기에 표시됩니다.</div>
              ) : (
                col.logs.map((l, i) => (
                  <div key={i} className="console-line">
                    <span className="log-time">{l.t}</span>
                    <span className={`log-tag ${l.tag}`}>{l.label}</span>
                    <span className="log-msg">{l.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
