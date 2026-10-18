"use client";
import {
  OnboardingReadBoundary,
  onboardingAccessDenied,
} from "./onboarding-read-boundary";
import { useAppTranslation } from "./locale";
import { educationLabel } from "./learner-education";
import {
  CurriculumChoice,
  subjectSuggestions,
  boardSuggestions,
} from "./curriculum-choice";
import { TeachingCoverageSummary } from "./teaching-coverage";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  WeeklyAvailability,
  WeeklySummary,
  AvailabilityMode,
  weeklyPreferences,
  weeklyRows,
  emptyWeekly,
  type Weekly,
} from "./weekly-availability";
import { GuardianDraftDiscard } from "./guardian-draft-discard";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  rupees,
  type Child,
  type Session,
  type Teacher,
  type TuitionRequest,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Alert, AlertDescription } from "../components/ui/alert";

type Preferences = {
  timezone: "Asia/Kolkata";
  slots: { startsAt: string; endsAt: string }[];
};
type Draft = {
  schoolName?: string;
  schoolSubjects?: string[];
  discoveryMethod: "MANUAL" | "ASSISTED";
  preferredTeacherId?: string;
  childId?: string;
  alias: string;
  grade: number | null;
  board: string | null;
  subject: string;
  mode: string;
  language: string;
  locality: string;
  budgetPaise: number;
  schedule: string;
  preferences?: Preferences | Weekly;
};
type Progress = {
  kind: string;
  state: string;
  draft: Partial<Draft>;
  version: number;
  completedResourceId: string | null;
};
type Values = {
  schoolName: string;
  schoolSubjects: string;
  childId: string;
  alias: string;
  grade: string;
  board: string;
  subject: string;
  mode: string;
  language: string;
  locality: string;
  budget: string;
  schedule: string;
};
export type Window = { start: string; duration: string };
const steps = ["Permission", "Learner", "Tuition needs", "Schedule", "Review"];
const learnerSchema = z.object({
  schoolName: z.string().trim().min(1, "Enter the school name.").max(160),
  schoolSubjects: z
    .string()
    .trim()
    .min(1, "List the subjects studied in class.")
    .refine((v) => {
      const a = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        a.length > 0 &&
        a.length <= 20 &&
        a.every((s) => s.length <= 60) &&
        new Set(a.map((s) => s.toLowerCase())).size === a.length
      );
    }, "List 1–20 unique subjects, separated by commas."),
  alias: z
    .string()
    .trim()
    .min(1, "Enter a learner alias.")
    .max(40, "Use 40 characters or fewer."),
  grade: z.coerce.number().int().min(1).max(12),
  board: z.string().trim().min(1, "Enter a board.").max(80),
});
const needsSchema = z.object({
  subject: z.string().trim().min(1, "Choose a subject.").max(60),
  mode: z.enum(["HOME", "ONLINE"]),
  language: z.enum(["English", "Hindi"]),
  locality: z.string().trim().min(1, "Choose a locality."),
  budget: z
    .string()
    .refine(
      (v) =>
        Number(v) >= 500 && Number(v) <= 20000 && /^\d+(?:\.\d{1,2})?$/.test(v),
      "Enter a monthly budget between ₹500 and ₹20,000, in whole paise.",
    ),
});
export const localTime = (iso: string) =>
  new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16);
