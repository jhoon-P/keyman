/* 키맨 발굴 — KEY 대시보드 */
import React from "react";
import { Icon } from "../icons.jsx";
import { Btn, Card, Badge, avatarColor } from "../ui.jsx";
import { SAMPLE } from "../sample.js";

export default function Dashboard({ go, stats }) {
  const bars = [42, 58, 35, 70, 52, 88, 64, 95, 73, 110, 82, 128, 96, 142];
  const max = Math.max(...bars);
  const recent = SAMPLE.slice(0, 5);

  return (
    <div className="fade-page">
      <div className="page-head">
        <div>
          <div className="ph-title">개요</div>
          <div className="ph-desc">키맨 발굴 수집 현황을 한눈에 확인하세요.</div>
        </div>
        <div className="ph-actions">
          <Btn variant="ghost" size="sm" icon="Refresh">새로고침</Btn>
          <Btn variant="primary" size="sm" icon="Radar" onClick={() => go("collect")}>새 수집 시작</Btn>
        </div>
      </div>

      <div className="page-scroll">
        <div className="stat-grid">
          {[
            { ico: "Database", val: stats.total.toLocaleString(), label: "누적 수집 연락처", delta: "+12.4%", up: true },
            { ico: "Zap", val: stats.today, label: "오늘 수집", delta: "+38", up: true },
            { ico: "Target", val: "94.2%", label: "유효 연락처 비율", delta: "+2.1%", up: true },
            { ico: "Shield", val: stats.dupRemoved, label: "중복 제거", delta: "-6", up: false },
          ].map((s) => (
            <div key={s.label} className="card stat-card">
              <div className="stat-top">
                <span className="stat-ico"><Icon name={s.ico} size={17} /></span>
                <span className={`stat-delta ${s.up ? "up" : "down"}`}>
                  <Icon name={s.up ? "ArrowUp" : "ArrowDown"} size={13} />{s.delta}
                </span>
              </div>
              <div>
                <div className="stat-val">{s.val}</div>
                <div className="stat-label" style={{ marginTop: 6 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="dash-grid">
          <Card title="최근 14일 수집량" sub="일별 신규 연락처"
            action={<Badge tone="accent" dot>실시간</Badge>}>
            <div className="spark">
              {bars.map((b, i) => (
                <div key={i} className="bar" style={{ height: `${(b / max) * 100}%` }} title={`${b}건`} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12,
              fontSize: 11, color: "var(--text-4)", fontWeight: 500 }}>
              <span>2주 전</span><span>1주 전</span><span>오늘</span>
            </div>
          </Card>

          <Card title="업종 분포" sub="수집 연락처 기준">
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 2 }}>
              {[
                { k: "IT·소프트웨어", v: 32 }, { k: "제조", v: 26 },
                { k: "도소매", v: 18 }, { k: "물류·운송", v: 13 }, { k: "기타", v: 11 },
              ].map((d) => (
                <div key={d.k}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5,
                    marginBottom: 6, color: "var(--text-2)", fontWeight: 500, whiteSpace: "nowrap", gap: 10 }}>
                    <span>{d.k}</span><span style={{ color: "var(--text-3)" }}>{d.v}%</span>
                  </div>
                  <div className="progress-track" style={{ height: 6 }}>
                    <div style={{ width: `${d.v}%`, height: "100%", background: "var(--accent)",
                      borderRadius: 99, opacity: 0.4 + d.v / 60 }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 14 }}>
          <Card title="최근 활동" sub="방금 수집된 연락처"
            action={<Btn variant="ghost" size="sm" iconR="ChevronRight" onClick={() => go("data")}>전체 보기</Btn>}>
            <div style={{ marginTop: -4 }}>
              {recent.map((co) => (
                <div key={co.id} className="activity-row">
                  <span className="cell-avatar" style={{ background: avatarColor(co.name), width: 32, height: 32 }}>
                    {co.name[0]}
                  </span>
                  <div className="act-main">
                    <div className="act-title">{co.name}</div>
                    <div className="act-meta">{co.person} {co.role} · {co.region} · {co.industry}</div>
                  </div>
                  {co.verified && <Badge tone="accent" dot>검증됨</Badge>}
                  <span className="act-time">{co.collectedAt}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
