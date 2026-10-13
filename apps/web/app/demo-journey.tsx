"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Demo, Session, Teacher } from "@bcs/api-client";
type Act = (path: string, body?: unknown) => Promise<unknown>;
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
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
        <span>Demo start (IST)</span>
        <input name="startsAt" type="datetime-local" required />
      </label>
      <label className="field">
        <span>Demo duration</span>
        <select name="duration" defaultValue="30">
          <option value="20">20 minutes</option>
          <option value="30">30 minutes</option>
          <option value="40">40 minutes</option>
        </select>
      </label>
      {reschedule && (
        <label className="field">
          <span>Reason for rescheduling</span>
          <input name="reason" required maxLength={300} />
        </label>
      )}
      <p className="muted">
        At least one hour ahead, within 60 days. Both parties must accept the
        same time. Proposals expire within 24 hours.
      </p>
      <button className="button secondary" type="submit" disabled={pending}>
        {reschedule ? "Propose new demo time" : "Propose demo"}
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
  const query = useDemos(session);
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<{ items: Teacher[] }>("/teachers"),
  });
  if (query.isLoading) return <p>Loading demos…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!session || !query.data) return null;
  const reviewing = ["ADMIN", "OPERATOR"].includes(session.account.role);
  const items = reviewing
    ? query.data.items.filter((d) => d.status === "DISPUTED")
    : query.data.items;
  return (
    <section
      aria-label={reviewing ? "Demo dispute reviews" : "Demo scheduling"}
    >
      <h3>{reviewing ? "Demo dispute reviews" : "Your demos"}</h3>
      {!items.length && (
        <p className="muted">
          {reviewing
            ? "No demo disputes awaiting review."
            : "Arrange a demo from an accepted teacher recommendation in Tuition requests."}
        </p>
      )}
      {items.map((d) => (
        <DemoCard
          key={d.id}
          demo={d}
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
  role,
  teacherName,
  act,
}: {
  demo: Demo;
  role: string;
  teacherName: string;
  act: Act;
}) {
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
      aria-label={`Demo with ${teacherName}`}
    >
      <div className="panel-title">
        <h3>Demo with {teacherName}</h3>
        <span className="badge">
          {d.status === "PROPOSED" && !proposed
            ? "proposal expired"
            : pretty(d.status)}
        </span>
      </div>
      <p>
        {date(r.startsAt)} – {date(r.endsAt)} · IST
      </p>
      <p className="muted">
        Version {d.version} · Guardian{" "}
        {d.guardianAccepted ? "accepted" : "pending"} · Teacher{" "}
        {d.teacherAccepted ? "accepted" : "pending"}
      </p>
      {r.expiresAt && d.status === "PROPOSED" && (
        <p>Accept before {date(r.expiresAt)}.</p>
      )}
      <p className="muted">
        This is a scheduling record. Private meeting access is provided
        separately when a meeting is ready.
      </p>
      {outcome && <p>Your recorded outcome: {pretty(outcome)}.</p>}
      {d.status === "DISPUTED" && (
        <p role="status">
          Support case {d.supportCaseId}: awaiting operator review. Tuition
          terms remain blocked.
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
          Accept demo time
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
              Reschedule demo
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
            <span>Cancellation reason</span>
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
            Cancel demo
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
            <span>Demo outcome</span>
            <select name="outcome">
              <option value="COMPLETED">Completed</option>
              <option value="NO_SHOW">No-show</option>
              <option value="DISPUTED">Disputed</option>
            </select>
          </label>
          <label className="field">
            <span>Outcome details</span>
            <textarea name="reason" required maxLength={1000} />
          </label>
          <button className="button" disabled={pending}>
            Record demo outcome
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
            <span>Reviewed demo resolution</span>
            <select name="resolution">
              <option value="NOT_COMPLETED">Not completed</option>
              <option value="COMPLETED">Completed after evidence review</option>
            </select>
          </label>
          <label className="field">
            <span>Review evidence and reason</span>
            <textarea name="reason" required maxLength={1000} />
          </label>
          <button className="button" disabled={pending}>
            Resolve demo dispute
          </button>
        </form>
      )}
    </article>
  );
}
