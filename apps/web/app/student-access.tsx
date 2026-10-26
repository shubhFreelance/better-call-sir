"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { useAppTranslation } from "./locale";
import { educationLabel } from "./learner-education";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Alert, AlertDescription } from "../components/ui/alert";
import { InvitationRecovery } from "./invitation-recovery";
type SwitchCallbacks = {
  onSwitchStart: (studentId?: string) => void;
  onSwitchFailure: (message: string, uncertain: boolean) => void;
};
type Child = components["schemas"]["Child"];
type Sessions = components["schemas"]["StudentSessions"];
const date = (iso: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
const unknown = (e: unknown) =>
  !(e instanceof ApiError) || e.code === "INVALID_RESPONSE" || e.status >= 500;
function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
    >
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function FamilyAccess({
  session,
  consentActive,
  onSessionChange,
  onSwitchStart,
  onSwitchFailure,
}: {
  session: Session;
  consentActive: boolean;
  onSessionChange: (s: Session) => void;
} & SwitchCallbacks) {
  const { appText, appError, appLocale } = useAppTranslation();

  if (!session.account.verified)
    return (
      <section className="panel">
        <h2>{appText("Guardian verification is pending.")}</h2>
        <p>
          {appText(
            "Student authorization requires an approved guardian account and active consent.",
          )}{" "}
        </p>
        <Link href="/onboarding/parent" className="button">
          {appText("Review guardian onboarding")}{" "}
        </Link>
      </section>
    );
  return (
    <VerifiedFamily
      session={session}
      consentActive={consentActive}
      onSessionChange={onSessionChange}
      onSwitchStart={onSwitchStart}
      onSwitchFailure={onSwitchFailure}
    />
  );
}
function VerifiedFamily({
  session,
  consentActive,
  onSessionChange,
  onSwitchStart,
  onSwitchFailure,
}: {
  session: Session;
  consentActive: boolean;
  onSessionChange: (s: Session) => void;
} & SwitchCallbacks) {
  const { appText, appError, appLocale } = useAppTranslation();

  const params = useSearchParams();
  const children = useQuery({
    queryKey: ["family-children", session.account.id],
    queryFn: () => api<{ items: Child[] }>("/children"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [selected, setSelected] = useState(params.get("learner") || ""),
    [childLocked, setChildLocked] = useState(false),
    [consentLocked, setConsentLocked] = useState(false);
  const locked = childLocked || consentLocked;
  const child =
    children.data?.items.find((c) => c.id === selected) ||
    children.data?.items[0];
  return (
    <div className="family-access">
      <section className="panel">
        <h2>{appText("Learners & student access")}</h2>
        <p>
          {appText(
            "Create a learner’s first invitation, authorize this browser for an existing learner, or revoke student sessions. No child email or phone number is required.",
          )}{" "}
        </p>
        {!consentActive && (
          <Notice>
            {appText(
              "Guardian consent is not active. New invitations and device authorization are paused. You can still revoke existing student sessions.",
            )}{" "}
          </Notice>
        )}
        {children.isPending ? (
          <p role="status">{appText("Loading your learners…")}</p>
        ) : children.error ? (
          <>
            <Notice error>{appError(children.error.message)}</Notice>
            <Button variant="outline" onClick={() => children.refetch()}>
              {appText("Retry learners")}{" "}
            </Button>
          </>
        ) : child ? (
          <div className="field">
            <label htmlFor="family-learner">
              {appText("Choose a learner")}
            </label>
            <select
              id="family-learner"
              value={child.id}
              disabled={locked}
              onChange={(e) => setSelected(e.target.value)}
            >
              {children.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias} · {appText(educationLabel(c))}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p>
            {appText(
              "No learners yet. Add an education profile to get started.",
            )}
          </p>
        )}
        <Link href="/dashboard/learners" className="inline-link">
          {appText("Add or view education profiles")}{" "}
        </Link>
      </section>
      {child && (
        <LearnerAccess
          key={child.id}
          child={child}
          session={session}
          consentActive={consentActive}
          onLockChange={setChildLocked}
          blocked={consentLocked}
          onSessionChange={onSessionChange}
          onSwitchStart={onSwitchStart}
          onSwitchFailure={onSwitchFailure}
        />
      )}
      <FamilyConsent
        session={session}
        active={consentActive}
        blocked={childLocked}
        onLockChange={setConsentLocked}
      />
    </div>
  );
}
function LearnerAccess({
  child,
  session,
  consentActive,
  onLockChange,
  onSessionChange,
  blocked,
  onSwitchStart,
  onSwitchFailure,
}: {
  child: Child;
  blocked: boolean;
  session: Session;
  consentActive: boolean;
  onLockChange: (locked: boolean) => void;
  onSessionChange: (s: Session) => void;
} & SwitchCallbacks) {
  const { appText, appError, appLocale } = useAppTranslation();

  const client = useQueryClient();
  const [pageCursors, setPageCursors] = useState<string[]>([]);
  const cursor = pageCursors.at(-1);
  const pageHeading = useRef<HTMLHeadingElement>(null),
    focusPage = useRef(false);
  const query = useQuery({
    queryKey: [
      "student-sessions",
      session.account.id,
      child.id,
      cursor || null,
    ],
    staleTime: 0,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      api<Sessions>(
        `/children/${child.id}/student-sessions${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<"authorize" | "revoke" | "label" | null>(
      null,
    ),
    [familyId, setFamilyId] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [deviceLabel, setDeviceLabel] = useState(""),
    [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const retry = useRef<{
    body: components["schemas"]["StudentAccessRevocation"];
    key: string;
  } | null>(null);
  const labelRetry = useRef<{
    body: components["schemas"]["StudentDeviceLabel"];
    key: string;
  } | null>(null);
  const locked = busy || uncertain || blocked;
  useEffect(() => {
    onLockChange(busy || uncertain);
  }, [busy, uncertain, onLockChange]);
  useEffect(() => {
    if (focusPage.current && query.isSuccess && !query.isFetching) {
      focusPage.current = false;
      pageHeading.current?.focus();
    }
  }, [cursor, query.isSuccess, query.isFetching]);
  function browseDevices(next: string[]) {
    if (locked || query.isFetching || action) return;
    setError("");
    setSuccess("");
    setConflict(false);
    focusPage.current = true;
    setPageCursors(next);
  }
  function choose(next: typeof action, id: string | null = null) {
    setAction(next);
    setFamilyId(id);
    setReason("");
    setAgreed(false);
    setError("");
    setSuccess("");
    retry.current = null;
    labelRetry.current = null;
    setDeviceLabel(
      query.data?.items.find((d) => d.familyId === id)?.deviceLabel || "",
    );
    if (next === "label")
      requestAnimationFrame(() =>
        document.getElementById("student-device-label")?.focus(),
      );
  }
  function finish(next: Session) {
    if (
      next.account.role !== "STUDENT" ||
      next.account.id !== child.studentAccountId
    )
      throw new Error(
        "The service did not confirm this learner’s student session.",
      );
    client.clear();
    onSessionChange(next);
  }
  async function authorize() {
    if (!agreed || !query.data) {
      setError(
        "Confirm that you are authorizing the intended student browser.",
      );
      return;
    }
    onSwitchStart(child.studentAccountId || undefined);
    setBusy(true);

    setError("");
    try {
      finish(
        await api<Session>(`/children/${child.id}/student-sessions`, {
          method: "POST",
          body: { expectedVersion: query.data.childVersion },
          csrf: session.csrfToken,
          signal: AbortSignal.timeout(15000),
        }),
      );
    } catch (e) {
      const unsure = unknown(e);
      onSwitchFailure(
        unsure
          ? "We couldn’t confirm the device switch. Check device access before trying again."
          : (e as Error).message,
        unsure,
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!retry.current) {
      if (!agreed || !reason.trim() || !query.data) {
        setError("Add a reason and confirm the student access to revoke.");
        return;
      }
      retry.current = {
        key: crypto.randomUUID(),
        body: {
          expectedVersion: query.data.childVersion,
          familyId,
          reason: reason.trim(),
        },
      };
    }
    setBusy(true);

    setError("");
    setSuccess("");
    try {
      await api(`/children/${child.id}/student-access-revocations`, {
        method: "POST",
        csrf: session.csrfToken,
        key: retry.current.key,
        body: retry.current.body,
        signal: AbortSignal.timeout(15000),
      });
      retry.current = null;
      setUncertain(false);

      setAction(null);
      setReason("");
      setSuccess(
        familyId
          ? "Selected student session revoked."
          : "All student access revoked. A guardian must authorize access again.",
      );
      await query.refetch();
      client.invalidateQueries({ queryKey: ["family-children"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      const unsure = unknown(e);
      setUncertain(unsure);

      if (!unsure) retry.current = null;
      setConflict(e instanceof ApiError && e.status === 409);
      setError(
        unsure
          ? "We couldn’t confirm the revocation. Retry this same change before making edits."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveLabel() {
    if (
      busy ||
      conflict ||
      blocked ||
      query.error ||
      query.isFetching ||
      !query.data
    )
      return;
    if (!labelRetry.current) {
      const label = deviceLabel.trim() || null;
      if (label && (label.length > 60 || /[\u0000-\u001f\u007f]/.test(label))) {
        setError(
          "Use up to 60 characters without line breaks or control characters.",
        );
        document.getElementById("student-device-label")?.focus();
        return;
      }
      if (!familyId || !query.data.items.some((d) => d.familyId === familyId)) {
        setConflict(true);
        setError(
          "This session is no longer listed. Refresh student access before continuing.",
        );
        return;
      }
      labelRetry.current = {
        key: crypto.randomUUID(),
        body: { expectedVersion: query.data.childVersion, familyId, label },
      };
    }
    const attempt = labelRetry.current;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<
        components["schemas"]["StudentDeviceLabelSaved"]
      >(`/children/${child.id}/student-session-labels`, {
        method: "POST",
        body: attempt.body,
        key: attempt.key,
        csrf: session.csrfToken,
        signal: AbortSignal.timeout(15000),
      });
      if (
        result.familyId !== attempt.body.familyId ||
        result.label !== attempt.body.label ||
        result.childVersion !== attempt.body.expectedVersion + 1
      )
        throw new Error("The service did not confirm the device label.");
      labelRetry.current = null;
      setUncertain(false);
      setAction(null);
      setSuccess(
        result.label
          ? "Device label saved. Student access is unchanged."
          : "Device label cleared. Student access is unchanged.",
      );
      await query.refetch();
      client.invalidateQueries({ queryKey: ["family-children"] });
    } catch (e) {
      const unsure = unknown(e);
      setUncertain(unsure);
      if (!unsure) labelRetry.current = null;
      setConflict(e instanceof ApiError && [404, 409].includes(e.status));
      setError(
        unsure
          ? "We couldn’t confirm the device label. Retry the same change before editing."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    const result = await query.refetch();
    await client.invalidateQueries({ queryKey: ["family-children"] });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else {
      setConflict(false);
      setSuccess(
        "Latest student access loaded. Review the current sessions before confirming.",
      );
    }
  }
  return (
    <section className="panel family-student-access">
      <div className="panel-title">
        <h2>
          {child.alias}
          {appText("’s student space")}
        </h2>
        <RefreshButton variant="outline" disabled={locked} onClick={refresh} label={appText("Refresh student access")} />
      </div>
      <p>{appText(educationLabel(child))}</p>
      {query.isPending ? (
        <p role="status">{appText("Loading student access…")}</p>
      ) : query.error ? (
        <Notice error>{appError(query.error.message)}</Notice>
      ) : (
        query.data && (
          <>
            <p className="badge">
              {!child.studentAccountId
                ? appText("Not activated")
                : query.data.accessRevoked
                  ? appText("Access revoked")
                  : appText("Student space activated")}
            </p>
            {child.studentAccountId ? (
              <>
                <h3 ref={pageHeading} tabIndex={-1}>
                  {appText("Authorized student sessions")}{" "}
                </h3>
                <p className="wizard-help">
                  {appText(
                    "Give each session a name you recognize, such as “Study tablet”. Labels are private reminders, not verified device information. Browse all current sessions, 20 per page.",
                  )}{" "}
                </p>
                {query.data.items.length ? (
                  <ul className="family-session-list">
                    {query.data.items.map((device) => (
                      <li key={device.familyId}>
                        <div>
                          <strong>
                            {device.deviceLabel ||
                              appText("Unnamed student device")}
                          </strong>
                          <p>
                            {appText("Session")} {device.familyId.slice(0, 8)}
                          </p>
                          <p>
                            {appText("Expires")}{" "}
                            {date(device.expiresAt, appLocale)} {appText("IST")}
                          </p>
                        </div>
                        <div className="family-device-actions">
                          <Button
                            variant="outline"
                            disabled={
                              locked ||
                              conflict ||
                              !consentActive ||
                              query.isFetching ||
                              query.data.accessRevoked
                            }
                            onClick={() => choose("label", device.familyId)}
                            aria-label={appText("{0} device {1}", [
                              device.deviceLabel
                                ? appText("Rename")
                                : appText("Name"),
                              device.familyId.slice(0, 8),
                            ])}
                          >
                            {device.deviceLabel
                              ? appText("Rename device")
                              : appText("Name device")}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={locked || conflict || query.isFetching}
                            onClick={() => choose("revoke", device.familyId)}
                            aria-label={appText("Revoke session {0}", [
                              device.familyId.slice(0, 8),
                            ])}
                          >
                            {appText("Revoke session")}{" "}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {cursor
                      ? appText(
                          "No active student sessions on this page. Go back to previous devices or refresh the list.",
                        )
                      : appText("No active student sessions.")}
                  </p>
                )}
                <div className="wizard-actions">
                  <Button
                    className="button"
                    disabled={
                      locked || conflict || !consentActive || query.isFetching
                    }
                    onClick={() => choose("authorize")}
                    aria-label={appText("Authorize this device for {0}", [
                      child.alias,
                    ])}
                  >
                    {appText("Authorize this device")}{" "}
                  </Button>
                  <Button
                    variant="outline"
                    className="button secondary"
                    disabled={
                      locked ||
                      conflict ||
                      query.data.accessRevoked ||
                      query.isFetching
                    }
                    onClick={() => choose("revoke")}
                  >
                    {appText("Revoke all student access")}{" "}
                  </Button>
                </div>
              </>
            ) : (
              <InvitationRecovery
                session={session}
                childId={child.id}
                alias={child.alias}
                blocked={locked}
                consentActive={consentActive}
                onLockChange={onLockChange}
              />
            )}
          </>
        )
      )}
      {child.studentAccountId && (
        <nav
          className="family-device-pagination"
          aria-label={appText("Student device pages")}
        >
          <p role="status">
            {appText("Device page")} {pageCursors.length + 1}
          </p>
          <div className="family-device-actions">
            {pageCursors.length > 0 && (
              <Button
                variant="outline"
                disabled={locked || query.isFetching || !!action}
                onClick={() => browseDevices(pageCursors.slice(0, -1))}
              >
                {appText("Previous devices")}{" "}
              </Button>
            )}
            {query.data?.nextCursor && !query.error && (
              <Button
                variant="outline"
                disabled={locked || query.isFetching || !!action}
                onClick={() =>
                  browseDevices([...pageCursors, query.data!.nextCursor!])
                }
              >
                {appText("Next devices")}{" "}
              </Button>
            )}
          </div>
          {action && (pageCursors.length > 0 || query.data?.nextCursor) && (
            <p className="wizard-help">
              {appText(
                "Finish or cancel this change before browsing devices.",
              )}{" "}
            </p>
          )}
        </nav>
      )}
      {action && (
        <form
          className="family-confirm"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (action === "authorize") authorize();
            else if (action === "label") saveLabel();
            else revoke();
          }}
        >
          <h3>
            {action === "authorize"
              ? appText("Switch this device to {0}?", [child.alias])
              : action === "label"
                ? appText("Name this student device")
                : familyId
                  ? appText("Revoke session {0}?", [familyId.slice(0, 8)])
                  : appText("Revoke all access for {0}?", [child.alias])}
          </h3>
          <p>
            {action === "authorize"
              ? appText(
                  "This browser will switch from your guardian account to a restricted student session. Other guardian devices stay signed in. Use the device intended for the learner.",
                )
              : action === "label"
                ? appText(
                    "Label session {0} so you can recognize it later. Naming it does not change who can sign in.",
                    [familyId?.slice(0, 8)],
                  )
                : familyId
                  ? appText(
                      "This session and its refresh access will stop. Other student sessions remain authorized.",
                    )
                  : appText(
                      "All student sessions and their refresh access will stop. Access stays blocked until a guardian authorizes a device again.",
                    )}
          </p>
          <fieldset
            className="wizard-fields"
            disabled={
              locked ||
              conflict ||
              (action === "label" && (!!query.error || query.isFetching))
            }
          >
            {action === "label" && (
              <div className="field">
                <label htmlFor="student-device-label">
                  {appText("Device label (optional)")}{" "}
                </label>
                <Input
                  id="student-device-label"
                  value={deviceLabel}
                  maxLength={60}
                  aria-describedby="student-device-label-help"
                  onChange={(e) => setDeviceLabel(e.target.value)}
                />
                <p id="student-device-label-help" className="wizard-help">
                  {appText(
                    "Use a simple name. Leave blank to clear the label. Avoid names, contact details and passwords.",
                  )}{" "}
                </p>
              </div>
            )}
            {action === "revoke" && (
              <div className="field">
                <label htmlFor="student-revocation-reason">
                  {appText("Reason for revoking access")}{" "}
                </label>
                <Textarea
                  id="student-revocation-reason"
                  rows={3}
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
            {action !== "label" && (
              <label className="wizard-checkbox">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  {action === "revoke"
                    ? appText(
                        "I understand which student access will be revoked.",
                      )
                    : appText(
                        "I am the learner’s guardian and will authorize only the intended student device.",
                      )}
                </span>
              </label>
            )}
            <div className="wizard-actions">
              <Button
                variant="outline"
                type="button"
                className="button secondary"
                onClick={() => setAction(null)}
              >
                {appText("Cancel")}{" "}
              </Button>
              <Button className="button" type="submit">
                {action === "authorize"
                  ? appText("Confirm student device switch")
                  : action === "label"
                    ? appText("Save device label")
                    : appText("Confirm access revocation")}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {error && <Notice error>{appError(error)}</Notice>}
      {success && <Notice>{appText(success)}</Notice>}
      {busy && <p role="status">{appText("Updating student access…")}</p>}
      {uncertain && (
        <Button
          className="button"
          disabled={busy || blocked}
          onClick={action === "label" ? saveLabel : revoke}
        >
          {action === "label"
            ? appText("Retry device label")
            : appText("Retry access revocation")}
        </Button>
      )}
      {conflict && (
        <p className="wizard-help">
          {appText(
            "Refresh student access to load the current learner version. Your entered details remain here. Review them again before saving.",
          )}{" "}
        </p>
      )}
    </section>
  );
}
function FamilyConsent({
  session,
  active,
  blocked,
  onLockChange,
}: {
  session: Session;
  active: boolean;
  blocked: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false),
    [agreed, setAgreed] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onLockChange(busy || uncertain);
  }, [busy, uncertain, onLockChange]);
  async function check() {
    setBusy(true);
    try {
      const d = await api<{ consent: { withdrawnAt: string | null } | null }>(
        "/dashboard",
      );
      client.invalidateQueries({ queryKey: ["dashboard"] });
      client.invalidateQueries({ queryKey: ["student-sessions"] });
      setUncertain(false);
      setConfirm(false);
      if (d.consent && !d.consent.withdrawnAt)
        setError(
          "Consent is still active. Review the withdrawal before confirming again.",
        );
      else setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (!agreed) {
      setError("Confirm that you understand what withdrawal pauses.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/consents/withdraw", {
        method: "POST",
        body: {},
        csrf: session.csrfToken,
        signal: AbortSignal.timeout(15000),
      });
      setConfirm(false);
      client.invalidateQueries({ queryKey: ["dashboard"] });
      client.invalidateQueries({ queryKey: ["student-sessions"] });
    } catch (e) {
      setUncertain(unknown(e));
      setError(
        unknown(e)
          ? "We couldn’t confirm withdrawal. Check consent status before trying again."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel family-consent">
      <h2>{appText("Guardian consent")}</h2>
      <p>
        {active
          ? appText(
              "Consent is active. You can pause new matching and learner-data changes by withdrawing it. Student sessions are revoked when you withdraw.",
            )
          : appText(
              "Consent is pending or withdrawn. New matching and student authorization remain paused.",
            )}
      </p>
      {active ? (
        confirm ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              withdraw();
            }}
          >
            <fieldset
              disabled={busy || uncertain || blocked}
              className="wizard-fields"
            >
              <label className="wizard-checkbox">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  {appText(
                    "I understand that withdrawal pauses new matching and child-data changes, and revokes student sessions.",
                  )}{" "}
                </span>
              </label>
              <div className="wizard-actions">
                <Button
                  type="button"
                  variant="outline"
                  className="button secondary"
                  onClick={() => setConfirm(false)}
                >
                  {appText("Keep consent active")}{" "}
                </Button>
                <Button type="submit" className="button">
                  {appText("Confirm consent withdrawal")}{" "}
                </Button>
              </div>
            </fieldset>
          </form>
        ) : (
          <Button
            variant="outline"
            disabled={busy || uncertain || blocked}
            onClick={() => setConfirm(true)}
          >
            {appText("Withdraw guardian consent")}{" "}
          </Button>
        )
      ) : (
        <Link className="inline-link" href="/onboarding/parent">
          {appText("Review consent in onboarding")}{" "}
        </Link>
      )}
      {error && <Notice error>{appError(error)}</Notice>}
      {uncertain && (
        <Button className="button" disabled={busy} onClick={check}>
          {appText("Check consent status")}{" "}
        </Button>
      )}
    </section>
  );
}
export function StudentActivation({
  session,
  onSessionChange,
  onSwitchStart,
  onSwitchFailure,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
} & SwitchCallbacks) {
  const { appText, appError, appLocale } = useAppTranslation();

  const client = useQueryClient();
  const [token, setToken] = useState(""),
    [agreed, setAgreed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    token?: string;
    confirmation?: string;
  }>({});
  function finish(next: Session) {
    if (next.account.role !== "STUDENT")
      throw new Error("A student session was not confirmed.");
    client.clear();
    setToken("");
    onSessionChange(next);
  }
  async function activate() {
    if (!token.trim() || token.trim().length > 100 || !agreed) {
      setError(
        "Enter the invitation code and confirm the intended student device.",
      );
      const missingToken = !token.trim() || token.trim().length > 100;
      setFieldErrors({
        ...(missingToken
          ? { token: "Enter your private invitation code." }
          : {}),
        ...(!agreed
          ? {
              confirmation: "Confirm that this is the intended student device.",
            }
          : {}),
      });
      document
        .getElementById(
          missingToken ? "student-token" : "student-device-confirmation",
        )
        ?.focus();
      return;
    }
    onSwitchStart();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      finish(
        await api<Session>("/invitations/activate", {
          method: "POST",
          body: { token: token.trim() },
          csrf: session.csrfToken,
          signal: AbortSignal.timeout(15000),
        }),
      );
    } catch (e) {
      const unsure = unknown(e);
      const message = unsure
        ? "We couldn’t confirm activation. Check device access before using the invitation again."
        : (e as Error).message;
      if (!unsure) setError(message);
      onSwitchFailure(message, unsure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container narrow section">
      <div className="wizard-title">
        <h1>{appText("Your learning, in your own space.")}</h1>
        <p>
          {appText(
            "A guardian-authorized student space, without a child’s email or phone number.",
          )}{" "}
        </p>
      </div>
      <form
        className="wizard-card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          activate();
        }}
      >
        <h2>{appText("Authorize the student device")}</h2>
        <p>
          {appText("You’re signed in as")} {session.account.name}
          {appText(
            ". Only the guardian who created this invitation can activate it.",
          )}{" "}
        </p>
        <Notice>
          {appText(
            "This browser will switch to the learner’s student session. Guardian purchases, consent controls and private notes will stay out of the student interface.",
          )}{" "}
        </Notice>
        <fieldset
          className="wizard-fields"
          disabled={busy || !session.account.verified}
        >
          <div className="field">
            <label htmlFor="student-token">
              {appText("Guardian invitation code")}
            </label>
            <Input
              id="student-token"
              aria-invalid={!!fieldErrors.token}
              aria-describedby={
                fieldErrors.token ? "student-token-error" : undefined
              }
              value={token}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setToken(e.target.value)}
            />
            {fieldErrors.token && (
              <small
                id="student-token-error"
                className="field-error"
                role="alert"
              >
                {appError(fieldErrors.token)}
              </small>
            )}
          </div>
          <label className="wizard-checkbox">
            <input
              type="checkbox"
              id="student-device-confirmation"
              aria-invalid={!!fieldErrors.confirmation}
              aria-describedby={
                fieldErrors.confirmation
                  ? "student-device-confirmation-error"
                  : undefined
              }
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {appText(
                "I am the inviting guardian and this is the intended student device.",
              )}{" "}
            </span>
          </label>
          {fieldErrors.confirmation && (
            <small
              id="student-device-confirmation-error"
              className="field-error"
              role="alert"
            >
              {appError(fieldErrors.confirmation)}
            </small>
          )}
          <Button type="submit" className="button">
            {appText("Authorize student access")}{" "}
          </Button>
        </fieldset>
        {!session.account.verified && (
          <Notice>
            {appText(
              "Guardian verification is pending. Student authorization is unavailable until your account is approved.",
            )}{" "}
          </Notice>
        )}
        {error && <Notice error>{appError(error)}</Notice>}
        {busy && <p role="status">{appText("Authorizing student access…")}</p>}
        <Link className="inline-link" href="/dashboard/family">
          {appText("Return to learners & access")}{" "}
        </Link>
      </form>
    </main>
  );
}
