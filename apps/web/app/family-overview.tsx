"use client";
import { useAppTranslation } from "./locale";
import { educationLabel } from "./learner-education";
import Link from "next/link";
import { BookOpen, CalendarDays, ShieldCheck } from "lucide-react";
import type { Dashboard, Session } from "@bcs/api-client";
import { Alert, AlertDescription } from "../components/ui/alert";
const date = (iso: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

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
              ? appText("Your family’s learning, together.")
              : appText("Your next step in learning.")}
          </h2>
          <p>
            {guardian
              ? appText(
                  "See what’s coming up, manage student access and keep your family’s learning moving.",
                )
              : appText(
                  "Your classes and learning team are here. Your guardian manages purchases, consent and private family notes.",
                )}
          </p>
        </div>
      </section>
      {guardian && (!session.account.verified || !consent) && (
        <Alert role="status">
          <AlertDescription>
            {!session.account.verified
              ? appText(
                  "Guardian verification is pending. Learner entry and student authorization are unavailable until your account is approved.",
                )
              : appText(
                  "Guardian consent is pending or withdrawn. New matching and student authorization are paused.",
                )}{" "}
            <Link className="inline-link" href="/onboarding/parent">
              {appText("Review guardian onboarding")}{" "}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <section
        aria-label={
          guardian
            ? appText("Family activity")
            : appText("Your learning activity")
        }
        className="family-activity"
      >
        <div>
          <h3>
            {guardian
              ? appText("Family activity")
              : appText("Your learning activity")}
          </h3>
          <p>
            {date(d.window.start, appLocale)}–{date(d.window.end, appLocale)}{" "}
            {appText("IST ·")}{" "}
            {guardian ? appText("All learners") : appText("Your records")}
          </p>
        </div>
        <dl>
          {[
            ["Classes taken", d.metrics.classesTaken],
            ["Attendance pending", d.metrics.pendingAttendance],
            ["Disputed records", d.metrics.disputed],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{appText(label)}</dt>
              <dd>{value ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="wizard-help">
          {appText(
            "Classes taken count completed, undisputed lessons marked present or late. This summary comes from your recorded activity.",
          )}{" "}
        </p>
      </section>
      {guardian && (
        <section className="panel family-learners">
          <div className="panel-title">
            <h2>{appText("Your learners")}</h2>
            <Link className="inline-link" href="/onboarding/parent">
              {appText("Add a learner through tuition onboarding")}{" "}
            </Link>
          </div>
          {d.children?.length ? (
            <ul>
              {d.children.map((child) => (
                <li key={child.id}>
                  <div>
                    <strong>{child.alias}</strong>
                    <p>{appText(educationLabel(child))}</p>
                  </div>
                  <Link
                    className="button secondary"
                    href={`/dashboard/family?learner=${child.id}`}
                  >
                    {appText("Manage")} {child.alias}
                    {appText("’s access")}{" "}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {appText(
                "No learners yet. Complete guardian onboarding to add a learner and their tuition needs.",
              )}{" "}
            </p>
          )}
        </section>
      )}
      <div className="family-columns">
        <section className="panel">
          <div className="panel-title">
            <h2>
              <CalendarDays size={20} /> {appText("Coming up next")}{" "}
            </h2>
            <Link href="/dashboard/lessons" className="inline-link">
              {appText("View classes")}{" "}
            </Link>
          </div>
          {lessons.length ? (
            <ol className="family-lessons">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <strong>{appCurriculum(lesson.subject)}</strong>
                  <p>
                    {date(lesson.startsAt, appLocale)}–
                    {date(lesson.endsAt, appLocale)} {appText("IST")}{" "}
                  </p>
                  <small>
                    {d.children?.find((c) => c.id === lesson.childId)?.alias ||
                      appText("Your learner")}{" "}
                    {appText("· Scheduled")}{" "}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              {appText(
                "No upcoming class is shown here. Open classes to review your available learning records.",
              )}{" "}
            </p>
          )}
        </section>
        <section className="panel">
          <h2>{appText("Your learning team")}</h2>
          {teachers.length ? (
            <ul className="family-team">
              {teachers.map((t) => (
                <li key={t.id}>
                  <strong>{t.name}</strong>
                  <p>
                    {t.subjects
                      .map((value) => appCurriculum(value))
                      .join(" & ")}
                  </p>
                  <Link href={`/teachers/${t.slug}`} className="inline-link">
                    {appText("View")} {t.name}
                    {appText("’s profile")}{" "}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {active.size
                ? appText(
                    "An assigned teacher’s public profile is currently unavailable. Contact support for help.",
                  )
                : appText("No active teacher assignment yet.")}
            </p>
          )}
          {guardian && (
            <Link className="inline-link" href="/dashboard/requests">
              {appText("Review tuition requests")}{" "}
            </Link>
          )}
        </section>
      </div>
      {guardian && (
        <section className="family-control">
          <ShieldCheck size={26} />
          <div>
            <h2>{appText("Your family stays in control.")}</h2>
            <p>
              {appText(
                "Review authorized student sessions and manage consent. Student spaces keep guardian purchases and private notes out of view.",
              )}{" "}
            </p>
          </div>
          <Link className="button secondary" href="/dashboard/family">
            {appText("Learners & access")}{" "}
          </Link>
        </section>
      )}
    </div>
  );
}
