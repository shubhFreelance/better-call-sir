"use client";
import { useAppTranslation } from "./locale";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { signInCopy, type SignInError } from "./sign-in-copy";
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
  status: "SANDBOX" | "SENT" | "PENDING";
  developmentCode?: string;
  expiresIn: number;
};
export function EmailLogin({
  onSignedIn,
  hindi,
  onLanguageChange,
}: {
  hindi: boolean;
  onLanguageChange: (hindi: boolean) => void;
  onSignedIn: (session: Session) => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const t = signInCopy[hindi ? "hi" : "en"];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{
    name?: SignInError;
    email?: SignInError;
    code?: SignInError;
    server?: SignInError;
  }>({});
  const requestIdentity = useRef<{
    key: string;
    email: string;
    locale: string;
  } | null>(null);
  const requestSending = useRef(false);
  const [uncertain, setUncertain] = useState(false);
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
  function serverError(error: unknown): SignInError {
    if (!(error instanceof ApiError)) return "network";
    return (
      (
        {
          EMAIL_UNAVAILABLE: "emailUnavailable",
          OTP_EXPIRED: "codeExpired",
          AUTH_UNAVAILABLE: "authUnavailable",
          RATE_LIMIT: "rateLimited",
          VALIDATION: "detailsInvalid",
          PROVIDER_UNAVAILABLE: "signInUnavailable",
        } as Record<string, SignInError>
      )[error.code] || "signInUnavailable"
    );
  }
  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    if (requestSending.current) return;
    const parsed = detailsSchema.safeParse({ name, email });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({
        name: fields.name
          ? name.trim()
            ? "nameLong"
            : "nameRequired"
          : undefined,
        email: fields.email ? "emailInvalid" : undefined,
      });
      requestAnimationFrame(() =>
        (fields.name ? nameInput : emailInput).current?.focus(),
      );
      return;
    }
    requestSending.current = true;
    if (!requestIdentity.current)
      requestIdentity.current = {
        key: crypto.randomUUID(),
        email: parsed.data.email,
        locale: hindi ? "hi" : "en",
      };
    const operation = requestIdentity.current;
    setBusy(true);
    setErrors({});
    try {
      const result = await api<Challenge>("/auth/otp/request", {
        method: "POST",
        body: { email: operation.email, locale: operation.locale },
        key: operation.key,
        signal: AbortSignal.timeout(12000),
      });
      if (
        !["SANDBOX", "SENT", "PENDING"].includes(result.status) ||
        !Number.isInteger(result.expiresIn) ||
        result.expiresIn < 1 ||
        result.expiresIn > 300
      )
        throw new Error("Invalid challenge");
      requestIdentity.current = null;
      setUncertain(false);
      setName(parsed.data.name);
      setEmail(parsed.data.email);
      setCode("");
      const time = Date.now();
      setNow(time);
      setDeadline(time + result.expiresIn * 1000);
      setResendAt(time + 60000);
      setChallenge(result);
    } catch (error) {
      const unknown =
        !(error instanceof ApiError) ||
        error.code === "INVALID_RESPONSE" ||
        (error.status >= 500 &&
          ![
            "EMAIL_UNAVAILABLE",
            "AUTH_UNAVAILABLE",
            "PROVIDER_UNAVAILABLE",
          ].includes(error.code)) ||
        (uncertain && ["RATE_LIMIT", "RATE_LIMITED"].includes(error.code));
      setUncertain(unknown);
      if (!unknown) requestIdentity.current = null;
      setErrors({ server: serverError(error) });
    } finally {
      requestSending.current = false;
      setBusy(false);
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: "codeRequired" });
      codeInput.current?.focus();
      return;
    }
    if (!remaining) {
      setErrors({ code: "codeExpired" });
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
          code: "codeWrong",
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
        <div className="auth-language">
          <label htmlFor="signin-language">{appText("Language / भाषा")}</label>
          <select
            id="signin-language"
            value={hindi ? "hi" : "en"}
            onChange={(event) => onLanguageChange(event.target.value === "hi")}
            disabled={busy || uncertain}
          >
            <option value="en">{appText("English")}</option>
            <option value="hi">हिन्दी</option>
          </select>
        </div>
        <ol className="auth-steps" aria-label={t.progress}>
          <li
            className={!challenge ? "current" : "complete"}
            aria-current={!challenge ? "step" : undefined}
          >
            <span>{challenge ? <Check size={14} /> : "1"}</span>
            {t.emailStep}
          </li>
          <li
            className={challenge ? "current" : ""}
            aria-current={challenge ? "step" : undefined}
          >
            <span>2</span>
            {t.verifyStep}
          </li>
        </ol>
        <div className="auth-icon">
          <Mail size={24} />
        </div>
        <h1 id="auth-title">{challenge ? t.checkEmail : t.welcome}</h1>
        <p className="auth-subtitle">
          {challenge ? (
            <>
              {t.codeFor} <strong className="auth-address">{email}</strong>.
            </>
          ) : (
            t.introduction
          )}
        </p>
        {errors.server && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {appError(t.errors[errors.server])}
            </AlertDescription>
          </Alert>
        )}
        {uncertain && (
          <Alert role="status">
            <AlertDescription>
              {appText(
                "This code request could not be confirmed. Retry the same request before changing your email or language.",
              )}
            </AlertDescription>
          </Alert>
        )}
        {!challenge ? (
          <form noValidate onSubmit={requestCode} className="auth-form">
            <label htmlFor="signin-name">{t.name}</label>
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
              disabled={busy || uncertain}
            />
            {errors.name ? (
              <p id="signin-name-error" className="auth-field-error">
                {appError(t.errors[errors.name])}
              </p>
            ) : (
              <p id="signin-name-help" className="auth-help">
                {t.nameHelp}
              </p>
            )}
            <label htmlFor="signin-email">{t.email}</label>
            <Input
              ref={emailInput}
              id="signin-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder={appText("you@example.com")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((old) => ({ ...old, email: undefined }));
              }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "signin-email-error" : undefined}
              disabled={busy || uncertain}
            />
            {errors.email && (
              <p id="signin-email-error" className="auth-field-error">
                {appError(t.errors[errors.email])}
              </p>
            )}
            <Button
              className="button auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" /> {t.sending}
                </>
              ) : (
                <>
                  {uncertain ? appText("Retry the same code request") : t.send}{" "}
                  <ArrowRight size={18} />
                </>
              )}
            </Button>
            <p className="auth-help">{t.passwordHelp}</p>
          </form>
        ) : (
          <form noValidate onSubmit={verify} className="auth-form">
            {challenge.status === "PENDING" && (
              <Alert role="status">
                <AlertDescription>
                  {appText(
                    "Your email is queued for processing. Inbox delivery has not yet been confirmed.",
                  )}
                </AlertDescription>
              </Alert>
            )}
            {challenge.status === "SANDBOX" && (
              <Alert className="auth-sandbox" role="status">
                <AlertDescription>
                  <strong>{t.preview}</strong>
                  <span>
                    {t.previewCode} <strong>{challenge.developmentCode}</strong>
                    .
                  </span>
                </AlertDescription>
              </Alert>
            )}
            <label htmlFor="signin-code">{t.code}</label>
            <Input
              ref={codeInput}
              id="signin-code"
              className="auth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(
                  e.target.value
                    .replace(/[०-९]/g, (digit) =>
                      String(digit.charCodeAt(0) - 0x966),
                    )
                    .replace(/\D/g, "")
                    .slice(0, 6),
                );
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
                {appError(t.errors[errors.code])}
              </p>
            )}
            <p id="signin-code-help" className="auth-help">
              {remaining
                ? t.expires(
                    `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`,
                  )
                : t.expired}
            </p>
            <Button
              className="button auth-submit"
              type="submit"
              disabled={busy || !remaining}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" /> {t.wait}
                </>
              ) : (
                t.verify
              )}
            </Button>
            <div className="auth-recovery">
              <Button
                variant="ghost"
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => requestCode()}
              >
                {cooldown ? t.resendIn(cooldown) : t.resend}
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
                {t.changeEmail}
              </Button>
            </div>
          </form>
        )}
        <p className="auth-footer-note">{t.permission}</p>
      </section>
      <aside className="auth-intro">
        <BookOpen size={32} aria-hidden="true" />
        <h2>{t.guideTitle}</h2>
        <p>{t.guideIntro}</p>
        <ul>
          <li>
            <Check size={18} /> {t.reviewed}
          </li>
          <li>
            <Check size={18} /> {t.enquiries}
          </li>
          <li>
            <Check size={18} /> {t.privacy}
          </li>
        </ul>
        <div className="auth-family-note">
          <ShieldCheck size={20} />
          <p>{t.guardian}</p>
        </div>
      </aside>
    </div>
  );
}
