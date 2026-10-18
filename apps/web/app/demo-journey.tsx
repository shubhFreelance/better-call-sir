"use client";
import { Input as SharedInput } from "../components/ui/input";
import { Button as SharedButton } from "../components/ui/button";
import { Textarea as SharedTextarea } from "../components/ui/textarea";
import { useAppTranslation } from "./locale";
import { useState, useRef, useEffect, useCallback } from "react";
import { useHistory, HistoryPages } from "./history";
import { Feedback, useDecision } from "./tuition-workflow";
import { Button } from "../components/ui/button";
import { MeetingAccess } from "./booking-payments";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Demo, Session, Teacher } from "@bcs/api-client";
const date = (value: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const pretty = (value: string) => value.replaceAll("_", " ").toLowerCase();
function useDemos(session: Session | null) {
  const staff =
    !!session && ["ADMIN", "OPERATOR"].includes(session.account.role);
  return useHistory<{ items: Demo[]; nextCursor?: string | null }>({
    queryKey: ["demos", session?.account.id, staff ? "DISPUTED" : "ALL"],
    path: "/demos" + (staff ? "?status=DISPUTED" : ""),
    enabled:
      !!session &&
      ["GUARDIAN", "TEACHER", "ADMIN", "OPERATOR"].includes(
        session.account.role,
      ),
  });
}
function DemoSlot({
  submit,
  reschedule = false,
  pending,
}: {
  submit: (body: {
    startsAt: string;
    duration: number;
    reason?: string;
  }) => Promise<unknown>;
  reschedule?: boolean;
  pending: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  return (
    <form
      className="form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        await submit({
          startsAt: new Date(
            String(form.get("startsAt")) + ":00+05:30",
          ).toISOString(),
          duration: Number(form.get("duration")),
          ...(reschedule ? { reason: String(form.get("reason")) } : {}),
        });
      }}
    >
      <label className="field">
        <span>{appText("Demo start (IST)")}</span>
        <SharedInput name="startsAt" type="datetime-local" required />
      </label>
      <label className="field">
        <span>{appText("Demo duration")}</span>
        <select name="duration" defaultValue="30">
          <option value="20">{appText("20 minutes")}</option>
          <option value="30">{appText("30 minutes")}</option>
          <option value="40">{appText("40 minutes")}</option>
        </select>
      </label>
      {reschedule && (
        <label className="field">
          <span>{appText("Reason for rescheduling")}</span>
          <SharedInput name="reason" required maxLength={300} />
        </label>
      )}
      <p className="muted">
        {appText(
          "At least one hour ahead, within 60 days. Both parties must accept the same time. Proposals expire within 24 hours.",
        )}{" "}
      </p>
      <SharedButton
        data-legacy-action=""
        variant="outline"
        className="button secondary"
        type="submit"
        disabled={pending}
      >
        {reschedule
          ? appText("Propose new demo time")
          : appText("Propose demo")}
      </SharedButton>
    </form>
  );
}
export function DemoJourney({ session }: { session: Session | null }) {
  const { appText } = useAppTranslation(),
    client = useQueryClient(),
    query = useDemos(session);
  const [locks, setLocks] = useState<Set<string>>(() => new Set());
  const onLock = useCallback(
    (id: string, locked: boolean) =>
      setLocks((previous) => {
        if (previous.has(id) === locked) return previous;
        const next = new Set(previous);
        if (locked) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const retained = useRef<{ actor: string; items: Demo[] } | null>(null);
  if (query.data && session)
    retained.current = { actor: session.account.id, items: query.data.items };
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<{ items: Teacher[] }>("/teachers"),
  });
  if (
    !session ||
    !["GUARDIAN", "TEACHER", "ADMIN", "OPERATOR"].includes(session.account.role)
  )
    return null;
  const reviewing = ["ADMIN", "OPERATOR"].includes(session.account.role),
    rows =
      query.data?.items ||
      (locks.size && retained.current?.actor === session.account.id
        ? retained.current.items.filter((item) => locks.has(item.id))
        : []),
    items = reviewing ? rows.filter((d) => d.status === "DISPUTED") : rows;
  async function refresh() {
    const r = await query.refetch();
    if (r.error) throw r.error;
    await client.invalidateQueries({ queryKey: ["dashboard"] });
  }
  return (
    <section
      aria-label={
        reviewing ? appText("Demo dispute reviews") : appText("Demo scheduling")
      }
    >
      <h2>
        {reviewing ? appText("Demo dispute reviews") : appText("Your demos")}
      </h2>
      <HistoryPages
        history={query}
        label="Optional demo history"
        disabled={locks.size > 0}
      />
      {!query.isPending && !query.error && !items.length && (
        <p className="muted">
          {reviewing
            ? appText("No demo disputes awaiting review.")
            : appText(
                "Arrange a demo from an accepted teacher recommendation in Tuition requests.",
              )}
        </p>
      )}
      {items.map((d) => (
        <DemoCard
          key={d.id}
          demo={d}
          session={session}
          role={session.account.role}
          teacherName={
            teachers.data?.items.find((t) => t.id === d.teacherId)?.name ||
            appText("Teacher")
          }
          refresh={refresh}
          onLock={onLock}
          unavailable={!!query.error}
        />
      ))}
    </section>
  );
}
function DemoCard({
  demo: d,
  session,
  role,
  teacherName,
  refresh,
  onLock,
  unavailable,
}: {
  demo: Demo;
  session: Session;
  role: string;
  teacherName: string;
  refresh: () => Promise<void>;
  onLock: (id: string, locked: boolean) => void;
  unavailable: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const [reason, setReason] = useState(""),
    [reschedule, setReschedule] = useState(false),
    [dirty, setDirty] = useState(false),
    root = useRef<HTMLElement>(null),
    focusSaved = useRef(false);
  const decision = useDecision(session, refresh),
    pending = decision.locked;
  useEffect(() => {
    onLock(d.id, pending || reschedule || dirty);
    return () => onLock(d.id, false);
  }, [d.id, pending, reschedule, dirty, onLock]);
  const run = async (path: string, body: unknown) => {
    if (decision.locked) return false;
    onLock(d.id, true);
    return decision.run({
      path,
      body,
      message: "Demo decision recorded.",
      onSaved: () => {
        setReason("");
        setReschedule(false);
        setDirty(false);
        focusSaved.current = true;
      },
    });
  };
  useEffect(() => {
    if (focusSaved.current && !decision.busy && !unavailable) {
      focusSaved.current = false;
      root.current?.focus();
    }
  }, [decision.busy, unavailable, d.version]);
  const discardButton = (dirty || reschedule) && (
    <Button
      variant="ghost"
      disabled={decision.locked}
      onClick={() => {
        root.current?.querySelectorAll("form").forEach((form) => form.reset());
        setDirty(false);
        setReason("");
        setReschedule(false);
        root.current?.focus();
      }}
    >
      {appText("Discard demo edits")}
    </Button>
  );
  const recovery = (
    <>
      <Feedback decision={decision} />
      {(decision.conflict || unavailable) && (
        <Button
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => {
            focusSaved.current = true;
            void decision.reload();
          }}
        >
          {appText("Refresh current demo")}
        </Button>
      )}
    </>
  );
  if (unavailable)
    return (
      <article className="panel demo-card">
        {recovery}
        {discardButton}
      </article>
    );
  const r = d.reservation,
    reviewing = ["ADMIN", "OPERATOR"].includes(role),
    future = new Date(r.startsAt) > new Date();
  const proposed =
    d.status === "PROPOSED" &&
    r.status === "HOLD" &&
    !!r.expiresAt &&
    new Date(r.expiresAt) > new Date();
  const accepted = role === "GUARDIAN" ? d.guardianAccepted : d.teacherAccepted;
  const outcome = role === "GUARDIAN" ? d.guardianOutcome : d.teacherOutcome;
  const canReport =
    d.status === "CONFIRMED" && new Date(r.endsAt) <= new Date() && !outcome;
  return (
    <article
      ref={root}
      tabIndex={-1}
      onChangeCapture={() => setDirty(true)}
      className="panel demo-card"
      data-demo-id={d.id}
      aria-label={appText("Demo with {0}", [teacherName])}
    >
      {recovery}
      {discardButton}
      <fieldset
        className="demo-fields"
        disabled={decision.locked}
        aria-label={appText("Demo details and actions")}
      >
        <div className="panel-title">
          <h3>
            {appText("Demo with")} {teacherName}
          </h3>
          <span className="badge">
            {d.status === "PROPOSED" && !proposed
              ? appText("proposal expired")
              : appText(pretty(d.status))}
          </span>
        </div>
        <p>
          {date(r.startsAt, appLocale)} – {date(r.endsAt, appLocale)}{" "}
          {appText("· IST")}{" "}
        </p>
        <p className="muted">
          {appText("Version")} {d.version} {appText("· Guardian")}{" "}
          {d.guardianAccepted ? appText("accepted") : appText("pending")}{" "}
          {appText("· Teacher")}{" "}
          {d.teacherAccepted ? appText("accepted") : appText("pending")}
        </p>
        {r.expiresAt && d.status === "PROPOSED" && (
          <p>
            {appText("Accept before")} {date(r.expiresAt, appLocale)}.
          </p>
        )}
        <p className="muted">
          {appText(
            "This is a scheduling record. Private meeting access is provided separately when a meeting is ready.",
          )}{" "}
        </p>
        {d.status === "CONFIRMED" && (
          <MeetingAccess session={session} reservationId={r.id} confirmed />
        )}
        {outcome && (
          <p>
            {appText("Your recorded outcome:")} {appText(pretty(outcome))}.
          </p>
        )}
        {d.status === "DISPUTED" && (
          <p role="status">
            {appText("Support case")} {d.supportCaseId}
            {appText(
              ": awaiting operator review. Tuition terms remain blocked.",
            )}{" "}
          </p>
        )}
        {!reviewing && proposed && !accepted && (
          <SharedButton
            data-legacy-action=""
            variant="default"
            className="button"
            disabled={pending}
            onClick={() =>
              void run(`/demos/${d.id}/acceptances`, {
                expectedVersion: d.version,
              })
            }
          >
            {appText("Accept demo time")}{" "}
          </SharedButton>
        )}
        {!reviewing &&
          future &&
          ["PROPOSED", "CONFIRMED"].includes(d.status) && (
            <>
              <div className="action-row">
                <SharedButton
                  data-legacy-action=""
                  variant="outline"
                  className="button secondary"
                  disabled={pending}
                  onClick={() => setReschedule(!reschedule)}
                >
                  {appText("Reschedule demo")}{" "}
                </SharedButton>
              </div>
              {reschedule && (
                <DemoSlot
                  reschedule
                  pending={pending}
                  submit={async (body) => {
                    const result = await run(`/demos/${d.id}/reschedules`, {
                      expectedVersion: d.version,
                      ...body,
                    });
                    if (result) setReschedule(false);
                    return result;
                  }}
                />
              )}
              <label className="field">
                <span>{appText("Cancellation reason")}</span>
                <SharedInput
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={300}
                />
              </label>
              <SharedButton
                data-legacy-action=""
                variant="outline"
                className="button secondary"
                disabled={pending || !reason.trim()}
                onClick={() =>
                  void run(`/demos/${d.id}/cancellations`, {
                    expectedVersion: d.version,
                    reason,
                  })
                }
              >
                {appText("Cancel demo")}{" "}
              </SharedButton>
            </>
          )}
        {canReport && (
          <form
            className="form-panel"
            onSubmit={async (e) => {
              e.preventDefault();
              const body = new FormData(e.currentTarget);
              await run(`/demos/${d.id}/outcomes`, {
                expectedVersion: d.version,
                outcome: body.get("outcome"),
                reason: body.get("reason"),
              });
            }}
          >
            <label className="field">
              <span>{appText("Demo outcome")}</span>
              <select name="outcome">
                <option value="COMPLETED">{appText("Completed")}</option>
                <option value="NO_SHOW">{appText("No-show")}</option>
                <option value="DISPUTED">{appText("Disputed")}</option>
              </select>
            </label>
            <label className="field">
              <span>{appText("Outcome details")}</span>
              <SharedTextarea name="reason" required maxLength={1000} />
            </label>
            <SharedButton
              data-legacy-action=""
              variant="default"
              className="button"
              disabled={pending}
            >
              {appText("Record demo outcome")}{" "}
            </SharedButton>
          </form>
        )}
        {reviewing && d.status === "DISPUTED" && (
          <form
            className="form-panel"
            onSubmit={async (e) => {
              e.preventDefault();
              const body = new FormData(e.currentTarget);
              await run(`/admin/demos/${d.id}/reviews`, {
                expectedVersion: d.version,
                resolution: body.get("resolution"),
                reason: body.get("reason"),
              });
            }}
          >
            <label className="field">
              <span>{appText("Reviewed demo resolution")}</span>
              <select name="resolution">
                <option value="NOT_COMPLETED">
                  {appText("Not completed")}
                </option>
                <option value="COMPLETED">
                  {appText("Completed after evidence review")}
                </option>
              </select>
            </label>
            <label className="field">
              <span>{appText("Review evidence and reason")}</span>
              <SharedTextarea name="reason" required maxLength={1000} />
            </label>
            <SharedButton
              data-legacy-action=""
              variant="default"
              className="button"
              disabled={pending}
            >
              {appText("Resolve demo dispute")}{" "}
            </SharedButton>
          </form>
        )}
      </fieldset>
    </article>
  );
}
