import type { CollectionStatus } from '../../../shared/collection';
import React, { useState, useRef, useEffect } from "react";
import { Icon } from "../components/icons";
import { Btn, Card, Field, Select, Input, Badge, Checkbox } from "../components/ui";
import { REGIONS, findRegion, subLabels } from "../../../shared/regions";
import { SARAMIN_JOB_CAT_LABELS } from "../../../shared/industries";
import { SARAMIN_COMPANY_TYPES, type CompanyTypeCode } from "../../../shared/companyTypes";

interface CollectProps {
  col: {
    running: boolean;
    stopping?: boolean;
    status?: CollectionStatus;
    found: number;
    targetCount?: number;
    enriched?: number;
    enrichmentPending?: number;
    logs: any[];
  };
  onStart: (payload: any) => void;
  onStop: () => void;
}

export default function Collect({ col, onStart, onStop }: CollectProps) {
  const [site, setSite] = useState(true);
  const [industries, setIndustries] = useState<string[]>([]);
  const [openFilter, setOpenFilter] = useState<'industry' | 'companyType' | null>(null);
  const [companyTypes, setCompanyTypes] = useState<CompanyTypeCode[]>([]);
  // "" = 지역 무관(파라미터 없음). 그 외에는 사람인 loc_mcd 코드
  const [regionCode, setRegionCode] = useState("");
  const [subCodes, setSubCodes] = useState<string[]>([]);
  const [subOpen, setSubOpen] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [maxCount, setMaxCount] = useState(100);
  const [minEmployee, setMinEmployee] = useState(50);
  const [excludeAgencies, setExcludeAgencies] = useState(true);
  const [schedulerMode, setSchedulerMode] = useState<'reserved' | 'staged' | 'shared'>('reserved');
  const [delayMs, setDelayMs] = useState(500);
  const logRef = useRef<HTMLDivElement>(null);

  const region = findRegion(regionCode);
  const subs = region?.subs ?? [];
  const industrySummary = industries.length === 0 ? '전체 업종'
    : industries.length === SARAMIN_JOB_CAT_LABELS.length ? '전체 업종 선택'
    : industries.length === 1 ? industries[0] : `${industries[0]} 외 ${industries.length - 1}개 업종`;
  const toggleIndustry = (label: string) => {
    setIndustries(prev => prev.includes(label) ? prev.filter(value => value !== label) : [...prev, label]);
  };
  const companyTypeLabels = SARAMIN_COMPANY_TYPES.filter(option => companyTypes.includes(option.value)).map(option => option.label);
  const companyTypeSummary = companyTypes.length === 0 ? '전체 기업형태'
    : companyTypes.length === 1 ? companyTypeLabels[0] : `${companyTypeLabels[0]} 외 ${companyTypes.length - 1}개`;
  const toggleCompanyType = (value: CompanyTypeCode) => {
    setCompanyTypes(prev => prev.includes(value) ? prev.filter(code => code !== value) : [...prev, value]);
  };
  const closeFilterForOtherField = (event: React.SyntheticEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-filter-toggle]')) setOpenFilter(null);
  };

  /** 진행 표시줄에 쓰는 지역 요약 — "서울 · 강남구 외 2곳" */
  const regionSummary = (() => {
    if (!region) return "전체 지역";
    const picked = subLabels(regionCode, subCodes);
    if (picked.length === 0) return region.label;
    if (picked.length === 1) return `${region.label} ${picked[0]}`;
    return `${region.label} ${picked[0]} 외 ${picked.length - 1}곳`;
  })();

  // 시/도를 바꾸면 이전 시/군/구 선택은 의미가 없으므로 비운다
  const changeRegion = (code: string) => {
    setRegionCode(code);
    setSubCodes([]);
  };

  const toggleSub = (code: string) => {
    setSubCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [col.logs.length]);

  const running = col.running;
  const status = col.status;
  const poolText = status?.sharedWorkers ? `전체 작업 ${status.sharedActive ?? 0}/${status.sharedWorkers} · ` : "";
  const detailText = status ? `상세 조회 ${status.detailActive}개 · 대기 ${status.detailQueued}건` : '';
  const homepageText = status ? `홈페이지 ${status.homepageActive}개 · 대기 ${status.homepageQueued}건 · 보강 완료 ${status.homepageCompleted}건 · 미확보 ${status.homepageFailed + status.homepageTimedOut}` : '';
  const phaseText = col.stopping ? '중지 중' : status?.phase === 'enriching' ? '기본 정보 수집 완료 · 홈페이지 보강 중' : '수집 중';
  const progressTarget = col.targetCount ?? maxCount;
  const pct = progressTarget > 0 ? Math.max(0, Math.min(100, Math.round((col.found / progressTarget) * 100))) : 0;
  const progressLabel = running ? col.stopping ? '중지 중' : status?.phase === 'enriching' ? '홈페이지 보강 중' : '수집 중'
    : status?.stopReason === 'stopped' ? '수집 중지' : status?.stopReason === 'blocked' || status?.stopReason === 'error' ? '수집 종료' : '수집 완료';
  const showProgress = running || col.logs.length > 0;

  const handleStart = () => {
    if (!site) return;
    onStart({
      sourceIds: site ? ['saramin'] : [],
      filters: {
        keyword,
        region_sido: region ? (region.fullName ?? region.label) : undefined,
        region_code: regionCode || undefined,
        region_sub_codes: subCodes.length ? subCodes : undefined,
        industries,
        company_types: companyTypes,
        max_count: maxCount,
        min_employee: minEmployee > 0 ? minEmployee : undefined,
        exclude_recruitment_agencies: excludeAgencies
      },
      options: { delayMs, schedulerMode }
    });
  };

  return (
    <div className="fade-page" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="page-head collect-head">
        <div className="collect-heading">
          <div className="ph-title">회사 연락처 수집</div>
          <div className="ph-desc">{running ? `${phaseText} · ${regionSummary} · ${industrySummary} · ${companyTypeSummary}` : "조건을 설정하고 키맨 연락처를 자동으로 수집합니다."}</div>
        </div>
        <div className="ph-actions">
          {showProgress && (
            <div className="collect-progress">
              <div className="progress-meta">
                <span className="collect-progress-label"><span className={`status-dot ${running ? 'run' : 'idle'}`} />{progressLabel}</span>
                <span><strong>{col.found}</strong><span className="collect-progress-total"> / {progressTarget > 0 ? `${progressTarget}건` : '제한 없음'}</span></span>
              </div>
              <div className="progress-track" role="progressbar" aria-label="수집 진행률" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={pct} aria-valuetext={`${progressLabel}, ${col.found}건 저장${progressTarget > 0 ? `, 목표 ${progressTarget}건` : ''}`}>
                <div className={`progress-fill ${running ? '' : 'progress-still'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {!running ? (
            <Btn variant="primary" icon="Play" onClick={handleStart} disabled={!site}>수집 시작</Btn>
          ) : (
            <Btn variant="danger" icon="Stop" onClick={onStop} disabled={col.stopping}>{col.stopping ? "중지 중…" : "중지"}</Btn>
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
              <span className={`check-box ${site ? "on" : ""}`} style={{ width: 20, height: 20, borderRadius: 6, border: '1.5px solid var(--border-strong)', display: 'grid', placeItems: 'center' }}>
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
          <div className="filter-grid" style={{ marginTop: 4 }}
            onFocusCapture={closeFilterForOtherField} onClickCapture={closeFilterForOtherField}>
            <Field label="업종 필터">
              <button type="button" className="select-box industry-select" data-filter-toggle aria-label="업종 선택" aria-expanded={openFilter === 'industry'}
                aria-controls="industry-options" title={industries.length ? industries.join(', ') : '전체 업종'}
                onClick={() => setOpenFilter(open => open === 'industry' ? null : 'industry')}>{industrySummary}</button>
            </Field>
            <Field label="기업형태 필터">
              <button type="button" className="select-box industry-select" data-filter-toggle aria-label="기업형태 선택" aria-expanded={openFilter === 'companyType'}
                aria-controls="company-type-options" title={companyTypeLabels.length ? companyTypeLabels.join(', ') : '전체 기업형태'}
                onClick={() => setOpenFilter(open => open === 'companyType' ? null : 'companyType')}>{companyTypeSummary}</button>
            </Field>
            <Field label="지역 (시/도)">
              <Select value={regionCode} onChange={changeRegion}
                options={[
                  { value: "", label: "전체" },
                  // 사람인의 '전국'(117000)은 필터 해제가 아니라 '근무지 전국' 공고 분류라
                  // 위의 '전체'와 구분되도록 라벨에 명시한다
                  ...REGIONS.map(r => ({
                    value: r.code,
                    label: r.code === "117000" ? "전국(근무지 전국)" : r.label
                  }))
                ]} />
            </Field>
            <Field label="키워드 (회사명)">
              <Input placeholder="회사명 일부 입력" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </Field>
            <Field label="최대 수집 건수">
              <Input type="number" value={maxCount} onChange={(e) => setMaxCount(+e.target.value || 0)} />
            </Field>
            <Field label="임직원 수 제한" hint="N인 이상">
              <Input type="number" min={0} value={minEmployee} onChange={(e) => setMinEmployee(+e.target.value || 0)} />
            </Field>
            <Field label="요청 간격" hint="밀리초">
              <Input type="number" value={delayMs} onChange={(e) => setDelayMs(+e.target.value || 0)} />
            </Field>
            <Field label="수집 방식" hint="기본 정보 먼저 수집">
              <Select value={schedulerMode} onChange={v => setSchedulerMode(v === 'reserved' || v === 'shared' ? v : 'staged')}
                options={[{ value: 'reserved', label: '상세 우선 수집 (기본)' }, { value: 'staged', label: '기존 수집' }, { value: 'shared', label: '공용 작업자 7개' }]} />
            </Field>
            <Field label="중복 처리">
              <Select value="자동 병합" options={["자동 병합", "건너뛰기", "모두 유지"]} />
            </Field>
          </div>

          {openFilter === 'industry' && (
            <div id="industry-options" className="subregion-panel industry-panel" role="group" aria-label="업종 다중 선택">
              <div className="subregion-head">
                <div className="industry-panel-title">
                  <span>업종 선택</span>
                  {industries.length > 0 ? <Badge tone="accent">{industries.length}개 선택</Badge>
                    : <span className="subregion-hint">선택하지 않으면 전체 업종</span>}
                </div>
                <div className="subregion-actions">
                  <Btn variant="ghost" size="sm" aria-label="업종 전체 선택" onClick={() => setIndustries([...SARAMIN_JOB_CAT_LABELS])}
                    disabled={industries.length === SARAMIN_JOB_CAT_LABELS.length}>전체 선택</Btn>
                  <Btn variant="ghost" size="sm" aria-label="업종 선택 해제" onClick={() => setIndustries([])}
                    disabled={industries.length === 0}>선택 해제</Btn>
                </div>
              </div>
              <div className="subregion-grid industry-grid">
                {SARAMIN_JOB_CAT_LABELS.map(label => (
                  <label key={label} className="industry-option">
                    <input type="checkbox" checked={industries.includes(label)} onChange={() => toggleIndustry(label)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="industry-match-hint">선택한 업종 중 하나라도 해당하는 채용공고를 검색합니다.</div>
            </div>
          )}

          {openFilter === 'companyType' && (
            <div id="company-type-options" className="subregion-panel" role="group" aria-label="기업형태 다중 선택">
              <div className="subregion-head">
                <div className="industry-panel-title">
                  <span>기업형태 선택</span>
                  {companyTypes.length > 0 ? <Badge tone="accent">{companyTypes.length}개 선택</Badge>
                    : <span className="subregion-hint">선택하지 않으면 전체 기업형태</span>}
                </div>
                <div className="subregion-actions">
                  <Btn variant="ghost" size="sm" aria-label="기업형태 전체 선택" onClick={() => setCompanyTypes(SARAMIN_COMPANY_TYPES.map(option => option.value))}
                    disabled={companyTypes.length === SARAMIN_COMPANY_TYPES.length}>전체 선택</Btn>
                  <Btn variant="ghost" size="sm" aria-label="기업형태 선택 해제" onClick={() => setCompanyTypes([])}
                    disabled={companyTypes.length === 0}>선택 해제</Btn>
                </div>
              </div>
              <div className="subregion-grid">
                {SARAMIN_COMPANY_TYPES.map(option => (
                  <label key={option.value} className="industry-option">
                    <input type="checkbox" checked={companyTypes.includes(option.value)} onChange={() => toggleCompanyType(option.value)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <div className="industry-match-hint">선택한 기업형태를 업종·지역 조건과 함께 검색합니다.</div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Checkbox checked={excludeAgencies} onChange={setExcludeAgencies}
              label="헤드헌팅·채용대행 업체 제외"
              sub="회사명·업종·사업내용으로 판별하며 인력파견·고용알선 업체도 제외합니다." />
          </div>

          {/* 시/군/구 — 하위 지역이 있는 시/도를 고른 경우에만 노출 (세종·전국은 하위 없음) */}
          {subs.length > 0 && (
            <div className="subregion-panel">
              <div className="subregion-head">
                <button className="subregion-toggle" onClick={() => setSubOpen(!subOpen)}>
                  <Icon name="ChevronRight" size={15}
                    style={{ transform: subOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  <span>{region!.label} 시/군/구</span>
                  {subCodes.length > 0
                    ? <Badge tone="accent">{subCodes.length}곳 선택</Badge>
                    : <span className="subregion-hint">선택하지 않으면 {region!.label} 전체</span>}
                </button>
                <div className="subregion-actions">
                  <Btn variant="ghost" size="sm"
                    onClick={() => setSubCodes(subs.map(s => s.code))}
                    disabled={subCodes.length === subs.length}>전체 선택</Btn>
                  <Btn variant="ghost" size="sm"
                    onClick={() => setSubCodes([])}
                    disabled={subCodes.length === 0}>선택 해제</Btn>
                </div>
              </div>
              {subOpen && (
                <div className="subregion-grid">
                  {subs.map(s => (
                    <Checkbox key={s.code} label={s.label}
                      checked={subCodes.includes(s.code)}
                      onChange={() => toggleSub(s.code)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 실행 로그 */}
        <Card pad={false} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 320, overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
            <div className="section-label">실행 로그</div>
            {status && <div className="collect-log-status">{poolText}{detailText} · {homepageText}</div>}
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
