"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Alert, AlertDescription } from "../components/ui/alert";
import { EducationSummary } from "./learner-profiles";
type Context = components["schemas"]["StudentSetupContext"];
type Preferences = components["schemas"]["StudentLearningPreferences"];
type Confirmation = components["schemas"]["StudentSetupConfirmation"];
type Progress = components["schemas"]["OnboardingProgress"];
const supportLabels = {
  SELF_DIRECTED: "I can manage my learning",
  GUARDIAN_GUIDED: "I need guardian help",
};
const splitSubjects = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export function StudentWelcome({ session }: { session: Session }) {
  const query = useQuery({
    queryKey: ["student-setup", session.account.id],
    queryFn: ({ signal }) =>
      api<Context>("/onboarding/student/context", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const denied =
    query.error instanceof ApiError && [401, 403].includes(query.error.status);
  return (
    <main className="container section student-welcome">
      <header className="wizard-title">
        <h1>Set up your student space.</h1>
        <p>
          Check what you’re learning, choose the help you want, and review your
          setup before saving.
        </p>
      </header>
      <div className="student-welcome-layout">
        <div className="student-welcome-main">
          {query.isPending ? (
            <p role="status">Loading your student setup…</p>
          ) : !query.data || denied ? (
            <section className="wizard-card">
              <Alert variant="destructive">
                <AlertDescription>
                  {denied
                    ? "Your student access or guardian permission needs review. Ask your guardian for help before continuing."
                    : "We couldn’t load your saved student setup. Try again before entering details."}
                </AlertDescription>
              </Alert>
              <Button onClick={() => query.refetch()}>
                Retry loading student setup
              </Button>
              <Link href="/dashboard" className="inline-link">
                Open dashboard
              </Link>
            </section>
          ) : (
            <div>
              {query.error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    We couldn’t refresh your setup. Your edits are retained;
                    reload the latest details before saving.
                    <Button
                      variant="outline"
                      disabled={query.isFetching}
                      onClick={() => query.refetch()}
                    >
                      Retry loading student setup
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <StudentSetupForm
                key={
                  query.data.progress.version + ":" + query.data.learner.version
                }
                session={session}
                context={query.data}
                readBlocked={!!query.error || query.isFetching}
                onReload={() => query.refetch()}
              />
            </div>
          )}
        </div>
        <aside className="student-welcome-notice">
          <h2>Your learning, with support.</h2>
          <p>
            You can explore teachers and tell us what works for you. Your
            guardian currently sends enquiries, chooses teachers and agrees to
            tuition terms.
          </p>
          <p>
            Your support choice records the help you want. It does not change
            these permissions.
          </p>
          <h3>Keep personal details private.</h3>
          <p>
            Do not add phone numbers, addresses, passwords or identity documents
            to learning notes.
          </p>
          <Link className="inline-link" href="/support">
            Get help with your guardian
          </Link>
          <Link className="inline-link" href="/teachers">
            Explore teacher profiles
          </Link>
        </aside>
      </div>
    </main>
  );
}
function StudentSetupForm({
  session,
  context,
  readBlocked,
  onReload,
}: {
  session: Session;
  context: Context;
  readBlocked: boolean;
  onReload: () => Promise<unknown>;
}) {
  const initial = context.progress.draft as Preferences,
    suggestions = context.learner.education.subjects;
  const [subjects, setSubjects] = useState(
      (initial.subjects || []).filter((s) => suggestions.includes(s)),
    ),
    [other, setOther] = useState(
      (initial.subjects || [])
        .filter((s) => !suggestions.includes(s))
        .join(", "),
    );
  const [management, setManagement] = useState(
      initial.managementPreference || "",
    ),
    [correct, setCorrect] = useState(false),
    [language, setLanguage] = useState(initial.language || ""),
    [notes, setNotes] = useState(initial.learningPreferences || "");
  const [review, setReview] = useState<Confirmation["draft"] | null>(null),
    [version, setVersion] = useState(context.progress.version),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const pending = useRef<{ body: Confirmation; key: string } | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const locked = busy || uncertain || conflict || readBlocked;
  function prepare() {
    const chosen = [...subjects, ...splitSubjects(other)],
      invalid: Record<string, string> = {};
    if (!correct)
      invalid.education =
        "Review your education details and confirm they are correct.";
    if (!management) invalid.management = "Choose how much help you want.";
    if (
      chosen.length > 20 ||
      chosen.some((s) => s.length > 60) ||
      new Set(chosen.map((s) => s.toLowerCase())).size !== chosen.length
    )
      invalid.subjects =
        "Choose up to 20 distinct subjects, with up to 60 characters each.";
    if (notes.trim().length > 500)
      invalid.notes = "Use 500 characters or fewer.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document
        .getElementById(
          {
            education: "student-education-correct",
            management: "student-management-self",
            subjects: "student-other-subjects",
            notes: "student-learning-notes",
          }[Object.keys(invalid)[0]] || "student-education-correct",
        )
        ?.focus();
      return;
    }
    setReview({
      managementPreference: management as "SELF_DIRECTED" | "GUARDIAN_GUIDED",
      subjects: chosen,
      ...(language ? { language: language as "English" | "Hindi" } : {}),
      ...(notes.trim() ? { learningPreferences: notes.trim() } : {}),
    });
    setError("");
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function save() {
    if (!review || busy || conflict || readBlocked) return;
    const attempt = pending.current || {
      body: {
        expectedVersion: version,
        educationVersion: context.learner.version,
        confirmed: true as const,
        draft: review,
      },
      key: crypto.randomUUID(),
    };
    pending.current = attempt;
    setBusy(true);
    setError("");
    try {
      const result = await api<Progress>("/onboarding/student/confirmations", {
        method: "POST",
        body: attempt.body,
        key: attempt.key,
        csrf: session.csrfToken,
      });
      if (
        result.kind !== "STUDENT" ||
        result.state !== "READY" ||
        result.completedResourceId !== context.learner.id ||
        !Number.isInteger(result.version) ||
        result.version <= version
      )
        throw new Error("Setup was not confirmed.");
      pending.current = null;
      setVersion(result.version);
      setUncertain(false);
      setSaved(true);
      const confirmed = result.draft as Preferences;
      setSubjects(
        (confirmed.subjects || []).filter((s) => suggestions.includes(s)),
      );
      setOther(
        (confirmed.subjects || [])
          .filter((s) => !suggestions.includes(s))
          .join(", "),
      );
      setManagement(confirmed.managementPreference || "");
      setLanguage(confirmed.language || "");
      setNotes(confirmed.learningPreferences || "");
      setReview(confirmed as Confirmation["draft"]);
      requestAnimationFrame(() => heading.current?.focus());
    } catch (e) {
      const unknown =
        !(e instanceof ApiError) ||
        e.code === "INVALID_RESPONSE" ||
        e.status >= 500;
      setUncertain(unknown);
      setConflict(e instanceof ApiError && e.status === 409);
      if (!unknown) pending.current = null;
      setError(
        unknown
          ? "We couldn’t confirm whether your setup was saved. Retry the same setup before changing details."
          : (e as Error).message,
      );
      if (e instanceof ApiError && [401, 403].includes(e.status))
        await onReload();
    } finally {
      setBusy(false);
    }
  }
  if (!context.learner.enquiryEligible)
    return (
      <section className="wizard-card">
        <h2>Review your education details.</h2>
        <EducationSummary education={context.learner.education} />
        <Alert>
          <AlertDescription>
            Some education details are missing. Ask your guardian to complete
            your profile, then reload your setup.
          </AlertDescription>
        </Alert>
        <Button variant="outline" disabled={readBlocked} onClick={onReload}>
          Reload student setup
        </Button>
      </section>
    );
  return (
    <section
      className="wizard-card student-setup-form"
      aria-label="Student onboarding"
    >
      <ol className="student-setup-steps" aria-label="Student setup progress">
        <li aria-current={!review ? "step" : undefined}>
          1 · Details and support
        </li>
        <li aria-current={review ? "step" : undefined}>2 · Review and save</li>
      </ol>
      <h2 ref={heading} tabIndex={-1}>
        {saved
          ? "Your student setup is saved."
          : review
            ? "Review your student setup"
            : "What helps you learn?"}
      </h2>
      {review ? (
        <div className="student-setup-review">
          <h3>{context.learner.alias}</h3>
          <EducationSummary education={context.learner.education} />
          <h3>Support you want</h3>
          <p>{supportLabels[review.managementPreference]}</p>
          <h3>Learning preferences</h3>
          <p>
            {review.subjects?.length
              ? review.subjects.join(", ")
              : "No subjects selected"}
          </p>
          <p>{review.language || "No language preference"}</p>
          {review.learningPreferences && <p>{review.learningPreferences}</p>}
          <p>
            Your guardian continues to handle enquiries, teacher choices and
            tuition agreements.
          </p>
        </div>
      ) : (
        <form
          id="student-setup-details"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!locked) prepare();
          }}
        >
          <fieldset disabled={locked} className="wizard-fields">
            <div className="student-education-review">
              <h3>Your education details</h3>
              <strong>{context.learner.alias}</strong>
              <EducationSummary education={context.learner.education} />
              <label className="wizard-checkbox">
                <input
                  id="student-education-correct"
                  type="checkbox"
                  checked={correct}
                  onChange={(e) => setCorrect(e.target.checked)}
                  aria-invalid={!!errors.education}
                  aria-describedby={
                    errors.education
                      ? "student-education-error"
                      : "student-education-help"
                  }
                />
                <span>These education details are correct</span>
              </label>
              <small className="wizard-help" id="student-education-help">
                If anything is wrong, ask your guardian to review it before
                continuing.
              </small>
              {errors.education && (
                <p
                  id="student-education-error"
                  role="alert"
                  className="field-error"
                >
                  {errors.education}
                </p>
              )}
            </div>
            <fieldset className="student-support-choices">
              <legend>How would you like to manage your learning?</legend>
              <p className="wizard-help" id="student-management-help">
                Choose the support you want. Your current account permissions
                stay as they are.
              </p>
              {(["SELF_DIRECTED", "GUARDIAN_GUIDED"] as const).map(
                (choice, i) => (
                  <label
                    className={
                      management === choice
                        ? "student-support-choice selected"
                        : "student-support-choice"
                    }
                    key={choice}
                  >
                    <input
                      type="radio"
                      id={
                        i === 0
                          ? "student-management-self"
                          : "student-management-guided"
                      }
                      name="student-management"
                      value={choice}
                      checked={management === choice}
                      onChange={() => setManagement(choice)}
                      aria-invalid={!!errors.management}
                      aria-describedby={
                        errors.management
                          ? "student-management-error"
                          : "student-management-help"
                      }
                    />
                    <span>
                      <strong>{supportLabels[choice]}</strong>
                      <small>
                        {i === 0
                          ? "I want to organise my goals and explore teachers, with help when I ask for it."
                          : "I want help understanding my needs and choosing a suitable teacher."}
                      </small>
                    </span>
                  </label>
                ),
              )}
              {errors.management && (
                <p
                  className="field-error"
                  id="student-management-error"
                  role="alert"
                >
                  {errors.management}
                </p>
              )}
            </fieldset>
            <fieldset>
              <legend>Subjects you want help with (optional)</legend>
              <div className="teacher-choices">
                {suggestions.map((s) => (
                  <label key={s} className="teacher-choice">
                    <input
                      type="checkbox"
                      checked={subjects.includes(s)}
                      onChange={(e) =>
                        setSubjects(
                          e.target.checked
                            ? [...subjects, s]
                            : subjects.filter((v) => v !== s),
                        )
                      }
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="student-other-subjects">
                Other subjects (optional)
              </label>
              <Input
                id="student-other-subjects"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                maxLength={1220}
                aria-invalid={!!errors.subjects}
                aria-describedby={
                  errors.subjects
                    ? "student-subjects-error"
                    : "student-subjects-help"
                }
              />
              <small className="wizard-help" id="student-subjects-help">
                Separate subjects with commas. Choose up to 20 subjects in
                total.
              </small>
              {errors.subjects && (
                <p
                  className="field-error"
                  role="alert"
                  id="student-subjects-error"
                >
                  {errors.subjects}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="student-language">
                Language you prefer (optional)
              </label>
              <select
                id="student-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="">No preference</option>
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="student-learning-notes">
                How do you like to learn? (optional)
              </label>
              <Textarea
                id="student-learning-notes"
                value={notes}
                maxLength={500}
                rows={4}
                onChange={(e) => setNotes(e.target.value)}
                aria-invalid={!!errors.notes}
                aria-describedby="student-notes-help"
              />
              <small id="student-notes-help" className="wizard-help">
                For example, “Please explain with pictures and give me time to
                try.” Keep personal details out. {notes.length}/500 characters.
              </small>
            </div>
          </fieldset>
          <p className="wizard-help">
            Only the final confirmation saves your changes. Leaving or reloading
            clears unsaved details.
          </p>
        </form>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {conflict && (
        <div className="student-preferences-recovery">
          <p>
            Your edits are retained. Reloading replaces them with the latest
            saved setup and education details; review them again before saving.
          </p>
          <Button variant="outline" disabled={readBlocked} onClick={onReload}>
            Reload latest student setup
          </Button>
        </div>
      )}
      <div className="wizard-actions">
        {saved ? (
          <>
            <Button
              key="update"
              type="button"
              variant="outline"
              onClick={() => {
                setSaved(false);
                setReview(null);
                setCorrect(false);
                setErrors({});
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              Update student setup
            </Button>
            <Button asChild>
              <Link href="/teachers">Explore teachers</Link>
            </Button>
            <Link href="/dashboard" className="inline-link">
              Open dashboard
            </Link>
          </>
        ) : review ? (
          <>
            <Button
              key="edit"
              type="button"
              variant="outline"
              disabled={locked}
              onClick={() => {
                setReview(null);
                setError("");
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              Edit setup details
            </Button>
            <Button
              key="confirm"
              type="button"
              disabled={busy || conflict || readBlocked}
              onClick={save}
            >
              {busy
                ? "Saving student setup…"
                : uncertain
                  ? "Retry saving student setup"
                  : "Confirm and save student setup"}
            </Button>
          </>
        ) : (
          <>
            <Button
              key="review"
              form="student-setup-details"
              type="submit"
              disabled={locked}
            >
              Review student setup
            </Button>
            <Link href="/dashboard" className="inline-link">
              Do this later
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
