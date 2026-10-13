"use client";
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
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const localTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
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
  if (!["GUARDIAN", "TEACHER", "STUDENT"].includes(session.account.role))
    return (
      <Notice>
        Classes are available to guardians, teachers and students.
      </Notice>
    );
  return (
    <div className="learning-workspace">
      <header className="learning-intro">
        <div>
          <CalendarDays size={30} aria-hidden="true" />
          <h2>A steady rhythm for learning.</h2>
          <p>
            Agree a weekly timetable. Keep each lesson and its attendance in
            view.
          </p>
        </div>
        <div className="learning-intro-note">
          <span className="learning-timezone">Asia/Kolkata</span>
          <p>All times are shown in IST.</p>
          <small>
            Timetable agreement and tuition-start confirmation are separate
            steps.
          </small>
        </div>
      </header>
      {session.account.role !== "STUDENT" && (
        <section aria-label="Weekly timetables" className="learning-timetables">
          <div className="learning-section-title">
            <h2>Your weekly rhythm</h2>
            <Link
              href={
                session.account.role === "TEACHER"
                  ? "/dashboard/bookings"
                  : "/dashboard/requests"
              }
              className="inline-link"
            >
              Review tuition terms
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
              No tuition agreement yet. Complete a demo and open tuition terms
              before proposing a timetable.
            </Notice>
          )}
        </section>
      )}
      <LearningRecords session={session} />
    </div>
  );
}
function WeekStrip({ schedule }: { schedule: Schedule }) {
  return (
    <div
      className={`learning-week ${schedule.status === "ACCEPTED" ? "agreed" : ""}`}
      aria-label="Weekly times in IST"
    >
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <div
          key={day}
          className={
            schedule.slots.some((s) => s.weekday === day) ? "has-lesson" : ""
          }
        >
          <strong>{days[day].slice(0, 3)}</strong>
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
    <article className="learning-timetable">
      <div className="learning-agreement-title">
        <div>
          <h3>{teacher?.name || "Tuition agreement"}</h3>
          <p>{learner?.alias || `Agreement ${p.id.slice(0, 8)}`}</p>
        </div>
        <span className={`learning-state ${accepted ? "accepted" : "pending"}`}>
          {closed
            ? "Closed"
            : accepted
              ? "Timetable agreed"
              : "Awaiting a timetable"}
        </span>
      </div>
      {!permitted && (
        <Notice>
          Active guardian consent and verification are required to manage this
          timetable.
        </Notice>
      )}
      {query.isPending && <p role="status">Loading weekly timetables…</p>}
      {query.error && <Notice error>{query.error.message}</Notice>}
      {!query.isPending && !query.error && !current.length && (
        <div className="learning-empty">
          <Clock size={24} aria-hidden="true" />
          <p>Make space for regular learning.</p>
          <small>
            Propose the days and times that work for this tuition agreement.
          </small>
        </div>
      )}
      {current.map((s) => {
        const ownAccepted = guardian ? s.guardianAccepted : s.teacherAccepted;
        return (
          <section
            key={s.id}
            className="learning-schedule"
            aria-label={`${label(s.status)} timetable`}
          >
            <div className="learning-schedule-heading">
              <h4>
                {s.status === "ACCEPTED"
                  ? "Agreed weekly timetable"
                  : "Proposed weekly timetable"}
              </h4>
              <span>
                {dayLabel(s.validFrom)}–{dayLabel(s.validUntil)}
              </span>
            </div>
            <WeekStrip schedule={s} />
            <p className="learning-reason">{s.reason}</p>
            <div className="learning-party-row">
              <span>
                <Check size={15} aria-hidden="true" />
                Guardian: {s.guardianAccepted ? "accepted" : "pending"}
              </span>
              <span>
                <Check size={15} aria-hidden="true" />
                Teacher: {s.teacherAccepted ? "accepted" : "pending"}
              </span>
            </div>
            {s.status === "ACCEPTED" && (
              <p className="learning-help">
                Booking checks cover a rolling 60 days
                {s.materializedUntil
                  ? `, last checked through ${dayLabel(s.materializedUntil)}`
                  : ""}
                . Individual booked lessons appear below; cancelled lessons
                remain in the record.
              </p>
            )}
            {s.extensionRetryAt && (
              <Notice>
                A booking check needs review. Next recorded retry:{" "}
                {dayLabel(s.extensionRetryAt)}. Contact support if lessons are
                missing.
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
                Review & accept timetable
              </Button>
            )}
            {s.status === "PROPOSED" && ownAccepted && (
              <p className="learning-help">
                Your acceptance is recorded. Waiting for the other party.
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
                Check upcoming bookings
              </Button>
            )}
          </section>
        );
      })}
      {!closed && (!p.guardianAccepted || !p.teacherAccepted) && (
        <Notice>
          Both parties must accept tuition terms before agreeing this timetable.{" "}
          <Link
            className="inline-link"
            href={guardian ? "/dashboard/requests" : "/dashboard/bookings"}
          >
            Review terms
          </Link>
        </Notice>
      )}
      <div className="learning-actions">
        <Button
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => decision.reload()}
        >
          Refresh timetable
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
            Propose {accepted ? "a replacement" : "weekly times"}
          </Button>
        )}
      </div>
      {query.data?.items.length === 50 && (
        <p className="learning-help">
          This view contains the latest 50 timetables. Contact support for older
          agreements.
        </p>
      )}
      {open && (
        <div className="learning-review" ref={confirmation} tabIndex={-1}>
          <h4>
            {accepted
              ? "Review a replacement timetable"
              : "Propose weekly times"}
          </h4>
          <p>
            Every time is in IST. Online lessons allow up to 40 minutes. Home
            lessons allow 20–120 minutes.
          </p>
          <p>
            A new proposal replaces any pending proposal. After both parties
            accept, booked future lessons at least one hour away may be
            cancelled and replaced; earlier commitments remain.
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
                  First valid date
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  Last valid date
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
                    Day {i + 1}
                    <select
                      aria-label={`Day ${i + 1}`}
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
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Start time {i + 1} (IST)
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
                    Duration {i + 1}
                    <select
                      aria-label={`Duration ${i + 1}`}
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
                            {n} minutes
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove weekly time ${i + 1}`}
                    disabled={slots.length === 1}
                    onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                  >
                    Remove
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
                Add weekly time
              </Button>
              <label>
                Reason for these times
                <Textarea
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="For example, after-school Maths practice"
                />
              </label>
              <label className="learning-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I have reviewed these times and the replacement policy.
                </span>
              </label>
              <div className="learning-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button className="button" type="submit">
                  Save timetable proposal
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
              ? "Review timetable acceptance"
              : "Check upcoming bookings"}
          </h4>
          <WeekStrip schedule={chosen} />
          <p>
            {form.kind === "accept"
              ? "Both parties must accept this version. Availability is checked before lessons are booked. Accepting a replacement may cancel and replace scheduled lessons at least one hour away; earlier commitments remain."
              : "This checks available lessons against the agreed timetable, within the next 60 days and its validity dates. It does not confirm paid tuition start or attendance."}
          </p>
          <fieldset disabled={blocked}>
            <label className="learning-check">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I have reviewed the timetable and understand this action.
              </span>
            </label>
            <div className="learning-actions">
              <Button variant="outline" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button className="button" onClick={confirm}>
                {form.kind === "accept"
                  ? "Accept this timetable"
                  : "Confirm booking check"}
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
    <section className="learning-records" aria-label="Lesson records">
      <div className="learning-section-title">
        <div>
          <BookOpen size={24} aria-hidden="true" />
          <h2>Every lesson, in view.</h2>
        </div>
        <Button
          variant="outline"
          disabled={locked || query.isFetching}
          onClick={() => query.refetch()}
        >
          Refresh lessons
        </Button>
      </div>
      <p>
        Attendance totals include completed present or late lessons. Cancelled,
        absent and disputed lessons are excluded.
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
            Lessons from
            <Input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label>
            Lessons through
            <Input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <Button type="submit" variant="outline">
            Apply dates
          </Button>
        </fieldset>
      </form>
      {rangeError && <Notice error>{rangeError}</Notice>}
      <Tabs value={view} onValueChange={setView}>
        <TabsList aria-label="Lesson view">
          <TabsTrigger value="upcoming" disabled={locked}>
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="records" disabled={locked}>
            Attendance & records
          </TabsTrigger>
        </TabsList>
        {["upcoming", "records"].map((tab) => (
          <TabsContent value={tab} key={tab}>
            {query.isPending && <p role="status">Loading lesson records…</p>}
            {query.error && (
              <Notice error>
                {query.error.message}{" "}
                <Button variant="outline" onClick={() => query.refetch()}>
                  Retry lesson records
                </Button>
              </Notice>
            )}
            {!query.isPending && !query.error && !shown.length && (
              <div className="learning-empty">
                <CalendarDays size={28} aria-hidden="true" />
                <h3>
                  {view === "upcoming"
                    ? "No upcoming lessons in the loaded records."
                    : "No lesson records for these dates."}
                </h3>
                <p>
                  {query.hasNextPage
                    ? "Load more lessons to check the rest of this date range."
                    : "Adjust the dates or agree a timetable to see booked lessons here."}
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
          {records.length} loaded {records.length === 1 ? "record" : "records"}{" "}
          in this date range
        </span>
        {query.hasNextPage && (
          <Button
            variant="outline"
            disabled={locked || query.isFetching}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more lessons"}
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
  const teacher = session.account.role === "TEACHER";
  const [action, setAction] = useState<
      "attendance" | "CONFIRMED" | "DISPUTED" | null
    >(null),
    [attendance, setAttendance] = useState("PRESENT"),
    [reason, setReason] = useState(""),
    [recap, setRecap] = useState(""),
    [agreed, setAgreed] = useState(false);
  const review = useRef<HTMLDivElement>(null);
  const decision = useDecision(session, refresh);
  useEffect(() => {
    onLock(l.id, decision.busy || decision.uncertain);
  }, [l.id, decision.busy, decision.uncertain, onLock]);
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
  // shortcut: review history omits actors; use owner review state when the API provides it.
  const [confirmedHere, setConfirmedHere] = useState(false);
  function open(next: typeof action) {
    setAction(next);
    setAgreed(false);
    setReason("");
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
            {new Intl.DateTimeFormat("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
            }).format(new Date(l.startsAt))}
          </strong>
          <span>
            {new Intl.DateTimeFormat("en-IN", {
              timeZone: "Asia/Kolkata",
              month: "short",
            }).format(new Date(l.startsAt))}
          </span>
        </div>
        <div className="learning-lesson-details">
          <h3>
            {l.subject} with {l.teacher.name}
          </h3>
          <p>
            {l.learner.alias} · {l.learner.board}, Class {l.learner.grade}
          </p>
          <span>
            {localTime(l.startsAt)}–{localTime(l.endsAt)} IST · {label(l.kind)}
          </span>
        </div>
        <span
          className={`learning-state ${l.disputed ? "review" : l.status === "COMPLETED" && ["PRESENT", "LATE"].includes(l.attendance) ? "accepted" : l.status === "SCHEDULED" ? "pending" : "neutral"}`}
        >
          {l.disputed
            ? "Attendance under review"
            : `${label(l.status)} · ${label(l.attendance)}`}
        </span>
      </div>
      {l.disputed && (
        <p className="learning-help">
          Excluded from attendance totals until support resolves the record.
        </p>
      )}
      {l.confirmations.length > 0 && (
        <details className="learning-history">
          <summary>
            Recorded attendance reviews ({l.confirmations.length})
          </summary>
          <ul>
            {l.confirmations.map((c, i) => (
              <li key={i}>
                {label(c.action)} · {dayLabel(c.createdAt)}
              </li>
            ))}
          </ul>
          <small>The record does not identify who submitted each review.</small>
          <p>
            Each person can submit one attendance review per lesson. If you have
            already reviewed it,{" "}
            <Link href="/support" className="inline-link">
              ask support to correct the record
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
            Record attendance
          </Button>
        )}
        {canConfirm && (
          <>
            <Button
              variant="outline"
              disabled={decision.locked || blocked || confirmedHere}
              onClick={() => open("CONFIRMED")}
            >
              Confirm attendance
            </Button>
            <Button
              variant="ghost"
              disabled={decision.locked || blocked || confirmedHere}
              onClick={() => open("DISPUTED")}
            >
              Report attendance error
            </Button>
          </>
        )}
      </div>
      {action && (
        <div className="learning-review" ref={review} tabIndex={-1}>
          <h4>
            {action === "attendance"
              ? "Record lesson attendance"
              : action === "CONFIRMED"
                ? "Review attendance confirmation"
                : "Report an attendance error"}
          </h4>
          <p>
            {action === "DISPUTED"
              ? "Explain what is incorrect. This opens a support review and excludes the lesson from attendance totals."
              : `Review the ${label(l.attendance)} record for ${l.learner.alias} on ${dayLabel(l.startsAt)}. Confirm only what actually happened.`}
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
                  Attendance
                  <select
                    aria-label="Attendance"
                    value={attendance}
                    onChange={(e) => setAttendance(e.target.value)}
                  >
                    <option value="PRESENT">Present</option>
                    <option value="LATE">Late</option>
                    <option value="ABSENT">Absent</option>
                  </select>
                </label>
              )}
              <label>
                {action === "DISPUTED"
                  ? "What is incorrect?"
                  : "Reason for this record"}
                <Textarea
                  value={reason}
                  maxLength={action === "attendance" ? 300 : 500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {action === "attendance" && l.kind === "REVISION" && (
                <label>
                  Revision recap
                  {attendance !== "ABSENT" ? " (required)" : " (optional)"}
                  <Textarea
                    value={recap}
                    maxLength={2000}
                    onChange={(e) => setRecap(e.target.value)}
                  />
                  <small>
                    Summarize the topic covered and the learner’s next step.
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
                    ? "I want support to review this attendance record."
                    : "I have reviewed this lesson and the attendance details are accurate."}
                </span>
              </label>
              <div className="learning-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAction(null)}
                >
                  Cancel
                </Button>
                <Button className="button" type="submit">
                  {action === "DISPUTED"
                    ? "Submit attendance dispute"
                    : action === "CONFIRMED"
                      ? "Save attendance confirmation"
                      : "Save attendance record"}
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
          Refresh attendance record
        </Button>
      )}
    </article>
  );
}
