"use client";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";
type Profile = components["schemas"]["LearnerProfile"];
type Profiles = components["schemas"]["LearnerProfiles"];
type ProfileInput = components["schemas"]["LearnerProfileInput"];
const initial = {
  alias: "",
  stage: "SCHOOL",
  institutionName: "",
  subjects: "",
  grade: "",
  board: "",
  level: "",
  courseName: "",
  university: "",
  studyYear: "",
};
const fieldLabels = {
  alias: "Learner name or alias",
  institutionName: "School / institution name",
  subjects: "Subjects studied",
  grade: "Class",
  board: "School board",
  level: "Early years level",
  courseName: "Course / degree",
  university: "University / awarding institution",
  studyYear: "Current year of study",
};
const gateMessages = {
  VERIFICATION_REQUIRED:
    "Guardian verification is required before entering learner details.",
  CONSENT_REQUIRED: "Review guardian consent before entering learner details.",
  PRIVACY_PAUSED:
    "New learner profiles are paused while your deletion request is reviewed.",
  READ_ONLY:
    "You can view your linked profile. Your guardian currently manages education details.",
  READY: "",
};
export function LearnerProfiles({ session }: { session: Session }) {
  const client = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [saved, setSaved] = useState<Profile | null>(null);
  const [values, setValues] = useState(initial),
    [review, setReview] = useState<ProfileInput | null>(null),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef<{ body: ProfileInput; key: string } | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({
    queryKey: ["learner-profiles", session.account.id, cursor],
    queryFn: ({ signal }) =>
      api<Profiles>(
        "/learner-profiles?limit=10" + (cursor ? "&cursor=" + cursor : ""),
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const ready =
    query.data?.creationStatus === "READY" && !query.error && !query.isFetching;
  const locked = busy || uncertain;
  function change(name: keyof typeof initial, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: "" }));
  }
  function prepare() {
    const e: Record<string, string> = {};
    for (const [name, max] of [
      ["alias", 40],
      ["institutionName", 160],
      ["subjects", 1500],
      ...(values.stage === "SCHOOL"
        ? [["board", 80]]
        : values.stage === "COLLEGE"
          ? [
              ["courseName", 160],
              ["university", 160],
            ]
          : []),
    ] as [keyof typeof initial, number][])
      if (!values[name].trim() || values[name].trim().length > max)
        e[name] =
          `Enter ${fieldLabels[name as keyof typeof fieldLabels].toLowerCase()} (up to ${max} characters).`;
    const subjects = values.subjects
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      !subjects.length ||
      subjects.length > 20 ||
      subjects.some((s) => s.length > 60) ||
      new Set(subjects.map((s) => s.toLowerCase())).size !== subjects.length
    )
      e.subjects =
        "Enter 1–20 distinct subjects, separated by commas. Each can have up to 60 characters.";
    if (
      values.stage === "SCHOOL" &&
      (!/^\d+$/.test(values.grade) ||
        Number(values.grade) < 1 ||
        Number(values.grade) > 12)
    )
      e.grade = "Choose a class from 1 to 12.";
    if (
      values.stage === "EARLY_YEARS" &&
      !["NURSERY", "KG1", "KG2"].includes(values.level)
    )
      e.level = "Choose Nursery, KG1 or KG2.";
    if (
      values.stage === "COLLEGE" &&
      (!/^\d+$/.test(values.studyYear) ||
        Number(values.studyYear) < 1 ||
        Number(values.studyYear) > 10)
    )
      e.studyYear = "Enter a whole study year from 1 to 10.";
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById("education-" + Object.keys(e)[0])?.focus();
      return;
    }
    const common = { institutionName: values.institutionName.trim(), subjects };
    const education: ProfileInput["education"] =
      values.stage === "SCHOOL"
        ? {
            ...common,
            stage: "SCHOOL",
            grade: Number(values.grade),
            board: values.board.trim().toUpperCase(),
          }
        : values.stage === "EARLY_YEARS"
          ? {
              ...common,
              stage: "EARLY_YEARS",
              level: values.level as "NURSERY" | "KG1" | "KG2",
            }
          : {
              ...common,
              stage: "COLLEGE",
              courseName: values.courseName.trim(),
              university: values.university.trim(),
              studyYear: Number(values.studyYear),
            };
    setReview({ alias: values.alias.trim(), education });
    setMessage("");
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function save() {
    if (!review || (!ready && !uncertain)) return;
    const attempt = pending.current || {
      body: review,
      key: crypto.randomUUID(),
    };
    pending.current = attempt;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<Profile>("/learner-profiles", {
        method: "POST",
        body: attempt.body,
        key: attempt.key,
        csrf: session.csrfToken,
      });
      pending.current = null;
      setUncertain(false);
      setSaved(result);
      setAdding(false);
      setReview(null);
      setValues(initial);
      await client.invalidateQueries({ queryKey: ["children"] });
      await client.invalidateQueries({ queryKey: ["family-children"] });
      await client.invalidateQueries({ queryKey: ["hiring-dashboard"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
      await query.refetch();
    } catch (error) {
      const unknown = !(error instanceof ApiError) || error.status >= 500;
      setUncertain(unknown);
      if (!unknown) pending.current = null;
      setMessage(
        unknown
          ? "We couldn’t confirm whether the profile was saved. Retry this save; the same request will not create a second profile."
          : error instanceof Error
            ? error.message
            : "The profile could not be saved.",
      );
      if (error instanceof ApiError && [401, 403].includes(error.status))
        await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  function field(
    name: keyof typeof fieldLabels,
    control?: ReactNode,
    hint?: string,
  ) {
    const props = {
      id: "education-" + name,
      value: values[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        change(name, e.target.value),
      "aria-invalid": !!errors[name],
      "aria-describedby": errors[name]
        ? "education-" + name + "-error"
        : hint
          ? "education-" + name + "-hint"
          : undefined,
    };
    return (
      <div className="field">
        <label htmlFor={props.id}>
          {name === "institutionName" && values.stage === "COLLEGE"
            ? "College / institution name"
            : fieldLabels[name]}
        </label>
        {control || (
          <Input
            {...props}
            maxLength={
              name === "alias"
                ? 40
                : name === "subjects"
                  ? 1500
                  : name === "board"
                    ? 80
                    : 160
            }
            type={name === "studyYear" ? "number" : "text"}
            min={name === "studyYear" ? 1 : undefined}
            max={name === "studyYear" ? 10 : undefined}
          />
        )}
        {errors[name] ? (
          <small id={props.id + "-error"} role="alert" className="field-error">
            {errors[name]}
          </small>
        ) : (
          hint && (
            <small id={props.id + "-hint"} className="wizard-help">
              {hint}
            </small>
          )
        )}
      </div>
    );
  }
  return (
    <main className="container section learner-profiles">
      <header className="wizard-title">
        <h1>
          {session.account.role === "STUDENT"
            ? "Your education profile."
            : "Every learner has a different starting point."}
        </h1>
        <p>
          School, early years or college: keep the details that help explain
          what they’re learning.
        </p>
        <Link href="/dashboard" className="inline-link">
          Back to dashboard
        </Link>
      </header>
      <div className="learner-profile-layout">
        <aside className="learner-profile-intro">
          <h2>Start with the learner.</h2>
          <p>
            Saving an education profile does not send an enquiry, hire a teacher
            or activate a student account.
          </p>
          <p>
            Teacher enquiries support early years, school and college. Each match still needs an available teacher whose current reviewed coverage fits the learner.
          </p>
          <p>
            These details are private. Add education information only; do not
            enter identity documents or contact details.
          </p>
        </aside>
        <div className="learner-profile-main">
          {saved && (
            <Alert>
              <AlertDescription>
                <strong>{saved.alias}’s profile is saved.</strong>
                <p>
                  {saved.enquiryEligible
                    ? "You can select this learner when starting a supported tuition enquiry."
                    : "The profile is saved. Complete its education details before starting an enquiry."}
                </p>
                {saved.enquiryEligible && (
                  <Link className="inline-link" href="/onboarding/parent">
                    Start a tuition enquiry
                  </Link>
                )}
                <Link
                  className="inline-link"
                  href={"/dashboard/family?learner=" + saved.id}
                >
                  Manage student access
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {query.isPending && <p role="status">Loading learner profiles…</p>}
          {query.error && (
            <Alert variant="destructive">
              <AlertDescription>
                We couldn’t load the current learner profiles. Your form is
                retained; refresh before creating a profile.
                <Button
                  disabled={locked}
                  variant="outline"
                  onClick={() => query.refetch()}
                >
                  Retry learner profiles
                </Button>
                {cursor && (
                  <Button
                    disabled={locked}
                    variant="ghost"
                    onClick={() => setCursor(null)}
                  >
                    Return to first page
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {query.data && (
            <>
              {query.data.creationStatus !== "READY" && (
                <Alert>
                  <AlertDescription>
                    {gateMessages[query.data.creationStatus]}
                    {["VERIFICATION_REQUIRED", "CONSENT_REQUIRED"].includes(
                      query.data.creationStatus,
                    ) && (
                      <Link href="/onboarding/parent" className="inline-link">
                        Review guardian onboarding
                      </Link>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {(!adding || query.data.items.length > 0) && (
                <section
                  className="care-card"
                  aria-label="Saved learner profiles"
                >
                  <div className="hiring-section-heading">
                    <h2>Saved profiles</h2>
                    {session.account.role === "GUARDIAN" && !adding && (
                      <Button
                        disabled={!ready}
                        onClick={() => {
                          setAdding(true);
                          setSaved(null);
                          setMessage("");
                          requestAnimationFrame(() => heading.current?.focus());
                        }}
                      >
                        Add learner profile
                      </Button>
                    )}
                  </div>
                  {!query.data.items.length ? (
                    <p>No learner profiles saved yet.</p>
                  ) : (
                    <ul className="learner-education-list">
                      {query.data.items.map((p) => (
                        <li key={p.id}>
                          <h3>{p.alias}</h3>
                          <EducationSummary education={p.education} />
                          <p className="care-help">
                            {p.enquiryEligible
                              ? "Education details are ready for an enquiry. Teacher fit and availability still need to be checked."
                              : !p.education.institutionName ||
                                  !p.education.subjects.length
                                ? "Education details are incomplete. Review guardian onboarding before sending an enquiry."
                                : "Complete the education details before requesting a teacher."}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="wizard-actions">
                    {cursor && (
                      <Button
                        variant="outline"
                        disabled={locked || query.isFetching}
                        onClick={() => setCursor(null)}
                      >
                        First page
                      </Button>
                    )}
                    {query.data.nextCursor && (
                      <Button
                        variant="outline"
                        disabled={locked || query.isFetching}
                        onClick={() => setCursor(query.data!.nextCursor)}
                      >
                        Next profiles
                      </Button>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
          {adding && (
            <section className="wizard-card" aria-label="New learner profile">
              <p className="wizard-save-note">
                All fields shown are required. Details stay in this form until
                you confirm the save. Leaving or reloading clears unsaved
                details.
              </p>
              <h2 ref={heading} tabIndex={-1}>
                {review
                  ? "Review the learner profile"
                  : "Add education details"}
              </h2>
              {review ? (
                <>
                  <h3>{review.alias}</h3>
                  <EducationSummary education={review.education} />
                  <p>
                    Your guardian account will manage this profile. Student
                    self-management and optional guardian assistance are being
                    built separately.
                  </p>
                </>
              ) : (
                <form
                  id="learner-education-form"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    prepare();
                  }}
                >
                  <fieldset
                    disabled={locked || !ready}
                    className="learner-education-fields"
                  >
                    <legend className="sr-only">Learner education</legend>
                    {field(
                      "alias",
                      undefined,
                      "Use a familiar name or alias, up to 40 characters.",
                    )}
                    <div className="field">
                      <label htmlFor="education-stage">Education stage</label>
                      <select
                        id="education-stage"
                        value={values.stage}
                        onChange={(e) => {
                          change("stage", e.target.value);
                          setErrors({});
                        }}
                      >
                        <option value="EARLY_YEARS">
                          Early years — Nursery / KG
                        </option>
                        <option value="SCHOOL">School — Classes 1–12</option>
                        <option value="COLLEGE">College / university</option>
                      </select>
                    </div>
                    {values.stage === "EARLY_YEARS" &&
                      field(
                        "level",
                        <select
                          id="education-level"
                          value={values.level}
                          onChange={(e) => change("level", e.target.value)}
                          aria-invalid={!!errors.level}
                          aria-describedby={
                            errors.level ? "education-level-error" : undefined
                          }
                        >
                          <option value="">Choose early years level</option>
                          <option value="NURSERY">Nursery</option>
                          <option value="KG1">KG1</option>
                          <option value="KG2">KG2</option>
                        </select>,
                      )}
                    {values.stage === "SCHOOL" && (
                      <div className="wizard-fields">
                        {field(
                          "grade",
                          <select
                            id="education-grade"
                            value={values.grade}
                            onChange={(e) => change("grade", e.target.value)}
                            aria-invalid={!!errors.grade}
                            aria-describedby={
                              errors.grade ? "education-grade-error" : undefined
                            }
                          >
                            <option value="">Choose class</option>
                            {Array.from({ length: 12 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                Class {i + 1}
                              </option>
                            ))}
                          </select>,
                        )}
                        {field(
                          "board",
                          undefined,
                          "For example CBSE, ICSE, CGBSE or your state board.",
                        )}
                      </div>
                    )}
                    {field("institutionName")}
                    {values.stage === "COLLEGE" && (
                      <>
                        {field("courseName")} {field("university")}{" "}
                        {field("studyYear")}
                      </>
                    )}
                    {field(
                      "subjects",
                      undefined,
                      "Separate subjects with commas, for example English, Maths, Science.",
                    )}
                  </fieldset>
                </form>
              )}
              {message && (
                <Alert variant="destructive">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
              <div className="wizard-actions">
                {review ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => {
                        setReview(null);
                        setMessage("");
                      }}
                    >
                      Edit details
                    </Button>
                    <Button
                      disabled={busy || (!ready && !uncertain)}
                      onClick={save}
                    >
                      {busy
                        ? "Saving profile…"
                        : uncertain
                          ? "Retry profile save"
                          : "Confirm and save profile"}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="submit"
                    form="learner-education-form"
                    disabled={locked || !ready}
                  >
                    Review learner profile
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={locked}
                  onClick={() => {
                    setAdding(false);
                    setReview(null);
                    setMessage("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
function EducationSummary({
  education: e,
}: {
  education: Profile["education"];
}) {
  return (
    <div className="learner-education-summary">
      <p>
        {e.stage === "SCHOOL"
          ? `Class ${e.grade} · ${e.board}`
          : e.stage === "EARLY_YEARS"
            ? e.level === "NURSERY"
              ? "Nursery"
              : e.level === "KG1"
                ? "KG1"
                : "KG2"
            : `${e.courseName || "College"}${e.studyYear ? " · Year " + e.studyYear : ""}`}
      </p>
      {e.institutionName && <p>{e.institutionName}</p>}
      {e.stage === "COLLEGE" && e.university && <p>{e.university}</p>}
      <p>
        {e.subjects.length
          ? "Subjects: " + e.subjects.join(", ")
          : "Subjects not yet recorded."}
      </p>
    </div>
  );
}
