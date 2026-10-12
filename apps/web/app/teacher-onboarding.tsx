"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Check, FileCheck2, GraduationCap } from "lucide-react";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Alert, AlertDescription } from "../components/ui/alert";

type Profile = components["schemas"]["PrivateTeacher"];
type Evidence = components["schemas"]["Evidence"];
const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  headline: z.string().trim().min(1, "Add a teaching headline.").max(120),
  bio: z.string().trim().min(1, "Tell us about your teaching.").max(1500),
  experience: z
    .number()
    .int()
    .min(0, "Enter 0–60 whole years.")
    .max(60, "Enter 0–60 whole years."),
});
const coverageSchema = z
  .object({
    subjects: z
      .array(z.enum(["Maths", "Science"]))
      .min(1, "Choose at least one subject."),
    boards: z
      .array(z.enum(["CBSE", "CGBSE"]))
      .min(1, "Choose at least one board."),
    grades: z
      .array(z.number().int().min(6).max(10))
      .min(1, "Choose at least one class."),
    languages: z
      .array(z.enum(["English", "Hindi"]))
      .min(1, "Choose at least one language."),
    modes: z
      .array(z.enum(["ONLINE", "HOME"]))
      .min(1, "Choose at least one lesson format."),
    localities: z.array(z.string().trim().min(1).max(80)).max(20),
    monthlyPaise: z
      .number()
      .int()
      .min(50000, "Enter ₹500–₹20,000, with up to two decimal places.")
      .max(2000000, "Enter ₹500–₹20,000, with up to two decimal places."),
    consultationOptIn: z.boolean(),
  })
  .refine((v) => !v.modes.includes("HOME") || v.localities.length > 0, {
    path: ["localities"],
    message: "Choose at least one locality for home tuition.",
  });
type Application = z.infer<typeof profileSchema> &
  z.infer<typeof coverageSchema> & { feeTermsAccepted?: true };
