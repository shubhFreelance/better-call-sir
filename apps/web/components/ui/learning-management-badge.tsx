"use client";
import { ShieldCheck } from "lucide-react";
import { StatusBadge } from "./status-controls";
import { InfoTooltip } from "./info-tooltip";

export function LearningManagementBadge({ label, items }: { label: string; items: string[] }) {
  return <span className="learning-management-badge">
    <StatusBadge label={label} tone="accent" icon={ShieldCheck} />
    <InfoTooltip label={label} items={items} />
  </span>;
}
