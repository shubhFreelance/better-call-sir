"use client";
import { useAppTranslation } from "./locale";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";
type Status = components["schemas"]["InvitationStatus"];
type Result = components["schemas"]["InvitationReplacementResult"];
export function InvitationRecovery({
  session,
  childId,
  alias,
  blocked,
  consentActive,
  onLockChange,
}: {
  session: Session;
  childId: string;
  alias: string;
  blocked: boolean;
  consentActive: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const client = useQueryClient(),
    queryKey = ["child-invitation", session.account.id, childId];
  const query = useQuery({
    queryKey,
    queryFn: () => api<Status>(`/children/${childId}/invitation`),
    enabled: consentActive,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [invite, setInvite] = useState<{
      token: string;
      expiresAt: string;
    } | null>(null),
    [reveal, setReveal] = useState(false);
  const pending = useRef<{
    body: components["schemas"]["InvitationReplacement"];
    key: string;
  } | null>(null);
  const locked =
    busy ||
    uncertain ||
    blocked ||
    !consentActive ||
    query.isFetching ||
    !!query.error;
  useEffect(() => {
    onLockChange(busy || uncertain);
  }, [busy, uncertain, onLockChange]);
  useEffect(() => {
    if (
      !consentActive ||
      (query.data &&
        (query.data.state !== "ACTIVE" ||
          query.data.expiresAt !== invite?.expiresAt))
    ) {
      setInvite(null);
      setReveal(false);
    }
  }, [consentActive, query.data?.state, query.data?.expiresAt]);
  async function refresh() {
    setError("");
    setBusy(true);
    const result = await query.refetch();
    setBusy(false);
    if (result.error) setError(result.error.message);
    else {
      setConflict(false);
      setReview(false);
      setAgreed(false);
      setNotice(
        "Latest invitation status loaded. Review it before creating or replacing a code.",
      );
    }
  }
  async function issue() {
    if (!pending.current) {
      if (!agreed || !query.data) return;
      pending.current = {
        key: crypto.randomUUID(),
        body: { expectedVersion: query.data.childVersion, acknowledged: true },
      };
    }
    setBusy(true);
    setError("");
    setNotice("");
    setInvite(null);
    setReveal(false);
    try {
      const result = await api<Result>(
        `/children/${childId}/invitation-replacements`,
        {
          method: "POST",
          body: pending.current.body,
          key: pending.current.key,
          csrf: session.csrfToken,
          signal: AbortSignal.timeout(15000),
        },
      );
      if (
        !result.expiresAt ||
        !Number.isInteger(result.childVersion) ||
        (result.status !== "ISSUED" && result.status !== "CODE_UNAVAILABLE") ||
        (result.status === "ISSUED" && !result.token)
      )
        throw new Error("The invitation result was not confirmed.");
      client.setQueryData<Status>(queryKey, {
        state: "ACTIVE",
        expiresAt: result.expiresAt,
        childVersion: result.childVersion,
      });
      pending.current = null;
      setUncertain(false);
      setReview(false);
      setAgreed(false);
      if (result.status === "ISSUED" && result.token) {
        setInvite({ token: result.token, expiresAt: result.expiresAt });
        setNotice(
          "Invitation created. Its code is shown only in this page session. Earlier codes no longer work.",
        );
      } else {
        setConflict(true);
        setNotice(
          "The request was already completed. Its private code cannot be shown again. Refresh the status, then explicitly replace the invitation if you need a new code.",
        );
      }
      client.invalidateQueries({ queryKey: ["family-children"] });
      client.invalidateQueries({ queryKey: ["student-sessions"] });
    } catch (e) {
      const unknown =
        !(e instanceof ApiError) ||
        e.code === "INVALID_RESPONSE" ||
        e.status >= 500;
      setUncertain(unknown);
      setConflict(e instanceof ApiError && e.status === 409);
      if (!unknown) {
        pending.current = null;
        setAgreed(false);
      }
      setError(
        unknown
          ? "We couldn’t confirm the invitation. Retry this same request to check it without creating another code."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const current = query.data;
  return (
    <div className="invitation-recovery">
      <div className="panel-title">
        <h3>{appText("Student invitation")}</h3>
        <Button
          variant="outline"
          disabled={busy || uncertain || blocked || !consentActive}
          onClick={refresh}
        >
          {appText("Refresh invitation status")}{" "}
        </Button>
      </div>
      {!consentActive ? (
        <p>
          {appText(
            "Active guardian consent is required to create or replace invitations.",
          )}{" "}
        </p>
      ) : query.isPending || query.isFetching ? (
        <p role="status">{appText("Loading invitation status…")}</p>
      ) : query.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {appText(
              "Invitation status could not be loaded. Refresh before continuing.",
            )}{" "}
          </AlertDescription>
        </Alert>
      ) : (
        current && (
          <>
            <p className="badge">
              {
                {
                  NONE: "No invitation yet",
                  ACTIVE: "Invitation ready",
                  EXPIRED: "Invitation expired",
                  ACTIVATED: "Student space activated",
                }[current.state]
              }
            </p>
            {current.expiresAt && current.state !== "ACTIVATED" && (
              <p>
                {appText("Invitation expiry:")}{" "}
                {new Date(current.expiresAt).toLocaleString(appLocale, {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                {appText("IST.")}{" "}
              </p>
            )}
            <p className="wizard-help">
              {appText(
                "Lost a code or returned to this page? Codes cannot be retrieved. Replacing an invitation invalidates all earlier codes for this learner. Existing student accounts are managed through device access.",
              )}{" "}
            </p>
            {current.state !== "ACTIVATED" && !review && (
              <Button
                disabled={locked || conflict}
                onClick={() => {
                  setReview(true);
                  setAgreed(false);
                  setError("");
                  setNotice("");
                }}
              >
                {current.state === "NONE"
                  ? appText("Create first student invitation")
                  : appText("Replace student invitation")}
              </Button>
            )}
            {current.state === "ACTIVATED" && (
              <p>
                {appText(
                  "Refresh student access to manage the learner’s authorized devices.",
                )}{" "}
              </p>
            )}
          </>
        )
      )}
      {review && (
        <form
          className="family-confirm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!locked && !conflict) issue();
          }}
        >
          <h3>
            {current?.state === "NONE"
              ? appText("Create a first invitation?")
              : appText("Replace this learner’s invitation?")}
          </h3>
          <p>
            {appText(
              "The new invitation lasts 24 hours and is single-use. All earlier codes stop working. Only you, signed in as the inviting guardian on the intended student device, can activate it. This does not switch your current account.",
            )}{" "}
          </p>
          <fieldset className="wizard-fields" disabled={locked || conflict}>
            <label className="wizard-checkbox">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                {appText(
                  "I am the learner’s guardian and will authorize only the intended student device. I understand that earlier invitation codes will stop working.",
                )}{" "}
              </span>
            </label>
            <div className="wizard-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReview(false)}
              >
                {appText("Cancel")}{" "}
              </Button>
              <Button type="submit" disabled={!agreed}>
                {current?.state === "NONE"
                  ? appText("Create invitation")
                  : appText("Confirm invitation replacement")}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {invite && (
        <div className="family-invitation">
          <h3>
            {appText("Invitation for")} {alias}
          </h3>
          <p>
            {appText("Expires")}{" "}
            {new Date(invite.expiresAt).toLocaleString(appLocale, {
              timeZone: "Asia/Kolkata",
            })}{" "}
            {appText(
              "IST. Single-use; only the inviting guardian can activate it.",
            )}{" "}
          </p>
          {reveal ? (
            <div className="field">
              <label htmlFor="student-invitation-code">
                {appText("Private invitation code")}{" "}
              </label>
              <Input
                id="student-invitation-code"
                readOnly
                autoComplete="off"
                spellCheck={false}
                value={invite.token}
              />
              <Button variant="ghost" onClick={() => setReveal(false)}>
                {appText("Hide invitation code")}{" "}
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setReveal(true)}>
              {appText("Reveal invitation code")}{" "}
            </Button>
          )}
          <ol>
            <li>
              {appText("Open student onboarding on the intended device.")}
            </li>
            <li>
              {appText(
                "Sign in with your own guardian account on that device.",
              )}
            </li>
            <li>
              {appText(
                "Paste the code and confirm the switch to the student space.",
              )}
            </li>
          </ol>
          <p className="wizard-help">
            {appText(
              "Keep this code private. It is not saved in browser storage or placed in a link.",
            )}{" "}
          </p>
          <Link className="inline-link" href="/onboarding/student">
            {appText("Open student onboarding")}{" "}
          </Link>
        </div>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{appError(error)}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert role="status">
          <AlertDescription>{appText(notice)}</AlertDescription>
        </Alert>
      )}
      {uncertain && (
        <Button disabled={busy} onClick={issue}>
          {appText("Retry invitation request")}{" "}
        </Button>
      )}
      {conflict && (
        <p>
          {appText(
            "Refresh invitation status and review it before creating or replacing a code.",
          )}{" "}
        </p>
      )}
    </div>
  );
}