const formatTime = (iso: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
export function preferences(windows: Window[]): Preferences | null {
  const slots = windows
    .map((w) => {
      const start = new Date(w.start + ":00+05:30");
      return {
        startsAt: start,
        endsAt: new Date(start.getTime() + Number(w.duration) * 60000),
      };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const now = Date.now();
  if (
    !slots.length ||
    slots.length > 6 ||
    slots.some(
      (s, i) =>
        !Number.isFinite(s.startsAt.getTime()) ||
        !Number.isFinite(s.endsAt.getTime()) ||
        s.startsAt.getTime() < now + 3600000 ||
        s.endsAt.getTime() > now + 60 * 86400000 ||
        s.endsAt.getTime() - s.startsAt.getTime() < 20 * 60000 ||
        s.endsAt.getTime() - s.startsAt.getTime() > 120 * 60000 ||
        (i > 0 && slots[i - 1].endsAt > s.startsAt),
    )
  )
    return null;
  return {
    timezone: "Asia/Kolkata",
    slots: slots.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    })),
  };
}
function Field({
  id,
  label,
  error,
  children,
  hint,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <div className="field">
      <label htmlFor={id}>{appText(label)}</label>
      {children}
      {error ? (
        <small id={`${id}-error`} className="field-error" role="alert">
          {appError(error)}
        </small>
      ) : (
        hint && (
          <small id={`${id}-hint`} className="wizard-help">
            {appText(hint)}
          </small>
        )
      )}
    </div>
  );
}
export function GuardianOnboarding({
  session,
  onSessionChange,
}: {
  session: Session;
  onSessionChange: (session: Session) => void;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const params = useSearchParams();
  const [reload, setReload] = useState(0);
  const [verificationError, setVerificationError] = useState("");
  const progress = useQuery({
    queryKey: ["guardian-onboarding", session.account.id],
    queryFn: ({ signal }) => api<Progress>("/onboarding/parent", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const enquiry = useQuery({
    queryKey: ["guardian-enquiry-draft", session.account.id],
    queryFn: ({ signal }) => api<Progress>("/onboarding/enquiry", { signal }),
    enabled: session.account.verified,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const initial =
    progress.data?.completedResourceId &&
    enquiry.data &&
    (enquiry.data.version > 0 || params.get("teacher"))
      ? enquiry.data
      : progress.data;
  const profile = params.get("profile"),
    teacherId =
      params.get("teacher") || initial?.draft.preferredTeacherId || "";
  const teacher = useQuery({
    queryKey: ["teacher", profile],
    queryFn: ({ signal }) =>
      api<Teacher>(`/teachers/${encodeURIComponent(profile!)}`, { signal }),
    enabled: !!profile && !!teacherId,
    retry: false,
  });
  if (!session.account.verified)
    return (
      <main className="container narrow section wizard-verification">
        <ShieldCheck size={38} />
        <h1>{appText("Guardian verification is pending.")}</h1>
        <p>
          {appText(
            "Your email is verified. We need an approved guardian verification before collecting learner information.",
          )}{" "}
        </p>
        <Alert role="status">
          <AlertDescription>
            {appText(
              "Verification pending. You can explore teachers while your guardian account is reviewed.",
            )}{" "}
          </AlertDescription>
        </Alert>
        {verificationError && <p role="alert">{appError(verificationError)}</p>}
        <div className="wizard-actions">
          <Link className="button" href="/guardian-verification">
            {appText("Start guardian verification")}
          </Link>
          <Link className="button secondary" href="/teachers">
            {appText("Explore teachers")}{" "}
          </Link>
          <Button
            className="button"
            onClick={async () => {
              try {
                setVerificationError("");
                onSessionChange(await api<Session>("/auth/session"));
              } catch (error) {
                setVerificationError((error as Error).message);
              }
            }}
          >
            {appText("Refresh verification status")}{" "}
          </Button>
        </div>
        <Link className="inline-link" href="/support">
          {appText("Get help with your account")}{" "}
        </Link>
      </main>
    );
  if (
    progress.isPending ||
    enquiry.isPending ||
    (profile && teacherId && teacher.isPending)
  )
    return (
      <main className="container section">
        <p role="status">
          <LoaderCircle className="spin" />{" "}
          {appText("Loading your saved progress…")}{" "}
        </p>
      </main>
    );
  const error =
    [progress.error, enquiry.error, teacher.error].find(
      onboardingAccessDenied,
    ) ||
    progress.error ||
    enquiry.error ||
    teacher.error;
  function retrySetup() {
    void progress.refetch();
    void enquiry.refetch();
    if (profile) void teacher.refetch();
  }
  const checking =
    progress.isFetching ||
    enquiry.isFetching ||
    (!!profile && teacher.isFetching);
  if (
    error &&
    (!initial ||
      !enquiry.data ||
      (!!profile && !teacher.data) ||
      onboardingAccessDenied(error))
  )
    return (
      <main className="container narrow section">
        <Alert variant="destructive">
          <AlertDescription>
            {appText(
              "We couldn’t load your saved setup. Check your account permissions and try again.",
            )}
          </AlertDescription>
        </Alert>
        <Button className="button" disabled={checking} onClick={retrySetup}>
          {appText("Try again")}{" "}
        </Button>
        <Link className="inline-link" href="/teachers">
          {appText("Choose a teacher")}{" "}
        </Link>
      </main>
    );
  if (
    initial?.version &&
    !initial.completedResourceId &&
    Object.keys(initial.draft).length &&
    params.get("teacher") &&
    params.get("teacher") !== initial.draft.preferredTeacherId
  )
    return (
      <main className="container narrow section">
        <h1>{appText("A saved enquiry is already in progress.")}</h1>
        <p>
          {appText(
            "Your existing draft has been preserved. Resume it, or review an explicit discard before continuing with this teacher.",
          )}{" "}
        </p>
        <Link className="button" href="/onboarding/parent">
          {appText("Resume saved enquiry")}{" "}
        </Link>
        <Link className="inline-link" href="/teachers">
          {appText("Back to teacher search")}{" "}
        </Link>
        <GuardianDraftDiscard
          session={session}
          kind={initial.kind === "ENQUIRY" ? "enquiry" : "parent"}
          version={initial.version}
          destination={"/onboarding/parent?" + params.toString()}
          label={appText("Discard draft & use this teacher")}
        />
      </main>
    );
  if (teacher.data && teacher.data.id !== teacherId)
    return (
      <main className="container narrow section">
        <h1>{appText("Choose a teacher to continue.")}</h1>
        <p>{appText("The selected profile does not match this request.")}</p>
        <Link className="button" href="/teachers">
          {appText("Browse teachers")}{" "}
        </Link>
      </main>
    );
  if (!initial) return null;
  return (
    <OnboardingReadBoundary error={error} busy={checking} onRetry={retrySetup}>
      <Wizard
        key={`${session.account.id}:${reload}`}
        session={session}
        initial={initial}
        enquiry={enquiry.data}
        teacherId={teacherId}
        teacher={teacher.data}
        onReload={async () => {
          const result = await progress.refetch();
          const next = result.data?.completedResourceId
            ? await enquiry.refetch()
            : null;
          if (result.data && !result.error && !next?.error)
            setReload((v) => v + 1);
        }}
      />
    </OnboardingReadBoundary>
  );
}
function Wizard({
  session,
  initial,
  enquiry,
  teacherId,
  teacher,
  onReload,
}: {
  session: Session;
  initial: Progress;
  enquiry?: Progress;
  teacherId: string;
  teacher?: Teacher;
  onReload: () => Promise<void>;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient();
  const [progress, setProgress] = useState(initial);
  const [additional, setAdditional] = useState(initial.kind === "ENQUIRY");
  const [success, setSuccess] = useState(initial.completedResourceId || "");
  const draftPath = additional ? "/onboarding/enquiry" : "/onboarding/parent";
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draftLocked, setDraftLocked] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const submission = useRef<{ path: string; body: unknown } | null>(null);
  const initialValues = (): Values => ({
    childId: initial.draft.childId || "",
    schoolName: initial.draft.schoolName || "",
    schoolSubjects: initial.draft.schoolSubjects?.join(", ") || "",
    alias: initial.draft.alias || "",
    grade: String(initial.draft.grade || 8),
    board: initial.draft.board || "CBSE",
    subject: initial.draft.subject || teacher?.subjects[0] || "Maths",
    mode: initial.draft.mode || teacher?.modes[0] || "HOME",
    language: initial.draft.language || teacher?.languages[0] || "English",
    locality:
      initial.draft.locality || teacher?.localities[0] || "Shankar Nagar",
    budget: String(
      (initial.draft.budgetPaise || teacher?.monthlyPaise || 400000) / 100,
    ),
    schedule: initial.draft.schedule || "",
  });
  const [values, setValues] = useState<Values>(initialValues);
  const [windows, setWindows] = useState<Window[]>(
    () =>
      (initial.draft.preferences && "slots" in initial.draft.preferences
        ? initial.draft.preferences.slots
        : undefined
      )?.map((s) => ({
        start: localTime(s.startsAt),
        duration: String(
          (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) /
            60000,
        ),
      })) || [{ start: "", duration: "40" }],
  );
  const [weeklyMode, setWeeklyMode] = useState(
    !initial.draft.preferences || "weekly" in initial.draft.preferences,
  );
  const [weekly, setWeekly] = useState(() =>
    initial.draft.preferences && "weekly" in initial.draft.preferences
      ? weeklyRows(initial.draft.preferences)
      : emptyWeekly(),
  );
  const currentPreferences = () =>
    weeklyMode ? weeklyPreferences(weekly) : preferences(windows);
  const children = useQuery({
    queryKey: ["children", session.account.id],
    queryFn: () => api<{ items: Child[] }>("/children"),
    enabled: step > 0,
    retry: false,
  });
  useEffect(() => {
    heading.current?.focus();
  }, [step, success]);
  function change(name: keyof Values, value: string) {
    setValues((old) => ({ ...old, [name]: value }));
    setErrors((old) => ({ ...old, [name]: "" }));
    setSaved(false);
  }
  async function post<T>(path: string, body: unknown): Promise<T> {
    const signature = path + JSON.stringify(body);
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    return api<T>(path, {
      method: "POST",
      body,
      key: retry.current.key,
      csrf: session.csrfToken,
      signal: AbortSignal.timeout(12000),
    });
  }
  function payload(): Draft {
    const times = currentPreferences();
    return {
      discoveryMethod: teacherId ? "MANUAL" : "ASSISTED",
      ...(teacherId ? { preferredTeacherId: teacherId } : {}),
      ...(values.childId ? { childId: values.childId } : {}),
      ...(values.schoolName.trim()
        ? { schoolName: values.schoolName.trim() }
        : {}),
      ...(values.schoolSubjects.trim()
        ? {
            schoolSubjects: values.schoolSubjects
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : {}),
      alias: values.alias.trim(),
      grade: values.childId
        ? (children.data?.items.find((c) => c.id === values.childId)?.grade ??
          null)
        : Number(values.grade),
      board: values.childId
        ? (children.data?.items.find((c) => c.id === values.childId)?.board ??
          null)
        : values.board.trim(),
      subject: values.subject,
      mode: values.mode,
      language: values.language,
      locality: values.locality.trim(),
      budgetPaise: Math.round(Number(values.budget) * 100),
      schedule:
        values.schedule.trim() ||
        `${weeklyMode ? weekly.length : windows.length} ${weeklyMode ? "weekly availability ranges" : "dated availability windows"} in Asia/Kolkata.`,
      ...(times ? { preferences: times } : {}),
    };
  }
  function validate(): boolean {
    const parsed =
      step === 1
        ? (selectedChild &&
          selectedChild.educationStage !== undefined &&
          selectedChild.educationStage !== "SCHOOL"
            ? learnerSchema.omit({ grade: true, board: true })
            : learnerSchema
          ).safeParse(values)
        : step === 2
          ? needsSchema.safeParse(values)
          : null;
    if (parsed && !parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors(
        Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [
            key,
            (value as string[])[0],
          ]),
        ),
      );
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(".wizard-card [aria-invalid='true']")
          ?.focus(),
      );
      return false;
    }
    if (
      (step === 3 || step === 4) &&
      (!currentPreferences() || values.schedule.trim().length > 300)
    ) {
      setErrors({
        schedule: weeklyMode
          ? "Choose a weekday and nonoverlapping time ranges of at least 20 minutes. End times must be later on the same day."
          : "Choose nonoverlapping 20–120 minute windows, at least one hour ahead and within 60 days. Notes must be 300 characters or fewer.",
      });
      return false;
    }
    return true;
  }
  async function advance() {
    setErrors({});
    setServerError("");
    if (step === 0 && !accepted) {
      setErrors({
        consent:
          "Confirm that you are the learner’s parent or lawful guardian and agree to the stated use.",
      });
      return;
    }
    if (!validate()) return;
    setBusy(true);
    try {
      if (step === 0)
        await api("/consents", {
          method: "POST",
          csrf: session.csrfToken,
          body: {
            purpose: "tuition-and-learning-records",
            policyVersion: "development-v1",
            accepted: true,
          },
          signal: AbortSignal.timeout(12000),
        });
      {
        const draft = payload() as Partial<Draft>;
        if (!draft.alias) delete draft.alias;
        if (!currentPreferences()) delete draft.preferences;
        if (!values.schedule.trim() && !draft.preferences)
          delete draft.schedule;
        const result = await post<Progress>(draftPath + "/drafts", {
          expectedVersion: progress.version,
          draft,
        });
        setProgress(result);
        client.setQueryData(
          [
            additional ? "guardian-enquiry-draft" : "guardian-onboarding",
            session.account.id,
          ],
          result,
        );
        setSaved(true);
      }
      setStep((v) => v + 1);
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : "We couldn’t save progress yet. Your changes are still here. Try again.",
      );
      setConflict(error instanceof ApiError && error.code === "CONFLICT");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!uncertain && !validate()) return;
    setBusy(true);
    setServerError("");
    try {
      if (!uncertain || !submission.current)
        submission.current = {
          path: draftPath + "/completions",
          body: { expectedVersion: progress.version },
        };
      const result = await post<TuitionRequest | Progress>(
        submission.current.path,
        submission.current.body,
      );
      const id =
        "completedResourceId" in result
          ? result.completedResourceId
          : result.id;
      if (!id)
        throw new Error(
          "The service did not confirm your request. Retry to check the result.",
        );
      if ("completedResourceId" in result) setProgress(result);
      setSuccess(id);
      setUncertain(false);
      client.invalidateQueries({ queryKey: ["dashboard"] });
      client.invalidateQueries({ queryKey: ["children"] });
      client.invalidateQueries({ queryKey: ["guardian-onboarding"] });
      client.invalidateQueries({ queryKey: ["guardian-enquiry-draft"] });
    } catch (error) {
      const unknown =
        !(error instanceof ApiError) ||
        error.code === "INVALID_RESPONSE" ||
        error.status >= 500;
      setServerError(
        unknown
          ? "We couldn’t confirm the result. Retry this submission before making edits."
          : (error as ApiError).message,
      );
      setUncertain(unknown);
      setConflict(error instanceof ApiError && error.code === "CONFLICT");
    } finally {
      setBusy(false);
    }
  }
  const selectedChild = children.data?.items.find(
    (c) => c.id === values.childId,
  );
  const errorProps = (name: string) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name]
      ? `${name}-error`
      : ["alias", "budget"].includes(name)
        ? `${name}-hint`
        : undefined,
  });
  if (success)
    return (
      <main className="container narrow section wizard-success">
        <CheckCircle2 size={44} />
        <h1 ref={heading} tabIndex={-1}>
          {appText("Your tuition request is saved.")}{" "}
        </h1>
        <p>
          {appText("Request")} {success.slice(0, 8)}{" "}
          {appText(
            "· Your criteria are ready for review. No teacher has been assigned yet.",
          )}{" "}
        </p>
        <div className="wizard-next">
          <h2>{appText("What happens next?")}</h2>
          <p>
            {appText(
              "Fit and availability are reviewed before suitable options are presented. You choose a teacher and review hiring terms together. A demo is optional.",
            )}{" "}
          </p>
        </div>
        <Link className="button" href="/dashboard/requests">
          {appText("View tuition requests")}{" "}
        </Link>
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>
              {appError(serverError)}{" "}
              <Button variant="outline" disabled={busy} onClick={onReload}>
                {appText("Reload saved progress")}{" "}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Button
          variant="outline"
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = additional
                ? await post<Progress>("/onboarding/enquiry/restarts", {
                    expectedVersion: progress.version,
                  })
                : enquiry || (await api<Progress>("/onboarding/enquiry"));
              if (next.completedResourceId)
                throw new Error(
                  "Refresh saved progress before starting another enquiry.",
                );
              if (Object.keys(next.draft).length) {
                await onReload();
                return;
              }
              client.setQueryData(
                ["guardian-enquiry-draft", session.account.id],
                next,
              );
              setProgress(next);
              setSuccess("");
              setAdditional(true);
              setValues({
                ...initialValues(),
                childId: "",
                schoolName: "",
                schoolSubjects: "",
                alias: "",
                schedule: "",
              });
              setWindows([{ start: "", duration: "40" }]);
              setWeeklyMode(true);
              setWeekly(emptyWeekly());
              setAccepted(false);
              setStep(0);
              setServerError("");
              setConflict(false);
              retry.current = null;
              submission.current = null;
              setSaved(false);
            } catch (error) {
              setServerError(
                error instanceof ApiError
                  ? error.message
                  : "We couldn’t confirm the new draft. Try again to check the same action.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? appText("Starting enquiry…")
            : appText("Create another request")}
        </Button>
      </main>
    );
  return (
    <main className="container section wizard-page">
      <div className="wizard-title">
        <h1>{appText("Set up your learner’s tuition.")}</h1>
        <p>
          {appText("A few clear steps. Review everything before submitting.")}
        </p>
      </div>
      <div className="wizard-layout">
        <aside className="wizard-aside">
          <ol
            className="wizard-steps"
            aria-label={appText("Guardian onboarding progress")}
          >
            {steps.map((label, i) => (
              <li
                key={label}
                className={i === step ? "current" : i < step ? "complete" : ""}
                aria-current={i === step ? "step" : undefined}
                aria-label={`${i + 1}. ${label}`}
              >
                <span className="wizard-step-number">
                  {i < step ? <Check size={16} /> : i + 1}
                </span>
                <span className="wizard-step-name">{appText(label)}</span>
              </li>
            ))}
          </ol>
          <div className="wizard-discovery">
            <ShieldCheck size={22} />
            <strong>
              {teacherId
                ? appText("Your chosen teacher")
                : appText("Let us search for you")}
            </strong>
            {teacher && (
              <p>
                {teacher.name}
                <br />
                {rupees(teacher.monthlyPaise, appLocale)}{" "}
                {appText("per month")}{" "}
              </p>
            )}
            <p>
              {teacherId
                ? appText(
                    "We’ll check this teacher’s fit and availability for your criteria.",
                  )
                : appText(
                    "Your criteria will be reviewed across eligible teachers.",
                  )}
            </p>
            <Link href="/teachers" className="inline-link">
              {appText("Change discovery option")}{" "}
            </Link>
          </div>
        </aside>
        <section className="wizard-card" aria-labelledby="wizard-step-title">
          <div className="wizard-topline">
            <span>
              {appText("Step")} {step + 1} {appText("of")} {steps.length}
            </span>
            <span role="status">
              {saved
                ? appText("Progress saved")
                : initial.version > 0
                  ? appText("Saved draft available")
                  : appText("New request")}
            </span>
          </div>
          <h2 id="wizard-step-title" ref={heading} tabIndex={-1}>
            {appText(
              [
                "Your permission comes first",
                "Tell us about your learner",
                "What kind of tuition would help?",
                "Choose times that work",
                "Review your tuition request",
              ][step],
            )}
          </h2>
          <p className="wizard-help">
            {teacherId
              ? appText("Manual search: {0}.", [
                  teacher?.name || appText("your previously chosen teacher"),
                ])
              : appText("Assisted search: a shortlist based on your criteria.")}
          </p>
          {progress.version > 0 && step === 0 && (
            <p className="wizard-help">
              {appText(
                "We found your saved progress. Review your details as you continue.",
              )}{" "}
            </p>
          )}
          {additional && (
            <p className="wizard-help">
              {appText(
                "This is an additional enquiry. Your submitted enquiries stay saved; this draft is saved privately each time you continue.",
              )}{" "}
            </p>
          )}
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>
                {appError(serverError)}
                {conflict && (
                  <Button variant="outline" disabled={busy} onClick={onReload}>
                    {appText("Reload saved progress")}{" "}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {!uncertain &&
            !busy &&
            !conflict &&
            progress.version > 0 &&
            Object.keys(progress.draft).length > 0 && (
              <GuardianDraftDiscard
                key={`${progress.kind}:${progress.version}`}
                session={session}
                kind={additional ? "enquiry" : "parent"}
                version={progress.version}
                onLockChange={setDraftLocked}
              />
            )}
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (step === 4) submit();
              else advance();
            }}
          >
            <fieldset disabled={busy || draftLocked}>
              {step === 0 && (
                <div className="wizard-permission">
                  <div className="wizard-verified">
                    <ShieldCheck size={18} />{" "}
                    {appText("Guardian account verified")}{" "}
                  </div>
                  <p>
                    {appText(
                      "We use a learner alias, school, class subjects and tuition need to review teacher fit and manage learning records.",
                    )}{" "}
                  </p>
                  <ul>
                    <li>
                      {appText(
                        "No learner phone number, photo, date of birth or school address.",
                      )}{" "}
                    </li>
                    <li>
                      {appText(
                        "You choose a teacher after reviewing suitable options.",
                      )}{" "}
                    </li>
                    <li>
                      {appText(
                        "You can withdraw consent in your dashboard. This does not authorize AI training.",
                      )}{" "}
                    </li>
                  </ul>
                  <label className="wizard-checkbox">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                      aria-describedby={
                        errors.consent ? "consent-error" : "consent-notice"
                      }
                      aria-invalid={!!errors.consent}
                    />
                    <span>
                      {appText(
                        "I am the learner’s parent or lawful guardian. I agree to the use described above for tuition matching and learning records.",
                      )}{" "}
                    </span>
                  </label>
                  {errors.consent && (
                    <p
                      id="consent-error"
                      className="auth-field-error"
                      role="alert"
                    >
                      {appError(errors.consent)}
                    </p>
                  )}
                  <p id="consent-notice" className="wizard-help">
                    {appText(
                      "Current notice: development-v1. These are purpose-specific permissions.",
                    )}{" "}
                  </p>
                </div>
              )}
              {step === 1 && (
                <div className="wizard-fields">
                  {children.isPending && (
                    <p role="status">{appText("Loading your learners…")}</p>
                  )}
                  {children.error && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        {appError(children.error.message)}
                        <Button
                          variant="outline"
                          onClick={() => children.refetch()}
                        >
                          {appText("Retry learners")}{" "}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  <p className="wizard-help">
                    {appText(
                      "Select a saved learner from early years, school or college, or add school details here.",
                    )}{" "}
                    <Link className="inline-link" href="/dashboard/learners">
                      {appText("Add or view education profiles")}{" "}
                    </Link>
                    .
                  </p>
                  {!!children.data?.items.length && (
                    <Field
                      id="childId"
                      label={appText("Link an existing learner")}
                    >
                      <select
                        id="childId"
                        value={values.childId}
                        onChange={(e) => {
                          const child = children.data?.items.find(
                            (c) => c.id === e.target.value,
                          );
                          setValues((old) => ({
                            ...old,
                            childId: child?.id || "",
                            schoolName: child?.schoolName || "",
                            schoolSubjects:
                              child?.schoolSubjects?.join(", ") || "",
                            alias: child?.alias || "",
                            grade: child ? String(child.grade ?? "") : "8",
                            board: child?.board || "CBSE",
                          }));
                          setSaved(false);
                        }}
                      >
                        <option value="">
                          {appText("Add another learner")}
                        </option>
                        {children.data.items.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.alias} · {appText(educationLabel(c))}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field
                    id="alias"
                    label={appText("Learner alias")}
                    error={errors.alias}
                    hint={appText(
                      "A name or nickname your learner likes to use.",
                    )}
                  >
                    <Input
                      id="alias"
                      value={values.alias}
                      onChange={(e) => change("alias", e.target.value)}
                      maxLength={40}
                      readOnly={!!values.childId}
                      {...errorProps("alias")}
                    />
                  </Field>
                  <Field
                    id="schoolName"
                    label={
                      selectedChild?.educationStage === "COLLEGE"
                        ? appText("College / institution name")
                        : appText("School name")
                    }
                    error={errors.schoolName}
                    hint={appText(
                      "Kept private for onboarding and tuition coordination; never listed publicly.",
                    )}
                  >
                    <Input
                      id="schoolName"
                      value={values.schoolName}
                      maxLength={160}
                      onChange={(e) => change("schoolName", e.target.value)}
                      readOnly={
                        !!children.data?.items.find(
                          (c) => c.id === values.childId,
                        )?.schoolName
                      }
                      {...errorProps("schoolName")}
                    />
                  </Field>
                  <Field
                    id="schoolSubjects"
                    label={
                      selectedChild?.educationStage === "COLLEGE"
                        ? appText("Subjects studied in this course")
                        : selectedChild?.educationStage === "EARLY_YEARS"
                          ? appText("Learning areas")
                          : appText("Subjects studied in this class")
                    }
                    error={errors.schoolSubjects}
                    hint={appText(
                      "Separate subjects with commas, for example Maths, Science, English, Hindi, Social studies.",
                    )}
                  >
                    <Textarea
                      id="schoolSubjects"
                      value={values.schoolSubjects}
                      maxLength={1220}
                      onChange={(e) => change("schoolSubjects", e.target.value)}
                      readOnly={
                        !!children.data?.items.find(
                          (c) => c.id === values.childId,
                        )?.schoolName
                      }
                      {...errorProps("schoolSubjects")}
                    />
                  </Field>
                  <p className="wizard-help">
                    {
                      values.schoolSubjects
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean).length
                    }{" "}
                    {appText(
                      "subjects listed. Choose the tuition subject separately in the next step.",
                    )}{" "}
                  </p>
                  {selectedChild &&
                  selectedChild.educationStage &&
                  selectedChild.educationStage !== "SCHOOL" ? (
                    <div className="care-review">
                      <strong>{appText(educationLabel(selectedChild))}</strong>
                      <p>
                        {appText(
                          "This enquiry uses the stage and course details in the saved learner profile.",
                        )}{" "}
                      </p>
                    </div>
                  ) : (
                    <div className="form-row">
                      <Field
                        id="grade"
                        label={appText("Class")}
                        error={errors.grade}
                      >
                        <select
                          id="grade"
                          value={values.grade}
                          onChange={(e) => change("grade", e.target.value)}
                          disabled={!!values.childId}
                          {...errorProps("grade")}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(
                            (n) => (
                              <option key={n} value={n}>
                                {appText("Class")} {n}
                              </option>
                            ),
                          )}
                        </select>
                      </Field>
                      <Field
                        id="board"
                        label={appText("Board")}
                        error={errors.board}
                      >
                        <CurriculumChoice
                          id="board"
                          value={values.board}
                          onChange={(v) => change("board", v)}
                          disabled={!!values.childId}
                          suggestions={boardSuggestions}
                          customLabel={appText("Board name")}
                          error={!!errors.board}
                          errorId={errors.board ? "board-error" : undefined}
                        />
                      </Field>
                    </div>
                  )}
                  {selectedChild && (
                    <p className="wizard-help">
                      {appText(
                        "These details come from your saved learner. To use different details, add another learner.",
                      )}{" "}
                    </p>
                  )}
                </div>
              )}
              {step === 2 && (
                <div className="wizard-fields">
                  <div className="form-row">
                    <Field
                      id="subject"
                      label={appText("Subject")}
                      error={errors.subject}
                    >
                      <CurriculumChoice
                        id="subject"
                        value={values.subject}
                        onChange={(v) => change("subject", v)}
                        suggestions={[
                          ...new Set([
                            ...subjectSuggestions,
                            ...(selectedChild?.schoolSubjects || []),
                          ]),
                        ]}
                        customLabel={appText("Subject name")}
                        error={!!errors.subject}
                        errorId={errors.subject ? "subject-error" : undefined}
                      />
                    </Field>
                    <Field
                      id="mode"
                      label={appText("Lesson format")}
                      error={errors.mode}
                    >
                      <select
                        id="mode"
                        value={values.mode}
                        onChange={(e) => change("mode", e.target.value)}
                        {...errorProps("mode")}
                      >
                        <option value="HOME">{appText("At home")}</option>
                        <option value="ONLINE">{appText("Online")}</option>
                      </select>
                    </Field>
                  </div>
                  <Field
                    id="language"
                    label={appText("Language")}
                    error={errors.language}
                  >
                    <select
                      id="language"
                      value={values.language}
                      onChange={(e) => change("language", e.target.value)}
                      {...errorProps("language")}
                    >
                      <option>{appText("English")}</option>
                      <option>{appText("Hindi")}</option>
                    </select>
                  </Field>
                  {values.mode === "HOME" && (
                    <Field
                      id="locality"
                      label={appText("Locality")}
                      error={errors.locality}
                    >
                      <select
                        id="locality"
                        value={values.locality}
                        onChange={(e) => change("locality", e.target.value)}
                        {...errorProps("locality")}
                      >
                        {[
                          "Shankar Nagar",
                          "Avanti Vihar",
                          "Telibandha",
                          "Civil Lines",
                          "Mowa",
                        ].map((l) => (
                          <option key={l}>{appText(l)}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field
                    id="budget"
                    label={appText("Monthly tuition budget (₹)")}
                    error={errors.budget}
                    hint={appText(
                      "Between ₹500 and ₹20,000. Recurring tuition is paid directly to the teacher.",
                    )}
                  >
                    <Input
                      id="budget"
                      type="number"
                      inputMode="decimal"
                      min={500}
                      max={20000}
                      step="0.01"
                      value={values.budget}
                      onChange={(e) => change("budget", e.target.value)}
                      {...errorProps("budget")}
                    />
                  </Field>
                </div>
              )}
              {step === 3 && (
                <div className="wizard-fields">
                  <AvailabilityMode
                    weekly={weeklyMode}
                    onChange={(v) => {
                      setWeeklyMode(v);
                      setSaved(false);
                      setErrors({});
                    }}
                  />
                  {weeklyMode ? (
                    <WeeklyAvailability
                      rows={weekly}
                      onChange={(v) => {
                        setWeekly(v);
                        setSaved(false);
                        setErrors({});
                      }}
                    />
                  ) : (
                    <>
                      <p>
                        {appText(
                          "All times are in India Standard Time (Asia/Kolkata). Add up to six preferred availability windows, at least one hour ahead and within the next 60 days.",
                        )}{" "}
                      </p>
                      {windows.map((window, i) => (
                        <div className="wizard-window" key={i}>
                          <Field
                            id={`window-${i}`}
                            label={appText("Preferred start time {0} (IST)", [
                              i + 1,
                            ])}
                          >
                            <Input
                              id={`window-${i}`}
                              type="datetime-local"
                              value={window.start}
                              onChange={(e) => {
                                setWindows((old) =>
                                  old.map((w, n) =>
                                    n === i
                                      ? { ...w, start: e.target.value }
                                      : w,
                                  ),
                                );
                                setSaved(false);
                              }}
                            />
                          </Field>
                          <Field
                            id={`duration-${i}`}
                            label={appText("Window length {0}", [i + 1])}
                          >
                            <select
                              id={`duration-${i}`}
                              value={window.duration}
                              onChange={(e) => {
                                setWindows((old) =>
                                  old.map((w, n) =>
                                    n === i
                                      ? { ...w, duration: e.target.value }
                                      : w,
                                  ),
                                );
                                setSaved(false);
                              }}
                            >
                              {[20, 30, 40, 60, 90, 120].map((n) => (
                                <option value={n} key={n}>
                                  {n} {appText("minutes")}{" "}
                                </option>
                              ))}
                            </select>
                          </Field>
                          {windows.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              aria-label={appText(
                                "Remove availability window {0}",
                                [i + 1],
                              )}
                              onClick={() => {
                                setWindows((old) =>
                                  old.filter((_, n) => n !== i),
                                );
                                setSaved(false);
                              }}
                            >
                              <X size={18} />
                            </Button>
                          )}
                        </div>
                      ))}
                      {errors.schedule && (
                        <p role="alert" className="auth-field-error">
                          {appError(errors.schedule)}
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={windows.length >= 6}
                        onClick={() => {
                          setWindows((old) => [
                            ...old,
                            { start: "", duration: "40" },
                          ]);
                          setSaved(false);
                        }}
                      >
                        <Plus size={17} /> {appText("Add another window")}{" "}
                      </Button>
                    </>
                  )}
                  {weeklyMode && errors.schedule && (
                    <p role="alert" className="auth-field-error">
                      {appError(errors.schedule)}
                    </p>
                  )}
                  <Field
                    id="schedule"
                    label={appText("Schedule notes (optional)")}
                    hint={appText(
                      "Anything else about your preferred days or availability.",
                    )}
                  >
                    <Textarea
                      id="schedule"
                      rows={3}
                      maxLength={300}
                      value={values.schedule}
                      onChange={(e) => change("schedule", e.target.value)}
                    />
                  </Field>
                  <p className="wizard-help">
                    {appText(
                      "These are preferences, not booked lessons. A timetable will be agreed separately.",
                    )}{" "}
                  </p>
                </div>
              )}
              {step === 4 && (
                <div className="wizard-review">
                  {[
                    {
                      title: "Learner",
                      edit: 1,
                      content: `${values.alias} · ${selectedChild ? appText(educationLabel(selectedChild)) : appText("Class {0} · {1}", [values.grade, values.board])}\n${values.schoolName}\n${appText("Subjects:")} ${values.schoolSubjects}`,
                    },
                    {
                      title: "Tuition needs",
                      edit: 2,
                      content: `${appCurriculum(values.subject)} · ${appText(values.mode === "HOME" ? "At home" : "Online")} · ${appCurriculum(values.language)}${values.mode === "HOME" ? ` · ${values.locality}` : ""}`,
                    },
                    {
                      title: "Monthly budget",
                      edit: 2,
                      content: new Intl.NumberFormat(appLocale, {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 2,
                      }).format(Number(values.budget)),
                    },
                  ].map((item) => (
                    <div className="wizard-review-row" key={item.title}>
                      <div>
                        <h3>{appText(item.title)}</h3>
                        <p>{item.content}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={uncertain}
                        onClick={() => setStep(item.edit)}
                      >
                        {appText("Edit")} {appText(item.title.toLowerCase())}
                      </Button>
                    </div>
                  ))}
                  <div className="wizard-review-row">
                    <div>
                      <h3>{appText("Preferred availability · IST")}</h3>
                      {weeklyMode && weeklyPreferences(weekly) && (
                        <WeeklySummary
                          preferences={weeklyPreferences(weekly)!}
                        />
                      )}

                      {!weeklyMode &&
                        preferences(windows)?.slots.map((s) => (
                          <p key={s.startsAt}>
                            {formatTime(s.startsAt, appLocale)} –{" "}
                            {formatTime(s.endsAt, appLocale)}
                          </p>
                        ))}
                      {values.schedule && <p>{values.schedule}</p>}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={uncertain}
                      onClick={() => setStep(3)}
                    >
                      {appText("Edit schedule")}{" "}
                    </Button>
                  </div>
                  <Alert role="status">
                    <AlertDescription>
                      {appText(
                        "You confirmed guardian permission. Submitting creates a tuition request, not a booking or payment.",
                      )}{" "}
                    </AlertDescription>
                  </Alert>
                  {errors.schedule && (
                    <p role="alert" className="auth-field-error">
                      {appError(errors.schedule)}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
            <div className="wizard-actions">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="button secondary"
                  disabled={busy || uncertain || draftLocked}
                  onClick={() => {
                    setStep((v) => v - 1);
                    setServerError("");
                    setErrors({});
                  }}
                >
                  {appText("Back")}{" "}
                </Button>
              )}
              <Button
                className="button"
                type="submit"
                disabled={busy || conflict || draftLocked}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="spin" /> {appText("Saving…")}{" "}
                  </>
                ) : (
                  appText(
                    [
                      "Agree and continue",
                      "Continue to tuition needs",
                      "Continue to schedule",
                      "Review request",
                      "Submit tuition request",
                    ][step],
                  )
                )}
                {!busy && <ArrowRight size={17} />}
              </Button>
            </div>
            <p className="wizard-save-note">
              {appText(
                "Your progress is saved securely as you continue. Changes on the current step are saved when you select Continue.",
              )}{" "}
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
