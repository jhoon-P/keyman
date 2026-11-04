import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

interface CopyButtonProps {
  text?: string | null;
  label: string;
  children?: React.ReactNode;
}

export function CopyButton({ text, label, children }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const feedback = state === "copied" ? "복사 완료" : state === "error" ? "복사 실패 · 다시 시도" : "복사";
  const title = `${label} ${feedback}`;

  const copy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!text?.trim()) return;
    clearTimeout(timer.current);
    setState("copying");
    try {
      await window.api.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }
    timer.current = setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button type="button" className={`${children ? "btn btn-primary btn-sm copy-summary" : "copy-icon"} ${state === "error" ? "copy-error" : ""}`}
      title={title} aria-label={title} disabled={!text?.trim() || state === "copying"} onClick={copy}>
      <Icon name={state === "copied" ? "Check" : "Copy"} size={children ? 15 : 13} />
      {children && (state === "copied" ? "복사됨" : state === "error" ? "다시 복사" : children)}
      <span className="sr-only" role="status">{state === "copied" || state === "error" ? title : ""}</span>
    </button>
  );
}

export function CopyValue({ text, label, children }: CopyButtonProps) {
  return (
    <span className="copy-value">
      <span className="copy-value-text">{children ?? text ?? "-"}</span>
      <CopyButton text={text} label={label} />
    </span>
  );
}
