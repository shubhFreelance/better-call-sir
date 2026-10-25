"use client";
import type { ComponentProps } from "react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

export function FilterButton({ accent = false, className, ...props }: Omit<ComponentProps<typeof Button>, "variant"> & { accent?: boolean }) {
  return <Button type="button" {...props} variant="outline" data-accent={accent} className={cn("filter-button", className)} />;
}

export function FilterButtonGroup({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("filter-button-group", className)} />;
}
