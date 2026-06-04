/* 키맨 발굴 — 설정 */
import React, { useState } from "react";
import { Icon } from "../icons.jsx";
import { Btn, Card, Field, Select, Input, Switch, Badge, Segmented } from "../ui.jsx";

export default function Settings({ theme, setTheme }) {
  const [s, setS] = useState({
    autoDedup: true, verifyEmail: true, headless: true, notify: false, autoSave: true,
  });
  const [reqInterval, setReqInterval] = useState(3000);
  const [concurrency, setConcurrency] = useState("2");
  const set = (k, v) => setS((cur) => ({ ...cur, [k]: v }));

  return (
    <div className="fade-page">
      <div className="page-head">
        <div>
          <div className="ph-title">설정</div>
          <div className="ph-desc">수집 동작과 앱 환경을 구성합니다.</div>
        </div>
      </div>

      <div className="page-scroll" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
        <Card title="수집 동작">
          <div style={{ marginTop: 2 }}>
            <div className="set-row">
              <div className="set-info">
                <div className="set-name">중복 자동 병합</div>
                <div className="set-desc">동일 회사·담당자 정보를 자동으로 병합하여 중복을 제거합니다.</div>
              </div>
              <div className="set-control"><Switch on={s.autoDedup} onChange={(v) => set("autoDedup", v)} /></div>
            </div>
            <div className="set-row">
              <div className="set-info">
                <div className="set-name">이메일 유효성 검증</div>
                <div className="set-desc">수집한 이메일의 도메인·형식을 실시간으로 확인합니다.</div>
              </div>
              <div className="set-control"><Switch on={s.verifyEmail} onChange={(v) => set("verifyEmail", v)} /></div>
            </div>
            <div className="set-row">
              <div className="set-info">
                <div className="set-name">백그라운드 수집</div>
                <div className="set-desc">브라우저 창을 표시하지 않고 백그라운드에서 수집합니다.</div>
              </div>
              <div className="set-control"><Switch on={s.headless} onChange={(v) => set("headless", v)} /></div>
            </div>
          </div>
        </Card>

        <Card title="요청 제어" sub="과도한 요청으로 인한 차단을 방지합니다">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 6 }}>
            <Field label="기본 요청 간격" hint="밀리초">
              <Input type="number" value={reqInterval} onChange={(e) => setReqInterval(+e.target.value || 0)} />
            </Field>
            <Field label="동시 요청 수">
              <Select value={concurrency} onChange={setConcurrency} options={["1", "2", "3", "5"]} />
            </Field>
          </div>
        </Card>

        <Card title="환경">
          <div style={{ marginTop: 2 }}>
            <div className="set-row">
              <div className="set-info">
                <div className="set-name">테마</div>
                <div className="set-desc">라이트 / 다크 모드를 전환합니다.</div>
              </div>
              <div className="set-control">
                <Segmented value={theme} onChange={setTheme}
                  options={[{ value: "light", label: "라이트" }, { value: "dark", label: "다크" }]} />
              </div>
            </div>
            <div className="set-row">
              <div className="set-info">
                <div className="set-name">완료 알림</div>
                <div className="set-desc">수집·내보내기 완료 시 시스템 알림을 표시합니다.</div>
              </div>
              <div className="set-control"><Switch on={s.notify} onChange={(v) => set("notify", v)} /></div>
            </div>
            <div className="set-row">
              <div className="set-info">
                <div className="set-name">자동 저장</div>
                <div className="set-desc">수집 중 1분마다 진행 상황을 자동 저장합니다.</div>
              </div>
              <div className="set-control"><Switch on={s.autoSave} onChange={(v) => set("autoSave", v)} /></div>
            </div>
          </div>
        </Card>

        <Card title="라이선스">
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 2 }}>
            <span className="stat-ico" style={{ width: 40, height: 40 }}><Icon name="Shield" size={20} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 650, display: "flex", alignItems: "center", gap: 8 }}>
                키맨 발굴 Pro <Badge tone="accent">활성</Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3 }}>2026년 12월 31일까지 · 무제한 수집</div>
            </div>
            <Btn variant="ghost" size="sm">라이선스 관리</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
