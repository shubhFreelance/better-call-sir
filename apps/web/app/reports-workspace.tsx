"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { useAppTranslation } from "./locale";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import { ChartNoAxesCombined } from "lucide-react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
  Cell,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { Notice } from "./tuition-workflow";
type Funnel = components["schemas"]["FunnelReport"];
type Continuation = components["schemas"]["ContinuationMetrics"];
type Finance = components["schemas"]["FinanceReport"];
type Range = { from: string; to: string };
const day = (offset = 0) =>
  new Date(Date.now() + 330 * 60000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
function preset(value: string): Range {
  const today = day();
  if (value === "MONTH") return { from: today.slice(0, 7) + "-01", to: today };
  if (value === "PREVIOUS") {
    const start = new Date(today.slice(0, 7) + "-01T00:00:00Z");
    return {
      from: new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1),
      )
        .toISOString()
        .slice(0, 10),
      to: new Date(start.getTime() - 86400000).toISOString().slice(0, 10),
    };
  }
  return { from: day(-29), to: today };
}
const params = (range: Range) =>
  new URLSearchParams({
    from: range.from + "T00:00:00+05:30",
    to: new Date(
      Date.parse(range.to + "T00:00:00+05:30") + 86400000,
    ).toISOString(),
  });
const when = (value: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const money = (value: number, locale = "en-IN") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
const percent = (n: number, d: number, locale = "en-IN") =>
  d
    ? new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(n / d)
    : "Not estimable";
const label = (v: string) => v.toLowerCase().replaceAll("_", " ");
const names = { MANUAL: "Manual search", ASSISTED: "Let us search for you" };
const stages = [
  ["requests", "Requests"],
  ["published", "Published shortlist"],
  ["shown", "Shown to guardian"],
  ["teacherAccepted", "Teacher acceptance"],
  ["demoCompleted", "Demo completion"],
  ["started", "Recorded starts"],
] as const;
export function ReportsWorkspace({ session }: { session: Session }) {
  const { appText, appError, appLocale } = useAppTranslation();

  if (!["ADMIN", "OPERATOR", "FINANCE"].includes(session.account.role))
    return (
      <Notice error>
        {appText(
          "Staff reporting access is required to view these reports.",
        )}{" "}
      </Notice>
    );
  return <Reports session={session} />;
}
function Reports({ session }: { session: Session }) {
  const { appText, appError, appLocale } = useAppTranslation();

  const [tab, setTab] = useState(
      session.account.role === "FINANCE" ? "finance" : "service",
    ),
    [range, setRange] = useState<Range>(() => preset("LAST30")),
    [region, setRegion] = useState("");
  return (
    <div className="care-workspace reports-workspace">
      <section className="care-intro">
        <ChartNoAxesCombined size={28} aria-hidden="true" />
        <h2>{appText("Follow the recorded journey.")}</h2>
        <p>
          {appText(
            "Compare search paths with their real denominators. Keep unknown outcomes visible and financial obligations separate from settlement.",
          )}{" "}
        </p>
      </section>
      <Period range={range} setRange={setRange} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="care-tabs" aria-label={appText("Reporting views")}>
          {session.account.role !== "FINANCE" && (
            <TabsTrigger value="service">
              {appText("Search & continuation")}
            </TabsTrigger>
          )}
          {session.account.role !== "OPERATOR" && (
            <TabsTrigger value="finance">
              {appText("Capture & obligations")}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="service">
          <ServiceReport
            session={session}
            range={range}
            region={region}
            setRegion={setRegion}
          />
        </TabsContent>
        <TabsContent value="finance">
          <FinanceReport session={session} range={range} />
        </TabsContent>
      </Tabs>
      <small className="care-help">
        {appText(
          "Reports use recorded development data and may include synthetic fixtures. These observations do not establish learning improvement, provider settlement or live pilot qualification.",
        )}{" "}
      </small>
    </div>
  );
}
function Period({
  range,
  setRange,
}: {
  range: Range;
  setRange: (r: Range) => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const [choice, setChoice] = useState("LAST30"),
    [draft, setDraft] = useState(range),
    [error, setError] = useState("");
  return (
    <section className="care-card reports-period">
      <h3>{appText("Choose the reporting dates")}</h3>
      <p>
        {appText(
          "Dates use IST. Apply a preset or custom range to update the reports; draft dates do not change the displayed results.",
        )}{" "}
      </p>
      <form
        className="care-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const from = Date.parse(draft.from + "T00:00:00+05:30"),
            to = Date.parse(draft.to + "T00:00:00+05:30") + 86400000;
          if (
            !Number.isFinite(from) ||
            !Number.isFinite(to) ||
            to <= from ||
            to - from > 366 * 86400000
          ) {
            setError("Choose an ordered date range of up to 366 days.");
            return;
          }
          setError("");
          setRange({ ...draft });
        }}
      >
        <div>
          <label htmlFor="report-preset">{appText("Date preset")}</label>
          <select
            id="report-preset"
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              if (e.target.value !== "CUSTOM") setDraft(preset(e.target.value));
            }}
          >
            <option value="LAST30">{appText("Last 30 calendar days")}</option>
            <option value="MONTH">{appText("Current calendar month")}</option>
            <option value="PREVIOUS">
              {appText("Previous calendar month")}
            </option>
            <option value="CUSTOM">{appText("Custom dates")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="report-from">{appText("Report from (IST)")}</label>
          <Input
            id="report-from"
            type="date"
            value={draft.from}
            onChange={(e) => {
              setChoice("CUSTOM");
              setDraft({ ...draft, from: e.target.value });
            }}
          />
        </div>
        <div>
          <label htmlFor="report-through">
            {appText("Report through (IST)")}
          </label>
          <Input
            id="report-through"
            type="date"
            value={draft.to}
            onChange={(e) => {
              setChoice("CUSTOM");
              setDraft({ ...draft, to: e.target.value });
            }}
          />
        </div>
        <Button type="submit">{appText("Apply report dates")}</Button>
      </form>
      {error && <Notice error>{appError(error)}</Notice>}
      <p>
        {appText("Applied dates:")} {range.from} {appText("through")} {range.to}{" "}
        {appText("IST.")}{" "}
      </p>
    </section>
  );
}
function ServiceReport({
  session,
  range,
  region,
  setRegion,
}: {
  session: Session;
  range: Range;
  region: string;
  setRegion: (region: string) => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const choices = useQuery({
    queryKey: ["report-regions", session.account.id],
    queryFn: ({ signal }) =>
      api<components["schemas"]["ReportRegions"]>("/admin/reports/regions", {
        signal,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const report = useQuery({
    queryKey: ["service-report", session.account.id, range, region],
    queryFn: ({ signal }) => {
      const query = params(range);
      if (region) query.set("region", region);
      return api<Funnel>("/admin/reports/funnel?" + query, { signal });
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = report.data;
  return (
    <>
      <section className="care-card">
        <h3>{appText("Request cohorts by search path")}</h3>
        <p>
          {appText(
            "The date range selects when tuition requests were created. Milestones reflect current recorded evidence as of the report timestamp, even if it arrived later. Each request counts once per milestone; the bars do not imply an ordered or completed service.",
          )}{" "}
        </p>
        {choices.isPending && (
          <p role="status">{appText("Loading reporting regions…")}</p>
        )}
        {choices.error && (
          <Notice error>
            {appText("Region choices unavailable.")}{" "}
            <Button variant="outline" onClick={() => choices.refetch()}>
              {appText("Retry reporting regions")}{" "}
            </Button>
          </Notice>
        )}
        {choices.data &&
          (session.account.role === "ADMIN" ? (
            <div className="reports-region">
              <label htmlFor="report-region">{appText("Request region")}</label>
              <select
                id="report-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">{appText("All regions")}</option>
                {choices.data.items.map((r) => (
                  <option key={r.region} value={r.region}>
                    {r.region}
                  </option>
                ))}
              </select>
              {choices.data.limited && (
                <small>
                  {appText(
                    "First 100 region choices; All regions includes the full reporting scope.",
                  )}{" "}
                </small>
              )}
            </div>
          ) : (
            <p>
              {appText("Assigned reporting region:")}{" "}
              {choices.data.items[0]?.region}
              {appText(". Requests outside this region are excluded.")}{" "}
            </p>
          ))}
        {report.isPending && (
          <p role="status">{appText("Loading request cohorts…")}</p>
        )}
        {report.error && (
          <Notice error>
            {appText("Request cohort report unavailable.")}{" "}
            <Button variant="outline" onClick={() => report.refetch()}>
              {appText("Retry request cohorts")}{" "}
            </Button>
          </Notice>
        )}
        {data && !report.error && (
          <>
            <p>
              {appText("Shown scope:")} {data.region || appText("All regions")}
              {appText(". Cohort interval:")}{" "}
              {when(data.window.from, appLocale)}–
              {when(data.window.to, appLocale)}{" "}
              {appText("IST (end excluded). Outcomes recorded as of")}{" "}
              {when(data.asOf, appLocale)} {appText("IST.")}{" "}
            </p>
            {data.items.length ? (
              <>
                <ChartContainer
                  config={{
                    manual: { label: "Manual search" },
                    assisted: { label: "Let us search for you" },
                  }}
                  aria-label={appText(
                    "Recorded request milestones by search path",
                  )}
                >
                  <BarChart
                    data={stages.map(([key, stage]) => ({
                      stage: appText(stage),
                      manual:
                        data.items.find(
                          (r) => r.discoveryMethod === "MANUAL",
                        )?.[key] ?? null,
                      assisted:
                        data.items.find(
                          (r) => r.discoveryMethod === "ASSISTED",
                        )?.[key] ?? null,
                    }))}
                    layout="vertical"
                    accessibilityLayer
                    margin={{ left: 0, right: 20 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="stage"
                      width={130}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend
                      formatter={(value) => (
                        <span className="reports-legend-label">{value}</span>
                      )}
                    />
                    <Bar
                      dataKey="manual"
                      name={appText("Manual search")}
                      fill="var(--primary)"
                      maxBarSize={20}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="assisted"
                      name={appText("Let us search for you")}
                      fill="var(--green)"
                      stroke="var(--primary)"
                      maxBarSize={20}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ChartContainer>
                <div className="reports-tables">
                  {(["MANUAL", "ASSISTED"] as const).map((method) => {
                    const row = data.items.find(
                      (r) => r.discoveryMethod === method,
                    );
                    return (
                      <section key={method}>
                        <h4>{appText(names[method])}</h4>
                        {row ? (
                          <>
                            <p>
                              {row.requests}{" "}
                              {appText(
                                "requests form this path's denominator.",
                              )}{" "}
                            </p>
                            <table>
                              <caption>
                                {appText(names[method])}{" "}
                                {appText("recorded milestones")}{" "}
                              </caption>
                              <thead>
                                <tr>
                                  <th scope="col">{appText("Milestone")}</th>
                                  <th scope="col">{appText("Requests")}</th>
                                  <th scope="col">{appText("Of cohort")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {stages.map(([key, name]) => (
                                  <tr key={key}>
                                    <th scope="row">{appText(name)}</th>
                                    <td>
                                      {row[key]} / {row.requests}
                                    </td>
                                    <td>
                                      {percent(
                                        row[key],
                                        row.requests,
                                        appLocale,
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p>
                              {appText("Recorded start conversion:")}{" "}
                              {row.conversion.numerator} /{" "}
                              {row.conversion.denominator} (
                              {percent(
                                row.conversion.numerator,
                                row.conversion.denominator,
                                appLocale,
                              )}
                              ).
                            </p>
                          </>
                        ) : (
                          <p>
                            {appText(
                              "No request cohort for this path in the selected dates and region.",
                            )}{" "}
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
              </>
            ) : (
              <p>
                {appText(
                  "No requests were recorded in this cohort. Conversion is not estimable.",
                )}{" "}
              </p>
            )}
          </>
        )}
        {data && !report.error && (
          <div className="care-actions">
            <RefreshButton
              variant="outline"
              disabled={report.isFetching}
              onClick={() => report.refetch()}
             label={appText("Refresh request cohorts")} />
          </div>
        )}
      </section>
      {data && !report.error && (
        <section className="care-card">
          <h3>{appText("Day-30 continuation evidence")}</h3>
          <p>
            {appText(
              "Only starts at least 30 days old and qualified observations contribute to the known-outcome rate. Unknown, missing and immature records stay visible; no response is not a failed outcome. This is continuation evidence, not a learning-improvement score.",
            )}{" "}
          </p>
          <ContinuationSummary
            metrics={data.continuation}
            title={appText("All search paths")}
          />
          {data.continuationByMethod.length > 0 && (
            <div className="reports-tables">
              {data.continuationByMethod.map((c) => (
                <ContinuationSummary
                  key={c.discoveryMethod}
                  metrics={c}
                  title={appText(names[c.discoveryMethod])}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
function ContinuationSummary({
  metrics: c,
  title,
}: {
  metrics: Continuation;
  title: string;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  return (
    <section className="reports-continuation">
      <h4>{appText(title)}</h4>
      <p className="reports-rate">
        {c.rate === null
          ? appText("Not estimable")
          : percent(c.continued, c.denominator, appLocale)}
      </p>
      <p>
        {c.continued} {appText("continued /")} {c.denominator}{" "}
        {appText("known mature outcomes. Observation coverage:")} {c.observed} /{" "}
        {c.mature} {appText("mature starts (")}
        {percent(c.observed, c.mature, appLocale)}).
      </p>
      <dl>
        <div>
          <dt>{appText("Known continued")}</dt>
          <dd>{c.continued}</dd>
        </div>
        <div>
          <dt>{appText("Known stopped")}</dt>
          <dd>{c.stopped}</dd>
        </div>
        <div>
          <dt>{appText("Unknown outcome")}</dt>
          <dd>{c.unknown}</dd>
        </div>
        <div>
          <dt>{appText("Missing qualified observation")}</dt>
          <dd>{c.missingObservation}</dd>
        </div>
        <div>
          <dt>{appText("Not yet mature")}</dt>
          <dd>{c.immature}</dd>
        </div>
        <div>
          <dt>{appText("Placement missing start evidence")}</dt>
          <dd>{c.missingStartEvidence}</dd>
        </div>
      </dl>
    </section>
  );
}
function FinanceReport({ session, range }: { session: Session; range: Range }) {
  const { appText, appError, appLocale } = useAppTranslation();

  const query = useQuery({
    queryKey: ["financial-report", session.account.id, range],
    queryFn: ({ signal }) =>
      api<Finance>("/admin/reports/finance?" + params(range), { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const modeName = (mode: string) =>
    mode === "LIVE"
      ? "Live mode"
      : mode === "SANDBOX"
        ? "Sandbox mode"
        : "Mode unrecorded";
  return (
    <>
      <section className="care-card">
        <h3>{appText("Recorded captures by provider mode")}</h3>
        <p>
          {appText(
            "Global finance scope. Captures are local payment records, not verified bank settlement. Sandbox records and unrecorded modes are shown separately.",
          )}{" "}
        </p>
        {query.isPending && (
          <p role="status">{appText("Loading financial report…")}</p>
        )}
        {query.error && (
          <Notice error>
            {appText("Financial report unavailable.")}{" "}
            <Button variant="outline" onClick={() => query.refetch()}>
              {appText("Retry financial report")}{" "}
            </Button>
          </Notice>
        )}
        {data && !query.error && (
          <>
            <p>
              {appText("Record-creation interval:")}{" "}
              {when(data.window.from, appLocale)}–
              {when(data.window.to, appLocale)}{" "}
              {appText("IST (end excluded). Snapshot")}{" "}
              {when(data.asOf, appLocale)} {appText("IST.")}{" "}
            </p>
            <p className="reports-rate">
              {money(data.captured.amountPaise, appLocale)}
            </p>
            <p>
              {data.captured.count}{" "}
              {appText("recorded captures · settlement unverified.")}{" "}
            </p>
            {!data.captureModes ? (
              <Notice error>
                {appText(
                  "Provider-mode classification is unavailable. Refresh the report before comparing live and sandbox captures.",
                )}{" "}
              </Notice>
            ) : !data.captureModes.length ? (
              <p>
                {appText(
                  "No captures in this period; no provider-mode comparison is available.",
                )}{" "}
              </p>
            ) : (
              <>
                <ChartContainer
                  config={{ amountPaise: { label: "Recorded capture amount" } }}
                  aria-label={appText(
                    "Recorded capture amounts by provider mode",
                  )}
                >
                  <BarChart
                    data={data.captureModes.map((m) => ({
                      ...m,
                      mode: appText(modeName(m.providerMode)),
                    }))}
                    layout="vertical"
                    accessibilityLayer
                    margin={{ right: 20 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => money(value, appLocale)}
                    />
                    <YAxis
                      type="category"
                      dataKey="mode"
                      width={110}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          valueFormatter={(value) => money(value, appLocale)}
                        />
                      }
                    />
                    <Bar
                      dataKey="amountPaise"
                      name={appText("Recorded amount")}
                      maxBarSize={38}
                      isAnimationActive={false}
                    >
                      {data.captureModes.map((m) => (
                        <Cell
                          key={m.providerMode}
                          fill={
                            m.providerMode === "LIVE"
                              ? "var(--primary)"
                              : m.providerMode === "SANDBOX"
                                ? "var(--green)"
                                : "var(--paper)"
                          }
                          stroke="var(--primary)"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
                <table>
                  <caption>{appText("Provider-mode capture records")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{appText("Recorded mode")}</th>
                      <th scope="col">{appText("Records")}</th>
                      <th scope="col">{appText("Amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.captureModes.map((m) => (
                      <tr key={m.providerMode}>
                        <th scope="row">{appText(modeName(m.providerMode))}</th>
                        <td>{m.count}</td>
                        <td>{money(m.amountPaise, appLocale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </section>
      {data && !query.error && (
        <section className="care-card">
          <h3>{appText("Separate financial obligations")}</h3>
          <p>
            {appText(
              "Refund requests and teacher payables use their creation dates in this period. Invoice dues are current across all dates. These independent measures must not be added or subtracted to calculate a cash balance.",
            )}{" "}
          </p>
          <dl className="reports-obligations">
            <div>
              <dt>{appText("Pending refund requests")}</dt>
              <dd>{money(data.pendingRefunds.amountPaise, appLocale)}</dd>
              <dd className="reports-detail">
                <small>
                  {data.pendingRefunds.count}{" "}
                  {appText("requests · refund settlement unverified")}{" "}
                </small>
              </dd>
            </div>
            <div>
              <dt>{appText("Outstanding platform invoices")}</dt>
              <dd>{money(data.outstandingInvoices.amountPaise, appLocale)}</dd>
              <dd className="reports-detail">
                <small>
                  {data.outstandingInvoices.count}{" "}
                  {appText("invoices · current across all dates")}{" "}
                </small>
              </dd>
            </div>
          </dl>
          <h4>{appText("Teacher payable obligations")}</h4>
          {data.teacherPayables.length ? (
            <table>
              <caption>
                {appText(
                  "Payables created in this period; payout settlement unverified",
                )}{" "}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{appText("Recorded status")}</th>
                  <th scope="col">{appText("Records")}</th>
                  <th scope="col">{appText("Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.teacherPayables.map((p) => (
                  <tr key={p.status}>
                    <th scope="row">{appText(label(p.status))}</th>
                    <td>{p.count}</td>
                    <td>{money(p.amountPaise, appLocale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>
              {appText(
                "No teacher payable records were created in this period.",
              )}
            </p>
          )}
          <div className="care-actions">
            <RefreshButton
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
             label={appText("Refresh financial report")} />
            <Link href="/dashboard/finance">
              {appText("Inspect invoices, captures and obligations")}{" "}
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
