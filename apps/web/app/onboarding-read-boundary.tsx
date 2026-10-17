"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { ApiError } from "@bcs/api-client";
import { useAppTranslation } from "./locale";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";

export const onboardingAccessDenied = (error: unknown) =>
  error instanceof ApiError && [401, 403].includes(error.status);

// Keep local edits and uncertain-write identities mounted during recoverable read failures.
export function OnboardingReadBoundary({
  error,
  busy,
  onRetry,
  children,
}: {
  error: unknown;
  busy: boolean;
  onRetry: () => unknown;
  children: ReactNode;
}) {
  const { appText } = useAppTranslation();
  const details = useRef<HTMLFieldSetElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const blocked = !!error || busy;
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    if (error && !busy) retry.current?.focus();
    else if (wasBlocked.current && !blocked) {
      const heading = details.current?.querySelector<HTMLElement>("h1, h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }
    wasBlocked.current = blocked;
  }, [error, busy, blocked]);
  return (
    <>
      {blocked && (
        <section className="container onboarding-read-notice">
          <Alert
            variant={error ? "destructive" : "default"}
            role={error ? "alert" : "status"}
          >
            <AlertDescription>
              <p>
                {error
                  ? appText(
                      "Your saved setup could not be refreshed. Your edits are kept on this page. Retry before continuing.",
                    )
                  : appText("Checking saved setup…")}
              </p>
              <Button
                ref={retry}
                variant="outline"
                disabled={busy}
                onClick={() => void onRetry()}
              >
                {appText("Retry setup check")}
              </Button>
            </AlertDescription>
          </Alert>
        </section>
      )}
      <fieldset
        className="onboarding-read-boundary"
        disabled={blocked}
        inert={blocked}
        aria-busy={busy}
        aria-label={appText("Saved onboarding details")}
        ref={details}
      >
        {children}
      </fieldset>
    </>
  );
}
