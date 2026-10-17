"use client";
import { useAppTranslation } from "./locale";
import { CurriculumChoice, subjectSuggestions } from "./curriculum-choice";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  api,
  type Dashboard,
  type Session,
  type Placement,
  type components,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import { preferences, type Window } from "./guardian-onboarding";
import {
  AvailabilityMode,
  WeeklyAvailability,
  WeeklySummary,
  emptyWeekly,
  weeklyRows,
  weeklyPreferences,
} from "./weekly-availability";
type Request = components["schemas"]["TuitionRequest"];
const money = (paise: number, locale = "en-IN") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
const labels: Record<string, string> = {
  ACTIVE: "Active",
  TERMS_PENDING: "Terms pending",
  CLOSED: "Closed",
  OPEN: "Open",
  PENDING: "Awaiting matching",
  NO_MATCH: "No match yet",
  PUBLISHED: "Shortlist published",
};
export function PlacementCare({
  session,
  dashboard: d,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const linkedPlacement = useSearchParams().get("placement"),
    lastLink = useRef(linkedPlacement);
  const client = useQueryClient(),
    canUse = session.account.role === "GUARDIAN";
  const requests = useQuery({
    queryKey: ["care-requests", session.account.id],
    queryFn: ({ signal }) => api<{ items: Request[] }>("/requests", { signal }),
    enabled: canUse,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [selected, setSelected] = useState(
      linkedPlacement || d.placements?.[0]?.id || "",
    ),
    [action, setAction] = useState<"close" | "replace" | "">(""),
    [reason, setReason] = useState(""),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    [criteria, setCriteria] = useState({
      subject: "Maths",
      mode: "ONLINE",
      language: "English",
      locality: "",
      budget: "",
    }),
    [weeklyMode, setWeeklyMode] = useState(true),
    [weekly, setWeekly] = useState(emptyWeekly),
    [windows, setWindows] = useState<Window[]>([{ start: "", duration: "60" }]),
    [result, setResult] = useState<{
      caseId: string;
      requestId?: string;
    } | null>(null);
  const sending = useRef(false),
    p = d.placements?.find((x) => x.id === selected) as
      | (Placement & { requestId: string })
      | undefined,
    source = requests.data?.items.find((r) => r.id === p?.requestId),
    replacement = requests.data?.items.find(
      (r) => r.rematchFromPlacementId === p?.id,
    );
  async function refresh() {
    const [next, rs] = await Promise.all([
      api<Dashboard>("/dashboard"),
      requests.refetch(),
    ]);
    if (rs.error) throw rs.error;
    client.setQueryData(["dashboard", session.account.id], next);
  }
  const decision = useDecision(
      session,
      refresh,
      (r) =>
        !!r &&
        typeof r === "object" &&
        "caseId" in r &&
        typeof r.caseId === "string" &&
        (("placement" in r &&
          !!r.placement &&
          typeof r.placement === "object" &&
          "id" in r.placement) ||
          ("request" in r &&
            !!r.request &&
            typeof r.request === "object" &&
            "id" in r.request)),
    ),
    locked = decision.locked || !!action,
    permitted =
      session.account.verified && !!d.consent && !d.consent.withdrawnAt;
  useEffect(() => {
    if (lastLink.current !== linkedPlacement && !locked) {
      lastLink.current = linkedPlacement;
      setSelected(linkedPlacement || d.placements?.[0]?.id || "");
    }
  }, [linkedPlacement, locked, d.placements]);
  function begin(value: "close" | "replace") {
    if (!p || decision.locked || action) return;
    setAction(value);
    setReview(false);
    setAgreed(false);
    setResult(null);
    setReason("");
    setWindows([{ start: "", duration: "60" }]);
    setWeeklyMode(
      !source?.schedulePreferences || "weekly" in source.schedulePreferences,
    );
    setWeekly(
      source?.schedulePreferences && "weekly" in source.schedulePreferences
        ? weeklyRows(source.schedulePreferences)
        : emptyWeekly(),
    );
    if (source)
      setCriteria({
        subject: source.subject,
        mode: source.mode,
        language: source.language,
        locality: source.locality,
        budget: String(source.budgetPaise / 100),
      });
    decision.invalid("");
  }
  function payload() {
    if (!p || p.status === "CLOSED" || !permitted) {
      decision.invalid(
        "Refresh the arrangement and check current guardian consent before deciding.",
      );
      return null;
    }
    if (!reason.trim() || reason.trim().length > 1000) {
      decision.invalid("Explain the reason in 1–1,000 characters.");
      return null;
    }
    const base = { expectedVersion: p.version, reason: reason.trim() };
    if (action === "close") return base;
    const availability = weeklyMode
        ? weeklyPreferences(weekly)
        : preferences(windows),
      amount = Number(criteria.budget) * 100;
    if (
      !source ||
      !availability ||
      !/^\d+(\.\d{1,2})?$/.test(criteria.budget) ||
      !Number.isSafeInteger(Math.round(amount)) ||
      amount < 50000 ||
      amount > 2000000 ||
      !criteria.subject.trim() ||
      criteria.subject.trim().length > 60 ||
      !criteria.locality.trim() ||
      criteria.locality.trim().length > 80
    ) {
      decision.invalid(
        weeklyMode
          ? "Check the locality, ₹500–₹20,000 budget and nonoverlapping weekly day/time ranges of at least 20 minutes."
          : "Check the locality, ₹500–₹20,000 budget and 1–6 nonoverlapping IST windows, 20–120 minutes long, from one hour to 60 days ahead.",
      );
      return null;
    }
    return {
      ...base,
      preferences: availability,
      criteria: {
        ...criteria,
        subject: criteria.subject.trim(),
        locality: criteria.locality.trim(),
        budgetPaise: Math.round(amount),
        budget: undefined,
      },
    };
  }
  async function save() {
    if (!p || decision.locked || sending.current) return;
    const body = payload();
    if (!body || !agreed) {
      if (body) decision.invalid("Acknowledge the effects before confirming.");
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        path: `/placements/${p.id}/${action === "close" ? "closures" : "rematches"}`,
        body,
        message:
          action === "close"
            ? "The arrangement is closed. Past records remain available."
            : "The old arrangement is closed and your replacement request is recorded. A new teacher has not been assigned.",
        onSaved: (r) => {
          const saved = r as { caseId: string; request?: { id: string } };
          setResult({ caseId: saved.caseId, requestId: saved.request?.id });
          setAction("");
          setReason("");
          setReview(false);
          setAgreed(false);
        },
      });
    } finally {
      sending.current = false;
    }
  }
  if (!canUse)
    return (
      <Notice>
        {appText("These arrangement decisions belong to your guardian.")}{" "}
        <Link href="/dashboard">{appText("Return to your dashboard")}</Link>.
      </Notice>
    );
  return (
    <div className="care-workspace">
      <section className="care-intro">
        <RefreshCw aria-hidden="true" size={28} />
        <h2>{appText("When the fit needs to change.")}</h2>
        <p>
          {appText(
            "Review your current arrangement, end future commitments or ask us to look for a replacement teacher. Support and replacement requests do not require Pro.",
          )}{" "}
        </p>
      </section>
      <Feedback decision={decision} />
      {decision.conflict && (
        <Button
          variant="outline"
          disabled={decision.busy}
          onClick={() => {
            setReview(false);
            setAgreed(false);
            void decision.reload();
          }}
        >
          {appText("Refresh arrangement")}{" "}
        </Button>
      )}
      {!permitted && (
        <Notice>
          {appText(
            "Current verified guardian consent is required for these decisions.",
          )}{" "}
          <Link href="/support">
            {appText("Help and safety reporting remain available")}{" "}
          </Link>
          .
        </Notice>
      )}
      {requests.error && (
        <Notice error>
          {appText("Request criteria could not be loaded.")}{" "}
          <Button
            variant="outline"
            disabled={decision.uncertain}
            onClick={() => requests.refetch()}
          >
            {appText("Retry criteria")}{" "}
          </Button>
        </Notice>
      )}
      {!d.placements?.length ? (
        <section className="care-card">
          <h3>{appText("No tuition arrangements yet.")}</h3>
          <p>
            {appText(
              "Your arrangements appear after tuition terms are opened.",
            )}
          </p>
          <Link href="/dashboard/requests">
            {appText("Review your tuition requests")}
          </Link>
        </section>
      ) : (
        <>
          <div className="care-toolbar">
            <label htmlFor="care-placement">
              {appText("Tuition arrangement")}
            </label>
            <select
              id="care-placement"
              value={selected}
              disabled={locked}
              onChange={(e) => {
                setSelected(e.target.value);
                setResult(null);
                decision.invalid("");
              }}
            >
              {d.placements.map((x) => (
                <option key={x.id} value={x.id}>
                  {d.children?.find((c) => c.id === x.childId)?.alias ||
                    appText("Learner")}{" "}
                  —{" "}
                  {d.teachers?.find((t) => t.id === x.teacherId)?.name ||
                    appText("Teacher {0}", [x.teacherId.slice(0, 8)])}{" "}
                  — {appText(labels[x.status]) || x.status}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => decision.reload()}
            >
              {appText("Refresh arrangements")}{" "}
            </Button>
          </div>
          {selected && !p && (
            <Notice error>
              {appText(
                "The linked arrangement is unavailable in this view. Return to your hiring dashboard or contact support; another arrangement has not been substituted.",
              )}{" "}
            </Notice>
          )}
          {p && (
            <section className="care-card">
              <header>
                <div>
                  <span className="care-status">
                    {appText(labels[p.status]) || p.status}
                  </span>
                  <h3>
                    {d.children?.find((c) => c.id === p.childId)?.alias ||
                      appText("Learner")}
                    {appText("’s arrangement")}{" "}
                  </h3>
                  <p>
                    {d.teachers?.find((t) => t.id === p.teacherId)?.name ||
                      appText("Teacher {0}", [p.teacherId.slice(0, 8)])}{" "}
                    · {money(p.monthlyPaise, appLocale)}{" "}
                    {appText("monthly")}{" "}
                  </p>
                </div>
              </header>
              <Link className="inline-link" href={`/support?placement=${p.id}`}>
                {appText("Help and case progress for this arrangement")}{" "}
              </Link>
              {source && (
                <p>
                  {appCurriculum(source.subject)} ·{" "}
                  {source.mode === "HOME"
                    ? appText("At home")
                    : appText("Online")}{" "}
                  · {appCurriculum(source.language)} · {source.locality}
                </p>
              )}
              {p.status === "CLOSED" ? (
                <Notice>
                  {appText("This arrangement is closed.")}{" "}
                  {replacement ? (
                    <>
                      {appText("Replacement request:")}{" "}
                      {appText(labels[replacement.status]) ||
                        replacement.status}
                      ;{" "}
                      {appText(labels[replacement.matchStatus || ""]) ||
                        replacement.matchStatus ||
                        appText("Matching status unavailable")}
                      .{" "}
                      <Link
                        href={`/dashboard/requests?request=${replacement.id}`}
                      >
                        {appText("Review replacement progress")}{" "}
                      </Link>
                      .
                    </>
                  ) : (
                    appText(
                      "No linked replacement is shown in the latest request history.",
                    )
                  )}{" "}
                  <Link href={`/support?placement=${p.id}`}>
                    {appText("View support history")}{" "}
                  </Link>
                  .
                </Notice>
              ) : (
                !action && (
                  <div className="care-actions">
                    <Button
                      disabled={
                        !permitted ||
                        decision.locked ||
                        !source ||
                        !!requests.error
                      }
                      onClick={() => begin("replace")}
                    >
                      {appText("Request a replacement")}{" "}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!permitted || decision.locked}
                      onClick={() => begin("close")}
                    >
                      {appText("Close arrangement")}{" "}
                    </Button>
                  </div>
                )
              )}
            </section>
          )}
          {result && (
            <Notice>
              <Link href={"/support?case=" + result.caseId}>
                {appText("Open the linked support case")}{" "}
              </Link>
              {result.requestId && (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    href={`/dashboard/requests?request=${result.requestId}`}
                  >
                    {appText("Review your replacement request")}{" "}
                  </Link>
                </>
              )}
              {appText(
                ". A recorded request does not confirm a refund or a new teacher.",
              )}{" "}
            </Notice>
          )}
          {action && (
            <section className="care-card care-editor">
              <h3>
                {review
                  ? appText("Review the effects")
                  : action === "replace"
                    ? appText("Your replacement criteria")
                    : appText("Close this arrangement")}
              </h3>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (review) {
                    void save();
                    return;
                  }
                  if (payload()) {
                    setReview(true);
                    setAgreed(false);
                  }
                }}
              >
                <fieldset disabled={decision.locked}>
                  {!review ? (
                    <>
                      <label htmlFor="care-reason">
                        {appText("Reason for")}{" "}
                        {action === "replace"
                          ? appText("replacement")
                          : appText("closure")}
                      </label>
                      <Textarea
                        id="care-reason"
                        rows={4}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <small>
                        {appText(
                          "Include only information needed for this decision. Report urgent safety concerns through Help & safety.",
                        )}{" "}
                      </small>
                      {action === "replace" && (
                        <>
                          <p>
                            {appText(
                              "The same learner and region are retained. Review these criteria and add fresh availability; the previous teacher is excluded.",
                            )}{" "}
                          </p>
                          <div className="care-fields">
                            {(["subject", "mode", "language"] as const).map(
                              (key) => (
                                <div key={key}>
                                  <label htmlFor={"care-" + key}>
                                    {key === "mode"
                                      ? appText("Teaching format")
                                      : key[0].toUpperCase() + key.slice(1)}
                                  </label>
                                  {key === "subject" ? (
                                    <CurriculumChoice
                                      id="care-subject"
                                      value={criteria.subject}
                                      onChange={(v) =>
                                        setCriteria({ ...criteria, subject: v })
                                      }
                                      suggestions={subjectSuggestions}
                                      customLabel={appText("Subject name")}
                                    />
                                  ) : (
                                    <select
                                      id={"care-" + key}
                                      value={criteria[key]}
                                      onChange={(e) =>
                                        setCriteria({
                                          ...criteria,
                                          [key]: e.target.value,
                                        })
                                      }
                                    >
                                      {(key === "mode"
                                        ? ["ONLINE", "HOME"]
                                        : ["English", "Hindi"]
                                      ).map((v) => (
                                        <option key={v} value={v}>
                                          {v === "ONLINE"
                                            ? appText("Online")
                                            : v === "HOME"
                                              ? appText("At home")
                                              : v}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              ),
                            )}
                            <div>
                              <label htmlFor="care-locality">
                                {appText("Locality")}
                              </label>
                              <Input
                                id="care-locality"
                                value={criteria.locality}
                                maxLength={80}
                                onChange={(e) =>
                                  setCriteria({
                                    ...criteria,
                                    locality: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label htmlFor="care-budget">
                                {appText("Monthly budget (₹)")}{" "}
                              </label>
                              <Input
                                id="care-budget"
                                inputMode="decimal"
                                value={criteria.budget}
                                onChange={(e) =>
                                  setCriteria({
                                    ...criteria,
                                    budget: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <h4>{appText("Fresh availability in IST")}</h4>
                          <AvailabilityMode
                            weekly={weeklyMode}
                            onChange={setWeeklyMode}
                          />
                          {weeklyMode ? (
                            <WeeklyAvailability
                              rows={weekly}
                              onChange={setWeekly}
                            />
                          ) : (
                            <>
                              <p>
                                {appText(
                                  "Choose 1–6 windows of 20–120 minutes, from one hour to 60 days ahead. These are preferences, not confirmed bookings.",
                                )}{" "}
                              </p>
                              {windows.map((w, i) => (
                                <div className="care-window" key={i}>
                                  <div>
                                    <label htmlFor={"care-time-" + i}>
                                      {appText("Window")} {i + 1}{" "}
                                      {appText("starts (IST)")}{" "}
                                    </label>
                                    <Input
                                      id={"care-time-" + i}
                                      type="datetime-local"
                                      value={w.start}
                                      onChange={(e) =>
                                        setWindows(
                                          windows.map((x, j) =>
                                            j === i
                                              ? { ...x, start: e.target.value }
                                              : x,
                                          ),
                                        )
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label htmlFor={"care-duration-" + i}>
                                      {appText("Duration")} {i + 1}{" "}
                                      {appText("(minutes)")}{" "}
                                    </label>
                                    <Input
                                      id={"care-duration-" + i}
                                      type="number"
                                      min={20}
                                      max={120}
                                      value={w.duration}
                                      onChange={(e) =>
                                        setWindows(
                                          windows.map((x, j) =>
                                            j === i
                                              ? {
                                                  ...x,
                                                  duration: e.target.value,
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                    />
                                  </div>
                                  <Button
                                    variant="outline"
                                    type="button"
                                    disabled={windows.length === 1}
                                    onClick={() =>
                                      setWindows(
                                        windows.filter((_, j) => j !== i),
                                      )
                                    }
                                  >
                                    {appText("Remove window")} {i + 1}
                                  </Button>
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                disabled={windows.length === 6}
                                onClick={() =>
                                  setWindows([
                                    ...windows,
                                    { start: "", duration: "60" },
                                  ])
                                }
                              >
                                {appText("Add availability window")}{" "}
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="care-review">
                      <h4>
                        {action === "replace"
                          ? appText("Close and request replacement")
                          : appText("Close without replacement")}
                      </h4>
                      <p>{reason}</p>
                      <ul>
                        <li>
                          {appText(
                            "Future scheduled lessons, their reservations and meeting access are cancelled.",
                          )}{" "}
                        </li>
                        <li>
                          {appText(
                            "Pending/accepted timetables end. Existing past lesson and financial records remain.",
                          )}{" "}
                        </li>
                        <li>
                          {appText(
                            "Notes shared with this teacher become private. Information already read cannot be recalled.",
                          )}{" "}
                        </li>
                        <li>
                          {appText(
                            "No refund or replacement teacher is confirmed by this action. Any financial question needs support review.",
                          )}{" "}
                        </li>
                      </ul>
                      {action === "replace" && (
                        <>
                          <p>
                            {appCurriculum(criteria.subject)} ·{" "}
                            {criteria.mode === "HOME"
                              ? appText("At home")
                              : appText("Online")}{" "}
                            · {appCurriculum(criteria.language)} ·{" "}
                            {criteria.locality} ·{" "}
                            {money(
                              Math.round(Number(criteria.budget) * 100),
                              appLocale,
                            )}{" "}
                            {appText("budget")}{" "}
                          </p>
                          {weeklyMode && weeklyPreferences(weekly) ? (
                            <WeeklySummary
                              preferences={weeklyPreferences(weekly)!}
                            />
                          ) : (
                            <ul>
                              {windows.map((w, i) => (
                                <li key={i}>
                                  {w.start.replace("T", " ")} {appText("IST ·")}{" "}
                                  {w.duration} {appText("minutes")}{" "}
                                </li>
                              ))}
                            </ul>
                          )}
                          <p>
                            {appText(
                              "The previous teacher is excluded. A replacement follows the teacher shortlist and mutually reviewed hiring terms. A demo is optional; no class timetable is required to accept hiring terms.",
                            )}{" "}
                          </p>
                        </>
                      )}
                      <label className="care-check">
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(e) => setAgreed(e.target.checked)}
                        />
                        <span>
                          {appText("I reviewed these effects and want to")}{" "}
                          {action === "replace"
                            ? appText(
                                "close this arrangement and request a replacement",
                              )
                            : appText("close this arrangement")}
                          .
                        </span>
                      </label>
                    </div>
                  )}
                  <div className="care-actions">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        review
                          ? (setReview(false), setAgreed(false))
                          : (setAction(""), setReason(""))
                      }
                    >
                      {review
                        ? appText("Back to editing")
                        : appText("Cancel decision")}
                    </Button>
                    <Button type="submit">
                      {review
                        ? action === "replace"
                          ? appText("Confirm closure and replacement")
                          : appText("Confirm closure")
                        : appText("Review decision")}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </section>
          )}
          <small className="care-help">
            {appText(
              "This view uses your current dashboard and latest 50 requests. For earlier cases or financial questions, use Help & safety. Development support has no live operator or notification delivery.",
            )}{" "}
          </small>
        </>
      )}
    </div>
  );
}
