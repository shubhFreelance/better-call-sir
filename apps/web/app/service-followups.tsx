"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import { useAppTranslation } from "./locale";
type S = components["schemas"];
type Row = S["ServiceFollowup"];
const statuses: Record<string, string> = {
  OPEN: "Awaiting follow-up",
  SCHEDULED: "Another attempt scheduled",
  COMPLETED: "Follow-up completed",
};
const outcomes: Record<string, string> = {
  CONTINUING: "Learning is continuing",
  ENDED: "Learning has ended",
  NO_RESPONSE: "No response",
  HELP_REQUESTED: "Help requested",
};
const methods: Record<string, string> = {
  PHONE: "Phone",
  EMAIL: "Email",
  VIDEO: "Video call",
  IN_PERSON: "In person",
};
export function ServiceFollowups({ session }: { session: Session }) {
  const {
      appText: t,
      appError,
      appLocale,
      appCurriculum,
    } = useAppTranslation(),
    params = useSearchParams(),
    [selected, setSelected] = useState<{ kind: string; id: string } | null>(
      () =>
        ["PLACEMENT", "INDEPENDENT"].includes(params.get("kind") || "") &&
        /^[0-9a-f-]{36}$/i.test(params.get("arrangement") || "")
          ? { kind: params.get("kind")!, id: params.get("arrangement")! }
          : null,
    ),
    [status, setStatus] = useState(""),
    [assignment, setAssignment] = useState(""),
    [due, setDue] = useState("true"),
    [cursors, setCursors] = useState<string[]>([]),
    [locked, setLocked] = useState(false),
    heading = useRef<HTMLHeadingElement>(null),
    move = useRef(false),
    onLock = useCallback((v: boolean) => setLocked(v), []),
    allowed = ["ADMIN", "OPERATOR"].includes(session.account.role);
  const client = useQueryClient();
  const p = new URLSearchParams({ due, limit: "20" });
  if (status) p.set("status", status);
  if (assignment) p.set("assignment", assignment);
  if (cursors.at(-1)) p.set("cursor", cursors.at(-1)!);
  const q = useQuery({
    queryKey: ["service-queue", session.account.id, p.toString()],
    queryFn: ({ signal }) =>
      api<S["ServiceFollowupPage"]>("/admin/service-followups?" + p, {
        signal,
      }),
    enabled: allowed,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (move.current && !q.isFetching) {
      move.current = false;
      heading.current?.focus();
    }
  }, [q.isFetching, q.error, q.data]);
  const date = (s: string, withTime = true) =>
    new Intl.DateTimeFormat(appLocale, {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" as const } : {}),
      timeZone: "Asia/Kolkata",
    }).format(new Date(s));
  const filter = (fn: () => void) => {
    fn();
    setCursors([]);
  };
  return (
    <section className="delivery-workspace service-workspace">
      <header className="delivery-header">
        <h1>{t("Service follow-ups")}</h1>
        <p>
          {t(
            "Check how learning is going, record actual contact and connect the family with help when needed.",
          )}
        </p>
      </header>
      {!allowed ? (
        <Notice error>
          {t("Service follow-ups require authorized staff access.")}
        </Notice>
      ) : (
        <>
          <div className="delivery-guidance">
            <strong>{t("A conversation, not a continuation statistic")}</strong>
            <p>
              {t(
                "Thirty-day follow-ups start from recorded teaching commencement. Staff contact outcomes do not change tuition terms, close arrangements or rewrite cohort observations.",
              )}
            </p>
          </div>
          {selected && (
            <>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  setSelected(null);
                  move.current = true;
                  queueMicrotask(() => heading.current?.focus());
                }}
              >
                {t("Close follow-up details")}
              </Button>
              <FollowupDetail
                key={selected.kind + selected.id}
                selected={selected}
                session={session}
                onLock={onLock}
                refreshQueue={async () => {
                  const first = new URLSearchParams(p);
                  first.delete("cursor");
                  await client.fetchQuery({
                    queryKey: [
                      "service-queue",
                      session.account.id,
                      first.toString(),
                    ],
                    queryFn: ({ signal }) =>
                      api<S["ServiceFollowupPage"]>(
                        "/admin/service-followups?" + first,
                        { signal },
                      ),
                    staleTime: 0,
                  });
                  setCursors([]);
                }}
              />
            </>
          )}
          <section
            className="delivery-records"
            aria-label={t("Follow-up queue")}
          >
            <h2 ref={heading} tabIndex={-1}>
              {t("Follow-up queue")}
            </h2>
            <div className="service-filters">
              <label>
                {t("Follow-up status")}
                <select
                  aria-label={t("Follow-up status")}
                  disabled={!!selected || q.isFetching}
                  value={status}
                  onChange={(e) => filter(() => setStatus(e.target.value))}
                >
                  <option value="">{t("Pending follow-ups")}</option>
                  {Object.entries(statuses).map(([k, v]) => (
                    <option key={k} value={k}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Assigned staff")}
                <select
                  aria-label={t("Assigned staff")}
                  disabled={!!selected || q.isFetching}
                  value={assignment}
                  onChange={(e) => filter(() => setAssignment(e.target.value))}
                >
                  <option value="">{t("All assignments")}</option>
                  <option value="ME">{t("Assigned to me")}</option>
                  <option value="UNASSIGNED">{t("Unassigned")}</option>
                </select>
              </label>
              <label>
                {t("When to follow up")}
                <select
                  aria-label={t("When to follow up")}
                  disabled={!!selected || q.isFetching}
                  value={due}
                  onChange={(e) => filter(() => setDue(e.target.value))}
                >
                  <option value="true">{t("Due now")}</option>
                  <option value="false">
                    {t("Include scheduled and future follow-ups")}
                  </option>
                </select>
              </label>
            </div>
            {q.isFetching && <p role="status">{t("Loading follow-ups…")}</p>}
            {q.error && (
              <Notice error>
                {appError(q.error.message)}{" "}
                <RefreshButton
                  variant="outline"
                  disabled={locked || q.isFetching}
                  onClick={() => q.refetch()}
                 label={t("Reload follow-ups")} />
                {!!cursors.length && (
                  <Button
                    disabled={locked}
                    variant="outline"
                    onClick={() => {
                      setCursors([]);
                      move.current = true;
                    }}
                  >
                    {t("Return to first page")}
                  </Button>
                )}
              </Notice>
            )}
            {q.data && !q.error && !q.isFetching && (
              <>
                {!q.data.items.length ? (
                  <p>
                    {t(
                      "No follow-ups match this view. Try another status or include scheduled work.",
                    )}
                  </p>
                ) : (
                  <ul className="delivery-list">
                    {q.data.items.map((r) => (
                      <li key={r.kind + r.id}>
                        <div>
                          <h3>
                            {t("{0} with {1}", [r.learnerName, r.teacherName])}
                          </h3>
                          <p>
                            {appCurriculum(r.subject)} ·{" "}
                            {date(
                              r.nextContactAt || r.dueAt,
                              !!r.nextContactAt,
                            )}
                          </p>
                        </div>
                        <span className="delivery-status">
                          {t(statuses[r.status])}
                        </span>
                        <Button
                          disabled={!!selected || locked}
                          variant="outline"
                          onClick={() =>
                            setSelected({ kind: r.kind, id: r.id })
                          }
                        >
                          {t("Open follow-up")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="service-muted">
                  {t("Last updated")}: {date(q.data.asOf)} ·{" "}
                  {t("Times are shown in India Standard Time.")}
                </p>
              </>
            )}
            <div className="delivery-actions">
              <Button
                variant="outline"
                disabled={!!selected || q.isFetching || !cursors.length}
                onClick={() => {
                  setCursors((v) => v.slice(0, -1));
                  move.current = true;
                }}
              >
                {t("Previous follow-ups")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  !!selected || q.isFetching || !!q.error || !q.data?.nextCursor
                }
                onClick={() => {
                  setCursors((v) => [...v, q.data!.nextCursor!]);
                  move.current = true;
                }}
              >
                {t("Next follow-ups")}
              </Button>
              <RefreshButton
                variant="ghost"
                disabled={!!selected || q.isFetching}
                onClick={() => q.refetch()}
               label={t("Reload follow-ups")} />
            </div>
          </section>
        </>
      )}
    </section>
  );
}
function FollowupDetail({
  selected,
  session,
  onLock,
  refreshQueue,
}: {
  selected: { kind: string; id: string };
  session: Session;
  onLock: (v: boolean) => void;
  refreshQueue: () => Promise<void>;
}) {
  const {
      appText: t,
      appError,
      appLocale,
      appCurriculum,
    } = useAppTranslation(),
    [cursors, setCursors] = useState<string[]>([]),
    [outcome, setOutcome] = useState("CONTINUING"),
    [method, setMethod] = useState("PHONE"),
    [next, setNext] = useState(""),
    [category, setCategory] = useState("GENERAL"),
    [review, setReview] = useState<{
      path: string;
      body: S["ServiceContactInput"] | S["ServiceAssignmentInput"];
      label: string;
    } | null>(null),
    [revealed, setRevealed] = useState(false),
    [ack, setAck] = useState(false),
    [saved, setSaved] = useState(false),
    heading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    sending = useRef(false),
    path = "/admin/service-followups/" + selected.kind + "/" + selected.id;
  const q = useQuery({
    queryKey: [
      "service-detail",
      session.account.id,
      path,
      cursors.at(-1) || "",
    ],
    queryFn: ({ signal }) =>
      api<S["ServiceFollowupDetail"]>(
        path +
          "?limit=10" +
          (cursors.at(-1) ? "&cursor=" + cursors.at(-1) : ""),
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const decision = useDecision(session, async () => {
      const result = await q.refetch();
      if (result.error) throw result.error;
      await refreshQueue();
    }),
    data = q.error ? undefined : q.data,
    r = data?.followup,
    locked = decision.locked || q.isFetching || !!q.error,
    editing = locked || !!review;
  useEffect(() => {
    onLock(!!review || decision.locked);
    return () => onLock(false);
  }, [review, decision.locked, onLock]);
  useEffect(() => {
    (review ? reviewHeading : heading).current?.focus();
  }, [!!review, r?.id, cursors.at(-1)]);
  const date = (s: string, withTime = true) =>
    new Intl.DateTimeFormat(appLocale, {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" as const } : {}),
      timeZone: "Asia/Kolkata",
    }).format(new Date(s));
  function prepare(
    body: S["ServiceContactInput"] | S["ServiceAssignmentInput"],
    label: string,
    endpoint: string,
  ) {
    setRevealed(false);
    setSaved(false);
    setAck(false);
    decision.invalid("");
    setReview({ path: path + "/" + endpoint, body, label });
  }
  async function confirm() {
    if (!review || !ack || locked || saved || sending.current) return;
    sending.current = true;
    try {
      await decision.run({
        path: review.path,
        body: review.body,
        message:
          "Follow-up decision recorded. No call or email was sent by this screen.",
        onSaved: () => setSaved(true),
      });
    } finally {
      sending.current = false;
    }
  }
  return (
    <section className="delivery-detail">
      <Feedback decision={decision} />
      {q.isPending && <p role="status">{t("Loading follow-up details…")}</p>}
      {(q.error || decision.conflict) && (
        <RefreshButton
          variant="outline"
          disabled={decision.busy}
          onClick={() => decision.reload()}
         label={t("Reload follow-up details")} />
      )}
      {q.error && (
        <Notice error>
          {t(
            "Follow-up details are unavailable. Private records are hidden until access is restored.",
          )}{" "}
          {appError(q.error.message)}
        </Notice>
      )}
      {r && data && (
        <>
          <header>
            <h2 ref={heading} tabIndex={-1}>
              {t("{0} with {1}", [r.learnerName, r.teacherName])}
            </h2>
            <span className="delivery-status">{t(statuses[r.status])}</span>
          </header>
          <dl className="delivery-facts">
            <div>
              <dt>{t("Subject")}</dt>
              <dd>{appCurriculum(r.subject)}</dd>
            </div>
            <div>
              <dt>{t("Region")}</dt>
              <dd>{r.region}</dd>
            </div>
            <div>
              <dt>{t("Teaching commenced")}</dt>
              <dd>{date(r.startedAt, false)}</dd>
            </div>
            <div>
              <dt>{t("Thirty-day follow-up due")}</dt>
              <dd>{date(r.dueAt, false)}</dd>
            </div>
            <div>
              <dt>{t("Assigned staff")}</dt>
              <dd>
                {t(
                  r.assignedToId === session.account.id
                    ? "Assigned to me"
                    : r.assignedToId
                      ? "Assigned to another staff member"
                      : "Unassigned",
                )}
              </dd>
            </div>
            {r.nextContactAt && (
              <div>
                <dt>{t("Next contact attempt")}</dt>
                <dd>{date(r.nextContactAt)}</dd>
              </div>
            )}
          </dl>
          {!review && r.assignedToId === session.account.id && (
            <section className="service-contact-access">
              <Button
                variant="outline"
                disabled={editing}
                onClick={() => setRevealed((v) => !v)}
              >
                {t(
                  revealed
                    ? "Hide owner contact details"
                    : "Reveal owner contact details",
                )}
              </Button>
              {revealed && !q.isFetching && (
                <OwnerContactDetails path={path} session={session} />
              )}
            </section>
          )}
          <div className="service-observation">
            <h3>{t("Existing cohort observation")}</h3>
            <p>
              {t(
                !r.recordedObservation
                  ? "No cohort observation is recorded."
                  : r.recordedObservation.continued === null
                    ? "The recorded cohort outcome is unknown."
                    : r.recordedObservation.continued
                      ? "The recorded cohort outcome is continuing."
                      : "The recorded cohort outcome is not continuing.",
              )}
            </p>
            <p>
              {t(
                "This evidence is separate from the staff contact history below.",
              )}
            </p>
          </div>
          {r.supportCaseId && (
            <Link
              className="inline-link"
              href={"/dashboard/support?case=" + r.supportCaseId}
              aria-disabled={editing}
              tabIndex={editing ? -1 : undefined}
              onClick={(e) => {
                if (editing) e.preventDefault();
              }}
            >
              {t("Open linked support case")}
            </Link>
          )}
          {!review && (
            <>
              {r.assignedToId !== session.account.id ? (
                <Button
                  disabled={
                    locked || !!r.assignedToId || r.status === "COMPLETED"
                  }
                  onClick={() =>
                    prepare(
                      {
                        expectedVersion: r.version,
                        confirmed: true,
                        action: "CLAIM",
                      },
                      "Claim this follow-up",
                      "assignments",
                    )
                  }
                >
                  {t("Claim this follow-up")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={editing}
                  onClick={() =>
                    prepare(
                      {
                        expectedVersion: r.version,
                        confirmed: true,
                        action: "RELEASE",
                      },
                      "Release this follow-up",
                      "assignments",
                    )
                  }
                >
                  {t("Release this follow-up")}
                </Button>
              )}
              {r.assignedToId &&
                r.assignedToId !== session.account.id &&
                session.account.role === "ADMIN" && (
                  <Button
                    disabled={editing}
                    variant="outline"
                    onClick={() =>
                      prepare(
                        {
                          expectedVersion: r.version,
                          confirmed: true,
                          action: "RELEASE",
                        },
                        "Release this follow-up",
                        "assignments",
                      )
                    }
                  >
                    {t("Release this follow-up")}
                  </Button>
                )}
              {r.assignedToId === session.account.id &&
                r.status !== "COMPLETED" && (
                  <form
                    className="service-contact"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editing) return;
                      const body: S["ServiceContactInput"] = {
                        expectedVersion: r.version,
                        confirmed: true,
                        outcome: outcome as S["ServiceContactInput"]["outcome"],
                        method: method as S["ServiceContactInput"]["method"],
                      };
                      if (outcome === "NO_RESPONSE") {
                        const d = new Date(next + "+05:30");
                        if (
                          !next ||
                          !Number.isFinite(d.getTime()) ||
                          d.getTime() <= Date.now() ||
                          d.getTime() > Date.now() + 30 * 86400000
                        ) {
                          decision.invalid(
                            "Schedule the next attempt within the next thirty days.",
                          );
                          return;
                        }
                        body.nextContactAt = d.toISOString();
                      }
                      if (outcome === "HELP_REQUESTED")
                        body.supportCategory =
                          category as S["ServiceContactInput"]["supportCategory"];
                      prepare(body, "Record contact attempt", "contacts");
                    }}
                  >
                    <h3>{t("Record contact attempt")}</h3>
                    <p>
                      {t(
                        "Contact the learner or guardian through your approved staff process first. This form only records what happened.",
                      )}
                    </p>
                    <div className="service-filters">
                      <label>
                        {t("Contact method")}
                        <select
                          aria-label={t("Contact method")}
                          disabled={editing}
                          value={method}
                          onChange={(e) => setMethod(e.target.value)}
                        >
                          {Object.entries(methods).map(([k, v]) => (
                            <option key={k} value={k}>
                              {t(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("Contact outcome")}
                        <select
                          aria-label={t("Contact outcome")}
                          disabled={editing}
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                        >
                          {Object.entries(outcomes).map(([k, v]) => (
                            <option key={k} value={k}>
                              {t(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {outcome === "NO_RESPONSE" && (
                      <>
                        <label htmlFor="service-next">
                          {t("Next contact attempt")}
                        </label>
                        <Input
                          id="service-next"
                          required
                          type="datetime-local"
                          value={next}
                          disabled={editing}
                          onChange={(e) => setNext(e.target.value)}
                          aria-describedby="service-next-help"
                        />
                        <p id="service-next-help">
                          {t(
                            "Choose a future time within thirty days, in India Standard Time.",
                          )}
                        </p>
                      </>
                    )}
                    {outcome === "HELP_REQUESTED" && (
                      <label>
                        {t("Support category")}
                        <select
                          aria-label={t("Support category")}
                          disabled={editing}
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                        >
                          <option value="GENERAL">
                            {t("General support")}
                          </option>
                          <option value="SAFETY">{t("Safety concern")}</option>
                          <option value="REPLACEMENT">
                            {t("Teacher replacement")}
                          </option>
                        </select>
                      </label>
                    )}
                    <Button
                      type="submit"
                      disabled={editing || new Date(r.dueAt) > new Date()}
                    >
                      {t("Review contact record")}
                    </Button>
                    {new Date(r.dueAt) > new Date() && (
                      <p>
                        {t(
                          "The thirty-day follow-up is not due yet. Use support for earlier concerns.",
                        )}
                      </p>
                    )}
                  </form>
                )}
            </>
          )}
          {review && (
            <div className="delivery-recovery">
              <h3 ref={reviewHeading} tabIndex={-1}>
                {t("Review follow-up decision")}
              </h3>
              <strong>{t(review.label)}</strong>
              {"outcome" in review.body && (
                <dl className="delivery-facts">
                  <div>
                    <dt>{t("Contact outcome")}</dt>
                    <dd>{t(outcomes[review.body.outcome])}</dd>
                  </div>
                  <div>
                    <dt>{t("Contact method")}</dt>
                    <dd>{t(methods[review.body.method])}</dd>
                  </div>
                  {review.body.nextContactAt && (
                    <div>
                      <dt>{t("Next contact attempt")}</dt>
                      <dd>{date(review.body.nextContactAt)}</dd>
                    </div>
                  )}
                  {review.body.supportCategory && (
                    <div>
                      <dt>{t("Support category")}</dt>
                      <dd>
                        {t(
                          {
                            GENERAL: "General support",
                            SAFETY: "Safety concern",
                            REPLACEMENT: "Teacher replacement",
                          }[review.body.supportCategory],
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <Notice>
                {t(
                  "This changes the staff follow-up record only. A help request opens a linked support case; it does not close an arrangement or change tuition.",
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
                      {t(
                        "I reviewed the assignment or actual contact attempt and its effects.",
                      )}
                    </span>
                  </label>
                  <Button disabled={locked || !ack} onClick={confirm}>
                    {t("Confirm follow-up decision")}
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
                {t(saved ? "Done" : "Cancel review")}
              </Button>
            </div>
          )}
          <section className="delivery-timeline">
            <h3>{t("Contact attempt history")}</h3>
            {!data.contacts.length ? (
              <p>{t("No staff contact attempts are recorded yet.")}</p>
            ) : (
              <ol>
                {data.contacts.map((c) => (
                  <li key={c.id}>
                    <strong>{t(outcomes[c.outcome])}</strong>
                    <p>
                      {t(methods[c.method])} · {date(c.createdAt)} ·{" "}
                      {t(
                        c.actorId === session.account.id
                          ? "Recorded by you"
                          : "Recorded by staff",
                      )}
                    </p>
                    {c.nextContactAt && (
                      <p>
                        {t("Next contact attempt")}: {date(c.nextContactAt)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <div className="delivery-actions">
              <Button
                disabled={editing || !cursors.length}
                variant="outline"
                onClick={() => setCursors((v) => v.slice(0, -1))}
              >
                {t("Previous contacts")}
              </Button>
              <Button
                disabled={editing || !data.nextCursor}
                variant="outline"
                onClick={() => setCursors((v) => [...v, data.nextCursor!])}
              >
                {t("Next contacts")}
              </Button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function OwnerContactDetails({
  path,
  session,
}: {
  path: string;
  session: Session;
}) {
  const { appText: t, appError } = useAppTranslation(),
    heading = useRef<HTMLHeadingElement>(null);
  const q = useQuery({
    queryKey: ["service-owner-contact", session.account.id, path],
    queryFn: ({ signal }) =>
      api<{ email: string | null; phone: string | null }>(
        path + "/contact-details",
        { signal },
      ),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!q.isFetching) heading.current?.focus();
  }, [q.isFetching]);
  return (
    <div className="service-owner-contact">
      <h3 ref={heading} tabIndex={-1}>
        {t("Owner contact details")}
      </h3>
      <p>
        {t(
          "Use these details only for this assigned service follow-up. Access is audited. No call or message is sent here.",
        )}
      </p>
      {q.isFetching ? (
        <p role="status">{t("Loading owner contact details…")}</p>
      ) : q.error ? (
        <Notice error>{appError(q.error.message)}</Notice>
      ) : q.data ? (
        <dl className="delivery-facts">
          <div>
            <dt>{t("Email address")}</dt>
            <dd>{q.data.email || t("Not provided")}</dd>
          </div>
          <div>
            <dt>{t("Phone")}</dt>
            <dd>{q.data.phone || t("Not provided")}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
