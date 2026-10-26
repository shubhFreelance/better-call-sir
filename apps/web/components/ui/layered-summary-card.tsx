import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function LayeredSummaryCard({ header, footer, children, className, ...props }: Omit<ComponentProps<"section">, "header" | "footer"> & { header: ReactNode; footer: ReactNode }) {
  return <section {...props} className={cn("layered-summary-card", className)}>
    <header className="layered-summary-card-header">{header}</header>
    <div className="layered-summary-card-body">{children}</div>
    <div className="layered-summary-card-footer">{footer}</div>
  </section>;
}
