"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { useHistory, HistoryPages } from "./history";
import { useAppTranslation } from "./locale";
import {
  WeeklyAvailability,
  WeeklySummary,
  AvailabilityMode,
  weeklyPreferences,
  weeklyRows,
  emptyWeekly,
} from "./weekly-availability";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  api,
  ApiError,
  type Dashboard,
  type Session,
  type Teacher,
  type Placement,
  type components,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";
import { ActionToast } from "../components/ui/action-toast";
import {
  preferences as buildPreferences,
  localTime,
  type Window as PreferenceWindow,
} from "./guardian-onboarding";
type Request = components["schemas"]["TuitionRequestDetails"];
type Candidate = components["schemas"]["Candidate"];
type Demo = components["schemas"]["Demo"];
const money = (paise: number, locale = "en-IN") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
const when = (iso: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
const unknown = (error: unknown) =>
  !(error instanceof ApiError) ||
  error.code === "INVALID_RESPONSE" ||
  (error.status >= 500 &&
    !["CHECKOUT_PAUSED", "FEATURE_PAUSED"].includes(error.code));
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
    >
      <AlertDescription>
        <div>{children}</div>
      </AlertDescription>
    </Alert>
  );
}
export function useDecision(
  session: Session,
  refresh: () => Promise<void>,
  acceptsResult = (result: unknown) =>
    !!result &&
    typeof result === "object" &&
    "id" in result &&
    typeof result.id === "string",
) {
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const pending = useRef<{
    path: string;
    body: unknown;
    key: string;
    message: string;
    onSaved?: (result: unknown) => void;
  } | null>(null);
  async function run(next?: {
    path: string;
    body: unknown;
    message: string;
    onSaved?: (result: unknown) => void;
  }) {
    if (next) pending.current = { ...next, key: crypto.randomUUID() };
    if (!pending.current) return false;
    const operation = pending.current;
    setBusy(true);
    setError("");
    setSuccess("");
    let result: unknown;
    try {
      result = await api<unknown>(operation.path, {
        method: "POST",
        csrf: session.csrfToken,
        key: operation.key,
        body: operation.body,
        signal: AbortSignal.timeout(15000),
      });
      if (!acceptsResult(result))
        throw new Error("The service did not confirm the result.");
    } catch (e) {
      const unsure = unknown(e);
      setUncertain(unsure);
      setConflict(
        e instanceof ApiError &&
          ["CONFLICT", "CANDIDATE_CHANGED", "INELIGIBLE", "STALE_RUN"].includes(
            e.code,
          ),
      );
      if (!unsure) pending.current = null;
      setError(
        unsure
          ? "We couldn’t confirm this decision. Retry the same decision before editing or leaving this page."
          : (e as Error).message,
      );
      setBusy(false);
      return false;
    }
    pending.current = null;
    setUncertain(false);
    setConflict(false);
    setSuccess(operation.message);
    try {
      await refresh();
    } catch {
      setConflict(true);
      setError(
        "Your decision was saved, but current details could not be loaded. Refresh before making another decision.",
      );
    }
    operation.onSaved?.(result);
    setBusy(false);
    return true;
  }
  async function reload() {
    setBusy(true);
    setError("");
    try {
      await refresh();
      setConflict(false);
      setSuccess("Current details loaded. Review them before confirming.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    uncertain,
    conflict,
    error,
    success,
    locked: busy || uncertain || conflict,
    run,
    reload,
    invalid: (message: string) => {
      setError(message);
      setSuccess("");
    },
  };
}
export function Feedback({
  decision,
  floating = false,
  translate = (text: string) => text,
}: {
  decision: ReturnType<typeof useDecision>;
  floating?: boolean;
  translate?: (text: string) => string;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <>
      {floating && <ActionToast message={decision.error ? appError(translate(decision.error)) : decision.success ? appText(translate(decision.success)) : ""} error={!!decision.error} />}
      {!floating && decision.error && (
        <Notice error>{appError(translate(decision.error))}</Notice>
      )}
      {!floating && decision.success && (
        <Notice>{appText(translate(decision.success))}</Notice>
      )}
      {decision.busy && (
        <p role="status">{appText(translate("Saving your decision…"))}</p>
      )}
      {decision.uncertain && (
        <Button
          className="button"
          disabled={decision.busy}
          onClick={() => decision.run()}
        >
          {appText(translate("Retry same decision"))}
        </Button>
      )}
    </>
  );
}
export function TuitionRequests({
  session,
  dashboard: d,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const params = useSearchParams();
  const [selected, setSelected] = useState(
      params.get("request") || d.requests?.[0]?.id || "",
    ),
    [locked, setLocked] = useState(false);
  const linkedRequest = params.get("request"),
    lastLink = useRef(linkedRequest);
  useEffect(() => {
    if (lastLink.current !== linkedRequest && !locked) {
      lastLink.current = linkedRequest;
      setSelected(linkedRequest || d.requests?.[0]?.id || "");
    }
  }, [linkedRequest, locked, d.requests]);
  const request = d.requests?.find((r) => r.id === selected);
  const permitted =
    session.account.verified && !!d.consent && !d.consent.withdrawnAt;
  return (
    <div className="tuition-workspace">
      <section className="panel">
        <div className="panel-title">
          <h2>{appText("Your tuition requests")}</h2>
          <Link href="/onboarding/parent" className="button secondary">
            {appText("New request")}{" "}
          </Link>
        </div>
        <p>
          {appText(
            "Compare teacher options and review tuition terms. A demo is optional when the teacher offers one. Your choices stay with you.",
          )}{" "}
        </p>
        {!permitted && (
          <Notice>
            {appText(
              "Guardian verification and active consent are required before making new tuition decisions.",
            )}{" "}
            <Link href="/onboarding/parent" className="inline-link">
              {appText("Review guardian onboarding")}{" "}
            </Link>
          </Notice>
        )}
        {request ? (
          <div className="field">
            <label htmlFor="tuition-request">
              {appText("Choose a tuition request")}
            </label>
            <select
              id="tuition-request"
              value={request.id}
              disabled={locked}
              onChange={(e) => setSelected(e.target.value)}
            >
              {d.requests?.map((r) => (
                <option key={r.id} value={r.id}>
                  {d.children?.find((c) => c.id === r.childId)?.alias ||
                    appText("Learner")}{" "}
                  · {appCurriculum(r.subject)} ·{" "}
                  {r.mode === "HOME" ? appText("At home") : appText("Online")} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString(appLocale)}
                </option>
              ))}
            </select>
          </div>
        ) : selected ? (
          <Notice error>
            {appText(
              "This enquiry is not available in your current request list.",
            )}{" "}
            <Link className="inline-link" href="/dashboard">
              {appText("Return to your enquiries")}{" "}
            </Link>
          </Notice>
        ) : (
          <p>{appText("No requests yet. Tell us what your family needs.")}</p>
        )}
      </section>
      {request && (
        <RequestReview
          key={request.id}
          session={session}
          requestId={request.id}
          dashboard={d}
          permitted={permitted}
          onLockChange={setLocked}
        />
      )}
    </div>
  );
}
export function RequestReview({
  visible = true,
  session,
  requestId,
  dashboard,
  permitted,
  onLockChange,
}: {
  session: Session;
  requestId: string;
  visible?: boolean;
  dashboard: Dashboard;
  permitted: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ["request", session.account.id, requestId],
    queryFn: () => api<Request>(`/requests/${requestId}`),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const demos = useHistory<{ items: Demo[]; nextCursor?: string | null }>({
    queryKey: ["demos", session.account.id, requestId],
    path: "/demos?requestId=" + encodeURIComponent(requestId),
  });
  const [form, setForm] = useState<{
      kind: "choice" | "demo" | "terms";
      candidateId?: string;
      teacherId: string;
    } | null>(null),
    [agreed, setAgreed] = useState(false),
    [scheduleOpen, setScheduleOpen] = useState(false);
  const [weeklyMode, setWeeklyMode] = useState(true),
    [weekly, setWeekly] = useState(emptyWeekly);
  const [windows, setWindows] = useState<PreferenceWindow[]>([
    { start: "", duration: "60" },
  ]);
  useEffect(() => {
    if (form || scheduleOpen)
      requestAnimationFrame(() => {
        const box = document.querySelector<HTMLElement>(
          ".tuition-request-review .tuition-confirm",
        );
        box?.focus();
        box?.scrollIntoView({ block: "nearest" });
      });
  }, [form?.kind, form?.candidateId, form?.teacherId, scheduleOpen]);
  async function refresh() {
    const result = await detail.refetch();
    if (result.error) throw result.error;
    const demoResult = await demos.refetch();
    if (demoResult.error) throw demoResult.error;
    const current = await api<Dashboard>("/dashboard");
    client.setQueryData(["dashboard", session.account.id], current);
  }
  const decision = useDecision(session, refresh);
  useEffect(() => {
    onLockChange(decision.locked || !!form || scheduleOpen);
  }, [decision.locked, form, scheduleOpen, onLockChange]);
  const request = detail.data,
    child = dashboard.children?.find((c) => c.id === request?.childId);
  const filters = new URLSearchParams({
    limit: "50",
    ...(request
      ? {
          subject: request.subject,
          mode: request.mode,
          language: request.language,
          maxMonthlyPaise: String(request.budgetPaise),
          ...(request.mode === "HOME" ? { locality: request.locality } : {}),
        }
      : {}),
    ...(child?.board && child.grade !== null
      ? { board: child.board, grade: String(child.grade) }
      : {}),
  });
  const completedDemos =
    demos.data?.items.filter(
      (d) => d.requestId === requestId && d.status === "COMPLETED",
    ) || [];
  const wanted = new Set([
    ...(request?.candidates.map((c) => c.teacherId) || []),
    ...completedDemos.map((d) => d.teacherId),
  ]);
  const profiles = useInfiniteQuery({
    queryKey: ["shortlist-profiles", requestId, filters.toString()],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<{ items: Teacher[]; nextCursor?: string | null }>(
        `/teachers?${filters}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        { signal },
      ),
    getNextPageParam: (last) => last.nextCursor || undefined,
    enabled: wanted.size > 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const teachers = profiles.data?.pages.flatMap((p) => p.items) || [];
  const missing = [...wanted].some((id) => !teachers.some((t) => t.id === id));
  // shortcut: four catalog pages load automatically; use an ID lookup when the API provides one.
  useEffect(() => {
    if (
      missing &&
      profiles.hasNextPage &&
      !profiles.isFetchingNextPage &&
      (profiles.data?.pages.length || 0) < 4 &&
      !profiles.error
    )
      void profiles.fetchNextPage();
  }, [
    missing,
    profiles.hasNextPage,
    profiles.isFetchingNextPage,
    profiles.data?.pages.length,
    profiles.error,
  ]);
  if (!visible)
    return (
      <>
        <Feedback decision={decision} />
        {decision.uncertain && (
          <Button disabled={decision.busy} onClick={() => decision.run()}>
            {appText("Retry the same decision")}
          </Button>
        )}
        {decision.conflict && (
          <RefreshButton disabled={decision.busy} onClick={() => decision.reload()} label={appText("Reload current details")} />
        )}
      </>
    );
  if (detail.isPending)
    return (
      <section className="panel">
        <p role="status">{appText("Loading the current shortlist…")}</p>
      </section>
    );
  if (detail.error || !request)
    return (
      <section className="panel">
        <Notice error>
          {appError(detail.error?.message) ||
            appText("Request details are unavailable.")}
        </Notice>
        <Button variant="outline" onClick={() => detail.refetch()}>
          {appText("Retry request details")}{" "}
        </Button>
      </section>
    );
  const placement = dashboard.placements?.find(
    (p) => (p as Placement & { requestId?: string }).requestId === request.id,
  );
  const chosen = request.candidates.find((c) => c.id === form?.candidateId);
  const teacher =
    teachers.find((t) => t.id === form?.teacherId) ||
    dashboard.teachers?.find((t) => t.id === form?.teacherId);
  const blocked =
    decision.locked || !permitted || request.status !== "OPEN" || !!placement;
  const current = (c: Candidate) =>
    !!c.version &&
    !!c.runId &&
    !!c.presentedAt &&
    !!c.expiresAt &&
    new Date(c.expiresAt).getTime() > Date.now();
  function open(kind: "choice" | "demo" | "terms", c: Candidate) {
    setForm({ kind, candidateId: c.id, teacherId: c.teacherId });
    setAgreed(false);
    setScheduleOpen(false);
  }
  async function confirmChoice() {
    if (!chosen || !current(chosen) || !agreed) {
      decision.invalid(
        "Review a current teacher option and confirm your choice.",
      );
      return;
    }
    await decision.run({
      path: `/requests/${request!.id}/selections`,
      body: {
        expectedVersion: request!.version,
        candidateId: chosen.id,
        candidateVersion: chosen.version,
      },
      message:
        "Teacher choice saved. This does not assign a teacher or start tuition.",
      onSaved: () => setForm(null),
    });
  }
  async function createTerms() {
    if (
      !form ||
      !agreed ||
      !(
        completedDemos.some((d) => d.teacherId === form.teacherId) ||
        request?.candidates.some(
          (c) =>
            c.teacherId === form.teacherId &&
            c.response === "ACCEPTED" &&
            current(c),
        )
      )
    ) {
      decision.invalid(
        "Confirm that you want to open tuition terms for this teacher.",
      );
      return;
    }
    await decision.run({
      path: "/placements",
      body: { requestId: request!.id, teacherId: form.teacherId },
      message:
        "Tuition terms created. Continue to hiring confirmation to review the amount and both parties’ acceptance.",
      onSaved: () => setForm(null),
    });
  }
  async function saveWindows() {
    const preferences = weeklyMode
      ? weeklyPreferences(weekly)
      : buildPreferences(windows);
    if (!preferences || !agreed) {
      decision.invalid(
        weeklyMode
          ? "Confirm valid nonoverlapping weekly time ranges and acknowledge the shortlist reset."
          : "Confirm nonoverlapping 20–120 minute windows, at least one hour ahead and within 60 days, and acknowledge the shortlist reset.",
      );
      return;
    }
    await decision.run({
      path: `/requests/${request!.id}/schedules`,
      body: { expectedVersion: request!.version, ...preferences },
      message:
        "Availability preferences saved. The previous shortlist has been cleared for a new review.",
      onSaved: () => setScheduleOpen(false),
    });
  }
  return (
    <section className="panel tuition-request-review">
      <div className="panel-title">
        <h2>
          {child?.alias || appText("Your learner")} ·{" "}
          {appCurriculum(request.subject)}
        </h2>
        <RefreshButton
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => decision.reload()}
         label={appText("Refresh shortlist")} />
      </div>
      <dl className="tuition-summary">
        <div>
          <dt>{appText("Discovery")}</dt>
          <dd>
            {request.discoveryMethod === "MANUAL"
              ? appText("Search · your selected teacher")
              : appText("Let us search for you")}
          </dd>
        </div>
        <div>
          <dt>{appText("Lessons")}</dt>
          <dd>
            {request.mode === "HOME" ? appText("At home") : appText("Online")} ·{" "}
            {appCurriculum(request.language)} · {request.locality}
          </dd>
        </div>
        <div>
          <dt>{appText("Monthly budget")}</dt>
          <dd>
            {appText("Up to")} {money(request.budgetPaise, appLocale)}
          </dd>
        </div>
        <div>
          <dt>{appText("Request status")}</dt>
          <dd>{appText(request.status.toLowerCase().replaceAll("_", " "))}</dd>
        </div>
      </dl>
      <ol
        className="enquiry-progress"
        aria-label={appText("Enquiry to hiring progress")}
      >
        {[
          "Enquiry saved",
          request.candidates.some(
            (c) => current(c) && c.response === "ACCEPTED",
          )
            ? "Teacher interest received"
            : "Awaiting reviewed teacher options",
          request.selectedCandidateId
            ? "Teacher choice recorded"
            : "Choose your teacher",
          placement
            ? placement.guardianAccepted && placement.teacherAccepted
              ? "Hiring terms confirmed"
              : "Confirm hiring terms"
            : "Review monthly hiring terms",
        ].map((label, index) => (
          <li
            key={index}
            aria-current={
              (placement
                ? 3
                : request.selectedCandidateId
                  ? 3
                  : request.candidates.some(
                        (c) => current(c) && c.response === "ACCEPTED",
                      )
                    ? 2
                    : 1) === index
                ? "step"
                : undefined
            }
          >
            {appText(label)}
          </li>
        ))}
      </ol>
      <div className="enquiry-availability-panel">
      <h3 id="enquiry-availability" tabIndex={-1}>
        {appText("Your availability preferences")}{" "}
      </h3>
      <p className="enquiry-schedule-note">{request.schedule}</p>
      {request.schedulePreferences &&
      "weekly" in request.schedulePreferences ? (
        <WeeklySummary preferences={request.schedulePreferences} />
      ) : request.schedulePreferences?.slots.length ? (
        <ul className="tuition-windows">
          {request.schedulePreferences.slots.map((w) => (
            <li key={w.startsAt}>
              {when(w.startsAt, appLocale)}–{when(w.endsAt, appLocale)}{" "}
              {appText("IST")}{" "}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {appText(
            "No structured availability is confirmed yet. Share time windows before a shortlist can be reviewed.",
          )}{" "}
        </p>
      )}
      <p className="wizard-help">
        {appText(
          "These are preferences, not booked classes. Teacher options are reviewed against current availability and capacity.",
        )}{" "}
      </p>
      {!placement && request.status === "OPEN" && (
        <Button
          variant="outline"
          disabled={blocked}
          onClick={() => {
            setWeeklyMode(
              !request.schedulePreferences ||
                "weekly" in request.schedulePreferences,
            );
            setWeekly(
              request.schedulePreferences &&
                "weekly" in request.schedulePreferences
                ? weeklyRows(request.schedulePreferences)
                : emptyWeekly(),
            );
            setScheduleOpen(true);
            setForm(null);
            setAgreed(false);
            setWindows(
              (request.schedulePreferences &&
              "slots" in request.schedulePreferences
                ? request.schedulePreferences.slots
                : undefined
              )?.map((w) => ({
                start: localTime(w.startsAt),
                duration: String(
                  (new Date(w.endsAt).getTime() -
                    new Date(w.startsAt).getTime()) /
                    60000,
                ),
              })) || [{ start: "", duration: "60" }],
            );
          }}
        >
          {appText("Update availability preferences")}{" "}
        </Button>
      )}
      </div>
      {scheduleOpen && (
        <form
          tabIndex={-1}
          className="tuition-confirm"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            saveWindows();
          }}
        >
          <h3>{appText("Update availability preferences")}</h3>
          <p>
            {appText(
              "Changing these windows clears the current reviewed shortlist and teacher choice. Existing demo reservations are not cancelled.",
            )}{" "}
          </p>
          <fieldset disabled={blocked} className="wizard-fields">
            <AvailabilityMode
              weekly={weeklyMode}
              onChange={(v) => {
                setWeeklyMode(v);
                setAgreed(false);
              }}
            />
            {weeklyMode ? (
              <WeeklyAvailability
                rows={weekly}
                onChange={(v) => {
                  setWeekly(v);
                  setAgreed(false);
                }}
              />
            ) : (
              <>
                {windows.map((w, i) => (
                  <div className="tuition-window" key={i}>
                    <div className="field">
                      <label htmlFor={`request-window-${i}`}>
                        {appText("Preferred start")} {i + 1}{" "}
                        {appText("(IST)")}{" "}
                      </label>
                      <Input
                        id={`request-window-${i}`}
                        type="datetime-local"
                        value={w.start}
                        onChange={(e) =>
                          setWindows((v) =>
                            v.map((x, j) =>
                              j === i ? { ...x, start: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`request-duration-${i}`}>
                        {appText("Window duration")} {i + 1}
                      </label>
                      <select
                        id={`request-duration-${i}`}
                        value={w.duration}
                        onChange={(e) =>
                          setWindows((v) =>
                            v.map((x, j) =>
                              j === i ? { ...x, duration: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        {[20, 30, 40, 60, 90, 120].map((n) => (
                          <option key={n} value={n}>
                            {n} {appText("minutes")}{" "}
                          </option>
                        ))}
                      </select>
                    </div>
                    {windows.length > 1 && (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() =>
                          setWindows((v) => v.filter((_, j) => j !== i))
                        }
                        aria-label={appText("Remove availability window {0}", [
                          i + 1,
                        ])}
                      >
                        {appText("Remove")}{" "}
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  type="button"
                  disabled={windows.length >= 6}
                  onClick={() =>
                    setWindows((v) => [...v, { start: "", duration: "60" }])
                  }
                >
                  {appText("Add availability window")}{" "}
                </Button>
              </>
            )}
            <label className="wizard-checkbox">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                {appText(
                  "I understand that the reviewed shortlist and teacher choice will be reset.",
                )}{" "}
              </span>
            </label>
            <div className="wizard-actions">
              <Button
                variant="outline"
                type="button"
                onClick={() => setScheduleOpen(false)}
              >
                {appText("Cancel")}{" "}
              </Button>
              <Button className="button" type="submit">
                {appText("Save availability preferences")}{" "}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {placement ? (
        <section
          className="enquiry-handoff"
          aria-label={appText("Hiring confirmation next step")}
        >
          <h3>
            {placement.guardianAccepted && placement.teacherAccepted
              ? appText("Hiring terms confirmed")
              : appText("Your hiring agreement is ready to review")}
          </h3>
          <p>
            {appText("Guardian:")}{" "}
            {placement.guardianAccepted
              ? appText("accepted")
              : appText("pending")}{" "}
            {appText("· Teacher:")}{" "}
            {placement.teacherAccepted
              ? appText("accepted")
              : appText("pending")}
            {appText(
              ". Review the current agreement and both parties’ confirmation. A demo and class timetable are not required.",
            )}{" "}
          </p>
          <Link
            className="button"
            href={
              session.account.role === "STUDENT"
                ? `/dashboard/learning-choices?request=${request.id}#learning-arrangement-${placement.id}`
                : `/dashboard?arrangement=${placement.id}`
            }
          >
            {appText("Continue to hiring confirmation")}{" "}
          </Link>
          <p className="wizard-help">
            {appText(
              "Confirmed hiring terms do not charge anyone or confirm that teaching has started.",
            )}{" "}
          </p>
        </section>
      ) : (
        <>
          <section className="enquiry-options-panel">
          <h3>{appText("Reviewed teacher options")}</h3>
          <p className="wizard-help">
            {appText(
              "Options are reviewed using your criteria. Teacher acceptance, your choice and an optional demo are separate steps; no automatic assignment is made.",
            )}{" "}
          </p>
          {profiles.isPending && request.candidates.length > 0 && (
            <p role="status">{appText("Loading teacher profiles…")}</p>
          )}
          {profiles.error && (
            <>
              <Notice error>{appError(profiles.error.message)}</Notice>
              <Button variant="outline" onClick={() => profiles.refetch()}>
                {appText("Retry teacher profiles")}{" "}
              </Button>
            </>
          )}
          {!request.candidates.length && (
            <Notice>
              {request.status !== "OPEN"
                ? appText("This request is no longer open for teacher choices.")
                : completedDemos.length
                  ? appText(
                      "No current shortlist options are shown. Review your completed demo below to open tuition terms.",
                    )
                  : request.matchStatus === "NO_MATCH"
                    ? appText(
                        "No eligible teacher is on this shortlist right now. Review your criteria or contact support.",
                      )
                    : request.scheduleStatus !== "CONFIRMED" ||
                        request.matchStatus === "NEEDS_SCHEDULE"
                      ? appText(
                          "Confirm your availability preferences so a shortlist can be reviewed.",
                        )
                      : appText(
                          "Your shortlist is awaiting review or current teacher responses. Refresh later or contact support for help.",
                        )}
            </Notice>
          )}
          {request.status === "OPEN" &&
            (request.matchStatus === "NO_MATCH" ||
              (request.candidates.length > 0 &&
                request.candidates.every(
                  (c) => c.response === "DECLINED" || !current(c),
                ))) && (
              <section
                className="coverage-recovery"
                aria-label={appText("Enquiry recovery")}
              >
                <h3>
                  {request.matchStatus === "NO_MATCH"
                    ? appText("Keep your enquiry. Explore another path.")
                    : appText("These teacher options need another review.")}
                </h3>
                <p>
                  {appText(
                    "Your enquiry and learner details are preserved. Review your availability or ask support to review other eligible teachers. Changes to availability clear the old shortlist and choice only after your acknowledgement.",
                  )}{" "}
                </p>
                <div className="wizard-actions">
                  <a className="inline-link" href="#enquiry-availability">
                    {appText("Review availability")}{" "}
                  </a>
                  <Link className="inline-link" href="/teachers">
                    {appText("Browse teachers manually")}{" "}
                  </Link>
                  <Link
                    className="inline-link"
                    href={`/support?request=${request.id}`}
                  >
                    {appText("Ask for search support")}{" "}
                  </Link>
                </div>
                <p className="wizard-help">
                  {appText(
                    "The waitlist is for a class, subject, board or city outside pilot coverage—not a guarantee of teacher availability.",
                  )}{" "}
                </p>
                <Link className="inline-link" href="/waitlist">
                  {appText("Request future coverage")}{" "}
                </Link>
              </section>
            )}
          {request.candidates.map((c) => {
            const profile = teachers.find((t) => t.id === c.teacherId),
              demo = demos.data?.items
                .filter(
                  (d) =>
                    d.requestId === request.id && d.teacherId === c.teacherId,
                )
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            return (
              <CandidateCard
                key={`${c.id}:${c.runId}`}
                candidate={c}
                profile={profile}
                selected={request.selectedCandidateId === c.id}
                session={session}
                requestId={request.id}
                canRecord={permitted && request.status === "OPEN" && current(c)}
              >
                <p className="tuition-response">
                  {c.response === "ACCEPTED"
                    ? appText("Teacher has accepted this opportunity")
                    : c.response === "DECLINED"
                      ? appText("Teacher has declined this opportunity")
                      : appText("Waiting for the teacher’s response")}
                </p>
                {demo && (
                  <p>
                    {appText("Demo:")}{" "}
                    {appText(demo.status.toLowerCase().replaceAll("_", " "))}
                  </p>
                )}
                {c.expiresAt && (
                  <p className="wizard-help">
                    {appText("Option expires")} {when(c.expiresAt, appLocale)}{" "}
                    {appText("IST.")}{" "}
                  </p>
                )}
                <div className="wizard-actions">
                  {c.response === "ACCEPTED" && current(c) && profile && (
                    <>
                      <Button
                        variant="outline"
                        disabled={blocked}
                        onClick={() => open("choice", c)}
                      >
                        {request.selectedCandidateId === c.id
                          ? appText("Review teacher choice")
                          : appText("Select teacher")}
                      </Button>
                      {demos.isPending ? (
                        <p role="status">{appText("Loading demo progress…")}</p>
                      ) : demos.error ? (
                        <Button
                          variant="outline"
                          onClick={() => demos.refetch()}
                        >
                          {appText("Retry demo status")}{" "}
                        </Button>
                      ) : demo?.status === "COMPLETED" ? (
                        <p className="wizard-help">
                          {appText(
                            "Review tuition terms from the completed demo below.",
                          )}{" "}
                        </p>
                      ) : demo &&
                        ["PROPOSED", "CONFIRMED", "DISPUTED"].includes(
                          demo.status,
                        ) ? (
                        <Link
                          href={
                            session.account.role === "STUDENT"
                              ? "#optional-demos"
                              : "/dashboard/bookings"
                          }
                          className="button secondary"
                        >
                          {appText("Review demo ·")}{" "}
                          {appText(demo.status.toLowerCase())}
                        </Link>
                      ) : profile?.demoAvailable ? (
                        <Button
                          variant="outline"
                          disabled={blocked}
                          onClick={() => open("demo", c)}
                        >
                          {appText("Choose & arrange optional demo")}{" "}
                        </Button>
                      ) : (
                        <p className="wizard-help">
                          {appText(
                            "Demo not currently offered. You can review tuition terms without a demo.",
                          )}{" "}
                        </p>
                      )}
                    </>
                  )}
                  {current(c) &&
                    c.response === "ACCEPTED" &&
                    request.selectedCandidateId === c.id &&
                    (!demo || demo.status === "CANCELLED") && (
                      <Button
                        className="button"
                        disabled={blocked || demos.isPending || !!demos.error}
                        onClick={() => open("terms", c)}
                      >
                        {appText("Review tuition terms without a demo")}{" "}
                      </Button>
                    )}
                  {!current(c) && (
                    <p className="wizard-help">
                      {appText(
                        "Refresh the shortlist before choosing this option.",
                      )}{" "}
                    </p>
                  )}
                </div>
              </CandidateCard>
            );
          })}
          {missing && profiles.hasNextPage && (
            <Button
              variant="outline"
              disabled={profiles.isFetchingNextPage}
              onClick={() => profiles.fetchNextPage()}
            >
              {appText("Load more teacher profiles")}{" "}
            </Button>
          )}
          {missing && !profiles.hasNextPage && !profiles.isPending && (
            <p className="wizard-help">
              {appText(
                "Some public profiles are unavailable. Refresh the shortlist before making a choice.",
              )}{" "}
            </p>
          )}
          </section>
        </>
      )}
      {!placement && completedDemos.length > 0 && (
        <section className="tuition-completed-demos">
          <h3>{appText("Completed demos")}</h3>
          <p>
            {appText(
              "A completed demo stays available for agreement review after its shortlist expires. Current fit and teacher acceptance will be checked before terms are created.",
            )}{" "}
          </p>
          {completedDemos.map((d) => {
            const profile =
              teachers.find((t) => t.id === d.teacherId) ||
              dashboard.teachers?.find((t) => t.id === d.teacherId);
            return (
              <div className="tuition-candidate" key={d.id}>
                <h4>
                  {profile?.name || appText("Teacher profile not loaded")}
                </h4>
                <p>
                  {when(d.reservation.startsAt, appLocale)}{" "}
                  {appText("IST · Completed")}
                </p>
                <Button
                  className="button"
                  disabled={blocked || !profile}
                  onClick={() => {
                    setForm({ kind: "terms", teacherId: d.teacherId });
                    setAgreed(false);
                    setScheduleOpen(false);
                  }}
                >
                  {appText("Review tuition terms")}{" "}
                </Button>
              </div>
            );
          })}
        </section>
      )}
      {form && (chosen || form.kind === "terms") && teacher && (
        <div className="tuition-confirm" tabIndex={-1}>
          <h3>
            {form.kind === "choice"
              ? appText("Choose {0}?", [teacher.name])
              : form.kind === "demo"
                ? appText("Arrange a demo with {0}", [teacher.name])
                : appText("Open tuition terms with {0}?", [teacher.name])}
          </h3>
          {form.kind === "demo" ? (
            <DemoProposal
              teacherId={teacher.id}
              disabled={blocked}
              onCancel={() => setForm(null)}
              onError={decision.invalid}
              onSubmit={async (body) => {
                if (!chosen || !current(chosen)) {
                  decision.invalid(
                    "This teacher option expired. Refresh the shortlist before proposing a demo.",
                  );
                  return;
                }
                await decision.run({
                  path: "/demos",
                  body: {
                    requestId: request.id,
                    teacherId: teacher.id,
                    ...body,
                  },
                  message:
                    "Demo proposal saved. Both you and the teacher must accept the same time before it is confirmed.",
                  onSaved: () => setForm(null),
                });
              }}
            />
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (form.kind === "choice") confirmChoice();
                else createTerms();
              }}
            >
              <p>
                {money(teacher.monthlyPaise, appLocale)}{" "}
                {appText("per month ·")}{" "}
                {teacher.subjects
                  .map((value) => appCurriculum(value))
                  .join(" & ")}
              </p>
              <p>
                {form.kind === "choice"
                  ? appText(
                      "This saves your preferred teacher. It does not assign a teacher, confirm a demo or start paid tuition.",
                    )
                  : appText(
                      "A demo is optional. Opening terms creates a pending agreement; neither party has accepted it yet.",
                    )}
              </p>
              <fieldset disabled={blocked} className="wizard-fields">
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <span>
                    {form.kind === "choice"
                      ? appText(
                          "I understand this records my teacher choice without starting tuition.",
                        )
                      : appText(
                          "I want to open a pending tuition agreement with this teacher.",
                        )}
                  </span>
                </label>
                <div className="wizard-actions">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setForm(null)}
                  >
                    {appText("Cancel")}{" "}
                  </Button>
                  <Button className="button" type="submit">
                    {form.kind === "choice"
                      ? appText("Confirm teacher choice")
                      : appText("Open tuition agreement")}
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
        </div>
      )}
      <HistoryPages
        history={demos}
        label="Optional demo history"
        disabled={decision.locked || !!form || scheduleOpen}
      />
      <Feedback decision={decision} />
      <Link href={`/support?request=${request.id}`} className="inline-link">
        {appText("Get help with this request")}{" "}
      </Link>
    </section>
  );
}
function CandidateCard({
  candidate: c,
  profile,
  selected,
  children,
  session,
  requestId,
  canRecord,
}: {
  candidate: Candidate;
  profile?: Teacher;
  selected: boolean;
  children: ReactNode;
  session: Session;
  requestId: string;
  canRecord: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const tile = useRef<HTMLElement>(null),
    retry = useRef<{ key: string; body: unknown } | null>(null),
    sent = useRef(false);
  const [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  async function recordView() {
    if (!retry.current)
      retry.current = {
        key: crypto.randomUUID(),
        body: { runId: c.runId, candidateIds: [c.id] },
      };
    setBusy(true);
    try {
      await api(`/requests/${requestId}/presentations`, {
        method: "POST",
        csrf: session.csrfToken,
        key: retry.current.key,
        body: retry.current.body,
        signal: AbortSignal.timeout(12000),
      });
      setError(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!profile || !canRecord || !tile.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          document.visibilityState === "visible" &&
          !sent.current
        ) {
          sent.current = true;
          void recordView();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(tile.current);
    return () => observer.disconnect();
  }, [profile?.id, canRecord, c.runId]);
  return (
    <article ref={tile} className="tuition-candidate" data-candidate-id={c.id}>
      <div className="panel-title">
        <h4>{profile?.name || appText("Teacher profile not loaded")}</h4>
        {selected && (
          <span className="badge">{appText("Your saved choice")}</span>
        )}
      </div>
      {profile && (
        <>
          <p>{profile.headline}</p>
          <p>
            {money(profile.monthlyPaise, appLocale)} {appText("per month ·")}{" "}
            {profile.experience} {appText("years teaching")}{" "}
          </p>
          <Link href={`/teachers/${profile.slug}`} className="inline-link">
            {appText("View")} {profile.name}
            {appText("’s profile")}{" "}
          </Link>
        </>
      )}
      <h5>{appText("Why this teacher was shortlisted")}</h5>
      <ul>
        {c.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
      {children}
      {error && (
        <p className="wizard-help" role="status">
          {appText(
            "We couldn’t confirm this shortlist view in your request history.",
          )}{" "}
          <Button
            variant="ghost"
            disabled={busy || !canRecord}
            onClick={recordView}
          >
            {appText("Retry recording view")}{" "}
          </Button>
        </p>
      )}
    </article>
  );
}
function DemoProposal({
  teacherId,
  disabled,
  onSubmit,
  onCancel,
  onError,
}: {
  teacherId: string;
  disabled: boolean;
  onSubmit: (body: { startsAt: string; duration: number }) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const [start, setStart] = useState(""),
    [duration, setDuration] = useState("30"),
    [showTimes, setShowTimes] = useState(false);
  const day =
    start.slice(0, 10) ||
    new Date(Date.now() + 2 * 86400000 + 330 * 60000)
      .toISOString()
      .slice(0, 10);
  const from = new Date(day + "T00:00:00+05:30"),
    to = new Date(from.getTime() + 86400000);
  const range = useRef<{ day: string; from: string; to: string } | null>(null);
  if (range.current?.day !== day)
    range.current = {
      day,
      from: new Date(
        Math.max(from.getTime(), Date.now() + 3600000),
      ).toISOString(),
      to: to.toISOString(),
    };
  const rangeStart = range.current.from;
  const times = useInfiniteQuery({
    queryKey: ["demo-free-times", teacherId, day, duration],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["PublicSlots"]>(
        `/teachers/${teacherId}/availability?${new URLSearchParams({ kind: "DEMO", duration, startsAt: rangeStart, endsAt: to.toISOString(), limit: "50", ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (last) => last.nextCursor || undefined,
    enabled: showTimes,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function submit() {
    const date = new Date(start + ":00+05:30"),
      end = date.getTime() + Number(duration) * 60000;
    if (
      !Number.isFinite(date.getTime()) ||
      date.getTime() < Date.now() + 3600000 ||
      end > Date.now() + 60 * 86400000 ||
      ![20, 30, 40].includes(Number(duration))
    ) {
      onError(
        "Choose a 20–40 minute demo at least one hour ahead and within 60 days.",
      );
      return;
    }
    await onSubmit({
      startsAt: date.toISOString(),
      duration: Number(duration),
    });
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset disabled={disabled} className="wizard-fields">
        <div className="tuition-window">
          <div className="field">
            <label htmlFor="demo-start">{appText("Demo start (IST)")}</label>
            <Input
              id="demo-start"
              type="datetime-local"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setShowTimes(false);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="demo-duration">{appText("Demo duration")}</label>
            <select
              id="demo-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              {[20, 30, 40].map((n) => (
                <option key={n} value={n}>
                  {n} {appText("minutes")}{" "}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="wizard-help">
          {appText(
            "At least one hour ahead, within 60 days. Availability is checked when you propose the time; both parties must then accept it. A demo proposal is not a confirmed meeting.",
          )}{" "}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowTimes(true)}
        >
          {appText("Show advertised times for")} {day}
        </Button>
        {showTimes &&
          (times.isPending ? (
            <p role="status">{appText("Loading advertised demo times…")}</p>
          ) : times.error ? (
            <>
              <Notice error>{appError(times.error.message)}</Notice>
              <Button
                type="button"
                variant="outline"
                onClick={() => times.refetch()}
              >
                {appText("Retry advertised times")}{" "}
              </Button>
            </>
          ) : (
            <>
              <div className="tuition-slots">
                {times.data?.pages
                  .flatMap((p) => p.items)
                  .map((slot) => (
                    <Button
                      key={slot.startsAt}
                      variant="outline"
                      type="button"
                      onClick={() => {
                        setStart(localTime(slot.startsAt));
                        setShowTimes(false);
                      }}
                    >
                      {when(slot.startsAt, appLocale)} {appText("IST")}{" "}
                    </Button>
                  ))}
              </div>
              {!times.data?.pages.some((p) => p.items.length) && (
                <p>
                  {appText(
                    "No advertised free demo time for this date. Choose another date or ask for help.",
                  )}{" "}
                </p>
              )}
              {times.hasNextPage && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={times.isFetchingNextPage}
                  onClick={() => times.fetchNextPage()}
                >
                  {appText("More advertised times")}{" "}
                </Button>
              )}
            </>
          ))}
        <div className="wizard-actions">
          <Button type="button" variant="outline" onClick={onCancel}>
            {appText("Cancel")}{" "}
          </Button>
          <Button className="button" type="submit">
            {appText("Propose demo")}{" "}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
export function TuitionTerms({
  session,
  dashboard: d,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  if (!["GUARDIAN", "TEACHER"].includes(session.account.role)) return null;
  return (
    <section
      className="tuition-terms-list"
      aria-label={appText("Tuition agreements")}
    >
      {d.placements?.map((p) => (
        <TermsReview
          key={p.id}
          session={session}
          placement={p}
          teacher={
            d.profile?.id === p.teacherId
              ? d.profile
              : d.teachers?.find((t) => t.id === p.teacherId)
          }
          learner={d.children?.find((c) => c.id === p.childId)?.alias}
          permitted={
            session.account.role === "TEACHER" ||
            (session.account.verified && !!d.consent && !d.consent.withdrawnAt)
          }
        />
      ))}
    </section>
  );
}
function TermsReview({
  session,
  placement: p,
  teacher,
  learner,
  permitted,
}: {
  session: Session;
  placement: Placement & { policyVersion?: string };
  teacher?: Teacher;
  learner?: string;
  permitted: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient(),
    guardian = session.account.role === "GUARDIAN";
  const schedules = useQuery({
    queryKey: ["placement-schedules", session.account.id, p.id],
    queryFn: () =>
      api<components["schemas"]["RecurringSchedules"]>(
        `/placements/${p.id}/schedules`,
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<"ACCEPT_TERMS" | "CONFIRM_START" | null>(
      null,
    ),
    [agreed, setAgreed] = useState(false);
  async function refresh() {
    const current = await api<Dashboard>("/dashboard");
    client.setQueryData(["dashboard", session.account.id], current);
    const result = await schedules.refetch();
    if (result.error) throw result.error;
  }
  const decision = useDecision(session, refresh);
  const accepted = guardian ? p.guardianAccepted : p.teacherAccepted,
    started = guardian ? p.guardianStarted : p.teacherReceiptConfirmed;
  const timetable = schedules.data?.items.find((s) => s.status === "ACCEPTED");
  const canAccept =
    permitted &&
    !!teacher &&
    !!p.policyVersion &&
    ["TERMS_PENDING", "ACTIVE"].includes(p.status);
  async function confirm() {
    if (!agreed || !action) {
      decision.invalid(
        "Confirm the agreement or actual start details before saving.",
      );
      return;
    }
    await decision.run({
      path: `/placements/${p.id}/acceptances`,
      body: { expectedVersion: p.version, action },
      message:
        action === "ACCEPT_TERMS"
          ? "Your tuition-term acceptance is saved."
          : guardian
            ? "Your first paid lesson confirmation is saved. Teacher receipt confirmation is separate."
            : "Your lesson and tuition-receipt confirmation is saved. Guardian start confirmation is separate.",
      onSaved: () => setAction(null),
    });
  }
  return (
    <article className="panel tuition-term-card">
      <div className="panel-title">
        <h2>{appText("Recurring tuition terms")}</h2>
        <span className="badge">
          {appText(p.status.toLowerCase().replaceAll("_", " "))}
        </span>
      </div>
      <h3>
        {teacher?.name || appText("Teacher profile unavailable")}
        {learner ? ` · ${learner}` : ""}
      </h3>
      <p className="wizard-help">
        {appText("Agreement")} {p.id.slice(0, 8)}
      </p>
      <p className="tuition-price">
        {money(p.monthlyPaise, appLocale)} {appText("per month")}
      </p>
      <p>
        {appText("Tuition is paid directly to the teacher. Policy:")}{" "}
        {p.policyVersion || appText("details unavailable")}.
      </p>
      <p className="wizard-help">
        {appText(
          "Each arrangement shows the proposed platform fee recorded when its terms were opened. Accepted arrangements keep that fee when future policy changes. Live charges require separate qualification.",
        )}{" "}
      </p>
      <dl className="tuition-summary">
        <div>
          <dt>{appText("Recorded platform fee")}</dt>
          <dd>
            {typeof p.placementFeePaise === "number"
              ? money(p.placementFeePaise, appLocale)
              : appText("details unavailable")}
          </dd>
        </div>
        <div>
          <dt>{appText("Family learning terms")}</dt>
          <dd>
            {p.guardianAccepted ? appText("Accepted") : appText("Pending")}
          </dd>
        </div>
        <div>
          <dt>{appText("Teacher terms")}</dt>
          <dd>
            {p.teacherAccepted ? appText("Accepted") : appText("Pending")}
          </dd>
        </div>
        <div>
          <dt>{appText("Guardian start")}</dt>
          <dd>
            {p.guardianStarted ? appText("Confirmed") : appText("Pending")}
          </dd>
        </div>
        <div>
          <dt>{appText("Teacher receipt")}</dt>
          <dd>
            {p.teacherReceiptConfirmed
              ? appText("Confirmed")
              : appText("Pending")}
          </dd>
        </div>
      </dl>
      {schedules.isPending ? (
        <p role="status">{appText("Loading timetable status…")}</p>
      ) : schedules.error ? (
        <>
          <Notice error>{appError(schedules.error.message)}</Notice>
          <Button variant="outline" onClick={() => schedules.refetch()}>
            {appText("Retry timetable status")}{" "}
          </Button>
        </>
      ) : (
        <p>
          {timetable
            ? appText(
                "A recurring timetable has been accepted by both parties.",
              )
            : appText(
                "An agreed recurring timetable is still required before tuition starts.",
              )}
        </p>
      )}
      <div className="wizard-actions">
        <RefreshButton
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => decision.reload()}
         label={appText("Refresh tuition terms")} />
        {!accepted && (
          <Button
            className="button"
            disabled={decision.locked || !canAccept}
            onClick={() => {
              setAction("ACCEPT_TERMS");
              setAgreed(false);
            }}
          >
            {appText("Review & accept tuition terms")}{" "}
          </Button>
        )}
        {p.guardianAccepted && p.teacherAccepted && !started && (
          <Button
            className="button"
            disabled={decision.locked || !canAccept || !timetable}
            onClick={() => {
              setAction("CONFIRM_START");
              setAgreed(false);
            }}
          >
            {guardian
              ? appText("Confirm first paid lesson")
              : appText("Confirm lesson & tuition receipt")}
          </Button>
        )}
      </div>
      {p.status === "CLOSED" && (
        <p>
          {appText(
            "This agreement is closed; further acceptances are unavailable.",
          )}
        </p>
      )}
      {!teacher || !p.policyVersion ? (
        <p className="wizard-help">
          {appText(
            "Current teacher and policy details are required before accepting. Refresh or contact support.",
          )}{" "}
        </p>
      ) : null}
      {action && (
        <form
          className="tuition-confirm"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <h3>
            {action === "ACCEPT_TERMS"
              ? appText("Review tuition terms")
              : guardian
                ? appText("Confirm the actual first paid lesson")
                : appText("Confirm the lesson and tuition receipt")}
          </h3>
          <p>
            {action === "ACCEPT_TERMS"
              ? appText(
                  "You are accepting {0} per month with {1}. Both parties must accept these terms and a recurring timetable before tuition starts.",
                  [money(p.monthlyPaise, appLocale), teacher?.name],
                )
              : guardian
                ? appText(
                    "Confirm only after the first paid lesson actually took place. This does not confirm the teacher’s receipt of tuition.",
                  )
                : appText(
                    "Confirm only after the paid lesson took place and you received the tuition. The guardian independently confirms the start.",
                  )}
          </p>
          <fieldset
            disabled={decision.locked || !canAccept}
            className="wizard-fields"
          >
            <label className="wizard-checkbox">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                {action === "ACCEPT_TERMS"
                  ? appText(
                      "I have reviewed the monthly amount, payment basis and stored policy terms.",
                    )
                  : guardian
                    ? appText("The first paid lesson actually took place.")
                    : appText(
                        "The lesson took place and I received the tuition.",
                      )}
              </span>
            </label>
            <div className="wizard-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAction(null)}
              >
                {appText("Cancel")}{" "}
              </Button>
              <Button className="button" type="submit">
                {action === "ACCEPT_TERMS"
                  ? appText("Accept tuition terms")
                  : appText("Save start confirmation")}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <Feedback decision={decision} />
    </article>
  );
}
