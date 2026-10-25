"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { GraduationCap, Search } from "lucide-react";
import {
  OnboardingReadBoundary,
  onboardingAccessDenied,
} from "./onboarding-read-boundary";
import { useAppTranslation } from "./locale";
import { StudentLearningSummary } from "./independent-journey";
import { GuardianHandoff } from "./guardian-handoff";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";

type Profile = components["schemas"]["IndependentStudentProfile"];
type Education = components["schemas"]["IndependentStudentEducation"];
type Context = components["schemas"]["IndependentStudentSignupContext"];
const policyVersion = "independent-student-development-v1";
function Message({ children }: { children: ReactNode }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <Alert>
      <AlertDescription>{appText(children)}</AlertDescription>
    </Alert>
  );
}
export function EducationSummary({
  education: e,
  hindi,
}: {
  education: Education;
  hindi: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <dl className="independent-summary">
      <dt>{hindi ? "पढ़ाई" : appText("Education")}</dt>
      <dd>
        {e.stage === "SCHOOL"
          ? `${hindi ? "कक्षा" : "Class"} ${e.grade} · ${e.board}`
          : `${e.courseName} · ${hindi ? "वर्ष" : "Year"} ${e.studyYear}`}
      </dd>
      <dt>{hindi ? "संस्थान" : appText("Institution")}</dt>
      <dd>{e.institutionName}</dd>
      {e.stage === "COLLEGE" && (
        <>
          <dt>{hindi ? "विश्वविद्यालय" : appText("University")}</dt>
          <dd>{e.university}</dd>
        </>
      )}
      <dt>{hindi ? "पढ़ने वाले विषय" : appText("Subjects studied")}</dt>
      <dd>{e.subjects.map((value) => appCurriculum(value)).join(", ")}</dd>
    </dl>
  );
}
export function IndependentStudentSetup({
  session,
  onSessionChange,
  hindi,
  onLanguageChange,
  editing = false,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
  hindi: boolean;
  onLanguageChange: (hindi: boolean) => void;
  editing?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const router = useRouter(),
    client = useQueryClient();
  const [opening, setOpening] = useState(false),
    [sessionError, setSessionError] = useState(false);
  async function openDashboard() {
    setOpening(true);
    setSessionError(false);
    try {
      const current = await api<Session>("/auth/session");
      client.clear();
      onSessionChange(current);
      router.push("/dashboard");
    } catch {
      setSessionError(true);
    } finally {
      setOpening(false);
    }
  }
  const query = useQuery({
    queryKey: ["independent-signup", session.account.id],
    queryFn: ({ signal }) =>
      api<Context>("/independent-student/signup", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const t = (en: string, hi: string) => (hindi ? hi : en);
  return (
    <main
      className="container section independent-student"
      lang={hindi ? "hi" : "en"}
    >
      <div className="independent-language">
        <label htmlFor="independent-language">
          {appText(t("Language", "भाषा"))}
        </label>
        <select
          id="independent-language"
          value={hindi ? "hi" : "en"}
          onChange={(event) => onLanguageChange(event.target.value === "hi")}
        >
          <option value="en">{appText("English")}</option>
          <option value="hi">हिन्दी</option>
        </select>
      </div>
      <header className="wizard-title">
        <h1>
          {editing
            ? t("Your education profile", "आपकी पढ़ाई की प्रोफ़ाइल")
            : t("Your learning. Your next step.", "आपकी पढ़ाई। आपका अगला कदम।")}
        </h1>
        <p>
          {appText(
            t(
              "Set up a student account for your own learning, with clear choices about support.",
              "अपनी पढ़ाई के लिए विद्यार्थी खाता बनाएँ और मदद का सही विकल्प चुनें।",
            ),
          )}
        </p>
      </header>
      <div className="independent-layout">
        <section
          className="independent-main"
          aria-label={appText(t("Student setup", "विद्यार्थी सेटअप"))}
        >
          {query.isPending && (
            <p role="status">
              {appText(t("Checking your account…", "आपका खाता जाँच रहे हैं…"))}
            </p>
          )}
          {query.error &&
            (!query.data ||
              onboardingAccessDenied(query.error) ||
              !(
                query.data.status === "READY" ||
                (editing && query.data.profile)
              )) && (
              <Message>
                {appText(
                  t(
                    "We couldn’t check your setup. No details have been submitted.",
                    "आपका सेटअप नहीं जाँच पाए। कोई जानकारी जमा नहीं हुई है।",
                  ),
                )}{" "}
                <Button
                  disabled={query.isFetching}
                  onClick={() => query.refetch()}
                >
                  {appText(t("Retry account check", "खाता फिर जाँचें"))}
                </Button>
              </Message>
            )}
          {!query.error && query.data?.status === "ACCOUNT_IN_USE" && (
            <Message>
              {appText(
                t(
                  "This email already has another setup. Keep that account, or sign out and use a separate student email.",
                  "इस ईमेल पर पहले से दूसरा सेटअप है। उसी खाते का इस्तेमाल करें या साइन आउट करके विद्यार्थी का अलग ईमेल इस्तेमाल करें।",
                ),
              )}{" "}
              <Link className="inline-link" href="/dashboard">
                {appText(t("Open my dashboard", "मेरा डैशबोर्ड खोलें"))}
              </Link>
            </Message>
          )}
          {!query.error && query.data?.status === "COMPLETE" && !editing && (
            <div className="wizard-card">
              <h2>
                {appText(
                  t(
                    "Your student account is ready",
                    "आपका विद्यार्थी खाता तैयार है",
                  ),
                )}
              </h2>
              <EducationSummary
                education={query.data.profile!.education}
                hindi={hindi}
              />
              {sessionError && (
                <Message>
                  {appText(
                    t(
                      "We couldn’t refresh your sign-in. Your profile is saved; retry opening the dashboard.",
                      "साइन-इन फिर जाँच नहीं पाए। प्रोफ़ाइल सहेजी गई है; डैशबोर्ड फिर खोलें।",
                    ),
                  )}
                </Message>
              )}
              <Button disabled={opening} onClick={openDashboard}>
                {opening
                  ? t("Opening…", "खोल रहे हैं…")
                  : t("Open my dashboard", "मेरा डैशबोर्ड खोलें")}
              </Button>
            </div>
          )}
          {!onboardingAccessDenied(query.error) &&
            (query.data?.status === "READY" ||
              (editing && query.data?.profile)) && (
              <OnboardingReadBoundary
                error={query.error}
                busy={query.isFetching}
                onRetry={() => query.refetch()}
              >
                <StudentForm
                  key={`${session.account.id}:${query.data.profile?.version || 0}`}
                  session={session}
                  profile={query.data.profile}
                  hindi={hindi}
                  onSessionChange={onSessionChange}
                  reload={() => query.refetch()}
                />
              </OnboardingReadBoundary>
            )}
        </section>
        <aside className="independent-guide">
          <h2>
            {appText(
              t("A profile that belongs to you.", "आपकी अपनी प्रोफ़ाइल।"),
            )}
          </h2>
          <p>
            {appText(
              t(
                "Independent setup is currently for students who declare they are 18 or older and ready to manage their learning.",
                "फ़िलहाल स्वतंत्र सेटअप उन विद्यार्थियों के लिए है जो 18 वर्ष या उससे अधिक होने और अपनी पढ़ाई सँभालने की घोषणा करते हैं।",
              ),
            )}
          </p>
          <p>
            {appText(
              t(
                "Your school, college and subjects stay private. Saving this profile does not send an enquiry or hire a teacher.",
                "स्कूल, कॉलेज और विषयों की जानकारी निजी रहती है। प्रोफ़ाइल सहेजने से पूछताछ नहीं भेजी जाती और शिक्षक नियुक्त नहीं होता।",
              ),
            )}
          </p>
          <p>
            {appText(
              t(
                "After setup, you can invite a trusted supporter with advice or learning-management permissions. No one receives access from this form.",
                "खाता बनने के बाद भरोसेमंद मददगार को सलाह या पढ़ाई सँभालने की अनुमति दे सकते हैं। इस फ़ॉर्म से किसी को अनुमति नहीं मिलती।",
              ),
            )}
          </p>
          <Link href="/teachers" className="inline-link">
            {appText(t("Explore teachers first", "पहले शिक्षक देखें"))}
          </Link>
        </aside>
      </div>
    </main>
  );
}
export function StudentForm({
  session,
  profile,
  hindi,
  onSessionChange,
  reload,
  updatePath,
  onSaved,
}: {
  session: Session;
  profile: Profile | null;
  hindi: boolean;
  onSessionChange: (s: Session) => void;
  reload: () => unknown;
  updatePath?: string;
  onSaved?: () => Promise<void>;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const t = (en: string, hi: string) => (hindi ? hi : en),
    router = useRouter(),
    client = useQueryClient();
  const e = profile?.education;
  const [step, setStep] = useState(profile ? 2 : 1),
    [readiness, setReadiness] = useState(""),
    [age, setAge] = useState(""),
    [accepted, setAccepted] = useState(false);
  const [values, setValues] = useState({
    stage: e?.stage || "",
    institutionName: e?.institutionName || "",
    subjects: e?.subjects.join(", ") || "",
    grade: e?.stage === "SCHOOL" ? String(e.grade) : "",
    board: e?.stage === "SCHOOL" ? e.board : "",
    courseName: e?.stage === "COLLEGE" ? e.courseName : "",
    university: e?.stage === "COLLEGE" ? e.university : "",
    studyYear: e?.stage === "COLLEGE" ? String(e.studyYear) : "",
  });
  const [review, setReview] = useState<Education | null>(null),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [blocked, setBlocked] = useState(false),
    [stale, setStale] = useState(false),
    [saved, setSaved] = useState(false);
  const pending = useRef<{ path: string; body: unknown; key: string } | null>(
      null,
    ),
    sending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const locked =
    busy ||
    uncertain ||
    blocked ||
    stale ||
    saved ||
    profile?.editStatus === "PRIVACY_PAUSED";
  function move(next: number) {
    setStep(next);
    setError("");
    setErrors({});
    requestAnimationFrame(() => heading.current?.focus());
  }
  function change(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }
  function validateEducation() {
    const next: Record<string, string> = {},
      required = t("Complete this field.", "यह जानकारी भरें।"),
      subjects = values.subjects
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    for (const name of [
      "stage",
      "institutionName",
      "subjects",
      ...(values.stage === "SCHOOL"
        ? ["grade", "board"]
        : ["courseName", "university", "studyYear"]),
    ])
      if (!values[name as keyof typeof values].trim()) next[name] = required;
    for (const name of ["institutionName", "courseName", "university"] as const)
      if (values[name].trim().length > 160)
        next[name] = t("Use 160 characters or fewer.", "160 अक्षरों तक लिखें।");
    if (values.board.trim().length > 80)
      next.board = t("Use 80 characters or fewer.", "80 अक्षरों तक लिखें।");
    if (
      !subjects.length ||
      subjects.length > 20 ||
      subjects.some((s) => s.length > 60) ||
      new Set(subjects.map((s) => s.toLowerCase())).size !== subjects.length
    )
      next.subjects = t(
        "Enter 1–20 different subjects, up to 60 characters each.",
        "1–20 अलग विषय लिखें, हर विषय अधिकतम 60 अक्षर का हो।",
      );
    if (
      values.stage === "SCHOOL" &&
      (!/^\d+$/.test(values.grade) || +values.grade < 1 || +values.grade > 12)
    )
      next.grade = t(
        "Choose a class from 1 to 12.",
        "कक्षा 1 से 12 में चुनें।",
      );
    if (
      values.stage === "COLLEGE" &&
      (!/^\d+$/.test(values.studyYear) ||
        +values.studyYear < 1 ||
        +values.studyYear > 10)
    )
      next.studyYear = t(
        "Enter a year from 1 to 10.",
        "वर्ष 1 से 10 में लिखें।",
      );
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        document.getElementById("independent-" + Object.keys(next)[0])?.focus(),
      );
      return;
    }
    setReview(
      values.stage === "SCHOOL"
        ? {
            stage: "SCHOOL",
            institutionName: values.institutionName.trim(),
            subjects,
            grade: +values.grade,
            board: values.board.trim(),
          }
        : {
            stage: "COLLEGE",
            institutionName: values.institutionName.trim(),
            subjects,
            courseName: values.courseName.trim(),
            university: values.university.trim(),
            studyYear: +values.studyYear,
          },
    );
    setAccepted(false);
    move(3);
  }
  async function save() {
    if (
      sending.current ||
      blocked ||
      stale ||
      !review ||
      !accepted ||
      profile?.editStatus === "PRIVACY_PAUSED"
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    if (!pending.current)
      pending.current = {
        path: profile
          ? updatePath || "/independent-student/profile/updates"
          : "/independent-student/signup",
        key: crypto.randomUUID(),
        body: profile
          ? {
              education: review,
              expectedVersion: profile.version,
              confirmed: true,
            }
          : {
              education: review,
              managementPreference: "SELF_DIRECTED",
              adultDeclaration: true,
              consentAccepted: true,
              policyVersion,
            },
      };
    try {
      await api<Profile>(pending.current.path, {
        method: "POST",
        body: pending.current.body,
        key: pending.current.key,
        csrf: session.csrfToken,
      });
      if (onSaved) {
        await onSaved();
        setUncertain(false);
        setSaved(true);
        return;
      }
      const next = await api<Session>("/auth/session");
      client.clear();
      onSessionChange(next);
      setUncertain(false);
      setSaved(true);
      router.replace("/dashboard");
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status >= 500) {
        setUncertain(true);
        setError(
          t(
            "We couldn’t confirm the result. Your reviewed details are locked; retry the same save safely.",
            "नतीजे की पुष्टि नहीं हुई। समीक्षा की गई जानकारी लॉक है; वही जानकारी फिर सुरक्षित रूप से सहेजें।",
          ),
        );
      } else {
        setUncertain(false);
        pending.current = null;
        setBlocked([401, 403].includes(cause.status));
        setStale(cause.status === 409);
        setError(
          cause.status === 409
            ? t(
                "Your account or profile changed. Reload and review the latest details before saving.",
                "खाता या प्रोफ़ाइल बदल गई है। नई जानकारी लोड करके फिर समीक्षा करें।",
              )
            : t(
                "The service could not save these details. Check your account and try again.",
                "यह जानकारी सहेजी नहीं जा सकी। अपना खाता जाँचकर फिर कोशिश करें।",
              ),
        );
      }
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }
  function field(
    name: keyof typeof values,
    label: string,
    maxLength: number,
    help?: string,
  ) {
    return (
      <div className="field" key={name}>
        <label htmlFor={"independent-" + name}>{appText(label)}</label>
        <Input
          id={"independent-" + name}
          value={values[name]}
          maxLength={maxLength}
          inputMode={name === "studyYear" ? "numeric" : undefined}
          disabled={locked}
          aria-invalid={!!errors[name]}
          aria-describedby={
            errors[name] ? name + "-error" : help ? name + "-help" : undefined
          }
          onChange={(event) => change(name, event.target.value)}
        />
        {help && (
          <p className="care-help" id={name + "-help"}>
            {appText(help)}
          </p>
        )}
        {errors[name] && (
          <p className="field-error" id={name + "-error"}>
            {appError(errors[name])}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="wizard-card independent-form">
      <ol
        className="student-setup-steps"
        aria-label={appText(t("Signup progress", "साइनअप के चरण"))}
      >
        {[
          t("Readiness", "तैयारी"),
          t("Education", "पढ़ाई"),
          t("Review", "समीक्षा"),
        ].map((label, i) => (
          <li key={i} aria-current={step === i + 1 ? "step" : undefined}>
            {i + 1}. {appText(label)}
          </li>
        ))}
      </ol>
      <h2 ref={heading} tabIndex={-1}>
        {step === 1
          ? t(
              "How would you like to manage learning?",
              "आप अपनी पढ़ाई कैसे सँभालना चाहेंगे?",
            )
          : step === 2
            ? t("Tell us about your education", "अपनी पढ़ाई के बारे में बताएँ")
            : t(
                "Review your student profile",
                "अपनी विद्यार्थी प्रोफ़ाइल की समीक्षा करें",
              )}
      </h2>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{appError(error)}</AlertDescription>
        </Alert>
      )}
      {profile?.editStatus === "PRIVACY_PAUSED" && (
        <Message>
          {appText(
            t(
              "Profile changes are paused while your deletion request is reviewed.",
              "आपके खाता मिटाने के अनुरोध की समीक्षा तक बदलाव रुके हुए हैं।",
            ),
          )}
        </Message>
      )}
      {stale && (
        <RefreshButton variant="outline" onClick={() => reload()} label={appText(
            t("Discard edits and reload", "बदलाव छोड़ें और फिर लोड करें"),
          )} />
      )}
      {blocked && (
        <Link href="/login" className="inline-link">
          {appText(t("Sign in again", "फिर साइन इन करें"))}
        </Link>
      )}
      {step === 1 && (
        <>
          <fieldset className="student-support-choices">
            <legend>
              {appText(t("Choose the support you need", "ज़रूरी मदद चुनें"))}
            </legend>
            {[
              [
                "SELF_DIRECTED",
                t(
                  "I can manage my learning",
                  "मैं अपनी पढ़ाई सँभाल सकता/सकती हूँ",
                ),
                t(
                  "I can choose teachers and explain the help I need.",
                  "मैं शिक्षक चुन सकता/सकती हूँ और अपनी ज़रूरत समझा सकता/सकती हूँ।",
                ),
              ],
              [
                "GUARDIAN_GUIDED",
                t(
                  "I need a guardian to guide me",
                  "मुझे अभिभावक के मार्गदर्शन की ज़रूरत है",
                ),
                t(
                  "A parent or guardian should help manage my profile and choices.",
                  "माता-पिता या अभिभावक मेरी प्रोफ़ाइल और फैसले सँभालने में मदद करें।",
                ),
              ],
            ].map(([value, label, help]) => (
              <label
                className={
                  "student-support-choice" +
                  (readiness === value ? " selected" : "")
                }
                key={value}
              >
                <input
                  type="radio"
                  name="readiness"
                  value={value}
                  checked={readiness === value}
                  onChange={() => setReadiness(value)}
                />
                <span>
                  <strong>{appText(label)}</strong>
                  <small>{appText(help)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {readiness === "SELF_DIRECTED" && (
            <fieldset className="independent-age">
              <legend>
                {appText(t("Account eligibility", "खाते की पात्रता"))}
              </legend>
              {[
                [
                  "ADULT",
                  t(
                    "I declare that I am 18 or older",
                    "मैं घोषणा करता/करती हूँ कि मेरी उम्र 18 वर्ष या अधिक है",
                  ),
                ],
                ["UNDER_18", t("I am under 18", "मेरी उम्र 18 वर्ष से कम है")],
              ].map(([value, label]) => (
                <label className="wizard-checkbox" key={value}>
                  <input
                    type="radio"
                    name="age"
                    value={value}
                    checked={age === value}
                    onChange={() => setAge(value)}
                  />
                  <span>{appText(label)}</span>
                </label>
              ))}
              <p className="care-help">
                {appText(
                  t(
                    "Readiness and age are separate. This declaration is not an identity check.",
                    "तैयारी और उम्र अलग बातें हैं। यह घोषणा पहचान का सत्यापन नहीं है।",
                  ),
                )}
              </p>
            </fieldset>
          )}
          {(readiness === "GUARDIAN_GUIDED" ||
            (age === "UNDER_18" && readiness === "SELF_DIRECTED")) && (
            <GuardianHandoff allowIndependent={readiness === "GUARDIAN_GUIDED"} onChooseIndependent={()=>{setReadiness("SELF_DIRECTED");setAge("");requestAnimationFrame(()=>heading.current?.focus());}} />
          )}
          {readiness !== "GUARDIAN_GUIDED" && !(readiness === "SELF_DIRECTED" && age === "UNDER_18") && <div className="wizard-actions">
            <Button
              key="readiness-next"
              disabled={readiness !== "SELF_DIRECTED" || age !== "ADULT"}
              onClick={() => move(2)}
            >
              {appText(t("Continue to education", "पढ़ाई की जानकारी भरें"))}
            </Button>
          </div>}
        </>
      )}
      {step === 2 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!locked) validateEducation();
          }}
          noValidate
        >
          <fieldset disabled={locked} className="independent-fields">
            <div className="field">
              <label htmlFor="independent-stage">
                {appText(t("Education stage", "पढ़ाई का स्तर"))}
              </label>
              <select
                id="independent-stage"
                value={values.stage}
                aria-invalid={!!errors.stage}
                aria-describedby={errors.stage ? "stage-error" : undefined}
                onChange={(event) => change("stage", event.target.value)}
              >
                <option value="">
                  {appText(t("Choose your stage", "अपना स्तर चुनें"))}
                </option>
                <option value="SCHOOL">{appText(t("School", "स्कूल"))}</option>
                <option value="COLLEGE">
                  {appText(t("College / university", "कॉलेज / विश्वविद्यालय"))}
                </option>
              </select>
              {errors.stage && (
                <p className="field-error" id="stage-error">
                  {appError(errors.stage)}
                </p>
              )}
            </div>
            {field(
              "institutionName",
              t("School / college name", "स्कूल / कॉलेज का नाम"),
              160,
            )}
            {values.stage === "SCHOOL" && (
              <>
                <div className="field">
                  <label htmlFor="independent-grade">
                    {appText(t("Class", "कक्षा"))}
                  </label>
                  <select
                    id="independent-grade"
                    value={values.grade}
                    aria-invalid={!!errors.grade}
                    aria-describedby={errors.grade ? "grade-error" : undefined}
                    onChange={(event) => change("grade", event.target.value)}
                  >
                    <option value="">
                      {appText(t("Choose a class", "कक्षा चुनें"))}
                    </option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                  {errors.grade && (
                    <p id="grade-error" className="field-error">
                      {appError(errors.grade)}
                    </p>
                  )}
                </div>
                {field("board", t("School board", "स्कूल बोर्ड"), 80)}
              </>
            )}
            {values.stage === "COLLEGE" && (
              <>
                {field(
                  "courseName",
                  t("Course / degree", "कोर्स / डिग्री"),
                  160,
                )}
                {field(
                  "university",
                  t(
                    "University / awarding institution",
                    "विश्वविद्यालय / डिग्री देने वाला संस्थान",
                  ),
                  160,
                )}
                {field(
                  "studyYear",
                  t("Current year of study", "पढ़ाई का मौजूदा वर्ष"),
                  2,
                )}
              </>
            )}
            {field(
              "subjects",
              t("Subjects studied", "पढ़ने वाले विषय"),
              1259,
              t(
                "Separate subjects with commas. Include all the subjects you currently study.",
                "विषयों को कॉमा से अलग करें। अभी पढ़ने वाले सभी विषय लिखें।",
              ),
            )}
          </fieldset>
          <div className="wizard-actions">
            {!profile && (
              <Button
                key="education-back"
                type="button"
                variant="outline"
                disabled={locked}
                onClick={() => move(1)}
              >
                {appText(t("Back", "पीछे"))}
              </Button>
            )}
            <Button key="education-review" type="submit" disabled={locked}>
              {appText(t("Review profile", "प्रोफ़ाइल की समीक्षा करें"))}
            </Button>
          </div>
        </form>
      )}
      {step === 3 && review && (
        <>
          <EducationSummary education={review} hindi={hindi} />
          <div className="independent-consent">
            <h3>
              {profile
                ? t("Confirm this update", "इस बदलाव की पुष्टि करें")
                : t("Your permission", "आपकी सहमति")}
            </h3>
            <p>
              {appText(
                t(
                  "Your education details are used to maintain your private student profile and prepare teacher discovery. They are not published on teacher cards or shared with a guardian by this signup.",
                  "पढ़ाई की जानकारी आपकी निजी विद्यार्थी प्रोफ़ाइल रखने और शिक्षक खोज की तैयारी के लिए है। यह शिक्षक कार्ड पर प्रकाशित नहीं होती और इस साइनअप से किसी अभिभावक को नहीं मिलती।",
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
                {profile
                  ? t(
                      "I reviewed and confirm these changes.",
                      "मैंने इन बदलावों की समीक्षा की है और पुष्टि करता/करती हूँ।",
                    )
                  : t(
                      "I am 18 or older, can manage my learning, and agree to my education details being stored for this purpose.",
                      "मैं 18 वर्ष या अधिक का/की हूँ, अपनी पढ़ाई सँभाल सकता/सकती हूँ और इस उद्देश्य से पढ़ाई की जानकारी रखने की सहमति देता/देती हूँ।",
                    )}
              </span>
            </label>
            <p className="care-help">
              {appText(
                t(
                  "You can edit education details and request account correction or deletion from your dashboard.",
                  "डैशबोर्ड से पढ़ाई की जानकारी बदल सकते हैं और खाता सुधारने या मिटाने का अनुरोध कर सकते हैं।",
                ),
              )}
            </p>
          </div>
          <div className="wizard-actions">
            <Button
              key="review-edit"
              variant="outline"
              disabled={locked}
              onClick={() => move(2)}
            >
              {appText(t("Edit education", "पढ़ाई की जानकारी बदलें"))}
            </Button>
            <Button
              key="review-save"
              disabled={
                busy ||
                blocked ||
                stale ||
                saved ||
                !accepted ||
                profile?.editStatus === "PRIVACY_PAUSED"
              }
              onClick={save}
            >
              {busy
                ? t("Saving…", "सहेज रहे हैं…")
                : uncertain
                  ? t("Retry same save", "वही जानकारी फिर सहेजें")
                  : profile
                    ? t("Save profile changes", "प्रोफ़ाइल के बदलाव सहेजें")
                    : t(
                        "Create my student account",
                        "मेरा विद्यार्थी खाता बनाएँ",
                      )}
            </Button>
          </div>
        </>
      )}
      <p className="care-help">
        {appText(
          t(
            "Unsubmitted details stay on this page only. Reloading before saving clears them.",
            "जमा करने से पहले जानकारी केवल इस पेज पर रहती है। सहेजने से पहले पेज फिर लोड करने पर यह हट जाएगी।",
          ),
        )}
      </p>
    </div>
  );
}
export function IndependentStudentHome({
  session,
  hindi,
}: {
  session: Session;
  hindi: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const query = useQuery({
      queryKey: ["independent-profile", session.account.id],
      queryFn: ({ signal }) =>
        api<Profile>("/independent-student/profile", { signal }),
      retry: false,
    }),
    t = (en: string, hi: string) => (hindi ? hi : en);
  return (
    <>
      <h1>
        {appText(t("Your learning starts here,", "आपकी पढ़ाई का अगला कदम,"))}{" "}
        {session.account.name}.
      </h1>
      <p>
        {appText(
          t(
            "Your own profile, with a clear path to finding a teacher.",
            "आपकी अपनी प्रोफ़ाइल और शिक्षक खोजने का साफ़ रास्ता।",
          ),
        )}
      </p>
      {query.isPending && (
        <p role="status">
          {appText(t("Loading your profile…", "आपकी प्रोफ़ाइल लोड हो रही है…"))}
        </p>
      )}
      {query.error && (
        <Message>
          {appText(
            t("We couldn’t load your profile.", "आपकी प्रोफ़ाइल लोड नहीं हुई।"),
          )}{" "}
          <Button onClick={() => query.refetch()}>
            {appText(t("Try again", "फिर कोशिश करें"))}
          </Button>
        </Message>
      )}
      {query.data && <StudentLearningSummary session={session} hindi={hindi} />}
      {query.data && (
        <div className="independent-layout">
          <section className="wizard-card independent-profile">
            <div className="overview-card-art is-lavender" aria-hidden="true"><GraduationCap size={34} /></div>
            <h2>{appText(t("My education", "मेरी पढ़ाई"))}</h2>
            <EducationSummary education={query.data.education} hindi={hindi} />
            <p>
              {appText(
                t(
                  "Learning preference: I manage my learning.",
                  "पढ़ाई का विकल्प: मैं अपनी पढ़ाई सँभालता/सँभालती हूँ।",
                ),
              )}
            </p>
            {query.data.editStatus === "PRIVACY_PAUSED" ? (
              <Message>
                {appText(
                  t(
                    "Education changes are paused while your deletion request is reviewed.",
                    "खाता मिटाने के अनुरोध की समीक्षा तक पढ़ाई के बदलाव रुके हैं।",
                  ),
                )}
              </Message>
            ) : (
              <Link
                className="button secondary"
                href="/onboarding/independent-student?edit=1"
              >
                {appText(t("Edit my education", "पढ़ाई की जानकारी बदलें"))}
              </Link>
            )}
          </section>
          <aside className="independent-guide">
            <div className="overview-card-art is-teal" aria-hidden="true"><Search size={34} /></div>
            <h2>
              {appText(
                t("Find your kind of teacher.", "अपनी ज़रूरत का शिक्षक खोजें।"),
              )}
            </h2>
            <p>
              {appText(
                t(
                  "Browse reviewed subjects, education levels, teaching modes and fees.",
                  "समीक्षित विषय, पढ़ाई का स्तर, पढ़ाने का तरीका और फ़ीस देखें।",
                ),
              )}
            </p>
            <Link href="/teachers" className="button">
              {appText(t("Explore teachers", "शिक्षक देखें"))}
            </Link>
            <p>
              {appText(
                t(
                  "Enquire directly with a teacher or ask for an assisted shortlist. Teacher replies and tuition terms stay in your dashboard.",
                  "सीधे शिक्षक को अनुरोध भेजें या सूची बनवाने के लिए मदद माँगें। शिक्षक के जवाब और ट्यूशन की शर्तें आपके डैशबोर्ड में रहेंगी।",
                ),
              )}
            </p>
            <Link
              className="button secondary"
              href="/dashboard/enquiries?new=1"
            >
              {appText(t("Let us search for you", "हमें आपके लिए खोजने दें"))}
            </Link>
            <Link className="inline-link" href="/dashboard/privacy">
              {appText(
                t(
                  "Account privacy and deletion",
                  "खाते की गोपनीयता और मिटाने के अनुरोध",
                ),
              )}
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
