"use client";
import { useHistory, HistoryPages } from "./history";
import {
  OnboardingReadBoundary,
  onboardingAccessDenied,
} from "./onboarding-read-boundary";
import { useAppTranslation } from "./locale";
import {
  TeachingCoverageEditor,
  coverageGroups,
  expandedCoverage,
  flatCoverage,
  coverageText,
  type TeachingScope,
} from "./teaching-coverage";
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

import {
  TeacherDetailsSummary,
  TeacherDetailsForm,
  detailsErrors,
  emptyDetails,
  milestones,
  type TeacherDetails,
} from "./teacher-details-form";
import { TeacherSchedule } from "./teacher-schedule";

type Profile = components["schemas"]["PrivateTeacher"];
type RevisionProgress = components["schemas"]["TeacherRevisionProgress"];
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
    teachingCoverage: z
      .array(z.custom<TeachingScope>())
      .min(1, "Declare at least one teaching area."),
    subjects: z.array(z.string().min(1).max(60)).min(1).max(40),
    boards: z.array(z.string().min(1).max(80)).max(20),
    grades: z.array(z.number().int().min(1).max(12)).max(12),
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
    lockInDays: z.union([z.literal(0), z.literal(15), z.literal(30)], {
      error: "Choose no lock-in, 15 days or 30 days.",
    }),
    demoOptIn: z.boolean({
      error: "Choose whether you offer an optional demo.",
    }),
  })
  .refine((v) => !v.modes.includes("HOME") || v.localities.length > 0, {
    path: ["localities"],
    message: "Choose at least one locality for home tuition.",
  });
type Application = z.infer<typeof profileSchema> &
  z.infer<typeof coverageSchema> &
  TeacherDetails & { feeTermsAccepted?: true };
