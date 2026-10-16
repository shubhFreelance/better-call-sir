"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type Session } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Alert, AlertDescription } from "../components/ui/alert";

type Preferences = {
  subjects?: ("Maths" | "Science")[];
  language?: "English" | "Hindi";
  learningPreferences?: string;
};
type Progress = { kind: string; draft: Preferences; version: number };
export function StudentWelcome({ session }: { session: Session }) {
  const query = useQuery({
    queryKey: ["student-preferences", session.account.id],
    queryFn: () => api<Progress>("/onboarding/student"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <main className="container section student-welcome">
      <header className="wizard-title">
        <h1>Your student space is ready.</h1>
        <p>
          Explore teachers, tell us how you like to learn, and ask your guardian
          for help.
        </p>
      </header>
      <div className="student-welcome-layout">
        <aside className="student-welcome-notice">
          <h2>A space to explore.</h2>
          <p>
            You can look at teacher profiles. Your guardian sends enquiries,
            chooses a teacher and agrees to any fees.
          </p>
          <h3>Keep your details private.</h3>
          <p>
            Do not share your phone number, address, passwords or school details
            here. Ask your guardian if anything feels uncomfortable.
          </p>
          <Link className="inline-link" href="/support">
            Get help with your guardian
          </Link>
        </aside>
        {query.isPending || query.isFetching ? (
          <p role="status">Loading your preferences…</p>
        ) : query.error || !query.data ? (
          <section className="wizard-card">
            <Alert variant="destructive">
              <AlertDescription>
                We couldn’t load your saved preferences. Try again before
                editing.
              </AlertDescription>
            </Alert>
            <Button onClick={() => query.refetch()}>
              Retry loading preferences
            </Button>
            <Link className="inline-link" href="/dashboard">
              Open dashboard
            </Link>
          </section>
        ) : (
          <PreferencesForm
            key={query.data.version}
            session={session}
            initial={query.data}
            onReload={() => query.refetch()}
          />
        )}
      </div>
    </main>
  );
}
function PreferencesForm({
  session,
  initial,
  onReload,
}: {
  session: Session;
  initial: Progress;
  onReload: () => Promise<unknown>;
}) {
  const [subjects, setSubjects] = useState(initial.draft.subjects || []),
    [language, setLanguage] = useState(initial.draft.language || ""),
    [notes, setNotes] = useState(initial.draft.learningPreferences || "");
  const [version, setVersion] = useState(initial.version),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{
    body: { expectedVersion: number; draft: Preferences };
    key: string;
  } | null>(null);
  const locked = busy || uncertain || conflict;
  async function save() {
    if (!pending.current) {
      if (notes.trim().length > 500) {
        setError("Use 500 characters or fewer.");
        return;
      }
      pending.current = {
        key: crypto.randomUUID(),
        body: {
          expectedVersion: version,
          draft: {
            subjects,
            ...(language ? { language: language as "English" | "Hindi" } : {}),
            ...(notes.trim() ? { learningPreferences: notes.trim() } : {}),
          },
        },
      };
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await api<Progress>("/onboarding/student/drafts", {
        method: "POST",
        body: pending.current.body,
        key: pending.current.key,
        csrf: session.csrfToken,
        signal: AbortSignal.timeout(15000),
      });
      if (!Number.isInteger(result.version) || result.version <= version)
        throw new Error("Save was not confirmed.");
      setVersion(result.version);
      pending.current = null;
      setUncertain(false);
      setSaved(true);
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
          ? "We couldn’t confirm the save. Retry the same preferences before making changes."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  function changed() {
    setSaved(false);
    setError("");
  }
  return (
    <form
      className="wizard-card"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !conflict) save();
      }}
    >
      <h2>What helps you learn?</h2>
      <p className="wizard-help">
        Everything here is optional. You can skip this and change your
        preferences later. Saving does not change your guardian’s enquiry or
        choose a teacher.
      </p>
      <fieldset className="wizard-fields" disabled={locked}>
        <fieldset>
          <legend>Subjects you want help with (optional)</legend>
          <div className="teacher-choices">
            {(["Maths", "Science"] as const).map((subject) => (
              <label key={subject} className="teacher-choice">
                <input
                  type="checkbox"
                  checked={subjects.includes(subject)}
                  onChange={(e) => {
                    changed();
                    setSubjects(
                      e.target.checked
                        ? [...subjects, subject]
                        : subjects.filter((s) => s !== subject),
                    );
                  }}
                />
                <span>{subject}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="student-language">
            Language you prefer (optional)
          </label>
          <select
            id="student-language"
            value={language}
            onChange={(e) => {
              changed();
              setLanguage(e.target.value);
            }}
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
            aria-describedby="student-notes-help"
            onChange={(e) => {
              changed();
              setNotes(e.target.value);
            }}
          />
          <small id="student-notes-help" className="wizard-help">
            For example, “Please explain with pictures and give me time to try.”
            Keep personal details out. {notes.length}/500 characters.
          </small>
        </div>
      </fieldset>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert role="status">
          <AlertDescription>
            Your learning preferences are saved.
          </AlertDescription>
        </Alert>
      )}
      {conflict && (
        <div className="student-preferences-recovery">
          <p>
            Your edits are still here. Reloading replaces them with the latest
            saved preferences.
          </p>
          <Button variant="outline" type="button" onClick={onReload}>
            Reload saved preferences
          </Button>
        </div>
      )}
      <div className="wizard-actions">
        <Button type="submit" disabled={busy || conflict}>
          {busy
            ? "Saving…"
            : uncertain
              ? "Retry saving preferences"
              : "Save preferences"}
        </Button>
        {!locked && (
          <Link className="inline-link" href="/dashboard">
            {saved ? "Open dashboard" : "Skip for now"}
          </Link>
        )}
      </div>
      {!locked && (
        <Link className="inline-link" href="/teachers">
          Explore teachers
        </Link>
      )}
    </form>
  );
}
