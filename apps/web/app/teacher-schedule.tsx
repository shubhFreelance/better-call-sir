"use client";
import { useHistory, HistoryPages } from "./history";
import { useAppTranslation } from "./locale";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";

type Profile = components["schemas"]["PrivateTeacher"];
type Pattern = components["schemas"]["AvailabilityPattern"];
type Leave = components["schemas"]["Leave"];
type Operation = {
  path: string;
  body: unknown;
  key: string;
  message: string;
  after?: (result: unknown) => void;
};
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const kinds = {
  DEMO: "Demo",
  REVISION: "Revision",
  RECURRING: "Regular tuition",
  CALL: "Calls (unavailable)",
};
const today = (offset = 0) =>
  new Date(Date.now() + 330 * 60000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const clock = (minute: number) =>
  minute === 1440
    ? "Midnight (next day)"
    : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minutes = (value: string) =>
  /^\d{2}:\d{2}$/.test(value)
    ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    : NaN;
const when = (iso: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
    >
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function TeacherSchedule({
  session,
  profile,
  onLockChange,
}: {
  session: Session;
  profile: Profile;
  onLockChange: (locked: boolean) => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const client = useQueryClient();
  const calendar = useHistory<components["schemas"]["PrivateCalendar"]>({
    queryKey: ["teacher-calendar", session.account.id, profile.id],
    path: `/teachers/${profile.id}/calendar`,
    arrayKeys: ["patterns", "exceptions"],
  });
  const [tab, setTab] = useState("hours"),
    [kind, setKind] = useState("DEMO"),
    [weekday, setWeekday] = useState("1");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [midnight, setMidnight] = useState(false),
    [from, setFrom] = useState(today),
    [until, setUntil] = useState(() => today(30));
  const [capacity, setCapacity] = useState(String(profile.maxActiveStudents)),
    [travel, setTravel] = useState(profile.travelAccepted);
  const [leaveStart, setLeaveStart] = useState(""),
    [leaveEnd, setLeaveEnd] = useState(""),
    [leaveReason, setLeaveReason] = useState("");
  const [change, setChange] = useState<{
      type: "pattern" | "leave";
      id: string;
      active: boolean;
    } | null>(null),
    [changeReason, setChangeReason] = useState("");
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [reschedule, setReschedule] = useState(false);
  const operation = useRef<Operation | null>(null);
  const locked = busy || uncertain || conflict;
  useEffect(() => {
    onLockChange(busy || uncertain);
  }, [busy, uncertain, onLockChange]);
  const unavailable = calendar.isPending || !!calendar.error;
  function updateProfile(next: Profile) {
    client.setQueryData(["teacher-setup-profile", session.account.id], {
      profile: next,
    });
    client.invalidateQueries({ queryKey: ["dashboard"] });
  }
  function invalid(errors: Record<string, string>) {
    setFields(errors);
    setError("");
    setSuccess("");
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>("#teaching-schedule [aria-invalid='true']")
        ?.focus(),
    );
  }
  async function run(next?: Omit<Operation, "key">) {
    if (next) operation.current = { ...next, key: crypto.randomUUID() };
    if (!operation.current) return;
    const current = operation.current;
    setBusy(true);
    setError("");
    setSuccess("");
    setFields({});
    setReschedule(false);
    try {
      const result = await api<unknown>(current.path, {
        method: "POST",
        body: current.body,
        key: current.key,
        csrf: session.csrfToken,
        signal: AbortSignal.timeout(15000),
      });
      current.after?.(result);
      operation.current = null;
      setUncertain(false);
      setConflict(false);
      setChange(null);
      setChangeReason("");
      setSuccess(current.message);
      await calendar.refetch();
    } catch (e) {
      const unknown =
        !(e instanceof ApiError) ||
        e.code === "INVALID_RESPONSE" ||
        e.status >= 500;
      setUncertain(unknown);
      setConflict(e instanceof ApiError && e.code === "CONFLICT");
      setReschedule(e instanceof ApiError && e.code === "RESCHEDULE_REQUIRED");
      if (!unknown) operation.current = null;
      setError(
        unknown
          ? "We couldn’t confirm the change. Retry this change before making edits or leaving this page."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const [owner, result] = await Promise.all([
        api<{ profile: Profile }>("/dashboard"),
        calendar.refetch(),
      ]);
      if (result.error) throw result.error;
      updateProfile(owner.profile);
      setConflict(false);
      setChange(null);
      setChangeReason("");
      setSuccess(
        "Latest schedule and profile loaded. Your form entries are preserved; review them before saving.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function addHours() {
    const startMinute = minutes(start),
      endMinute = midnight ? 1440 : minutes(end),
      errors: Record<string, string> = {};
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439)
      errors.start = "Choose a start time.";
    if (
      !Number.isInteger(endMinute) ||
      endMinute <= startMinute ||
      endMinute > 1440
    )
      errors.end =
        "Choose an end time after the start, on the same day or at midnight.";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
      until < from ||
      until < today() ||
      new Date(until).getTime() > Date.now() + 365 * 86400000
    )
      errors.validity =
        "Choose ordered dates with an end date from today through the next 365 days.";
    if (Object.keys(errors).length) return invalid(errors);
    run({
      path: `/teachers/${profile.id}/availability`,
      body: {
        expectedVersion: profile.version,
        kind,
        weekday: Number(weekday),
        startMinute,
        endMinute,
        timezone: "Asia/Kolkata",
        validFrom: from,
        validUntil: until,
      },
      message: "Weekly availability saved. Accepted bookings are unchanged.",
      after: () => {
        setStart("");
        setEnd("");
        setMidnight(false);
      },
    });
  }
  function saveCapacity() {
    const max = Number(capacity);
    if (
      !/^\d+$/.test(capacity) ||
      !Number.isInteger(max) ||
      max < 1 ||
      max > 100
    )
      return invalid({ capacity: "Enter 1–100 students, as a whole number." });
    run({
      path: `/teachers/${profile.id}/capacity`,
      body: {
        expectedVersion: profile.version,
        maxActiveStudents: max,
        travelAccepted: travel,
      },
      message: "Student capacity and travel preference saved.",
      after: (result) => updateProfile(result as Profile),
    });
  }
  function addLeave() {
    const startsAt = new Date(leaveStart + ":00+05:30"),
      endsAt = new Date(leaveEnd + ":00+05:30"),
      errors: Record<string, string> = {};
    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() <= Date.now()
    )
      errors.leaveStart = "Choose a future leave start in IST.";
    if (
      !Number.isFinite(endsAt.getTime()) ||
      endsAt <= startsAt ||
      endsAt.getTime() > Date.now() + 60 * 86400000
    )
      errors.leaveEnd =
        "Choose an end after the start, within the next 60 days.";
    if (!leaveReason.trim() || leaveReason.trim().length > 300)
      errors.leaveReason = "Add a reason of 1–300 characters.";
    if (Object.keys(errors).length) return invalid(errors);
    run({
      path: `/teachers/${profile.id}/leave`,
      body: {
        expectedVersion: profile.version,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: leaveReason.trim(),
      },
      message: "Leave saved. This period is unavailable for new bookings.",
      after: () => {
        setLeaveStart("");
        setLeaveEnd("");
        setLeaveReason("");
      },
    });
  }
  function confirmChange() {
    if (!change || !changeReason.trim())
      return invalid({ changeReason: "Add a reason for this change." });
    const record =
      change.type === "pattern"
        ? calendar.data?.patterns.find((p) => p.id === change.id)
        : calendar.data?.exceptions.find((p) => p.id === change.id);
    if (!record) {
      setError(
        "This schedule item is no longer in the current list. Refresh the schedule.",
      );
      setConflict(true);
      return;
    }
    run({
      path:
        change.type === "pattern"
          ? `/availability/${change.id}/changes`
          : `/leave/${change.id}/cancellations`,
      body: {
        expectedVersion: record.version,
        ...(change.type === "pattern" ? { active: change.active } : {}),
        reason: changeReason.trim(),
      },
      message:
        change.type === "leave"
          ? "Leave cancelled. Weekly availability applies again."
          : change.active
            ? "Weekly hours reopened."
            : "Weekly hours paused. Accepted bookings are unchanged.",
    });
  }
  const props = (key: string) => ({
    "aria-invalid": !!fields[key],
    "aria-describedby": fields[key] ? `schedule-${key}-error` : undefined,
  });
  function field(
    key: string,
    label: string,
    control: ReactNode,
    hint?: string,
  ) {
    return (
      <div className="field">
        <label htmlFor={`schedule-${key}`}>{appText(label)}</label>
        {control}
        {fields[key] ? (
          <small
            role="alert"
            id={`schedule-${key}-error`}
            className="field-error"
          >
            {appError(fields[key])}
          </small>
        ) : (
          hint && <small className="wizard-help">{appText(hint)}</small>
        )}
      </div>
    );
  }
  function selectChange(
    type: "pattern" | "leave",
    item: Pattern | Leave,
    active: boolean,
  ) {
    setChange({ type, id: item.id, active });
    setChangeReason("");
    setFields({});
    setError("");
    setSuccess("");
  }
  return (
    <section className="wizard-card teacher-schedule" id="teaching-schedule">
      <div className="schedule-heading">
        <div>
          <h2>{appText("Your teaching schedule")}</h2>
          <p>
            {appText(
              "Declare your hours, capacity and time away. All times are in IST (Asia/Kolkata).",
            )}{" "}
          </p>
        </div>
        <Button
          variant="outline"
          type="button"
          disabled={busy || uncertain}
          onClick={refresh}
        >
          {appText("Refresh schedule")}{" "}
        </Button>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          setFields({});
          setError("");
          setSuccess("");
          setChange(null);
        }}
      >
        <TabsList
          className="schedule-tabs"
          aria-label={appText("Teaching schedule")}
        >
          <TabsTrigger value="hours" disabled={locked}>
            {appText("Weekly hours")}{" "}
          </TabsTrigger>
          <TabsTrigger value="capacity" disabled={locked}>
            {appText("Capacity")}{" "}
          </TabsTrigger>
          <TabsTrigger value="leave" disabled={locked}>
            {appText("Leave")}{" "}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="hours">
          <p className="wizard-help">
            {appText(
              "Weekly hours offer time for new bookings; they do not create lessons. Pausing hours does not cancel accepted bookings.",
            )}{" "}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              addHours();
            }}
          >
            <fieldset
              className="wizard-fields"
              disabled={locked || unavailable}
            >
              <div className="schedule-grid">
                {field(
                  "kind",
                  "Session type",
                  <select
                    id="schedule-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    {Object.entries(kinds)
                      .filter(([k]) => k !== "CALL")
                      .map(([k, label]) => (
                        <option key={k} value={k}>
                          {appText(label)}
                        </option>
                      ))}
                  </select>,
                )}
                {field(
                  "weekday",
                  "Day of the week",
                  <select
                    id="schedule-weekday"
                    value={weekday}
                    onChange={(e) => setWeekday(e.target.value)}
                  >
                    {days.map((day, i) => (
                      <option key={day} value={i}>
                        {appText(day)}
                      </option>
                    ))}
                  </select>,
                )}
              </div>
              <div className="schedule-grid">
                {field(
                  "start",
                  "Start time (IST)",
                  <Input
                    id="schedule-start"
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    {...props("start")}
                  />,
                )}
                {field(
                  "end",
                  "End time (IST)",
                  <Input
                    id="schedule-end"
                    type="time"
                    disabled={midnight}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    {...props("end")}
                  />,
                )}
              </div>
              <label className="teacher-choice schedule-midnight">
                <input
                  type="checkbox"
                  checked={midnight}
                  onChange={(e) => setMidnight(e.target.checked)}
                />
                <span>
                  {appText("End at midnight (start of the next day)")}
                </span>
              </label>
              <div className="schedule-grid">
                {field(
                  "validity",
                  "Available from",
                  <Input
                    id="schedule-validity"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    {...props("validity")}
                  />,
                )}
                {field(
                  "until",
                  "Available through",
                  <Input
                    id="schedule-until"
                    type="date"
                    min={today()}
                    max={today(365)}
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    {...props("validity")}
                  />,
                )}
              </div>
              <Button className="button" type="submit">
                {appText("Add weekly hours")}{" "}
              </Button>
            </fieldset>
          </form>
          {calendar.data && (
            <div className="schedule-saved">
              <h3>{appText("Saved weekly hours")}</h3>
              {calendar.data.patterns.length ? (
                <ul className="teacher-evidence-list">
                  {calendar.data.patterns.map((pattern) => (
                    <li key={pattern.id}>
                      <div>
                        <strong>
                          {appText(days[pattern.weekday])} ·{" "}
                          {appText(kinds[pattern.kind])}
                        </strong>
                        <p>
                          {clock(pattern.startMinute)}–
                          {clock(pattern.endMinute)} {appText("IST")}{" "}
                        </p>
                        <p>
                          {pattern.validFrom.slice(0, 10)} {appText("to")}{" "}
                          {pattern.validUntil.slice(0, 10)} ·{" "}
                          {pattern.active
                            ? appText("Active")
                            : appText("Paused")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={locked}
                        onClick={() =>
                          selectChange("pattern", pattern, !pattern.active)
                        }
                        aria-label={appText("{0} {1} {2} hours {3}–{4} IST", [
                          pattern.active ? appText("Pause") : appText("Reopen"),
                          appText(days[pattern.weekday]),
                          appText(kinds[pattern.kind]),
                          clock(pattern.startMinute),
                          clock(pattern.endMinute),
                        ])}
                      >
                        {pattern.active
                          ? appText("Pause hours")
                          : appText("Reopen hours")}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="wizard-help">
                  {appText(
                    "No weekly hours yet. Add a time window for each type of session you offer.",
                  )}{" "}
                </p>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="capacity">
          <p className="wizard-help">
            {appText(
              "Capacity is the maximum number of active or committed students you can support. It cannot be reduced below your current commitments.",
            )}{" "}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              saveCapacity();
            }}
          >
            <fieldset
              className="wizard-fields"
              disabled={locked || unavailable}
            >
              {field(
                "capacity",
                "Maximum students",
                <Input
                  id="schedule-capacity"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  {...props("capacity")}
                />,
              )}
              <label className="wizard-checkbox">
                <input
                  type="checkbox"
                  checked={travel}
                  onChange={(e) => setTravel(e.target.checked)}
                />
                <span>
                  {appText(
                    "I can travel for home tuition within my declared localities.",
                  )}{" "}
                </span>
              </label>
              <p className="wizard-help">
                {appText(
                  "Home tuition matching requires both this travel preference and home tuition localities in your application.",
                )}{" "}
              </p>
              <Button className="button" type="submit">
                {appText("Save capacity & travel")}{" "}
              </Button>
            </fieldset>
          </form>
        </TabsContent>
        <TabsContent value="leave">
          <p className="wizard-help">
            {appText(
              "Leave blocks new bookings during the selected period. Accepted or held bookings must be resolved first; they will not be cancelled automatically.",
            )}{" "}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              addLeave();
            }}
          >
            <fieldset
              className="wizard-fields"
              disabled={locked || unavailable}
            >
              <div className="schedule-grid">
                {field(
                  "leaveStart",
                  "Leave starts (IST)",
                  <Input
                    id="schedule-leaveStart"
                    type="datetime-local"
                    value={leaveStart}
                    onChange={(e) => setLeaveStart(e.target.value)}
                    {...props("leaveStart")}
                  />,
                )}
                {field(
                  "leaveEnd",
                  "Leave ends (IST)",
                  <Input
                    id="schedule-leaveEnd"
                    type="datetime-local"
                    value={leaveEnd}
                    onChange={(e) => setLeaveEnd(e.target.value)}
                    {...props("leaveEnd")}
                  />,
                )}
              </div>
              {field(
                "leaveReason",
                "Reason for leave",
                <Textarea
                  id="schedule-leaveReason"
                  rows={3}
                  maxLength={300}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  {...props("leaveReason")}
                />,
                "Visible only in your private calendar and authorized records. Share only what is needed.",
              )}
              <Button className="button" type="submit">
                {appText("Add leave")}{" "}
              </Button>
            </fieldset>
          </form>
          {calendar.data && (
            <div className="schedule-saved">
              <h3>{appText("Saved leave")}</h3>
              {calendar.data.exceptions.length ? (
                <ul className="teacher-evidence-list">
                  {calendar.data.exceptions.map((leave) => (
                    <li key={leave.id}>
                      <div>
                        <strong>
                          {when(leave.startsAt, appLocale)}–
                          {when(leave.endsAt, appLocale)} {appText("IST")}{" "}
                        </strong>
                        <p>{leave.reason}</p>
                      </div>
                      <Button
                        variant="outline"
                        type="button"
                        disabled={locked}
                        onClick={() => selectChange("leave", leave, false)}
                        aria-label={appText("Cancel leave starting {0}", [
                          when(leave.startsAt, appLocale),
                        ])}
                      >
                        {appText("Cancel leave")}{" "}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="wizard-help">{appText("No leave recorded.")}</p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
      {change && (
        <form
          className="schedule-confirm"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            confirmChange();
          }}
        >
          <h3>
            {change.type === "leave"
              ? appText("Cancel this leave?")
              : change.active
                ? appText("Reopen these hours?")
                : appText("Pause these hours?")}
          </h3>
          <p className="wizard-help">
            {change.type === "leave"
              ? appText(
                  "Your declared weekly hours will apply again during this period.",
                )
              : appText(
                  "Accepted bookings are unchanged. This affects availability for new bookings.",
                )}
          </p>
          <fieldset disabled={locked} className="wizard-fields">
            {field(
              "changeReason",
              "Reason for change",
              <Textarea
                id="schedule-changeReason"
                maxLength={300}
                rows={2}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                {...props("changeReason")}
              />,
            )}
            <div className="wizard-actions">
              <Button
                variant="outline"
                className="button secondary"
                type="button"
                onClick={() => setChange(null)}
              >
                {appText("Keep current schedule")}{" "}
              </Button>
              <Button className="button" type="submit">
                {appText("Confirm schedule change")}{" "}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <HistoryPages
        history={calendar}
        label="Teaching availability and leave"
        disabled={locked || !!change}
      />
      {calendar.isPending && (
        <p role="status">{appText("Loading your saved schedule…")}</p>
      )}
      {calendar.error && (
        <Notice error>
          {appError(calendar.error.message)}{" "}
          {appText(
            "Your schedule is unavailable; refresh before making changes.",
          )}{" "}
        </Notice>
      )}
      {error && <Notice error>{appError(error)}</Notice>}
      {reschedule && (
        <Link className="inline-link" href="/dashboard/bookings">
          {appText("Review accepted bookings")}{" "}
        </Link>
      )}
      {uncertain && (
        <Button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => run()}
        >
          {appText("Retry schedule change")}{" "}
        </Button>
      )}
      {conflict && (
        <p className="wizard-help">
          {appText(
            "Refresh the schedule to load its current version. Your form entries will stay here.",
          )}{" "}
        </p>
      )}
      {busy && <p role="status">{appText("Saving your schedule…")}</p>}
      {success && <Notice>{appText(success)}</Notice>}
      <p className="wizard-save-note">
        {appText(
          "Form entries are saved only when you confirm an action. Keep this page open until the result is confirmed. Calls are currently unavailable. Load more records to browse all saved weekly windows and active leave periods.",
        )}{" "}
      </p>
    </section>
  );
}
