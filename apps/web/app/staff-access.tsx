"use client";
import { useAppTranslation } from "./locale";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, KeyRound } from "lucide-react";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Notice } from "./tuition-workflow";
export const staffRole = (role: string) =>
  ["ADMIN", "OPERATOR", "REVIEWER", "FINANCE"].includes(role);
type Status = components["schemas"]["MfaStatus"];
async function loadStatus(signal?: AbortSignal) {
  const result = await api<Status>("/auth/mfa", { signal });
  if (
    typeof result?.enabled !== "boolean" ||
    !Number.isInteger(result.recoveryCodesRemaining) ||
    result.recoveryCodesRemaining < 0 ||
    result.recoveryCodesRemaining > 8 ||
    !(
      result.verifiedUntil === null ||
      (typeof result.verifiedUntil === "string" &&
        Number.isFinite(Date.parse(result.verifiedUntil)))
    )
  )
    throw new ApiError(
      502,
      "INVALID_RESPONSE",
      "Current authenticator status could not be verified.",
    );
  return result;
}
export function StaffAccess({
  session,
  children,
  onSignIn,
}: {
  session: Session | null;
  children: ReactNode;
  onSignIn: () => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const path = usePathname();
  return session &&
    staffRole(session.account.role) &&
    (path.startsWith("/dashboard") || path === "/guardian-verification") ? (
    <VerifiedStaff
      key={session.account.id}
      session={session}
      onSignIn={onSignIn}
      managing={path === "/dashboard/security"}
    >
      {children}
    </VerifiedStaff>
  ) : (
    children
  );
}
function VerifiedStaff({
  session,
  children,
  onSignIn,
  managing,
}: {
  session: Session;
  children: ReactNode;
  onSignIn: () => void;
  managing: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const client = useQueryClient(),
    key = ["mfa-status", session.account.id];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadStatus(signal),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const [now, setNow] = useState(Date.now()),
    [hold, setHold] = useState(false),
    [denied, setDenied] = useState(false);
  useEffect(() => {
    const tick = () => setNow(Date.now()),
      timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "error") {
          const error = event.query.state.error;
          if (
            error instanceof ApiError &&
            [
              "MFA_REQUIRED",
              "SESSION_REQUIRED",
              "SESSION_EXPIRED",
              "SESSION_REVOKED",
            ].includes(error.code)
          )
            setDenied(true);
        }
      }),
    [client],
  );
  const verified =
      !!query.data?.enabled &&
      !!query.data.verifiedUntil &&
      Date.parse(query.data.verifiedUntil) > now &&
      !query.error &&
      !denied,
    blocked = !verified || hold;
  useEffect(() => {
    if (!blocked) return;
    const privateQueries = {
      predicate: (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[0] !== "mfa-status",
    };
    void client.cancelQueries(privateQueries);
    client.removeQueries(privateQueries);
  }, [blocked, client]);
  async function refresh() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    if (!result.data)
      throw new Error("Current authenticator status is unavailable.");
    return result.data;
  }
  async function complete() {
    const status = await refresh();
    if (
      !status.enabled ||
      !status.verifiedUntil ||
      Date.parse(status.verifiedUntil) <= Date.now()
    )
      throw new Error("Use a fresh authenticator code to verify staff access.");
    setDenied(false);
    setHold(false);
  }
  if (!blocked && !managing) return children;
  if (query.isPending)
    return (
      <main className="container narrow section">
        <p role="status">{appText("Checking staff access…")}</p>
      </main>
    );
  return (
    <MfaPanel
      session={session}
      status={query.data}
      statusError={appError(query.error?.message)}
      refresh={refresh}
      complete={complete}
      hold={setHold}
      onSignIn={onSignIn}
    />
  );
}
function MfaPanel({
  session,
  status,
  statusError,
  refresh,
  complete,
  hold,
  onSignIn,
}: {
  session: Session;
  status: Status | undefined;
  statusError?: string;
  refresh: () => Promise<Status>;
  complete: () => Promise<void>;
  hold: (value: boolean) => void;
  onSignIn: () => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const [secret, setSecret] = useState(""),
    [code, setCode] = useState(""),
    [recovery, setRecovery] = useState(false),
    [codes, setCodes] = useState<string[]>([]),
    [saved, setSaved] = useState(false),
    [replace, setReplace] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [inspected, setInspected] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const submitting = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!codes.length || saved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [codes, saved]);
  const verified =
    !!status?.verifiedUntil &&
    Date.parse(status.verifiedUntil) > Date.now() &&
    !statusError;
  async function enroll() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await api<components["schemas"]["MfaEnrollment"]>(
        "/auth/mfa/enrollment",
        { method: "POST", body: {}, csrf: session.csrfToken },
      );
      if (!/^[A-Z2-7]{32}$/.test(value?.secret))
        throw new ApiError(
          502,
          "INVALID_RESPONSE",
          "Setup details could not be verified.",
        );
      if (alive.current) {
        setSecret(value.secret);
        setMessage(
          "Add this setup key to your authenticator, then enter its current code.",
        );
      }
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).message +
            " Retry setup or return to sign-in; an existing confirmed authenticator cannot be replaced here.",
        );
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || uncertain) return;
    const valid =
      replace || !recovery
        ? /^\d{6}$/.test(code)
        : /^[A-Za-z0-9_-]{22}$/.test(code);
    if (!valid) {
      setError(
        recovery && !replace
          ? "Enter a complete 22-character recovery code."
          : "Enter the current six-digit authenticator code.",
      );
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    hold(true);
    let confirmed = false;
    try {
      const result = await api<
        | components["schemas"]["MfaVerification"]
        | components["schemas"]["MfaRecovery"]
      >(replace ? "/auth/mfa/recovery-codes" : "/auth/mfa/verification", {
        method: "POST",
        body: { code },
        csrf: session.csrfToken,
      });
      if (
        !Array.isArray(result?.recoveryCodes) ||
        (replace
          ? result.recoveryCodes.length !== 8
          : ![0, 8].includes(result.recoveryCodes.length)) ||
        !result.recoveryCodes.every((x) => /^[A-Za-z0-9_-]{22}$/.test(x))
      )
        throw new ApiError(
          502,
          "INVALID_RESPONSE",
          "The verification response could not be confirmed.",
        );
      confirmed = true;
      if (!alive.current) return;
      setSecret("");
      setReplace(false);
      setRecovery(false);
      setInspected(false);
      if (result.recoveryCodes.length) {
        setCodes(result.recoveryCodes);
        setSaved(false);
        setMessage(
          "Authenticator confirmed. Save these eight private recovery codes before continuing.",
        );
      } else {
        setMessage("Authenticator verified. Checking current staff access…");
        await complete();
      }
    } catch (e) {
      if (!alive.current) return;
      const unknown =
        confirmed ||
        !(e instanceof ApiError) ||
        e.status >= 500 ||
        e.code === "INVALID_RESPONSE";
      setUncertain(unknown);
      if (unknown)
        setError(
          "The result could not be confirmed. Check current verification before trying anything else; do not resend a used code.",
        );
      else {
        hold(false);
        setError((e as Error).message);
      }
    } finally {
      submitting.current = false;
      if (alive.current) {
        setBusy(false);
        setCode("");
      }
    }
  }
  async function inspect() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await refresh();
      if (!alive.current) return;
      setUncertain(false);
      setInspected(true);
      setSecret("");
      setMessage(
        value.verifiedUntil && Date.parse(value.verifiedUntil) > Date.now()
          ? "Verification is recorded. If recovery codes were not received, replace them using a fresh authenticator code before continuing."
          : "No current staff verification is recorded. Use a new authenticator code; the previous code may have been consumed.",
      );
      if (!value.verifiedUntil || Date.parse(value.verifiedUntil) <= Date.now())
        hold(false);
    } catch (e) {
      if (alive.current)
        setError((e as Error).message + " Staff records remain hidden.");
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function finish() {
    if (submitting.current || (codes.length && !saved)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await complete();
      if (alive.current) {
        setCodes([]);
        setMessage("Staff access is verified.");
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <main className="container narrow section staff-security">
      <header className="staff-security-heading">
        <ShieldCheck size={28} aria-hidden="true" />
        <div>
          <h1>{appText("Protect your staff access.")}</h1>
          <p>
            {appText(
              "Verify an independent authenticator before opening private staff records.",
            )}{" "}
          </p>
        </div>
        <span>{appText(session.account.role.toLowerCase())}</span>
      </header>
      <section
        className="panel staff-security-form"
        aria-label={appText("Staff authenticator")}
      >
        {statusError && (
          <Notice error>
            {appError(statusError)}{" "}
            {appText("Return to sign-in if your primary session expired.")}{" "}
          </Notice>
        )}
        {message && <Notice>{appText(message)}</Notice>}
        {error && <Notice error>{appError(error)}</Notice>}
        {!status && !statusError && (
          <p role="status">{appText("Checking your authenticator…")}</p>
        )}
        {status?.enabled && (
          <p>
            {verified
              ? appText("Staff verification is current.")
              : appText("A fresh verification is required.")}{" "}
            {status.recoveryCodesRemaining}{" "}
            {appText("recovery codes remain.")}{" "}
          </p>
        )}
        {status && !status.enabled && !secret && !codes.length && (
          <>
            <h2>{appText("Add your authenticator")}</h2>
            <p>
              {appText(
                "Use an authenticator app on your phone. Setup requires a recent sign-in and expires after ten minutes.",
              )}{" "}
            </p>
            <Button
              className="button"
              disabled={busy || uncertain}
              onClick={enroll}
            >
              <KeyRound size={18} aria-hidden="true" />
              {appText("Set up authenticator")}{" "}
            </Button>
          </>
        )}
        {secret && (
          <div className="staff-security-private">
            <h2>{appText("Your private setup key")}</h2>
            <p>
              {appText(
                "Add “Better Call Sir” in your authenticator using this key. Keep it private.",
              )}{" "}
            </p>
            <code aria-label={appText("Authenticator setup key")}>
              {secret}
            </code>
            <small>
              {appText(
                "This key stays in page memory and is cleared after verification or leaving this screen.",
              )}{" "}
            </small>
          </div>
        )}
        {!codes.length &&
          (secret || status?.enabled) &&
          (!verified || replace) && (
            <form onSubmit={verify}>
              <label htmlFor="staff-code">
                {replace
                  ? appText("New authenticator code")
                  : recovery
                    ? appText("Single-use recovery code")
                    : appText("Authenticator code")}
              </label>
              <Input
                id="staff-code"
                type="password"
                inputMode={recovery && !replace ? "text" : "numeric"}
                autoComplete="one-time-code"
                required
                minLength={recovery && !replace ? 22 : 6}
                maxLength={recovery && !replace ? 22 : 6}
                value={code}
                disabled={busy || uncertain}
                onChange={(e) => setCode(e.target.value.trim())}
                aria-describedby="staff-code-help"
              />
              <p id="staff-code-help">
                {replace
                  ? appText(
                      "Use a fresh six-digit code. Replacing recovery codes invalidates every previous code.",
                    )
                  : recovery
                    ? appText(
                        "Recovery consumes one code and signs out other staff session families.",
                      )
                    : appText(
                        "Enter the current six-digit code. A code cannot be reused after verification.",
                      )}
              </p>
              <div className="staff-security-actions">
                <Button
                  className="button"
                  type="submit"
                  disabled={busy || uncertain}
                >
                  {replace
                    ? appText("Replace recovery codes")
                    : appText("Verify staff access")}
                </Button>
                {status?.enabled && !replace && (
                  <Button
                    variant="outline"
                    disabled={busy || uncertain}
                    onClick={() => {
                      setRecovery(!recovery);
                      setCode("");
                      setError("");
                    }}
                  >
                    {recovery
                      ? appText("Use authenticator instead")
                      : appText("Use a recovery code")}
                  </Button>
                )}
                {replace && (
                  <Button
                    variant="outline"
                    disabled={busy || uncertain}
                    onClick={() => {
                      setReplace(false);
                      setCode("");
                    }}
                  >
                    {appText("Cancel replacement")}{" "}
                  </Button>
                )}
              </div>
            </form>
          )}
        {codes.length > 0 && (
          <div className="staff-security-private">
            <h2>{appText("Save your recovery codes")}</h2>
            <p>
              {appText(
                "Keep these in a password manager. Each works once; they will not be shown again after leaving this page.",
              )}{" "}
            </p>
            <ul
              className="staff-recovery-codes"
              aria-label={appText("Private recovery codes")}
            >
              {codes.map((value) => (
                <li key={value}>
                  <code>{value}</code>
                </li>
              ))}
            </ul>
            <label className="staff-security-check">
              <input
                type="checkbox"
                checked={saved}
                disabled={busy}
                onChange={(e) => setSaved(e.target.checked)}
              />
              {appText("I saved these recovery codes securely.")}{" "}
            </label>
            <Button
              className="button"
              disabled={!saved || busy}
              onClick={finish}
            >
              {appText("Continue with verified access")}{" "}
            </Button>
          </div>
        )}
        <div className="staff-security-actions">
          <Button variant="outline" disabled={busy} onClick={inspect}>
            {busy
              ? appText("Checking…")
              : appText("Check current verification")}
          </Button>
          {verified && !codes.length && !uncertain && !replace && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setReplace(true);
                setRecovery(false);
                setCode("");
              }}
            >
              {appText("Replace recovery codes")}{" "}
            </Button>
          )}
          {verified && inspected && !codes.length && !uncertain && (
            <Button className="button" disabled={busy} onClick={finish}>
              {appText("Continue with recorded verification")}{" "}
            </Button>
          )}
          <Button variant="outline" disabled={busy} onClick={onSignIn}>
            {appText("Return to sign-in")}{" "}
          </Button>
        </div>
        {verified && !codes.length && !uncertain && (
          <Link href="/dashboard" className="inline-link">
            {appText("Return to staff workspace")}{" "}
          </Link>
        )}
      </section>
    </main>
  );
}
