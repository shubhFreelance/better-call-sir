"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  rupees,
  type Session,
  type Teacher,
  type components,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import {
  WeeklyAvailability,
  WeeklySummary,
  emptyWeekly,
  weeklyPreferences,
} from "./weekly-availability";
type Enquiry = components["schemas"]["StudentEnquiry"];
type Context = components["schemas"]["StudentEnquiryContext"];
type InputBody = components["schemas"]["StudentEnquiryInput"];
function Scope({ value }: { value: Context["educationScope"] }) {
  return (
    <span>
      {value.stage === "SCHOOL"
        ? `Class ${value.grade} · ${value.board}`
        : `${value.courseName} · Year ${value.studyYear}`}
    </span>
  );
}
export function StudentEnquiries({ session }: { session: Session }) {
  const owner = session.account.role === "INDEPENDENT_STUDENT",
    staff = ["ADMIN", "OPERATOR"].includes(session.account.role),
    params = useSearchParams(),
    router = useRouter();
  const creating = owner && params.get("new") === "1",
    selected = params.get("enquiry") || "";
  const [cursor, setCursor] = useState<string | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]),
    [locked, setLocked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({
    queryKey: ["student-enquiries", session.account.id, cursor],
    queryFn: ({ signal }) =>
      api<components["schemas"]["StudentEnquiryList"]>(
        "/student-enquiries?limit=10" + (cursor ? "&cursor=" + cursor : ""),
        { signal },
      ),
    enabled: (owner || staff) && !creating,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!owner && !staff)
    return (
      <Notice>
        Student enquiries belong to independent students and authorized review
        staff.
      </Notice>
    );
  function choose(id: string) {
    if (!locked)
      router.push(
        (owner ? "/dashboard/enquiries" : "/dashboard/student-enquiries") +
          "?enquiry=" +
          id,
        { scroll: false },
      );
  }
  return (
    <section className="student-enquiries" lang="en">
      <header className="student-enquiry-heading">
        <div>
          <h1>
            {staff ? "Independent student enquiries" : "My teacher enquiries"}
          </h1>
          <p>
            {staff
              ? "Review student-owned criteria in your authorized region. Matching, teacher replies and hiring are separate steps."
              : "Share the help you need, review your criteria, and keep a record of your request."}
          </p>
        </div>
        {owner && !creating && !locked && (
          <Link className="button" href="/dashboard/enquiries?new=1">
            New teacher enquiry
          </Link>
        )}
      </header>
      {creating ? (
        <StudentEnquiryForm
          key={`${session.account.id}:${params.get("teacher") || "assisted"}:${params.get("profile") || ""}`}
          session={session}
        />
      ) : (
        <>
          {selected && (
            <StudentEnquiryDetail
              key={selected}
              id={selected}
              session={session}
              onLockChange={setLocked}
            />
          )}
          <div className="care-section student-enquiry-history">
            <h2 ref={heading} tabIndex={-1}>
              {staff ? "Review queue" : "Enquiry history"}
            </h2>
            {query.isPending && <p role="status">Loading enquiries…</p>}
            {query.error && (
              <Notice error>
                We couldn’t load this page of enquiries.{" "}
                <Button disabled={locked} onClick={() => query.refetch()}>
                  Retry enquiry history
                </Button>
                <Button
                  disabled={locked}
                  variant="outline"
                  onClick={() => {
                    setCursor(null);
                    setPrevious([]);
                    query.refetch();
                  }}
                >
                  Return to first page
                </Button>
              </Notice>
            )}
            {!query.error && query.data && (
              <>
                {!query.data.items.length ? (
                  <Notice>
                    {cursor
                      ? "No more enquiries on this page."
                      : "No enquiries yet."}{" "}
                    {owner &&
                      "Start with teacher search or share your criteria for staff review."}
                  </Notice>
                ) : (
                  <ul className="student-enquiry-list">
                    {query.data.items.map((row) => (
                      <li key={row.id}>
                        <div>
                          <strong>{row.subject}</strong>
                          <p>
                            <Scope value={row.educationScope} /> ·{" "}
                            {row.mode === "HOME" ? "At home" : "Online"}
                          </p>
                          <p>
                            {row.status === "SUBMITTED"
                              ? "Received · awaiting staff review"
                              : "Withdrawn"}{" "}
                            · Reference {row.id.slice(0, 8)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={locked}
                          onClick={() => choose(row.id)}
                          aria-label={`View enquiry ${row.id.slice(0, 8)}`}
                        >
                          View details
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="care-actions">
                  <Button
                    variant="outline"
                    disabled={locked || !previous.length || query.isFetching}
                    onClick={() => {
                      setCursor(previous.at(-1) ?? null);
                      setPrevious(previous.slice(0, -1));
                      requestAnimationFrame(() => heading.current?.focus());
                    }}
                  >
                    Previous page
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      locked || !query.data.nextCursor || query.isFetching
                    }
                    onClick={() => {
                      setPrevious([...previous, cursor]);
                      setCursor(query.data.nextCursor);
                      requestAnimationFrame(() => heading.current?.focus());
                    }}
                  >
                    Next page
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
function StudentEnquiryForm({ session }: { session: Session }) {
  const params = useSearchParams(),
    router = useRouter(),
    client = useQueryClient(),
    teacherId = params.get("teacher"),
    slug = params.get("profile");
  const context = useQuery({
    queryKey: ["student-enquiry-context", session.account.id],
    queryFn: ({ signal }) =>
      api<Context>("/independent-student/enquiry-context", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const teacher = useQuery({
    queryKey: ["student-enquiry-teacher", teacherId, slug],
    queryFn: ({ signal }) =>
      api<Teacher>("/teachers/" + encodeURIComponent(slug || ""), { signal }),
    enabled: !!teacherId && !!slug,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [subject, setSubject] = useState(""),
    [mode, setMode] = useState(""),
    [language, setLanguage] = useState(""),
    [locality, setLocality] = useState(""),
    [budget, setBudget] = useState(""),
    [weekly, setWeekly] = useState(emptyWeekly),
    [review, setReview] = useState<InputBody | null>(null),
    [accepted, setAccepted] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  async function refresh() {
    const current = await context.refetch();
    if (current.error) throw current.error;
    if (teacherId && slug) {
      const next = await teacher.refetch();
      if (next.error) throw next.error;
    }
    await client.invalidateQueries({ queryKey: ["student-enquiries"] });
    setReview(null);
    setAccepted(false);
  }
  const decision = useDecision(session, refresh),
    unavailable =
      (!!teacherId &&
        (!slug ||
          !!teacher.error ||
          (!!teacher.data && teacher.data.id !== teacherId))) ||
      (!teacherId && !!slug);
  const ready =
    !!context.data &&
    context.data.gate === "READY" &&
    !context.error &&
    !context.isFetching &&
    !unavailable &&
    (!teacherId || (!!teacher.data && !teacher.isFetching));
  const locked = decision.locked || !ready;
  function clearError(name: string) {
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }
  function check() {
    const next: Record<string, string> = {},
      preferences = weeklyPreferences(weekly);
    if (!subject.trim() || subject.trim().length > 60)
      next.subject = "Enter a subject, up to 60 characters.";
    if (!mode) next.mode = "Choose online or at-home teaching.";
    if (!language) next.language = "Choose a teaching language.";
    if (!locality.trim() || locality.trim().length > 80)
      next.locality =
        "Enter a locality, up to 80 characters. Do not enter your full address.";
    if (
      !/^\d+(\.\d{1,2})?$/.test(budget) ||
      Number(budget) < 500 ||
      Number(budget) > 20000
    )
      next.budget =
        "Enter a monthly budget from ₹500 to ₹20,000, with up to two decimal places.";
    if (!preferences)
      next.weekly =
        "Choose nonoverlapping weekly time ranges of at least 20 minutes.";
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        document
          .getElementById("student-enquiry-" + Object.keys(next)[0])
          ?.focus(),
      );
      return;
    }
    setReview({
      expectedProfileVersion: context.data!.profileVersion,
      discoveryMethod: teacherId ? "MANUAL" : "ASSISTED",
      ...(teacherId ? { preferredTeacherId: teacherId } : {}),
      subject: subject.trim(),
      mode: mode as "ONLINE" | "HOME",
      language: language as "English" | "Hindi",
      locality: locality.trim(),
      budgetPaise: Math.round(Number(budget) * 100),
      preferences: preferences!,
      confirmed: true,
    });
    setAccepted(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function error(name: string) {
    return (
      errors[name] && (
        <p className="field-error" id={"student-enquiry-" + name + "-error"}>
          {errors[name]}
        </p>
      )
    );
  }
  return (
    <div className="student-enquiry-layout">
      <div className="wizard-card student-enquiry-form">
        <h2 ref={heading} tabIndex={-1}>
          {review
            ? "Review your enquiry"
            : teacherId
              ? "Enquire about this teacher"
              : "Let us search for you"}
        </h2>
        <Feedback decision={decision} />
        {decision.error && !decision.uncertain && (
          <Button
            variant="outline"
            disabled={decision.busy}
            onClick={() => decision.reload()}
          >
            Reload criteria and review again
          </Button>
        )}
        {context.isPending && (
          <p role="status">Loading your education profile…</p>
        )}
        {context.error && (
          <Notice error>
            We couldn’t load your current education details. Your form stays on
            this page.{" "}
            <Button
              disabled={decision.locked}
              onClick={() => context.refetch()}
            >
              Retry education details
            </Button>
          </Notice>
        )}
        {!context.error && context.data?.gate !== "READY" && context.data && (
          <Notice>
            {context.data.gate === "PRIVACY_PAUSED"
              ? "New enquiries are paused while your deletion request is reviewed."
              : "Your account region is not enabled for teacher enquiries yet."}
            <Link className="inline-link" href="/dashboard">
              Return to my dashboard
            </Link>
          </Notice>
        )}
        {teacherId && teacher.isPending && !unavailable && (
          <p role="status">Checking the selected teacher…</p>
        )}
        {unavailable && (
          <Notice error>
            The selected teacher could not be confirmed. We have not substituted
            another teacher.{" "}
            {!decision.locked && (
              <Link className="inline-link" href="/dashboard/enquiries?new=1">
                Use assisted search instead
              </Link>
            )}
          </Notice>
        )}
        {!context.error && context.data && (
          <>
            <div className="student-enquiry-snapshot">
              <strong>Your current education</strong>
              <p>
                <Scope value={context.data.educationScope} />
              </p>
              <p>
                {context.data.region} · Profile version{" "}
                {context.data.profileVersion}
              </p>
              {teacherId && teacher.data && (
                <p>
                  Requested teacher: <strong>{teacher.data.name}</strong> ·{" "}
                  {rupees(teacher.data.monthlyPaise)} / month
                </p>
              )}
            </div>
            {!review ? (
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!locked) check();
                }}
              >
                <fieldset disabled={locked}>
                  <div className="student-enquiry-fields">
                    <div className="field">
                      <label htmlFor="student-enquiry-subject">
                        Subject you need help with
                      </label>
                      <Input
                        id="student-enquiry-subject"
                        maxLength={60}
                        list="student-subject-suggestions"
                        value={subject}
                        onChange={(e) => {
                          setSubject(e.target.value);
                          clearError("subject");
                        }}
                        aria-invalid={!!errors.subject}
                        aria-describedby={
                          errors.subject
                            ? "student-enquiry-subject-error"
                            : undefined
                        }
                      />
                      <datalist id="student-subject-suggestions">
                        {context.data.subjects.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                      {error("subject")}
                    </div>
                    <div className="field">
                      <label htmlFor="student-enquiry-mode">
                        Teaching format
                      </label>
                      <select
                        id="student-enquiry-mode"
                        value={mode}
                        onChange={(e) => {
                          setMode(e.target.value);
                          clearError("mode");
                        }}
                        aria-invalid={!!errors.mode}
                        aria-describedby={
                          errors.mode ? "student-enquiry-mode-error" : undefined
                        }
                      >
                        <option value="">Choose a format</option>
                        <option value="ONLINE">Online</option>
                        <option value="HOME">At home</option>
                      </select>
                      {error("mode")}
                    </div>
                    <div className="field">
                      <label htmlFor="student-enquiry-language">
                        Teaching language
                      </label>
                      <select
                        id="student-enquiry-language"
                        value={language}
                        onChange={(e) => {
                          setLanguage(e.target.value);
                          clearError("language");
                        }}
                        aria-invalid={!!errors.language}
                        aria-describedby={
                          errors.language
                            ? "student-enquiry-language-error"
                            : undefined
                        }
                      >
                        <option value="">Choose a language</option>
                        <option value="English">English</option>
                        <option value="Hindi">Hindi</option>
                      </select>
                      {error("language")}
                    </div>
                    <div className="field">
                      <label htmlFor="student-enquiry-locality">
                        Your locality
                      </label>
                      <Input
                        id="student-enquiry-locality"
                        maxLength={80}
                        value={locality}
                        onChange={(e) => {
                          setLocality(e.target.value);
                          clearError("locality");
                        }}
                        aria-invalid={!!errors.locality}
                        aria-describedby={
                          errors.locality
                            ? "student-locality-help student-enquiry-locality-error"
                            : "student-locality-help"
                        }
                      />
                      <p className="care-help" id="student-locality-help">
                        Locality only. Keep your full address and contact
                        details out of this form.
                      </p>
                      {error("locality")}
                    </div>
                    <div className="field">
                      <label htmlFor="student-enquiry-budget">
                        Monthly budget (₹)
                      </label>
                      <Input
                        id="student-enquiry-budget"
                        inputMode="decimal"
                        maxLength={8}
                        value={budget}
                        onChange={(e) => {
                          setBudget(e.target.value);
                          clearError("budget");
                        }}
                        aria-invalid={!!errors.budget}
                        aria-describedby={
                          errors.budget
                            ? "student-enquiry-budget-error"
                            : undefined
                        }
                      />
                      {error("budget")}
                    </div>
                  </div>
                  <div
                    id="student-enquiry-weekly"
                    tabIndex={-1}
                    aria-describedby={
                      errors.weekly ? "student-enquiry-weekly-error" : undefined
                    }
                  >
                    <h3>When are you usually available?</h3>
                    <WeeklyAvailability
                      rows={weekly}
                      onChange={(rows) => {
                        setWeekly(rows);
                        clearError("weekly");
                      }}
                    />
                    {error("weekly")}
                  </div>
                  <div className="wizard-actions">
                    <Button key="criteria-review" type="submit">
                      Review enquiry
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <>
                <dl className="independent-summary">
                  <dt>Search approach</dt>
                  <dd>
                    {review.discoveryMethod === "MANUAL"
                      ? "My selected teacher"
                      : "Let us search for you"}
                  </dd>
                  <dt>Subject and format</dt>
                  <dd>
                    {review.subject} ·{" "}
                    {review.mode === "HOME" ? "At home" : "Online"} ·{" "}
                    {review.language}
                  </dd>
                  <dt>Locality</dt>
                  <dd>{review.locality}</dd>
                  <dt>Monthly budget</dt>
                  <dd>{rupees(review.budgetPaise)}</dd>
                </dl>
                <WeeklySummary preferences={review.preferences} />
                <p>
                  We will record these criteria for staff review. This does not
                  reserve a teacher, confirm hiring, book classes or charge you.
                </p>
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={locked}
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  <span>
                    I reviewed my education and enquiry criteria and want to
                    send this request.
                  </span>
                </label>
                <div className="wizard-actions">
                  <Button
                    key="criteria-edit"
                    variant="outline"
                    disabled={decision.locked}
                    onClick={() => {
                      setReview(null);
                      setAccepted(false);
                    }}
                  >
                    Edit criteria
                  </Button>
                  <Button
                    key="criteria-send"
                    disabled={locked || !accepted}
                    onClick={() =>
                      decision.run({
                        path: "/student-enquiries",
                        body: review,
                        message:
                          "Your enquiry was recorded. Check its current status in your history.",
                        onSaved: (result) =>
                          router.replace(
                            "/dashboard/enquiries?enquiry=" +
                              (result as Enquiry).id,
                          ),
                      })
                    }
                  >
                    Send my enquiry
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        {!decision.locked && (
          <Link className="inline-link" href="/dashboard/enquiries">
            Return to enquiry history
          </Link>
        )}
      </div>
      <div className="independent-guide">
        <h2>A clear brief. A better starting point.</h2>
        <p>
          Tell us the subject, format, budget and broad weekly times that work
          for you.
        </p>
        <p>
          Your school name, university and account contact details are not
          included in the staff queue. Only education criteria needed to review
          teacher fit are saved with this enquiry.
        </p>
        <p>
          Matching results, teacher responses and hiring confirmation are not
          enabled for student enquiries yet. A submitted enquiry means your
          criteria have been recorded for staff review.
        </p>
        <p>
          Unsubmitted details stay on this page only. Reloading clears them.
        </p>
      </div>
    </div>
  );
}
function StudentEnquiryDetail({
  id,
  session,
  onLockChange,
}: {
  id: string;
  session: Session;
  onLockChange: (v: boolean) => void;
}) {
  const owner = session.account.role === "INDEPENDENT_STUDENT",
    client = useQueryClient(),
    [reviewing, setReviewing] = useState(false),
    [accepted, setAccepted] = useState(false);
  const query = useQuery({
    queryKey: ["student-enquiry-detail", session.account.id, id],
    queryFn: ({ signal }) =>
      api<Enquiry>("/student-enquiries/" + encodeURIComponent(id), { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const next = await query.refetch();
    if (next.error) throw next.error;
    await client.invalidateQueries({ queryKey: ["student-enquiries"] });
    setReviewing(false);
    setAccepted(false);
  }
  const decision = useDecision(session, refresh);
  useEffect(() => {
    onLockChange(decision.locked || reviewing);
    return () => onLockChange(false);
  }, [decision.locked, reviewing, onLockChange]);
  return (
    <section className="care-section student-enquiry-detail">
      <h2>Enquiry details</h2>
      <Feedback decision={decision} />
      {decision.conflict && (
        <Button onClick={() => decision.reload()} disabled={decision.busy}>
          Reload enquiry
        </Button>
      )}
      {query.isPending && <p role="status">Loading enquiry details…</p>}
      {query.error && (
        <Notice error>
          This enquiry could not be loaded for your account.{" "}
          <Button disabled={decision.locked} onClick={() => query.refetch()}>
            Retry enquiry details
          </Button>
        </Notice>
      )}
      {!query.error && query.data && (
        <>
          <p className="student-enquiry-status">
            {query.data.status === "SUBMITTED"
              ? "Received · awaiting staff review"
              : "Withdrawn"}
          </p>
          <p>
            Reference {query.data.id.slice(0, 8)} · Submitted{" "}
            {new Date(query.data.createdAt).toLocaleDateString("en-IN")}
          </p>
          <Scope value={query.data.educationScope} />
          <dl className="independent-summary">
            <dt>Subject</dt>
            <dd>{query.data.subject}</dd>
            <dt>Search approach</dt>
            <dd>
              {query.data.discoveryMethod === "MANUAL"
                ? "Selected teacher · " +
                  query.data.preferredTeacherId?.slice(0, 8)
                : "Let us search for you"}
            </dd>
            <dt>Format and language</dt>
            <dd>
              {query.data.mode === "HOME" ? "At home" : "Online"} ·{" "}
              {query.data.language}
            </dd>
            <dt>Locality</dt>
            <dd>{query.data.locality}</dd>
            <dt>Monthly budget</dt>
            <dd>{rupees(query.data.budgetPaise)}</dd>
          </dl>
          <WeeklySummary preferences={query.data.preferences} />
          <p>
            {query.data.status === "SUBMITTED"
              ? "Your criteria are recorded for staff review. No teacher has been assigned and no hiring or payment is confirmed."
              : "This enquiry is closed. It will not proceed to matching or hiring."}
          </p>
          {owner &&
            query.data.status === "SUBMITTED" &&
            (reviewing ? (
              <div className="student-withdraw-review">
                <h3>Withdraw this enquiry?</h3>
                <p>
                  Your submitted criteria stay in your private history. No
                  booking or payment is cancelled because this enquiry has not
                  created one.
                </p>
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={decision.locked}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>I want to withdraw this enquiry.</span>
                </label>
                <div className="care-actions">
                  <Button
                    variant="outline"
                    disabled={decision.locked}
                    onClick={() => setReviewing(false)}
                  >
                    Keep enquiry
                  </Button>
                  <Button
                    disabled={decision.locked || !accepted}
                    onClick={() =>
                      decision.run({
                        path: "/student-enquiries/" + id + "/withdrawals",
                        body: {
                          expectedVersion: query.data!.version,
                          confirmed: true,
                        },
                        message: "Enquiry withdrawn.",
                      })
                    }
                  >
                    Confirm withdrawal
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                disabled={decision.locked || query.isFetching}
                onClick={() => {
                  setReviewing(true);
                  setAccepted(false);
                }}
              >
                Withdraw enquiry
              </Button>
            ))}
        </>
      )}
    </section>
  );
}
