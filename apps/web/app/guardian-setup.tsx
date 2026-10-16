"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Check, GraduationCap, ShieldCheck, Search } from "lucide-react";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
type Setup = components["schemas"]["GuardianSetup"];
export function GuardianSetup({
  session,
  onSessionChange,
}: {
  session: Session;
  onSessionChange: (session: Session) => void;
}) {
  const client = useQueryClient();
  const [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [readError, setReadError] = useState("");
  const status = useQuery({
    queryKey: ["guardian-setup", session.account.id],
    queryFn: ({ signal }) => api<Setup>("/onboarding/guardian", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = status.data,
    locked = busy || status.isFetching || pending;
  async function refresh() {
    setBusy(true);
    setReadError("");
    try {
      onSessionChange(await api<Session>("/auth/session"));
      const result = await status.refetch();
      if (result.error) throw result.error;
      setPending(false);
      setMessage("");
    } catch {
      setReadError(
        "We couldn’t confirm your current setup. Refresh before continuing.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function consent() {
    if (!accepted || locked || data?.gate !== "CONSENT_REQUIRED") return;
    setBusy(true);
    setPending(true);
    setMessage("");
    try {
      await api("/consents", {
        method: "POST",
        csrf: session.csrfToken,
        body: {
          purpose: "tuition-and-learning-records",
          policyVersion: "development-v1",
          accepted: true,
        },
      });
      const result = await status.refetch();
      if (result.error) throw result.error;
      setPending(false);
      setAccepted(false);
      await client.invalidateQueries({ queryKey: ["learner-profiles"] });
      await client.invalidateQueries({ queryKey: ["hiring-dashboard"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (error) {
      const unknown =
        !(error instanceof ApiError) ||
        error.code === "INVALID_RESPONSE" ||
        error.status >= 500;
      setPending(unknown);
      setMessage(
        unknown
          ? "Your permission may have been saved. Check its current status before trying again."
          : error.message,
      );
      if (!unknown) {
        const result = await status.refetch();
        if (result.error)
          setReadError(
            "We couldn’t confirm your current setup. Refresh before continuing.",
          );
      }
    } finally {
      setBusy(false);
    }
  }
  const ready = data?.gate === "READY",
    hasLearners = ready && (data.learnerCount || 0) > 0;
  return (
    <main className="container section guardian-setup">
      <header className="wizard-title">
        <h1>A clear start for your learner.</h1>
        <p>
          Set up your guardian account, add education details, then choose how
          to find a teacher.
        </p>
        <Link href="/dashboard" className="inline-link">
          Back to dashboard
        </Link>
      </header>
      {status.isPending ? (
        <p role="status">Loading your guardian setup…</p>
      ) : status.error || readError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {readError ||
              "We couldn’t load your guardian setup. Refresh before continuing."}
            <Button variant="outline" disabled={busy} onClick={refresh}>
              Retry guardian setup
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        data && (
          <div className="guardian-setup-layout">
            <aside className="guardian-setup-path">
              <h2>Your family, your pace.</h2>
              <p>
                Save a learner profile first. Finding a teacher is a separate
                step you can return to.
              </p>
              <ol aria-label="Guardian setup steps">
                {[
                  [
                    "Your account",
                    data.gate !== "VERIFICATION_REQUIRED",
                    "Sign in and complete guardian verification.",
                  ],
                  [
                    "Guardian permission",
                    ready,
                    "Review how learner information will be used.",
                  ],
                  [
                    "Learner profiles",
                    hasLearners,
                    "Add school, early years or college details.",
                  ],
                ].map(([title, done, description], i) => (
                  <li key={String(title)}>
                    <span
                      className={
                        done
                          ? "setup-step-number complete"
                          : "setup-step-number"
                      }
                    >
                      {done ? <Check size={18} aria-label="Complete" /> : i + 1}
                    </span>
                    <div>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
            <section
              className="guardian-setup-panel"
              aria-label="Guardian setup next step"
            >
              <div className="guardian-setup-account">
                <ShieldCheck size={22} aria-hidden="true" />
                <div>
                  <strong>{data.name}</strong>
                  <p>
                    Guardian account ·{" "}
                    {data.gate === "VERIFICATION_REQUIRED"
                      ? "Verification pending"
                      : "Verified"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  disabled={busy || status.isFetching}
                  onClick={refresh}
                >
                  Refresh setup
                </Button>
              </div>
              {message && (
                <Alert variant="destructive">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
              {data.gate === "VERIFICATION_REQUIRED" ? (
                <>
                  <h2>Guardian verification comes first.</h2>
                  <p>
                    Your email sign-in does not verify your authority as a
                    guardian. Approved verification is required before entering
                    learner information.
                  </p>
                  <p>
                    You can explore teachers while verification is pending. No
                    learner details are needed here.
                  </p>
                  <Link className="inline-link" href="/support">
                    Get help with guardian verification
                  </Link>
                </>
              ) : data.gate === "PRIVACY_PAUSED" ? (
                <>
                  <h2>Learner setup is paused.</h2>
                  <p>
                    Your deletion request is being reviewed. Review its progress
                    before adding learner details or starting a new enquiry.
                  </p>
                  <Button asChild>
                    <Link href="/dashboard/privacy">
                      Review privacy request
                    </Link>
                  </Button>
                </>
              ) : data.gate === "CONSENT_REQUIRED" ? (
                <>
                  <h2>Your permission comes first.</h2>
                  <p>
                    We use learner education details and tuition needs to review
                    teacher fit and manage learning records. This permission
                    does not authorise AI training.
                  </p>
                  <p>
                    You choose a teacher after reviewing suitable options. You
                    can review or withdraw permission in Family access.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      consent();
                    }}
                  >
                    <label className="wizard-checkbox">
                      <input
                        type="checkbox"
                        checked={accepted}
                        disabled={locked}
                        onChange={(e) => setAccepted(e.target.checked)}
                        aria-describedby="guardian-permission-notice"
                      />
                      <span>
                        I am the learner’s parent or lawful guardian. I agree to
                        the use described above for tuition matching and
                        learning records.
                      </span>
                    </label>
                    <p className="wizard-help" id="guardian-permission-notice">
                      Current permission notice: development-v1. Saving
                      permission does not send a tuition enquiry.
                    </p>
                    <div className="wizard-actions">
                      {pending ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={refresh}
                        >
                          Check permission status
                        </Button>
                      ) : (
                        <Button type="submit" disabled={!accepted || locked}>
                          {busy ? "Saving permission…" : "Agree and continue"}
                        </Button>
                      )}
                    </div>
                  </form>
                </>
              ) : (
                <>
                  {data.enquiryStatus === "DRAFT" && (
                    <Alert>
                      <AlertDescription>
                        <strong>Your saved enquiry is waiting.</strong>
                        <p>
                          Your criteria are preserved. Resume when you’re ready;
                          there’s no need to start again.
                        </p>
                        <Link className="inline-link" href="/onboarding/parent">
                          Resume saved enquiry
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}
                  <GraduationCap size={30} aria-hidden="true" />
                  <h2>
                    {hasLearners
                      ? "Your learner profiles are ready to review."
                      : "Start with your first learner."}
                  </h2>
                  <p>
                    {hasLearners
                      ? `${data.learnerCount} ${data.learnerCount === 1 ? "learner has" : "learners have"} education details saved. You can manage these profiles or add another learner.`
                      : "Add a learner’s education stage, school or college, subjects and current level. You can manage more than one learner from this guardian account."}
                  </p>
                  <p>
                    Creating a profile does not send an enquiry, hire a teacher
                    or activate student access.
                  </p>
                  <div className="wizard-actions">
                    <Button asChild>
                      <Link
                        href={
                          hasLearners
                            ? "/dashboard/learners"
                            : "/dashboard/learners?new=1"
                        }
                      >
                        {hasLearners
                          ? "Manage or add learner profiles"
                          : "Add learner profile"}
                      </Link>
                    </Button>
                    {hasLearners && (
                      <Link className="inline-link" href="/dashboard/family">
                        Manage student access
                      </Link>
                    )}
                  </div>
                  {hasLearners && (
                    <div className="guardian-setup-discovery">
                      <Search size={24} aria-hidden="true" />
                      <h3>Find a teacher when you’re ready.</h3>
                      <p>
                        Browse profiles yourself, or share your criteria and let
                        us help. A match still depends on reviewed coverage and
                        teacher availability.
                      </p>
                      <div className="wizard-actions">
                        <Button asChild variant="outline">
                          <Link href="/teachers">Search teachers</Link>
                        </Button>
                        <Link
                          className="inline-link"
                          href="/onboarding/parent?discovery=ASSISTED"
                        >
                          Let us search for you
                        </Link>
                      </div>
                    </div>
                  )}
                  {data.enquiryStatus === "SUBMITTED" && (
                    <Link className="inline-link" href="/dashboard/requests">
                      View your enquiries
                    </Link>
                  )}
                </>
              )}
              {!ready && (
                <div className="guardian-setup-explore">
                  <Link href="/teachers" className="inline-link">
                    Explore teacher profiles
                  </Link>
                </div>
              )}
            </section>
          </div>
        )
      )}
    </main>
  );
}
