"use client";
import { useAppTranslation } from "./locale";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { CalendarDays, Check, Clock, BookOpen } from "lucide-react";
import {
  api,
  type components,
  type Dashboard,
  type Placement,
  type Session,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Feedback, useDecision } from "./tuition-workflow";
import { MeetingAccess } from "./booking-payments";
type Schedule = components["schemas"]["RecurringSchedule"];
type RecordPage = components["schemas"]["LessonRecords"];
type Record = RecordPage["items"][number];
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const dateISO = (offset = 0) =>
  new Date(Date.now() + offset * 86400000 + 330 * 60000)
    .toISOString()
    .slice(0, 10);
const dayLabel = (iso: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const localTime = (iso: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
    >
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function LearningWorkspace({
  session,
  dashboard: d,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  if (!["GUARDIAN", "TEACHER", "STUDENT"].includes(session.account.role))
    return (
      <Notice>
        {appText(
          "Classes are available to guardians, teachers and students.",
        )}{" "}
      </Notice>
    );
  return (
    <div className="learning-workspace">
      <header className="learning-intro">
        <div>
          <CalendarDays size={30} aria-hidden="true" />
          <h2>{appText("A steady rhythm for learning.")}</h2>
          <p>
            {appText(
              "Agree a weekly timetable. Keep each lesson and its attendance in view.",
            )}{" "}
          </p>
        </div>
        <div className="learning-intro-note">
          <span className="learning-timezone">{appText("Asia/Kolkata")}</span>
          <p>{appText("All times are shown in IST.")}</p>
          <small>
            {appText(
              "Timetable agreement and tuition-start confirmation are separate steps.",
            )}{" "}
          </small>
        </div>
      </header>
      {session.account.role !== "STUDENT" && (
        <section
          aria-label={appText("Weekly timetables")}
          className="learning-timetables"
        >
          <div className="learning-section-title">
            <h2>{appText("Your weekly rhythm")}</h2>
            <Link
              href={
                session.account.role === "TEACHER"
                  ? "/dashboard/bookings"
                  : "/dashboard/requests"
              }
              className="inline-link"
            >
              {appText("Review tuition terms")}{" "}
            </Link>
          </div>
          {d.placements?.length ? (
            d.placements.map((p) => (
              <Timetable
                key={p.id}
                session={session}
                placement={p}
                dashboard={d}
              />
            ))
          ) : (
            <Notice>
              {appText(
                "No tuition agreement yet. Complete a demo and open tuition terms before proposing a timetable.",
              )}{" "}
            </Notice>
          )}
        </section>
      )}
      <LearningRecords session={session} />
    </div>
  );
}
function WeekStrip({ schedule }: { schedule: Schedule }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <div
      className={`learning-week ${schedule.status === "ACCEPTED" ? "agreed" : ""}`}
      aria-label={appText("Weekly times in IST")}
    >
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <div
          key={day}
          className={
            schedule.slots.some((s) => s.weekday === day) ? "has-lesson" : ""
          }
        >
          <strong>{appText(days[day].slice(0, 3))}</strong>
          {schedule.slots
            .filter((s) => s.weekday === day)
            .map((s, i) => (
              <span key={i}>
                {time(s.startMinute)}–
                {s.endMinute === 1440 ? "24:00" : time(s.endMinute)}
              </span>
            ))}
          {!schedule.slots.some((s) => s.weekday === day) && (
            <span className="learning-rest">—</span>
          )}
        </div>
      ))}
    </div>
  );
}
function Timetable({
  session,
  placement: p,
  dashboard: d,
}: {
  session: Session;
  placement: Placement;
  dashboard: Dashboard;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient();
  // shortcut: the timetable API returns 50 entries; paginate when it supplies a cursor.
  const query = useQuery({
    queryKey: ["placement-schedules", session.account.id, p.id],
    queryFn: () =>
      api<components["schemas"]["RecurringSchedules"]>(
        `/placements/${p.id}/schedules`,
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const guardian = session.account.role === "GUARDIAN";
  const permitted =
    !guardian ||
    (session.account.verified && !!d.consent && !d.consent.withdrawnAt);
  const teacher =
    d.profile?.id === p.teacherId
      ? d.profile
      : d.teachers?.find((t) => t.id === p.teacherId);
  const learner = d.children?.find((c) => c.id === p.childId);
  const request = d.requests?.find(
    (r) => r.id === (p as Placement & { requestId?: string }).requestId,
  );
  const [open, setOpen] = useState(false),
    [form, setForm] = useState<{
      kind: "accept" | "extend";
      id: string;
    } | null>(null),
    [agreed, setAgreed] = useState(false);
  const [from, setFrom] = useState(dateISO(1)),
    [until, setUntil] = useState(dateISO(60)),
    [reason, setReason] = useState("");
  const [slots, setSlots] = useState([
    { weekday: "1", start: "17:00", duration: "30" },
  ]);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open || form) {
      confirmation.current?.focus();
      confirmation.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open, form?.id, form?.kind]);
  async function refresh() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    const current = await api<Dashboard>("/dashboard");
    client.setQueryData(["dashboard", session.account.id], current);
    await client.invalidateQueries(
      { queryKey: ["lesson-records", session.account.id] },
      { throwOnError: true },
    );
  }
  const decision = useDecision(
    session,
    refresh,
    (result) =>
      !!result &&
      typeof result === "object" &&
      (("id" in result && typeof result.id === "string") ||
        ("horizonDays" in result &&
          result.horizonDays === 60 &&
          "created" in result &&
          Number.isInteger(result.created) &&
          (result.created as number) >= 0)),
  );
  const closed = !["ACTIVE", "TERMS_PENDING"].includes(p.status),
    blocked = decision.locked || !permitted || closed || !!query.error;
  const current =
    query.data?.items.filter((s) => s.status !== "SUPERSEDED") || [];
  const accepted = current.find((s) => s.status === "ACCEPTED");
  const chosen = current.find((s) => s.id === form?.id);
  async function propose() {
    const weekly = slots
      .map((s) => {
        const [h, m] = s.start.split(":").map(Number);
        return {
          weekday: Number(s.weekday),
          startMinute: h * 60 + m,
          endMinute: h * 60 + m + Number(s.duration),
        };
      })
      .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
    const start = new Date(from + "T00:00:00Z"),
      end = new Date(until + "T00:00:00Z");
    if (
      !from ||
      !until ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      from < new Date().toISOString().slice(0, 10) ||
      end < start ||
      end.getTime() > Date.now() + 365 * 86400000 ||
      !reason.trim() ||
      reason.trim().length > 300 ||
      !agreed ||
      weekly.some(
        (s, i) =>
          !Number.isInteger(s.startMinute) ||
          s.startMinute < 0 ||
          s.startMinute > 1439 ||
          s.endMinute > 1440 ||
          s.endMinute - s.startMinute < 20 ||
          s.endMinute - s.startMinute > 120 ||
          (request?.mode === "ONLINE" && s.endMinute - s.startMinute > 40) ||
          (i > 0 &&
            weekly[i - 1].weekday === s.weekday &&
            s.startMinute < weekly[i - 1].endMinute),
      )
    ) {
      decision.invalid(
        "Use nonoverlapping 20–120 minute times, future dates within one year, a reason and the review confirmation. Online lessons allow up to 40 minutes.",
      );
      return;
    }
    await decision.run({
      path: `/placements/${p.id}/schedules`,
      body: {
        expectedVersion: p.version,
        timezone: "Asia/Kolkata",
        slots: weekly,
        validFrom: from,
        validUntil: until,
        reason: reason.trim(),
      },
      message:
        "Weekly timetable proposed. Both parties must accept it before lessons are booked.",
      onSaved: () => {
        setOpen(false);
        setAgreed(false);
      },
    });
  }
  async function confirm() {
    if (!chosen || !form || !agreed) {
      decision.invalid(
        "Review this timetable and confirm the effect before saving.",
      );
      return;
    }
    await decision.run({
      path: `/recurring-schedules/${chosen.id}/${form.kind === "accept" ? "acceptances" : "extensions"}`,
      body: { expectedVersion: chosen.version },
      message:
        form.kind === "accept"
          ? "Your timetable acceptance is saved. Lessons are booked only after both parties accept and availability checks pass."
          : "The agreed timetable was checked and available lessons booked within its rolling 60-day horizon.",
      onSaved: () => setForm(null),
    });
  }
  return (
    <article className="learning-timetable" data-placement-id={p.id}>
      <div className="learning-agreement-title">
        <div>
          <h3>{teacher?.name || appText("Tuition agreement")}</h3>
          <p>
            {learner?.alias || appText("Agreement {0}", [p.id.slice(0, 8)])}
          </p>
        </div>
        <span className={`learning-state ${accepted ? "accepted" : "pending"}`}>
          {closed
            ? appText("Closed")
            : accepted
              ? appText("Timetable agreed")
              : appText("Awaiting a timetable")}
        </span>
      </div>
      {!permitted && (
        <Notice>
          {appText(
            "Active guardian consent and verification are required to manage this timetable.",
          )}{" "}
        </Notice>
      )}
      {query.isPending && (
        <p role="status">{appText("Loading weekly timetables…")}</p>
      )}
      {query.error && <Notice error>{appError(query.error.message)}</Notice>}
      {!query.isPending && !query.error && !current.length && (
        <div className="learning-empty">
          <Clock size={24} aria-hidden="true" />
          <p>{appText("Make space for regular learning.")}</p>
          <small>
            {appText(
              "Propose the days and times that work for this tuition agreement.",
            )}{" "}
          </small>
        </div>
      )}
      {current.map((s) => {
        const ownAccepted = guardian ? s.guardianAccepted : s.teacherAccepted;
        return (
          <section
            key={s.id}
            className="learning-schedule"
            aria-label={appText("{0} timetable", [appText(label(s.status))])}
          >
            <div className="learning-schedule-heading">
              <h4>
                {s.status === "ACCEPTED"
                  ? appText("Agreed weekly timetable")
                  : appText("Proposed weekly timetable")}
              </h4>
              <span>
                {dayLabel(s.validFrom, appLocale)}–
                {dayLabel(s.validUntil, appLocale)}
              </span>
            </div>
            <WeekStrip schedule={s} />
            <p className="learning-reason">{s.reason}</p>
            <div className="learning-party-row">
              <span>
                <Check size={15} aria-hidden="true" />
                {appText("Guardian:")}{" "}
                {s.guardianAccepted ? appText("accepted") : appText("pending")}
              </span>
              <span>
                <Check size={15} aria-hidden="true" />
                {appText("Teacher:")}{" "}
                {s.teacherAccepted ? appText("accepted") : appText("pending")}
              </span>
            </div>
            {s.status === "ACCEPTED" && (
              <p className="learning-help">
                {appText("Booking checks cover a rolling 60 days")}{" "}
                {s.materializedUntil
                  ? appText(", last checked through {0}", [
                      dayLabel(s.materializedUntil, appLocale),
                    ])
                  : ""}
                {appText(
                  ". Individual booked lessons appear below; cancelled lessons remain in the record.",
                )}{" "}
              </p>
            )}
            {s.extensionRetryAt && (
              <Notice>
                {appText("A booking check needs review. Next recorded retry:")}{" "}
                {dayLabel(s.extensionRetryAt, appLocale)}
                {appText(". Contact support if lessons are missing.")}{" "}
              </Notice>
            )}
            {s.status === "PROPOSED" && !ownAccepted && (
              <Button
                className="button"
                disabled={blocked || !p.guardianAccepted || !p.teacherAccepted}
                onClick={() => {
                  setForm({ kind: "accept", id: s.id });
                  setOpen(false);
                  setAgreed(false);
                }}
              >
                {appText("Review & accept timetable")}{" "}
              </Button>
            )}
            {s.status === "PROPOSED" && ownAccepted && (
              <p className="learning-help">
                {appText(
                  "Your acceptance is recorded. Waiting for the other party.",
                )}{" "}
              </p>
            )}
            {s.status === "ACCEPTED" && (
              <Button
                variant="outline"
                disabled={blocked}
                onClick={() => {
                  setForm({ kind: "extend", id: s.id });
                  setOpen(false);
                  setAgreed(false);
                }}
              >
                {appText("Check upcoming bookings")}{" "}
              </Button>
            )}
          </section>
        );
      })}
      {!closed && (!p.guardianAccepted || !p.teacherAccepted) && (
        <Notice>
          {appText(
            "Both parties must accept tuition terms before agreeing this timetable.",
          )}{" "}
          <Link
            className="inline-link"
            href={guardian ? "/dashboard/requests" : "/dashboard/bookings"}
          >
            {appText("Review terms")}{" "}
          </Link>
        </Notice>
      )}
      <div className="learning-actions">
        <Button
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => decision.reload()}
        >
          {appText("Refresh timetable")}{" "}
        </Button>
        {!closed && (
          <Button
            className="button"
            disabled={blocked || query.isPending || !!query.error}
            onClick={() => {
              setOpen(true);
              setForm(null);
              setAgreed(false);
            }}
          >
            {appText("Propose")}{" "}
            {accepted ? appText("a replacement") : appText("weekly times")}
          </Button>
        )}
      </div>
      {query.data?.items.length === 50 && (
        <p className="learning-help">
          {appText(
            "This view contains the latest 50 timetables. Contact support for older agreements.",
          )}{" "}
        </p>
      )}
      {open && (
        <div className="learning-review" ref={confirmation} tabIndex={-1}>
          <h4>
            {accepted
              ? appText("Review a replacement timetable")
              : appText("Propose weekly times")}
          </h4>
          <p>
            {appText(
              "Every time is in IST. Online lessons allow up to 40 minutes. Home lessons allow 20–120 minutes.",
            )}{" "}
          </p>
          <p>
            {appText(
              "A new proposal replaces any pending proposal. After both parties accept, booked future lessons at least one hour away may be cancelled and replaced; earlier commitments remain.",
            )}{" "}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              propose();
            }}
          >
            <fieldset disabled={blocked}>
              <div className="learning-form-grid">
                <label>
                  {appText("First valid date")}{" "}
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  {appText("Last valid date")}{" "}
                  <Input
                    type="date"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </label>
              </div>
              {slots.map((s, i) => (
                <div className="learning-slot-row" key={i}>
                  <label>
                    {appText("Day")} {i + 1}
                    <select
                      aria-label={appText("Day {0}", [i + 1])}
                      value={s.weekday}
                      onChange={(e) =>
                        setSlots(
                          slots.map((x, j) =>
                            j === i ? { ...x, weekday: e.target.value } : x,
                          ),
                        )
                      }
                    >
                      {days.map((d, k) => (
                        <option key={d} value={k}>
                          {appText(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {appText("Start time")} {i + 1} {appText("(IST)")}{" "}
                    <Input
                      type="time"
                      value={s.start}
                      onChange={(e) =>
                        setSlots(
                          slots.map((x, j) =>
                            j === i ? { ...x, start: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    {appText("Duration")} {i + 1}
                    <select
                      aria-label={appText("Duration {0}", [i + 1])}
                      value={s.duration}
                      onChange={(e) =>
                        setSlots(
                          slots.map((x, j) =>
                            j === i ? { ...x, duration: e.target.value } : x,
                          ),
                        )
                      }
                    >
                      {[20, 30, 40, 60, 90, 120]
                        .filter((n) => request?.mode !== "ONLINE" || n <= 40)
                        .map((n) => (
                          <option key={n} value={n}>
                            {n} {appText("minutes")}{" "}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={appText("Remove weekly time {0}", [i + 1])}
                    disabled={slots.length === 1}
                    onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                  >
                    {appText("Remove")}{" "}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={slots.length >= 7}
                onClick={() =>
                  setSlots([
                    ...slots,
                    { weekday: "1", start: "17:00", duration: "30" },
                  ])
                }
              >
                {appText("Add weekly time")}{" "}
              </Button>
              <label>
                {appText("Reason for these times")}{" "}
                <Textarea
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={appText(
                    "For example, after-school Maths practice",
                  )}
                />
              </label>
              <label className="learning-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  {appText(
                    "I have reviewed these times and the replacement policy.",
                  )}{" "}
                </span>
              </label>
              <div className="learning-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  {appText("Cancel")}{" "}
                </Button>
                <Button className="button" type="submit">
                  {appText("Save timetable proposal")}{" "}
                </Button>
              </div>
            </fieldset>
          </form>
        </div>
      )}
      {form && chosen && (
        <div className="learning-review" ref={confirmation} tabIndex={-1}>
          <h4>
            {form.kind === "accept"
              ? appText("Review timetable acceptance")
              : appText("Check upcoming bookings")}
          </h4>
          <WeekStrip schedule={chosen} />
          <p>
            {form.kind === "accept"
              ? appText(
                  "Both parties must accept this version. Availability is checked before lessons are booked. Accepting a replacement may cancel and replace scheduled lessons at least one hour away; earlier commitments remain.",
                )
              : appText(
                  "This checks available lessons against the agreed timetable, within the next 60 days and its validity dates. It does not confirm paid tuition start or attendance.",
                )}
          </p>
          <fieldset disabled={blocked}>
            <label className="learning-check">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                {appText(
                  "I have reviewed the timetable and understand this action.",
                )}{" "}
              </span>
            </label>
            <div className="learning-actions">
              <Button variant="outline" onClick={() => setForm(null)}>
                {appText("Cancel")}{" "}
              </Button>
              <Button className="button" onClick={confirm}>
                {form.kind === "accept"
                  ? appText("Accept this timetable")
                  : appText("Confirm booking check")}
              </Button>
            </div>
          </fieldset>
        </div>
      )}
      <Feedback decision={decision} />
    </article>
  );
}
function LearningRecords({ session }: { session: Session }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient();
  const [range, setRange] = useState({ from: dateISO(-30), to: dateISO(60) }),
    [draft, setDraft] = useState(range),
    [rangeError, setRangeError] = useState("");
  const [view, setView] = useState("upcoming"),
    [lockedId, setLockedId] = useState<string | null>(null);
  const locked = lockedId !== null;
  const onLock = useCallback((id: string, value: boolean) => {
    setLockedId((previous) => (value ? id : previous === id ? null : previous));
  }, []);
  const query = useInfiniteQuery({
    queryKey: ["lesson-records", session.account.id, range.from, range.to],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<RecordPage>(
        `/lessons?${new URLSearchParams({ from: range.from + "T00:00:00+05:30", to: range.to + "T23:59:59.999+05:30", limit: "20", ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (last) => last.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const records = query.data?.pages.flatMap((p) => p.items) || [];
  async function refresh() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    const dashboard = await api<Dashboard>("/dashboard");
    client.setQueryData(["dashboard", session.account.id], dashboard);
  }
  function apply() {
    const from = new Date(draft.from),
      to = new Date(draft.to);
    if (
      !draft.from ||
      !draft.to ||
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to < from ||
      to.getTime() - from.getTime() > 365 * 86400000
    ) {
      setRangeError("Choose a valid date range of up to one year.");
      return;
    }
    setRangeError("");
    setRange(draft);
  }
  const shown = records
    .filter(
      (r) =>
        view !== "upcoming" ||
        (r.status === "SCHEDULED" &&
          new Date(r.startsAt).getTime() >= Date.now()),
    )
    .sort((a, b) =>
      view === "upcoming"
        ? a.startsAt.localeCompare(b.startsAt)
        : b.startsAt.localeCompare(a.startsAt),
    );
  return (
    <section
      className="learning-records"
      aria-label={appText("Lesson records")}
    >
      <div className="learning-section-title">
        <div>
          <BookOpen size={24} aria-hidden="true" />
          <h2>{appText("Every lesson, in view.")}</h2>
        </div>
        <Button
          variant="outline"
          disabled={locked || query.isFetching}
          onClick={() => query.refetch()}
        >
          {appText("Refresh lessons")}{" "}
        </Button>
      </div>
      <p>
        {appText(
          "Attendance totals include completed present or late lessons. Cancelled, absent and disputed lessons are excluded.",
        )}{" "}
      </p>
      <form
        className="learning-date-filter"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <fieldset disabled={locked}>
          <label>
            {appText("Lessons from")}{" "}
            <Input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label>
            {appText("Lessons through")}{" "}
            <Input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <Button type="submit" variant="outline">
            {appText("Apply dates")}{" "}
          </Button>
        </fieldset>
      </form>
      {rangeError && <Notice error>{appError(rangeError)}</Notice>}
      <Tabs value={view} onValueChange={setView}>
        <TabsList aria-label={appText("Lesson view")}>
          <TabsTrigger value="upcoming" disabled={locked}>
            {appText("Upcoming")}{" "}
          </TabsTrigger>
          <TabsTrigger value="records" disabled={locked}>
            {appText("Attendance & records")}{" "}
          </TabsTrigger>
        </TabsList>
        {["upcoming", "records"].map((tab) => (
          <TabsContent value={tab} key={tab}>
            {query.isPending && (
              <p role="status">{appText("Loading lesson records…")}</p>
            )}
            {query.error && (
              <Notice error>
                {appError(query.error.message)}{" "}
                <Button variant="outline" onClick={() => query.refetch()}>
                  {appText("Retry lesson records")}{" "}
                </Button>
              </Notice>
            )}
            {!query.isPending && !query.error && !shown.length && (
              <div className="learning-empty">
                <CalendarDays size={28} aria-hidden="true" />
                <h3>
                  {view === "upcoming"
                    ? appText("No upcoming lessons in the loaded records.")
                    : appText("No lesson records for these dates.")}
                </h3>
                <p>
                  {query.hasNextPage
                    ? appText(
                        "Load more lessons to check the rest of this date range.",
                      )
                    : appText(
                        "Adjust the dates or agree a timetable to see booked lessons here.",
                      )}
                </p>
              </div>
            )}
            <div className="learning-lesson-list">
              {shown.map((r) => (
                <LessonRecord
                  key={r.id}
                  session={session}
                  lesson={r}
                  refresh={refresh}
                  onLock={onLock}
                  blocked={lockedId !== null && lockedId !== r.id}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <div className="learning-load">
        <span>
          {records.length} {appText("loaded")}{" "}
          {records.length === 1 ? appText("record") : appText("records")}{" "}
          {appText("in this date range")}{" "}
        </span>
        {query.hasNextPage && (
          <Button
            variant="outline"
            disabled={locked || query.isFetching}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage
              ? appText("Loading…")
              : appText("Load more lessons")}
          </Button>
        )}
      </div>
    </section>
  );
}
function LessonRecord({
  session,
  lesson: l,
  refresh,
  onLock,
  blocked,
}: {
  session: Session;
  lesson: Record;
  refresh: () => Promise<void>;
  onLock: (id: string, locked: boolean) => void;
  blocked: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const teacher = session.account.role === "TEACHER";
  const [action, setAction] = useState<
      "attendance" | "CONFIRMED" | "DISPUTED" | "feedback" | null
    >(null),
    [attendance, setAttendance] = useState("PRESENT"),
    [reason, setReason] = useState(""),
    [recap, setRecap] = useState(""),
    [agreed, setAgreed] = useState(false),
    [rating, setRating] = useState(""),
    [comment, setComment] = useState(""),
    [reviewingFeedback, setReviewingFeedback] = useState(false);
  const feedbackSubmitting = useRef(false);
  const review = useRef<HTMLDivElement>(null);
  const decision = useDecision(session, refresh);
  useEffect(() => {
    onLock(l.id, decision.busy || decision.uncertain || decision.conflict);
  }, [l.id, decision.busy, decision.uncertain, decision.conflict, onLock]);
  useEffect(() => {
    if (action) {
      review.current?.focus();
      review.current?.scrollIntoView({ block: "nearest" });
    }
  }, [action]);
  const past = new Date(l.endsAt).getTime() <= Date.now();
  const canRecord = teacher && past && l.status !== "CANCELLED" && !l.disputed;
  const canConfirm =
    !teacher &&
    l.status === "COMPLETED" &&
    l.attendance !== "PENDING" &&
    !l.disputed;
  const [confirmedHere, setConfirmedHere] = useState(false);
  function open(next: typeof action) {
    setAction(next);
    setAgreed(false);
    setReason("");
    setReviewingFeedback(false);
  }
  async function saveFeedback() {
    if (feedbackSubmitting.current || decision.locked || blocked) return;
    if (
      !l.feedbackEligible ||
      !agreed ||
      !/^[1-5]$/.test(rating) ||
      comment.trim().length > 1000
    ) {
      decision.invalid(
        "Choose a rating and review who will see your feedback before sending.",
      );
      return;
    }
    feedbackSubmitting.current = true;
    try {
      await decision.run({
        path: `/lessons/${l.id}/feedback`,
        body: {
          expectedVersion: l.version,
          rating: Number(rating),
          comment: comment.trim(),
        },
        message: "Your private lesson feedback is recorded.",
        onSaved: () => {
          setAction(null);
          setRating("");
          setComment("");
          setReviewingFeedback(false);
        },
      });
    } finally {
      feedbackSubmitting.current = false;
    }
  }
  async function save() {
    const max = action === "attendance" ? 300 : 500;
    if (
      !action ||
      !agreed ||
      !reason.trim() ||
      reason.trim().length > max ||
      (action === "attendance" &&
        l.kind === "REVISION" &&
        attendance !== "ABSENT" &&
        !recap.trim())
    ) {
      decision.invalid(
        "Review the attendance, give a reason and confirm before saving. Delivered revision lessons also need a recap.",
      );
      return;
    }
    const body =
      action === "attendance"
        ? {
            expectedVersion: l.version,
            attendance,
            reason: reason.trim(),
            ...(recap.trim() ? { recap: recap.trim() } : {}),
          }
        : { expectedVersion: l.version, action, reason: reason.trim() };
    await decision.run({
      path: `/lessons/${l.id}/${action === "attendance" ? "attendance" : "confirmations"}`,
      body,
      message:
        action === "DISPUTED"
          ? "Attendance dispute recorded. This lesson is excluded from totals while support reviews it."
          : action === "CONFIRMED"
            ? "Your attendance confirmation is recorded."
            : "Attendance record saved.",
      onSaved: () => {
        if (action === "CONFIRMED") setConfirmedHere(true);
        setAction(null);
      },
    });
  }
  return (
    <article
      data-lesson-id={l.id}
      className={`learning-lesson ${l.disputed ? "under-review" : ""}`}
    >
      <div className="learning-lesson-top">
        <div className="learning-date-stamp">
          <strong>
            {new Intl.DateTimeFormat(appLocale, {
              timeZone: "Asia/Kolkata",
              day: "numeric",
            }).format(new Date(l.startsAt))}
          </strong>
          <span>
            {new Intl.DateTimeFormat(appLocale, {
              timeZone: "Asia/Kolkata",
              month: "short",
            }).format(new Date(l.startsAt))}
          </span>
        </div>
        <div className="learning-lesson-details">
          <h3>
            {appCurriculum(l.subject)} {appText("with")} {l.teacher.name}
          </h3>
          <p>
            {l.learner.alias} · {l.learner.board}
            {appText(", Class")} {l.learner.grade}
          </p>
          <span>
            {localTime(l.startsAt, appLocale)}–{localTime(l.endsAt, appLocale)}{" "}
            {appText("IST ·")} {appText(label(l.kind))}
          </span>
        </div>
        <span
          className={`learning-state ${l.disputed ? "review" : l.status === "COMPLETED" && ["PRESENT", "LATE"].includes(l.attendance) ? "accepted" : l.status === "SCHEDULED" ? "pending" : "neutral"}`}
        >
          {l.disputed
            ? appText("Attendance under review")
            : `${appText(label(l.status))} · ${appText(label(l.attendance))}`}
        </span>
      </div>
      {l.recap && (
        <section className="lesson-recap" aria-label={appText("Teacher recap")}>
          <div>
            <BookOpen size={20} aria-hidden="true" />
            <h4>{appText("Teacher recap")}</h4>
          </div>
          <p>{l.recap}</p>
          {l.recapSubmittedAt && (
            <small>
              {appText("Recorded")} {dayLabel(l.recapSubmittedAt, appLocale)}
            </small>
          )}
        </section>
      )}
      {l.myConfirmation && (
        <p className="lesson-personal-review" role="status">
          {l.myConfirmation.lessonVersion !== l.version
            ? appText(
                "You reviewed an earlier attendance record. Ask support to review the correction before adding feedback.",
              )
            : l.myConfirmation.action === "CONFIRMED"
              ? appText("You confirmed this attendance record.")
              : appText(
                  "You reported an attendance error. Support will review it.",
                )}
        </p>
      )}
      {l.feedback && session.account.role !== "STUDENT" && (
        <section
          className="lesson-saved-feedback"
          aria-label={appText("Private lesson feedback")}
        >
          <div>
            <h4>
              {teacher
                ? appText("Guardian feedback")
                : appText("Your lesson feedback")}
            </h4>
            <span className="lesson-rating-value">
              {l.feedback.rating} {appText("out of 5")}{" "}
            </span>
          </div>
          {l.feedback.comment ? (
            <p>{l.feedback.comment}</p>
          ) : (
            <p>{appText("No written comment added.")}</p>
          )}
          <small>
            {appText("Recorded")} {dayLabel(l.feedback.createdAt, appLocale)}{" "}
            {appText(
              "· Private to the guardian and this lesson’s teacher",
            )}{" "}
          </small>
          {!teacher && (
            <p>
              <Link href="/support" className="inline-link">
                {appText("Ask support for a correction")}{" "}
              </Link>
            </p>
          )}
        </section>
      )}
      {session.account.role === "GUARDIAN" &&
        !l.feedback &&
        !l.feedbackEligible &&
        l.status === "COMPLETED" && (
          <p className="learning-help">
            {appText(
              "Feedback is available after you confirm the current attendance for a present or late lesson, with active guardian consent. Resolve any attendance review first.",
            )}{" "}
          </p>
        )}
      {l.reservationId && l.status === "SCHEDULED" && (
        <MeetingAccess
          session={session}
          reservationId={l.reservationId}
          confirmed
        />
      )}
      {l.disputed && (
        <p className="learning-help">
          {appText(
            "Excluded from attendance totals until support resolves the record.",
          )}{" "}
        </p>
      )}
      {l.confirmations.length > 0 && (
        <details className="learning-history">
          <summary>
            {appText("Recorded attendance reviews (")}
            {l.confirmations.length})
          </summary>
          <ul>
            {l.confirmations.map((c, i) => (
              <li key={i}>
                {appText(label(c.action))} · {dayLabel(c.createdAt, appLocale)}
              </li>
            ))}
          </ul>
          <small>
            {appText("The record does not identify who submitted each review.")}
          </small>
          <p>
            {appText(
              "Each person can submit one attendance review per lesson. If you have already reviewed it,",
            )}{" "}
            <Link href="/support" className="inline-link">
              {appText("ask support to correct the record")}{" "}
            </Link>
            .
          </p>
        </details>
      )}
      <div className="learning-actions">
        {canRecord && (
          <Button
            variant="outline"
            disabled={decision.locked || blocked}
            onClick={() => open("attendance")}
          >
            {appText("Record attendance")}{" "}
          </Button>
        )}
        {canConfirm && (
          <>
            <Button
              variant="outline"
              disabled={
                decision.locked ||
                blocked ||
                confirmedHere ||
                !!l.myConfirmation
              }
              onClick={() => open("CONFIRMED")}
            >
              {appText("Confirm attendance")}{" "}
            </Button>
            <Button
              variant="ghost"
              disabled={
                decision.locked ||
                blocked ||
                confirmedHere ||
                !!l.myConfirmation
              }
              onClick={() => open("DISPUTED")}
            >
              {appText("Report attendance error")}{" "}
            </Button>
          </>
        )}
        {session.account.role === "GUARDIAN" &&
          l.feedbackEligible &&
          !l.feedback && (
            <Button
              disabled={decision.locked || blocked}
              onClick={() => open("feedback")}
            >
              {appText("Share lesson feedback")}{" "}
            </Button>
          )}
      </div>
      {action === "feedback" && (
        <div className="lesson-feedback-editor" ref={review} tabIndex={-1}>
          <h4>
            {reviewingFeedback
              ? appText("Review your lesson feedback")
              : appText("How did this lesson go?")}
          </h4>
          <p>
            {appText(
              "Shared privately with this lesson’s teacher. Your feedback won’t appear on their public profile.",
            )}{" "}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (reviewingFeedback) {
                void saveFeedback();
                return;
              }
              if (!/^[1-5]$/.test(rating)) {
                decision.invalid("Choose how helpful this lesson was.");
                return;
              }
              if (comment.trim().length > 1000) {
                decision.invalid("Keep your comment within 1,000 characters.");
                return;
              }
              setReviewingFeedback(true);
              setAgreed(false);
            }}
          >
            <fieldset disabled={decision.locked || blocked}>
              {reviewingFeedback ? (
                <div className="lesson-feedback-review">
                  <p>
                    <strong>
                      {rating} {appText("out of 5")}
                    </strong>{" "}
                    {appText("for")} {appCurriculum(l.subject)} {appText("on")}{" "}
                    {dayLabel(l.startsAt, appLocale)}
                  </p>
                  <p>
                    {comment.trim() || appText("No written comment added.")}
                  </p>
                  <label className="learning-check">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span>
                      {appText(
                        "I reviewed my feedback and understand it will be shared with this lesson’s teacher.",
                      )}{" "}
                    </span>
                  </label>
                </div>
              ) : (
                <>
                  <fieldset className="lesson-rating-options">
                    <legend>{appText("How helpful was this lesson?")}</legend>
                    {[
                      ["1", "Needs support"],
                      ["2", "Could be clearer"],
                      ["3", "Good"],
                      ["4", "Very helpful"],
                      ["5", "Excellent"],
                    ].map(([value, title]) => (
                      <label
                        key={value}
                        className={rating === value ? "selected" : ""}
                      >
                        <input
                          type="radio"
                          name={`lesson-rating-${l.id}`}
                          value={value}
                          checked={rating === value}
                          onChange={() => setRating(value)}
                        />
                        <span>
                          <strong>{value}</strong> {appText(title)}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    {appText(
                      "What worked well, or could be better? (optional)",
                    )}{" "}
                    <Textarea
                      value={comment}
                      maxLength={1000}
                      onChange={(e) => setComment(e.target.value)}
                      aria-describedby={`feedback-help-${l.id}`}
                    />
                  </label>
                  <small id={`feedback-help-${l.id}`}>
                    {comment.length}
                    {appText(
                      "/1,000 characters. Keep the comment about this lesson; leave out contact details.",
                    )}{" "}
                  </small>
                </>
              )}
              <div className="learning-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    reviewingFeedback
                      ? setReviewingFeedback(false)
                      : setAction(null)
                  }
                >
                  {reviewingFeedback
                    ? appText("Edit feedback")
                    : appText("Cancel feedback")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    reviewingFeedback && (!l.feedbackEligible || !!l.feedback)
                  }
                >
                  {reviewingFeedback
                    ? appText("Send private feedback")
                    : appText("Review feedback")}
                </Button>
              </div>
            </fieldset>
          </form>
          <p className="learning-help">
            {appText("For a safety concern,")}{" "}
            <Link href="/support" className="inline-link">
              {appText("contact support")}{" "}
            </Link>
            .
          </p>
        </div>
      )}
      {action && action !== "feedback" && (
        <div className="learning-review" ref={review} tabIndex={-1}>
          <h4>
            {action === "attendance"
              ? appText("Record lesson attendance")
              : action === "CONFIRMED"
                ? appText("Review attendance confirmation")
                : appText("Report an attendance error")}
          </h4>
          <p>
            {action === "DISPUTED"
              ? appText(
                  "Explain what is incorrect. This opens a support review and excludes the lesson from attendance totals.",
                )
              : appText(
                  "Review the {0} record for {1} on {2}. Confirm only what actually happened.",
                  [
                    appText(label(l.attendance)),
                    l.learner.alias,
                    dayLabel(l.startsAt, appLocale),
                  ],
                )}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <fieldset disabled={decision.locked || blocked}>
              {action === "attendance" && (
                <label>
                  {appText("Attendance")}{" "}
                  <select
                    aria-label={appText("Attendance")}
                    value={attendance}
                    onChange={(e) => setAttendance(e.target.value)}
                  >
                    <option value="PRESENT">{appText("Present")}</option>
                    <option value="LATE">{appText("Late")}</option>
                    <option value="ABSENT">{appText("Absent")}</option>
                  </select>
                </label>
              )}
              <label>
                {action === "DISPUTED"
                  ? appText("What is incorrect?")
                  : appText("Reason for this record")}
                <Textarea
                  value={reason}
                  maxLength={action === "attendance" ? 300 : 500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {action === "attendance" && l.kind === "REVISION" && (
                <label>
                  {appText("Revision recap")}{" "}
                  {attendance !== "ABSENT"
                    ? appText(" (required)")
                    : appText(" (optional)")}
                  <Textarea
                    value={recap}
                    maxLength={2000}
                    onChange={(e) => setRecap(e.target.value)}
                  />
                  <small>
                    {appText(
                      "Summarize the topic covered and the learner’s next step.",
                    )}{" "}
                  </small>
                </label>
              )}
              <label className="learning-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  {action === "DISPUTED"
                    ? appText(
                        "I want support to review this attendance record.",
                      )
                    : appText(
                        "I have reviewed this lesson and the attendance details are accurate.",
                      )}
                </span>
              </label>
              <div className="learning-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAction(null)}
                >
                  {appText("Cancel")}{" "}
                </Button>
                <Button className="button" type="submit">
                  {action === "DISPUTED"
                    ? appText("Submit attendance dispute")
                    : action === "CONFIRMED"
                      ? appText("Save attendance confirmation")
                      : appText("Save attendance record")}
                </Button>
              </div>
            </fieldset>
          </form>
        </div>
      )}
      <Feedback decision={decision} />
      {decision.conflict && (
        <Button
          variant="outline"
          disabled={decision.busy}
          onClick={() => decision.reload()}
        >
          {appText("Refresh attendance record")}{" "}
        </Button>
      )}
    </article>
  );
}
