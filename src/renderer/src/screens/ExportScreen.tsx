import React, { useState } from "react";
import { Icon } from "../components/icons";
import { Btn, Card, Badge } from "../components/ui";

export default function ExportScreen({ total }: { total: number }) {
  const ALL_FIELDS = ["회사명", "대표번호", "전화상태", "주소", "시/도", "시군구", "업종", "근로자수", "조직도(부서)", "홈페이지", "채용공고링크", "수집시각", "연락여부"];

  const [fmt, setFmt] = useState("excel");
  const [fields, setFields] = useState<string[]>(ALL_FIELDS);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [prog, setProg] = useState(0);

  const toggleField = (f: string) =>
    setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const run = async () => {
    setPhase("running");
    setProg(30);
    try {
      let result;
      if (fmt === 'csv') {
        result = await window.api.export.csv({ fields });
      } else {
        result = await window.api.export.xlsx({ fields });
      }

      if (result.ok) {
        setProg(100);
        setPhase("done");
      } else {
        setPhase("idle");
        if (!result.cancelled) alert(`오류 발생: ${result.error}`);
      }
    } catch (err) {
      alert(`내보내기 실패: ${err}`);
      setPhase("idle");
    }
  };

  const FORMATS = [
    { id: "excel", name: "Excel", desc: ".xlsx · 서식 포함", ico: "Sheet" as const, color: "#16a34a" },
    { id: "csv", name: "CSV", desc: ".csv · 범용 텍스트", ico: "FileText" as const, color: "#2563eb" },
    { id: "sheets", name: "Google Sheets", desc: "클라우드 연동", ico: "Cloud" as const, color: "#ea580c" },
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
                <span className={`check-box ${fields.includes(f) ? "on" : ""}`} style={{ width: 16, height: 16, borderRadius: 5, border: '1.5px solid var(--border-strong)', display: 'grid', placeItems: 'center' }}>
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
                  ? `저장 완료`
                  : `${FORMATS.find((f) => f.id === fmt)?.name} · ${total.toLocaleString()}건 · ${fields.length}개 필드`}
              </div>
              {phase !== "idle" && (
                <div className="progress-track" style={{ marginTop: 12, maxWidth: 420 }}>
                  <div className="progress-fill" style={{ width: `${prog}%` }} />
                </div>
              )}
            </div>
            {phase === "done" ? (
              <Btn variant="primary" icon="Download" onClick={() => { setPhase("idle"); setProg(0); }}>다시 내보내기</Btn>
            ) : (
              <Btn variant="primary" icon="Export" onClick={run} disabled={phase === "running" || fields.length === 0 || fmt === 'sheets'}>
                {phase === "running" ? "생성 중…" : "내보내기"}
              </Btn>
            )}
          </div>
        </Card>

        <Card title="최근 내보내기" pad={false}>
          <div style={{ padding: "4px 22px 16px" }}>
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-4)' }}>최근 내보내기 기록이 없습니다.</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
