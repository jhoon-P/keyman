import React, { useState, useEffect, useMemo } from "react";
import { Icon } from "../components/icons";
import { Btn, Input, Select, Badge, avatarColor } from "../components/ui";

export default function DataScreen({ go }: { go: (tab: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("전체");
  const [loading, setLoading] = useState(true);

  const REGION_MAP: Record<string, string> = {
    "서울": "서울특별시",
    "경기": "경기도",
    "인천": "인천광역시",
    "부산": "부산광역시",
    "대구": "대구광역시",
    "대전": "대전광역시",
    "광주": "광주광역시",
    "울산": "울산광역시",
    "세종": "세종특별자치시",
    "강원": "강원특별자치도",
    "충북": "충청북도",
    "충남": "충청남도",
    "전북": "전북특별자치도",
    "전남": "전라남도",
    "경북": "경상북도",
    "경남": "경상남도",
    "제주": "제주특별자치도"
  };

  useEffect(() => {
    fetchData();
  }, [q, region]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await window.api.data.query({
        search: q || undefined,
        region_sido: region === "전체" ? undefined : (REGION_MAP[region] || region),
        limit: 100
      });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error("Data query error", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const selected = sel != null ? rows.find((r) => r.id === sel) : null;

  return (
    <div className="fade-page" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-head">
        <div>
          <div className="ph-title">수집 데이터</div>
          <div className="ph-desc">{(total || 0).toLocaleString()}개의 연락처 · 행을 클릭해 상세를 확인하세요.</div>
        </div>
        <div className="ph-actions">
          <Btn variant="ghost" size="sm" icon="Filter" onClick={fetchData}>새로고침</Btn>
          <Btn variant="ghost" size="sm" icon="Download" onClick={() => go("export")}>내보내기</Btn>
          <Btn variant="ghost" size="sm" icon="Trash" onClick={async () => {
            if (!confirm(`전체 ${total.toLocaleString()}건을 삭제합니다. 되돌릴 수 없습니다. 계속하시겠습니까?`)) return;
            await window.api.data.deleteAll();
            setRows([]);
            setTotal(0);
            setSel(null);
          }}>전체 삭제</Btn>
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
              options={["전체", "서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]} />
            <div style={{ flex: 1 }} />
            <Badge tone="neutral">{(rows || []).length}건 표시</Badge>
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
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-4)' }}>데이터 로드 중...</td></tr>
                ) : (rows || []).length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-4)' }}>데이터가 없습니다.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className={[sel === r.id ? "sel" : "", r.contacted ? "contacted" : ""].join(" ").trim()} onClick={() => setSel(r.id)}>
                    <td>
                      <div className="cell-company">
                        <input
                          type="checkbox"
                          className="contact-check"
                          title="연락 완료 표시"
                          checked={!!r.contacted}
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            const v = e.target.checked;
                            // 낙관적 갱신 후 DB 반영 — 실패 시 원복
                            setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, contacted: v } : x)));
                            const res = await window.api.data.setContacted(r.id, v);
                            if (!res?.ok) setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, contacted: !v } : x)));
                          }}
                        />
                        <div>
                          <div className="cell-co-name">{r.company_name}</div>
                          <div className="cell-co-sub">{r.source_id || '사람인'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>{r.keyman_candidates?.[0]?.name || '담당자 미상'}</span>
                      <span className="cell-co-sub"> · {r.keyman_candidates?.[0]?.title || ''}</span>
                    </td>
                    <td className="cell-muted">{r.industry}</td>
                    <td className="cell-muted">{r.region_sido}</td>
                    <td className="cell-muted">{r.main_phone}</td>
                    <td>{r.phone_status === 'verified' ? <Badge tone="accent" dot>검증됨</Badge> : <Badge tone="amber" dot>미확인</Badge>}</td>
                    <td className="cell-muted">{r.collected_at || r.created_at}</td>
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
                  <span className="detail-avatar" style={{ background: avatarColor(selected.company_name || '?') }}>{selected.company_name?.[0] || '?'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{selected.company_name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3, display: "flex", gap: 7, alignItems: "center" }}>
                      <Icon name="Globe" size={13} />{selected.source_id || '사람인'}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, marginTop: 14 }}>
                  {selected.phone_status === 'verified' ? <Badge tone="accent" dot>검증됨</Badge> : <Badge tone="amber" dot>미확인</Badge>}
                  <Badge tone="neutral">{selected.industry}</Badge>
                  <Badge tone="neutral">{selected.region_sido}</Badge>
                </div>
              </div>
              <div className="detail-body">
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>담당자 (키맨)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0" }}>
                    <span className="cell-avatar" style={{ background: avatarColor(selected.keyman_candidates?.[0]?.name || '담당자'), width: 36, height: 36, borderRadius: 10 }}>
                      {selected.keyman_candidates?.[0]?.name?.[0] || '?' }
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.keyman_candidates?.[0]?.name || '담당자 미상'}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{selected.keyman_candidates?.[0]?.title || ''}</div>
                    </div>
                  </div>
                  {selected.departments && selected.departments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {selected.departments.map((d: string, i: number) => (
                        <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>연락처</div>
                  <div className="kv-list">
                    {[
                      { ico: "Phone" as const, k: "대표전화", v: selected.main_phone || '-' },
                      { ico: "Phone" as const, k: "휴대전화", v: selected.keyman_candidates?.[0]?.phone || '-' },
                      { ico: "Mail" as const, k: "이메일", v: selected.email || '-' },
                      {
                        ico: "Globe" as const,
                        k: "웹사이트",
                        v: selected.homepage_url ? (
                          <a
                            href={selected.homepage_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--accent)", textDecoration: "none" }}
                            onClick={(e) => {
                              // Electron의 기본 브라우저 열기 동작 활용 (main/index.ts의 setWindowOpenHandler가 처리)
                            }}
                          >
                            {selected.homepage_url}
                          </a>
                        ) : (
                          '-'
                        )
                      },
                    ].map((x) => (
                      <div key={x.k} className="kv-row">
                        <span className="kv-ico"><Icon name={x.ico} size={15} /></span>
                        <span className="kv-key">{x.k}</span>
                        <span className="kv-val" style={{ display: 'flex', justifyContent: 'flex-end' }}>{x.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>기업 정보</div>
                  <div className="kv-list">
                    {[
                      { ico: "Briefcase" as const, k: "업종", v: selected.industry || '-' },
                      { ico: "MapPin" as const, k: "지역", v: selected.region_sido || '-' },
                      {
                        ico: "FileText" as const,
                        k: "채용공고",
                        v: selected.job_url ? (
                          <a href={selected.job_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                            사람인 공고 보기
                          </a>
                        ) : (
                          '-'
                        )
                      },
                      { ico: "User" as const, k: "임직원", v: selected.employee_count ? `약 ${selected.employee_count}명` : '-' },
                      { ico: "Clock" as const, k: "수집", v: selected.collected_at || selected.created_at || '-' },
                    ].map((x) => (
                      <div key={x.k} className="kv-row">
                        <span className="kv-ico"><Icon name={x.ico} size={15} /></span>
                        <span className="kv-key">{x.k}</span>
                        <span className="kv-val" style={{ display: 'flex', justifyContent: 'flex-end' }}>{x.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="detail-foot">
                <Btn variant="primary" size="sm" icon="Mail" style={{ flex: 1 }}>이메일 작성</Btn>
                <Btn variant="ghost" size="sm" icon="Copy">복사</Btn>
                <Btn variant="ghost" size="sm" icon="Trash" onClick={async () => {
                  if (confirm('정말 삭제하시겠습니까?')) {
                    await window.api.data.delete(selected.id);
                    fetchData();
                    setSel(null);
                  }
                }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
