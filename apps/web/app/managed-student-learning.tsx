"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Session,
  type Dashboard,
  type Teacher,
  type components,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Notice,
  Feedback,
  useDecision,
  RequestReview,
} from "./tuition-workflow";
import {
  WeeklyAvailability,
  emptyWeekly,
  weeklyPreferences,
} from "./weekly-availability";
import { DemoJourney } from "./demo-journey";
import { learningModes } from "./learning-management";
import { useAppTranslation } from "./locale";
type Permissions = components["schemas"]["LearningManagement"];
type Enquiry = components["schemas"]["TuitionRequest"];
type Child = NonNullable<Dashboard["children"]>[number];
export function ManagedStudentLearning({ session }: { session: Session }) {
  const { appText, appCurriculum } = useAppTranslation(),
    params = useSearchParams(),
    client = useQueryClient();
  const [cursors, setCursors] = useState<string[]>([]),
    [selected, setSelected] = useState(params.get("request") || ""),
    [open, setOpen] = useState(
      params.get("new") === "1" || !!params.get("teacher"),
    ),
    [locks, setLocks] = useState(new Set<string>());
  const lockReview = useCallback(
    (id: string, active: boolean) =>
      setLocks((prior) => {
        if (prior.has(id) === active) return prior;
        const next = new Set(prior);
        if (active) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const setLocked = useCallback(
    (active: boolean) => lockReview("shortlist", active),
    [lockReview],
  );
  const locked = locks.size > 0;
  const dashboard = useQuery({
    queryKey: ["dashboard", session.account.id],
    queryFn: ({ signal }) => api<Dashboard>("/dashboard", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const child = dashboard.data?.children?.[0];
  const management = useQuery({
    queryKey: ["learning-management", session.account.id, child?.id],
    queryFn: ({ signal }) =>
      api<Permissions>(`/children/${child!.id}/learning-management`, {
        signal,
      }),
    enabled: !!child,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const history = useQuery({
    queryKey: ["managed-enquiries", session.account.id, cursors.at(-1) || ""],
    queryFn: ({ signal }) =>
      api<components["schemas"]["RequestList"]>(
        "/requests?limit=20" +
          (cursors.at(-1) ? "&cursor=" + cursors.at(-1) : ""),
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const visible =
    !!child &&
    !!management.data &&
    !dashboard.error &&
    !management.error &&
    !history.error;
  const chosen =
    history.data?.items.find((r) => r.id === selected) ||
    (!selected ? history.data?.items[0] : undefined);
  async function refresh() {
    const results = await Promise.all([
      dashboard.refetch(),
      management.refetch(),
      history.refetch(),
    ]);
    const bad = results.find((r) => r.error);
    if (bad?.error) throw bad.error;
    await client.invalidateQueries({
      queryKey: ["request", session.account.id],
    });
  }
  return (
    <section className="care-workspace managed-learning-workspace">
      <header>
        <p className="eyebrow">{appText("YOUR LEARNING, YOUR NEXT STEP")}</p>
        <h1>{appText("My teacher choices")}</h1>
        <p>
          {appText(
            "Choose a teacher for each subject, follow replies and keep your guardian involved when you want help.",
          )}
        </p>
        <Link className="inline-link" href="/dashboard/learning-management">
          {appText("Review who manages learning")}
        </Link>
      </header>
      {(dashboard.isPending || management.isPending || history.isPending) && (
        <p role="status">{appText("Loading your learning choices…")}</p>
      )}
      {(dashboard.error || management.error || history.error) && (
        <Notice error>
          {appText(
            "Your current learning choices could not be loaded. Private details are hidden.",
          )}{" "}
          <Button
            variant="outline"
            hidden={locked}
            disabled={
              dashboard.isFetching ||
              management.isFetching ||
              history.isFetching
            }
            onClick={() => refresh().catch(() => {})}
          >
            {appText("Reload learning choices")}
          </Button>
        </Notice>
      )}
      {visible && child && management.data && (
        <>
          <article className="care-card management-current">
            <h2>{child.alias}</h2>
            <strong>
              {appText(learningModes[management.data.mode].title)}
            </strong>
            <p>{appText(learningModes[management.data.mode].help)}</p>
            <p>
              {appText(
                "Learning consent, account access and financial commencement remain with your guardian.",
              )}
            </p>
            {!management.data.canManageLearning && (
              <Notice>
                {appText(
                  "Your guardian currently makes learning decisions. You can explore teachers and follow your enquiries here.",
                )}
              </Notice>
            )}
            {!open && (
              <Button
                disabled={locked || !management.data.canManageLearning}
                onClick={() => setOpen(true)}
              >
                {appText("Find a teacher for another subject")}
              </Button>
            )}{" "}
            <Link className="inline-link" href="/teachers">
              {appText("Explore teacher profiles")}
            </Link>
          </article>
        </>
      )}
      {open && child && (
        <LearningEnquiryEditor
          session={session}
          child={child}
          allowed={visible && !!management.data?.canManageLearning}
          visible={visible}
          onClose={() => {
            setOpen(false);
            setLocked(false);
          }}
          onLock={setLocked}
          refresh={async () => {
            setCursors([]);
            await refresh();
          }}
          onSaved={(id) => {
            setSelected(id);
            setOpen(false);
            setLocked(false);
          }}
        />
      )}
      {visible && history.data && dashboard.data && (
        <section className="care-card">
          <h2>{appText("Your enquiries")}</h2>
          {history.data.items.length ? (
            <label className="field">
              {appText("Choose an enquiry")}
              <select
                disabled={locked || open}
                value={chosen?.id || selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {history.data.items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {appCurriculum(r.subject)} ·{" "}
                    {appText(r.status.toLowerCase())}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              {appText(
                "No enquiries yet. Start with one subject and a teacher who fits.",
              )}
            </p>
          )}
          {(cursors.length > 0 || !!history.data.nextCursor) && (
            <nav
              className="care-actions"
              aria-label={appText("Enquiry history pages")}
            >
              <Button
                variant="outline"
                disabled={
                  locked || open || !cursors.length || history.isFetching
                }
                onClick={() => {
                  setSelected("");
                  setCursors((c) => c.slice(0, -1));
                }}
              >
                {appText("Previous")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  locked ||
                  open ||
                  !history.data.nextCursor ||
                  history.isFetching
                }
                onClick={() => {
                  setSelected("");
                  setCursors((c) => [...c, history.data!.nextCursor!]);
                }}
              >
                {appText("Next")}
              </Button>
            </nav>
          )}
          {selected && !chosen && (
            <Notice>
              {appText("This enquiry is unavailable on the current page.")}{" "}
              <Button
                variant="outline"
                disabled={locked || open}
                onClick={() => {
                  setSelected("");
                  setCursors([]);
                }}
              >
                {appText("Return to first page")}
              </Button>
            </Notice>
          )}
        </section>
      )}
      {chosen && !open && dashboard.data && (
        <>
          <EnquiryAuthority
            key={chosen.id}
            session={session}
            enquiry={chosen}
            guardianOnly={management.data?.mode === "GUARDIAN_ONLY"}
            visible={visible}
            onLock={lockReview}
            allowed={
              !!management.data?.canManageLearning &&
              (locks.size === 0 || locks.has("authority"))
            }
            refresh={refresh}
          />
          <RequestReview
            key={chosen.id}
            visible={visible}
            session={session}
            requestId={chosen.id}
            dashboard={dashboard.data}
            permitted={
              !!management.data?.canManageLearning &&
              (locks.size === 0 || locks.has("shortlist")) &&
              !chosen.guardianDecisionRequested
            }
            onLockChange={setLocked}
          />
        </>
      )}
      <div id="optional-demos">
        <DemoJourney
          hideEmpty
          session={session}
          canManageLearning={visible && !!management.data?.canManageLearning}
          unavailable={!visible}
          onInteractionLock={lockReview}
        />
      </div>
      {dashboard.data?.placements?.map((p) => (
        <StudentLearningTerms
          key={p.id}
          session={session}
          placement={p}
          teacherName={
            dashboard.data?.teachers?.find((t) => t.id === p.teacherId)?.name ||
            appText("Teacher profile not loaded")
          }
          visible={visible}
          onLock={lockReview}
          permitted={
            !!management.data?.canManageLearning &&
            !open &&
            (locks.size === 0 || locks.has(p.id))
          }
          refresh={refresh}
        />
      ))}
    </section>
  );
}
function LearningEnquiryEditor({
  session,
  child,
  allowed,
  visible,
  onClose,
  onLock,
  refresh,
  onSaved,
}: {
  session: Session;
  child: Child;
  allowed: boolean;
  visible: boolean;
  onClose: () => void;
  onLock: (v: boolean) => void;
  refresh: () => Promise<void>;
  onSaved: (id: string) => void;
}) {
  const { appText, appCurriculum } = useAppTranslation(),
    params = useSearchParams();
  const manual = !!params.get("teacher"),
    slug = params.get("profile") || "";
  const teacher = useQuery({
    queryKey: ["teacher", slug],
    queryFn: ({ signal }) =>
      api<Teacher>("/teachers/" + encodeURIComponent(slug), { signal }),
    enabled: manual && !!slug,
    retry: false,
  });
  const [savedId, setSavedId] = useState<string | null>(null);
  const [subject, setSubject] = useState(""),
    [budget, setBudget] = useState(""),
    [format, setFormat] = useState("ONLINE"),
    [language, setLanguage] = useState("English"),
    [locality, setLocality] = useState(""),
    [weekly, setWeekly] = useState(emptyWeekly),
    [review, setReview] = useState(false),
    [ack, setAck] = useState(false);
  const proposed = useRef<Record<string, unknown> | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const decision = useDecision(session, async () => {
    await refresh();
    setReview(false);
    setAck(false);
  });
  const ready =
    allowed &&
    (!manual ||
      (!!teacher.data &&
        teacher.data.id === params.get("teacher") &&
        !teacher.error));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    if (!review) {
      const preferences = weeklyPreferences(weekly),
        paise = Number(budget) * 100;
      if (
        !preferences ||
        !Number.isSafeInteger(paise) ||
        paise < 50000 ||
        paise > 2000000 ||
        !child.schoolSubjects?.includes(subject)
      ) {
        decision.invalid(
          "Review your subject, budget and non-overlapping weekly availability.",
        );
        return;
      }
      proposed.current = {
        childId: child.id,
        alias: child.alias,
        grade: child.grade,
        board: child.board,
        subject,
        mode: format,
        language,
        locality: locality.trim(),
        budgetPaise: paise,
        schedule: "Reviewed weekly learning preferences",
        preferences,
        discoveryMethod: manual ? "MANUAL" : "ASSISTED",
        ...(manual ? { preferredTeacherId: teacher.data!.id } : {}),
      };
      setReview(true);
      setAck(false);
      heading.current?.focus();
      return;
    }
    if (!ack || !proposed.current) return;
    onLock(true);
    const saved = await decision.run({
      path: "/requests",
      body: proposed.current,
      message:
        "Your enquiry is saved for teacher matching. No class or payment was booked.",
      onSaved: (r) => setSavedId((r as { id: string }).id),
    });
    if (!saved && !decision.uncertain) onLock(false);
  }
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
          <Button disabled={decision.busy} onClick={() => decision.reload()}>
            {appText("Reload learning choices")}
          </Button>
        )}
      </>
    );
  if (savedId)
    return (
      <section className="care-card">
        <Feedback decision={decision} />
        {decision.conflict && (
          <Button disabled={decision.busy} onClick={() => decision.reload()}>
            {appText("Reload learning choices")}
          </Button>
        )}
        <Button disabled={decision.locked} onClick={() => onSaved(savedId)}>
          {appText("View saved enquiry")}
        </Button>
      </section>
    );
  return (
    <form className="care-card" onSubmit={submit}>
      <h2 ref={heading} tabIndex={-1}>
        {appText(
          review
            ? "Review your teacher enquiry"
            : "Tell us what you want to learn",
        )}
      </h2>
      {manual && (
        <Notice>
          {teacher.data
            ? teacher.data.name
            : appText("Loading teacher profile…")}
          {(teacher.error || !slug) && (
            <>
              <p>
                {appText(
                  "This teacher profile is unavailable. Retry or choose assisted search.",
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => teacher.refetch()}
              >
                {appText("Retry this profile")}
              </Button>
              <Link
                href="/dashboard/learning-choices?new=1"
                className="inline-link"
              >
                {appText("Let us search for you")}
              </Link>
            </>
          )}
        </Notice>
      )}
      {!allowed && (
        <Notice error>
          {appText(
            "Your guardian currently makes learning decisions. Review your current permissions before continuing.",
          )}
        </Notice>
      )}
      <fieldset disabled={decision.locked || !ready}>
        <legend>{appText("Teacher search criteria")}</legend>
        <label className="field">
          {appText("Subject")}
          <select
            required
            value={subject}
            disabled={review}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">{appText("Choose a subject")}</option>
            {child.schoolSubjects?.map((s) => (
              <option key={s} value={s}>
                {appCurriculum(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {appText("Monthly budget (INR)")}
          <Input
            required
            type="number"
            min="500"
            max="20000"
            step="1"
            value={budget}
            disabled={review}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <label className="field">
          {appText("Learning format")}
          <select
            value={format}
            disabled={review}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="ONLINE">{appText("Online")}</option>
            <option value="HOME">{appText("At home")}</option>
          </select>
        </label>
        <label className="field">
          {appText("Teaching language")}
          <select
            value={language}
            disabled={review}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="English">{appText("English")}</option>
            <option value="Hindi">{appText("Hindi")}</option>
          </select>
        </label>
        <label className="field">
          {appText("City or area")}
          <Input
            required
            maxLength={80}
            value={locality}
            disabled={review}
            onChange={(e) => setLocality(e.target.value)}
          />
        </label>
        <fieldset disabled={review}>
          <legend>{appText("Weekly learning preferences")}</legend>
          <WeeklyAvailability rows={weekly} onChange={setWeekly} />
        </fieldset>
        {review && (
          <>
            <Notice>
              {appText(
                "This saves an enquiry for your existing education profile. It does not book a class, charge you or authorize financial commencement.",
              )}
            </Notice>
            <label className="check-label">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              {appText(
                "I reviewed these learning criteria and want to send this enquiry.",
              )}
            </label>
          </>
        )}
        <div className="care-actions">
          <Button type="submit" disabled={review && !ack}>
            {appText(
              review ? "Confirm teacher enquiry" : "Review teacher enquiry",
            )}
          </Button>
          {review && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReview(false);
                setAck(false);
              }}
            >
              {appText("Back to editing")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {appText("Discard changes")}
          </Button>
        </div>
      </fieldset>
      <Feedback decision={decision} />
      {decision.uncertain && (
        <Button disabled={decision.busy} onClick={() => decision.run()}>
          {appText("Retry the same decision")}
        </Button>
      )}
      {decision.conflict && (
        <Button disabled={decision.busy} onClick={() => decision.reload()}>
          {appText("Reload learning choices")}
        </Button>
      )}
    </form>
  );
}
function EnquiryAuthority({
  session,
  enquiry,
  guardianOnly,
  visible,
  onLock,
  allowed,
  refresh,
}: {
  session: Session;
  enquiry: Enquiry;
  guardianOnly: boolean;
  visible: boolean;
  onLock: (id: string, active: boolean) => void;
  allowed: boolean;
  refresh: () => Promise<void>;
}) {
  const { appText } = useAppTranslation(),
    [review, setReview] = useState(false),
    [ack, setAck] = useState(false),
    decision = useDecision(session, refresh);
  useEffect(() => {
    onLock("authority", review || decision.locked);
    return () => onLock("authority", false);
  }, [review, decision.locked, onLock]);
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
          <Button disabled={decision.busy} onClick={() => decision.reload()}>
            {appText("Reload learning choices")}
          </Button>
        )}
      </>
    );
  return (
    <section className="management-current">
      <h3>
        {appText(
          guardianOnly
            ? "Your guardian manages this enquiry"
            : enquiry.guardianDecisionRequested
              ? "Your guardian is deciding for this enquiry"
              : "You can decide for this enquiry",
        )}
      </h3>
      <p>
        {appText(
          "Ask for help with this subject without changing the management choice for your other enquiries.",
        )}
      </p>
      {!review ? (
        <Button
          variant="outline"
          disabled={!allowed || decision.locked || enquiry.status !== "OPEN"}
          onClick={() => setReview(true)}
        >
          {appText(
            enquiry.guardianDecisionRequested
              ? "Resume my learning decisions"
              : "Ask guardian to decide",
          )}
        </Button>
      ) : (
        <>
          <label className="check-label">
            <input
              type="checkbox"
              disabled={decision.locked}
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            {appText(
              "I reviewed who will make this enquiry's learning decisions.",
            )}
          </label>
          <div className="care-actions">
            <Button
              disabled={!ack || decision.locked}
              onClick={() =>
                decision.run({
                  path: `/requests/${enquiry.id}/decision-authority`,
                  body: {
                    expectedVersion: enquiry.version,
                    guardianDecisionRequested:
                      !enquiry.guardianDecisionRequested,
                    confirmed: true,
                  },
                  message: "Enquiry decision preference saved.",
                  onSaved: () => {
                    setReview(false);
                    setAck(false);
                  },
                })
              }
            >
              {appText("Confirm enquiry preference")}
            </Button>
            <Button
              variant="outline"
              disabled={decision.locked}
              onClick={() => {
                setReview(false);
                setAck(false);
              }}
            >
              {appText("Discard changes")}
            </Button>
          </div>
        </>
      )}
      <Feedback decision={decision} />
      {decision.uncertain && (
        <Button disabled={decision.busy} onClick={() => decision.run()}>
          {appText("Retry the same decision")}
        </Button>
      )}
      {decision.conflict && (
        <Button disabled={decision.busy} onClick={() => decision.reload()}>
          {appText("Reload learning choices")}
        </Button>
      )}
    </section>
  );
}
function StudentLearningTerms({
  session,
  placement,
  teacherName,
  visible,
  onLock,
  permitted,
  refresh,
}: {
  session: Session;
  placement: NonNullable<Dashboard["placements"]>[number];
  teacherName: string;
  visible: boolean;
  onLock: (id: string, active: boolean) => void;
  permitted: boolean;
  refresh: () => Promise<void>;
}) {
  const requestId = (placement as typeof placement & { requestId?: string })
    .requestId;
  const request = useQuery({
    queryKey: ["arrangement-decision-authority", session.account.id, requestId],
    queryFn: ({ signal }) =>
      api<components["schemas"]["TuitionRequestDetails"]>(
        `/requests/${requestId}`,
        { signal },
      ),
    enabled: !!requestId,
    retry: false,
  });
  const allowed =
    permitted &&
    !!request.data &&
    !request.error &&
    !request.data.guardianDecisionRequested;
  const { appText, appLocale } = useAppTranslation(),
    [review, setReview] = useState(false),
    [ack, setAck] = useState(false),
    decision = useDecision(session, refresh);
  useEffect(() => {
    onLock(placement.id, review || decision.locked);
    return () => onLock(placement.id, false);
  }, [placement.id, review, decision.locked, onLock]);
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
          <Button disabled={decision.busy} onClick={() => decision.reload()}>
            {appText("Reload learning choices")}
          </Button>
        )}
      </>
    );
  if (request.error || !request.data)
    return (
      <section className="care-card">
        <Notice error={!!request.error}>
          {appText(
            request.error
              ? "Arrangement permissions could not be loaded. Private details are hidden."
              : "Loading learning permissions…",
          )}
        </Notice>
        <Button variant="outline" onClick={() => request.refetch()}>
          {appText("Reload arrangement permissions")}
        </Button>
        <Feedback decision={decision} />
        {decision.uncertain && (
          <Button disabled={decision.busy} onClick={() => decision.run()}>
            {appText("Retry the same decision")}
          </Button>
        )}
        {decision.conflict && (
          <Button disabled={decision.busy} onClick={() => decision.reload()}>
            {appText("Reload learning choices")}
          </Button>
        )}
      </section>
    );
  const amount = new Intl.NumberFormat(appLocale, {
    style: "currency",
    currency: "INR",
  }).format(placement.monthlyPaise / 100);
  return (
    <article className="care-card" id={`learning-arrangement-${placement.id}`}>
      <h2>{appText("Your learning arrangement")}</h2>
      <h3>{teacherName}</h3>
      <p>
        {appText("Monthly tuition")} · {amount}
      </p>
      <Notice>
        {appText(
          "Accepting learning terms confirms your teacher choice. Your guardian separately confirms any financial commencement and minimum tuition.",
        )}
      </Notice>
      <p>
        {appText(
          placement.status === "CLOSED"
            ? "This arrangement is closed."
            : placement.guardianAccepted && placement.teacherAccepted
              ? "Both sides accepted the learning terms."
              : placement.guardianAccepted
                ? "Your learning terms are accepted; waiting for the teacher."
                : "Review your learning terms before accepting.",
        )}
      </p>
      {!placement.guardianAccepted &&
        placement.status !== "CLOSED" &&
        (!review ? (
          <Button
            disabled={!allowed || decision.locked}
            onClick={() => setReview(true)}
          >
            {appText("Review learning terms")}
          </Button>
        ) : (
          <>
            <label className="check-label">
              <input
                type="checkbox"
                checked={ack}
                disabled={decision.locked}
                onChange={(e) => setAck(e.target.checked)}
              />
              {appText(
                "I reviewed the monthly tuition and agree to these learning terms. Financial commencement remains separate.",
              )}
            </label>
            <div className="care-actions">
              <Button
                disabled={!ack || !allowed || decision.locked}
                onClick={() =>
                  decision.run({
                    path: `/placements/${placement.id}/acceptances`,
                    body: {
                      expectedVersion: placement.version,
                      action: "ACCEPT_TERMS",
                    },
                    message:
                      "Learning terms accepted. Financial commencement is still separate.",
                    onSaved: () => {
                      setReview(false);
                      setAck(false);
                    },
                  })
                }
              >
                {appText("Accept learning terms")}
              </Button>
              <Button
                variant="outline"
                disabled={decision.locked}
                onClick={() => {
                  setReview(false);
                  setAck(false);
                }}
              >
                {appText("Discard changes")}
              </Button>
            </div>
          </>
        ))}
      <Feedback decision={decision} />
      {decision.uncertain && (
        <Button disabled={decision.busy} onClick={() => decision.run()}>
          {appText("Retry the same decision")}
        </Button>
      )}
      {decision.conflict && (
        <Button disabled={decision.busy} onClick={() => decision.reload()}>
          {appText("Reload learning choices")}
        </Button>
      )}
      <Link
        className="inline-link"
        href={`/dashboard/support?placement=${placement.id}`}
      >
        {appText("Help or replacement for this arrangement")}
      </Link>
    </article>
  );
}
