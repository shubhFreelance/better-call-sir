"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "./button";

type StatusTone = "accent" | "warning" | "success" | "danger" | "neutral";
type StatusOption<T extends string> = { value: T; label: string; tone: StatusTone; icon: LucideIcon };

export function StatusBadge({ label, tone, icon: Icon }: Omit<StatusOption<string>, "value">) {
  return <span className={`status-badge status-tone-${tone}`}><Icon size={13} aria-hidden="true" />{label}</span>;
}

export function StatusFilters<T extends string>({ label, options, value, onChange, disabled }: {
  label: string;
  options: readonly StatusOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return <div className="status-filters" role="group" aria-label={label}>
    {options.map(({ value: key, label: text, tone, icon: Icon }) => <Button key={key}
      type="button" variant="outline" className={`status-filter status-tone-${tone}`}
      aria-pressed={value === key} disabled={disabled} onClick={() => onChange(key)}>
      <Icon size={15} aria-hidden="true" />{text}
    </Button>)}
  </div>;
}
