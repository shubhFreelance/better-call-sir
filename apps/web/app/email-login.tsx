"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  ArrowRight,
  BookOpen,
  Check,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { api, ApiError, type Session } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";

const detailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Use 80 characters or fewer."),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email("Enter a valid email address."))
    .transform((value) => value.toLowerCase()),
});
type Challenge = {
  status: "SANDBOX" | "SENT";
  developmentCode?: string;
  expiresIn: number;
};
export function EmailLogin({
  onSignedIn,
}: {
  onSignedIn: (session: Session) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    code?: string;
    server?: string;
  }>({});
  const codeInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (errors.code && !busy) codeInput.current?.focus();
  }, [errors.code, busy]);
  useEffect(() => {
    if (!challenge) return;
    codeInput.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  function serverError(error: unknown) {
    return error instanceof ApiError
      ? error.message
      : "We couldn’t reach the sign-in service. Please try again.";
  }
  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    const parsed = detailsSchema.safeParse({ name, email });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({ name: fields.name?.[0], email: fields.email?.[0] });
      requestAnimationFrame(() =>
        (fields.name ? nameInput : emailInput).current?.focus(),
      );
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const result = await api<Challenge>("/auth/otp/request", {
        method: "POST",
        body: { email: parsed.data.email },
        signal: AbortSignal.timeout(12000),
      });
      setName(parsed.data.name);
      setEmail(parsed.data.email);
      setCode("");
      const time = Date.now();
      setNow(time);
      setDeadline(time + result.expiresIn * 1000);
      setResendAt(time + 60000);
      setChallenge(result);
    } catch (error) {
      setErrors({ server: serverError(error) });
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: "Enter the six-digit code." });
      codeInput.current?.focus();
      return;
    }
    if (!remaining) {
      setErrors({ code: "This code has expired. Request a new code below." });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const session = await api<Session>("/auth/otp/verify", {
        method: "POST",
        body: { email, name, code },
        signal: AbortSignal.timeout(12000),
      });
      setCode("");
      setChallenge(null);
      onSignedIn(session);
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_OTP") {
        setErrors({
          code: "That code is incorrect or expired. Check it or request a new code.",
        });
        codeInput.current?.focus();
      } else setErrors({ server: serverError(error) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-card" aria-labelledby="auth-title">
        <ol className="auth-steps" aria-label="Sign-in progress">
          <li
            className={!challenge ? "current" : "complete"}
            aria-current={!challenge ? "step" : undefined}
          >
            <span>{challenge ? <Check size={14} /> : "1"}</span>Email
          </li>
          <li
            className={challenge ? "current" : ""}
            aria-current={challenge ? "step" : undefined}
          >
            <span>2</span>Verify
          </li>
        </ol>
        <div className="auth-icon">
          <Mail size={24} />
        </div>
        <h1 id="auth-title">
          {challenge ? "Check your email" : "Welcome to Better Call Sir"}
        </h1>
        <p className="auth-subtitle">
          {challenge ? (
            <>
              Enter the code for{" "}
              <strong className="auth-address">{email}</strong>.
            </>
          ) : (
            "Sign in or create your account with a one-time email code."
          )}
        </p>
        {errors.server && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{errors.server}</AlertDescription>
          </Alert>
        )}
        {!challenge ? (
          <form noValidate onSubmit={requestCode} className="auth-form">
            <label htmlFor="signin-name">Your name</label>
            <Input
              ref={nameInput}
              id="signin-name"
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((old) => ({ ...old, name: undefined }));
              }}
              aria-invalid={!!errors.name}
              aria-describedby={
                errors.name ? "signin-name-error" : "signin-name-help"
              }
              disabled={busy}
            />
            {errors.name ? (
              <p id="signin-name-error" className="auth-field-error">
                {errors.name}
              </p>
            ) : (
              <p id="signin-name-help" className="auth-help">
                Used when creating a new account.
              </p>
            )}
            <label htmlFor="signin-email">Email address</label>
            <Input
              ref={emailInput}
              id="signin-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((old) => ({ ...old, email: undefined }));
              }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "signin-email-error" : undefined}
              disabled={busy}
            />
            {errors.email && (
              <p id="signin-email-error" className="auth-field-error">
                {errors.email}
              </p>
            )}
            <Button
              className="button auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" /> Requesting code…
                </>
              ) : (
                <>
                  Send sign-in code <ArrowRight size={18} />
                </>
              )}
            </Button>
            <p className="auth-help">
              No password to remember. Only enter a code you requested.
            </p>
          </form>
        ) : (
          <form noValidate onSubmit={verify} className="auth-form">
            {challenge.status === "SANDBOX" && (
              <Alert className="auth-sandbox" role="status">
                <AlertDescription>
                  <strong>Development preview — no email was sent.</strong>
                  <span>
                    Use preview code{" "}
                    <strong>{challenge.developmentCode}</strong>.
                  </span>
                </AlertDescription>
              </Alert>
            )}
            <label htmlFor="signin-code">Six-digit code</label>
            <Input
              ref={codeInput}
              id="signin-code"
              className="auth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setErrors((old) => ({ ...old, code: undefined }));
              }}
              aria-invalid={!!errors.code}
              aria-describedby={
                errors.code ? "signin-code-error" : "signin-code-help"
              }
              disabled={busy}
            />
            {errors.code && (
              <p
                id="signin-code-error"
                className="auth-field-error"
                role="alert"
              >
                {errors.code}
              </p>
            )}
            <p id="signin-code-help" className="auth-help">
              {remaining
                ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}. You can paste the full code.`
                : "This code has expired. Request a new one."}
            </p>
            <Button
              className="button auth-submit"
              type="submit"
              disabled={busy || !remaining}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" /> Please wait…
                </>
              ) : (
                "Verify and continue"
              )}
            </Button>
            <div className="auth-recovery">
              <Button
                variant="ghost"
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => requestCode()}
              >
                {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setChallenge(null);
                  setCode("");
                  setErrors({});
                  requestAnimationFrame(() => emailInput.current?.focus());
                }}
              >
                Change email
              </Button>
            </div>
          </form>
        )}
        <p className="auth-footer-note">
          A verified email gives access to your account. Guardian verification
          and consent are separate steps before learner details are collected.
        </p>
      </section>
      <aside className="auth-intro">
        <BookOpen size={32} aria-hidden="true" />
        <h2>A space for your learning journey.</h2>
        <p>
          Find a teacher who fits. Keep lessons, conversations and progress
          together.
        </p>
        <ul>
          <li>
            <Check size={18} /> Explore reviewed teacher profiles
          </li>
          <li>
            <Check size={18} /> Manage lessons and learning records
          </li>
          <li>
            <Check size={18} /> Stay in control of your family’s information
          </li>
        </ul>
        <div className="auth-family-note">
          <ShieldCheck size={20} />
          <p>
            Students join through their guardian. Email sign-in is for adult
            accounts.
          </p>
        </div>
      </aside>
    </div>
  );
}
