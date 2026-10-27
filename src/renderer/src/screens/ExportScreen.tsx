import React, { useState, useEffect } from "react";
import type { ExportScope, ExportSummary } from "../../../shared/export";
import { Icon } from "../components/icons";
import { Btn, Card, Badge } from "../components/ui";

export default function ExportScreen({ total }: { total: number }) {
  const ALL_FIELDS = ["회사명", "대표번호", "전화상태", "주소", "시/도", "시군구", "업종", "근로자수", "조직도(부서)", "홈페이지", "채용공고링크", "수집시각", "연락여부"];

  const [fmt, setFmt] = useState("excel");
  const [fields, setFields] = useState<string[]>(ALL_FIELDS);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [prog, setProg] = useState(0);
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [saved, setSaved] = useState<{ count: number; filePath: string } | null>(null);
  const refresh = async () => {
    try { setSummary(await window.api.export.summary()); setSummaryError(''); }
    catch { setSummaryError('내보내기 이력을 불러오지 못했습니다. 화면을 다시 열어 주세요.'); }
  };
  useEffect(() => { void refresh(); }, [total]);


  const toggleField = (f: string) =>
    setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const run = async (selectedScope: ExportScope) => {
    setChoosing(false);
    setPhase("running");
    setProg(30);
    try {
      let result;
      if (fmt === 'csv') {
        result = await window.api.export.csv({ fields, scope: selectedScope });
      } else {
        result = await window.api.export.xlsx({ fields, scope: selectedScope });
      }

      if (result.ok) {
        setSaved({ count: result.count, filePath: result.filePath });
        setProg(100);
        setPhase("done");
      } else {
        setPhase("idle");
        if (!result.cancelled) alert(`오류 발생: ${result.error}`);
      }
      await refresh();
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
          <div className="ph-desc">내보내기 버튼을 누르면 최근 수집한 항목 또는 전체를 선택할 수 있습니다.</div>
        </div>
        <div className="ph-actions">
          <Badge tone="neutral">{summary ? `${summary.total.toLocaleString()}건 보관 중` : '대상 확인 중'}</Badge>
        </div>
      </div>

      {choosing && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 24 }}
          onClick={() => setChoosing(false)} onKeyDown={event => { if (event.key === 'Escape') setChoosing(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="export-scope-title" className="card" style={{ padding: 24, width: 'min(520px, 100%)' }} onClick={event => event.stopPropagation()}>
            <h2 id="export-scope-title" style={{ margin: '0 0 10px', fontSize: 18 }}>어떤 항목을 내보낼까요?</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.7 }}>최근 수집은 마지막으로 실행한 수집에서 저장한 회사입니다. 기존 회사를 다시 수집한 경우도 포함됩니다. 중지한 수집은 중지 전까지 저장한 항목이 포함됩니다.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <Btn autoFocus variant="primary" disabled={!summary?.recent || !!summaryError} onClick={() => run('recent')}>최근 수집한 항목만 · {summary?.recent.toLocaleString() ?? 0}건</Btn>
              <Btn disabled={!summary?.total || !!summaryError} onClick={() => run('all')}>전체 내보내기 · {summary?.total.toLocaleString() ?? 0}건</Btn>
              <Btn onClick={() => setChoosing(false)}>취소</Btn>
            </div>
            {!summary?.recent && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>최근 수집 항목이 없습니다. 업데이트 이전 데이터는 전체 내보내기를 사용하거나 수집을 새로 실행해 주세요.</p>}
            {summaryError && <p role="alert">{summaryError}</p>}
          </div>
        </div>
      )}
      <div className="page-scroll" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {summaryError && <div role="alert">{summaryError}</div>}
        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>1 · 파일 형식</div>
          <div className="export-grid">
            {FORMATS.map((f) => (
              <div key={f.id} className={`card fmt-card ${fmt === f.id ? "on" : ""}`} onClick={() => { if (phase !== 'running') { setFmt(f.id); setPhase('idle'); } }}>
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
          action={<Btn variant="ghost" size="sm" disabled={phase === 'running'} onClick={() => setFields(ALL_FIELDS)}>전체 선택</Btn>}>
          <div className="field-pills" style={{ marginTop: 4 }}>
            {ALL_FIELDS.map((f) => (
              <button key={f} disabled={phase === 'running'} className={`field-pill ${fields.includes(f) ? "on" : ""}`} onClick={() => { toggleField(f); setPhase('idle'); }}>
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
                  ? `${saved?.count.toLocaleString()}건 저장 완료 · ${saved?.filePath}`
                  : `${FORMATS.find((f) => f.id === fmt)?.name} · ${summary?.total.toLocaleString() ?? 0}건 중 대상 선택 · ${fields.length}개 필드`}
              </div>
              {phase !== "idle" && (
                <div className="progress-track" style={{ marginTop: 12, maxWidth: 420 }}>
                  <div className="progress-fill" style={{ width: `${prog}%` }} />
                </div>
              )}
            </div>
            {phase === "done" ? (
              <Btn variant="primary" icon="Download" onClick={() => { setPhase("idle"); setProg(0); }}>다음 내보내기 준비</Btn>
            ) : (
              <Btn variant="primary" icon="Export" onClick={async () => { await refresh(); setChoosing(true); }} disabled={phase === "running" || fields.length === 0 || fmt === 'sheets' || !summary || !!summaryError || summary.total === 0}>
                {phase === "running" ? "생성 중…" : "내보내기"}
              </Btn>
            )}
          </div>
        </Card>

        <Card title="최근 내보내기" pad={false}>
          <div style={{ padding: "4px 22px 16px" }}>
            {summary?.history.length ? summary.history.map(entry => (
              <div key={entry.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', overflowWrap: 'anywhere' }}>
                <div style={{ fontSize: 13 }}>{entry.exportedAt} · {entry.format.toUpperCase()} · {entry.count.toLocaleString()}건 · {entry.scope === 'recent' ? '최근 수집' : '전체'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{entry.filePath}</div>
              </div>
            )) : <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-4)' }}>최근 내보내기 기록이 없습니다.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
