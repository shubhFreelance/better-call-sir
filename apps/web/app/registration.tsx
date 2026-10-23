"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, GraduationCap, Users, ArrowUpRight } from "lucide-react";
import type { Session } from "@bcs/api-client";
import { EmailLogin } from "./email-login";
import { useAppTranslation } from "./locale";

export function RegistrationChoices() {
  const { appText } = useAppTranslation();
  return (
    <section
      className="registration-section"
      aria-labelledby="registration-title"
    >
      <div className="registration-heading">
        <div>
          <h2 id="registration-title">
            {appText("Your profile. Your next step.")}
          </h2>
          <p>
            {appText(
              "Join as a student, parent or teacher. Start with your own account.",
            )}
          </p>
        </div>
        <Link href="/login" className="inline-link">
          {appText("Already registered? Sign in")}
        </Link>
      </div>
      <div className="registration-grid">
        {[
          [
            "/signup/student",
            "Student",
            "Find a teacher for your goals, subjects and learning style.",
            "Register as a student",
            GraduationCap,
          ],
          [
            "/signup/guardian",
            "Parent or guardian",
            "Find a teacher for someone you support. Add their details during setup.",
            "Register as a parent or guardian",
            Users,
          ],
          [
            "/signup/teacher",
            "Teacher",
            "Share your expertise, build your teaching profile and receive enquiries.",
            "Register as a teacher",
            BookOpen,
          ],
        ].map(([href, title, description, action, Icon]) => {
          const Mark = Icon as typeof BookOpen;
          return (
            <article key={href as string} className="registration-card">
              <Mark size={28} aria-hidden="true" />
              <h3>{appText(title as string)}</h3>
              <p>{appText(description as string)}</p>
              <Link href={href as string} className="button secondary">
                {appText(action as string)}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
      <p className="registration-note">
        {appText(
          "Student and guardian accounts are linked only through the relevant invitation and consent steps. Adult students can choose whether to invite a supporter.",
        )}
      </p>
    </section>
  );
}

export function GuardianRegistration({
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
        <h1>{appText("Your parent or guardian account")}</h1>
        <p>
          {appText(
            session.account.role === "GUARDIAN"
              ? "You are signed in. Complete your own setup, then add a student when you are ready."
              : "You already have a different account type. Return to your dashboard or sign out to register with another email.",
          )}
        </p>
        <Link
          className="button"
          href={
            session.account.role === "GUARDIAN"
              ? "/onboarding/guardian"
              : "/dashboard"
          }
        >
          {appText(
            session.account.role === "GUARDIAN"
              ? "Continue parent or guardian setup"
              : "Return to dashboard",
          )}
        </Link>
      </main>
    );
  return (
    <main className="container auth-section" lang={hindi ? "hi" : "en"}>
      <EmailLogin
        purpose="guardian-signup"
        hindi={hindi}
        onLanguageChange={onLanguageChange}
        onSignedIn={(next) => {
          client.clear();
          onSignedIn(next);
          router.push(
            next.accountCreated !== false && next.account.role === "GUARDIAN"
              ? "/onboarding/guardian"
              : "/dashboard",
          );
        }}
      />
      <p className="independent-signup-link">
        <Link href="/signup" className="inline-link">
          {appText("Choose a different account type")}
        </Link>
      </p>
    </main>
  );
}

export function StudentRegistration() {
  const { appText } = useAppTranslation();
  return (
    <main className="container section student-registration">
      <Link href="/signup" className="inline-link">
        {appText("All registration options")}
      </Link>
      <header className="registration-heading">
        <div>
          <h1>{appText("Start with your student profile")}</h1>
          <p>
            {appText(
              "Choose the route that fits you. Your education and teacher choices stay in your own workspace.",
            )}
          </p>
        </div>
      </header>
      <div className="registration-grid student-registration-grid">
        <section className="registration-card">
          <GraduationCap size={30} aria-hidden="true" />
          <h2>{appText("I manage my own learning")}</h2>
          <p>
            {appText(
              "Students aged 18+ can register with their own email, add school or college details and find a teacher. Inviting a guardian or supporter is optional.",
            )}
          </p>
          <Link className="button" href="/onboarding/independent-student">
            {appText("Create my student profile (18+)")}
          </Link>
        </section>
        <section className="registration-card">
          <Users size={30} aria-hidden="true" />
          <h2>{appText("I have a guardian’s support")}</h2>
          <p>
            {appText(
              "For younger students, a guardian completes verification and consent before creating student access. Already invited? Activate your access with your guardian.",
            )}
          </p>
          <Link className="button secondary" href="/onboarding/student">
            {appText("Use a student invitation")}
          </Link>
          <Link className="inline-link" href="/signup/guardian">
            {appText("My parent or guardian needs an account")}
          </Link>
        </section>
      </div>
      <p className="registration-note">
        {appText(
          "An invitation does not merge accounts. Learning permissions are reviewed separately and remain visible to the student.",
        )}
      </p>
    </main>
  );
}
