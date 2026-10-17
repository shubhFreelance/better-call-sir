"use client";
import * as React from "react";
import { useAppTranslation } from "../../app/locale";
import * as Recharts from "recharts";
import { cn } from "../../lib/utils";
export type ChartConfig = Record<string, { label: string }>;
const ChartContext = React.createContext<ChartConfig>({});
export function ChartContainer({
  config,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ReactElement;
}) {
  const { appText } = useAppTranslation();
  const translated = Object.fromEntries(
    Object.entries(config).map(([key, item]) => [
      key,
      { ...item, label: appText(item.label) },
    ]),
  );
  return (
    <ChartContext.Provider value={translated}>
      <div
        data-slot="chart"
        role="group"
        className={cn("reports-chart", className)}
        {...props}
      >
        <Recharts.ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {children}
        </Recharts.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}
export const ChartTooltip = Recharts.Tooltip;
export function ChartTooltipContent({
  active,
  payload,
  label,
  valueFormatter = (v: number) => v.toLocaleString("en-IN"),
}: {
  active?: boolean;
  payload?: readonly { dataKey?: unknown; name?: unknown; value?: unknown }[];
  label?: unknown;
  valueFormatter?: (v: number) => string;
}) {
  const { appText, appLocale } = useAppTranslation();
  const config = React.useContext(ChartContext);
  if (!active || !payload?.length) return null;
  return (
    <div className="reports-tooltip">
      <strong>
        {typeof label === "string" || typeof label === "number"
          ? appText(label)
          : appText("Recorded value")}
      </strong>
      {payload.map((p, i) => (
        <p key={i}>
          {config[String(p.dataKey)]?.label ||
            (typeof p.name === "string" ? p.name : appText("Recorded value"))}
          :{" "}
          {typeof p.value === "number" && Number.isFinite(p.value)
            ? valueFormatter(p.value)
            : appText("No observation")}
        </p>
      ))}
    </div>
  );
}
