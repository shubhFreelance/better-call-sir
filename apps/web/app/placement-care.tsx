"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  api,
  type Dashboard,
  type Session,
  type Placement,
  type components,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import { preferences, type Window } from "./guardian-onboarding";
type Request = components["schemas"]["TuitionRequest"];
const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
const labels: Record<string, string> = {
  ACTIVE: "Active",
  TERMS_PENDING: "Terms pending",
  CLOSED: "Closed",
  OPEN: "Open",
  PENDING: "Awaiting matching",
  NO_MATCH: "No match yet",
  PUBLISHED: "Shortlist published",
};
export function PlacementCare({
  session,
  dashboard: d,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const client = useQueryClient(),
    canUse = session.account.role === "GUARDIAN";
  const requests = useQuery({
    queryKey: ["care-requests", session.account.id],
    queryFn: ({ signal }) => api<{ items: Request[] }>("/requests", { signal }),
    enabled: canUse,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [selected, setSelected] = useState(d.placements?.[0]?.id || ""),
    [action, setAction] = useState<"close" | "replace" | "">(""),
    [reason, setReason] = useState(""),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    [criteria, setCriteria] = useState({
      subject: "Maths",
      mode: "ONLINE",
      language: "English",
      locality: "",
      budget: "",
    }),
    [windows, setWindows] = useState<Window[]>([{ start: "", duration: "60" }]),
    [result, setResult] = useState<{
      caseId: string;
      requestId?: string;
    } | null>(null);
  const sending = useRef(false),
    p = d.placements?.find((x) => x.id === selected) as
      | (Placement & { requestId: string })
      | undefined,
    source = requests.data?.items.find((r) => r.id === p?.requestId),
    replacement = requests.data?.items.find(
      (r) => r.rematchFromPlacementId === p?.id,
    );
  async function refresh() {
    const [next, rs] = await Promise.all([
      api<Dashboard>("/dashboard"),
      requests.refetch(),
    ]);
    if (rs.error) throw rs.error;
    client.setQueryData(["dashboard", session.account.id], next);
  }
  const decision = useDecision(
      session,
      refresh,
      (r) =>
        !!r &&
        typeof r === "object" &&
        "caseId" in r &&
        typeof r.caseId === "string" &&
        (("placement" in r &&
          !!r.placement &&
          typeof r.placement === "object" &&
          "id" in r.placement) ||
          ("request" in r &&
            !!r.request &&
            typeof r.request === "object" &&
            "id" in r.request)),
    ),
    locked = decision.locked || !!action,
    permitted =
      session.account.verified && !!d.consent && !d.consent.withdrawnAt;
  function begin(value: "close" | "replace") {
    if (!p || decision.locked || action) return;
    setAction(value);
    setReview(false);
    setAgreed(false);
    setResult(null);
    setReason("");
    setWindows([{ start: "", duration: "60" }]);
    if (source)
      setCriteria({
        subject: source.subject,
        mode: source.mode,
        language: source.language,
        locality: source.locality,
        budget: String(source.budgetPaise / 100),
      });
    decision.invalid("");
  }
  function payload() {
    if (!p || p.status === "CLOSED" || !permitted) {
      decision.invalid(
        "Refresh the arrangement and check current guardian consent before deciding.",
      );
      return null;
    }
    if (!reason.trim() || reason.trim().length > 1000) {
      decision.invalid("Explain the reason in 1–1,000 characters.");
      return null;
    }
    const base = { expectedVersion: p.version, reason: reason.trim() };
    if (action === "close") return base;
    const availability = preferences(windows),
      amount = Number(criteria.budget) * 100;
    if (
      !source ||
      !availability ||
      !/^\d+(\.\d{1,2})?$/.test(criteria.budget) ||
      !Number.isSafeInteger(Math.round(amount)) ||
      amount < 50000 ||
      amount > 2000000 ||
      !criteria.locality.trim() ||
      criteria.locality.trim().length > 80
    ) {
      decision.invalid(
        "Check the locality, ₹500–₹20,000 budget and 1–6 nonoverlapping IST windows, 20–120 minutes long, from one hour to 60 days ahead.",
      );
      return null;
    }
    return {
      ...base,
      preferences: availability,
      criteria: {
        ...criteria,
        locality: criteria.locality.trim(),
        budgetPaise: Math.round(amount),
        budget: undefined,
      },
    };
  }
  async function save() {
    if (!p || decision.locked || sending.current) return;
    const body = payload();
    if (!body || !agreed) {
      if (body) decision.invalid("Acknowledge the effects before confirming.");
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        path: `/placements/${p.id}/${action === "close" ? "closures" : "rematches"}`,
        body,
        message:
          action === "close"
            ? "The arrangement is closed. Past records remain available."
            : "The old arrangement is closed and your replacement request is recorded. A new teacher has not been assigned.",
        onSaved: (r) => {
          const saved = r as { caseId: string; request?: { id: string } };
          setResult({ caseId: saved.caseId, requestId: saved.request?.id });
          setAction("");
          setReason("");
          setReview(false);
          setAgreed(false);
        },
      });
    } finally {
      sending.current = false;
    }
  }
  if (!canUse)
    return (
      <Notice>
        These arrangement decisions belong to your guardian.{" "}
        <Link href="/dashboard">Return to your dashboard</Link>.
      </Notice>
    );
  return (
    <div className="care-workspace">
      <section className="care-intro">
        <RefreshCw aria-hidden="true" size={28} />
        <h2>When the fit needs to change.</h2>
        <p>
          Review your current arrangement, end future commitments or ask us to
          look for a replacement teacher. Support and replacement requests do
          not require Pro.
        </p>
      </section>
      <Feedback decision={decision} />
      {decision.conflict && (
        <Button
          variant="outline"
          disabled={decision.busy}
          onClick={() => {
            setReview(false);
            setAgreed(false);
            void decision.reload();
          }}
        >
          Refresh arrangement
        </Button>
      )}
      {!permitted && (
        <Notice>
          Current verified guardian consent is required for these decisions.{" "}
          <Link href="/support">
            Help and safety reporting remain available
          </Link>
          .
        </Notice>
      )}
      {requests.error && (
        <Notice error>
          Request criteria could not be loaded.{" "}
          <Button
            variant="outline"
            disabled={decision.uncertain}
            onClick={() => requests.refetch()}
          >
            Retry criteria
          </Button>
        </Notice>
      )}
      {!d.placements?.length ? (
        <section className="care-card">
          <h3>No tuition arrangements yet.</h3>
          <p>Your arrangements appear after tuition terms are opened.</p>
          <Link href="/dashboard/requests">Review your tuition requests</Link>
        </section>
      ) : (
        <>
          <div className="care-toolbar">
            <label htmlFor="care-placement">Tuition arrangement</label>
            <select
              id="care-placement"
              value={selected}
              disabled={locked}
              onChange={(e) => {
                setSelected(e.target.value);
                setResult(null);
                decision.invalid("");
              }}
            >
              {d.placements.map((x) => (
                <option key={x.id} value={x.id}>
                  {d.children?.find((c) => c.id === x.childId)?.alias ||
                    "Learner"}{" "}
                  —{" "}
                  {d.teachers?.find((t) => t.id === x.teacherId)?.name ||
                    `Teacher ${x.teacherId.slice(0, 8)}`}{" "}
                  — {labels[x.status] || x.status}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => decision.reload()}
            >
              Refresh arrangements
            </Button>
          </div>
          {p && (
            <section className="care-card">
              <header>
                <div>
                  <span className="care-status">
                    {labels[p.status] || p.status}
                  </span>
                  <h3>
                    {d.children?.find((c) => c.id === p.childId)?.alias ||
                      "Learner"}
                    ’s arrangement
                  </h3>
                  <p>
                    {d.teachers?.find((t) => t.id === p.teacherId)?.name ||
                      `Teacher ${p.teacherId.slice(0, 8)}`}{" "}
                    · {money(p.monthlyPaise)} monthly
                  </p>
                </div>
              </header>
              {source && (
                <p>
                  {source.subject} ·{" "}
                  {source.mode === "HOME" ? "At home" : "Online"} ·{" "}
                  {source.language} · {source.locality}
                </p>
              )}
              {p.status === "CLOSED" ? (
                <Notice>
                  This arrangement is closed.{" "}
                  {replacement ? (
                    <>
                      Replacement request:{" "}
                      {labels[replacement.status] || replacement.status};{" "}
                      {labels[replacement.matchStatus || ""] ||
                        replacement.matchStatus ||
                        "Matching status unavailable"}
                      .{" "}
                      <Link href="/dashboard/requests">
                        Review replacement progress
                      </Link>
                      .
                    </>
                  ) : (
                    "No linked replacement is shown in the latest request history."
                  )}{" "}
                  <Link href="/support">View support history</Link>.
                </Notice>
              ) : (
                !action && (
                  <div className="care-actions">
                    <Button
                      disabled={
                        !permitted ||
                        decision.locked ||
                        !source ||
                        !!requests.error
                      }
                      onClick={() => begin("replace")}
                    >
                      Request a replacement
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!permitted || decision.locked}
                      onClick={() => begin("close")}
                    >
                      Close arrangement
                    </Button>
                  </div>
                )
              )}
            </section>
          )}
          {result && (
            <Notice>
              <Link href={"/support?case=" + result.caseId}>
                Open the linked support case
              </Link>
              {result.requestId && (
                <>
                  {" "}
                  ·{" "}
                  <Link href="/dashboard/requests">
                    Review your replacement request
                  </Link>
                </>
              )}
              . A recorded request does not confirm a refund or a new teacher.
            </Notice>
          )}
          {action && (
            <section className="care-card care-editor">
              <h3>
                {review
                  ? "Review the effects"
                  : action === "replace"
                    ? "Your replacement criteria"
                    : "Close this arrangement"}
              </h3>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (review) {
                    void save();
                    return;
                  }
                  if (payload()) {
                    setReview(true);
                    setAgreed(false);
                  }
                }}
              >
                <fieldset disabled={decision.locked}>
                  {!review ? (
                    <>
                      <label htmlFor="care-reason">
                        Reason for{" "}
                        {action === "replace" ? "replacement" : "closure"}
                      </label>
                      <Textarea
                        id="care-reason"
                        rows={4}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <small>
                        Include only information needed for this decision.
                        Report urgent safety concerns through Help & safety.
                      </small>
                      {action === "replace" && (
                        <>
                          <p>
                            The same learner and region are retained. Review
                            these criteria and add fresh availability; the
                            previous teacher is excluded.
                          </p>
                          <div className="care-fields">
                            {(["subject", "mode", "language"] as const).map(
                              (key) => (
                                <div key={key}>
                                  <label htmlFor={"care-" + key}>
                                    {key === "mode"
                                      ? "Teaching format"
                                      : key[0].toUpperCase() + key.slice(1)}
                                  </label>
                                  <select
                                    id={"care-" + key}
                                    value={criteria[key]}
                                    onChange={(e) =>
                                      setCriteria({
                                        ...criteria,
                                        [key]: e.target.value,
                                      })
                                    }
                                  >
                                    {(key === "subject"
                                      ? ["Maths", "Science"]
                                      : key === "mode"
                                        ? ["ONLINE", "HOME"]
                                        : ["English", "Hindi"]
                                    ).map((v) => (
                                      <option key={v} value={v}>
                                        {v === "ONLINE"
                                          ? "Online"
                                          : v === "HOME"
                                            ? "At home"
                                            : v}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ),
                            )}
                            <div>
                              <label htmlFor="care-locality">Locality</label>
                              <Input
                                id="care-locality"
                                value={criteria.locality}
                                maxLength={80}
                                onChange={(e) =>
                                  setCriteria({
                                    ...criteria,
                                    locality: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label htmlFor="care-budget">
                                Monthly budget (₹)
                              </label>
                              <Input
                                id="care-budget"
                                inputMode="decimal"
                                value={criteria.budget}
                                onChange={(e) =>
                                  setCriteria({
                                    ...criteria,
                                    budget: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <h4>Fresh availability in IST</h4>
                          <p>
                            Choose 1–6 windows of 20–120 minutes, from one hour
                            to 60 days ahead. These are preferences, not
                            confirmed bookings.
                          </p>
                          {windows.map((w, i) => (
                            <div className="care-window" key={i}>
                              <div>
                                <label htmlFor={"care-time-" + i}>
                                  Window {i + 1} starts (IST)
                                </label>
                                <Input
                                  id={"care-time-" + i}
                                  type="datetime-local"
                                  value={w.start}
                                  onChange={(e) =>
                                    setWindows(
                                      windows.map((x, j) =>
                                        j === i
                                          ? { ...x, start: e.target.value }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <label htmlFor={"care-duration-" + i}>
                                  Duration {i + 1} (minutes)
                                </label>
                                <Input
                                  id={"care-duration-" + i}
                                  type="number"
                                  min={20}
                                  max={120}
                                  value={w.duration}
                                  onChange={(e) =>
                                    setWindows(
                                      windows.map((x, j) =>
                                        j === i
                                          ? { ...x, duration: e.target.value }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <Button
                                variant="outline"
                                type="button"
                                disabled={windows.length === 1}
                                onClick={() =>
                                  setWindows(windows.filter((_, j) => j !== i))
                                }
                              >
                                Remove window {i + 1}
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            disabled={windows.length === 6}
                            onClick={() =>
                              setWindows([
                                ...windows,
                                { start: "", duration: "60" },
                              ])
                            }
                          >
                            Add availability window
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="care-review">
                      <h4>
                        {action === "replace"
                          ? "Close and request replacement"
                          : "Close without replacement"}
                      </h4>
                      <p>{reason}</p>
                      <ul>
                        <li>
                          Future scheduled lessons, their reservations and
                          meeting access are cancelled.
                        </li>
                        <li>
                          Pending/accepted timetables end. Existing past lesson
                          and financial records remain.
                        </li>
                        <li>
                          Notes shared with this teacher become private.
                          Information already read cannot be recalled.
                        </li>
                        <li>
                          No refund or replacement teacher is confirmed by this
                          action. Any financial question needs support review.
                        </li>
                      </ul>
                      {action === "replace" && (
                        <>
                          <p>
                            {criteria.subject} ·{" "}
                            {criteria.mode === "HOME" ? "At home" : "Online"} ·{" "}
                            {criteria.language} · {criteria.locality} ·{" "}
                            {money(Math.round(Number(criteria.budget) * 100))}{" "}
                            budget
                          </p>
                          <ul>
                            {windows.map((w, i) => (
                              <li key={i}>
                                {w.start.replace("T", " ")} IST · {w.duration}{" "}
                                minutes
                              </li>
                            ))}
                          </ul>
                          <p>
                            The previous teacher is excluded. A replacement
                            follows the ordinary shortlist, demo, terms and
                            timetable process.
                          </p>
                        </>
                      )}
                      <label className="care-check">
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(e) => setAgreed(e.target.checked)}
                        />
                        <span>
                          I reviewed these effects and want to{" "}
                          {action === "replace"
                            ? "close this arrangement and request a replacement"
                            : "close this arrangement"}
                          .
                        </span>
                      </label>
                    </div>
                  )}
                  <div className="care-actions">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        review
                          ? (setReview(false), setAgreed(false))
                          : (setAction(""), setReason(""))
                      }
                    >
                      {review ? "Back to editing" : "Cancel decision"}
                    </Button>
                    <Button type="submit">
                      {review
                        ? action === "replace"
                          ? "Confirm closure and replacement"
                          : "Confirm closure"
                        : "Review decision"}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </section>
          )}
          <small className="care-help">
            This view uses your current dashboard and latest 50 requests. For
            earlier cases or financial questions, use Help & safety. Development
            support has no live operator or notification delivery.
          </small>
        </>
      )}
    </div>
  );
}