type Progress = {
  kind: string;
  state: string;
  draft: Partial<Application>;
  version: number;
  completedResourceId: string | null;
};
const steps = [
  "Your teaching",
  "Private address",
  "Education & previous work",
  "Teaching preferences",
  "Review application",
];
const localities = [
  "Shankar Nagar",
  "Avanti Vihar",
  "Telibandha",
  "Civil Lines",
  "Mowa",
];
const money = (paise: number, locale = "en-IN") =>
  new Intl.NumberFormat(locale, {
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
    >
      <AlertDescription>
        {error ? appError(children) : appText(children)}
      </AlertDescription>
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const [reload, setReload] = useState(0);
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const progress = useQuery({
    queryKey: ["teacher-onboarding", session.account.id],
    queryFn: ({ signal }) => api<Progress>("/onboarding/teacher", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const owner = useQuery({
    queryKey: ["teacher-setup-profile", session.account.id],
    queryFn: ({ signal }) =>
      api<{ profile: Profile | null }>("/dashboard", { signal }),
    enabled: session.account.role === "TEACHER",
    retry: false,
    refetchOnWindowFocus: false,
  });
  const client = useQueryClient();
  async function refreshSession() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      setRefreshError("");
      const next = await api<Session>("/auth/session");
      client.clear();
      onSessionChange(next);
    } catch (error) {
      setRefreshError(
        "Your application is saved, but we couldn’t open your teacher workspace. Try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  if (
    progress.isPending ||
    (session.account.role === "TEACHER" && owner.isPending)
  )
    return (
      <main className="container section">
        <p role="status">{appText("Loading your teacher workspace…")}</p>
      </main>
    );
  const readError =
    [progress.error, owner.error].find(onboardingAccessDenied) ||
    progress.error ||
    owner.error;
  const checking =
    progress.isFetching ||
    (session.account.role === "TEACHER" && owner.isFetching);
  function retrySetup() {
    void progress.refetch();
    if (session.account.role === "TEACHER") void owner.refetch();
  }
  if (
    readError &&
    (!progress.data ||
      (session.account.role === "TEACHER" && !owner.data) ||
      onboardingAccessDenied(readError))
  )
    return (
      <main className="container narrow section">
        <Message error>
          {appText(
            "We couldn’t load your saved setup. Check your account permissions and try again.",
          )}
        </Message>
        <Button className="button" disabled={checking} onClick={retrySetup}>
          {appText("Try again")}{" "}
        </Button>
      </main>
    );
  if (session.account.role === "TEACHER" && owner.data?.profile)
    return (
      <OnboardingReadBoundary
        error={readError}
        busy={checking}
        onRetry={retrySetup}
      >
        <TeacherWorkspace
          key={`${session.account.id}:${reload}`}
          session={session}
          profile={owner.data.profile}
          onReload={async () => {
            const result = await owner.refetch();
            if (!result.error) setReload((v) => v + 1);
          }}
        />
      </OnboardingReadBoundary>
    );
  if (progress.data?.completedResourceId)
    return (
      <main className="container narrow section wizard-success">
        <FileCheck2 size={40} />
        <h1>{appText("Your application is saved.")}</h1>
        <p>
          {appText(
            "Open your teacher workspace to add private evidence and check your review status.",
          )}{" "}
        </p>
        {refreshError && <Message error>{appError(refreshError)}</Message>}
        <Button
          className="button"
          disabled={refreshing}
          onClick={refreshSession}
        >
          {appText("Open teacher workspace")}{" "}
        </Button>
      </main>
    );
  if (session.account.role === "TEACHER")
    return (
      <main className="container narrow section">
        <Message error>
          {appText(
            "Your teacher profile could not be found. Contact support before creating another application.",
          )}{" "}
        </Message>
        <Link href="/support" className="inline-link">
          {appText("Contact support")}{" "}
        </Link>
      </main>
    );
  return (
    <OnboardingReadBoundary
      error={readError}
      busy={checking}
      onRetry={retrySetup}
    >
      <ApplicationWizard
        key={`${session.account.id}:${reload}`}
        session={session}
        initial={progress.data!}
        onDone={refreshSession}
        completionError={refreshError}
        opening={refreshing}
        onReload={async () => {
          const result = await progress.refetch();
          if (!result.error) setReload((v) => v + 1);
        }}
      />
    </OnboardingReadBoundary>
  );
}
function ApplicationWizard({
  session,
  initial,
  profile,
  onDone,
  onReload,
  onCancel,
  completionError = "",
  opening = false,
}: {
  session: Session;
  completionError?: string;
  opening?: boolean;
  initial?: Progress;
  profile?: Profile;
  onDone: () => Promise<void>;
  onReload: () => Promise<void>;
  onCancel?: () => void;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const draft = { ...profile, ...initial?.draft } as Partial<Application>;
  const [values, setValues] = useState<Partial<Application>>({
    name: session.account.name,
    experience: 0,
    consultationOptIn: false,
    ...draft,
    address: draft.address || emptyDetails.address,
    education: draft.education || emptyDetails.education,
    employment: draft.employment || [],
    lockInDays: draft.lockInDays ?? undefined,
    demoOptIn:
      typeof draft.demoOptIn === "boolean" ? draft.demoOptIn : undefined,
  });
  const [teachingGroups, setTeachingGroups] = useState(() =>
    coverageGroups(draft),
  );
  const expanded = expandedCoverage(teachingGroups);
  const [price, setPrice] = useState(
    draft.monthlyPaise !== undefined ? String(draft.monthlyPaise / 100) : "",
  );
  const [savedDraft, setSavedDraft] = useState(initial?.draft || {});
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
    setErrors((e) =>
      Object.fromEntries(
        Object.entries(e).filter(
          ([field]) => field !== key && !field.startsWith(key + "."),
        ),
      ),
    );
  }
  function data(): Partial<Application> {
    const result: Partial<Application> = {
      name: values.name?.trim(),
      headline: values.headline?.trim(),
      bio: values.bio?.trim(),
      experience: years.trim() ? Number(years) : NaN,
    };
    if (step >= 1) result.address = values.address;
    if (step >= 2) {
      result.education = values.education?.map((row) =>
        row.status === "COMPLETED"
          ? {
              ...row,
              percentage:
                row.grading === "PERCENTAGE"
                  ? row.score
                  : row.grading === "MARKS" && row.score !== null && row.outOf
                    ? Math.round((row.score / row.outOf) * 10000) / 100
                    : row.percentage,
            }
          : {
              ...row,
              grading: null,
              score: null,
              outOf: null,
              percentage: null,
            },
      );
      result.employment = values.employment || [];
    }
    if (step >= 3)
      Object.assign(result, {
        teachingCoverage: expanded.scopes,
        ...flatCoverage(expanded.scopes),
        languages: values.languages || [],
        modes: values.modes || [],
        localities: values.modes?.includes("HOME")
          ? values.localities || []
          : [],
        monthlyPaise: /^\d+(?:\.\d{1,2})?$/.test(price)
          ? Math.round(Number(price) * 100)
          : NaN,
        consultationOptIn: !!values.consultationOptIn,
        demoOptIn: values.demoOptIn,
        lockInDays: values.lockInDays,
      });
    if (terms) result.feeTermsAccepted = true;
    return result;
  }
  function validate(all = false) {
    if ((all || step === 3) && expanded.error) {
      setErrors({ teachingCoverage: expanded.error });
      requestAnimationFrame(() =>
        document.getElementById("coverage-subjects-0")?.focus(),
      );
      return false;
    }
    const payload = data();
    const detailIssues = all
      ? {
          ...detailsErrors(values, "address"),
          ...detailsErrors(values, "education"),
        }
      : step === 1
        ? detailsErrors(values, "address")
        : step === 2
          ? detailsErrors(values, "education")
          : {};
    if (Object.keys(detailIssues).length) {
      setErrors(detailIssues);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(".wizard-card [aria-invalid='true']")
          ?.focus(),
      );
      return false;
    }
    const result = (
      all
        ? profileSchema.and(coverageSchema)
        : step < 3
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
      {
        // Preserve later steps when saving an earlier step of a resumed draft.
        const result = await post<Progress | RevisionProgress>(
          profile
            ? `/teacher-applications/${profile.id}/revision-drafts`
            : "/onboarding/teacher/drafts",
          {
            expectedVersion: version,
            ...(profile ? { expectedApplicationVersion: profile.version } : {}),
            draft: {
              ...savedDraft,
              ...data(),
              feeTermsAccepted: undefined,
            },
          },
        );
        setVersion(result.version);
        setSavedDraft({
          ...savedDraft,
          ...data(),
          feeTermsAccepted: undefined,
        });
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
        if (profile) {
          const { feeTermsAccepted, ...draft } = data();
          const result = await post<RevisionProgress>(
            `/teacher-applications/${profile.id}/revision-drafts`,
            {
              expectedVersion: version,
              expectedApplicationVersion: profile.version,
              draft,
            },
          );
          setVersion(result.version);
          submission.current = {
            path: `/teacher-applications/${profile.id}/revision-draft-submissions`,
            body: {
              expectedVersion: result.version,
              expectedApplicationVersion: profile.version,
              feeTermsAccepted: true,
            },
          };
        } else {
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
      <label htmlFor={`teacher-${key}`}>{appText(label)}</label>
      {control}
      {errors[key] ? (
        <small className="field-error" id={`teacher-${key}-error`} role="alert">
          {appError(errors[key])}
        </small>
      ) : (
        hint && <small className="wizard-help">{appText(hint)}</small>
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
        <legend>{appText(label)}</legend>
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
              <span>{appText(labels?.[String(option)] || option)}</span>
            </label>
          ))}
        </div>
        {errors[key] && (
          <small
            id={`teacher-${key}-error`}
            className="field-error"
            role="alert"
          >
            {appError(errors[key])}
          </small>
        )}
      </fieldset>
    );
  }
  if (complete)
    return (
      <main className="container narrow section wizard-success">
        <FileCheck2 size={40} />
        <h1>{appText("Your application is saved.")}</h1>
        <p>
          {appText(
            "It is submitted for review. Private evidence and current screening checks are still required.",
          )}{" "}
        </p>
        {completionError && <Message error>{appText(completionError)}</Message>}
        <Button className="button" disabled={opening} onClick={onDone}>
          {appText("Open teacher workspace")}{" "}
        </Button>
      </main>
    );
  return (
    <main className="container section">
      <div className="wizard-title">
        <h1>
          {profile
            ? appText("Update your teaching application.")
            : appText("Bring your kind of teaching.")}
        </h1>
        <p>
          {appText(
            "A focused application, followed by private evidence and an independent review.",
          )}{" "}
        </p>
      </div>
      <div className="wizard-layout">
        <aside className="wizard-aside">
          <ol
            className="wizard-steps"
            aria-label={appText("Application progress")}
          >
            {steps.map((s, i) => (
              <li
                key={s}
                className={i === step ? "current" : i < step ? "complete" : ""}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="wizard-step-number">
                  {i < step ? <Check size={16} /> : i + 1}
                </span>
                <span className="wizard-step-name">{appText(s)}</span>
              </li>
            ))}
          </ol>
          <div className="wizard-discovery">
            <GraduationCap size={24} />
            <strong>{appText("For the Raipur pilot")}</strong>
            <p>
              {appText(
                "Early years, school and college. Select only the subjects and curricula and languages you teach confidently.",
              )}{" "}
            </p>
            <p>
              {appText(
                "Your application stays private until approved and eligible for discovery.",
              )}{" "}
            </p>
          </div>
        </aside>
        <form
          className="wizard-card"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 4) advance();
            else submit();
          }}
        >
          <div className="wizard-topline">
            <span>
              {appText("Step")} {step + 1} {appText("of")} {steps.length}
            </span>
            <span role="status">
              {saved
                ? appText("Progress saved")
                : appText("Saved when you continue")}
            </span>
          </div>
          <h2 ref={heading} tabIndex={-1}>
            {appText(steps[step])}
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
            {(step === 1 || step === 2) && (
              <TeacherDetailsForm
                part={step === 1 ? "address" : "education"}
                values={values}
                onChange={change}
                errors={errors}
              />
            )}
            {step === 3 && (
              <>
                <TeachingCoverageEditor
                  groups={teachingGroups}
                  onChange={(groups) => {
                    setTeachingGroups(groups);
                    setErrors({});
                  }}
                  error={errors.teachingCoverage}
                />
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
                <fieldset className="teacher-demo-choice">
                  <legend>
                    {appText(
                      "Are you comfortable offering an optional demo?",
                    )}{" "}
                  </legend>
                  <p className="wizard-help">
                    {appText(
                      "A demo helps families assess teaching fit before deciding. It is optional and does not guarantee hiring. “Demo available” is highlighted on your approved public profile when you opt in.",
                    )}{" "}
                  </p>
                  <label>
                    <input
                      type="radio"
                      name="teacher-demo"
                      checked={values.demoOptIn === true}
                      onChange={() => change("demoOptIn", true)}
                    />{" "}
                    {appText("Yes, I can offer a demo")}{" "}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="teacher-demo"
                      checked={values.demoOptIn === false}
                      onChange={() => change("demoOptIn", false)}
                    />{" "}
                    {appText(
                      "No, I prefer to discuss tuition without a demo",
                    )}{" "}
                  </label>
                  {errors.demoOptIn && (
                    <small role="alert" className="field-error">
                      {appError(errors.demoOptIn)}
                    </small>
                  )}
                </fieldset>
                <fieldset
                  className="teacher-demo-choice teacher-lock-in-choice"
                  aria-describedby="lock-in-help"
                >
                  <legend>
                    {appText("Do you want a minimum engagement period?")}
                  </legend>
                  <p id="lock-in-help" className="wizard-help">
                    {appText(
                      "Choose your lock-in preference. Families will see it on your search card and profile. This records your preference; cancellation restrictions are not currently enforced.",
                    )}{" "}
                  </p>
                  {([0, 15, 30] as const).map((days) => (
                    <label key={days}>
                      <input
                        type="radio"
                        name="teacher-lock-in"
                        checked={values.lockInDays === days}
                        onChange={() => change("lockInDays", days)}
                        aria-invalid={!!errors.lockInDays}
                        aria-describedby={
                          errors.lockInDays ? "lock-in-error" : undefined
                        }
                      />
                      {days === 0
                        ? appText("No, I do not require a lock-in")
                        : appText("Yes, {0} days", [days])}
                    </label>
                  ))}
                  {errors.lockInDays && (
                    <small
                      id="lock-in-error"
                      role="alert"
                      className="field-error"
                    >
                      {appError(errors.lockInDays)}
                    </small>
                  )}
                </fieldset>
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={!!values.consultationOptIn}
                    onChange={(e) =>
                      change("consultationOptIn", e.target.checked)
                    }
                  />
                  <span>
                    {appText(
                      "I’m interested in Parent Pro consultations. This records my preference; calling is currently unavailable.",
                    )}{" "}
                  </span>
                </label>
              </>
            )}
            {step === 4 && (
              <div className="wizard-review">
                {[
                  [
                    "Your teaching",
                    `${values.name} · ${years} years`,
                    `${values.headline}\n${values.bio}`,
                  ],
                  [
                    "Private address",
                    `${values.address?.line1} ${values.address?.line2 || ""}`,
                    `${values.address?.locality}, ${values.address?.city}, ${values.address?.state} ${values.address?.postalCode} · India
Not shown publicly`,
                  ],
                  [
                    "Education milestones",
                    values.education
                      ?.map(
                        (r) =>
                          `${milestones[r.milestone]}: ${r.status.toLowerCase().replaceAll("_", " ")}`,
                      )
                      .join(" · "),
                    values.education
                      ?.filter((r) => r.status !== "NOT_APPLICABLE")
                      .map(
                        (r) =>
                          `${r.institution} · ${r.qualification} · ${r.year}${r.score !== null ? " · " + r.score + (r.grading === "PERCENTAGE" ? "%" : r.outOf ? " / " + r.outOf : "") : ""}`,
                      )
                      .join("\n"),
                  ],
                  [
                    "Previous teaching work",
                    `${values.employment?.length || 0} previous work records`,
                    values.employment
                      ?.map(
                        (r) =>
                          `${r.organization} · ${r.role} · ${r.fromYear}–${r.toYear || "current"} · ${r.proof.toLowerCase().replaceAll("_", " ")}`,
                      )
                      .join("\n") || "No previous work recorded.",
                  ],
                  [
                    "Lock-in preference",
                    values.lockInDays === 0
                      ? "No lock-in period"
                      : `${values.lockInDays} days lock-in`,
                    "Displayed publicly as your preference. Cancellation restrictions are not currently enforced.",
                  ],
                  [
                    "Optional demo",
                    values.demoOptIn ? "Demo available" : "Demo not offered",
                    values.demoOptIn
                      ? "Families will see a demo-availability highlight."
                      : "Families can discuss tuition without requesting a demo.",
                  ],
                  [
                    "Coverage & tuition",
                    coverageText(
                      { teachingCoverage: expanded.scopes },
                      appText,
                    ),
                    `${values.languages?.join(", ")} · ${values.modes?.map((m) => (m === "HOME" ? "At home" : "Online")).join(", ")}\n${values.modes?.includes("HOME") ? values.localities?.join(", ") + "\n" : ""}${money(Math.round(Number(price) * 100), appLocale)} per month\nConsultation interest: ${values.consultationOptIn ? "Yes" : "No"}`,
                  ],
                ].map(([title, line, detail], i) => (
                  <div className="wizard-review-row" key={title}>
                    <div>
                      <h3>{appText(title)}</h3>
                      <p>
                        {i === 0
                          ? appText("{0} · {1} years", [values.name, years])
                          : i === 2
                            ? values.education
                                ?.map(
                                  (r) =>
                                    `${appText(milestones[r.milestone])}: ${appText(r.status)}`,
                                )
                                .join(" · ")
                            : appText(line)}
                      </p>
                      <p className="teacher-review-detail">
                        {i === 0 ? (
                          detail
                        ) : i === 1 ? (
                          <>
                            {values.address?.locality}, {values.address?.city},{" "}
                            {values.address?.state} {values.address?.postalCode}{" "}
                            · {appText("India")}
                            <br />
                            {appText("Not shown publicly")}
                          </>
                        ) : i === 2 ? (
                          detail
                        ) : i === 6 ? (
                          <>
                            {values.languages
                              ?.map((value) => appCurriculum(value))
                              .join(", ")}{" "}
                            ·{" "}
                            {values.modes
                              ?.map((value) => appText(value))
                              .join(", ")}
                            <br />
                            {values.localities?.join(", ")}
                            <br />
                            {money(
                              Math.round(Number(price) * 100),
                              appLocale,
                            )}{" "}
                            {appText("per month")}
                            <br />
                            {appText("Consultation interest:")}{" "}
                            {appText(values.consultationOptIn ? "Yes" : "No")}
                          </>
                        ) : i === 3 ? (
                          values.employment
                            ?.map(
                              (r) =>
                                `${r.organization} · ${r.role} · ${r.fromYear}–${r.toYear || appText("current")} · ${appText(r.proof)}`,
                            )
                            .join("\n") || appText("No previous work recorded.")
                        ) : (
                          appText(detail)
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => setStep([0, 1, 2, 2, 3, 3, 3][i])}
                    >
                      {appText("Edit")}{" "}
                      {appText(
                        [
                          "teaching profile",
                          "private address",
                          "education",
                          "previous work",
                          "lock-in preference",
                          "demo preference",
                          "coverage",
                        ][i],
                      )}
                    </Button>
                  </div>
                ))}
                <Message>
                  {profile
                    ? appText(
                        "Resubmitting reopens screening, hides your profile from discovery and revokes existing private-note sharing. Accepted bookings are not cancelled.",
                      )
                    : appText(
                        "Submitting changes this account to a teacher account. To retain a separate guardian workspace, apply using a different email account.",
                      )}
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
                    {appText(
                      "I acknowledge these account changes and the proposed pilot placement fee: 25% of first monthly tuition, capped at ₹1,500, after independently confirmed start and receipt. Final terms require review.",
                    )}{" "}
                  </span>
                </label>
                {errors.terms && (
                  <small
                    id="teacher-terms-error"
                    className="field-error"
                    role="alert"
                  >
                    {appError(errors.terms)}
                  </small>
                )}
                <p className="wizard-help">
                  {appText(
                    "Next: upload private evidence for identity, qualifications, teaching capability and references. Submission does not approve your profile.",
                  )}{" "}
                </p>
              </div>
            )}
          </fieldset>
          {error && <Message error>{appError(error)}</Message>}
          {conflict && (
            <Button type="button" variant="outline" onClick={onReload}>
              {appText("Reload saved application")}{" "}
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
                {appText("Back")}{" "}
              </Button>
            )}
            {onCancel && (
              <Button
                variant="ghost"
                type="button"
                disabled={locked}
                onClick={onCancel}
              >
                {appText("Return to workspace")}{" "}
              </Button>
            )}
            <Button
              type="submit"
              className="button"
              disabled={busy || conflict || (uncertain && step < 4)}
            >
              {busy
                ? appText("Saving…")
                : step < 4
                  ? appText("Continue to {0}", [
                      appText(steps[step + 1].toLowerCase()),
                    ])
                  : profile
                    ? appText("Resubmit for review")
                    : appText("Submit teacher application")}
            </Button>
            {uncertain && step < 4 && (
              <Button
                type="button"
                className="button"
                disabled={busy}
                onClick={async () => {
                  setUncertain(false);
                  await advance();
                }}
              >
                {appText("Retry saving progress")}{" "}
              </Button>
            )}
          </div>
          {profile && (
            <p className="wizard-save-note">
              {appText(
                "Continue saves each completed step privately. Changes on the current step are not saved until you continue. Your current application stays unchanged until you review and resubmit; fee acknowledgement must be renewed.",
              )}{" "}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
function RevisionEditor({
  session,
  profile,
  onCancel,
  onDone,
  onReload,
}: {
  session: Session;
  profile: Profile;
  onCancel: () => void;
  onDone: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const draft = useQuery({
    queryKey: ["teacher-revision-draft", profile.id],
    queryFn: ({ signal }) =>
      api<RevisionProgress>(
        `/teacher-applications/${profile.id}/revision-draft`,
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  const [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ body: unknown; key: string } | null>(null);
  async function discard() {
    if (!draft.data || (!acknowledged && !pending.current)) return;
    setBusy(true);
    setError("");
    if (!pending.current)
      pending.current = {
        body: {
          expectedVersion: draft.data.version,
          expectedApplicationVersion: profile.version,
          acknowledged: true,
        },
        key: crypto.randomUUID(),
      };
    try {
      await api(`/teacher-applications/${profile.id}/revision-draft-discards`, {
        method: "POST",
        body: pending.current.body,
        key: pending.current.key,
        csrf: session.csrfToken,
        signal: AbortSignal.timeout(15000),
      });
      pending.current = null;
      await onReload();
    } catch (e) {
      if (!unknownResult(e)) {
        pending.current = null;
        setAcknowledged(false);
      }
      setError(
        unknownResult(e)
          ? "We couldn’t confirm the discard. Retry the same action before leaving."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  if (draft.isPending)
    return (
      <main className="container narrow section">
        <Message>{appText("Loading your saved revision…")}</Message>
      </main>
    );
  if (!draft.data || onboardingAccessDenied(draft.error))
    return (
      <main className="container narrow section">
        <Message error>
          {appText(
            "Your saved revision could not be loaded. Try again before editing.",
          )}{" "}
        </Message>
        <Button onClick={() => draft.refetch()}>
          {appText("Retry saved revision")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {appText("Return to workspace")}{" "}
        </Button>
      </main>
    );
  if (draft.data.stale)
    return (
      <main className="container narrow section">
        <section className="wizard-card revision-recovery">
          <h1>{appText("Your application changed.")}</h1>
          <p>
            {appText(
              "Your saved revision belongs to an earlier application version. It is preserved here; review the current application before starting again.",
            )}{" "}
          </p>
          <dl className="review-list">
            <div>
              <dt>{appText("Saved headline")}</dt>
              <dd>{draft.data.draft.headline || appText("Not added")}</dd>
            </div>
            <div>
              <dt>{appText("Current headline")}</dt>
              <dd>{profile.headline}</dd>
            </div>
          </dl>
          <p>
            {appText(
              "Discarding removes only this unfinished revision. Your current application, evidence and reviewer decisions are kept.",
            )}{" "}
          </p>
          <label className="check-line">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={busy || !!pending.current}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              {appText(
                "I understand that my saved revision edits will be discarded.",
              )}{" "}
            </span>
          </label>
          {error && <Message error>{appError(error)}</Message>}
          <div className="wizard-actions">
            <Button
              variant="outline"
              disabled={busy || !!pending.current}
              onClick={onCancel}
            >
              {appText("Keep saved revision")}{" "}
            </Button>
            <Button
              disabled={busy || (!acknowledged && !pending.current)}
              onClick={discard}
            >
              {busy
                ? appText("Discarding…")
                : pending.current
                  ? appText("Retry discarding revision")
                  : appText("Discard saved revision")}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !!pending.current}
              onClick={onReload}
            >
              {appText("Reload current application")}{" "}
            </Button>
          </div>
        </section>
      </main>
    );
  return (
    <OnboardingReadBoundary
      error={draft.error}
      busy={draft.isFetching}
      onRetry={() => draft.refetch()}
    >
      <ApplicationWizard
        key={draft.data.version}
        session={session}
        profile={profile}
        initial={{
          kind: "TEACHER_REVISION",
          state: profile.status,
          draft: draft.data.draft as Partial<Application>,
          version: draft.data.version,
          completedResourceId: null,
        }}
        onCancel={onCancel}
        onDone={onDone}
        onReload={onReload}
      />
    </OnboardingReadBoundary>
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const [edit, setEdit] = useState(false);
  const [scheduleLocked, setScheduleLocked] = useState(false);
  const evidence = useHistory<{
    items: Evidence[];
    nextCursor?: string | null;
  }>({
    queryKey: ["teacher-evidence", session.account.id, profile.id],
    path: `/teachers/${profile.id}/evidence`,
  });
  if (edit)
    return (
      <RevisionEditor
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
        <h1>{appText("Your teacher workspace.")}</h1>
        <p>
          {appText(
            "Manage your application, private evidence and teaching schedule.",
          )}
        </p>
        <a href="#teaching-schedule" className="inline-link">
          {appText("Manage teaching schedule")}{" "}
        </a>
      </div>
      <div className="wizard-layout">
        <aside className="wizard-aside">
          <div className="wizard-discovery">
            <GraduationCap size={24} />
            <strong>{profile.name}</strong>
            <p>{profile.headline}</p>
            <p>
              {profile.subjects.map((value) => appCurriculum(value)).join(", ")}{" "}
              · {money(profile.monthlyPaise, appLocale)}{" "}
              {appText("per month")}{" "}
            </p>
            <a href="#teaching-schedule" className="inline-link">
              {appText("Manage teaching schedule")}{" "}
            </a>
            <Link href="/dashboard" className="inline-link">
              {appText("Open teacher dashboard")}{" "}
            </Link>
          </div>
        </aside>
        <div className="teacher-workspace">
          <section className="wizard-card">
            <h2>{appText("Application status")}</h2>
            <p className="badge">{appText(status)}</p>
            <p>
              {profile.status === "APPROVED"
                ? appText(
                    "Your application is approved. Discovery also depends on current screening and availability.",
                  )
                : profile.status === "CHANGES_REQUESTED"
                  ? appText(
                      "Your reviewer requested changes. Contact support for clarification, then update your application or evidence.",
                    )
                  : profile.status === "SUSPENDED"
                    ? appText(
                        "Your profile is suspended. Contact support for the next steps.",
                      )
                    : appText(
                        "Your profile stays private while identity, qualification, capability and reference checks are reviewed.",
                      )}
            </p>
            <div className="wizard-actions">
              <Button
                variant="outline"
                className="button secondary"
                onClick={onReload}
                disabled={scheduleLocked}
              >
                {appText("Refresh review status")}{" "}
              </Button>
              <Button
                variant="ghost"
                disabled={scheduleLocked}
                onClick={() => setEdit(true)}
              >
                {appText("Edit application")}{" "}
              </Button>
              <Link href="/support" className="inline-link">
                {appText("Contact support")}{" "}
              </Link>
            </div>
          </section>
          <section className="wizard-card">
            <TeacherDetailsSummary profile={profile} />
          </section>
          <section className="wizard-card">
            <h2>{appText("Private screening evidence")}</h2>
            <p>
              {appText(
                "Upload only documents needed for your checks. Files are stored privately and must pass a safety scan before they can be downloaded. A clean scan does not mean your application is approved.",
              )}{" "}
            </p>
            <p className="wizard-help">
              {appText(
                "Use Qualifications for Class 10/12 marksheets, college and postgraduate certificates. Use References for previous-work experience certificates or reference evidence. Upload each document separately.",
              )}{" "}
            </p>
            <EvidenceUpload
              session={session}
              profile={profile}
              onUploaded={async () => {
                await evidence.refetch();
              }}
            />
            <HistoryPages
              history={evidence}
              label="Private evidence"
              disabled={scheduleLocked}
            />
            {evidence.isPending ? (
              <p role="status">{appText("Loading evidence…")}</p>
            ) : evidence.error ? (
              <>
                <Message error>
                  {appText(
                    "Private evidence could not be loaded. Check your access and retry.",
                  )}
                </Message>
                <Button variant="outline" onClick={() => evidence.refetch()}>
                  {appText("Retry evidence list")}{" "}
                </Button>
              </>
            ) : evidence.data?.items.length ? (
              <ul className="teacher-evidence-list">
                {evidence.data.items.map((file) => (
                  <li key={file.id}>
                    <div>
                      <strong>
                        {appText(file.kind.toLowerCase().replaceAll("_", " "))}
                      </strong>
                      <p>
                        {Math.ceil(file.size / 1024)} {appText("KB ·")}{" "}
                        {new Date(file.uploadedAt).toLocaleDateString(
                          appLocale,
                        )}
                      </p>
                    </div>
                    <div>
                      <span>
                        {file.status === "CLEAN"
                          ? appText("Safety scan complete")
                          : file.status === "QUARANTINED"
                            ? appText("Awaiting safety scan")
                            : file.status === "INFECTED"
                              ? appText("Blocked by safety scan")
                              : appText("Deleted")}
                      </span>
                      {file.status === "CLEAN" && (
                        <a
                          className="inline-link"
                          href={`/api/v1/evidence/${file.id}/content`}
                        >
                          {appText("Download private file")}{" "}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="wizard-help">
                {appText(
                  "No evidence uploaded yet. Start with the documents for your identity check.",
                )}{" "}
              </p>
            )}
          </section>
          <TeacherSchedule
            session={session}
            profile={profile}
            onLockChange={setScheduleLocked}
          />
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const [kind, setKind] = useState("IDENTITY"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const pending = useRef<{ body: unknown; key: string } | null>(null),
    input = useRef<HTMLInputElement>(null),
    fileChooser = useRef<HTMLButtonElement>(null);
  const allowed =
    profile.status === "SUBMITTED" || profile.status === "CHANGES_REQUESTED";
  async function upload() {
    setError("");
    setSaved(false);
    if (!file) {
      setError("Choose a PDF, PNG or JPEG to upload.");
      if (appLocale === "hi-IN") fileChooser.current?.focus();
      else input.current?.focus();
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
        {appText(
          "Uploads are available while an application is submitted or changes are requested. To change an approved profile, resubmit your application for a new review.",
        )}{" "}
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
          <label htmlFor="evidence-kind">{appText("Check category")}</label>
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
                    ? appText("Teaching capability")
                    : appText(k.charAt(0) + k.slice(1).toLowerCase())}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="field">
          <label htmlFor="evidence-file">
            {appText("Private evidence file")}
          </label>
          <Input
            id="evidence-file"
            ref={input}
            type="file"
            className={appLocale === "hi-IN" ? "sr-only" : undefined}
            tabIndex={appLocale === "hi-IN" ? -1 : undefined}
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              pending.current = null;
              setError("");
              setSaved(false);
            }}
            aria-describedby="evidence-help"
          />
          {appLocale === "hi-IN" && (
            <>
              <Button
                ref={fileChooser}
                type="button"
                variant="outline"
                onClick={() => input.current?.click()}
              >
                {appText(
                  file ? "Change evidence file" : "Choose evidence file",
                )}
              </Button>
              <small role="status">
                {file?.name || appText("No file selected")}
              </small>
            </>
          )}
          <small id="evidence-help" className="wizard-help">
            {appText(
              "PDF, PNG or JPEG, up to 5 MiB. Files remain private.",
            )}{" "}
          </small>
        </div>
      </fieldset>
      {error && <Message error>{appError(error)}</Message>}
      {saved && (
        <Message>
          {appText(
            "Private evidence uploaded. Check its safety-scan status below.",
          )}{" "}
        </Message>
      )}
      <Button className="button" type="submit" disabled={busy}>
        {busy
          ? appText("Uploading…")
          : uncertain
            ? appText("Retry private upload")
            : appText("Upload private evidence")}
      </Button>
    </form>
  );
}
