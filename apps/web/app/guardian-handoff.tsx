"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useAppTranslation } from "./locale";

export function GuardianHandoff({
  allowIndependent,
  onChooseIndependent,
}: {
  allowIndependent: boolean;
  onChooseIndependent: () => void;
}) {
  const { appText } = useAppTranslation();
  const [url, setUrl] = useState("/signup/guardian"),
    [copied, setCopied] = useState(false),
    [manual, setManual] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(
    () => setUrl(new URL("/signup/guardian", window.location.origin).href),
    [],
  );
  async function copy() {
    setCopied(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setManual(false);
    } catch {
      setManual(true);
      field.current?.focus();
      field.current?.select();
    }
  }
  return (
    <section
      className="guardian-handoff"
      aria-labelledby="guardian-handoff-title"
    >
      <header>
        <h3 id="guardian-handoff-title">
          {appText("Let your guardian take the next step")}
        </h3>
        <p>
          {appText(
            "Your signup is paused here. Choosing guardian help has not changed your account or given anyone access.",
          )}
        </p>
      </header>
      <ol>
        <li>
          <strong>{appText("Your guardian creates their own account")}</strong>
          <p>
            {appText(
              "Share the link below. Ask them to open it on their own device or in a separate browser profile and use their own email.",
            )}
          </p>
        </li>
        <li>
          <strong>{appText("You confirm the relationship")}</strong>
          <p>
            {appText(
              "Your guardian starts verification and enters your existing email. Sign in with that same email and open your relationship request. If you do not use email, staff can record confirmation during a call.",
            )}
          </p>
        </li>
        <li>
          <strong>{appText("Your guardian completes student setup")}</strong>
          <p>
            {appText(
              "After staff approves the report and relationship, your guardian gives learning permission, creates your student profile and sets up your access from their dashboard.",
            )}
          </p>
        </li>
      </ol>
      <div className="guardian-handoff-share">
        <label htmlFor="guardian-signup-link">
          {appText("Registration link for your guardian")}
        </label>
        <Input
          ref={field}
          id="guardian-signup-link"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" onClick={copy}>
          {appText("Copy guardian signup link")}
        </Button>
        <p role="status">
          {copied
            ? appText(
                "Link copied. Share it with your guardian. No message has been sent by the platform.",
              )
            : manual
              ? appText(
                  "Copy the selected link and share it with your guardian.",
                )
              : appText(
                  "This link contains no student details and does not grant access.",
                )}
        </p>
      </div>
      <Link
        className="button secondary"
        href="/guardian-verification?view=student"
      >
        {appText("Check my guardian relationship request")}
      </Link>
      {allowIndependent && (
        <aside className="guardian-handoff-adult">
          <p>
            {appText(
              "Already 18+ and only need advice? You can finish independent signup and invite an optional supporter afterwards.",
            )}
          </p>
          <Button type="button" variant="outline" onClick={onChooseIndependent}>
            {appText("Review independent signup (18+)")}
          </Button>
        </aside>
      )}
    </section>
  );
}
