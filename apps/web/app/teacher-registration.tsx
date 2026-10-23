"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@bcs/api-client";
import { EmailLogin } from "./email-login";
import { useAppTranslation } from "./locale";

export function TeacherRegistration({
  session,
  onSignedIn,
  hindi,
  onLanguageChange,
}: {
  session: Session | null;
  onSignedIn: (session: Session) => void;
  hindi: boolean;
  onLanguageChange: (value: boolean) => void;
}) {
  const { appText } = useAppTranslation();
  const router = useRouter(),
    client = useQueryClient();
  if (session)
    return (
      <main className="container narrow section">
        <h1>{appText("Your teacher application starts here")}</h1>
        {["GUARDIAN", "TEACHER"].includes(session.account.role) ? (
          <>
            <p>
              {appText(
                "You are signed in. Continue with your teaching details. Your application stays private until reviewed and approved.",
              )}
            </p>
            <Link className="button" href="/onboarding/teacher">
              {appText("Continue teacher application")}
            </Link>
          </>
        ) : (
          <>
            <p>
              {appText(
                "Sign in with your own adult account to apply. Student accounts cannot submit teacher applications.",
              )}
            </p>
            <Link className="button secondary" href="/dashboard">
              {appText("Return to dashboard")}
            </Link>
          </>
        )}
      </main>
    );
  return (
    <main className="container auth-section" lang={hindi ? "hi" : "en"}>
      <EmailLogin
        purpose="teacher-signup"
        hindi={hindi}
        onLanguageChange={onLanguageChange}
        onSignedIn={(next) => {
          client.clear();
          onSignedIn(next);
          router.push(
            next.accountCreated === false && next.account.role !== "GUARDIAN"
              ? "/dashboard"
              : "/onboarding/teacher",
          );
        }}
      />
      <p className="independent-signup-link">
        {appText("Already have a teacher account?")}{" "}
        <Link
          className="inline-link"
          href="/login?next=%2Fonboarding%2Fteacher&intent=teacher"
        >
          {appText("Sign in to continue your application")}
        </Link>
      </p>
    </main>
  );
}
