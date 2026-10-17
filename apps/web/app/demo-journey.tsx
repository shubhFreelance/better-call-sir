"use client";
import { useAppTranslation } from "./locale";
import { useState } from "react";
import { MeetingAccess } from "./booking-payments";
import { useQuery } from "@tanstack/react-query";
import { api, Demo, Session, Teacher } from "@bcs/api-client";
type Act = (path: string, body?: unknown) => Promise<unknown>;
const date = (value: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const pretty = (value: string) => value.replaceAll("_", " ").toLowerCase();
function useDemos(session: Session | null) {
  return useQuery({
    queryKey: ["demos", session?.account.id],
    queryFn: () => api<{ items: Demo[] }>("/demos"),
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
        <input name="startsAt" type="datetime-local" required />
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
          <input name="reason" required maxLength={300} />
        </label>
      )}
      <p className="muted">
        {appText(
          "At least one hour ahead, within 60 days. Both parties must accept the same time. Proposals expire within 24 hours.",
        )}{" "}
      </p>
      <button className="button secondary" type="submit" disabled={pending}>
        {reschedule
          ? appText("Propose new demo time")
          : appText("Propose demo")}
      </button>
    </form>
  );
}
export function DemoJourney({
  session,
  act,
}: {
  session: Session | null;
  act: Act;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const query = useDemos(session);
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<{ items: Teacher[] }>("/teachers"),
  });
  if (query.isLoading) return <p>{appText("Loading demos…")}</p>;
  if (query.error) return <p role="alert">{appError(query.error.message)}</p>;
  if (!session || !query.data) return null;
  const reviewing = ["ADMIN", "OPERATOR"].includes(session.account.role);
  const items = reviewing
    ? query.data.items.filter((d) => d.status === "DISPUTED")
    : query.data.items;
  return (
    <section
      aria-label={
        reviewing ? appText("Demo dispute reviews") : appText("Demo scheduling")
      }
    >
      <h3>
        {reviewing ? appText("Demo dispute reviews") : appText("Your demos")}
      </h3>
      {!items.length && (
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
            "Teacher"
          }
          act={act}
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
  act,
}: {
  demo: Demo;
  session: Session;
  role: string;
  teacherName: string;
  act: Act;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const [reason, setReason] = useState(""),
    [reschedule, setReschedule] = useState(false),
    [pending, setPending] = useState(false);
  const run = async (path: string, body: unknown) => {
    setPending(true);
    try {
      return await act(path, body);
    } finally {
      setPending(false);
    }
  };
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
      className="panel demo-card"
      data-demo-id={d.id}
      aria-label={appText("Demo with {0}", [teacherName])}
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
        <button
          className="button"
          disabled={pending}
          onClick={() =>
            void run(`/demos/${d.id}/acceptances`, {
              expectedVersion: d.version,
            })
          }
        >
          {appText("Accept demo time")}{" "}
        </button>
      )}
      {!reviewing && future && ["PROPOSED", "CONFIRMED"].includes(d.status) && (
        <>
          <div className="action-row">
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => setReschedule(!reschedule)}
            >
              {appText("Reschedule demo")}{" "}
            </button>
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
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          </label>
          <button
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
          </button>
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
            <textarea name="reason" required maxLength={1000} />
          </label>
          <button className="button" disabled={pending}>
            {appText("Record demo outcome")}{" "}
          </button>
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
              <option value="NOT_COMPLETED">{appText("Not completed")}</option>
              <option value="COMPLETED">
                {appText("Completed after evidence review")}
              </option>
            </select>
          </label>
          <label className="field">
            <span>{appText("Review evidence and reason")}</span>
            <textarea name="reason" required maxLength={1000} />
          </label>
          <button className="button" disabled={pending}>
            {appText("Resolve demo dispute")}{" "}
          </button>
        </form>
      )}
    </article>
  );
}
