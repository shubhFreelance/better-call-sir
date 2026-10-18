"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useAppTranslation } from "./locale";
import { useHistory, HistoryPages } from "./history";
import { Feedback, Notice, useDecision } from "./tuition-workflow";
type Staff = components["schemas"]["StaffAccount"];
type Change = components["schemas"]["StaffChange"];
type Kind = Change["kind"];
type Editor = { kind: Kind; target?: Staff } | { change: Change };
const roleNames = {
  ADMIN: "Administrator",
  OPERATOR: "Operator",
  REVIEWER: "Reviewer",
  FINANCE: "Finance",
};
const kindNames = {
  CREATE: "New staff access",
  CHANGE: "Change staff access",
  SUSPEND: "Suspend staff access",
  RECOVER: "Recover staff authenticator",
};
export function StaffAdministration({
  session,
  onLockChange,
}: {
  session: Session;
  onLockChange: (locked: boolean) => void;
}) {
  const { appText } = useAppTranslation(),
    client = useQueryClient();
  const [editor, setEditor] = useState<Editor | null>(null),
    [status, setStatus] = useState("PENDING");
  const title = useRef<HTMLHeadingElement>(null),
    previous = useRef(false);
  const directory = useHistory<{ items: Staff[]; nextCursor: string | null }>({
    queryKey: ["staff-directory", session.account.id],
    path: "/admin/staff",
  });
  const changes = useHistory<{ items: Change[]; nextCursor: string | null }>({
    queryKey: ["staff-changes", session.account.id, status],
    path: "/admin/staff/changes" + (status ? "?status=" + status : ""),
  });
  const unavailable = !!directory.error || !!changes.error;
  useEffect(() => {
    onLockChange(!!editor);
    return () => onLockChange(false);
  }, [editor, onLockChange]);
  useEffect(() => {
    if (!editor && previous.current) title.current?.focus();
    previous.current = !!editor;
  }, [editor]);
  async function refresh() {
    const results = await Promise.all([directory.refetch(), changes.refetch()]);
    if (results.some((r) => r.error))
      throw new Error("Staff records could not be loaded.");
    await client.invalidateQueries({
      queryKey: ["admin-console", session.account.id],
    });
  }
  const latest =
    editor && "change" in editor
      ? changes.data?.items.find((r) => r.id === editor.change.id) ||
        editor.change
      : null;
  return (
    <section className="staff-workspace" aria-label={appText("Staff access")}>
      <header className="staff-heading">
        <div>
          <h3 ref={title} tabIndex={-1}>
            {appText("Access with a second pair of eyes.")}
          </h3>
          <p>
            {appText(
              "One administrator proposes. Another independently reviews. Nobody can change or approve their own access.",
            )}
          </p>
        </div>
        <Button
          disabled={!!editor || unavailable || directory.isPending}
          onClick={() => setEditor({ kind: "CREATE" })}
        >
          {appText("Add staff member")}
        </Button>
      </header>
      <Notice>
        {appText(
          "Staff administration requires authenticator verification within five minutes. Live sign-in, key custody and operator recovery still require launch qualification.",
        )}
      </Notice>
      <div className="staff-columns">
        <section
          className="care-card"
          aria-label={appText("Current staff access")}
        >
          <h4>{appText("Current staff access")}</h4>
          <HistoryPages
            history={directory}
            label="Staff directory history"
            disabled={!!editor}
          />
          {!directory.isPending &&
            !directory.error &&
            !directory.data?.items.length && (
              <p>{appText("No staff accounts to display.")}</p>
            )}
          {directory.data?.items.map((person) => (
            <article key={person.id} className="staff-person">
              <h5>{person.name}</h5>
              <p>{person.email || appText("Dedicated staff email required")}</p>
              <p>
                {appText(roleNames[person.role])} · {person.region} ·{" "}
                {appText(person.disabled ? "Suspended" : "Active")}
              </p>
              <small>
                {appText("Access version {0}", [person.authVersion])}
              </small>
              {person.id === session.account.id ? (
                <p className="muted">
                  {appText("Another administrator must manage your access.")}
                </p>
              ) : !person.email ? (
                <p className="muted">
                  {appText(
                    "Synthetic accounts cannot use this workflow. Provision a dedicated staff identity.",
                  )}
                </p>
              ) : (
                <div className="care-actions">
                  {(["CHANGE", "SUSPEND", "RECOVER"] as const)
                    .filter((k) => !person.disabled || k === "CHANGE")
                    .map((kind) => (
                      <Button
                        key={kind}
                        variant="outline"
                        disabled={!!editor || unavailable}
                        onClick={() => setEditor({ kind, target: person })}
                      >
                        {appText(kindNames[kind])}
                      </Button>
                    ))}
                </div>
              )}
            </article>
          ))}
        </section>
        <section
          className="care-card"
          aria-label={appText("Staff change history")}
        >
          <h4>{appText("Independent review")}</h4>
          <label className="field">
            <span>{appText("Staff change status")}</span>
            <select
              value={status}
              disabled={!!editor}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="PENDING">{appText("Pending review")}</option>
              <option value="">{appText("All decisions")}</option>
            </select>
          </label>
          <HistoryPages
            history={changes}
            label="Staff approval history"
            disabled={!!editor}
          />
          {!changes.isPending &&
            !changes.error &&
            !changes.data?.items.length && (
              <p>
                {appText(
                  "No staff changes in this view. New proposals appear here for independent review.",
                )}
              </p>
            )}
          {changes.data?.items.map((change) => (
            <article className="staff-person" key={change.id}>
              <h5>{appText(kindNames[change.kind])}</h5>
              <p>
                {change.name} · {appText(roleNames[change.role])} ·{" "}
                {change.region}
              </p>
              <p>
                {appText(
                  change.status === "PENDING"
                    ? change.expiresAt < new Date().toISOString()
                      ? "Review expired"
                      : "Pending review"
                    : change.status === "APPROVED"
                      ? "Approved"
                      : change.status === "REJECTED"
                        ? "Rejected"
                        : "Cancelled",
                )}
              </p>
              <Button
                variant="outline"
                disabled={!!editor || unavailable}
                onClick={() => setEditor({ change })}
              >
                {appText("Review staff change")}
              </Button>
            </article>
          ))}
        </section>
      </div>
      {editor && (
        <StaffEditor
          key={
            "change" in editor
              ? editor.change.id
              : editor.kind + (editor.target?.id || "new")
          }
          editor={editor}
          latest={latest}
          currentTarget={
            "target" in editor
              ? directory.data?.items.find((p) => p.id === editor.target?.id)
              : undefined
          }
          unavailable={unavailable}
          session={session}
          refresh={refresh}
          close={() => setEditor(null)}
        />
      )}
    </section>
  );
}
function StaffEditor({
  editor,
  latest,
  currentTarget,
  unavailable,
  session,
  refresh,
  close,
}: {
  editor: Editor;
  latest: Change | null;
  currentTarget?: Staff;
  unavailable: boolean;
  session: Session;
  refresh: () => Promise<void>;
  close: () => void;
}) {
  const { appText, appLocale } = useAppTranslation();
  const [recorded, setRecorded] = useState<Change | null>(null);
  const [reviewing, setReviewing] = useState("change" in editor),
    [saved, setSaved] = useState(false);
  const target = "kind" in editor ? editor.target : undefined,
    kind = "kind" in editor ? editor.kind : editor.change.kind;
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<Staff["role"]>(target?.role || "REVIEWER"),
    [region, setRegion] = useState(target?.region || "Raipur"),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<"APPROVE" | "REJECT" | "CANCEL">(
    "APPROVE",
  );
  const root = useRef<HTMLElement>(null);
  const decision = useDecision(
    session,
    refresh,
    (result) =>
      !!result &&
      typeof result === "object" &&
      "id" in result &&
      typeof result.id === "string" &&
      "version" in result &&
      typeof result.version === "number" &&
      result.version > 0 &&
      "status" in result &&
      ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(
        String(result.status),
      ),
  );
  useEffect(() => {
    root.current?.focus();
  }, []);
  useEffect(() => {
    if (saved && !decision.busy) root.current?.focus();
  }, [saved, decision.busy]);
  const existing =
      recorded || latest || ("change" in editor ? editor.change : null),
    proposer = existing?.proposerId === session.account.id,
    targetActor = existing?.targetAccountId === session.account.id;
  const expired = !!existing && Date.parse(existing.expiresAt) <= Date.now(),
    stale =
      !!target &&
      !!currentTarget &&
      currentTarget.authVersion !== target.authVersion;
  const finished = saved || (!!existing && existing.status !== "PENDING");
  const locked = decision.locked || finished || unavailable || stale;
  async function send() {
    if (locked) return;
    if (existing) {
      await decision.run({
        path: `/admin/staff/changes/${encodeURIComponent(existing.id)}/decision`,
        body: {
          expectedVersion: existing.version,
          decision: proposer ? "CANCEL" : outcome,
          reason: reason.trim(),
          independentlyVerified: true,
        },
        message: "Staff review recorded.",
        onSaved: (result) => {
          setRecorded(result as Change);
          setSaved(true);
        },
      });
    } else {
      const body = {
        kind,
        ...(kind === "CREATE"
          ? {
              email: email.trim(),
              name: name.trim(),
              role,
              region: region.trim(),
            }
          : {
              targetAccountId: target!.id,
              expectedAuthVersion: target!.authVersion,
              ...(kind === "CHANGE" ? { role, region: region.trim() } : {}),
            }),
        reason: reason.trim(),
        evidenceRef: evidence.trim(),
        confirmed: true,
      };
      await decision.run({
        path: "/admin/staff/changes",
        body,
        message: "Staff proposal saved for independent review.",
        onSaved: () => setSaved(true),
      });
    }
  }
  const recovery = (
    <>
      <Feedback decision={decision} />
      {(decision.error || decision.conflict || unavailable) && (
        <Button
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => decision.reload()}
        >
          {appText("Reload staff records")}
        </Button>
      )}
      <Button variant="ghost" disabled={decision.locked} onClick={close}>
        {appText(finished ? "Close staff review" : "Discard staff review")}
      </Button>
    </>
  );
  return (
    <section
      ref={root}
      tabIndex={-1}
      className="care-card staff-editor"
      aria-label={appText("Staff access review")}
    >
      <h3>{appText(kindNames[kind])}</h3>
      {recovery}
      {unavailable ? (
        <Notice error>
          {appText(
            "Staff records are unavailable. Private details stay hidden until access is checked again.",
          )}
        </Notice>
      ) : (
        <>
          {stale && (
            <Notice error>
              {appText(
                "This person's access changed. Discard this review and open their current record before proposing again.",
              )}
            </Notice>
          )}
          {finished ? (
            <p>
              {appText(
                saved
                  ? existing
                    ? "The review is recorded. Approved changes take effect immediately; affected staff must sign in and enroll their authenticator again."
                    : "Your proposal is saved. A different administrator must review it before access changes."
                  : "This proposal is already decided. Use the history to inspect its recorded outcome.",
              )}
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!reviewing) {
                  setReviewing(true);
                  root.current?.focus();
                } else void send();
              }}
            >
              <fieldset disabled={locked} className="staff-fields">
                <legend>
                  {appText(
                    reviewing
                      ? "Review before confirming"
                      : "Proposed staff access",
                  )}
                </legend>
                {(kind === "SUSPEND" ||
                  kind === "RECOVER" ||
                  kind === "CHANGE") && (
                  <Notice>
                    {appText(
                      "Approval signs this person out on every device and removes their previous authenticator, recovery codes and pending sign-in codes. Records remain intact.",
                    )}
                  </Notice>
                )}
                {kind === "CHANGE" && (
                  <Notice>
                    {appText(
                      "Approval applies the proposed role and region and reactivates suspended staff access.",
                    )}
                  </Notice>
                )}
                {existing ? (
                  <>
                    <dl className="staff-summary">
                      <dt>{appText("Staff member")}</dt>
                      <dd>
                        {existing.name} · {existing.email}
                      </dd>
                      <dt>{appText("Proposed role and region")}</dt>
                      <dd>
                        {appText(roleNames[existing.role])} · {existing.region}
                      </dd>
                      <dt>{appText("Proposal reason")}</dt>
                      <dd>{existing.reason}</dd>
                      <dt>{appText("Restricted review reference")}</dt>
                      <dd>{existing.evidenceRef}</dd>
                      <dt>{appText("Proposed by")}</dt>
                      <dd>{existing.proposerId}</dd>
                      <dt>{appText("Review expires")}</dt>
                      <dd>
                        {new Intl.DateTimeFormat(appLocale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Kolkata",
                        }).format(new Date(existing.expiresAt))}
                      </dd>
                    </dl>
                    {targetActor ? (
                      <Notice error>
                        {appText(
                          "Another administrator must review changes to your access.",
                        )}
                      </Notice>
                    ) : proposer ? (
                      <Notice>
                        {appText(
                          "You proposed this change. You can cancel it, but another administrator must approve or reject it.",
                        )}
                      </Notice>
                    ) : (
                      <label className="field">
                        <span>{appText("Review outcome")}</span>
                        <select
                          value={outcome}
                          onChange={(e) =>
                            setOutcome(e.target.value as "APPROVE" | "REJECT")
                          }
                        >
                          <option value="APPROVE" disabled={expired}>
                            {appText("Approve staff change")}
                          </option>
                          <option value="REJECT">
                            {appText("Reject staff change")}
                          </option>
                        </select>
                      </label>
                    )}
                    {expired && (
                      <Notice error>
                        {appText(
                          "This review expired. Reject or cancel it and request a fresh proposal.",
                        )}
                      </Notice>
                    )}
                  </>
                ) : reviewing ? (
                  <dl className="staff-summary">
                    <dt>{appText("Staff member")}</dt>
                    <dd>
                      {target?.name || name} · {target?.email || email}
                    </dd>
                    <dt>{appText("Proposed role and region")}</dt>
                    <dd>
                      {appText(roleNames[role])} · {region}
                    </dd>
                    <dt>{appText("Proposal reason")}</dt>
                    <dd>{reason}</dd>
                    <dt>{appText("Restricted review reference")}</dt>
                    <dd>{evidence}</dd>
                  </dl>
                ) : (
                  <>
                    {kind === "CREATE" && (
                      <>
                        <label className="field">
                          <span>{appText("Staff name")}</span>
                          <Input
                            required
                            maxLength={80}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                        <label className="field">
                          <span>{appText("Dedicated staff email")}</span>
                          <Input
                            type="email"
                            required
                            maxLength={254}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                      </>
                    )}
                    {target && (
                      <p>
                        {target.name} · {target.email}
                      </p>
                    )}
                    {(kind === "CREATE" || kind === "CHANGE") && (
                      <>
                        <label className="field">
                          <span>{appText("Staff role")}</span>
                          <select
                            value={role}
                            onChange={(e) =>
                              setRole(e.target.value as Staff["role"])
                            }
                          >
                            {Object.entries(roleNames).map(([value, label]) => (
                              <option key={value} value={value}>
                                {appText(label)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>{appText("Configured region")}</span>
                          <Input
                            required
                            maxLength={80}
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                          />
                          <small>
                            {appText(
                              "Use an existing region ID. This does not enable service coverage.",
                            )}
                          </small>
                        </label>
                      </>
                    )}
                    <label className="field">
                      <span>{appText("Proposal reason")}</span>
                      <Textarea
                        required
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>{appText("Restricted review reference")}</span>
                      <Input
                        required
                        pattern="[A-Za-z0-9]([A-Za-z0-9._:]|/|-){2,119}"
                        maxLength={120}
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                      />
                      <small>
                        {appText(
                          "Enter only the protected review record reference. Never enter identity documents, passwords, authenticator secrets or recovery codes.",
                        )}
                      </small>
                    </label>
                  </>
                )}
                {reviewing && (
                  <>
                    {existing && !targetActor && (
                      <label className="field">
                        <span>{appText("Decision reason")}</span>
                        <Textarea
                          required
                          maxLength={500}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                    )}
                    {!targetActor && (
                      <label className="check-label">
                        <input
                          type="checkbox"
                          required
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        <span>
                          {appText(
                            existing
                              ? proposer
                                ? "I confirm that I want to cancel this proposal."
                                : "I independently checked the restricted identity record, role, region and effects of this decision."
                              : "I checked the dedicated identity, requested access and recovery effects. A different administrator must approve.",
                          )}
                        </span>
                      </label>
                    )}
                  </>
                )}
                <div className="care-actions">
                  {!existing && reviewing && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setReviewing(false);
                        setConfirmed(false);
                      }}
                    >
                      {appText("Edit staff proposal")}
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={
                      locked ||
                      (!!existing &&
                        (targetActor ||
                          (!proposer && expired && outcome === "APPROVE")))
                    }
                  >
                    {appText(
                      !reviewing
                        ? "Review staff proposal"
                        : existing
                          ? proposer
                            ? "Cancel staff proposal"
                            : "Record independent review"
                          : "Send for independent review",
                    )}
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
          {existing && finished && (
            <dl className="staff-summary">
              <dt>{appText("Recorded outcome")}</dt>
              <dd>
                {appText(
                  existing.status === "APPROVED"
                    ? "Approved"
                    : existing.status === "REJECTED"
                      ? "Rejected"
                      : existing.status === "CANCELLED"
                        ? "Cancelled"
                        : "Review recorded",
                )}
              </dd>
              <dt>{appText("Decision reason")}</dt>
              <dd>{existing.decisionReason}</dd>
              <dt>{appText("Reviewed by")}</dt>
              <dd>{existing.approverId || existing.proposerId}</dd>
            </dl>
          )}
        </>
      )}
    </section>
  );
}
