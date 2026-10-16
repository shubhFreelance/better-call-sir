"use client";
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
const date = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
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
  if (!session.account.verified)
    return (
      <section className="panel">
        <h2>Guardian verification is pending.</h2>
        <p>
          Student authorization requires an approved guardian account and active
          consent.
        </p>
        <Link href="/onboarding/parent" className="button">
          Review guardian onboarding
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
        <h2>Learners & student access</h2>
        <p>
          Create a learner’s first invitation, authorize this browser for an
          existing learner, or revoke student sessions. No child email or phone
          number is required.
        </p>
        {!consentActive && (
          <Notice>
            Guardian consent is not active. New invitations and device
            authorization are paused. You can still revoke existing student
            sessions.
          </Notice>
        )}
        {children.isPending ? (
          <p role="status">Loading your learners…</p>
        ) : children.error ? (
          <>
            <Notice error>{children.error.message}</Notice>
            <Button variant="outline" onClick={() => children.refetch()}>
              Retry learners
            </Button>
          </>
        ) : child ? (
          <div className="field">
            <label htmlFor="family-learner">Choose a learner</label>
            <select
              id="family-learner"
              value={child.id}
              disabled={locked}
              onChange={(e) => setSelected(e.target.value)}
            >
              {children.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias} · {educationLabel(c)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p>No learners yet. Add an education profile to get started.</p>
        )}
        <Link href="/dashboard/learners" className="inline-link">
          Add or view education profiles
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
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["student-sessions", session.account.id, child.id],
    refetchOnReconnect: false,
    queryFn: () => api<Sessions>(`/children/${child.id}/student-sessions`),
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
        <h2>{child.alias}’s student space</h2>
        <Button variant="outline" disabled={locked} onClick={refresh}>
          Refresh student access
        </Button>
      </div>
      <p>{educationLabel(child)}</p>
      {query.isPending ? (
        <p role="status">Loading student access…</p>
      ) : query.error ? (
        <Notice error>{query.error.message}</Notice>
      ) : (
        query.data && (
          <>
            <p className="badge">
              {!child.studentAccountId
                ? "Not activated"
                : query.data.accessRevoked
                  ? "Access revoked"
                  : "Student space activated"}
            </p>
            {child.studentAccountId ? (
              <>
                <h3>Authorized student sessions</h3>
                <p className="wizard-help">
                  Give each session a name you recognize, such as “Study
                  tablet”. Labels are private reminders, not verified device
                  information. Up to 50 current session groups are shown.
                </p>
                {query.data.items.length ? (
                  <ul className="family-session-list">
                    {query.data.items.map((device) => (
                      <li key={device.familyId}>
                        <div>
                          <strong>
                            {device.deviceLabel || "Unnamed student device"}
                          </strong>
                          <p>Session {device.familyId.slice(0, 8)}</p>
                          <p>Expires {date(device.expiresAt)} IST</p>
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
                            aria-label={`${device.deviceLabel ? "Rename" : "Name"} device ${device.familyId.slice(0, 8)}`}
                          >
                            {device.deviceLabel
                              ? "Rename device"
                              : "Name device"}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={locked || conflict}
                            onClick={() => choose("revoke", device.familyId)}
                            aria-label={`Revoke session ${device.familyId.slice(0, 8)}`}
                          >
                            Revoke session
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No active student sessions.</p>
                )}
                <div className="wizard-actions">
                  <Button
                    className="button"
                    disabled={locked || conflict || !consentActive}
                    onClick={() => choose("authorize")}
                  >
                    Authorize this device for {child.alias}
                  </Button>
                  <Button
                    variant="outline"
                    className="button secondary"
                    disabled={locked || conflict || query.data.accessRevoked}
                    onClick={() => choose("revoke")}
                  >
                    Revoke all student access
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
              ? `Switch this device to ${child.alias}?`
              : action === "label"
                ? "Name this student device"
                : familyId
                  ? `Revoke session ${familyId.slice(0, 8)}?`
                  : `Revoke all access for ${child.alias}?`}
          </h3>
          <p>
            {action === "authorize"
              ? "This browser will switch from your guardian account to a restricted student session. Other guardian devices stay signed in. Use the device intended for the learner."
              : action === "label"
                ? `Label session ${familyId?.slice(0, 8)} so you can recognize it later. Naming it does not change who can sign in.`
                : familyId
                  ? "This session and its refresh access will stop. Other student sessions remain authorized."
                  : "All student sessions and their refresh access will stop. Access stays blocked until a guardian authorizes a device again."}
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
                  Device label (optional)
                </label>
                <Input
                  id="student-device-label"
                  value={deviceLabel}
                  maxLength={60}
                  aria-describedby="student-device-label-help"
                  onChange={(e) => setDeviceLabel(e.target.value)}
                />
                <p id="student-device-label-help" className="wizard-help">
                  Use a simple name. Leave blank to clear the label. Avoid
                  names, contact details and passwords.
                </p>
              </div>
            )}
            {action === "revoke" && (
              <div className="field">
                <label htmlFor="student-revocation-reason">
                  Reason for revoking access
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
                    ? "I understand which student access will be revoked."
                    : "I am the learner’s guardian and will authorize only the intended student device."}
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
                Cancel
              </Button>
              <Button className="button" type="submit">
                {action === "authorize"
                  ? "Confirm student device switch"
                  : action === "label"
                    ? "Save device label"
                    : "Confirm access revocation"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      {busy && <p role="status">Updating student access…</p>}
      {uncertain && (
        <Button
          className="button"
          disabled={busy || blocked}
          onClick={action === "label" ? saveLabel : revoke}
        >
          {action === "label"
            ? "Retry device label"
            : "Retry access revocation"}
        </Button>
      )}
      {conflict && (
        <p className="wizard-help">
          Refresh student access to load the current learner version. Your
          entered details remain here. Review them again before saving.
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
      <h2>Guardian consent</h2>
      <p>
        {active
          ? "Consent is active. You can pause new matching and learner-data changes by withdrawing it. Student sessions are revoked when you withdraw."
          : "Consent is pending or withdrawn. New matching and student authorization remain paused."}
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
                  I understand that withdrawal pauses new matching and
                  child-data changes, and revokes student sessions.
                </span>
              </label>
              <div className="wizard-actions">
                <Button
                  type="button"
                  variant="outline"
                  className="button secondary"
                  onClick={() => setConfirm(false)}
                >
                  Keep consent active
                </Button>
                <Button type="submit" className="button">
                  Confirm consent withdrawal
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
            Withdraw guardian consent
          </Button>
        )
      ) : (
        <Link className="inline-link" href="/onboarding/parent">
          Review consent in onboarding
        </Link>
      )}
      {error && <Notice error>{error}</Notice>}
      {uncertain && (
        <Button className="button" disabled={busy} onClick={check}>
          Check consent status
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
        <h1>Your learning, in your own space.</h1>
        <p>
          A guardian-authorized student space, without a child’s email or phone
          number.
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
        <h2>Authorize the student device</h2>
        <p>
          You’re signed in as {session.account.name}. Only the guardian who
          created this invitation can activate it.
        </p>
        <Notice>
          This browser will switch to the learner’s student session. Guardian
          purchases, consent controls and private notes will stay out of the
          student interface.
        </Notice>
        <fieldset
          className="wizard-fields"
          disabled={busy || !session.account.verified}
        >
          <div className="field">
            <label htmlFor="student-token">Guardian invitation code</label>
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
                {fieldErrors.token}
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
              I am the inviting guardian and this is the intended student
              device.
            </span>
          </label>
          {fieldErrors.confirmation && (
            <small
              id="student-device-confirmation-error"
              className="field-error"
              role="alert"
            >
              {fieldErrors.confirmation}
            </small>
          )}
          <Button type="submit" className="button">
            Authorize student access
          </Button>
        </fieldset>
        {!session.account.verified && (
          <Notice>
            Guardian verification is pending. Student authorization is
            unavailable until your account is approved.
          </Notice>
        )}
        {error && <Notice error>{error}</Notice>}
        {busy && <p role="status">Authorizing student access…</p>}
        <Link className="inline-link" href="/dashboard/family">
          Return to learners & access
        </Link>
      </form>
    </main>
  );
}
