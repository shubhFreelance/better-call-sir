"use client";
import type { ComponentProps } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

export function RefreshButton({ label, iconOnly = true, className, variant, size, ...props }: Omit<ComponentProps<typeof Button>, "children"> & { label: string; iconOnly?: boolean }) {
  return <Button type="button" {...props} variant={iconOnly ? "ghost" : variant} size={iconOnly ? "icon" : size}
    className={cn(className, iconOnly && "refresh-button")} aria-label={label} title={iconOnly ? label : undefined}>
    {iconOnly ? <RefreshCw size={18} aria-hidden="true" /> : label}
  </Button>;
}
