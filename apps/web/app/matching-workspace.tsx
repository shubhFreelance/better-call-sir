"use client";
import { useHistory, HistoryPages } from "./history";
import { useAppTranslation } from "./locale";
import { WeeklySummary } from "./weekly-availability";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
const money = (p: number, locale = "en-IN") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(p / 100);
const when = (iso: string, locale = "en-IN") =>
  new Date(iso).toLocaleString(locale, { timeZone: "Asia/Kolkata" });
export function MatchingWorkspace({ session }: { session: Session }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const allowed = ["ADMIN", "OPERATOR"].includes(session.account.role),
    params = useSearchParams(),
    [selected, setSelected] = useState(params.get("request") || ""),
    [locked, setLocked] = useState(false);
  const queue = useHistory<components["schemas"]["RequestList"]>({
      queryKey: ["matching-queue", session.account.id],
      path: "/requests?status=OPEN",
      enabled: allowed,
    }),
    open = queue.data?.items.filter((r) => r.status === "OPEN") || [];
  useEffect(() => {
    if (!selected && open[0]) setSelected(open[0].id);
  }, [selected, open]);
  if (!allowed)
    return (
      <Notice>
        {appText(
          "Matching review belongs to authorized operators and administrators.",
        )}{" "}
      </Notice>
    );
  return (
    <div className="care-workspace">
      <section className="care-intro">
        <Users size={28} aria-hidden="true" />
        <h2>{appText("A shortlist with reasons.")}</h2>
        <p>
          {appText(
            "Review the eligible pool, choose a clear order and publish only after checking the current criteria. Rules guide the list; teacher acceptance and guardian choice remain separate.",
          )}{" "}
        </p>
      </section>
      <div className="care-toolbar">
        <label htmlFor="matching-request">
          {appText("Open tuition request")}
        </label>
        <select
          id="matching-request"
          value={selected}
          disabled={locked}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">{appText("Choose a request")}</option>
          {open.map((r) => (
            <option key={r.id} value={r.id}>
              {appCurriculum(r.subject)} — {r.locality} —{" "}
              {r.discoveryMethod === "MANUAL"
                ? appText("Direct search")
                : appText("Assisted search")}{" "}
              — {r.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>
      <HistoryPages
        history={queue}
        label="Matching request queue"
        disabled={locked}
      />
      {queue.isPending && (
        <p role="status">{appText("Loading matching queue…")}</p>
      )}
      {queue.error && (
        <Notice error>
          {appText("Request queue is unavailable.")}{" "}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => queue.refetch()}
          >
            {appText("Retry matching queue")}{" "}
          </Button>
        </Notice>
      )}
      {!queue.isPending && !queue.error && !open.length && (
        <Notice>{appText("No open requests in this queue.")}</Notice>
      )}
      {open.some((r) => r.id === selected) ? (
        <MatchRequest
          key={selected}
          session={session}
          id={selected}
          onLock={setLocked}
        />
      ) : (
        !queue.isPending &&
        open.length > 0 && (
          <Notice>
            {appText(
              "Choose a request from this authorized queue. Load more records to see more.",
            )}{" "}
          </Notice>
        )
      )}
      <small className="care-help">
        {appText(
          "Browse request and matching-run history; up to 10 shortlist candidates come from a rules pool bounded at 200 teachers. A match is not an assignment or guaranteed supply. Notification delivery and live operator staffing remain unqualified.",
        )}{" "}
      </small>
    </div>
  );
}
function MatchRequest({
  session,
  id,
  onLock,
}: {
  session: Session;
  id: string;
  onLock: (v: boolean) => void;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const detail = useQuery({
    queryKey: ["operator-request", session.account.id, id],
    queryFn: ({ signal }) =>
      api<components["schemas"]["TuitionRequestDetails"]>(`/requests/${id}`, {
        signal,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const candidates = useQuery({
    queryKey: ["operator-candidates", session.account.id, id],
    queryFn: ({ signal }) =>
      api<components["schemas"]["OperatorCandidateList"]>(
        `/admin/requests/${id}/recommendations`,
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const history = useHistory<components["schemas"]["Runs"]>({
    queryKey: ["operator-runs", session.account.id, id],
    path: `/admin/requests/${id}/recommendation-runs`,
  });
  const [action, setAction] = useState<"run" | "publish" | "">(""),
    [order, setOrder] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    sending = useRef(false);
  async function refresh() {
    const rs = await Promise.all([
      detail.refetch(),
      candidates.refetch(),
      history.refetch(),
    ]);
    for (const r of rs) if (r.error) throw r.error;
  }
  const decision = useDecision(
      session,
      refresh,
      (r) =>
        !!r &&
        typeof r === "object" &&
        "runId" in r &&
        typeof r.runId === "string",
    ),
    request = detail.data,
    items = candidates.data?.items || [],
    latest = history.data?.items[0],
    unavailable =
      !!detail.error ||
      !!candidates.error ||
      !!history.error ||
      detail.isPending ||
      candidates.isPending ||
      history.isPending;
  useEffect(() => {
    onLock(decision.locked || !!action);
    return () => onLock(false);
  }, [decision.locked, action, onLock]);
  function begin(value: "run" | "publish") {
    if (unavailable || decision.locked || action) return;
    setAction(value);
    setReview(value === "run");
    setAgreed(false);
    setReason("");
    setOrder(
      items
        .filter((c) => c.eligibleNow)
        .sort((a, b) => (a.position || 100) - (b.position || 100))
        .map((c) => c.id),
    );
    decision.invalid("");
  }
  function operation() {
    if (!request || request.status !== "OPEN" || unavailable) {
      decision.invalid(
        "Refresh current request, eligibility and run history before deciding.",
      );
      return null;
    }
    if (action === "run")
      return {
        path: `/admin/requests/${id}/recommendations`,
        body: { expectedVersion: request.version },
      };
    if (
      !candidates.data?.runId ||
      !order.length ||
      order.length > 10 ||
      !reason.trim() ||
      reason.trim().length > 500 ||
      order.some(
        (id) =>
          !items.some(
            (c) =>
              c.id === id &&
              c.eligibleNow &&
              c.runId === candidates.data?.runId,
          ),
      )
    ) {
      decision.invalid(
        "Choose 1–10 currently eligible candidates from this run and add a publication reason. Remove candidates that changed or rerun matching.",
      );
      return null;
    }
    return {
      path: `/admin/requests/${id}/presentations`,
      body: {
        expectedVersion: request.version,
        runId: candidates.data.runId,
        candidateIds: order,
        reason: reason.trim(),
      },
    };
  }
  async function save() {
    if (decision.locked || sending.current) return;
    const op = operation();
    if (!op || !agreed) {
      if (op)
        decision.invalid("Acknowledge the reviewed effects before confirming.");
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        ...op,
        message:
          action === "run"
            ? "Matching run recorded. Review its result before publishing."
            : "Reviewed shortlist published. Teacher acceptance and guardian selection are still required.",
        onSaved: () => {
          setAction("");
          setReview(false);
          setAgreed(false);
          setReason("");
          setOrder([]);
        },
      });
    } finally {
      sending.current = false;
    }
  }
  function move(index: number, by: number) {
    const next = [...order];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setOrder(next);
  }
  return (
    <>
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
          {appText("Refresh matching details")}{" "}
        </Button>
      )}
      {unavailable && (
        <Notice error>
          {appText(
            "Matching details are loading or unavailable. Guardian verification/consent, an open request and regional access are required.",
          )}{" "}
          <Button
            variant="outline"
            disabled={decision.uncertain || !!action}
            onClick={() => decision.reload()}
          >
            {appText("Reload matching details")}{" "}
          </Button>
        </Notice>
      )}
      {request && (
        <section className="care-card">
          <span className="care-status">
            {request.discoveryMethod === "MANUAL"
              ? appText("Direct search")
              : appText("Assisted search")}
          </span>
          <h3>
            {appCurriculum(request.subject)} · {request.locality}
          </h3>
          <p>
            {request.mode === "HOME" ? appText("At home") : appText("Online")} ·{" "}
            {appCurriculum(request.language)} ·{" "}
            {money(request.budgetPaise, appLocale)}{" "}
            {appText("monthly budget")}{" "}
          </p>
          <p>
            {request.discoveryMethod === "MANUAL"
              ? appText("Only the guardian’s chosen teacher is considered.")
              : appText(
                  "An operator reviews the eligible pool for the guardian.",
                )}{" "}
            {appText("Current request version")} {request.version}.
          </p>
          <h4>{appText("Required eligibility")}</h4>
          <p>
            {appText(
              "Current screening and fee acceptance; learner stage, class/board or course/year; subject/language/format; budget; home travel/locality where relevant; available capacity and a current availability overlap. Replacement requests exclude the previous teacher. These requirements cannot be overridden.",
            )}{" "}
          </p>
          <p>
            {appText("Schedule:")}{" "}
            {request.scheduleStatus === "CONFIRMED"
              ? appText("Confirmed preferences")
              : appText("Needs confirmation")}
          </p>
          {request.schedulePreferences &&
          "weekly" in request.schedulePreferences ? (
            <WeeklySummary preferences={request.schedulePreferences} />
          ) : (
            request.schedulePreferences?.slots.map((s, i) => (
              <p key={i}>
                {when(s.startsAt, appLocale)}–{when(s.endsAt, appLocale)}{" "}
                {appText("IST")}{" "}
              </p>
            ))
          )}
        </section>
      )}
      <div className="care-actions">
        <Button
          disabled={unavailable || decision.locked || !!action}
          onClick={() => begin("run")}
        >
          {appText("Review new matching run")}{" "}
        </Button>
        <Button
          disabled={
            unavailable ||
            decision.locked ||
            !!action ||
            !items.some((c) => c.eligibleNow)
          }
          onClick={() => begin("publish")}
        >
          {appText("Review shortlist publication")}{" "}
        </Button>
        <Button
          variant="outline"
          disabled={decision.locked || !!action}
          onClick={() => decision.reload()}
        >
          {appText("Refresh matching workspace")}{" "}
        </Button>
      </div>
      {latest?.result === "NEEDS_SCHEDULE" && (
        <Notice>
          {appText(
            "Ask the guardian to confirm fresh future availability before running matching again. No shortlist is ready to publish.",
          )}{" "}
        </Notice>
      )}
      {latest?.result === "NO_MATCH" && (
        <Notice>
          {appText(
            "No eligible teacher was found in this run. Review criteria and teacher supply; ask the guardian to update their needs or availability. Do not bypass hard requirements.",
          )}{" "}
        </Notice>
      )}
      <section className="care-card">
        <h3>{appText("Current shortlist candidates")}</h3>
        {!items.length && !unavailable && (
          <p>
            {appText("No candidates yet. Build a run and review its result.")}
          </p>
        )}
        {items.map((c) => (
          <article className="privacy-record" key={c.id}>
            <span className="care-status">
              {c.eligibleNow
                ? appText("Currently eligible")
                : appText("Not currently selectable")}
            </span>
            <h4>{c.teacherName}</h4>
            <p>
              {appText("Rules score:")} {c.score}{" "}
              {appText("· Teacher response:")}{" "}
              {appText(c.response.toLowerCase())} ·{" "}
              {c.presentedAt
                ? appText("Published at {0} IST", [
                    when(c.presentedAt, appLocale),
                  ])
                : appText("Not published")}
            </p>
            <ul>
              {c.reasons.map((r, i) => (
                <li key={i}>{appText(r)}</li>
              ))}
            </ul>
            {c.expiresAt && (
              <small>
                {appText("Expires")} {when(c.expiresAt, appLocale)}{" "}
                {appText("IST")}
              </small>
            )}
          </article>
        ))}
      </section>
      {action && (
        <section className="care-card care-editor">
          <h3>
            {action === "run"
              ? appText("Review a fresh rules run")
              : review
                ? appText("Review the ordered shortlist")
                : appText("Choose and order the shortlist")}
          </h3>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (review) {
                void save();
                return;
              }
              if (operation()) {
                setReview(true);
                setAgreed(false);
              }
            }}
          >
            <fieldset disabled={decision.locked}>
              {action === "publish" && !review ? (
                <>
                  <p>
                    {appText(
                      "Choose eligible candidates only. Ordering and exclusion are recorded; the server rechecks eligibility at publication.",
                    )}{" "}
                  </p>
                  {items.map((c) => (
                    <label className="care-check reviewer-coverage" key={c.id}>
                      <input
                        type="checkbox"
                        checked={order.includes(c.id)}
                        disabled={!c.eligibleNow && !order.includes(c.id)}
                        onChange={(e) =>
                          setOrder(
                            e.target.checked
                              ? [...order, c.id]
                              : order.filter((id) => id !== c.id),
                          )
                        }
                      />
                      <span>
                        {c.teacherName} —{" "}
                        {c.eligibleNow
                          ? appText("Eligible")
                          : appText("Changed; remove from this selection")}
                      </span>
                    </label>
                  ))}
                  <ol className="matching-order">
                    {order.map((id, i) => (
                      <li key={id}>
                        <strong>
                          {items.find((c) => c.id === id)?.teacherName ||
                            appText("Candidate no longer in this run")}
                        </strong>
                        <div className="care-actions">
                          <Button
                            variant="outline"
                            type="button"
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                          >
                            {appText("Move candidate")} {i + 1}{" "}
                            {appText("up")}{" "}
                          </Button>
                          <Button
                            variant="outline"
                            type="button"
                            disabled={i === order.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            {appText("Move candidate")} {i + 1}{" "}
                            {appText("down")}{" "}
                          </Button>
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() =>
                              setOrder(order.filter((x) => x !== id))
                            }
                          >
                            {appText("Remove candidate")} {i + 1}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <label htmlFor="matching-reason">
                    {appText("Reason for shortlist and adjustments")}{" "}
                  </label>
                  <Textarea
                    id="matching-reason"
                    maxLength={500}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </>
              ) : (
                <div className="care-review">
                  <h4>
                    {appText("Request")} {id.slice(0, 8)} {appText("· Version")}{" "}
                    {request?.version}
                  </h4>
                  {action === "run" ? (
                    <p>
                      {appText(
                        "A new run rechecks the eligible pool and clears the previous shortlist and saved teacher choice. Publication and assignment remain separate decisions.",
                      )}{" "}
                    </p>
                  ) : (
                    <>
                      <p>{reason}</p>
                      <ol>
                        {order.map((id) => (
                          <li key={id}>
                            {items.find((c) => c.id === id)?.teacherName ||
                              appText("Candidate changed")}
                          </li>
                        ))}
                      </ol>
                      <p>
                        {appText(
                          "This ordered set replaces the current publication. Excluded candidates stop being shown; current eligibility, expiry and run ownership are rechecked. Publishing does not record a guardian view or assign a teacher.",
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
                      {appText(
                        "I reviewed the criteria and effects and want to",
                      )}{" "}
                      {action === "run"
                        ? appText("create this matching run")
                        : appText("publish this ordered shortlist")}
                      .
                    </span>
                  </label>
                </div>
              )}
              <div className="care-actions">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    review && action === "publish"
                      ? setReview(false)
                      : setAction("")
                  }
                >
                  {review && action === "publish"
                    ? appText("Back to adjustments")
                    : appText("Cancel decision")}
                </Button>
                <Button type="submit">
                  {review
                    ? action === "run"
                      ? appText("Confirm matching run")
                      : appText("Publish reviewed shortlist")
                    : action === "run"
                      ? appText("Review matching run")
                      : appText("Review publication")}
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      <section className="care-card">
        <h3>{appText("Matching run history")}</h3>
        <HistoryPages
          history={history}
          label="Matching run history"
          disabled={decision.locked || !!action}
        />
        {!history.isPending &&
          !history.error &&
          !history.data?.items.length && (
            <p>{appText("No matching runs yet.")}</p>
          )}
        {history.data?.items.map((r) => (
          <details className="privacy-record" key={r.id}>
            <summary>
              {appText(r.result.replaceAll("_", " ").toLowerCase())}{" "}
              {appText("· Request version")} {r.requestVersion} ·{" "}
              {when(r.createdAt, appLocale)} {appText("IST")}{" "}
            </summary>
            <p>
              {appText("Rules:")} {r.rankerVersion}{" "}
              {appText("· Feature version:")} {r.featureVersion}
            </p>
            <p>
              {appText("Recorded learner coverage:")}{" "}
              {r.requestFeatures.educationStage === "COLLEGE"
                ? appText("{0} · Year {1}", [
                    String(r.requestFeatures.courseName || appText("College")),
                    String(
                      r.requestFeatures.studyYear || appText("not recorded"),
                    ),
                  ])
                : r.requestFeatures.educationStage === "EARLY_YEARS"
                  ? String(r.requestFeatures.earlyYearsLevel || "Early years")
                  : appText("Class {0} · {1}", [
                      String(
                        r.requestFeatures.grade ?? appText("not recorded"),
                      ),
                      String(
                        r.requestFeatures.board ?? appText("not recorded"),
                      ),
                    ])}
              .{" "}
              {r.eligiblePool.poolLimited
                ? appText("This run was pool-limited.")
                : appText("No pool-limit flag recorded.")}
            </p>
            <p>
              {appText(
                "Historical evidence does not qualify a candidate for a new publication; the current server checks remain authoritative.",
              )}{" "}
            </p>
          </details>
        ))}
      </section>
    </>
  );
}
