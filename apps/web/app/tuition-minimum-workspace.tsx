"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, CalendarCheck, Receipt, ArrowLeft } from "lucide-react";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import { useHistory, HistoryPages } from "./history";
import { useAppTranslation } from "./locale";
type S = components["schemas"];
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const paise = (value: string) =>
  /^\d+(\.\d{1,2})?$/.test(value)
    ? Number(value.split(".")[0]) * 100 +
      Number((value.split(".")[1] || "").padEnd(2, "0"))
    : NaN;
export const minimumHref = (kind: "PLACEMENT" | "INDEPENDENT", id: string) =>
  `/dashboard/minimum-tuition?kind=${kind}&arrangement=${encodeURIComponent(id)}`;
export function TuitionMinimumWorkspace({ session }: { session: Session }) {
  const { appText } = useAppTranslation(),
    params = useSearchParams(),
    id = params.get("arrangement"),
    kind = params.get("kind"),
    staff = ["ADMIN", "OPERATOR"].includes(session.account.role),
    valid =
      !!id &&
      /^[0-9a-f-]{36}$/i.test(id) &&
      ["PLACEMENT", "INDEPENDENT"].includes(kind || "");
  return (
    <section className="minimum-workspace">
      <header className="minimum-header">
        <div className="minimum-eyebrow">
          <ShieldCheck size={18} />
          {appText("Clear terms, shared confidence")}
        </div>
        <h1>{appText("Minimum tuition")}</h1>
        <p>
          {appText(
            "See the agreed commitment, confirm when teaching began and keep a shared record of payments.",
          )}
        </p>
      </header>
      {valid ? (
        <MinimumDetail
          key={kind + id}
          session={session}
          kind={kind!}
          id={id!}
        />
      ) : id ? (
        <Notice error>
          {appText("Choose a valid arrangement to review its minimum tuition.")}
        </Notice>
      ) : !staff ? (
        <div className="minimum-card">
          <h2>{appText("Start with your arrangement")}</h2>
          <p>
            {appText(
              "Open Minimum tuition from an arrangement to see its own agreed terms and payment record.",
            )}
          </p>
          <Link
            className="inline-link"
            href={
              session.account.role === "INDEPENDENT_STUDENT"
                ? "/dashboard/student-arrangements"
                : "/dashboard"
            }
          >
            {appText("View arrangements")}
          </Link>
        </div>
      ) : null}
      {staff && <MinimumReviewQueue session={session} />}
    </section>
  );
}
function MinimumDetail({
  session,
  kind,
  id,
}: {
  session: Session;
  kind: string;
  id: string;
}) {
  const linkedStudent = useSearchParams().get("student");
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation(),
    client = useQueryClient(),
    base = `/tuition-minimums/${kind}/${id}`;
  const [creditsPages, setCreditsPages] = useState<string[]>([]),
    [reviewsPages, setReviewsPages] = useState<string[]>([]),
    [action, setAction] = useState(""),
    [when, setWhen] = useState(today),
    [amount, setAmount] = useState(""),
    [reference, setReference] = useState(""),
    [reason, setReason] = useState(""),
    [category, setCategory] = useState("SAFETY"),
    [ack, setAck] = useState(false),
    [saved, setSaved] = useState(false),
    [draft, setDraft] = useState<{
      path: string;
      body: unknown;
      label: string;
    } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const sending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null),
    params = new URLSearchParams({ limit: "10" });
  if (creditsPages.at(-1)) params.set("creditsCursor", creditsPages.at(-1)!);
  if (reviewsPages.at(-1)) params.set("reviewsCursor", reviewsPages.at(-1)!);
  const query = useQuery({
    queryKey: [
      "tuition-minimum",
      session.account.id,
      kind,
      id,
      params.toString(),
    ],
    queryFn: ({ signal }) =>
      api<S["TuitionMinimumView"]>(base + "?" + params, { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    await client.invalidateQueries({ queryKey: ["minimum-review-queue"] });
    await client.invalidateQueries({ queryKey: ["dashboard"] });
    await client.invalidateQueries({ queryKey: ["hiring-dashboard"] });
  }
  const decision = useDecision(session, refresh),
    view = query.error ? undefined : query.data,
    m = view?.agreement,
    s = view?.summary,
    locked = decision.locked || query.isFetching || !!query.error,
    editing = locked || !!draft;
  const money = (n: number) =>
    new Intl.NumberFormat(appLocale, {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(n / 100);
  const day = (value: string) =>
    new Intl.DateTimeFormat(appLocale, {
      timeZone: "UTC",
      dateStyle: "medium",
    }).format(new Date(value + "T00:00:00Z"));
  const ownConfirmed = !!(session.account.role === "TEACHER"
      ? m?.teacherConfirmedAt
      : m?.familyConfirmedAt),
    pendingReview = view?.pendingReview;
  useEffect(() => {
    if (action) heading.current?.focus();
    else trigger.current?.focus();
  }, [action, draft]);
  useEffect(() => {
    if (!decision.uncertain) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [decision.uncertain]);
  function begin(next: string) {
    if (locked || action) return;
    trigger.current = document.activeElement as HTMLElement;
    setAction(next);
    setWhen(m?.commencementDate || today());
    setAmount(next === "staff" && m ? String(m.adjustedPaise / 100) : "");
    setReference("");
    setReason("");
    setAck(false);
    setSaved(false);
    setDraft(null);
    decision.invalid("");
  }
  function reviewForm() {
    if (!m || locked) return;
    let body: Record<string, unknown> = {
        expectedVersion: m.version,
        confirmed: true,
      },
      path = "",
      label = "";
    if (action === "start" || action === "withdraw") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(when) ||
        !Number.isFinite(Date.parse(when)) ||
        new Date(when + "T00:00:00Z").toISOString().slice(0, 10) !== when ||
        when > today() ||
        when < "2000-01-01"
      ) {
        decision.invalid("Choose a valid date on or before today.");
        return;
      }
      path = base + "/commencements";
      body = {
        ...body,
        action: action === "start" ? "CONFIRM" : "WITHDRAW",
        commencementDate: when,
      };
      label =
        action === "start"
          ? appText("Confirm teaching commencement")
          : appText("Withdraw my pending confirmation");
    }
    if (action === "credit") {
      const value = paise(amount);
      if (
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > m.minimumPaise ||
        !reference.trim() ||
        reference.trim().length > 80 ||
        !when ||
        when > today()
      ) {
        decision.invalid(
          "Enter a valid payment date, receipt label and amount within the original minimum.",
        );
        return;
      }
      path = base + "/credits";
      body = {
        ...body,
        amountPaise: value,
        paidOn: when,
        reference: reference.trim(),
      };
      label = appText("Submit payment for confirmation");
    }
    if (action === "exception") {
      if (!reason.trim() || reason.trim().length > 3000) {
        decision.invalid("Explain the issue in 1–3,000 characters.");
        return;
      }
      path = base + "/reviews";
      body = { ...body, reason: category, description: reason.trim() };
      label = appText("Request staff assessment");
    }
    if (action === "staff") {
      const value = paise(amount);
      if (
        !pendingReview ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > m.minimumPaise ||
        !reason.trim() ||
        reason.trim().length > 1000
      ) {
        decision.invalid(
          "Enter an adjusted minimum within the original amount and a clear assessment reason.",
        );
        return;
      }
      path = `/admin/tuition-minimum-reviews/${pendingReview.id}/decisions`;
      body = { ...body, adjustedPaise: value, reason: reason.trim() };
      label = appText("Record staff assessment");
    }
    setAck(false);
    setDraft({ path, body, label });
  }
  async function confirm() {
    if (!draft || !ack || locked || sending.current || saved) return;
    sending.current = true;
    try {
      await decision.run({
        path: draft.path,
        body: draft.body,
        message: "Your minimum-tuition decision is recorded.",
        onSaved: () => setSaved(true),
      });
    } finally {
      sending.current = false;
    }
  }
  function creditDecision(credit: S["TuitionCredit"], accept: boolean) {
    if (locked || action || !m) return;
    trigger.current = document.activeElement as HTMLElement;
    setAction("credit-decision");
    setSaved(false);
    setAck(false);
    setDraft({
      path: base + `/credits/${credit.id}/decisions`,
      body: {
        expectedVersion: m.version,
        confirmed: true,
        decision: accept ? "CONFIRM" : "REJECT",
      },
      label:
        appText(accept ? "Confirm received payment" : "Reject payment credit") +
        " · " +
        money(credit.amountPaise) +
        " · " +
        credit.reference,
    });
  }
  const page = (type: "credits" | "reviews", next: string | null) => {
    if (locked || action) return;
    const update = type === "credits" ? setCreditsPages : setReviewsPages;
    update((p) => (next ? [...p, next] : p.slice(0, -1)));
  };
  return (
    <>
      <Feedback decision={decision} />
      {decision.conflict && !query.error && (
        <RefreshButton disabled={decision.busy} onClick={() => decision.reload()} label={appText("Reload current terms")} />
      )}
      {query.isPending && (
        <p role="status">{appText("Loading minimum tuition…")}</p>
      )}
      {query.error && (
        <Notice error>
          {appError(query.error.message)}{" "}
          <RefreshButton
            variant="outline"
            disabled={decision.busy}
            onClick={() => decision.reload()}
           label={appText("Reload current terms")} />
        </Notice>
      )}
      {view && (
        <dl className="minimum-parties">
          <div>
            <dt>{appText("Teacher")}</dt>
            <dd>{view.context.teacherName}</dd>
          </div>
          <div>
            <dt>{appText("Learner")}</dt>
            <dd>{view.context.learnerName}</dd>
          </div>
          <div>
            <dt>{appText("Subject")}</dt>
            <dd>{appCurriculum(view.context.subject)}</dd>
          </div>
        </dl>
      )}
      {view && !view.available && (
        <Notice>
          {appText(
            "This arrangement has no agreed minimum. No retroactive charge applies. Use support if the recorded terms need review.",
          )}
        </Notice>
      )}
      {m && s && (
        <>
          <div className="minimum-summary">
            <div>
              <span className="minimum-eyebrow">
                {appText("Frozen for this arrangement")}
              </span>
              <h2>
                {m.days === 0
                  ? appText("No minimum period")
                  : appText("{0}-day minimum", [m.days])}
              </h2>
              <p>
                {appText("Agreed monthly tuition")}{" "}
                <strong>{money(m.monthlyPaise)}</strong>
              </p>
              <p>
                {m.days === 15
                  ? appText(
                      "Half a month of agreed tuition. An odd paise rounds upward.",
                    )
                  : m.days === 30
                    ? appText("One month of agreed tuition.")
                    : appText("No minimum-tuition obligation is added.")}
              </p>
              <span className="minimum-policy">
                {appText("Teacher profile changes cannot reprice these terms.")}
              </span>
            </div>
            <div className="minimum-balance">
              <span>
                {s.pendingReview
                  ? appText("Disputed balance · staff assessment pending")
                  : appText("Unpaid minimum")}
              </span>
              <strong>{money(s.outstandingPaise)}</strong>
              <p>
                {s.commenced
                  ? appText(
                      "This amount remains recorded after ordinary closure or replacement.",
                    )
                  : appText(
                      "No minimum debt applies until both parties confirm commencement.",
                    )}
              </p>
            </div>
          </div>
          <div className="minimum-grid">
            <section className="minimum-card">
              <h2>
                <CalendarCheck size={22} />
                {appText("Teaching commencement")}
              </h2>
              <p>
                {appText(
                  "Confirm the actual start date together. No class booking or timetable is required.",
                )}
              </p>
              <dl className="minimum-facts">
                <div>
                  <dt>{appText("Account owner")}</dt>
                  <dd>
                    {m.familyConfirmedAt
                      ? appText("Confirmed")
                      : appText("Awaiting confirmation")}
                  </dd>
                </div>
                <div>
                  <dt>{appText("Teacher")}</dt>
                  <dd>
                    {m.teacherConfirmedAt
                      ? appText("Confirmed")
                      : appText("Awaiting confirmation")}
                  </dd>
                </div>
                {m.commencementDate && (
                  <div>
                    <dt>{appText("Agreed start date")}</dt>
                    <dd>{day(m.commencementDate)}</dd>
                  </div>
                )}
                {s.endsOn && (
                  <div>
                    <dt>{appText("Minimum period ends")}</dt>
                    <dd>{day(s.endsOn)}</dd>
                  </div>
                )}
              </dl>
              {!s.commenced && view.canDecide && (
                <Button
                  variant={ownConfirmed ? "outline" : "default"}
                  disabled={
                    locked ||
                    !!action ||
                    view.startGate !== "READY" ||
                    (s.pendingReview && !ownConfirmed)
                  }
                  onClick={() => begin(ownConfirmed ? "withdraw" : "start")}
                >
                  {appText(
                    ownConfirmed
                      ? "Withdraw my pending confirmation"
                      : "Review commencement",
                  )}
                </Button>
              )}
              {!s.commenced && view.startGate !== "READY" && (
                <Notice>
                  {appText(
                    view.startGate === "CLOSED"
                      ? "This arrangement is closed. No new commencement can be confirmed. Its recorded balance and support remain available."
                      : "Both parties must accept the learning terms before confirming financial commencement.",
                  )}
                </Notice>
              )}
              {!view.canDecide && !view.canReview && (
                <p className="minimum-guidance">
                  {appText(
                    "You can follow this record. The account owner and teacher make financial confirmations; learning permissions do not change that authority.",
                  )}
                </p>
              )}
            </section>
            <section className="minimum-card">
              <h2>
                <Receipt size={22} />
                {appText("Payments toward the minimum")}
              </h2>
              <dl className="minimum-facts">
                <div>
                  <dt>{appText("Original minimum")}</dt>
                  <dd>{money(m.minimumPaise)}</dd>
                </div>
                <div>
                  <dt>{appText("Current assessed minimum")}</dt>
                  <dd>{money(s.obligationPaise)}</dd>
                </div>
                <div>
                  <dt>{appText("Confirmed payment credits")}</dt>
                  <dd>{money(s.creditedPaise)}</dd>
                </div>
              </dl>
              <p>
                {appText(
                  "Only payments confirmed by the other financial party reduce the balance. Record the portion toward this minimum, including an advance payment.",
                )}
              </p>
              {view.canDecide && s.commenced && m.minimumPaise > 0 && (
                <Button
                  variant="outline"
                  disabled={locked || !!action}
                  onClick={() => begin("credit")}
                >
                  {appText("Record a payment credit")}
                </Button>
              )}
              {s.refundAssessmentPaise > 0 && (
                <Notice>
                  {appText(
                    "{0} requires separate refund assessment. No refund has been sent.",
                    [money(s.refundAssessmentPaise)],
                  )}
                </Notice>
              )}
            </section>
          </div>
          <section className="minimum-help">
            <div>
              <h2>{appText("Help stays available")}</h2>
              <p>
                {appText(
                  "Ordinary early exit preserves the unpaid minimum, with no additional replacement fee. Safety and non-delivery concerns receive staff assessment. No automatic charge or refund happens here.",
                )}
              </p>
            </div>
            <div className="minimum-actions">
              {!view.canReview && (
                <Button
                  variant="outline"
                  disabled={locked || !!action || s.pendingReview}
                  onClick={() => begin("exception")}
                >
                  {appText(
                    s.pendingReview
                      ? "Staff assessment pending"
                      : "Report safety or non-delivery",
                  )}
                </Button>
              )}
              {view.canReview && s.pendingReview && (
                <Button
                  disabled={locked || !!action || !pendingReview}
                  onClick={() => begin("staff")}
                >
                  {appText("Assess minimum tuition")}
                </Button>
              )}
              <Link
                className="inline-link"
                aria-disabled={decision.locked}
                tabIndex={decision.locked ? -1 : undefined}
                onClick={(e) => {
                  if (decision.locked) e.preventDefault();
                }}
                href={
                  kind === "PLACEMENT"
                    ? `/support?placement=${id}`
                    : "/dashboard/student-arrangements?arrangement=" +
                      id +
                      (linkedStudent
                        ? "&student=" + encodeURIComponent(linkedStudent)
                        : "")
                }
              >
                {appText("Help, closure and replacement")}
              </Link>
            </div>
          </section>
          {action && (
            <section
              className="minimum-card minimum-decision"
              aria-labelledby="minimum-decision-heading"
            >
              <h2 id="minimum-decision-heading" tabIndex={-1} ref={heading}>
                {appText("Review your decision")}
              </h2>
              {!draft ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    reviewForm();
                  }}
                >
                  <fieldset disabled={editing}>
                    <legend className="sr-only">
                      {appText("Minimum tuition decision")}
                    </legend>
                    {(action === "start" ||
                      action === "withdraw" ||
                      action === "credit") && (
                      <label>
                        {appText(
                          action === "credit"
                            ? "Payment date"
                            : "Actual teaching start date",
                        )}
                        <Input
                          type="date"
                          required
                          min="2000-01-01"
                          max={today()}
                          value={when}
                          disabled={
                            action === "withdraw" ||
                            (action === "start" && !!m.commencementDate)
                          }
                          onChange={(e) => setWhen(e.target.value)}
                        />
                      </label>
                    )}
                    {(action === "credit" || action === "staff") && (
                      <label>
                        <span id="minimum-amount-label">
                          {appText(
                            action === "credit"
                              ? "Amount credited toward the minimum (INR)"
                              : "Assessed minimum (INR)",
                          )}
                        </span>
                        <Input
                          aria-labelledby="minimum-amount-label"
                          inputMode="decimal"
                          required
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          aria-describedby="minimum-money-guidance"
                        />
                        <small id="minimum-money-guidance">
                          {appText("Original agreed minimum: {0}", [
                            money(m.minimumPaise),
                          ])}
                        </small>
                      </label>
                    )}
                    {action === "credit" && (
                      <label>
                        <span id="minimum-receipt-label">
                          {appText("Receipt label")}
                        </span>
                        <Input
                          aria-labelledby="minimum-receipt-label"
                          aria-describedby="minimum-receipt-guidance"
                          required
                          maxLength={80}
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                        <small id="minimum-receipt-guidance">
                          {appText(
                            "Use a unique non-sensitive label. Do not enter bank or card details.",
                          )}
                        </small>
                      </label>
                    )}
                    {action === "exception" && (
                      <label>
                        {appText("What needs staff assessment?")}
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                        >
                          <option value="SAFETY">
                            {appText("Safety concern")}
                          </option>
                          <option value="NON_DELIVERY">
                            {appText("Teacher non-delivery")}
                          </option>
                        </select>
                      </label>
                    )}
                    {(action === "exception" || action === "staff") && (
                      <label>
                        {appText(
                          action === "staff"
                            ? "Participant-visible assessment reason"
                            : "Describe the concern",
                        )}
                        <Textarea
                          required
                          maxLength={action === "staff" ? 1000 : 3000}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                    )}
                    {action === "start" && (
                      <Notice>
                        {appText(
                          "By confirming, you accept this frozen minimum from the actual teaching start date. A pending confirmation can be withdrawn until the other party confirms.",
                        )}
                      </Notice>
                    )}
                    {action === "staff" && pendingReview && (
                      <Notice>
                        {appText(
                          "Assess the linked case and available evidence before changing the minimum. Any refund requires a separate reviewed process.",
                        )}{" "}
                        <Link
                          className="inline-link"
                          href={"/support?case=" + pendingReview.caseId}
                        >
                          {appText("Open linked support case")}
                        </Link>
                      </Notice>
                    )}
                    <Button type="submit">{appText("Review decision")}</Button>
                  </fieldset>
                </form>
              ) : (
                <div className="minimum-review">
                  <h3>{draft.label}</h3>
                  <dl className="minimum-facts">
                    <div>
                      <dt>{appText("Original minimum")}</dt>
                      <dd>{money(m.minimumPaise)}</dd>
                    </div>
                    <div>
                      <dt>{appText("Confirmed payment credits")}</dt>
                      <dd>{money(s.creditedPaise)}</dd>
                    </div>
                    <div>
                      <dt>{appText("Current unpaid minimum")}</dt>
                      <dd>{money(s.outstandingPaise)}</dd>
                    </div>
                  </dl>
                  {when && ["start", "withdraw", "credit"].includes(action) && (
                    <p>
                      {appText("Date")}: {day(when)}
                    </p>
                  )}
                  {amount && (
                    <p>
                      {appText("Amount")}: {money(paise(amount))}
                    </p>
                  )}
                  {reference && (
                    <p>
                      {appText("Receipt label")}: {reference}
                    </p>
                  )}
                  {reason && <p>{reason}</p>}
                  {action === "exception" && (
                    <p>
                      {appText(
                        category === "SAFETY"
                          ? "Safety concern"
                          : "Teacher non-delivery",
                      )}
                    </p>
                  )}
                  {!saved && (
                    <>
                      <label className="minimum-check">
                        <input
                          type="checkbox"
                          checked={ack}
                          disabled={locked}
                          onChange={(e) => setAck(e.target.checked)}
                        />
                        <span>
                          {appText(
                            "I reviewed the date, amount and financial effect of this decision.",
                          )}
                        </span>
                      </label>
                      <div className="minimum-actions">
                        <Button disabled={locked || !ack} onClick={confirm}>
                          {draft.label}
                        </Button>
                        {action !== "credit-decision" && (
                          <Button
                            variant="outline"
                            disabled={locked}
                            onClick={() => {
                              setDraft(null);
                              setAck(false);
                            }}
                          >
                            {appText("Edit decision")}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                disabled={decision.locked}
                onClick={() => {
                  setAction("");
                  setDraft(null);
                  decision.invalid("");
                }}
              >
                {appText(saved ? "Done" : "Cancel decision")}
              </Button>
            </section>
          )}
          <section className="minimum-card">
            <h2>{appText("Payment credit history")}</h2>
            {!view.credits.length ? (
              <p>{appText("No payment credits on this page.")}</p>
            ) : (
              <ul className="minimum-records">
                {view.credits.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>{money(c.amountPaise)}</strong>
                      <span className="minimum-state">
                        {appText(
                          c.status === "CONFIRMED"
                            ? "Confirmed"
                            : c.status === "REJECTED"
                              ? "Rejected"
                              : "Awaiting other party",
                        )}
                      </span>
                    </div>
                    <p>
                      {c.reference} · {day(c.paidOn)}
                    </p>
                    {c.status === "PENDING" &&
                      c.proposerId !== session.account.id &&
                      view.canDecide && (
                        <div className="minimum-actions">
                          <Button
                            variant="outline"
                            disabled={locked || !!action}
                            onClick={() => creditDecision(c, true)}
                          >
                            {appText("Review received payment")}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={locked || !!action}
                            onClick={() => creditDecision(c, false)}
                          >
                            {appText("Review rejection")}
                          </Button>
                        </div>
                      )}
                  </li>
                ))}
              </ul>
            )}
            {(creditsPages.length > 0 || view.creditsNextCursor) && (
              <div className="minimum-actions">
                <Button
                  variant="outline"
                  disabled={locked || !!action || !creditsPages.length}
                  onClick={() => page("credits", null)}
                >
                  {appText("Previous payment credits")}
                </Button>
                <Button
                  variant="outline"
                  disabled={locked || !!action || !view.creditsNextCursor}
                  onClick={() => page("credits", view.creditsNextCursor)}
                >
                  {appText("Next payment credits")}
                </Button>
              </div>
            )}
          </section>
          <section className="minimum-card">
            <h2>{appText("Staff assessment history")}</h2>
            {!view.reviews.length ? (
              <p>{appText("No staff assessments on this page.")}</p>
            ) : (
              <ul className="minimum-records">
                {view.reviews.map((r) => (
                  <li key={r.id}>
                    <strong>
                      {appText(
                        r.reason === "SAFETY"
                          ? "Safety concern"
                          : "Teacher non-delivery",
                      )}
                    </strong>
                    <p>
                      {appText(
                        r.status === "PENDING"
                          ? "Staff assessment pending"
                          : "Assessment recorded",
                      )}
                    </p>
                    {r.decisionReason && <p>{r.decisionReason}</p>}
                    {r.adjustedPaise !== null && (
                      <p>
                        {appText("Assessed minimum: {0}", [
                          money(r.adjustedPaise),
                        ])}
                      </p>
                    )}
                    <Link
                      className="inline-link"
                      href={"/support?case=" + r.caseId}
                    >
                      {appText("Open linked support case")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {(reviewsPages.length > 0 || view.reviewsNextCursor) && (
              <div className="minimum-actions">
                <Button
                  variant="outline"
                  disabled={locked || !!action || !reviewsPages.length}
                  onClick={() => page("reviews", null)}
                >
                  {appText("Previous assessments")}
                </Button>
                <Button
                  variant="outline"
                  disabled={locked || !!action || !view.reviewsNextCursor}
                  onClick={() => page("reviews", view.reviewsNextCursor)}
                >
                  {appText("Next assessments")}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
      <Link
        className="minimum-back inline-link"
        aria-disabled={decision.locked}
        tabIndex={decision.locked ? -1 : undefined}
        onClick={(e) => {
          if (decision.locked) e.preventDefault();
        }}
        href="/dashboard"
      >
        <ArrowLeft size={16} />
        {appText("Back to dashboard")}
      </Link>
    </>
  );
}
function MinimumReviewQueue({ session }: { session: Session }) {
  const { appText, appError } = useAppTranslation(),
    [status, setStatus] = useState("PENDING"),
    history = useHistory<S["TuitionMinimumReviewPage"]>({
      queryKey: ["minimum-review-queue", session.account.id, status],
      path: "/admin/tuition-minimum-reviews?status=" + status,
      enabled: true,
    });
  return (
    <section className="minimum-card">
      <h2>{appText("Minimum-tuition assessments")}</h2>
      <label>
        {appText("Assessment status")}
        <select
          value={status}
          disabled={history.isFetching}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="PENDING">{appText("Pending")}</option>
          <option value="RESOLVED">{appText("Resolved")}</option>
        </select>
      </label>
      {history.isPending && (
        <p role="status">{appText("Loading assessments…")}</p>
      )}
      {history.error && (
        <Notice error>
          {appError(history.error.message)}{" "}
          <Button variant="outline" onClick={() => history.refetch()}>
            {appText("Retry")}
          </Button>
        </Notice>
      )}
      {history.data && !history.error && (
        <>
          <ul className="minimum-records">
            {history.data.items.map((r) => (
              <li key={r.id}>
                <strong>
                  {appText(
                    r.reason === "SAFETY"
                      ? "Safety concern"
                      : "Teacher non-delivery",
                  )}
                </strong>
                <p>
                  {r.region} ·{" "}
                  {appText(r.status === "PENDING" ? "Pending" : "Resolved")}
                </p>
                <Link
                  className="inline-link"
                  href={minimumHref(r.kind, r.resourceId)}
                >
                  {appText("Review frozen terms and payment credits")}
                </Link>
              </li>
            ))}
          </ul>
          {!history.data.items.length && (
            <p>{appText("No assessments match this status in your region.")}</p>
          )}
          <HistoryPages
            history={history}
            label="Minimum-tuition assessment history"
          />
        </>
      )}
    </section>
  );
}
