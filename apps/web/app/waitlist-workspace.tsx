"use client";
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
  const guardian = session?.account.role === "GUARDIAN";
  return (
    <main className="container section coverage-workspace">
      <header className="wizard-title">
        <h1>Tell us where to grow next.</h1>
        <p>
          Need a class, subject, board or city outside our current pilot? Record
          your interest without adding a child’s personal details.
        </p>
      </header>
      <div className="coverage-layout">
        <aside className="coverage-notice">
          <h2>Coverage is different from availability.</h2>
          <p>
            For an in-scope request with no suitable teacher right now, keep
            your enquiry and review availability or ask support for
            alternatives.
          </p>
          <Link className="inline-link" href="/teachers">
            Browse current teachers
          </Link>
          <h3>What the waitlist means</h3>
          <p>
            This records interest in future coverage. It does not book a teacher
            or promise a start date or notification.
          </p>
          <p>
            Share only learning criteria. Do not enter a learner’s name, school,
            address or contact details.
          </p>
          <Link className="inline-link" href="/dashboard/requests">
            Review existing enquiries
          </Link>
        </aside>
        <div className="coverage-content">
          {guardian && session ? (
            <WaitlistForm session={session} />
          ) : (
            <section className="wizard-card">
              <h2>
                {session
                  ? "Ask your guardian to record interest."
                  : "A guardian can join the waitlist."}
              </h2>
              <p>
                Your guardian manages enquiries and private waitlist requests.
              </p>
              {!session && (
                <Link className="button" href="/login?next=%2Fwaitlist">
                  Sign in as a guardian
                </Link>
              )}
              {session && (
                <Link className="inline-link" href="/dashboard">
                  Open dashboard
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
  const client = useQueryClient(),
    key = ["scope-waitlist", session.account.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<{ items: Entry[] }>("/waitlist"),
    retry: false,
    refetchOnWindowFocus: false,
  });
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
        !grade ||
        !board.trim() ||
        !subject.trim() ||
        !language.trim() ||
        !region.trim() ||
        !agreed
      ) {
        setError(
          "Complete each learning criterion and confirm that you understand the waitlist.",
        );
        const first = !grade
          ? "grade"
          : !board.trim()
            ? "board"
            : !subject.trim()
              ? "subject"
              : !language.trim()
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
          grade: Number(grade),
          board: board.trim(),
          subject: subject.trim(),
          language: language.trim(),
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
            ? "These criteria are already covered by the pilot. Send a free enquiry or browse teachers; a teacher still needs to be available."
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
          {saved ? "Your interest is recorded." : "Request future coverage"}
        </h2>
        {!session.account.verified && (
          <Alert>
            <AlertDescription>
              Guardian verification is pending. Complete approved verification
              and active consent before recording interest.{" "}
              <Link className="inline-link" href="/onboarding/parent">
                Review guardian onboarding
              </Link>
            </AlertDescription>
          </Alert>
        )}
        {query.isPending && <p role="status">Loading your saved requests…</p>}
        <fieldset
          disabled={locked || query.isPending}
          className="wizard-fields"
        >
          <div className="coverage-fields">
            <div className="field">
              <label htmlFor="waitlist-grade">Class</label>
              <select
                id="waitlist-grade"
                aria-invalid={!!error && !grade}
                aria-describedby={
                  error && !grade ? "waitlist-errors" : undefined
                }
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                <option value="">Choose a class</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    Class {i + 1}
                  </option>
                ))}
              </select>
            </div>
            {(
              [
                [
                  "board",
                  "School board",
                  board,
                  setBoard,
                  30,
                  "For example, ICSE",
                ],
                [
                  "subject",
                  "Subject",
                  subject,
                  setSubject,
                  40,
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
            ).map(([id, label, value, set, max, placeholder]) => (
              <div className="field" key={id}>
                <label htmlFor={`waitlist-${id}`}>{label}</label>
                <Input
                  id={`waitlist-${id}`}
                  aria-invalid={!!error && !value.trim()}
                  aria-describedby={
                    error && !value.trim() ? "waitlist-errors" : undefined
                  }
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  maxLength={max}
                  placeholder={placeholder}
                />
              </div>
            ))}
            <div className="field">
              <label htmlFor="waitlist-mode">Tuition format</label>
              <select
                id="waitlist-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "ONLINE" | "HOME")}
              >
                <option value="ONLINE">Online</option>
                <option value="HOME">At home</option>
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
              I understand this records interest only, with no teacher, start
              date or notification guaranteed.
            </span>
          </label>
        </fieldset>
        {error && (
          <Alert id="waitlist-errors" variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {code === "SUPPORTED_SCOPE" && (
          <div className="wizard-actions">
            <Link className="button" href="/onboarding/parent">
              Send a free enquiry
            </Link>
            <Link className="inline-link" href="/teachers">
              Browse teachers
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
            Review permission and verification
          </Link>
        )}
        {saved ? (
          <>
            <p role="status">
              Recorded · pending. No learner profile or tuition enquiry was
              created.
            </p>
            <p>Reference: {saved.id}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSaved(null);
                setGrade("");
                setBoard("");
                setSubject("");
                setLanguage("");
                setRegion("");
                setAgreed(false);
                setError("");
              }}
            >
              Record another coverage request
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
              ? "Saving…"
              : uncertain
                ? "Retry same waitlist request"
                : "Record my interest"}
          </Button>
        )}
      </form>
      <section className="wizard-card coverage-history">
        <div className="panel-title">
          <h2>Your coverage requests</h2>
          <Button
            variant="outline"
            disabled={busy || uncertain || query.isFetching}
            onClick={() => query.refetch()}
          >
            Refresh coverage requests
          </Button>
        </div>
        <p className="wizard-help">
          Your latest 50 recorded requests. Status does not confirm teacher
          supply or a place in a queue.
        </p>
        {query.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Saved requests could not be loaded. Refresh before creating
              another request.
            </AlertDescription>
          </Alert>
        ) : query.isPending ? (
          <p role="status">Loading recorded requests…</p>
        ) : !query.data?.items.length ? (
          <p>No coverage requests recorded yet.</p>
        ) : (
          <ul>
            {query.data.items.map((e) => (
              <li key={e.id}>
                <h3>
                  Class {e.grade} · {e.subject}
                </h3>
                <p>
                  {e.board} · {e.language} · {e.region} ·{" "}
                  {e.mode === "HOME" ? "At home" : "Online"}
                </p>
                <span className="badge">Recorded · pending</span>
                <p className="wizard-help">
                  Recorded{" "}
                  {new Date(e.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  IST · Reference {e.id.slice(0, 8)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
