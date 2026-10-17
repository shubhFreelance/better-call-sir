"use client";
import { useAppTranslation } from "./locale";
import { StudentFeedback } from "./independent-journey";
import { enquiryText } from "./student-enquiry-copy";
import { IndependentJourney } from "./independent-journey";
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
import { Notice, useDecision } from "./tuition-workflow";
import {
  WeeklyAvailability,
  WeeklySummary,
  emptyWeekly,
  weeklyPreferences,
} from "./weekly-availability";
type Enquiry = components["schemas"]["StudentEnquiry"];
type Context = components["schemas"]["StudentEnquiryContext"];
type InputBody = components["schemas"]["StudentEnquiryInput"];
function Scope({
  value,
  hindi = false,
}: {
  value: Context["educationScope"];
  hindi?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <span>
      {value.stage === "SCHOOL"
        ? `${hindi ? "कक्षा" : "Class"} ${value.grade} · ${value.board}`
        : `${value.courseName} · ${hindi ? "वर्ष" : "Year"} ${value.studyYear}`}
    </span>
  );
}
export function StudentEnquiries({
  session,
  hindi = false,
}: {
  session: Session;
  hindi?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const independent = session.account.role === "INDEPENDENT_STUDENT",
    guardian = session.account.role === "GUARDIAN",
    staff = ["ADMIN", "OPERATOR"].includes(session.account.role),
    params = useSearchParams(),
    router = useRouter();
  const studentId = guardian ? params.get("student") || "" : "";
  const delegation = useQuery({
    queryKey: ["student-delegation", session.account.id, studentId],
    queryFn: () =>
      api<components["schemas"]["DelegatedStudentProfile"]>(
        "/delegated-students/" + encodeURIComponent(studentId) + "/profile",
      ),
    enabled: guardian && !!studentId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const owner =
    independent ||
    (guardian &&
      delegation.data?.supportMode === "MANAGE" &&
      !delegation.error);
  const base = guardian
    ? "/dashboard/student-enquiries"
    : "/dashboard/enquiries";
  function url(extra: Record<string, string> = {}) {
    const q = new URLSearchParams({
      ...extra,
      ...(studentId ? { student: studentId } : {}),
    });
    return base + (q.size ? "?" + q : "");
  }
  const creating = owner && params.get("new") === "1",
    selected = params.get("enquiry") || "";
  const [cursor, setCursor] = useState<string | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]),
    [locked, setLocked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({
    queryKey: ["student-enquiries", session.account.id, studentId, cursor],
    queryFn: ({ signal }) =>
      api<components["schemas"]["StudentEnquiryList"]>(
        "/student-enquiries?limit=10" +
          (studentId ? "&studentId=" + encodeURIComponent(studentId) : "") +
          (cursor ? "&cursor=" + cursor : ""),
        { signal },
      ),
    enabled:
      (independent ||
        staff ||
        (guardian && !!delegation.data && !delegation.error)) &&
      !creating,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (guardian && delegation.isPending)
    return (
      <p role="status">
        {appText(enquiryText(hindi, "Checking shared learning access\u2026"))}
      </p>
    );
  if (
    !independent &&
    !staff &&
    !(guardian && delegation.data && !delegation.error)
  )
    return (
      <Notice>
        {appText(
          enquiryText(
            hindi,
            "Student enquiries belong to independent students and authorized review staff.",
          ),
        )}
      </Notice>
    );
  function choose(id: string) {
    if (!locked)
      router.push(
        staff
          ? "/dashboard/student-enquiries?enquiry=" + id
          : url({ enquiry: id }),
        { scroll: false },
      );
  }
  return (
    <section className="student-enquiries" lang={hindi ? "hi" : "en"}>
      <header className="student-enquiry-heading">
        <div>
          <h1>
            {staff
              ? enquiryText(hindi, "Independent student enquiries")
              : enquiryText(hindi, "My teacher enquiries")}
          </h1>
          <p>
            {staff
              ? enquiryText(
                  hindi,
                  "Review student-owned criteria in your authorized region. Matching, teacher replies and hiring are separate steps.",
                )
              : enquiryText(
                  hindi,
                  "Share the help you need, review your criteria, and keep a record of your request.",
                )}
          </p>
        </div>
        {owner && !creating && !locked && (
          <Link className="button" href={url({ new: "1" })}>
            {appText(enquiryText(hindi, "New teacher enquiry"))}
          </Link>
        )}
      </header>
      {creating ? (
        <StudentEnquiryForm
          key={`${session.account.id}:${params.get("teacher") || "assisted"}:${params.get("profile") || ""}`}
          session={session}
          studentId={studentId}
          hindi={hindi}
        />
      ) : (
        <>
          {selected && (
            <StudentEnquiryDetail
              key={selected}
              id={selected}
              session={session}
              onLockChange={setLocked}
              canManage={owner}
              hindi={hindi}
              studentId={studentId}
            />
          )}
          <div className="care-section student-enquiry-history">
            <h2 ref={heading} tabIndex={-1}>
              {staff
                ? enquiryText(hindi, "Review queue")
                : enquiryText(hindi, "Enquiry history")}
            </h2>
            {query.isPending && (
              <p role="status">
                {appText(enquiryText(hindi, "Loading enquiries\u2026"))}
              </p>
            )}
            {query.error && (
              <Notice error>
                {appText(
                  enquiryText(
                    hindi,
                    "We couldn\u2019t load this page of enquiries.",
                  ),
                )}{" "}
                <Button disabled={locked} onClick={() => query.refetch()}>
                  {appText(enquiryText(hindi, "Retry enquiry history"))}
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
                  {appText(enquiryText(hindi, "Return to first page"))}
                </Button>
              </Notice>
            )}
            {!query.error && query.data && (
              <>
                {!query.data.items.length ? (
                  <Notice>
                    {cursor
                      ? enquiryText(hindi, "No more enquiries on this page.")
                      : enquiryText(hindi, "No enquiries yet.")}{" "}
                    {owner &&
                      enquiryText(
                        hindi,
                        "Start with teacher search or share your criteria for staff review.",
                      )}
                  </Notice>
                ) : (
                  <ul className="student-enquiry-list">
                    {query.data.items.map((row) => (
                      <li key={row.id}>
                        <div>
                          <strong>{appCurriculum(row.subject)}</strong>
                          <p>
                            <Scope value={row.educationScope} hindi={hindi} /> ·{" "}
                            {row.mode === "HOME"
                              ? enquiryText(hindi, "At home")
                              : enquiryText(hindi, "Online")}
                          </p>
                          <p>
                            {row.status === "SUBMITTED"
                              ? enquiryText(
                                  hindi,
                                  "Received \u00B7 awaiting staff review",
                                )
                              : row.status === "HIRED"
                                ? enquiryText(hindi, "Both sides confirmed")
                                : enquiryText(hindi, "Withdrawn")}{" "}
                            {appText(enquiryText(hindi, "\u00B7 Reference"))}{" "}
                            {row.id.slice(0, 8)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={locked}
                          onClick={() => choose(row.id)}
                          aria-label={appText("View enquiry {0}", [
                            row.id.slice(0, 8),
                          ])}
                        >
                          {appText(enquiryText(hindi, "View details"))}
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
                    {appText(enquiryText(hindi, "Previous page"))}
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
                    {appText(enquiryText(hindi, "Next page"))}
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
function StudentEnquiryForm({
  session,
  studentId = "",
  hindi = false,
}: {
  session: Session;
  studentId?: string;
  hindi?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const params = useSearchParams(),
    router = useRouter(),
    client = useQueryClient(),
    teacherId = params.get("teacher"),
    slug = params.get("profile");
  const context = useQuery({
    queryKey: ["student-enquiry-context", session.account.id, studentId],
    queryFn: ({ signal }) =>
      api<Context>(
        studentId
          ? "/delegated-students/" +
              encodeURIComponent(studentId) +
              "/enquiry-context"
          : "/independent-student/enquiry-context",
        { signal },
      ),
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
      next.subject = enquiryText(
        hindi,
        "Enter a subject, up to 60 characters.",
      );
    if (!mode)
      next.mode = enquiryText(hindi, "Choose online or at-home teaching.");
    if (!language)
      next.language = enquiryText(hindi, "Choose a teaching language.");
    if (!locality.trim() || locality.trim().length > 80)
      next.locality = enquiryText(
        hindi,
        "Enter a locality, up to 80 characters. Do not enter your full address.",
      );
    if (
      !/^\d+(\.\d{1,2})?$/.test(budget) ||
      Number(budget) < 500 ||
      Number(budget) > 20000
    )
      next.budget = enquiryText(
        hindi,
        "Enter a monthly budget from \u20B9500 to \u20B920,000, with up to two decimal places.",
      );
    if (!preferences)
      next.weekly = enquiryText(
        hindi,
        "Choose nonoverlapping weekly time ranges of at least 20 minutes.",
      );
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
          {appError(errors[name])}
        </p>
      )
    );
  }
  return (
    <div className="student-enquiry-layout">
      <div className="wizard-card student-enquiry-form">
        <h2 ref={heading} tabIndex={-1}>
          {review
            ? enquiryText(hindi, "Review your enquiry")
            : teacherId
              ? enquiryText(hindi, "Enquire about this teacher")
              : enquiryText(hindi, "Let us search for you")}
        </h2>
        <StudentFeedback decision={decision} hindi={hindi} />
        {decision.error && !decision.uncertain && (
          <Button
            variant="outline"
            disabled={decision.busy}
            onClick={() => decision.reload()}
          >
            {appText(enquiryText(hindi, "Reload criteria and review again"))}
          </Button>
        )}
        {context.isPending && (
          <p role="status">
            {appText(
              enquiryText(hindi, "Loading your education profile\u2026"),
            )}
          </p>
        )}
        {context.error && (
          <Notice error>
            {appText(
              enquiryText(
                hindi,
                "We couldn\u2019t load your current education details. Your form stays on this page.",
              ),
            )}{" "}
            <Button
              disabled={decision.locked}
              onClick={() => context.refetch()}
            >
              {appText(enquiryText(hindi, "Retry education details"))}
            </Button>
          </Notice>
        )}
        {!context.error && context.data?.gate !== "READY" && context.data && (
          <Notice>
            {context.data.gate === "PRIVACY_PAUSED"
              ? enquiryText(
                  hindi,
                  "New enquiries are paused while your deletion request is reviewed.",
                )
              : enquiryText(
                  hindi,
                  "Your account region is not enabled for teacher enquiries yet.",
                )}
            <Link className="inline-link" href="/dashboard">
              {appText(enquiryText(hindi, "Return to my dashboard"))}
            </Link>
          </Notice>
        )}
        {teacherId && teacher.isPending && !unavailable && (
          <p role="status">
            {appText(enquiryText(hindi, "Checking the selected teacher\u2026"))}
          </p>
        )}
        {unavailable && (
          <Notice error>
            {appText(
              enquiryText(
                hindi,
                "The selected teacher could not be confirmed. We have not substituted another teacher.",
              ),
            )}{" "}
            {!decision.locked && (
              <Link
                className="inline-link"
                href={
                  studentId
                    ? "/dashboard/student-enquiries?student=" +
                      encodeURIComponent(studentId) +
                      "&new=1"
                    : "/dashboard/enquiries?new=1"
                }
              >
                {appText(enquiryText(hindi, "Use assisted search instead"))}
              </Link>
            )}
          </Notice>
        )}
        {!context.error && context.data && (
          <>
            <div className="student-enquiry-snapshot">
              <strong>
                {appText(enquiryText(hindi, "Your current education"))}
              </strong>
              <p>
                <Scope value={context.data.educationScope} hindi={hindi} />
              </p>
              <p>
                {context.data.region}{" "}
                {appText(enquiryText(hindi, "\u00B7 Profile version"))}{" "}
                {context.data.profileVersion}
              </p>
              {teacherId && teacher.data && (
                <p>
                  {appText(enquiryText(hindi, "Requested teacher:"))}{" "}
                  <strong>{teacher.data.name}</strong> ·{" "}
                  {rupees(teacher.data.monthlyPaise, appLocale)}{" "}
                  {appText(enquiryText(hindi, "/ month"))}
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
                        {appText(
                          enquiryText(hindi, "Subject you need help with"),
                        )}
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
                          <option key={s} value={s} label={appCurriculum(s)} />
                        ))}
                      </datalist>
                      {appError(error("subject"))}
                    </div>
                    <div className="field">
                      <label htmlFor="student-enquiry-mode">
                        {appText(enquiryText(hindi, "Teaching format"))}
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
                        <option value="">
                          {appText(enquiryText(hindi, "Choose a format"))}
                        </option>
                        <option value="ONLINE">
                          {appText(enquiryText(hindi, "Online"))}
                        </option>
                        <option value="HOME">
                          {appText(enquiryText(hindi, "At home"))}
                        </option>
                      </select>
                      {appError(error("mode"))}
                    </div>
                    <div className="field">
                      <label htmlFor="student-enquiry-language">
                        {appText(enquiryText(hindi, "Teaching language"))}
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
                        <option value="">
                          {appText(enquiryText(hindi, "Choose a language"))}
                        </option>
                        <option value="English">
                          {appText(enquiryText(hindi, "English"))}
                        </option>
                        <option value="Hindi">
                          {appText(enquiryText(hindi, "Hindi"))}
                        </option>
                      </select>
                      {appError(error("language"))}
                    </div>
                    <div className="field">
                      <label htmlFor="student-enquiry-locality">
                        {appText(enquiryText(hindi, "Your locality"))}
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
                        {appText(
                          enquiryText(
                            hindi,
                            "Locality only. Keep your full address and contact details out of this form.",
                          ),
                        )}
                      </p>
                      {appError(error("locality"))}
                    </div>
                    <div className="field">
                      <label htmlFor="student-enquiry-budget">
                        {appText(enquiryText(hindi, "Monthly budget (\u20B9)"))}
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
                      {appError(error("budget"))}
                    </div>
                  </div>
                  <div
                    id="student-enquiry-weekly"
                    tabIndex={-1}
                    aria-describedby={
                      errors.weekly ? "student-enquiry-weekly-error" : undefined
                    }
                  >
                    <h3>
                      {appText(
                        enquiryText(hindi, "When are you usually available?"),
                      )}
                    </h3>
                    <WeeklyAvailability
                      rows={weekly}
                      onChange={(rows) => {
                        setWeekly(rows);
                        clearError("weekly");
                      }}
                    />
                    {appError(error("weekly"))}
                  </div>
                  <div className="wizard-actions">
                    <Button key="criteria-review" type="submit">
                      {appText(enquiryText(hindi, "Review enquiry"))}
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <>
                <dl className="independent-summary">
                  <dt>{appText(enquiryText(hindi, "Search approach"))}</dt>
                  <dd>
                    {review.discoveryMethod === "MANUAL"
                      ? enquiryText(hindi, "My selected teacher")
                      : enquiryText(hindi, "Let us search for you")}
                  </dd>
                  <dt>{appText(enquiryText(hindi, "Subject and format"))}</dt>
                  <dd>
                    {appCurriculum(review.subject)} ·{" "}
                    {review.mode === "HOME"
                      ? enquiryText(hindi, "At home")
                      : enquiryText(hindi, "Online")}{" "}
                    · {appCurriculum(review.language)}
                  </dd>
                  <dt>{appText(enquiryText(hindi, "Locality"))}</dt>
                  <dd>{review.locality}</dd>
                  <dt>{appText(enquiryText(hindi, "Monthly budget"))}</dt>
                  <dd>{rupees(review.budgetPaise, appLocale)}</dd>
                </dl>
                <WeeklySummary preferences={review.preferences} />
                <p>
                  {appText(
                    enquiryText(
                      hindi,
                      "We will record these criteria for staff review. This does not reserve a teacher, confirm hiring, book classes or charge you.",
                    ),
                  )}
                </p>
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={locked}
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  <span>
                    {appText(
                      enquiryText(
                        hindi,
                        "I reviewed my education and enquiry criteria and want to send this request.",
                      ),
                    )}
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
                    {appText(enquiryText(hindi, "Edit criteria"))}
                  </Button>
                  <Button
                    key="criteria-send"
                    disabled={locked || !accepted}
                    onClick={() =>
                      decision.run({
                        path: studentId
                          ? "/delegated-students/" +
                            encodeURIComponent(studentId) +
                            "/enquiries"
                          : "/student-enquiries",
                        body: review,
                        message: enquiryText(
                          hindi,
                          "Your enquiry was recorded. Check its current status in your history.",
                        ),
                        onSaved: (result) =>
                          router.replace(
                            (studentId
                              ? "/dashboard/student-enquiries?student=" +
                                encodeURIComponent(studentId) +
                                "&enquiry="
                              : "/dashboard/enquiries?enquiry=") +
                              (result as Enquiry).id,
                          ),
                      })
                    }
                  >
                    {appText(enquiryText(hindi, "Send my enquiry"))}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        {!decision.locked && (
          <Link
            className="inline-link"
            href={
              studentId
                ? "/dashboard/student-enquiries?student=" +
                  encodeURIComponent(studentId)
                : "/dashboard/enquiries"
            }
          >
            {appText(enquiryText(hindi, "Return to enquiry history"))}
          </Link>
        )}
      </div>
      <div className="independent-guide">
        <h2>
          {appText(
            enquiryText(hindi, "A clear brief. A better starting point."),
          )}
        </h2>
        <p>
          {appText(
            enquiryText(
              hindi,
              "Tell us the subject, format, budget and broad weekly times that work for you.",
            ),
          )}
        </p>
        <p>
          {appText(
            enquiryText(
              hindi,
              "Your school name, university and account contact details are not included in the staff queue. Only education criteria needed to review teacher fit are saved with this enquiry.",
            ),
          )}
        </p>
        <p>
          {appText(
            enquiryText(
              hindi,
              "Staff review your criteria, publish a shortlist and ask teachers to respond. You choose an interested teacher and both sides review terms before hiring is confirmed.",
            ),
          )}
        </p>
        <p>
          {appText(
            enquiryText(
              hindi,
              "Unsubmitted details stay on this page only. Reloading clears them.",
            ),
          )}
        </p>
      </div>
    </div>
  );
}
function StudentEnquiryDetail({
  id,
  session,
  onLockChange,
  canManage,
  hindi = false,
  studentId = "",
}: {
  id: string;
  session: Session;
  onLockChange: (v: boolean) => void;
  canManage: boolean;
  hindi?: boolean;
  studentId?: string;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const owner = canManage,
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
      <h2>{appText(enquiryText(hindi, "Enquiry details"))}</h2>
      <StudentFeedback decision={decision} hindi={hindi} />
      {decision.conflict && (
        <Button onClick={() => decision.reload()} disabled={decision.busy}>
          {appText(enquiryText(hindi, "Reload enquiry"))}
        </Button>
      )}
      {query.isPending && (
        <p role="status">
          {appText(enquiryText(hindi, "Loading enquiry details\u2026"))}
        </p>
      )}
      {query.error && (
        <Notice error>
          {appText(
            enquiryText(
              hindi,
              "This enquiry could not be loaded for your account.",
            ),
          )}{" "}
          <Button disabled={decision.locked} onClick={() => query.refetch()}>
            {appText(enquiryText(hindi, "Retry enquiry details"))}
          </Button>
        </Notice>
      )}
      {!query.error && query.data && (
        <>
          <p className="student-enquiry-status">
            {query.data.status === "SUBMITTED"
              ? enquiryText(hindi, "Received \u00B7 awaiting staff review")
              : query.data.status === "HIRED"
                ? enquiryText(hindi, "Both sides confirmed")
                : enquiryText(hindi, "Withdrawn")}
          </p>
          <p>
            {appText(enquiryText(hindi, "Reference"))}{" "}
            {query.data.id.slice(0, 8)}{" "}
            {appText(enquiryText(hindi, "\u00B7 Submitted"))}{" "}
            {new Date(query.data.createdAt).toLocaleDateString(appLocale)}
          </p>
          <Scope value={query.data.educationScope} hindi={hindi} />
          <dl className="independent-summary">
            <dt>{appText(enquiryText(hindi, "Subject"))}</dt>
            <dd>{appCurriculum(query.data.subject)}</dd>
            <dt>{appText(enquiryText(hindi, "Search approach"))}</dt>
            <dd>
              {query.data.discoveryMethod === "MANUAL"
                ? enquiryText(hindi, "Selected teacher \u00B7 ") +
                  query.data.preferredTeacherId?.slice(0, 8)
                : enquiryText(hindi, "Let us search for you")}
            </dd>
            <dt>{appText(enquiryText(hindi, "Format and language"))}</dt>
            <dd>
              {query.data.mode === "HOME"
                ? enquiryText(hindi, "At home")
                : enquiryText(hindi, "Online")}{" "}
              · {appCurriculum(query.data.language)}
            </dd>
            <dt>{appText(enquiryText(hindi, "Locality"))}</dt>
            <dd>{query.data.locality}</dd>
            <dt>{appText(enquiryText(hindi, "Monthly budget"))}</dt>
            <dd>{rupees(query.data.budgetPaise, appLocale)}</dd>
          </dl>
          <WeeklySummary preferences={query.data.preferences} hindi={hindi} />
          <p>
            {query.data.status !== "WITHDRAWN"
              ? enquiryText(
                  hindi,
                  "Follow the reviewed shortlist below. A teacher is hired only after both sides accept the arrangement terms. No payment is taken here.",
                )
              : enquiryText(
                  hindi,
                  "This enquiry is closed. It will not proceed to matching or hiring.",
                )}
          </p>
          {query.data.status !== "WITHDRAWN" && (
            <IndependentJourney
              session={session}
              id={id}
              hindi={hindi}
              canManage={canManage}
              onSaved={refresh}
            />
          )}
          {!["ADMIN", "OPERATOR"].includes(session.account.role) &&
            !decision.locked && (
              <Link
                className="button secondary"
                href={canManage ? "/support?studentEnquiry=" + id : "/support"}
              >
                {appText(enquiryText(hindi, "Help and progress"))}
              </Link>
            )}
          {owner &&
            query.data.status === "SUBMITTED" &&
            (reviewing ? (
              <div className="student-withdraw-review">
                <h3>{appText(enquiryText(hindi, "Withdraw this enquiry?"))}</h3>
                <p>
                  {appText(
                    enquiryText(
                      hindi,
                      "Your submitted criteria stay in your private history. No booking or payment is cancelled because this enquiry has not created one.",
                    ),
                  )}
                </p>
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={decision.locked}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>
                    {appText(
                      enquiryText(hindi, "I want to withdraw this enquiry."),
                    )}
                  </span>
                </label>
                <div className="care-actions">
                  <Button
                    variant="outline"
                    disabled={decision.locked}
                    onClick={() => setReviewing(false)}
                  >
                    {appText(enquiryText(hindi, "Keep enquiry"))}
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
                        message: enquiryText(hindi, "Enquiry withdrawn."),
                      })
                    }
                  >
                    {appText(enquiryText(hindi, "Confirm withdrawal"))}
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
                {appText(enquiryText(hindi, "Withdraw enquiry"))}
              </Button>
            ))}
        </>
      )}
    </section>
  );
}
