"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Mail, ShieldCheck } from "lucide-react";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import { useHistory, HistoryPages } from "./history";
import { useAppTranslation } from "./locale";
type S = components["schemas"];
const states: Record<string, string> = {
  QUEUED: "Queued",
  SENDING: "Sending",
  ACCEPTED: "Provider accepted",
  DELIVERED: "Delivered",
  DELAYED: "Delivery delayed",
  BOUNCED: "Bounced",
  COMPLAINED: "Complaint received",
  FAILED: "Failed",
  UNKNOWN: "Uncertain",
  SUPPRESSED: "Suppressed",
  SANDBOX: "Development preview",
};
const failure: Record<string, string> = {
  NO_EMAIL: "No email address is recorded. Contact support.",
  CONFIGURATION: "Email configuration needs staff review.",
  PROVIDER_REJECTED:
    "The provider rejected this attempt. Staff must review its configuration.",
  PROVIDER_UNCERTAIN:
    "The provider outcome could not be confirmed. A duplicate message must not be created.",
  IDEMPOTENCY_WINDOW_EXPIRED:
    "The safe retry window has ended. Staff must investigate with the provider.",
  ATTEMPTS_EXHAUSTED:
    "Automatic attempts are exhausted. Staff review is required.",
  EXPIRED: "This notification expired before delivery.",
  ACCESS_CHANGED: "Access changed, so this notification was stopped.",
  ACCOUNT_CHANGED: "Account details changed, so this notification was stopped.",
  PRIVACY_PAUSED: "Delivery is paused for privacy review.",
  PRIVACY_ERASED: "Private email content was removed during erasure.",
  OTP_SUPERSEDED: "This code expired or a newer sign-in request replaced it.",
  RATE_LIMITED:
    "The provider temporarily limited delivery. Retry remains controlled by the original delivery record.",
  WORKER_INTERRUPTED:
    "The worker was interrupted; the original delivery identity is preserved.",
};
function topic(row: S["EmailDelivery"]) {
  return row.kind === "OTP"
    ? "Sign-in code"
    : row.topic.startsWith("case.")
      ? "Support update"
      : row.topic.startsWith("supporter.")
        ? "Supporter invitation"
        : row.topic.startsWith("demo.")
          ? "Demo update"
          : row.topic.startsWith("service.")
            ? "Service follow-up"
            : "Teacher connection update";
}
export function NotificationWorkspace({
  session,
  staff = false,
}: {
  session: Session;
  staff?: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation(),
    linked = useSearchParams().get("delivery") || "",
    [selected, setSelected] = useState(
      /^[0-9a-f-]{36}$/i.test(linked) ? linked : "",
    ),
    [status, setStatus] = useState(staff ? "FAILED" : ""),
    [locked, setLocked] = useState(false),
    onLock = useCallback((value: boolean) => setLocked(value), []),
    allowed = !staff || ["ADMIN", "OPERATOR"].includes(session.account.role);
  const path = staff ? "/admin/email-deliveries" : "/notifications",
    history = useHistory<S["EmailDeliveryPage"]>({
      queryKey: ["email-deliveries", session.account.id, staff, status],
      path: path + (status ? "?status=" + status : ""),
      enabled: allowed,
    });
  const date = (value: string) =>
    new Intl.DateTimeFormat(appLocale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  return (
    <section className="delivery-workspace">
      <header className="delivery-header">
        <div className="delivery-context">
          {staff ? <ShieldCheck size={20} /> : <Mail size={20} />}
          <span>
            {appText(staff ? "Delivery operations" : "Account updates")}
          </span>
        </div>
        <h1>
          {appText(staff ? "Email delivery & recovery" : "Notifications")}
        </h1>
        <p>
          {appText(
            "Follow the delivery record, from a queued update to a signed provider receipt.",
          )}
        </p>
      </header>
      {!allowed ? (
        <Notice error>
          {appText("Email recovery requires an authorized staff account.")}
        </Notice>
      ) : (
        <>
          <div className="delivery-guidance">
            <strong>{appText("Accepted is different from delivered")}</strong>
            <p>
              {appText(
                "Provider acceptance means an email was received for processing. Delivered requires a signed delivery receipt. Development previews send no email.",
              )}
            </p>
          </div>
          {selected && (
            <>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => setSelected("")}
              >
                {appText("Close delivery details")}
              </Button>
              <DeliveryDetail
                key={selected}
                id={selected}
                session={session}
                staff={staff}
                onLock={onLock}
                refreshList={async () => {
                  const result = await history.refetch();
                  if (result.error) throw result.error;
                }}
              />
            </>
          )}
          <section
            className="delivery-records"
            aria-label={appText("Email delivery history")}
          >
            <div className="delivery-list-heading">
              <h2>
                {appText(
                  staff ? "Recovery queue" : "Your notification history",
                )}
              </h2>
              <div className="delivery-filter">
                <label htmlFor="email-delivery-status">
                  {appText("Delivery status")}
                </label>
                <select
                  id="email-delivery-status"
                  value={status}
                  disabled={!!selected || history.isFetching}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">{appText("All statuses")}</option>
                  {Object.entries(states).map(([value, label]) => (
                    <option key={value} value={value}>
                      {appText(label)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {history.isPending && (
              <p role="status">{appText("Loading delivery records…")}</p>
            )}
            {history.error && (
              <Notice error>
                {appError(history.error.message)}{" "}
                <RefreshButton
                  variant="outline"
                  disabled={locked}
                  onClick={() => history.refetch()}
                 label={appText("Reload delivery records")} />
              </Notice>
            )}
            {history.data && !history.error && (
              <>
                {!history.data.items.length ? (
                  <p>{appText("No delivery records match this view.")}</p>
                ) : (
                  <ul className="delivery-list">
                    {history.data.items.map((r) => (
                      <li key={r.id}>
                        <div>
                          <h3>{appText(topic(r))}</h3>
                          <p>{date(r.createdAt)}</p>
                        </div>
                        <span className="delivery-status">
                          {appText(states[r.status])}
                        </span>
                        <Button
                          variant="outline"
                          disabled={!!selected || locked}
                          onClick={() => setSelected(r.id)}
                        >
                          {appText("View delivery record")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <HistoryPages
                  history={history}
                  disabled={!!selected || locked}
                  label="Email delivery history"
                />
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}
function DeliveryDetail({
  id,
  session,
  staff,
  onLock,
  refreshList,
}: {
  id: string;
  session: Session;
  staff: boolean;
  onLock: (value: boolean) => void;
  refreshList: () => Promise<void>;
}) {
  const { appText, appError, appLocale } = useAppTranslation(),
    [attemptCursors, setAttemptCursors] = useState<string[]>([]),
    [receiptCursors, setReceiptCursors] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [review, setReview] = useState<{
      expectedVersion: number;
      confirmed: true;
      reason: string;
    } | null>(null),
    [ack, setAck] = useState(false),
    [saved, setSaved] = useState(false),
    heading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    sending = useRef(false);
  const params = new URLSearchParams({ limit: "10" });
  if (staff) params.set("staff", "true");
  if (attemptCursors.at(-1))
    params.set("attemptsCursor", attemptCursors.at(-1)!);
  if (receiptCursors.at(-1))
    params.set("receiptsCursor", receiptCursors.at(-1)!);
  const query = useQuery({
    queryKey: [
      "email-delivery",
      session.account.id,
      id,
      staff,
      params.toString(),
    ],
    queryFn: ({ signal }) =>
      api<S["EmailDeliveryHistory"]>(`/notifications/${id}/history?${params}`, {
        signal,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    await refreshList();
  }
  const decision = useDecision(session, refresh),
    data = query.error ? undefined : query.data,
    r = data?.delivery,
    locked = decision.locked || query.isFetching || !!query.error,
    editing = locked || !!review;
  useEffect(() => {
    onLock(!!review || decision.locked);
    return () => onLock(false);
  }, [review, decision.locked, onLock]);
  useEffect(() => {
    (review ? reviewHeading : heading).current?.focus();
  }, [!!review, r?.id]);
  const date = (value: string) =>
    new Intl.DateTimeFormat(appLocale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  async function confirm() {
    if (!review || !ack || locked || saved || sending.current) return;
    sending.current = true;
    try {
      await decision.run({
        path: `/admin/email-deliveries/${id}/retries`,
        body: review,
        message: "Email recovery recorded. This does not confirm delivery.",
        onSaved: () => setSaved(true),
      });
    } finally {
      sending.current = false;
    }
  }
  return (
    <section className="delivery-detail">
      <Feedback decision={decision} />
      {query.isPending && (
        <p role="status">{appText("Loading delivery details…")}</p>
      )}
      {(query.error || decision.conflict) && (
        <RefreshButton
          disabled={decision.busy}
          variant="outline"
          onClick={() => decision.reload()}
         label={appText("Reload delivery details")} />
      )}
      {query.error && (
        <Notice error>
          {appText(
            "Delivery details are unavailable. Private records are hidden until access is restored.",
          )}{" "}
          {appError(query.error.message)}
        </Notice>
      )}
      {r && data && (
        <>
          <header>
            <h2 tabIndex={-1} ref={heading}>
              {appText(topic(r))}
            </h2>
            <span className="delivery-status">{appText(states[r.status])}</span>
          </header>
          <dl className="delivery-facts">
            <div>
              <dt>{appText("Delivery reference")}</dt>
              <dd>{r.id}</dd>
            </div>
            <div>
              <dt>{appText("Created")}</dt>
              <dd>{date(r.createdAt)}</dd>
            </div>
            <div>
              <dt>{appText("Attempts")}</dt>
              <dd>{r.attempts}</dd>
            </div>
            <div>
              <dt>{appText("Last updated")}</dt>
              <dd>{date(r.updatedAt)}</dd>
            </div>
          </dl>
          {r.status === "SANDBOX" && (
            <Notice>
              {appText(
                "Development preview only. No email was sent to an inbox.",
              )}
            </Notice>
          )}
          {r.failureCode && (
            <Notice error>
              {appText(
                failure[r.failureCode] || "Delivery requires staff review.",
              )}
            </Notice>
          )}
          {staff && data.providerReference && (
            <p className="delivery-reference">
              {appText("Provider reference")}: {data.providerReference}
            </p>
          )}
          {r.actionPath && (
            <Link
              className="inline-link"
              aria-disabled={decision.locked}
              tabIndex={decision.locked ? -1 : undefined}
              onClick={(e) => {
                if (decision.locked) e.preventDefault();
              }}
              href={r.actionPath}
            >
              {appText("Open the related account page")}
            </Link>
          )}
          {staff && r.kind === "OTP" && (
            <Notice>
              {appText(
                "Sign-in codes must be requested by the account owner. Staff cannot resend them.",
              )}
            </Notice>
          )}
          {staff && r.retryAvailable && !review && (
            <form
              className="delivery-recovery"
              onSubmit={(e) => {
                e.preventDefault();
                if (!r || locked) return;
                if (!reason.trim() || reason.trim().length > 500) {
                  decision.invalid(
                    "Explain the recovery reason in 1–500 characters.",
                  );
                  return;
                }
                setReview({
                  expectedVersion: r.version,
                  confirmed: true,
                  reason: reason.trim(),
                });
                setAck(false);
                setSaved(false);
              }}
            >
              <label htmlFor="email-recovery-reason">
                {appText("What did you check before retrying?")}
              </label>
              <Textarea
                id="email-recovery-reason"
                required
                maxLength={500}
                value={reason}
                disabled={locked}
                onChange={(e) => setReason(e.target.value)}
              />
              <p>
                {appText(
                  "Check the recipient configuration and provider outcome first. Recovery preserves the original message and provider identity.",
                )}
              </p>
              <Button type="submit" disabled={locked}>
                {appText("Review safe retry")}
              </Button>
            </form>
          )}
          {review && (
            <div className="delivery-recovery">
              <h3 tabIndex={-1} ref={reviewHeading}>
                {appText("Review email recovery")}
              </h3>
              <p>{review.reason}</p>
              <Notice>
                {appText(
                  "This queues the original delivery again within its safe retry window. It does not create a new message or confirm inbox delivery.",
                )}
              </Notice>
              {!saved && (
                <>
                  <label className="delivery-check">
                    <input
                      type="checkbox"
                      checked={ack}
                      disabled={locked}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    <span>
                      {appText(
                        "I reviewed the failure and authorize retrying the same delivery.",
                      )}
                    </span>
                  </label>
                  <Button disabled={locked || !ack} onClick={confirm}>
                    {appText("Confirm safe retry")}
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                disabled={decision.locked}
                onClick={() => {
                  setReview(null);
                  setAck(false);
                  decision.invalid("");
                }}
              >
                {appText(saved ? "Done" : "Cancel recovery")}
              </Button>
            </div>
          )}
          <section className="delivery-timeline">
            <h3>{appText("Attempt history")}</h3>
            {!data.attempts.length ? (
              <p>{appText("No provider attempts are recorded.")}</p>
            ) : (
              <ol>
                {data.attempts.map((a) => (
                  <li key={a.id}>
                    <strong>
                      {appText("Attempt {0}", [a.number])} ·{" "}
                      {appText(
                        (
                          {
                            STARTED: "Sending",
                            ACCEPTED: "Provider accepted",
                            SANDBOX: "Development preview",
                            REJECTED: "Rejected",
                            UNCERTAIN: "Uncertain",
                            SUPPRESSED: "Suppressed",
                          } as Record<string, string>
                        )[a.outcome],
                      )}
                    </strong>
                    <p>{date(a.startedAt)}</p>
                    {a.failureCode && (
                      <p>
                        {appText(
                          failure[a.failureCode] ||
                            "Delivery requires staff review.",
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {(attemptCursors.length > 0 || data.attemptsNextCursor) && (
              <div className="delivery-actions">
                <Button
                  variant="outline"
                  disabled={editing || !attemptCursors.length}
                  onClick={() => setAttemptCursors((p) => p.slice(0, -1))}
                >
                  {appText("Previous attempts")}
                </Button>
                <Button
                  variant="outline"
                  disabled={editing || !data.attemptsNextCursor}
                  onClick={() =>
                    setAttemptCursors((p) => [...p, data.attemptsNextCursor!])
                  }
                >
                  {appText("Next attempts")}
                </Button>
              </div>
            )}
          </section>
          <section className="delivery-timeline">
            <h3>{appText("Signed provider receipts")}</h3>
            {!data.receipts.length ? (
              <p>{appText("No signed provider receipts are recorded yet.")}</p>
            ) : (
              <ol>
                {data.receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <strong>{appText(states[receipt.kind])}</strong>
                    <p>{date(receipt.occurredAt)}</p>
                  </li>
                ))}
              </ol>
            )}
            {(receiptCursors.length > 0 || data.receiptsNextCursor) && (
              <div className="delivery-actions">
                <Button
                  variant="outline"
                  disabled={editing || !receiptCursors.length}
                  onClick={() => setReceiptCursors((p) => p.slice(0, -1))}
                >
                  {appText("Previous receipts")}
                </Button>
                <Button
                  variant="outline"
                  disabled={editing || !data.receiptsNextCursor}
                  onClick={() =>
                    setReceiptCursors((p) => [...p, data.receiptsNextCursor!])
                  }
                >
                  {appText("Next receipts")}
                </Button>
              </div>
            )}
          </section>
          <RefreshButton
            variant="outline"
            disabled={editing}
            onClick={() => decision.reload()}
           label={appText("Refresh delivery status")} />
        </>
      )}
    </section>
  );
}
