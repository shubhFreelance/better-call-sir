import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function LayeredSummaryCard({ header, footer, children, className, collapsible = false, open, ...props }: Omit<ComponentPropsWithoutRef<"section">, "header" | "footer"> & { header: ReactNode; footer: ReactNode; collapsible?: boolean; open?: boolean }) {
  const Card = collapsible ? "details" : "section", Header = collapsible ? "summary" : "header";
  return <Card {...props} {...(collapsible ? {open} : {})} className={cn("layered-summary-card", className)}>
    <Header className="layered-summary-card-header">{header}</Header>
    <div className="layered-summary-card-body">{children}</div>
    <div className="layered-summary-card-footer">{footer}</div>
  </Card>;
}
