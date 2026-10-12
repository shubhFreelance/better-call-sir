"use client";
import Link from "next/link";
import { BookOpen, CalendarDays, ShieldCheck } from "lucide-react";
import type { Dashboard, Session } from "@bcs/api-client";
import { Alert, AlertDescription } from "../components/ui/alert";
const date = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
export function FamilyOverview({
  dashboard: d,
  session,
}: {
  dashboard: Dashboard;
  session: Session;
}) {
  const guardian = session.account.role === "GUARDIAN";
  const lessons = (d.lessons || [])
    .filter(
      (l) =>
        l.status === "SCHEDULED" && new Date(l.startsAt).getTime() > Date.now(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3);
  const active = new Set(
    d.placements?.filter((p) => p.status === "ACTIVE").map((p) => p.teacherId),
  );
  const teachers = d.teachers?.filter((t) => active.has(t.id)) || [];
  const consent = !!d.consent && !d.consent.withdrawnAt;
  return (
    <div className="family-overview">
      <section className="family-intro">
        <BookOpen size={32} />
        <div>
          <h2>
            {guardian
              ? "Your family’s learning, together."
              : "Your next step in learning."}
          </h2>
          <p>
            {guardian
              ? "See what’s coming up, manage student access and keep your family’s learning moving."
              : "Your classes and learning team are here. Your guardian manages purchases, consent and private family notes."}
          </p>
        </div>
      </section>
      {guardian && (!session.account.verified || !consent) && (
        <Alert role="status">
          <AlertDescription>
            {!session.account.verified
              ? "Guardian verification is pending. Learner entry and student authorization are unavailable until your account is approved."
              : "Guardian consent is pending or withdrawn. New matching and student authorization are paused."}{" "}
            <Link className="inline-link" href="/onboarding/parent">
              Review guardian onboarding
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <section
        aria-label={guardian ? "Family activity" : "Your learning activity"}
        className="family-activity"
      >
        <div>
          <h3>{guardian ? "Family activity" : "Your learning activity"}</h3>
          <p>
            {date(d.window.start)}–{date(d.window.end)} IST ·{" "}
            {guardian ? "All learners" : "Your records"}
          </p>
        </div>
        <dl>
          {[
            ["Classes taken", d.metrics.classesTaken],
            ["Attendance pending", d.metrics.pendingAttendance],
            ["Disputed records", d.metrics.disputed],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="wizard-help">
          Classes taken count completed, undisputed lessons marked present or
          late. This summary comes from your recorded activity.
        </p>
      </section>
      {guardian && (
        <section className="panel family-learners">
          <div className="panel-title">
            <h2>Your learners</h2>
            <Link className="inline-link" href="/onboarding/parent">
              Add a learner through tuition onboarding
            </Link>
          </div>
          {d.children?.length ? (
            <ul>
              {d.children.map((child) => (
                <li key={child.id}>
                  <div>
                    <strong>{child.alias}</strong>
                    <p>
                      Class {child.grade} · {child.board}
                    </p>
                  </div>
                  <Link
                    className="button secondary"
                    href={`/dashboard/family?learner=${child.id}`}
                  >
                    Manage {child.alias}’s access
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No learners yet. Complete guardian onboarding to add a learner and
              their tuition needs.
            </p>
          )}
        </section>
      )}
      <div className="family-columns">
        <section className="panel">
          <div className="panel-title">
            <h2>
              <CalendarDays size={20} /> Coming up next
            </h2>
            <Link href="/dashboard/lessons" className="inline-link">
              View classes
            </Link>
          </div>
          {lessons.length ? (
            <ol className="family-lessons">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <strong>{lesson.subject}</strong>
                  <p>
                    {date(lesson.startsAt)}–{date(lesson.endsAt)} IST
                  </p>
                  <small>
                    {d.children?.find((c) => c.id === lesson.childId)?.alias ||
                      "Your learner"}{" "}
                    · Scheduled
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              No upcoming class is shown here. Open classes to review your
              available learning records.
            </p>
          )}
        </section>
        <section className="panel">
          <h2>Your learning team</h2>
          {teachers.length ? (
            <ul className="family-team">
              {teachers.map((t) => (
                <li key={t.id}>
                  <strong>{t.name}</strong>
                  <p>{t.subjects.join(" & ")}</p>
                  <Link href={`/teachers/${t.slug}`} className="inline-link">
                    View {t.name}’s profile
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {active.size
                ? "An assigned teacher’s public profile is currently unavailable. Contact support for help."
                : "No active teacher assignment yet."}
            </p>
          )}
          {guardian && (
            <Link className="inline-link" href="/dashboard/requests">
              Review tuition requests
            </Link>
          )}
        </section>
      </div>
      {guardian && (
        <section className="family-control">
          <ShieldCheck size={26} />
          <div>
            <h2>Your family stays in control.</h2>
            <p>
              Review authorized student sessions and manage consent. Student
              spaces keep guardian purchases and private notes out of view.
            </p>
          </div>
          <Link className="button secondary" href="/dashboard/family">
            Learners & access
          </Link>
        </section>
      )}
    </div>
  );
}
