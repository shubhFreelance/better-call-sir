"use client";
import { useAppTranslation } from "./locale";
import { educationLabel } from "./learner-education";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";
type Entry = components["schemas"]["Waitlist"];
type Criteria = components["schemas"]["WaitlistInput"];
export function WaitlistWorkspace({ session }: { session: Session | null }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const guardian = session?.account.role === "GUARDIAN";
  return (
    <main className="container section coverage-workspace">
      <header className="wizard-title">
        <h1>{appText("Tell us where to grow next.")}</h1>
        <p>
          {appText(
            "Need teachers in a region we do not serve yet? Record stage-specific learning criteria without adding a learner’s personal details.",
          )}{" "}
        </p>
      </header>
      <div className="coverage-layout">
        <aside className="coverage-notice">
          <h2>{appText("Coverage is different from availability.")}</h2>
          <p>
            {appText(
              "For an in-scope request with no suitable teacher right now, keep your enquiry and review availability or ask support for alternatives.",
            )}{" "}
          </p>
          <Link className="inline-link" href="/teachers">
            {appText("Browse current teachers")}{" "}
          </Link>
          <h3>{appText("What the waitlist means")}</h3>
          <p>
            {appText(
              "This records interest in future coverage. It does not book a teacher or promise a start date or notification.",
            )}{" "}
          </p>
          <p>
            {appText(
              "Share only learning criteria. Do not enter a learner’s name, school, address or contact details.",
            )}{" "}
          </p>
          <Link className="inline-link" href="/dashboard/requests">
            {appText("Review existing enquiries")}{" "}
          </Link>
        </aside>
        <div className="coverage-content">
          {guardian && session ? (
            <WaitlistForm session={session} />
          ) : (
            <section className="wizard-card">
              <h2>
                {session
                  ? appText("Ask your guardian to record interest.")
                  : appText("A guardian can join the waitlist.")}
              </h2>
              <p>
                {appText(
                  "Your guardian manages enquiries and private waitlist requests.",
                )}{" "}
              </p>
              {!session && (
                <Link className="button" href="/login?next=%2Fwaitlist">
                  {appText("Sign in as a guardian")}{" "}
                </Link>
              )}
              {session && (
                <Link className="inline-link" href="/dashboard">
                  {appText("Open dashboard")}{" "}
                </Link>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
function WaitlistForm({ session }: { session: Session }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient(),
    key = ["scope-waitlist", session.account.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<{ items: Entry[] }>("/waitlist"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [stage, setStage] = useState<"SCHOOL" | "EARLY_YEARS" | "COLLEGE">(
      "SCHOOL",
    ),
    [level, setLevel] = useState(""),
    [courseName, setCourseName] = useState(""),
    [studyYear, setStudyYear] = useState("");
  const [grade, setGrade] = useState(""),
    [board, setBoard] = useState(""),
    [subject, setSubject] = useState(""),
    [language, setLanguage] = useState(""),
    [region, setRegion] = useState(""),
    [mode, setMode] = useState<"ONLINE" | "HOME">("ONLINE"),
    [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [saved, setSaved] = useState<Entry | null>(null);
  const pending = useRef<{ body: Criteria; key: string } | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const locked =
    busy ||
    uncertain ||
    !!saved ||
    query.isFetching ||
    !!query.error ||
    !session.account.verified;
  async function save() {
    if (!pending.current) {
      if (
        (stage === "SCHOOL" && (!grade || !board.trim())) ||
        (stage === "EARLY_YEARS" && !level) ||
        (stage === "COLLEGE" &&
          (!courseName.trim() ||
            !/^\d+$/.test(studyYear) ||
            Number(studyYear) < 1 ||
            Number(studyYear) > 10)) ||
        !subject.trim() ||
        !["english", "hindi"].includes(language.trim().toLowerCase()) ||
        !region.trim() ||
        !agreed
      ) {
        setError(
          "Complete each learning criterion and confirm that you understand the waitlist.",
        );
        const first =
          stage === "SCHOOL" && !grade
            ? "grade"
            : stage === "SCHOOL" && !board.trim()
              ? "board"
              : stage === "EARLY_YEARS" && !level
                ? "level"
                : stage === "COLLEGE" && !courseName.trim()
                  ? "course"
                  : stage === "COLLEGE" &&
                      (!/^\d+$/.test(studyYear) ||
                        Number(studyYear) < 1 ||
                        Number(studyYear) > 10)
                    ? "year"
                    : !subject.trim()
                      ? "subject"
                      : !["english", "hindi"].includes(
                            language.trim().toLowerCase(),
                          )
                        ? "language"
                        : !region.trim()
                          ? "region"
                          : "ack";
        requestAnimationFrame(() =>
          document.getElementById("waitlist-" + first)?.focus(),
        );
        return;
      }
      pending.current = {
        key: crypto.randomUUID(),
        body: {
          ...(stage === "SCHOOL"
            ? { grade: Number(grade), board: board.trim() }
            : stage === "EARLY_YEARS"
              ? { stage, level: level as "NURSERY" | "KG1" | "KG2" }
              : {
                  stage,
                  courseName: courseName.trim(),
                  studyYear: Number(studyYear),
                }),
          subject: subject.trim(),
          language:
            language.trim().toLowerCase() === "hindi" ? "Hindi" : "English",
          region: region.trim(),
          mode,
        },
      };
    }
    setBusy(true);
    setError("");
    setCode("");
    try {
      const result = await api<Entry>("/waitlist", {
        method: "POST",
        body: pending.current.body,
        key: pending.current.key,
        csrf: session.csrfToken,
        signal: AbortSignal.timeout(15000),
      });
      if (!result.id || result.status !== "PENDING")
        throw new Error("The waitlist result was not confirmed.");
      pending.current = null;
      setUncertain(false);
      setSaved(result);
      client.setQueryData<{ items: Entry[] }>(key, (old) => ({
        items: [
          result,
          ...(old?.items || []).filter((e) => e.id !== result.id),
        ].slice(0, 50),
      }));
      requestAnimationFrame(() => heading.current?.focus());
    } catch (e) {
      const unknown =
        !(e instanceof ApiError) ||
        e.code === "INVALID_RESPONSE" ||
        e.status >= 500;
      setUncertain(unknown);
      if (!unknown) pending.current = null;
      setCode(e instanceof ApiError ? e.code : "");
      setError(
        unknown
          ? "We couldn’t confirm your request. Retry the same criteria before making another request."
          : e instanceof ApiError && e.code === "SUPPORTED_SCOPE"
            ? "This region accepts ordinary teacher enquiries. Send a free enquiry or browse teachers; a teacher still needs to be available."
            : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form
        className="wizard-card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!locked && !query.isPending) save();
        }}
      >
        <h2 ref={heading} tabIndex={-1}>
          {saved
            ? appText("Your interest is recorded.")
            : appText("Request future coverage")}
        </h2>
        {!session.account.verified && (
          <Alert>
            <AlertDescription>
              {appText(
                "Guardian verification is pending. Complete approved verification and active consent before recording interest.",
              )}{" "}
              <Link className="inline-link" href="/onboarding/parent">
                {appText("Review guardian onboarding")}{" "}
              </Link>
            </AlertDescription>
          </Alert>
        )}
        {query.isPending && (
          <p role="status">{appText("Loading your saved requests…")}</p>
        )}
        <fieldset
          disabled={locked || query.isPending}
          className="wizard-fields"
        >
          <div className="coverage-fields">
            <div className="field">
              <label htmlFor="waitlist-stage">
                {appText("Education stage")}
              </label>
              <select
                id="waitlist-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value as typeof stage)}
              >
                <option value="SCHOOL">
                  {appText("School — Classes 1–12")}
                </option>
                <option value="EARLY_YEARS">
                  {appText("Early years — Nursery / KG")}
                </option>
                <option value="COLLEGE">
                  {appText("College / university")}
                </option>
              </select>
            </div>
            {stage === "EARLY_YEARS" && (
              <div className="field">
                <label htmlFor="waitlist-level">
                  {appText("Early years level")}
                </label>
                <select
                  id="waitlist-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="">{appText("Choose a level")}</option>
                  <option value="NURSERY">{appText("Nursery")}</option>
                  <option value="KG1">{appText("KG1")}</option>
                  <option value="KG2">{appText("KG2")}</option>
                </select>
              </div>
            )}
            {stage === "COLLEGE" && (
              <>
                <div className="field">
                  <label htmlFor="waitlist-course">
                    {appText("Course / degree")}
                  </label>
                  <Input
                    id="waitlist-course"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    maxLength={160}
                  />
                </div>
                <div className="field">
                  <label htmlFor="waitlist-year">{appText("Study year")}</label>
                  <Input
                    id="waitlist-year"
                    value={studyYear}
                    onChange={(e) => setStudyYear(e.target.value)}
                    type="number"
                    min={1}
                    max={10}
                  />
                </div>
              </>
            )}
            {stage === "SCHOOL" && (
              <div className="field">
                <label htmlFor="waitlist-grade">{appText("Class")}</label>
                <select
                  id="waitlist-grade"
                  aria-invalid={!!error && !grade}
                  aria-describedby={
                    error && !grade ? "waitlist-errors" : undefined
                  }
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="">{appText("Choose a class")}</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {appText("Class")} {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(
              [
                [
                  "board",
                  "School board",
                  board,
                  setBoard,
                  80,
                  "For example, ICSE",
                ],
                [
                  "subject",
                  "Subject",
                  subject,
                  setSubject,
                  60,
                  "For example, English",
                ],
                [
                  "language",
                  "Teaching language",
                  language,
                  setLanguage,
                  30,
                  "For example, English",
                ],
                [
                  "region",
                  "City / region",
                  region,
                  setRegion,
                  80,
                  "For example, Raipur",
                ],
              ] as const
            )
              .filter(([id]) => id !== "board" || stage === "SCHOOL")
              .map(([id, label, value, set, max, placeholder]) => (
                <div className="field" key={id}>
                  <label htmlFor={`waitlist-${id}`}>{appText(label)}</label>
                  <Input
                    id={`waitlist-${id}`}
                    aria-invalid={!!error && !value.trim()}
                    aria-describedby={
                      error && !value.trim() ? "waitlist-errors" : undefined
                    }
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    maxLength={max}
                    placeholder={appText(placeholder)}
                  />
                </div>
              ))}
            <div className="field">
              <label htmlFor="waitlist-mode">{appText("Tuition format")}</label>
              <select
                id="waitlist-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "ONLINE" | "HOME")}
              >
                <option value="ONLINE">{appText("Online")}</option>
                <option value="HOME">{appText("At home")}</option>
              </select>
            </div>
          </div>
          <label className="wizard-checkbox">
            <input
              type="checkbox"
              id="waitlist-ack"
              aria-invalid={!!error && !agreed}
              aria-describedby={
                error && !agreed ? "waitlist-errors" : undefined
              }
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {appText(
                "I understand this records interest only, with no teacher, start date or notification guaranteed.",
              )}{" "}
            </span>
          </label>
        </fieldset>
        {error && (
          <Alert id="waitlist-errors" variant="destructive" role="alert">
            <AlertDescription>{appError(error)}</AlertDescription>
          </Alert>
        )}
        {code === "SUPPORTED_SCOPE" && (
          <div className="wizard-actions">
            <Link className="button" href="/onboarding/parent">
              {appText("Send a free enquiry")}{" "}
            </Link>
            <Link className="inline-link" href="/teachers">
              {appText("Browse teachers")}{" "}
            </Link>
          </div>
        )}
        {["CONSENT_REQUIRED", "PRIVACY_PENDING"].includes(code) && (
          <Link
            className="inline-link"
            href={
              code === "PRIVACY_PENDING"
                ? "/dashboard/privacy"
                : "/onboarding/parent"
            }
          >
            {appText("Review permission and verification")}{" "}
          </Link>
        )}
        {saved ? (
          <>
            <p role="status">
              {appText(
                "Recorded · pending. No learner profile or tuition enquiry was created.",
              )}{" "}
            </p>
            <p>
              {appText("Reference:")} {saved.id}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSaved(null);
                setStage("SCHOOL");
                setLevel("");
                setCourseName("");
                setStudyYear("");
                setGrade("");
                setBoard("");
                setSubject("");
                setLanguage("");
                setRegion("");
                setAgreed(false);
                setError("");
              }}
            >
              {appText("Record another coverage request")}{" "}
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            disabled={busy || (!uncertain && locked) || query.isPending}
            onClick={
              uncertain
                ? (e) => {
                    e.preventDefault();
                    save();
                  }
                : undefined
            }
          >
            {busy
              ? appText("Saving…")
              : uncertain
                ? appText("Retry same waitlist request")
                : appText("Record my interest")}
          </Button>
        )}
      </form>
      <section className="wizard-card coverage-history">
        <div className="panel-title">
          <h2>{appText("Your coverage requests")}</h2>
          <Button
            variant="outline"
            disabled={busy || uncertain || query.isFetching}
            onClick={() => query.refetch()}
          >
            {appText("Refresh coverage requests")}{" "}
          </Button>
        </div>
        <p className="wizard-help">
          {appText(
            "Your latest 50 recorded requests. Status does not confirm teacher supply or a place in a queue.",
          )}{" "}
        </p>
        {query.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {appText(
                "Saved requests could not be loaded. Refresh before creating another request.",
              )}{" "}
            </AlertDescription>
          </Alert>
        ) : query.isPending ? (
          <p role="status">{appText("Loading recorded requests…")}</p>
        ) : !query.data?.items.length ? (
          <p>{appText("No coverage requests recorded yet.")}</p>
        ) : (
          <ul>
            {query.data.items.map((e) => (
              <li key={e.id}>
                <h3>
                  {e.educationStage === "COLLEGE" ||
                  e.educationStage === "EARLY_YEARS"
                    ? appText(educationLabel(e))
                    : appText("Class {0}", [e.grade])}{" "}
                  · {appCurriculum(e.subject)}
                </h3>
                <p>
                  {e.board && <>{e.board} · </>}
                  {appCurriculum(e.language)} · {e.region} ·{" "}
                  {e.mode === "HOME" ? appText("At home") : appText("Online")}
                </p>
                <span className="badge">{appText("Recorded · pending")}</span>
                <p className="wizard-help">
                  {appText("Recorded")}{" "}
                  {new Date(e.createdAt).toLocaleString(appLocale, {
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  {appText("IST · Reference")} {e.id.slice(0, 8)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
