"use client";
import { WeeklySummary } from "./weekly-availability";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
const money = (p: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(p / 100);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
export function MatchingWorkspace({ session }: { session: Session }) {
  const allowed = ["ADMIN", "OPERATOR"].includes(session.account.role),
    params = useSearchParams(),
    [selected, setSelected] = useState(params.get("request") || ""),
    [locked, setLocked] = useState(false);
  const queue = useQuery({
      queryKey: ["matching-queue", session.account.id],
      queryFn: ({ signal }) =>
        api<components["schemas"]["RequestList"]>("/requests", { signal }),
      enabled: allowed,
      retry: false,
      refetchOnWindowFocus: false,
    }),
    open = queue.data?.items.filter((r) => r.status === "OPEN") || [];
  useEffect(() => {
    if (!selected && open[0]) setSelected(open[0].id);
  }, [selected, open]);
  if (!allowed)
    return (
      <Notice>
        Matching review belongs to authorized operators and administrators.
      </Notice>
    );
  return (
    <div className="care-workspace">
      <section className="care-intro">
        <Users size={28} aria-hidden="true" />
        <h2>A shortlist with reasons.</h2>
        <p>
          Review the eligible pool, choose a clear order and publish only after
          checking the current criteria. Rules guide the list; teacher
          acceptance and guardian choice remain separate.
        </p>
      </section>
      <div className="care-toolbar">
        <label htmlFor="matching-request">Open tuition request</label>
        <select
          id="matching-request"
          value={selected}
          disabled={locked}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a request</option>
          {open.map((r) => (
            <option key={r.id} value={r.id}>
              {r.subject} — {r.locality} —{" "}
              {r.discoveryMethod === "MANUAL"
                ? "Direct search"
                : "Assisted search"}{" "}
              — {r.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>
      {queue.isPending && <p role="status">Loading matching queue…</p>}
      {queue.error && (
        <Notice error>
          Request queue is unavailable.{" "}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => queue.refetch()}
          >
            Retry matching queue
          </Button>
        </Notice>
      )}
      {!queue.isPending && !queue.error && !open.length && (
        <Notice>No open requests in this queue.</Notice>
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
            Choose a request from this authorized queue. It contains the latest
            50 records.
          </Notice>
        )
      )}
      <small className="care-help">
        Latest 50 requests and matching runs; up to 10 shortlist candidates from
        a rules pool bounded at 200 teachers. A match is not an assignment or
        guaranteed supply. Notification delivery and live operator staffing
        remain unqualified.
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
  const history = useQuery({
    queryKey: ["operator-runs", session.account.id, id],
    queryFn: ({ signal }) =>
      api<components["schemas"]["Runs"]>(
        `/admin/requests/${id}/recommendation-runs`,
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
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
          Refresh matching details
        </Button>
      )}
      {unavailable && (
        <Notice error>
          Matching details are loading or unavailable. Guardian
          verification/consent, an open request and regional access are
          required.{" "}
          <Button
            variant="outline"
            disabled={decision.uncertain || !!action}
            onClick={() => decision.reload()}
          >
            Reload matching details
          </Button>
        </Notice>
      )}
      {request && (
        <section className="care-card">
          <span className="care-status">
            {request.discoveryMethod === "MANUAL"
              ? "Direct search"
              : "Assisted search"}
          </span>
          <h3>
            {request.subject} · {request.locality}
          </h3>
          <p>
            {request.mode === "HOME" ? "At home" : "Online"} ·{" "}
            {request.language} · {money(request.budgetPaise)} monthly budget
          </p>
          <p>
            {request.discoveryMethod === "MANUAL"
              ? "Only the guardian’s chosen teacher is considered."
              : "An operator reviews the eligible pool for the guardian."}{" "}
            Current request version {request.version}.
          </p>
          <h4>Required eligibility</h4>
          <p>
            Current screening and fee acceptance; learner stage, class/board or course/year;
            subject/language/format; budget; home travel/locality where
            relevant; available capacity and a current availability overlap.
            Replacement requests exclude the previous teacher. These
            requirements cannot be overridden.
          </p>
          <p>
            Schedule:{" "}
            {request.scheduleStatus === "CONFIRMED"
              ? "Confirmed preferences"
              : "Needs confirmation"}
          </p>
          {request.schedulePreferences &&
          "weekly" in request.schedulePreferences ? (
            <WeeklySummary preferences={request.schedulePreferences} />
          ) : (
            request.schedulePreferences?.slots.map((s, i) => (
              <p key={i}>
                {when(s.startsAt)}–{when(s.endsAt)} IST
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
          Review new matching run
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
          Review shortlist publication
        </Button>
        <Button
          variant="outline"
          disabled={decision.locked || !!action}
          onClick={() => decision.reload()}
        >
          Refresh matching workspace
        </Button>
      </div>
      {latest?.result === "NEEDS_SCHEDULE" && (
        <Notice>
          Ask the guardian to confirm fresh future availability before running
          matching again. No shortlist is ready to publish.
        </Notice>
      )}
      {latest?.result === "NO_MATCH" && (
        <Notice>
          No eligible teacher was found in this run. Review criteria and teacher
          supply; ask the guardian to update their needs or availability. Do not
          bypass hard requirements.
        </Notice>
      )}
      <section className="care-card">
        <h3>Current shortlist candidates</h3>
        {!items.length && !unavailable && (
          <p>No candidates yet. Build a run and review its result.</p>
        )}
        {items.map((c) => (
          <article className="privacy-record" key={c.id}>
            <span className="care-status">
              {c.eligibleNow
                ? "Currently eligible"
                : "Not currently selectable"}
            </span>
            <h4>{c.teacherName}</h4>
            <p>
              Rules score: {c.score} · Teacher response:{" "}
              {c.response.toLowerCase()} ·{" "}
              {c.presentedAt
                ? "Published at " + when(c.presentedAt) + " IST"
                : "Not published"}
            </p>
            <ul>
              {c.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {c.expiresAt && <small>Expires {when(c.expiresAt)} IST</small>}
          </article>
        ))}
      </section>
      {action && (
        <section className="care-card care-editor">
          <h3>
            {action === "run"
              ? "Review a fresh rules run"
              : review
                ? "Review the ordered shortlist"
                : "Choose and order the shortlist"}
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
                    Choose eligible candidates only. Ordering and exclusion are
                    recorded; the server rechecks eligibility at publication.
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
                          ? "Eligible"
                          : "Changed; remove from this selection"}
                      </span>
                    </label>
                  ))}
                  <ol className="matching-order">
                    {order.map((id, i) => (
                      <li key={id}>
                        <strong>
                          {items.find((c) => c.id === id)?.teacherName ||
                            "Candidate no longer in this run"}
                        </strong>
                        <div className="care-actions">
                          <Button
                            variant="outline"
                            type="button"
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                          >
                            Move candidate {i + 1} up
                          </Button>
                          <Button
                            variant="outline"
                            type="button"
                            disabled={i === order.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            Move candidate {i + 1} down
                          </Button>
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() =>
                              setOrder(order.filter((x) => x !== id))
                            }
                          >
                            Remove candidate {i + 1}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <label htmlFor="matching-reason">
                    Reason for shortlist and adjustments
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
                    Request {id.slice(0, 8)} · Version {request?.version}
                  </h4>
                  {action === "run" ? (
                    <p>
                      A new run rechecks the eligible pool and clears the
                      previous shortlist and saved teacher choice. Publication
                      and assignment remain separate decisions.
                    </p>
                  ) : (
                    <>
                      <p>{reason}</p>
                      <ol>
                        {order.map((id) => (
                          <li key={id}>
                            {items.find((c) => c.id === id)?.teacherName ||
                              "Candidate changed"}
                          </li>
                        ))}
                      </ol>
                      <p>
                        This ordered set replaces the current publication.
                        Excluded candidates stop being shown; current
                        eligibility, expiry and run ownership are rechecked.
                        Publishing does not record a guardian view or assign a
                        teacher.
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
                      I reviewed the criteria and effects and want to{" "}
                      {action === "run"
                        ? "create this matching run"
                        : "publish this ordered shortlist"}
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
                    ? "Back to adjustments"
                    : "Cancel decision"}
                </Button>
                <Button type="submit">
                  {review
                    ? action === "run"
                      ? "Confirm matching run"
                      : "Publish reviewed shortlist"
                    : action === "run"
                      ? "Review matching run"
                      : "Review publication"}
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      <section className="care-card">
        <h3>Matching run history</h3>
        {!history.isPending &&
          !history.error &&
          !history.data?.items.length && <p>No matching runs yet.</p>}
        {history.data?.items.map((r) => (
          <details className="privacy-record" key={r.id}>
            <summary>
              {r.result.replaceAll("_", " ").toLowerCase()} · Request version{" "}
              {r.requestVersion} · {when(r.createdAt)} IST
            </summary>
            <p>
              Rules: {r.rankerVersion} · Feature version: {r.featureVersion}
            </p>
            <p>
              Recorded learner coverage: {r.requestFeatures.educationStage==='COLLEGE'?`${String(r.requestFeatures.courseName||'College')} · Year ${String(r.requestFeatures.studyYear||'not recorded')}`:r.requestFeatures.educationStage==='EARLY_YEARS'?String(r.requestFeatures.earlyYearsLevel||'Early years'):`Class ${String(r.requestFeatures.grade??'not recorded')} · ${String(r.requestFeatures.board??'not recorded')}`}.{' '}
              {r.eligiblePool.poolLimited
                ? "This run was pool-limited."
                : "No pool-limit flag recorded."}
            </p>
            <p>
              Historical evidence does not qualify a candidate for a new
              publication; the current server checks remain authoritative.
            </p>
          </details>
        ))}
      </section>
    </>
  );
}
