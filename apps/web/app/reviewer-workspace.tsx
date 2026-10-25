"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import Link from "next/link";
import { useHistory, HistoryPages } from "./history";
import { useAppTranslation } from "./locale";
import { TeachingCoverageSummary, coverageText } from "./teaching-coverage";
import { TeacherDetailsSummary } from "./teacher-details-form";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import { localTime } from "./guardian-onboarding";
type Teacher = components["schemas"]["PrivateTeacher"];
const kinds = [
  "IDENTITY",
  "QUALIFICATIONS",
  "CAPABILITY",
  "REFERENCES",
] as const;
const label = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (v) => v.toUpperCase());
export function ReviewerWorkspace({ session }: { session: Session }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const params = useSearchParams(),
    allowed = ["ADMIN", "REVIEWER"].includes(session.account.role),
    [selected, setSelected] = useState(params.get("teacher") || ""),
    [filter, setFilter] = useState(""),
    [locked, setLocked] = useState(false);
  const queue = useHistory<components["schemas"]["PrivateTeacherList"]>({
    queryKey: ["review-teachers", session.account.id, filter],
    path:
      "/admin/teachers" +
      (filter ? "?status=" + encodeURIComponent(filter) : ""),
    enabled: allowed,
  });
  const retained = useRef<{ actorId: string; teacher: Teacher } | null>(null);
  const teachers =
    queue.data?.items.filter((t) => !filter || t.status === filter) || [];
  const currentTeacher = queue.data?.items.find((t) => t.id === selected);
  if (currentTeacher)
    retained.current = { actorId: session.account.id, teacher: currentTeacher };
  // Keep the decision controller during failed post-save reads; its private content is hidden below.
  const teacher =
    currentTeacher ||
    (locked &&
    queue.error &&
    retained.current?.actorId === session.account.id &&
    retained.current.teacher.id === selected
      ? retained.current.teacher
      : undefined);
  useEffect(() => {
    if (!selected && teachers[0]) setSelected(teachers[0].id);
  }, [selected, teachers]);
  if (!allowed)
    return (
      <Notice>
        {appText(
          "This workspace is restricted to authorized reviewers and administrators.",
        )}{" "}
      </Notice>
    );
  return (
    <div className="care-workspace">
      <Link href="/guardian-verification" className="inline-link">
        {appText("Review guardian relationships")}
      </Link>
      <section className="care-intro">
        <ShieldCheck size={28} aria-hidden="true" />
        <h2>{appText("Evidence before approval.")}</h2>
        <p>
          {appText(
            "Review private evidence and record the full screening assessment for the current application revision. Server MFA, regional scope and independent review apply.",
          )}{" "}
        </p>
      </section>
      <div className="care-fields">
        <div>
          <label htmlFor="review-status">{appText("Queue status")}</label>
          <select
            id="review-status"
            disabled={locked}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected("");
            }}
          >
            <option value="">{appText("All statuses")}</option>
            {["SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "SUSPENDED"].map(
              (s) => (
                <option key={s} value={s}>
                  {appText(label(s))}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label htmlFor="review-teacher">
            {appText("Teacher application")}
          </label>
          <select
            id="review-teacher"
            disabled={locked}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{appText("Choose an application")}</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {appText(label(t.status))} {appText("— Revision")}{" "}
                {t.profileRevision}
              </option>
            ))}
          </select>
        </div>
      </div>
      <HistoryPages
        history={queue}
        label="Teacher review queue"
        disabled={locked}
      />
      {queue.isPending && (
        <p role="status">{appText("Loading review queue…")}</p>
      )}
      {queue.error && (
        <Notice error>
          {appText("Review queue could not be loaded.")}{" "}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => queue.refetch()}
          >
            {appText("Retry review queue")}{" "}
          </Button>
        </Notice>
      )}
      {!queue.isPending && !queue.error && !teachers.length && (
        <Notice>{appText("No applications for this status.")}</Notice>
      )}
      {!queue.isPending && !teacher && teachers.length > 0 && (
        <Notice>
          {appText(
            "Choose an application from this queue. Load more records for earlier applications; regional access still applies.",
          )}{" "}
        </Notice>
      )}
      {teacher && (
        <TeacherReview
          key={teacher.id}
          session={session}
          teacher={teacher}
          queueUnavailable={!!queue.error}
          onLock={setLocked}
          refreshQueue={async () => {
            const q = await queue.refetch();
            if (q.error) throw q.error;
          }}
        />
      )}
      <small className="care-help">
        {appText(
          "Browse the queue, evidence and screening history using Load more records. Scanner clearance is file safety, not identity or teaching approval. Live reviewer staffing and production qualification remain open.",
        )}{" "}
      </small>
    </div>
  );
}
function TeacherReview({
  session,
  teacher: t,
  onLock,
  refreshQueue,
  queueUnavailable,
}: {
  session: Session;
  teacher: Teacher;
  queueUnavailable: boolean;
  onLock: (v: boolean) => void;
  refreshQueue: () => Promise<void>;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const own = t.accountId === session.account.id;
  const evidence = useHistory<components["schemas"]["EvidenceList"]>({
    queryKey: ["review-evidence", session.account.id, t.id],
    path: `/teachers/${t.id}/evidence`,
    enabled: !own,
  });
  const checks = useHistory<components["schemas"]["VerificationList"]>({
    queryKey: ["review-checks", session.account.id, t.id],
    path: `/admin/teachers/${t.id}/checks`,
    enabled: !own,
  });
  const [action, setAction] = useState<"check" | "decision" | "scan" | "">(""),
    [kind, setKind] = useState<string>("IDENTITY"),
    [evidenceId, setEvidenceId] = useState(""),
    [checkResult, setCheckResult] = useState(""),
    [validity, setValidity] = useState(
      localTime(new Date(Date.now() + 30 * 86400000).toISOString()),
    ),
    [reason, setReason] = useState(""),
    [status, setStatus] = useState("CHANGES_REQUESTED"),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    [coverage, setCoverage] = useState(false);
  const sending = useRef(false);
  async function refresh() {
    const [, e, c] = await Promise.all([
      refreshQueue(),
      evidence.refetch(),
      checks.refetch(),
    ]);
    if (e.error) throw e.error;
    if (c.error) throw c.error;
  }
  const availableKinds = kinds.filter(
    (k) =>
      !checks.data?.items.some(
        (c) => c.profileRevision === t.profileRevision && c.kind === k,
      ),
  );
  const decision = useDecision(session, refresh),
    failed = checks.data?.items.some(
      (c) => c.profileRevision === t.profileRevision && c.result === "FAILED",
    ),
    ready =
      !!t.feeTermsAcceptedAt &&
      !failed &&
      kinds.every((k) =>
        checks.data?.items.some(
          (c) =>
            c.profileRevision === t.profileRevision &&
            c.kind === k &&
            c.result === "PASSED" &&
            new Date(c.validUntil).getTime() > Date.now() &&
            evidence.data?.items.some(
              (e) => e.id === c.evidenceId && e.status === "CLEAN",
            ),
        ),
      ),
    unavailable =
      queueUnavailable ||
      own ||
      !!evidence.error ||
      !!checks.error ||
      evidence.isPending ||
      checks.isPending;
  useEffect(() => {
    onLock(decision.locked || !!action);
    return () => onLock(false);
  }, [decision.locked, action, onLock]);
  function begin(next: "check" | "decision" | "scan", id = "") {
    if (action || decision.locked || own) return;
    setAction(next);
    if (next === "check") {
      setKind(availableKinds[0] || "IDENTITY");
      setCheckResult("");
    }
    setEvidenceId(id);
    setReview(false);
    setAgreed(false);
    setCoverage(false);
    setReason("");
    decision.invalid("");
  }
  function operation() {
    if (
      own ||
      unavailable ||
      !reason.trim() ||
      reason.trim().length > (action === "check" ? 1000 : 500)
    ) {
      decision.invalid(
        "Load the current evidence/checks and enter a reason within the stated limit.",
      );
      return null;
    }
    if (action === "scan") {
      const e = evidence.data?.items.find((x) => x.id === evidenceId);
      if (!e || e.status !== "QUARANTINED") {
        decision.invalid("Only current quarantined evidence can be retried.");
        return null;
      }
      return {
        path: `/admin/evidence/${e.id}/retries`,
        body: { expectedVersion: e.version, reason: reason.trim() },
      };
    }
    if (action === "decision") {
      if (status === "APPROVED" && !ready) {
        decision.invalid(
          "Approval requires current passed checks for all four kinds, clean evidence, fee acceptance and no failed check on this revision.",
        );
        return null;
      }
      return {
        path: `/admin/teachers/${t.id}/reviews`,
        body: { expectedVersion: t.version, status, reason: reason.trim() },
      };
    }
    const e = evidence.data?.items.find((x) => x.id === evidenceId),
      date = new Date(validity + ":00+05:30");
    if (
      !["PASSED", "FAILED"].includes(checkResult) ||
      !availableKinds.includes(kind as (typeof kinds)[number]) ||
      !["SUBMITTED", "CHANGES_REQUESTED"].includes(t.status) ||
      !e ||
      e.status !== "CLEAN" ||
      e.kind !== kind ||
      !Number.isFinite(date.getTime()) ||
      date.getTime() <= Date.now() ||
      date.getTime() > Date.now() + 365 * 86400000 ||
      (kind === "CAPABILITY" && !coverage)
    ) {
      decision.invalid(
        "Choose matching clean evidence, a pending application, validity within the next 365 days and acknowledge full capability coverage when required.",
      );
      return null;
    }
    return {
      path: `/admin/teachers/${t.id}/checks`,
      body: {
        expectedVersion: t.version,
        kind,
        evidenceId,
        result: checkResult,
        reason: reason.trim(),
        validUntil: date.toISOString(),
        ...(kind === "CAPABILITY"
          ? {
              coverage: {
                subjects: t.subjects,
                boards: t.boards,
                grades: t.grades,
                ...(t.teachingCoverage
                  ? { teachingCoverage: t.teachingCoverage }
                  : {}),
              },
            }
          : {}),
      },
    };
  }
  async function save() {
    if (decision.locked || sending.current) return;
    const op = operation();
    if (!op || !agreed) {
      if (op)
        decision.invalid("Acknowledge this reviewed decision before saving.");
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        ...op,
        message:
          action === "check"
            ? "Screening assessment recorded. Teacher approval remains a separate decision."
            : action === "scan"
              ? "Scan retry queued. The evidence remains quarantined."
              : "Teacher review decision recorded.",
        onSaved: () => {
          setAction("");
          setReview(false);
          setAgreed(false);
          setReason("");
        },
      });
    } finally {
      sending.current = false;
    }
  }
  if (queueUnavailable)
    return (
      <>
        <Feedback decision={decision} />
        <Button disabled>{appText("Review teacher decision")}</Button>
        <RefreshButton
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => {
            setReview(false);
            setAgreed(false);
            void decision.reload();
          }}
         label={appText("Refresh screening")} />
      </>
    );
  return (
    <>
      <section className="care-card">
        <span className="care-status">
          {appText(label(t.status))} {appText("· Revision")} {t.profileRevision}
        </span>
        <h3>{t.name}</h3>
        <p>{t.headline}</p>
        <p>{t.bio}</p>
        <TeachingCoverageSummary profile={t} />
        <p>
          {appText("Teaching language and format:")}{" "}
          {t.languages.map((value) => appCurriculum(value)).join(", ")} ·{" "}
          {t.modes.map(label).join(", ")} ·{" "}
          {t.localities.join(", ") || appText("No home localities")}
        </p>
        <p>
          {appText("Fee terms:")}{" "}
          {t.feeTermsAcceptedAt ? appText("Accepted") : appText("Not accepted")}{" "}
          {appText("· Version")} {t.version}
        </p>
        {own && (
          <Notice>
            {appText(
              "You cannot review your own application. Independent review is required.",
            )}{" "}
          </Notice>
        )}
      </section>
      <section className="care-card">
        <TeacherDetailsSummary profile={t} />
      </section>
      <Feedback decision={decision} />
      {decision.conflict && (
        <RefreshButton
          variant="outline"
          disabled={decision.busy}
          onClick={() => {
            setReview(false);
            setAgreed(false);
            void decision.reload();
          }}
         label={appText("Refresh screening")} />
      )}
      {!own && (
        <>
          <div className="care-actions">
            <RefreshButton
              variant="outline"
              disabled={decision.locked || !!action}
              onClick={() => decision.reload()}
             label={appText("Refresh evidence and checks")} />
            <Button
              disabled={
                decision.locked ||
                !!action ||
                unavailable ||
                !availableKinds.length ||
                !["SUBMITTED", "CHANGES_REQUESTED"].includes(t.status)
              }
              onClick={() => begin("check")}
            >
              {appText("Record screening check")}{" "}
            </Button>
            <Button
              disabled={decision.locked || !!action || unavailable}
              onClick={() => begin("decision")}
            >
              {appText("Review teacher decision")}{" "}
            </Button>
          </div>
          {(evidence.error || checks.error) && (
            <Notice error>
              {appText(
                "Private evidence or screening history is unavailable. Refresh before making a decision.",
              )}{" "}
            </Notice>
          )}
          <section className="care-card">
            <h3>{appText("Private evidence")}</h3>
            <HistoryPages
              history={evidence}
              label="Private evidence"
              disabled={decision.locked || !!action}
            />
            {evidence.isPending && (
              <p role="status">{appText("Loading private evidence…")}</p>
            )}
            {!evidence.isPending &&
              !evidence.error &&
              !evidence.data?.items.length && (
                <p>{appText("No evidence uploaded yet.")}</p>
              )}
            {evidence.data?.items.map((e) => (
              <article className="privacy-record" key={e.id}>
                <h4>
                  {appText(label(e.kind))} · {appText(label(e.status))}
                </h4>
                <p>
                  {e.mediaType} · {Math.ceil(e.size / 1024)}{" "}
                  {appText("KiB · Evidence")} {e.id.slice(0, 8)}
                </p>
                <small>
                  {appText("Scanner:")}{" "}
                  {e.scannerVersion || appText("Not recorded")} ·{" "}
                  {e.scannedAt
                    ? appText("{0} IST", [
                        new Date(e.scannedAt).toLocaleString(appLocale, {
                          timeZone: "Asia/Kolkata",
                        }),
                      ])
                    : appText("Not scanned")}
                </small>
                <div className="care-actions">
                  {e.status === "CLEAN" && (
                    <a
                      className="inline-link"
                      href={`/api/v1/evidence/${e.id}/content`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {appText("Download private")}{" "}
                      {appText(label(e.kind).toLowerCase())}{" "}
                      {appText("evidence")}{" "}
                    </a>
                  )}
                  {e.status === "QUARANTINED" && (
                    <Button
                      variant="outline"
                      disabled={decision.locked || !!action || unavailable}
                      onClick={() => begin("scan", e.id)}
                    >
                      {appText("Review scan retry")} {e.id.slice(0, 8)}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </section>
          <section className="care-card">
            <h3>{appText("Screening history")}</h3>
            <p>
              {ready
                ? appText(
                    "Current visible checks meet the approval prerequisites; the server rechecks every decision.",
                  )
                : appText("Approval prerequisites are incomplete or blocked.")}
            </p>
            {failed && (
              <Notice error>
                {appText(
                  "A failed check exists on this revision. Request changes and require a new application revision before approval.",
                )}{" "}
              </Notice>
            )}
            <HistoryPages
              history={checks}
              label="Screening history"
              disabled={decision.locked || !!action}
            />
            {checks.isPending && (
              <p role="status">{appText("Loading screening history…")}</p>
            )}
            {checks.data?.items.map((c) => (
              <article className="privacy-record" key={c.id}>
                <h4>
                  {appText(label(c.kind))} · {appText(label(c.result))}{" "}
                  {appText("· Revision")} {c.profileRevision}
                </h4>
                <p>{c.reason}</p>
                <small>
                  {appText("Valid until")}{" "}
                  {new Date(c.validUntil).toLocaleString(appLocale, {
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  {appText("IST ·")}{" "}
                  {c.profileRevision === t.profileRevision
                    ? appText("Current revision")
                    : appText("Earlier revision")}{" "}
                  {appText("· Policy")} {c.policyVersion}
                </small>
              </article>
            ))}
          </section>
          {action && (
            <section className="care-card care-editor">
              <h3>
                {review
                  ? appText("Confirm the recorded assessment")
                  : action === "check"
                    ? appText("Record an evidence-based screening check")
                    : action === "scan"
                      ? appText("Retry quarantined evidence scanning")
                      : appText("Choose the teacher decision")}
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
                  {!review ? (
                    <>
                      {action === "check" && (
                        <>
                          <div className="care-fields">
                            <div>
                              <label htmlFor="screen-kind">
                                {appText("Check kind")}
                              </label>
                              <select
                                id="screen-kind"
                                value={kind}
                                onChange={(e) => {
                                  setKind(e.target.value);
                                  setEvidenceId("");
                                  setCoverage(false);
                                }}
                              >
                                {kinds.map((k) => (
                                  <option
                                    key={k}
                                    value={k}
                                    disabled={!availableKinds.includes(k)}
                                  >
                                    {appText(label(k))}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor="screen-evidence">
                                {appText("Matching clean evidence")}{" "}
                              </label>
                              <select
                                id="screen-evidence"
                                value={evidenceId}
                                onChange={(e) => setEvidenceId(e.target.value)}
                              >
                                <option value="">
                                  {appText("Choose reviewed evidence")}{" "}
                                </option>
                                {evidence.data?.items
                                  .filter(
                                    (e) =>
                                      e.kind === kind && e.status === "CLEAN",
                                  )
                                  .map((e) => (
                                    <option key={e.id} value={e.id}>
                                      {appText(label(e.kind))} —{" "}
                                      {e.id.slice(0, 8)}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor="screen-result">
                                {appText("Assessment result")}{" "}
                              </label>
                              <select
                                id="screen-result"
                                value={checkResult}
                                onChange={(e) => setCheckResult(e.target.value)}
                              >
                                <option value="">
                                  {appText("Choose a result")}
                                </option>
                                <option value="PASSED">
                                  {appText("Passed")}
                                </option>
                                <option value="FAILED">
                                  {appText("Failed")}
                                </option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="screen-validity">
                                {appText("Valid until (IST)")}{" "}
                              </label>
                              <Input
                                id="screen-validity"
                                type="datetime-local"
                                value={validity}
                                onChange={(e) => setValidity(e.target.value)}
                              />
                            </div>
                          </div>
                          {kind === "CAPABILITY" && (
                            <label className="care-check reviewer-coverage">
                              <input
                                type="checkbox"
                                checked={coverage}
                                onChange={(e) => setCoverage(e.target.checked)}
                              />
                              <span>
                                {appText(
                                  "I assessed every declared teaching area, including its stage, subject and class/board or course/year:",
                                )}{" "}
                                {appText(coverageText(t, appText))}
                              </span>
                            </label>
                          )}
                        </>
                      )}
                      {action === "decision" && (
                        <>
                          <label htmlFor="teacher-decision">
                            {appText("Teacher decision")}{" "}
                          </label>
                          <select
                            id="teacher-decision"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                          >
                            <option value="CHANGES_REQUESTED">
                              {appText("Request changes")}{" "}
                            </option>
                            <option value="APPROVED" disabled={!ready}>
                              {appText("Approve current revision")}{" "}
                            </option>
                            <option value="SUSPENDED">
                              {appText("Suspend teacher")}
                            </option>
                          </select>
                          <p>
                            {appText(
                              "Approval requires four current passed checks with clean evidence and accepted fee terms. Suspension removes discovery/new booking eligibility and shared note access; existing paid bookings require separate review.",
                            )}{" "}
                          </p>
                        </>
                      )}
                      {action === "scan" && (
                        <p>
                          {appText(
                            "A retry queues scanning and keeps this evidence quarantined. It does not declare the file safe or approve the teacher.",
                          )}{" "}
                        </p>
                      )}
                      <label htmlFor="review-reason">
                        {appText("Reason for recorded decision")}{" "}
                      </label>
                      <Textarea
                        id="review-reason"
                        rows={4}
                        maxLength={action === "check" ? 1000 : 500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <small>
                        {appText(
                          "Include an assessment or actionable changes. Avoid unnecessary personal details.",
                        )}{" "}
                      </small>
                    </>
                  ) : (
                    <div className="care-review">
                      <h4>
                        {t.name} {appText("· Revision")} {t.profileRevision}{" "}
                        {appText("· Version")} {t.version}
                      </h4>
                      <p>{reason}</p>
                      <p>
                        {action === "check"
                          ? appText(
                              "{0}: {1}. Evidence {2}; valid until {3} IST.",
                              [
                                appText(label(kind)),
                                appText(label(checkResult)),
                                evidenceId.slice(0, 8),
                                validity.replace("T", " "),
                              ],
                            )
                          : action === "scan"
                            ? appText("Queue a private evidence scan retry.")
                            : appText("Teacher decision: {0}.", [
                                appText(label(status)),
                              ])}
                      </p>
                      {action === "check" && kind === "CAPABILITY" && (
                        <div>
                          <p>{appText("Full teaching coverage assessed:")}</p>
                          <TeachingCoverageSummary profile={t} />
                        </div>
                      )}
                      {action === "decision" && status === "SUSPENDED" && (
                        <p>
                          {appText(
                            "Discovery and new bookings stop; named note access is revoked. Existing paid bookings and refunds require separate review.",
                          )}{" "}
                        </p>
                      )}
                      <label className="care-check">
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(e) => setAgreed(e.target.checked)}
                        />
                        <span>
                          {action === "scan"
                            ? appText(
                                "I reviewed the quarantine state and want to queue this audited scan retry.",
                              )
                            : appText(
                                "I independently reviewed this application, its available evidence and the current revision, and want to record this audited decision.",
                              )}
                        </span>
                      </label>
                    </div>
                  )}
                  <div className="care-actions">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        review
                          ? setReview(false)
                          : (setAction(""), setReason(""))
                      }
                    >
                      {review
                        ? appText("Back to editing")
                        : appText("Cancel decision")}
                    </Button>
                    <Button type="submit">
                      {review
                        ? appText("Confirm reviewer decision")
                        : appText("Review assessment")}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </section>
          )}
        </>
      )}
    </>
  );
}
