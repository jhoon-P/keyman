/* 키맨 발굴 — 공통 UI 컴포넌트 */
import React from "react";
import { Icon } from "./icons.jsx";

/* ---------- 로고: 심볼(키 모노그램) + 워드마크 ---------- */
export function BrandMark({ size = 30 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.27 }}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="9" r="4.2" />
        <path d="M11 11.5L19 19" />
        <path d="M16.2 16.2l2.2-2.2" />
        <path d="M18.8 18.8l1.6-1.6" />
      </svg>
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="brand-word">
      <span className="bw-name">키맨 발굴</span>
      <span className="bw-sub">KEYMAN&nbsp;FINDER</span>
    </span>
  );
}

/* ---------- 버튼 ---------- */
export function Btn({ variant = "ghost", size, icon, iconR, children, className = "", ...rest }) {
  const cls = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", !children ? "btn-icon" : "", className]
    .filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 16} />}
      {children}
      {iconR && <Icon name={iconR} size={size === "sm" ? 15 : 16} />}
    </button>
  );
}

/* ---------- 카드 ---------- */
export function Card({ title, sub, action, children, pad = true, className = "", style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "18px 22px 0", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {action && <div style={{ flex: "none" }}>{action}</div>}
        </div>
      )}
      {pad ? <div className="card-pad">{children}</div> : children}
    </div>
  );
}

/* ---------- 필드 ---------- */
export function Field({ label, hint, children }) {
  return (
    <label className="field">
      {label && (
        <span className="field-label">
          {label}
          {hint && <span className="field-hint">{hint}</span>}
        </span>
      )}
      {children}
    </label>
  );
}

export function Select({ value, onChange, options }) {
  return (
    <select className="select-box" value={value} onChange={(e) => onChange?.(e.target.value)}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

/* ---------- 체크박스 ---------- */
export function Checkbox({ checked, onChange, label, sub }) {
  return (
    <div className="check-row" onClick={() => onChange?.(!checked)}>
      <span className={`check-box ${checked ? "on" : ""}`}>
        {checked && <Icon name="Check" size={13} />}
      </span>
      {(label || sub) && (
        <span>
          {label && <span style={{ fontSize: 13.5, fontWeight: 550, color: "var(--text)" }}>{label}</span>}
          {sub && <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 8 }}>{sub}</span>}
        </span>
      )}
    </div>
  );
}

/* ---------- 스위치 ---------- */
export function Switch({ on, onChange }) {
  return (
    <button className={`switch ${on ? "on" : ""}`} onClick={() => onChange?.(!on)} aria-pressed={on}>
      <span className="knob" />
    </button>
  );
}

/* ---------- 배지 ---------- */
export function Badge({ tone = "neutral", dot, children }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

/* ---------- 세그먼트 ---------- */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented">
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <button key={v} className={value === v ? "on" : ""} onClick={() => onChange?.(v)}>{l}</button>
        );
      })}
    </div>
  );
}

/* ---------- 아바타 색 ---------- */
const AVATAR_COLORS = ["#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#4f46e5", "#16a34a"];
export function avatarColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
