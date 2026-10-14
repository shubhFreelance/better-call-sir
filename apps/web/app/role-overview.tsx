"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays } from "lucide-react";
import {
  api,
  type Session,
  type Dashboard,
  type components,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Notice } from "./tuition-workflow";
type Summary = components["schemas"]["LearningDashboard"];
type Metrics = components["schemas"]["LearningMetrics"];
type Range = { from: string; to: string };
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const percent = (n: number, d: number) =>
  d
    ? new Intl.NumberFormat("en-IN", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(n / d)
    : "Not estimable";
const kind = (v: string) =>
  v === "RECURRING"
    ? "Recurring tuition"
    : v === "REVISION"
      ? "Revision sessions"
      : v.toLowerCase().replaceAll("_", " ");
const today = () =>
  new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
function preset(value: string): Range {
  const now = today(),
    first = new Date(now.slice(0, 7) + "-01T00:00:00Z");
  return value === "MONTH"
    ? { from: now.slice(0, 7) + "-01", to: now }
    : {
        from: new Date(
          Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1),
        )
          .toISOString()
          .slice(0, 10),
        to: new Date(first.getTime() - 86400000).toISOString().slice(0, 10),
      };
}
export function RoleOverview({
  session,
  dashboard,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const teacher = session.account.role === "TEACHER",
    guardian = session.account.role === "GUARDIAN";
  const [range, setRange] = useState<Range | null>(null),
    [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1),
    params = new URLSearchParams();
  if (range) {
    params.set("from", range.from + "T00:00:00+05:30");
    params.set(
      "to",
      new Date(
        Date.parse(range.to + "T00:00:00+05:30") + 86400000,
      ).toISOString(),
    );
  }
  if (cursor) params.set("cursor", cursor);
  const query = useQuery({
    queryKey: ["learning-dashboard", session.account.id, params.toString()],
    queryFn: ({ signal }) =>
      api<Summary>("/dashboard/learning?" + params, { signal }),
  });
  const data = query.data;
  return (
    <div className="care-workspace role-overview">
      <section className="care-intro">
        <BookOpen size={30} aria-hidden="true" />
        <h2>
          {teacher
            ? "Your teaching, with a clear record."
            : guardian
              ? "Your family’s learning, together."
              : "Your next step in learning."}
        </h2>
        <p>
          {teacher
            ? "See your assigned learners, recorded teaching and attendance that needs attention."
            : guardian
              ? "Follow each learner’s classes, teachers and next steps in one place."
              : "Your classes, teachers and attendance belong here. Your guardian manages purchases and family permissions."}
        </p>
      </section>
      {guardian &&
        (!session.account.verified ||
          !dashboard.consent ||
          dashboard.consent.withdrawnAt) && (
          <Notice>
            {!session.account.verified
              ? "Guardian verification is pending. Learner entry and student authorization are unavailable until your account is approved."
              : "Guardian consent is pending or withdrawn. New matching and student authorization are paused."}{" "}
            <Link className="inline-link" href="/onboarding/parent">
              Review guardian onboarding
            </Link>
          </Notice>
        )}
      <LearningPeriod
        apply={(value) => {
          setRange(value);
          setCursors([]);
        }}
      />
      {query.isPending && <p role="status">Loading your recorded activity…</p>}
      {query.error && (
        <Notice error>
          Recorded activity could not be refreshed.{" "}
          {data
            ? "The displayed records are from the last successful read."
            : "Totals are unavailable; this is not a zero-activity result."}{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry recorded activity
          </Button>
        </Notice>
      )}
      {data && (
        <>
          <section
            className="care-card role-activity"
            aria-label={
              guardian
                ? "Family activity"
                : teacher
                  ? "Teaching activity"
                  : "Your learning activity"
            }
          >
            <div className="role-section-heading">
              <h3>
                {teacher
                  ? "Teaching activity"
                  : guardian
                    ? "Family activity"
                    : "Your learning activity"}
              </h3>
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() => query.refetch()}
              >
                Refresh activity
              </Button>
            </div>
            <p>
              {date(data.window.from)}–{date(data.window.to)} IST (end
              excluded). Lesson start selects this period.
            </p>
            <p className="care-help">
              Updated {date(data.lastUpdated)} IST. Counts reflect current
              records, including later corrections.
            </p>
            <dl className="role-metrics">
              {(teacher
                ? [
                    ["Completed lessons", data.metrics.completedLessons],
                    [
                      "Distinct students taught",
                      data.metrics.uniqueStudentsTaught,
                    ],
                    ["Active assigned students", data.activeStudents],
                    [
                      "Attendance recorded",
                      `${data.metrics.attendanceRecorded} / ${data.metrics.attendanceDue}`,
                    ],
                  ]
                : [
                    ["Classes taken", data.metrics.classesTaken],
                    ["Completed lesson records", data.metrics.completedLessons],
                    [
                      "Pending family confirmations",
                      data.metrics.pendingConfirmations,
                    ],
                    ["Disputed records", data.metrics.disputed],
                  ]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="care-help">
              Classes taken count completed, undisputed lessons marked present
              or late after lesson end. Completed lesson records describe status
              separately. Counts describe service activity, not learning
              improvement.
            </p>
            {teacher && (
              <div className="role-teaching-evidence">
                <div>
                  <h4>Attendance completeness</h4>
                  <strong>
                    {percent(
                      data.metrics.attendanceRecorded,
                      data.metrics.attendanceDue,
                    )}
                  </strong>
                  <p>
                    {data.metrics.attendanceRecorded} undisputed attendance
                    records / {data.metrics.attendanceDue} ended, non-cancelled
                    lessons. Pending and disputed records remain outside the
                    numerator.
                  </p>
                </div>
                <div>
                  <h4>Private feedback sample</h4>
                  <strong>
                    {data.metrics.feedbackAverage == null
                      ? "No eligible feedback"
                      : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(data.metrics.feedbackAverage)} / 5`}
                  </strong>
                  <p>
                    {data.metrics.feedbackSampleSize ?? 0} eligible attended
                    lessons with feedback. This is a recorded rating average;
                    comments remain in your private lesson history.
                  </p>
                </div>
              </div>
            )}
            {!data.metrics.lessons && (
              <Notice>
                No lesson records start in this period. Upcoming lessons and
                current assignments can still appear below.
              </Notice>
            )}
            <ServiceTable metrics={data.metrics} rows={data.serviceKinds} />
            <dl className="role-record-status">
              <div>
                <dt>Attendance pending</dt>
                <dd>{data.metrics.pendingAttendance}</dd>
              </div>
              <div>
                <dt>Recorded absences</dt>
                <dd>{data.metrics.absent}</dd>
              </div>
              <div>
                <dt>Cancelled lessons</dt>
                <dd>{data.metrics.cancelled}</dd>
              </div>
              {teacher && (
                <div>
                  <dt>Disputed lesson records</dt>
                  <dd>{data.metrics.disputed}</dd>
                </div>
              )}
              {teacher && (
                <div>
                  <dt>Pending family confirmations</dt>
                  <dd>{data.metrics.pendingConfirmations}</dd>
                </div>
              )}
            </dl>
            <p className="care-help">
              Attendance and cancellation counts describe these lesson records;
              they do not assign responsibility or infer a teacher no-show.
            </p>
            <DemoSummary demos={data.demos} />
            <Link className="inline-link" href="/dashboard/lessons">
              Open calendar & attendance history
            </Link>
          </section>
          {teacher && (
            <section className="care-card">
              <h3>Your teaching profile</h3>
              {data.profile ? (
                <>
                  <strong>{data.profile.name}</strong>
                  <p>
                    {data.profile.subjects.join(" & ")} · Recorded status:{" "}
                    {data.profile.status.toLowerCase().replaceAll("_", " ")}
                  </p>
                  <p className="care-help">
                    Approval depends on current screening and available
                    capacity.
                  </p>
                </>
              ) : (
                <p>
                  No teaching profile yet. Complete your teacher application
                  before assignments can be confirmed.
                </p>
              )}
              <Link className="inline-link" href="/onboarding/teacher">
                Review teacher application
              </Link>
            </section>
          )}
          <section
            className="role-learners"
            aria-label={
              teacher
                ? "Assigned learner records"
                : guardian
                  ? "Your learners"
                  : "Your learner record"
            }
          >
            <div className="role-section-heading">
              <h3>
                {teacher
                  ? "Assigned learner records"
                  : guardian
                    ? "Your learners"
                    : "Your learner record"}
              </h3>
              {guardian && (
                <Link className="inline-link" href="/onboarding/parent">
                  Add a learner through tuition onboarding
                </Link>
              )}
            </div>
            <p className="care-help">
              {guardian || teacher
                ? "Current assignments and the next scheduled lesson are independent of the selected period. History can include ended assignments. Each page shows up to 20 learners; the totals above cover all authorized records."
                : "Your current teacher and next scheduled class appear here, independently of the activity dates you choose."}
            </p>
            {!data.learners.length && (
              <div className="care-card">
                <p>
                  {teacher
                    ? "No authorized learner assignments or lesson/demo history yet."
                    : guardian
                      ? "No learners yet. Complete guardian onboarding to add a learner and their tuition needs."
                      : "No authorized learner record is available. Ask your guardian to review access."}
                </p>
              </div>
            )}
            <div className="role-learner-grid">
              {data.learners.map((item) => (
                <article
                  className="care-card role-learner"
                  key={item.learner.id}
                  aria-label={`${item.learner.alias}’s learning`}
                >
                  <header>
                    <h4>{item.learner.alias}</h4>
                    <p>
                      Class {item.learner.grade} · {item.learner.board}
                    </p>
                  </header>
                  <dl className="role-record-status">
                    <div>
                      <dt>Classes taken in this period</dt>
                      <dd>{item.metrics.classesTaken}</dd>
                    </div>
                    <div>
                      <dt>Cancelled lessons</dt>
                      <dd>{item.metrics.cancelled}</dd>
                    </div>
                    <div>
                      <dt>Pending family confirmations</dt>
                      <dd>{item.metrics.pendingConfirmations}</dd>
                    </div>
                    <div>
                      <dt>Disputed records</dt>
                      <dd>{item.metrics.disputed}</dd>
                    </div>
                  </dl>
                  <div className="role-next">
                    <h5>
                      <CalendarDays size={17} aria-hidden="true" /> Next
                      scheduled class
                    </h5>
                    {item.nextLesson ? (
                      <>
                        <strong>{item.nextLesson.subject}</strong>
                        <p>
                          {date(item.nextLesson.startsAt)}–
                          {date(item.nextLesson.endsAt)} IST
                        </p>
                        <p>
                          {kind(item.nextLesson.kind)} with{" "}
                          {item.nextLesson.teacherName}
                        </p>
                      </>
                    ) : (
                      <p>No upcoming scheduled lesson is recorded.</p>
                    )}
                  </div>
                  <div className="role-assignments">
                    <h5>
                      Current recurring teacher
                      {item.assignments.length === 1 ? "" : "s"}
                    </h5>
                    {item.assignments.length ? (
                      <ul>
                        {item.assignments.map((a, i) => (
                          <li key={`${a.teacherId}:${a.subject}:${i}`}>
                            <strong>{a.name}</strong>
                            <span>
                              {a.subject} · Profile status:{" "}
                              {a.status.toLowerCase().replaceAll("_", " ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No active recurring teacher assignment yet.</p>
                    )}
                    {item.assignmentsLimited && (
                      <p className="care-help">
                        Showing the first 20 current assignments. Contact
                        support to review additional assignments.
                      </p>
                    )}
                  </div>
                  <DemoSummary demos={item.demos} />
                  {guardian && (
                    <Link
                      className="inline-link"
                      href={`/dashboard/family?learner=${item.learner.id}`}
                    >
                      Manage {item.learner.alias}’s access
                    </Link>
                  )}
                </article>
              ))}
            </div>
            {(data.nextCursor || cursors.length > 0) && (
              <div className="role-pagination">
                <Button
                  variant="outline"
                  disabled={
                    !cursors.length || query.isFetching || !!query.error
                  }
                  onClick={() => setCursors((v) => v.slice(0, -1))}
                >
                  Previous learners
                </Button>
                <span>Page {cursors.length + 1}</span>
                <Button
                  variant="outline"
                  disabled={
                    !data.nextCursor || query.isFetching || !!query.error
                  }
                  onClick={() => setCursors((v) => [...v, data.nextCursor!])}
                >
                  Next learners
                </Button>
              </div>
            )}
          </section>
          {guardian && (
            <section className="care-card role-family-actions">
              <h3>Family next steps</h3>
              <div>
                <Link className="inline-link" href="/dashboard/bookings">
                  Review revision bookings
                </Link>
                <Link className="inline-link" href="/dashboard/requests">
                  Review tuition requests & demos
                </Link>
                <Link className="inline-link" href="/dashboard/family">
                  Manage student devices
                </Link>
              </div>
              <h4>Recorded Parent Pro allowance</h4>
              {data.membership ? (
                <>
                  <p>
                    {data.membership.allowance} recorded allowance;{" "}
                    {data.membership.used} used; {data.membership.reserved}{" "}
                    reserved. Unreserved recorded balance:{" "}
                    {Math.max(
                      0,
                      data.membership.allowance -
                        data.membership.used -
                        data.membership.reserved,
                    )}
                    . Period ends {date(data.membership.periodEnd)} IST.
                  </p>
                  <p>
                    Recorded status: {data.membership.status.toLowerCase()}.{" "}
                    {new Date(data.membership.periodEnd).getTime() <= Date.now()
                      ? "This recorded period has ended."
                      : ""}
                  </p>
                </>
              ) : (
                <p>No recorded membership allowance.</p>
              )}
              <p className="care-help">
                Masked call delivery remains disabled. These development records
                do not establish a live calling entitlement.
              </p>
              <Link className="inline-link" href="/dashboard/pro">
                Review Parent Pro records
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  );
}
function ServiceTable({
  rows,
  metrics,
}: {
  rows: Summary["serviceKinds"];
  metrics: Metrics;
}) {
  const display = [
    "RECURRING",
    "REVISION",
    ...rows
      .map((r) => r.kind)
      .filter((k) => !["RECURRING", "REVISION"].includes(k)),
  ];
  return (
    <div className="role-service">
      <h4>Lessons by service</h4>
      <table aria-label="Lesson service breakdown">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Classes taken</th>
            <th scope="col">Completed</th>
            <th scope="col">Records</th>
          </tr>
        </thead>
        <tbody>
          {display.map((k) => {
            const m = rows.find((r) => r.kind === k)?.metrics;
            return (
              <tr key={k}>
                <th scope="row">{kind(k)}</th>
                <td>{m?.classesTaken ?? 0}</td>
                <td>{m?.completedLessons ?? 0}</td>
                <td>{m?.lessons ?? 0}</td>
              </tr>
            );
          })}
          <tr>
            <th scope="row">All lessons</th>
            <td>{metrics.classesTaken}</td>
            <td>{metrics.completedLessons}</td>
            <td>{metrics.lessons}</td>
          </tr>
        </tbody>
      </table>
      <p className="care-help">
        Demos are shown separately below and are not added to these lesson
        totals.
      </p>
    </div>
  );
}
function DemoSummary({ demos }: { demos: Summary["demos"] }) {
  return (
    <div className="role-demo">
      <h4>Demos in this period</h4>
      <p>
        {demos.scheduled} bookings · {demos.completed} completed ·{" "}
        {demos.cancelled} cancelled · {demos.noShow} reported no-shows ·{" "}
        {demos.disputed} disputed.
      </p>
      <p className="care-help">
        A no-show report may also be disputed. These are recorded outcomes, not
        extra classes taken.
      </p>
    </div>
  );
}
function LearningPeriod({ apply }: { apply: (range: Range | null) => void }) {
  const [choice, setChoice] = useState("ROLLING"),
    [draft, setDraft] = useState<Range>(() => preset("MONTH")),
    [error, setError] = useState("");
  return (
    <section className="care-card">
      <h3>Choose the activity period</h3>
      <form
        className="care-fields"
        onSubmit={(e) => {
          e.preventDefault();
          if (choice === "ROLLING") {
            setError("");
            apply(null);
            return;
          }
          const f = Date.parse(draft.from + "T00:00:00+05:30"),
            t = Date.parse(draft.to + "T00:00:00+05:30") + 86400000;
          if (
            !Number.isFinite(f) ||
            !Number.isFinite(t) ||
            t <= f ||
            t - f > 366 * 86400000
          ) {
            setError("Choose an ordered date range of up to 366 days.");
            return;
          }
          setError("");
          apply({ ...draft });
        }}
      >
        <div>
          <label htmlFor="activity-preset">Date preset</label>
          <select
            id="activity-preset"
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              if (["MONTH", "PREVIOUS"].includes(e.target.value))
                setDraft(preset(e.target.value));
            }}
          >
            <option value="ROLLING">Rolling 30 days</option>
            <option value="MONTH">Current month</option>
            <option value="PREVIOUS">Previous calendar month</option>
            <option value="CUSTOM">Custom dates</option>
          </select>
        </div>
        {choice !== "ROLLING" && (
          <>
            <div>
              <label htmlFor="activity-from">Activity from (IST)</label>
              <Input
                id="activity-from"
                type="date"
                required
                value={draft.from}
                onChange={(e) => {
                  setChoice("CUSTOM");
                  setDraft((v) => ({ ...v, from: e.target.value }));
                }}
              />
            </div>
            <div>
              <label htmlFor="activity-through">Activity through (IST)</label>
              <Input
                id="activity-through"
                type="date"
                required
                value={draft.to}
                onChange={(e) => {
                  setChoice("CUSTOM");
                  setDraft((v) => ({ ...v, to: e.target.value }));
                }}
              />
            </div>
          </>
        )}
        <Button type="submit">Apply activity dates</Button>
      </form>
      <p className="care-help">
        Rolling 30 days ends at the report read time. Calendar dates cover whole
        IST days. Draft changes apply only when you choose Apply activity dates.
      </p>
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
