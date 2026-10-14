"use client";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import { Landmark } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Notice, useDecision } from "./tuition-workflow";
type Record = components["schemas"]["FinanceRecord"];
type Kind = Record["kind"];
type Report = components["schemas"]["FinanceReport"];
type Order = components["schemas"]["CheckoutOrder"];
type Result = components["schemas"]["Reconciliation"];
const kinds: Kind[] = [
  "INVOICES",
  "CHECKOUTS",
  "PAYMENTS",
  "REFUNDS",
  "PAYABLES",
];
const names = {
  INVOICES: "Invoices",
  CHECKOUTS: "Checkout orders",
  PAYMENTS: "Captured payments",
  REFUNDS: "Refund requests",
  PAYABLES: "Teacher payables",
};
const statuses: { [K in Kind]: string[] } = {
  INVOICES: ["DUE", "PAID"],
  CHECKOUTS: ["CREATING", "CREATED", "PAID", "FAILED", "REVIEW_REQUIRED"],
  PAYMENTS: ["CAPTURED"],
  REFUNDS: ["PENDING"],
  PAYABLES: [
    "HELD_SERVICE",
    "HELD_CONFIRMATION",
    "HELD_DISPUTE",
    "ELIGIBLE",
    "REFUND_PENDING",
    "REVIEW_REQUIRED",
  ],
};
const label = (s: string) => s.toLowerCase().replaceAll("_", " ");
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n / 100);
const when = (s: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(s));
const day = (offset = 0) =>
  new Date(Date.now() + offset * 86400000 + 330 * 60000)
    .toISOString()
    .slice(0, 10);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function FinanceWorkspace({ session }: { session: Session }) {
  if (!["ADMIN", "FINANCE"].includes(session.account.role))
    return (
      <Notice error>Finance access is required to view these records.</Notice>
    );
  return <Finance session={session} />;
}
function Finance({ session }: { session: Session }) {
  const [kind, setKind] = useState<Kind>("INVOICES"),
    [status, setStatus] = useState(""),
    [id, setId] = useState(""),
    [filterId, setFilterId] = useState(""),
    [selected, setSelected] = useState<Record | null>(null),
    [locked, setLocked] = useState(false),
    [error, setError] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["finance-records", session.account.id, kind, status, filterId],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["FinanceRecordList"]>(
        `/admin/finance/records?${new URLSearchParams({ kind, limit: "20", ...(status ? { status } : {}), ...(filterId ? { id: filterId } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const q = await list.refetch();
    if (q.error) throw q.error;
  }
  const rows = list.data?.pages.flatMap((p) => p.items) || [];
  return (
    <div className="care-workspace finance-workspace">
      <section className="care-intro">
        <Landmark size={28} aria-hidden="true" />
        <h2>Every amount, with its evidence.</h2>
        <p>
          Review recorded invoices, captures and obligations. Query a checkout's
          provider status without treating it as settlement or changing its
          payment state.
        </p>
      </section>
      <Notice>
        Development finance workspace. Captured funds, pending refunds and
        eligible teacher payables are separate records. Provider settlement is
        unverified; refund and payout execution remain pending.
      </Notice>
      <FinanceSummary session={session} locked={locked} />
      <section className="care-card">
        <h3>Financial records</h3>
        <p>
          ADMIN and FINANCE have audited global finance access. This queue uses
          stable record-ID order, not chronological order; dates are shown only
          when recorded.
        </p>
        <form
          className="care-fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (locked) return;
            if (id.trim() && !uuid.test(id.trim())) {
              setError("Enter a complete record UUID or leave it blank.");
              return;
            }
            setError("");
            setFilterId(id.trim());
            setSelected(null);
          }}
        >
          <div>
            <label htmlFor="finance-kind">Record type</label>
            <select
              id="finance-kind"
              value={kind}
              disabled={locked}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                setStatus("");
                setId("");
                setFilterId("");
                setSelected(null);
                setError("");
              }}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {names[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="finance-status">Recorded status</label>
            <select
              id="finance-status"
              value={status}
              disabled={locked}
              onChange={(e) => {
                setStatus(e.target.value);
                setSelected(null);
              }}
            >
              {<option value="">All statuses</option>}
              {statuses[kind].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="finance-id">Exact record ID (optional)</label>
            <Input
              id="finance-id"
              value={id}
              disabled={locked}
              onChange={(e) => setId(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={locked}>
            Apply record ID
          </Button>
        </form>
        {error && <Notice error>{error}</Notice>}
        {list.isPending && <p role="status">Loading financial records…</p>}
        {list.error && (
          <Notice error>
            Financial records could not be loaded.{" "}
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => list.refetch()}
            >
              Retry financial records
            </Button>
          </Notice>
        )}
        {!list.isPending && !list.error && !rows.length && (
          <p>No records match these filters.</p>
        )}
        <div className="finance-ledger">
          {rows.map((row) => (
            <article key={row.id}>
              <div>
                <span className="care-status">{label(row.status)}</span>
                <h4>
                  {money(row.amountPaise)} <small>{row.currency}</small>
                </h4>
                <p>
                  {names[row.kind]} · {row.id}
                </p>
                <p>
                  {row.providerMode === "SANDBOX"
                    ? "Local sandbox evidence"
                    : row.providerMode === "LIVE"
                      ? "Live provider mode; settlement unverified"
                      : "Provider mode not recorded"}
                </p>
              </div>
              <div>
                <p>
                  {row.createdAt
                    ? when(row.createdAt) + " IST"
                    : "Creation date not recorded"}
                </p>
                <Button
                  variant="outline"
                  disabled={locked || !!list.error}
                  aria-pressed={selected?.id === row.id}
                  onClick={() => setSelected(row)}
                >
                  Inspect record {row.id.slice(0, 8)}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <div className="care-actions">
          {list.hasNextPage && (
            <Button
              variant="outline"
              disabled={locked || list.isFetching}
              onClick={() => list.fetchNextPage()}
            >
              Load more financial records
            </Button>
          )}
          <Button
            variant="outline"
            disabled={locked || list.isFetching}
            onClick={() => list.refetch()}
          >
            Refresh financial records
          </Button>
        </div>
      </section>
      {selected && (
        <FinanceRecord
          key={selected.id}
          record={rows.find((r) => r.id === selected.id) || selected}
          session={session}
          refreshList={refresh}
          onLock={setLocked}
          onClose={() => setSelected(null)}
        />
      )}
      <small className="care-help">
        Queues page 20 records at a time. Eligible payables are obligations, not
        payouts. Pending refunds have no provider settlement evidence. Periodic
        provider reconciliation, refunds, payouts and immutable adjustments
        remain tracked separately.
      </small>
    </div>
  );
}
function FinanceSummary({
  session,
  locked,
}: {
  session: Session;
  locked: boolean;
}) {
  const [draft, setDraft] = useState({ from: day(-30), to: day() }),
    [range, setRange] = useState(draft),
    [error, setError] = useState("");
  const report = useQuery({
    queryKey: ["finance-report", session.account.id, range],
    queryFn: ({ signal }) =>
      api<Report>(
        `/admin/reports/finance?${new URLSearchParams({ from: range.from + "T00:00:00+05:30", to: new Date(Date.parse(range.to + "T00:00:00+05:30") + 86400000).toISOString() })}`,
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <section className="care-card">
      <h3>Recorded amounts and obligations</h3>
      <p>
        Capture, refund-request and payable totals use the date range below.
        Outstanding invoices are current across all dates. Local sandbox
        captures may be included; these totals are not bank settlement.
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
          <label htmlFor="finance-from">Recorded from (IST)</label>
          <Input
            id="finance-from"
            type="date"
            value={draft.from}
            disabled={locked}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="finance-to">Recorded through (IST)</label>
          <Input
            id="finance-to"
            type="date"
            value={draft.to}
            disabled={locked}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={locked}>
          Apply report dates
        </Button>
      </form>
      {error && <Notice error>{error}</Notice>}
      {report.isPending && <p role="status">Loading recorded totals…</p>}
      {report.error && (
        <Notice error>
          Recorded totals could not be loaded.{" "}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => report.refetch()}
          >
            Retry finance totals
          </Button>
        </Notice>
      )}
      {report.data && !report.error && (
        <>
          <p>
            Shown range: {when(report.data.window.from)}–
            {when(report.data.window.to)} IST (end excluded). Recorded as of{" "}
            {when(report.data.asOf)} IST.
          </p>
          <dl className="finance-amounts">
            <div>
              <dt>Recorded captures</dt>
              <dd>{money(report.data.captured.amountPaise)}</dd>
              <dd>
                <small>
                  {report.data.captured.count} payment records · settlement
                  unverified
                </small>
              </dd>
            </div>
            <div>
              <dt>Pending refund requests</dt>
              <dd>{money(report.data.pendingRefunds.amountPaise)}</dd>
              <dd>
                <small>
                  {report.data.pendingRefunds.count} requests · not refunded
                </small>
              </dd>
            </div>
            <div>
              <dt>Outstanding invoices</dt>
              <dd>{money(report.data.outstandingInvoices.amountPaise)}</dd>
              <dd>
                <small>
                  {report.data.outstandingInvoices.count} invoices · current
                  across all dates
                </small>
              </dd>
            </div>
          </dl>
          <h4>Teacher obligations by recorded status</h4>
          {report.data.teacherPayables.length ? (
            <ul>
              {report.data.teacherPayables.map((p) => (
                <li key={p.status}>
                  {label(p.status)}: {money(p.amountPaise)} · {p.count} records
                  · not paid out
                </li>
              ))}
            </ul>
          ) : (
            <p>No teacher payable records in this range.</p>
          )}
        </>
      )}
    </section>
  );
}
function FinanceRecord({
  record,
  session,
  refreshList,
  onLock,
  onClose,
}: {
  record: Record;
  session: Session;
  refreshList: () => Promise<void>;
  onLock: (v: boolean) => void;
  onClose: () => void;
}) {
  const [review, setReview] = useState(false),
    [reason, setReason] = useState(""),
    [agreed, setAgreed] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    sending = useRef(false);
  const order = useQuery({
    queryKey: ["finance-order", session.account.id, record.checkoutOrderId],
    queryFn: ({ signal }) =>
      api<Order>(`/checkout-orders/${record.checkoutOrderId}`, { signal }),
    enabled: !!record.checkoutOrderId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const q = await order.refetch();
    if (q.error) throw q.error;
    await refreshList();
  }
  const decision = useDecision(
    session,
    refresh,
    (r) =>
      !!r &&
      typeof r === "object" &&
      "order" in r &&
      "status" in r &&
      !!r.order &&
      typeof r.order === "object" &&
      "id" in r.order &&
      r.order.id === record.checkoutOrderId &&
      typeof r.status === "string",
  );
  const locked = review || !!reason || decision.locked;
  useEffect(() => {
    onLock(locked);
    return () => onLock(false);
  }, [locked, onLock]);
  async function save() {
    if (decision.locked || sending.current || !order.data || order.error)
      return;
    if (!agreed || !reason.trim() || reason.trim().length > 500) {
      decision.invalid(
        "Acknowledge the provider-query limits and add a reason of up to 500 characters.",
      );
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        path: `/admin/checkout-orders/${order.data.id}/reconciliations`,
        body: { expectedVersion: order.data.version, reason: reason.trim() },
        message:
          "Provider query recorded. Review its reported status below; no settlement or payment-state change is confirmed.",
        onSaved: (value) => {
          setResult(value as Result);
          setReview(false);
          setAgreed(false);
          setReason("");
        },
      });
    } finally {
      sending.current = false;
    }
  }
  return (
    <section className="care-card care-editor">
      <h3>Inspect financial record</h3>
      <span className="care-status">
        {names[record.kind]} · {label(record.status)}
      </span>
      <dl className="finance-detail">
        <dt>Record ID</dt>
        <dd>{record.id}</dd>
        <dt>Recorded amount</dt>
        <dd>{money(record.amountPaise)}</dd>
        <dt>Linked reference ID</dt>
        <dd>{record.referenceId || "No linked reference"}</dd>
        <dt>Policy version</dt>
        <dd>{record.policyVersion || "Not recorded"}</dd>
        <dt>Recorded eligibility date</dt>
        <dd>
          {record.eligibleAt
            ? when(record.eligibleAt) + " IST; payout unverified"
            : "No eligibility date recorded"}
        </dd>
      </dl>
      {record.reason && <p>Recorded reason: {record.reason}</p>}
      {record.checkoutOrderId ? (
        <>
          <h4>Linked checkout</h4>
          <p>{record.checkoutOrderId}</p>
          {order.isPending && <p role="status">Loading current checkout…</p>}
          {order.error && (
            <Notice error>
              Current checkout is unavailable.{" "}
              <Button
                variant="outline"
                disabled={decision.locked}
                onClick={() => order.refetch()}
              >
                Retry current checkout
              </Button>
            </Notice>
          )}
          {order.data && !order.error && (
            <>
              <p>
                Current local order: {label(order.data.status)} · Version{" "}
                {order.data.version} · {money(order.data.amountPaise)}
              </p>
              <p>
                {order.data.providerMode === "SANDBOX"
                  ? "Sandbox query returns local evidence only and never contacts Razorpay."
                  : "This queries Razorpay order status. Signed capture processing remains separate; a paid provider status does not repair or settle the local order."}
              </p>
              {order.data.providerMode === "LIVE" &&
                !order.data.providerOrderId && (
                  <Notice error>
                    No provider order ID is recorded. Provider-attempt recovery
                    is required before a provider query.
                  </Notice>
                )}
              {!review && (
                <div className="care-fields">
                  <div>
                    <label htmlFor="reconcile-reason">
                      Reason for provider query
                    </label>
                    <Input
                      id="reconcile-reason"
                      value={reason}
                      maxLength={500}
                      disabled={decision.locked}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                  <Button
                    disabled={
                      decision.locked ||
                      (order.data.providerMode === "LIVE" &&
                        !order.data.providerOrderId)
                    }
                    onClick={() => {
                      if (!reason.trim()) {
                        decision.invalid(
                          "Add a reason before reviewing the provider query.",
                        );
                        return;
                      }
                      setReview(true);
                      setAgreed(false);
                      setResult(null);
                    }}
                  >
                    Review provider query
                  </Button>
                </div>
              )}
              {review && (
                <>
                  <div className="care-review">
                    <p>
                      Checkout {order.data.id} · Version {order.data.version}
                    </p>
                    <p>{reason}</p>
                    <p>
                      Query{" "}
                      {order.data.providerMode === "SANDBOX"
                        ? "local sandbox"
                        : "provider"}{" "}
                      status. This records an audited query; it does not settle
                      funds, execute a refund/payout, or change the local
                      captured state.
                    </p>
                    <label className="care-check">
                      <input
                        type="checkbox"
                        checked={agreed}
                        disabled={decision.locked}
                        onChange={(e) => setAgreed(e.target.checked)}
                      />
                      I reviewed this order and understand that the query does
                      not establish settlement.
                    </label>
                  </div>
                  <div className="care-actions">
                    <Button
                      variant="outline"
                      disabled={decision.locked}
                      onClick={() => {
                        setReview(false);
                        setAgreed(false);
                      }}
                    >
                      Back to query reason
                    </Button>
                    <Button
                      disabled={decision.locked || !agreed}
                      onClick={save}
                    >
                      Confirm provider query
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <p>
          No checkout is linked to this record. Provider query is unavailable.
        </p>
      )}
      {decision.error && <Notice error>{decision.error}</Notice>}
      {decision.success && <Notice>{decision.success}</Notice>}
      {decision.uncertain && (
        <Button disabled={decision.busy} onClick={() => decision.run()}>
          Retry identical provider query
        </Button>
      )}
      {decision.conflict && (
        <Button
          disabled={decision.busy}
          onClick={async () => {
            await decision.reload();
            setReview(false);
            setAgreed(false);
          }}
        >
          Refresh for renewed review
        </Button>
      )}
      {result && (
        <Notice>
          Recorded query result:{" "}
          {result.status === "LOCAL_SANDBOX_ONLY"
            ? "Local sandbox only"
            : result.status}
          . Local checkout status returned: {label(result.order.status)}.
          Provider settlement remains unverified.
        </Notice>
      )}
      <div className="care-actions">
        {!!reason && (
          <Button
            variant="outline"
            disabled={decision.locked}
            onClick={() => {
              setReason("");
              setReview(false);
              setAgreed(false);
            }}
          >
            Discard query draft
          </Button>
        )}
        <Button variant="outline" disabled={locked} onClick={onClose}>
          Close record inspection
        </Button>
      </div>
    </section>
  );
}
