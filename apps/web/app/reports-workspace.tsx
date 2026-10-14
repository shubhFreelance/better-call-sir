"use client";
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
const when = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
const percent = (n: number, d: number) =>
  d
    ? new Intl.NumberFormat("en-IN", {
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
  if (!["ADMIN", "OPERATOR", "FINANCE"].includes(session.account.role))
    return (
      <Notice error>
        Staff reporting access is required to view these reports.
      </Notice>
    );
  return <Reports session={session} />;
}
function Reports({ session }: { session: Session }) {
  const [tab, setTab] = useState(
      session.account.role === "FINANCE" ? "finance" : "service",
    ),
    [range, setRange] = useState<Range>(() => preset("LAST30")),
    [region, setRegion] = useState("");
  return (
    <div className="care-workspace reports-workspace">
      <section className="care-intro">
        <ChartNoAxesCombined size={28} aria-hidden="true" />
        <h2>Follow the recorded journey.</h2>
        <p>
          Compare search paths with their real denominators. Keep unknown
          outcomes visible and financial obligations separate from settlement.
        </p>
      </section>
      <Period range={range} setRange={setRange} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="care-tabs" aria-label="Reporting views">
          {session.account.role !== "FINANCE" && (
            <TabsTrigger value="service">Search & continuation</TabsTrigger>
          )}
          {session.account.role !== "OPERATOR" && (
            <TabsTrigger value="finance">Capture & obligations</TabsTrigger>
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
        Reports use recorded development data and may include synthetic
        fixtures. These observations do not establish learning improvement,
        provider settlement or live pilot qualification.
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
  const [choice, setChoice] = useState("LAST30"),
    [draft, setDraft] = useState(range),
    [error, setError] = useState("");
  return (
    <section className="care-card reports-period">
      <h3>Choose the reporting dates</h3>
      <p>
        Dates use IST. Apply a preset or custom range to update the reports;
        draft dates do not change the displayed results.
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
          <label htmlFor="report-preset">Date preset</label>
          <select
            id="report-preset"
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              if (e.target.value !== "CUSTOM") setDraft(preset(e.target.value));
            }}
          >
            <option value="LAST30">Last 30 calendar days</option>
            <option value="MONTH">Current calendar month</option>
            <option value="PREVIOUS">Previous calendar month</option>
            <option value="CUSTOM">Custom dates</option>
          </select>
        </div>
        <div>
          <label htmlFor="report-from">Report from (IST)</label>
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
          <label htmlFor="report-through">Report through (IST)</label>
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
        <Button type="submit">Apply report dates</Button>
      </form>
      {error && <Notice error>{error}</Notice>}
      <p>
        Applied dates: {range.from} through {range.to} IST.
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
        <h3>Request cohorts by search path</h3>
        <p>
          The date range selects when tuition requests were created. Milestones
          reflect current recorded evidence as of the report timestamp, even if
          it arrived later. Each request counts once per milestone; the bars do
          not imply an ordered or completed service.
        </p>
        {choices.isPending && <p role="status">Loading reporting regions…</p>}
        {choices.error && (
          <Notice error>
            Region choices unavailable.{" "}
            <Button variant="outline" onClick={() => choices.refetch()}>
              Retry reporting regions
            </Button>
          </Notice>
        )}
        {choices.data &&
          (session.account.role === "ADMIN" ? (
            <div className="reports-region">
              <label htmlFor="report-region">Request region</label>
              <select
                id="report-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">All regions</option>
                {choices.data.items.map((r) => (
                  <option key={r.region} value={r.region}>
                    {r.region}
                  </option>
                ))}
              </select>
              {choices.data.limited && (
                <small>
                  First 100 region choices; All regions includes the full
                  reporting scope.
                </small>
              )}
            </div>
          ) : (
            <p>
              Assigned reporting region: {choices.data.items[0]?.region}.
              Requests outside this region are excluded.
            </p>
          ))}
        {report.isPending && <p role="status">Loading request cohorts…</p>}
        {report.error && (
          <Notice error>
            Request cohort report unavailable.{" "}
            <Button variant="outline" onClick={() => report.refetch()}>
              Retry request cohorts
            </Button>
          </Notice>
        )}
        {data && !report.error && (
          <>
            <p>
              Shown scope: {data.region || "All regions"}. Cohort interval:{" "}
              {when(data.window.from)}–{when(data.window.to)} IST (end
              excluded). Outcomes recorded as of {when(data.asOf)} IST.
            </p>
            {data.items.length ? (
              <>
                <ChartContainer
                  config={{
                    manual: { label: "Manual search" },
                    assisted: { label: "Let us search for you" },
                  }}
                  aria-label="Recorded request milestones by search path"
                >
                  <BarChart
                    data={stages.map(([key, stage]) => ({
                      stage,
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
                      name="Manual search"
                      fill="var(--primary)"
                      maxBarSize={20}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="assisted"
                      name="Let us search for you"
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
                        <h4>{names[method]}</h4>
                        {row ? (
                          <>
                            <p>
                              {row.requests} requests form this path's
                              denominator.
                            </p>
                            <table>
                              <caption>
                                {names[method]} recorded milestones
                              </caption>
                              <thead>
                                <tr>
                                  <th scope="col">Milestone</th>
                                  <th scope="col">Requests</th>
                                  <th scope="col">Of cohort</th>
                                </tr>
                              </thead>
                              <tbody>
                                {stages.map(([key, name]) => (
                                  <tr key={key}>
                                    <th scope="row">{name}</th>
                                    <td>
                                      {row[key]} / {row.requests}
                                    </td>
                                    <td>{percent(row[key], row.requests)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p>
                              Recorded start conversion:{" "}
                              {row.conversion.numerator} /{" "}
                              {row.conversion.denominator} (
                              {percent(
                                row.conversion.numerator,
                                row.conversion.denominator,
                              )}
                              ).
                            </p>
                          </>
                        ) : (
                          <p>
                            No request cohort for this path in the selected
                            dates and region.
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
              </>
            ) : (
              <p>
                No requests were recorded in this cohort. Conversion is not
                estimable.
              </p>
            )}
          </>
        )}
        {data && !report.error && (
          <div className="care-actions">
            <Button
              variant="outline"
              disabled={report.isFetching}
              onClick={() => report.refetch()}
            >
              Refresh request cohorts
            </Button>
          </div>
        )}
      </section>
      {data && !report.error && (
        <section className="care-card">
          <h3>Day-30 continuation evidence</h3>
          <p>
            Only starts at least 30 days old and qualified observations
            contribute to the known-outcome rate. Unknown, missing and immature
            records stay visible; no response is not a failed outcome. This is
            continuation evidence, not a learning-improvement score.
          </p>
          <ContinuationSummary
            metrics={data.continuation}
            title="All search paths"
          />
          {data.continuationByMethod.length > 0 && (
            <div className="reports-tables">
              {data.continuationByMethod.map((c) => (
                <ContinuationSummary
                  key={c.discoveryMethod}
                  metrics={c}
                  title={names[c.discoveryMethod]}
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
  return (
    <section className="reports-continuation">
      <h4>{title}</h4>
      <p className="reports-rate">
        {c.rate === null
          ? "Not estimable"
          : percent(c.continued, c.denominator)}
      </p>
      <p>
        {c.continued} continued / {c.denominator} known mature outcomes.
        Observation coverage: {c.observed} / {c.mature} mature starts (
        {percent(c.observed, c.mature)}).
      </p>
      <dl>
        <div>
          <dt>Known continued</dt>
          <dd>{c.continued}</dd>
        </div>
        <div>
          <dt>Known stopped</dt>
          <dd>{c.stopped}</dd>
        </div>
        <div>
          <dt>Unknown outcome</dt>
          <dd>{c.unknown}</dd>
        </div>
        <div>
          <dt>Missing qualified observation</dt>
          <dd>{c.missingObservation}</dd>
        </div>
        <div>
          <dt>Not yet mature</dt>
          <dd>{c.immature}</dd>
        </div>
        <div>
          <dt>Placement missing start evidence</dt>
          <dd>{c.missingStartEvidence}</dd>
        </div>
      </dl>
    </section>
  );
}
function FinanceReport({ session, range }: { session: Session; range: Range }) {
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
        <h3>Recorded captures by provider mode</h3>
        <p>
          Global finance scope. Captures are local payment records, not verified
          bank settlement. Sandbox records and unrecorded modes are shown
          separately.
        </p>
        {query.isPending && <p role="status">Loading financial report…</p>}
        {query.error && (
          <Notice error>
            Financial report unavailable.{" "}
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry financial report
            </Button>
          </Notice>
        )}
        {data && !query.error && (
          <>
            <p>
              Record-creation interval: {when(data.window.from)}–
              {when(data.window.to)} IST (end excluded). Snapshot{" "}
              {when(data.asOf)} IST.
            </p>
            <p className="reports-rate">{money(data.captured.amountPaise)}</p>
            <p>
              {data.captured.count} recorded captures · settlement unverified.
            </p>
            {!data.captureModes ? (
              <Notice error>
                Provider-mode classification is unavailable. Refresh the report
                before comparing live and sandbox captures.
              </Notice>
            ) : !data.captureModes.length ? (
              <p>
                No captures in this period; no provider-mode comparison is
                available.
              </p>
            ) : (
              <>
                <ChartContainer
                  config={{ amountPaise: { label: "Recorded capture amount" } }}
                  aria-label="Recorded capture amounts by provider mode"
                >
                  <BarChart
                    data={data.captureModes.map((m) => ({
                      ...m,
                      mode: modeName(m.providerMode),
                    }))}
                    layout="vertical"
                    accessibilityLayer
                    margin={{ right: 20 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickFormatter={money} />
                    <YAxis
                      type="category"
                      dataKey="mode"
                      width={110}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent valueFormatter={money} />}
                    />
                    <Bar
                      dataKey="amountPaise"
                      name="Recorded amount"
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
                  <caption>Provider-mode capture records</caption>
                  <thead>
                    <tr>
                      <th scope="col">Recorded mode</th>
                      <th scope="col">Records</th>
                      <th scope="col">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.captureModes.map((m) => (
                      <tr key={m.providerMode}>
                        <th scope="row">{modeName(m.providerMode)}</th>
                        <td>{m.count}</td>
                        <td>{money(m.amountPaise)}</td>
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
          <h3>Separate financial obligations</h3>
          <p>
            Refund requests and teacher payables use their creation dates in
            this period. Invoice dues are current across all dates. These
            independent measures must not be added or subtracted to calculate a
            cash balance.
          </p>
          <dl className="reports-obligations">
            <div>
              <dt>Pending refund requests</dt>
              <dd>{money(data.pendingRefunds.amountPaise)}</dd>
              <dd className="reports-detail">
                <small>
                  {data.pendingRefunds.count} requests · refund settlement
                  unverified
                </small>
              </dd>
            </div>
            <div>
              <dt>Outstanding platform invoices</dt>
              <dd>{money(data.outstandingInvoices.amountPaise)}</dd>
              <dd className="reports-detail">
                <small>
                  {data.outstandingInvoices.count} invoices · current across all
                  dates
                </small>
              </dd>
            </div>
          </dl>
          <h4>Teacher payable obligations</h4>
          {data.teacherPayables.length ? (
            <table>
              <caption>
                Payables created in this period; payout settlement unverified
              </caption>
              <thead>
                <tr>
                  <th scope="col">Recorded status</th>
                  <th scope="col">Records</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.teacherPayables.map((p) => (
                  <tr key={p.status}>
                    <th scope="row">{label(p.status)}</th>
                    <td>{p.count}</td>
                    <td>{money(p.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No teacher payable records were created in this period.</p>
          )}
          <div className="care-actions">
            <Button
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              Refresh financial report
            </Button>
            <Link href="/dashboard/finance">
              Inspect invoices, captures and obligations
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
