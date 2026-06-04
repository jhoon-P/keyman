/* 키맨 발굴 — 내보내기 */
import React, { useState } from "react";
import { Icon } from "../icons.jsx";
import { Btn, Card, Badge } from "../ui.jsx";

export default function ExportScreen({ total }) {
  const [fmt, setFmt] = useState("excel");
  const [fields, setFields] = useState(["회사명", "담당자", "직책", "대표전화", "휴대전화", "이메일"]);
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [prog, setProg] = useState(0);

  const ALL_FIELDS = ["회사명", "담당자", "직책", "대표전화", "휴대전화", "이메일", "업종", "지역", "임직원수", "웹사이트", "수집일시"];

  const toggleField = (f) =>
    setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const run = () => {
    setPhase("running"); setProg(0);
    const id = setInterval(() => {
      setProg((p) => {
        if (p >= 100) { clearInterval(id); setPhase("done"); return 100; }
        return Math.min(100, p + 8 + Math.random() * 14);
      });
    }, 130);
  };

  const FORMATS = [
    { id: "excel", name: "Excel", desc: ".xlsx · 서식 포함", ico: "Sheet", color: "#16a34a" },
    { id: "csv", name: "CSV", desc: ".csv · 범용 텍스트", ico: "FileText", color: "#2563eb" },
    { id: "sheets", name: "Google Sheets", desc: "클라우드 연동", ico: "Cloud", color: "#ea580c" },
  ];

  return (
    <div className="fade-page">
      <div className="page-head">
        <div>
          <div className="ph-title">내보내기</div>
          <div className="ph-desc">수집한 연락처를 원하는 형식으로 저장하세요.</div>
        </div>
        <div className="ph-actions">
          <Badge tone="neutral">{total.toLocaleString()}건 대상</Badge>
        </div>
      </div>

      <div className="page-scroll" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>1 · 파일 형식</div>
          <div className="export-grid">
            {FORMATS.map((f) => (
              <div key={f.id} className={`card fmt-card ${fmt === f.id ? "on" : ""}`} onClick={() => setFmt(f.id)}>
                <span className="fmt-check"><Icon name="CheckCircle" size={20} /></span>
                <span className="fmt-ico" style={{ background: `color-mix(in srgb, ${f.color} 14%, transparent)`, color: f.color }}>
                  <Icon name={f.ico} size={22} />
                </span>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 650 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Card title="2 · 포함할 필드" sub={`${fields.length}개 선택됨`}
          action={<Btn variant="ghost" size="sm" onClick={() => setFields(ALL_FIELDS)}>전체 선택</Btn>}>
          <div className="field-pills" style={{ marginTop: 4 }}>
            {ALL_FIELDS.map((f) => (
              <button key={f} className={`field-pill ${fields.includes(f) ? "on" : ""}`} onClick={() => toggleField(f)}>
                <span className={`check-box ${fields.includes(f) ? "on" : ""}`} style={{ width: 16, height: 16, borderRadius: 5 }}>
                  {fields.includes(f) && <Icon name="Check" size={11} />}
                </span>
                {f}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 650 }}>
                {phase === "done" ? "내보내기 완료" : phase === "running" ? "파일 생성 중…" : "내보내기 준비 완료"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3 }}>
                {phase === "done"
                  ? `keyman_contacts_${new Date().toISOString().slice(0, 10)}.${fmt === "csv" ? "csv" : "xlsx"} 생성됨`
                  : `${FORMATS.find((f) => f.id === fmt).name} · ${total.toLocaleString()}건 · ${fields.length}개 필드`}
              </div>
              {phase !== "idle" && (
                <div className="progress-track" style={{ marginTop: 12, maxWidth: 420 }}>
                  <div className="progress-fill" style={{ width: `${prog}%` }} />
                </div>
              )}
            </div>
            {phase === "done" ? (
              <Btn variant="primary" icon="Download" onClick={() => { setPhase("idle"); setProg(0); }}>다운로드</Btn>
            ) : (
              <Btn variant="primary" icon="Export" onClick={run} disabled={phase === "running" || fields.length === 0}>
                {phase === "running" ? "생성 중…" : "내보내기"}
              </Btn>
            )}
          </div>
        </Card>

        <Card title="최근 내보내기" pad={false}>
          <div style={{ padding: "4px 22px 16px" }}>
            {[
              { name: "keyman_contacts_2026-06-01.xlsx", n: 1240, t: "어제 18:24", ico: "Sheet", c: "#16a34a" },
              { name: "it_seoul_keyman.csv", n: 318, t: "2일 전 11:02", ico: "FileText", c: "#2563eb" },
              { name: "manufacturing_q2.xlsx", n: 902, t: "5월 28일", ico: "Sheet", c: "#16a34a" },
            ].map((h) => (
              <div key={h.name} className="activity-row">
                <span className="act-ico" style={{ color: h.c }}><Icon name={h.ico} size={16} /></span>
                <div className="act-main">
                  <div className="act-title">{h.name}</div>
                  <div className="act-meta">{h.n.toLocaleString()}건 · {h.t}</div>
                </div>
                <Btn variant="ghost" size="sm" icon="Download" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
