/* 키맨 발굴 — 데이터 (테이블 + 상세 패널) */
import React, { useState, useMemo } from "react";
import { Icon } from "../icons.jsx";
import { Btn, Input, Select, Badge, avatarColor } from "../ui.jsx";

export default function DataScreen({ rows }) {
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("전체");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (region !== "전체" && r.region !== region) return false;
      if (q && !(r.name.includes(q) || r.person.includes(q) || r.industry.includes(q))) return false;
      return true;
    });
  }, [rows, q, region]);

  const selected = sel != null ? rows.find((r) => r.id === sel) : null;

  return (
    <div className="fade-page" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-head">
        <div>
          <div className="ph-title">수집 데이터</div>
          <div className="ph-desc">{filtered.length.toLocaleString()}개의 연락처 · 행을 클릭해 상세를 확인하세요.</div>
        </div>
        <div className="ph-actions">
          <Btn variant="ghost" size="sm" icon="Filter">필터</Btn>
          <Btn variant="ghost" size="sm" icon="Download">내보내기</Btn>
        </div>
      </div>

      <div className="data-layout" style={{ flex: 1, minHeight: 0, borderTop: "1px solid var(--border)" }}>
        <div className="data-main">
          <div className="table-toolbar">
            <div className="search-box">
              <Icon name="Search" size={16} />
              <Input placeholder="회사명·담당자·업종 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={region} onChange={setRegion}
              options={["전체", "서울", "경기", "인천", "부산", "대구", "대전"]} />
            <div style={{ flex: 1 }} />
            <Badge tone="neutral">{filtered.length}건 표시</Badge>
          </div>
          <div className="table-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>회사명</th>
                  <th>담당자</th>
                  <th>업종</th>
                  <th>지역</th>
                  <th>연락처</th>
                  <th>상태</th>
                  <th>수집</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={sel === r.id ? "sel" : ""} onClick={() => setSel(r.id)}>
                    <td>
                      <div className="cell-company">
                        <span className="cell-avatar" style={{ background: avatarColor(r.name) }}>{r.name[0]}</span>
                        <div>
                          <div className="cell-co-name">{r.name}</div>
                          <div className="cell-co-sub">{r.site}</div>
                        </div>
                      </div>
                    </td>
                    <td><span style={{ color: "var(--text)", fontWeight: 500 }}>{r.person}</span>
                      <span className="cell-co-sub"> · {r.role}</span></td>
                    <td className="cell-muted">{r.industry}</td>
                    <td className="cell-muted">{r.region}</td>
                    <td className="cell-muted">{r.phone}</td>
                    <td>{r.verified ? <Badge tone="accent" dot>검증됨</Badge> : <Badge tone="amber" dot>미확인</Badge>}</td>
                    <td className="cell-muted">{r.collectedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 상세 패널 */}
        <div className="detail-panel">
          {!selected ? (
            <div className="detail-empty">
              <div>
                <span style={{ display: "inline-grid", placeItems: "center", width: 46, height: 46,
                  borderRadius: 12, background: "var(--surface-3)", color: "var(--text-4)", marginBottom: 14 }}>
                  <Icon name="User" size={22} />
                </span>
                <div>왼쪽 목록에서 연락처를<br />선택하면 상세 정보가 표시됩니다.</div>
              </div>
            </div>
          ) : (
            <div key={selected.id} className="slide-in" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
              <div className="detail-head">
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <span className="detail-avatar" style={{ background: avatarColor(selected.name) }}>{selected.name[0]}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{selected.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3, display: "flex", gap: 7, alignItems: "center" }}>
                      <Icon name="Globe" size={13} />{selected.site}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, marginTop: 14 }}>
                  {selected.verified ? <Badge tone="accent" dot>검증됨</Badge> : <Badge tone="amber" dot>미확인</Badge>}
                  <Badge tone="neutral">{selected.industry}</Badge>
                  <Badge tone="neutral">{selected.region}</Badge>
                </div>
              </div>
              <div className="detail-body">
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>담당자 (키맨)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0" }}>
                    <span className="cell-avatar" style={{ background: avatarColor(selected.person), width: 36, height: 36, borderRadius: 10 }}>
                      {selected.person[0]}
                    </span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.person}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{selected.role}</div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>연락처</div>
                  <div className="kv-list">
                    {[
                      { ico: "Phone", k: "대표전화", v: selected.phone },
                      { ico: "Phone", k: "휴대전화", v: selected.mobile },
                      { ico: "Mail", k: "이메일", v: selected.email },
                      { ico: "Globe", k: "웹사이트", v: selected.site },
                    ].map((x) => (
                      <div key={x.k} className="kv-row">
                        <span className="kv-ico"><Icon name={x.ico} size={15} /></span>
                        <span className="kv-key">{x.k}</span>
                        <span className="kv-val">{x.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>기업 정보</div>
                  <div className="kv-list">
                    {[
                      { ico: "Briefcase", k: "업종", v: selected.industry },
                      { ico: "MapPin", k: "지역", v: selected.region },
                      { ico: "User", k: "임직원", v: `약 ${selected.employees}명` },
                      { ico: "Clock", k: "수집", v: selected.collectedAt },
                    ].map((x) => (
                      <div key={x.k} className="kv-row">
                        <span className="kv-ico"><Icon name={x.ico} size={15} /></span>
                        <span className="kv-key">{x.k}</span>
                        <span className="kv-val">{x.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="detail-foot">
                <Btn variant="primary" size="sm" icon="Mail" style={{ flex: 1 }}>이메일 작성</Btn>
                <Btn variant="ghost" size="sm" icon="Copy">복사</Btn>
                <Btn variant="ghost" size="sm" icon="Trash" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