type Progress = {
  kind: string;
  state: string;
  draft: Partial<Application>;
  version: number;
  completedResourceId: string | null;
};
const steps = ["Your teaching", "Coverage & tuition", "Review application"];
const localities = [
  "Shankar Nagar",
  "Avanti Vihar",
  "Telibandha",
  "Civil Lines",
  "Mowa",
];
const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
function Message({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
    >
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
function unknownResult(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    error.code === "INVALID_RESPONSE" ||
    error.status >= 500
  );
}
export function TeacherSetup({
  session,
  onSessionChange,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
}) {
  const [reload, setReload] = useState(0);
  const [refreshError, setRefreshError] = useState("");
  const progress = useQuery({
    queryKey: ["teacher-onboarding", session.account.id],
    queryFn: () => api<Progress>("/onboarding/teacher"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const owner = useQuery({
    queryKey: ["teacher-setup-profile", session.account.id],
    queryFn: () => api<{ profile: Profile | null }>("/dashboard"),
    enabled: session.account.role === "TEACHER",
    retry: false,
    refetchOnWindowFocus: false,
  });
  const client = useQueryClient();
  async function refreshSession() {
    try {
      setRefreshError("");
      const next = await api<Session>("/auth/session");
      client.clear();
      onSessionChange(next);
    } catch (error) {
      setRefreshError((error as Error).message);
    }
  }
  if (
    progress.isPending ||
    (session.account.role === "TEACHER" && owner.isPending)
  )
    return (
      <main className="container section">
        <p role="status">Loading your teacher workspace…</p>
      </main>
    );
  if (progress.error || owner.error)
    return (
      <main className="container narrow section">
        <Message error>{(progress.error || owner.error)?.message}</Message>
        <Button
          className="button"
          onClick={() => {
            progress.refetch();
            if (session.account.role === "TEACHER") owner.refetch();
          }}
        >
          Try again
        </Button>
      </main>
    );
  if (session.account.role === "TEACHER" && owner.data?.profile)
    return (
      <TeacherWorkspace
        key={`${session.account.id}:${reload}`}
        session={session}
        profile={owner.data.profile}
        onReload={async () => {
          const result = await owner.refetch();
          if (!result.error) setReload((v) => v + 1);
        }}
      />
    );
  if (progress.data?.completedResourceId)
    return (
      <main className="container narrow section wizard-success">
        <FileCheck2 size={40} />
        <h1>Your application is saved.</h1>
        <p>
          Open your teacher workspace to add private evidence and check your
          review status.
        </p>
        {refreshError && <Message error>{refreshError}</Message>}
        <Button className="button" onClick={refreshSession}>
          Open teacher workspace
        </Button>
      </main>
    );
  if (session.account.role === "TEACHER")
    return (
      <main className="container narrow section">
        <Message error>
          Your teacher profile could not be found. Contact support before
          creating another application.
        </Message>
        <Link href="/support" className="inline-link">
          Contact support
        </Link>
      </main>
    );
  return (
    <ApplicationWizard
      key={`${session.account.id}:${reload}`}
      session={session}
      initial={progress.data!}
      onDone={refreshSession}
      onReload={async () => {
        const result = await progress.refetch();
        if (!result.error) setReload((v) => v + 1);
      }}
    />
  );
}
function ApplicationWizard({
  session,
  initial,
  profile,
  onDone,
  onReload,
  onCancel,
}: {
  session: Session;
  initial?: Progress;
  profile?: Profile;
  onDone: () => Promise<void>;
  onReload: () => Promise<void>;
  onCancel?: () => void;
}) {
  const draft = (profile || initial?.draft || {}) as Partial<Application>;
  const [values, setValues] = useState<Partial<Application>>({
    name: session.account.name,
    experience: 0,
    consultationOptIn: false,
    ...draft,
  });
  const [price, setPrice] = useState(
    draft.monthlyPaise !== undefined ? String(draft.monthlyPaise / 100) : "",
  );
  const [years, setYears] = useState(String(draft.experience ?? 0));
  const [step, setStep] = useState(0),
    [version, setVersion] = useState(initial?.version || 0);
  const [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [complete, setComplete] = useState(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const submission = useRef<{ path: string; body: unknown } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, complete]);
  const locked = busy || uncertain || conflict;
  function change(key: keyof Application, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
    setErrors((e) => ({ ...e, [key]: "" }));
  }
  function data(): Partial<Application> {
    const result: Partial<Application> = {
      name: values.name?.trim(),
      headline: values.headline?.trim(),
      bio: values.bio?.trim(),
      experience: years.trim() ? Number(years) : NaN,
    };
    if (step > 0)
      Object.assign(result, {
        subjects: values.subjects || [],
        boards: values.boards || [],
        grades: values.grades || [],
        languages: values.languages || [],
        modes: values.modes || [],
        localities: values.modes?.includes("HOME")
          ? values.localities || []
          : [],
        monthlyPaise: /^\d+(?:\.\d{1,2})?$/.test(price)
          ? Math.round(Number(price) * 100)
          : NaN,
        consultationOptIn: !!values.consultationOptIn,
      });
    if (terms) result.feeTermsAccepted = true;
    return result;
  }
  function validate(all = false) {
    const payload = data();
    const result = (
      all
        ? profileSchema.and(coverageSchema)
        : step === 0
          ? profileSchema
          : coverageSchema
    ).safeParse(payload);
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(".wizard-card [aria-invalid='true']")
          ?.focus(),
      );
      return false;
    }
    if (all && !terms) {
      setErrors({
        terms:
          "Accept the stated fee terms and account changes before submitting.",
      });
      return false;
    }
    setErrors({});
    return true;
  }
  async function post<T>(path: string, body: unknown): Promise<T> {
    const signature = JSON.stringify([path, body]);
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    return api<T>(path, {
      method: "POST",
      body,
      key: retry.current.key,
      csrf: session.csrfToken,
      signal: AbortSignal.timeout(15000),
    });
  }
  async function advance() {
    if (!validate()) return;
    setBusy(true);
    setError("");
    try {
      if (!profile) {
        // Keep valid coverage from a resumed draft when saving profile edits.
        const result = await post<Progress>("/onboarding/teacher/drafts", {
          expectedVersion: version,
          draft: {
            ...initial?.draft,
            ...values,
            ...data(),
            feeTermsAccepted: undefined,
          },
        });
        setVersion(result.version);
        setSaved(true);
      }
      setStep((s) => s + 1);
    } catch (e) {
      setError(
        unknownResult(e)
          ? "We couldn’t confirm the save. Your changes are here; retry before leaving."
          : (e as Error).message,
      );
      setUncertain(unknownResult(e));
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!uncertain && !validate(true)) return;
    setBusy(true);
    setError("");
    try {
      if (!submission.current) {
        if (profile)
          submission.current = {
            path: `/teacher-applications/${profile.id}/revisions`,
            body: { ...data(), expectedVersion: profile.version },
          };
        else {
          const result = await post<Progress>("/onboarding/teacher/drafts", {
            expectedVersion: version,
            draft: data(),
          });
          setVersion(result.version);
          submission.current = {
            path: "/onboarding/teacher/completions",
            body: { expectedVersion: result.version },
          };
        }
      }
      const result = await post<Profile | Progress>(
        submission.current.path,
        submission.current.body,
      );
      if (
        ("completedResourceId" in result && !result.completedResourceId) ||
        ("id" in result && !result.id)
      )
        throw new Error("The result was not confirmed.");
      setComplete(true);
      setUncertain(false);
      await onDone();
    } catch (e) {
      if (!unknownResult(e)) submission.current = null;
      setError(
        unknownResult(e)
          ? "We couldn’t confirm the result. Retry the same submission before making edits."
          : (e as Error).message,
      );
      setUncertain(unknownResult(e));
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: keyof Application,
    label: string,
    control: ReactNode,
    hint?: string,
  ) => (
    <div className="field">
      <label htmlFor={`teacher-${key}`}>{label}</label>
      {control}
      {errors[key] ? (
        <small className="field-error" id={`teacher-${key}-error`} role="alert">
          {errors[key]}
        </small>
      ) : (
        hint && <small className="wizard-help">{hint}</small>
      )}
    </div>
  );
  const a11y = (key: string) => ({
    id: `teacher-${key}`,
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? `teacher-${key}-error` : undefined,
  });
  function choices<
    K extends
      | "subjects"
      | "boards"
      | "grades"
      | "languages"
      | "modes"
      | "localities",
  >(
    key: K,
    label: string,
    options: (string | number)[],
    labels?: Record<string, string>,
  ) {
    const selected = (values[key] || []) as (string | number)[];
    return (
      <fieldset className="teacher-choice-group">
        <legend>{label}</legend>
        <div className="teacher-choices">
          {options.map((option) => (
            <label className="teacher-choice" key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                aria-invalid={!!errors[key]}
                aria-describedby={
                  errors[key] ? `teacher-${key}-error` : undefined
                }
                onChange={(e) =>
                  change(
                    key,
                    e.target.checked
                      ? [...selected, option]
                      : selected.filter((v) => v !== option),
                  )
                }
              />
              <span>{labels?.[String(option)] || option}</span>
            </label>
          ))}
        </div>
        {errors[key] && (
          <small
            id={`teacher-${key}-error`}
            className="field-error"
            role="alert"
          >
            {errors[key]}
          </small>
        )}
      </fieldset>
    );
  }
  if (complete)
    return (
      <main className="container narrow section wizard-success">
        <FileCheck2 size={40} />
        <h1>Your application is saved.</h1>
        <p>
          It is submitted for review. Private evidence and current screening
          checks are still required.
        </p>
        <Button className="button" onClick={onDone}>
          Open teacher workspace
        </Button>
      </main>
    );
  return (
    <main className="container section">
      <div className="wizard-title">
        <h1>
          {profile
            ? "Update your teaching application."
            : "Bring your kind of teaching."}
        </h1>
        <p>
          A focused application, followed by private evidence and an independent
          review.
        </p>
      </div>
      <div className="wizard-layout">
        <aside className="wizard-aside">
          <ol className="wizard-steps" aria-label="Application progress">
            {steps.map((s, i) => (
              <li
                key={s}
                className={i === step ? "current" : i < step ? "complete" : ""}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="wizard-step-number">
                  {i < step ? <Check size={16} /> : i + 1}
                </span>
                <span className="wizard-step-name">{s}</span>
              </li>
            ))}
          </ol>
          <div className="wizard-discovery">
            <GraduationCap size={24} />
            <strong>For the Raipur pilot</strong>
            <p>
              Maths and Science, classes 6–10. Select only the subjects, boards
              and languages you teach confidently.
            </p>
            <p>
              Your application stays private until approved and eligible for
              discovery.
            </p>
          </div>
        </aside>
        <form
          className="wizard-card"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 2) advance();
            else submit();
          }}
        >
          <div className="wizard-topline">
            <span>Step {step + 1} of 3</span>
            <span role="status">
              {profile
                ? "Changes saved on resubmission"
                : saved
                  ? "Progress saved"
                  : "Saved when you continue"}
            </span>
          </div>
          <h2 ref={heading} tabIndex={-1}>
            {steps[step]}
          </h2>
          <fieldset disabled={locked} className="wizard-fields">
            {step === 0 && (
              <>
                {field(
                  "name",
                  "Your name",
                  <Input
                    {...a11y("name")}
                    value={values.name || ""}
                    autoComplete="name"
                    maxLength={80}
                    onChange={(e) => change("name", e.target.value)}
                  />,
                )}
                {field(
                  "headline",
                  "Teaching headline",
                  <Input
                    {...a11y("headline")}
                    value={values.headline || ""}
                    maxLength={120}
                    onChange={(e) => change("headline", e.target.value)}
                  />,
                  "A short introduction families will see on your approved profile.",
                )}
                {field(
                  "bio",
                  "About your teaching",
                  <Textarea
                    {...a11y("bio")}
                    rows={5}
                    maxLength={1500}
                    value={values.bio || ""}
                    onChange={(e) => change("bio", e.target.value)}
                  />,
                )}
                {field(
                  "experience",
                  "Years of teaching experience",
                  <Input
                    {...a11y("experience")}
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={years}
                    onChange={(e) => {
                      setYears(e.target.value);
                      setSaved(false);
                    }}
                  />,
                  "Enter whole years; 0 is welcome if you are starting out.",
                )}
              </>
            )}
            {step === 1 && (
              <>
                {choices("subjects", "Subjects", ["Maths", "Science"])}
                {choices("boards", "School boards", ["CBSE", "CGBSE"])}
                {choices(
                  "grades",
                  "Classes",
                  [6, 7, 8, 9, 10],
                  Object.fromEntries(
                    [6, 7, 8, 9, 10].map((g) => [g, `Class ${g}`]),
                  ),
                )}
                {choices("languages", "Teaching languages", [
                  "English",
                  "Hindi",
                ])}
                {choices("modes", "Lesson formats", ["ONLINE", "HOME"], {
                  ONLINE: "Online",
                  HOME: "At home",
                })}
                {values.modes?.includes("HOME") &&
                  choices("localities", "Home tuition localities", [
                    ...new Set([...localities, ...(values.localities || [])]),
                  ])}
                {field(
                  "monthlyPaise",
                  "Monthly tuition (₹)",
                  <Input
                    {...a11y("monthlyPaise")}
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      setSaved(false);
                    }}
                  />,
                  "₹500–₹20,000. This is your proposed tuition, not a payment collected now.",
                )}
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={!!values.consultationOptIn}
                    onChange={(e) =>
                      change("consultationOptIn", e.target.checked)
                    }
                  />
                  <span>
                    I’m interested in Parent Pro consultations. This records my
                    preference; calling is currently unavailable.
                  </span>
                </label>
              </>
            )}
            {step === 2 && (
              <div className="wizard-review">
                {[
                  [
                    "Your teaching",
                    `${values.name} · ${years} years`,
                    `${values.headline}\n${values.bio}`,
                  ],
                  [
                    "Coverage & tuition",
                    `${values.subjects?.join(", ")} · ${values.boards?.join(", ")} · Classes ${values.grades?.join(", ")}`,
                    `${values.languages?.join(", ")} · ${values.modes?.map((m) => (m === "HOME" ? "At home" : "Online")).join(", ")}\n${values.modes?.includes("HOME") ? values.localities?.join(", ") + "\n" : ""}${money(Math.round(Number(price) * 100))} per month\nConsultation interest: ${values.consultationOptIn ? "Yes" : "No"}`,
                  ],
                ].map(([title, line, detail], i) => (
                  <div className="wizard-review-row" key={title}>
                    <div>
                      <h3>{title}</h3>
                      <p>{line}</p>
                      <p className="teacher-review-detail">{detail}</p>
                    </div>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => setStep(i)}
                    >
                      Edit {i === 0 ? "teaching profile" : "coverage"}
                    </Button>
                  </div>
                ))}
                <Message>
                  {profile
                    ? "Resubmitting reopens screening, hides your profile from discovery and revokes existing private-note sharing. Accepted bookings are not cancelled."
                    : "Submitting changes this account to a teacher account. To retain a separate guardian workspace, apply using a different email account."}
                </Message>
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    aria-invalid={!!errors.terms}
                    aria-describedby={
                      errors.terms ? "teacher-terms-error" : undefined
                    }
                  />
                  <span>
                    I acknowledge these account changes and the proposed pilot
                    placement fee: 25% of first monthly tuition, capped at
                    ₹1,500, after independently confirmed start and receipt.
                    Final terms require review.
                  </span>
                </label>
                {errors.terms && (
                  <small
                    id="teacher-terms-error"
                    className="field-error"
                    role="alert"
                  >
                    {errors.terms}
                  </small>
                )}
                <p className="wizard-help">
                  Next: upload private evidence for identity, qualifications,
                  teaching capability and references. Submission does not
                  approve your profile.
                </p>
              </div>
            )}
          </fieldset>
          {error && <Message error>{error}</Message>}
          {conflict && (
            <Button type="button" variant="outline" onClick={onReload}>
              Reload saved application
            </Button>
          )}
          <div className="wizard-actions">
            {step > 0 && (
              <Button
                variant="outline"
                type="button"
                className="button secondary"
                disabled={locked}
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
            )}
            {onCancel && (
              <Button
                variant="ghost"
                type="button"
                disabled={locked}
                onClick={onCancel}
              >
                Cancel changes
              </Button>
            )}
            <Button
              type="submit"
              className="button"
              disabled={busy || conflict || (uncertain && step < 2)}
            >
              {busy
                ? "Saving…"
                : step === 0
                  ? "Continue to coverage"
                  : step === 1
                    ? "Review application"
                    : profile
                      ? "Resubmit for review"
                      : "Submit teacher application"}
            </Button>
            {uncertain && step < 2 && (
              <Button
                type="button"
                className="button"
                disabled={busy}
                onClick={async () => {
                  setUncertain(false);
                  await advance();
                }}
              >
                Retry saving progress
              </Button>
            )}
          </div>
          {profile && (
            <p className="wizard-save-note">
              Keep this page open until resubmission. Existing application edits
              are saved when you resubmit.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
function TeacherWorkspace({
  session,
  profile,
  onReload,
}: {
  session: Session;
  profile: Profile;
  onReload: () => Promise<void>;
}) {
  const [edit, setEdit] = useState(false);
  const evidence = useQuery({
    queryKey: ["teacher-evidence", profile.id],
    queryFn: () =>
      api<{ items: Evidence[] }>(`/teachers/${profile.id}/evidence`),
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (edit)
    return (
      <ApplicationWizard
        session={session}
        profile={profile}
        onCancel={() => setEdit(false)}
        onDone={async () => {
          await onReload();
          setEdit(false);
        }}
        onReload={onReload}
      />
    );
  const status = {
    SUBMITTED: "Submitted for review",
    CHANGES_REQUESTED: "Changes requested",
    APPROVED: "Approved",
    SUSPENDED: "Suspended",
  }[profile.status];
  return (
    <main className="container section">
      <div className="wizard-title">
        <h1>Your teacher workspace.</h1>
        <p>Manage your application and private screening evidence.</p>
      </div>
      <div className="wizard-layout">
        <aside className="wizard-aside">
          <div className="wizard-discovery">
            <GraduationCap size={24} />
            <strong>{profile.name}</strong>
            <p>{profile.headline}</p>
            <p>
              {profile.subjects.join(", ")} · {money(profile.monthlyPaise)} per
              month
            </p>
            <Link href="/dashboard" className="inline-link">
              Open teacher dashboard
            </Link>
          </div>
        </aside>
        <div className="teacher-workspace">
          <section className="wizard-card">
            <h2>Application status</h2>
            <p className="badge">{status}</p>
            <p>
              {profile.status === "APPROVED"
                ? "Your application is approved. Discovery also depends on current screening and availability."
                : profile.status === "CHANGES_REQUESTED"
                  ? "Your reviewer requested changes. Contact support for clarification, then update your application or evidence."
                  : profile.status === "SUSPENDED"
                    ? "Your profile is suspended. Contact support for the next steps."
                    : "Your profile stays private while identity, qualification, capability and reference checks are reviewed."}
            </p>
            <div className="wizard-actions">
              <Button
                variant="outline"
                className="button secondary"
                onClick={onReload}
              >
                Refresh review status
              </Button>
              <Button variant="ghost" onClick={() => setEdit(true)}>
                Edit application
              </Button>
              <Link href="/support" className="inline-link">
                Contact support
              </Link>
            </div>
          </section>
          <section className="wizard-card">
            <h2>Private screening evidence</h2>
            <p>
              Upload only documents needed for your checks. Files are stored
              privately and must pass a safety scan before they can be
              downloaded. A clean scan does not mean your application is
              approved.
            </p>
            <EvidenceUpload
              session={session}
              profile={profile}
              onUploaded={async () => {
                await evidence.refetch();
              }}
            />
            {evidence.isPending ? (
              <p role="status">Loading evidence…</p>
            ) : evidence.error ? (
              <>
                <Message error>{evidence.error.message}</Message>
                <Button variant="outline" onClick={() => evidence.refetch()}>
                  Retry evidence list
                </Button>
              </>
            ) : evidence.data?.items.length ? (
              <ul className="teacher-evidence-list">
                {evidence.data.items.map((file) => (
                  <li key={file.id}>
                    <div>
                      <strong>
                        {file.kind.toLowerCase().replaceAll("_", " ")}
                      </strong>
                      <p>
                        {Math.ceil(file.size / 1024)} KB ·{" "}
                        {new Date(file.uploadedAt).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <span>
                        {file.status === "CLEAN"
                          ? "Safety scan complete"
                          : file.status === "QUARANTINED"
                            ? "Awaiting safety scan"
                            : file.status === "INFECTED"
                              ? "Blocked by safety scan"
                              : "Deleted"}
                      </span>
                      {file.status === "CLEAN" && (
                        <a
                          className="inline-link"
                          href={`/api/v1/evidence/${file.id}/content`}
                        >
                          Download private file
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="wizard-help">
                No evidence uploaded yet. Start with the documents for your
                identity check.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
function EvidenceUpload({
  session,
  profile,
  onUploaded,
}: {
  session: Session;
  profile: Profile;
  onUploaded: () => Promise<void>;
}) {
  const [kind, setKind] = useState("IDENTITY"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const pending = useRef<{ body: unknown; key: string } | null>(null),
    input = useRef<HTMLInputElement>(null);
  const allowed =
    profile.status === "SUBMITTED" || profile.status === "CHANGES_REQUESTED";
  async function upload() {
    setError("");
    setSaved(false);
    if (!file) {
      setError("Choose a PDF, PNG or JPEG to upload.");
      input.current?.focus();
      return;
    }
    if (
      !["application/pdf", "image/png", "image/jpeg"].includes(file.type) ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a nonempty PDF, PNG or JPEG of at most 5 MiB.");
      return;
    }
    setBusy(true);
    try {
      if (!pending.current) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () =>
            reject(new Error("The file could not be read. Choose it again."));
          reader.readAsDataURL(file);
        });
        pending.current = {
          body: {
            kind,
            mediaType: file.type,
            contentBase64: base64,
            expectedVersion: profile.version,
          },
          key: crypto.randomUUID(),
        };
      }
      await api<Evidence>(`/teachers/${profile.id}/evidence`, {
        method: "POST",
        csrf: session.csrfToken,
        body: pending.current.body,
        key: pending.current.key,
        signal: AbortSignal.timeout(20000),
      });
      pending.current = null;
      setFile(null);
      if (input.current) input.current.value = "";
      setUncertain(false);
      setSaved(true);
      await onUploaded();
    } catch (e) {
      const unknown = !!pending.current && unknownResult(e);
      setUncertain(unknown);
      if (!unknown) pending.current = null;
      setError(
        unknown
          ? "We couldn’t confirm this upload. Retry the same file before choosing another."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <Message>
        Uploads are available while an application is submitted or changes are
        requested. To change an approved profile, resubmit your application for
        a new review.
      </Message>
    );
  return (
    <form
      className="wizard-fields teacher-upload"
      onSubmit={(e) => {
        e.preventDefault();
        upload();
      }}
    >
      <fieldset disabled={busy || uncertain} className="wizard-fields">
        <div className="field">
          <label htmlFor="evidence-kind">Check category</label>
          <select
            id="evidence-kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              pending.current = null;
            }}
          >
            {["IDENTITY", "QUALIFICATIONS", "CAPABILITY", "REFERENCES"].map(
              (k) => (
                <option key={k} value={k}>
                  {k === "CAPABILITY"
                    ? "Teaching capability"
                    : k.charAt(0) + k.slice(1).toLowerCase()}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="field">
          <label htmlFor="evidence-file">Private evidence file</label>
          <Input
            id="evidence-file"
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              pending.current = null;
              setError("");
              setSaved(false);
            }}
            aria-describedby="evidence-help"
          />
          <small id="evidence-help" className="wizard-help">
            PDF, PNG or JPEG, up to 5 MiB. Files remain private.
          </small>
        </div>
      </fieldset>
      {error && <Message error>{error}</Message>}
      {saved && (
        <Message>
          Private evidence uploaded. Check its safety-scan status below.
        </Message>
      )}
      <Button className="button" type="submit" disabled={busy}>
        {busy
          ? "Uploading…"
          : uncertain
            ? "Retry private upload"
            : "Upload private evidence"}
      </Button>
    </form>
  );
}
