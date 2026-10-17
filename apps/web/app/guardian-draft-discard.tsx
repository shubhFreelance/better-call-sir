"use client";
import { useAppTranslation } from "./locale";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
type Progress = components["schemas"]["OnboardingProgress"];
export function GuardianDraftDiscard({
  session,
  kind,
  version,
  destination = "/teachers",
  label = "Discard draft & choose again",
  onLockChange,
}: {
  session: Session;
  kind: "parent" | "enquiry";
  version: number;
  destination?: string;
  label?: string;
  onLockChange?: (locked: boolean) => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const [review, setReview] = useState(false),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [error, setError] = useState(""),
    [currentVersion, setCurrentVersion] = useState(version),
    [unavailable, setUnavailable] = useState(false);
  const pending = useRef<{
      body: { expectedVersion: number; acknowledged: true };
      key: string;
    } | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const locked = busy || uncertain || conflict;
  useEffect(() => {
    onLockChange?.(review);
    return () => onLockChange?.(false);
  }, [review, onLockChange]);
  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);
  async function discard() {
    if (!ack && !uncertain) return;
    pending.current ||= {
      body: { expectedVersion: currentVersion, acknowledged: true },
      key: crypto.randomUUID(),
    };
    setBusy(true);
    setError("");
    try {
      const result = await api<Progress>(`/onboarding/${kind}/discards`, {
        method: "POST",
        csrf: session.csrfToken,
        key: pending.current.key,
        body: pending.current.body,
        signal: AbortSignal.timeout(12000),
      });
      if (
        result.kind !== kind.toUpperCase() ||
        !Number.isInteger(result.version) ||
        result.version <= pending.current.body.expectedVersion ||
        result.completedResourceId !== null ||
        !result.draft ||
        Array.isArray(result.draft) ||
        Object.keys(result.draft).length
      )
        throw new Error("Unconfirmed discard result");
      window.location.assign(destination);
    } catch (e) {
      const unknown =
        !(e instanceof ApiError) ||
        e.code === "INVALID_RESPONSE" ||
        e.status >= 500;
      setUncertain(unknown);
      setConflict(e instanceof ApiError && e.code === "CONFLICT");
      setError(
        unknown
          ? "We couldn’t confirm the discard. Retry the same action before changing this draft."
          : (e as ApiError).message,
      );
      if (!unknown) pending.current = null;
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError("");
    try {
      const result = await api<Progress>(`/onboarding/${kind}`, {
        signal: AbortSignal.timeout(12000),
      });
      setCurrentVersion(result.version);
      setUnavailable(
        !!result.completedResourceId || !Object.keys(result.draft).length,
      );
      setAck(false);
      setConflict(false);
      pending.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!review)
    return (
      <Button
        variant="outline"
        onClick={() => {
          setReview(true);
          setAck(false);
        }}
      >
        {appText(label)}
      </Button>
    );
  return (
    <section
      className="guardian-draft-discard"
      aria-label={appText("Discard draft review")}
    >
      <h3 ref={heading} tabIndex={-1}>
        {appText("Discard this unfinished enquiry?")}{" "}
      </h3>
      <p>
        {appText(
          "This removes the saved criteria for this draft and any unsaved changes in this form. You will start again with your teacher choice.",
        )}{" "}
      </p>
      <p>
        {appText(
          "Your submitted enquiries, learner profiles and confirmed arrangements stay saved. This does not cancel a teacher arrangement or request deletion of your account.",
        )}{" "}
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{appError(error)}</AlertDescription>
        </Alert>
      )}
      {unavailable ? (
        <p role="status">
          {appText(
            "This draft is empty or already submitted. There is no unfinished draft to discard.",
          )}{" "}
        </p>
      ) : (
        <label className="care-ack">
          <input
            type="checkbox"
            checked={ack}
            disabled={locked}
            onChange={(e) => setAck(e.target.checked)}
          />{" "}
          {appText(
            "I understand that this unfinished draft and my unsaved edits will be lost.",
          )}{" "}
        </label>
      )}
      <div className="wizard-actions">
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => {
            setReview(false);
            setError("");
            pending.current = null;
          }}
        >
          {appText("Keep draft")}{" "}
        </Button>
        {conflict ? (
          <Button disabled={busy} onClick={reload}>
            {appText("Reload saved draft")}{" "}
          </Button>
        ) : (
          !unavailable && (
            <Button disabled={busy || (!ack && !uncertain)} onClick={discard}>
              {busy
                ? appText("Discarding…")
                : uncertain
                  ? appText("Retry same discard")
                  : appText("Confirm discard & continue")}
            </Button>
          )
        )}
      </div>
    </section>
  );
}
