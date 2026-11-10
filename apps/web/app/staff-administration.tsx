"use client";
import Link from "next/link";
import { UserPlus, ShieldCheck, Clock3, CircleCheck } from "lucide-react";
import { Modal } from "../components/ui/modal";
import {
  FilterButton,
  FilterButtonGroup,
} from "../components/ui/filter-button";
import { StatusBadge } from "../components/ui/status-controls";
import { InfoTooltip } from "../components/ui/info-tooltip";
import { StepProgress } from "../components/ui/step-progress";
import { RefreshButton } from "../components/ui/refresh-button";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, type Session, type components } from "@bcs/api-client";
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
  const superAdmin =
    session.account.role === "ADMIN" && !!session.account.superAdmin;
  const [editor, setEditor] = useState<Editor | null>(null),
    [status, setStatus] = useState("PENDING");
  const [modalLocked, setModalLocked] = useState(false),
    [directoryPage, setDirectoryPage] = useState(0);
  const title = useRef<HTMLHeadingElement>(null),
    previous = useRef(false);
  const directory = useHistory<{ items: Staff[]; nextCursor: string | null }>({
    queryKey: ["staff-directory", session.account.id],
    path: "/admin/staff?limit=10",
  });
  const changes = useHistory<{ items: Change[]; nextCursor: string | null }>({
    queryKey: ["staff-changes", session.account.id, status],
    path: "/admin/staff/changes" + (status ? "?status=" + status : ""),
  });
  const unavailable = !!directory.error || !!changes.error;
  const needsMfa = [directory.error, changes.error].some(
    (error) => error instanceof ApiError && error.code === "MFA_REQUIRED",
  );
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
  const people = directory.data?.items || [];
  const currentPage = Math.min(
    directoryPage,
    Math.max(0, Math.ceil(people.length / 10) - 1),
  );
  const hasAnotherAdmin = people.some(
    (p) => p.role === "ADMIN" && !p.disabled && p.id !== session.account.id,
  );
  async function nextDirectoryPage() {
    if ((currentPage + 1) * 10 < people.length)
      setDirectoryPage(currentPage + 1);
    else if (directory.hasNextPage && !directory.looped) {
      const result = await directory.fetchNextPage();
      if (!result.error) setDirectoryPage(currentPage + 1);
    }
  }
  return (
    <section className="staff-workspace" aria-label={appText("Staff access")}>
      <header className="staff-heading">
        <div>
          <h3 ref={title} tabIndex={-1}>
            {appText("Manage staff access")}
          </h3>
          <p>
            {appText(
              superAdmin
                ? "Super admins create approved staff immediately. Choose Reviewer for teacher screening; the new staff member sets up their own authenticator."
                : "Add a Reviewer to screen teacher applications. A different administrator approves access before they can sign in.",
            )}
          </p>
        </div>
        <FilterButton
          accent
          disabled={!!editor || unavailable || directory.isPending}
          onClick={() => setEditor({ kind: "CREATE" })}
        >
          <UserPlus size={16} aria-hidden="true" />
          {appText("Add staff member")}
        </FilterButton>
      </header>
      <StepProgress
        steps={[
          appText("Staff details"),
          appText(superAdmin ? "Review & create" : "Independent approval"),
          appText("Sign-in & authenticator"),
        ]}
        currentStep={null}
        label={appText("How staff access works")}
      />
      <div className="staff-security-guidance">
        <ShieldCheck size={18} aria-hidden="true" />
        <p>
          {appText(
            "Staff changes require authenticator verification within five minutes.",
          )}
        </p>
        <InfoTooltip
          label={appText("About staff access controls")}
          items={[
            appText(
              superAdmin
                ? "New staff creation is approved immediately by your Super admin permission. Other access changes still require independent review."
                : "One administrator proposes. Another independently reviews. Nobody can change or approve their own access.",
            ),
            appText(
              "Use a dedicated staff email. Staff sign in only after approval and must set up their own authenticator.",
            ),
          ]}
        />
      </div>
      {unavailable && (
        <Notice error>
          <p>
            {appText(
              needsMfa
                ? "Staff records could not be loaded. Verify your authenticator, then retry the history below."
                : "Staff records could not be loaded.",
            )}
          </p>
          {needsMfa && (
            <Link className="inline-link" href="/dashboard/security">
              {appText("Verify authenticator")}
            </Link>
          )}
        </Notice>
      )}
      {!superAdmin && !directory.isPending && !directory.error && !hasAnotherAdmin && (
        <div className="staff-approval-warning" role="status">
          <strong>{appText("Another administrator is required")}</strong>
          <p>
            {appText(
              directory.hasNextPage || directory.looped
                ? "Another active administrator must approve your request. Check the remaining directory pages for an independent approver. You cannot approve your own request."
                : "No other active administrator is listed. You can submit a request, but an independently authorized administrator must approve it. Your own request cannot be self-approved.",
            )}
          </p>
        </div>
      )}
      <div className="staff-columns">
        <section
          className="care-card staff-requests"
          aria-label={appText("Staff change history")}
        >
          <header className="staff-list-heading">
            <div>
              <h4>{appText("Approvals & requests")}</h4>
              <p>
                {appText(
                  "Review requests from another administrator, or track your own.",
                )}
              </p>
            </div>
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
          </header>
          <HistoryPages
            history={changes}
            label="Staff approval history"
            disabled={!!editor}
          />
          {!changes.isPending &&
            !changes.error &&
            !changes.data?.items.length && (
              <p className="staff-empty">
                {appText(
                  "No staff changes in this view. New proposals appear here for independent review.",
                )}
              </p>
            )}
          {changes.data?.items.map((change) => {
            const pending = change.status === "PENDING",
              expired = Date.parse(change.expiresAt) <= Date.now(),
              own = change.proposerId === session.account.id,
              affected = change.targetAccountId === session.account.id;
            const canApprove =
              pending &&
              !affected &&
              !expired &&
              (!own || (superAdmin && change.kind === "CREATE"));
            return (
              <article className="staff-person" key={change.id}>
                <div className="staff-row-heading">
                  <div>
                    <h5>{change.name}</h5>
                    <p>
                      {appText(roleNames[change.role])} · {change.region}
                    </p>
                  </div>
                  <StatusBadge
                    label={appText(
                      pending
                        ? expired
                          ? "Review expired"
                          : own && !(superAdmin && change.kind === "CREATE")
                            ? "Waiting for another admin"
                            : affected
                              ? "Independent review required"
                              : "Ready for your review"
                        : change.status === "APPROVED"
                          ? "Approved"
                          : change.status === "REJECTED"
                            ? "Rejected"
                            : "Cancelled",
                    )}
                    tone={
                      change.status === "APPROVED"
                        ? "success"
                        : pending
                          ? "warning"
                          : "neutral"
                    }
                    icon={change.status === "APPROVED" ? CircleCheck : Clock3}
                  />
                </div>
                <p>{appText(kindNames[change.kind])}</p>
                <p className="staff-request-next">
                  {appText(
                    pending
                      ? own && !(superAdmin && change.kind === "CREATE")
                        ? "You submitted this request. Another administrator must approve or reject it."
                        : affected
                          ? "Another administrator must review changes to your access."
                          : expired
                            ? "This request has expired. Reject it and request a fresh proposal."
                            : "Check the identity, role and region, then approve or reject this request."
                      : change.status === "APPROVED"
                        ? change.kind === "SUSPEND"
                          ? "Staff access is suspended. Existing sessions are revoked."
                          : "Access approved. The staff member can sign in with their dedicated email and set up an authenticator."
                        : "This request is closed. Its decision remains in history.",
                  )}
                </p>
                <FilterButton
                  disabled={!!editor || unavailable}
                  accent={canApprove}
                  onClick={() => setEditor({ change })}
                >
                  {appText(
                    canApprove
                      ? "Review & approve"
                      : pending
                        ? "View request"
                        : "View decision",
                  )}
                </FilterButton>
              </article>
            );
          })}
        </section>
        <section
          className="care-card staff-directory"
          aria-label={appText("Current staff access")}
        >
          <header className="staff-list-heading">
            <div>
              <h4>{appText("Current staff access")}</h4>
              <p>
                {appText(
                  "Accounts with approved access. Pending requests appear separately.",
                )}
              </p>
            </div>
            <InfoTooltip
              label={appText("About the staff directory")}
              items={[
                appText(
                  "Accounts without a dedicated email are test identities and cannot be managed here.",
                ),
                appText("Another administrator must manage your access."),
              ]}
            />
          </header>
          <HistoryPages
            history={directory}
            label="Staff directory history"
            disabled={!!editor}
          />
          {!directory.isPending && !directory.error && !people.length && (
            <p>{appText("No staff accounts to display.")}</p>
          )}
          {people
            .slice(currentPage * 10, (currentPage + 1) * 10)
            .map((person) => (
              <article key={person.id} className="staff-person">
                <div className="staff-row-heading">
                  <h5>{person.name}</h5>
                  <StatusBadge
                    label={appText(person.disabled ? "Suspended" : "Active")}
                    tone={person.disabled ? "neutral" : "success"}
                    icon={person.disabled ? Clock3 : CircleCheck}
                  />
                </div>
                <p>
                  {person.email ||
                    appText("Test identity without a staff email")}
                </p>
                <p>
                  {appText(
                    person.role === "ADMIN" && person.superAdmin
                      ? "Super admin"
                      : roleNames[person.role],
                  )}{" "}
                  · {person.region}
                </p>
                {person.id === session.account.id ? (
                  <p className="staff-request-next">
                    {appText(
                      "Your account is managed by another administrator",
                    )}
                  </p>
                ) : (
                  person.email && (
                    <details className="staff-manage">
                      <summary>{appText("Manage access")}</summary>
                      <FilterButtonGroup>
                        {(["CHANGE", "SUSPEND", "RECOVER"] as const)
                          .filter((k) => !person.disabled || k === "CHANGE")
                          .map((kind) => (
                            <FilterButton
                              key={kind}
                              disabled={!!editor || unavailable || (!!person.superAdmin && !superAdmin)}
                              onClick={() =>
                                setEditor({ kind, target: person })
                              }
                            >
                              {appText(kindNames[kind])}
                            </FilterButton>
                          ))}
                      </FilterButtonGroup>
                    </details>
                  )
                )}
              </article>
            ))}
          {!!people.length && (
            <div className="staff-directory-pages">
              <p>{appText("Page {0}", [currentPage + 1])}</p>
              <FilterButtonGroup>
                <FilterButton
                  disabled={
                    !!editor ||
                    directory.isFetching ||
                    !!directory.error ||
                    !currentPage
                  }
                  onClick={() => setDirectoryPage(currentPage - 1)}
                >
                  {appText("Previous page")}
                </FilterButton>
                <FilterButton
                  disabled={
                    !!editor ||
                    directory.isFetching ||
                    !!directory.error ||
                    directory.looped ||
                    !(
                      (currentPage + 1) * 10 < people.length ||
                      directory.hasNextPage
                    )
                  }
                  onClick={() => void nextDirectoryPage()}
                >
                  {appText("Next page")}
                </FilterButton>
              </FilterButtonGroup>
            </div>
          )}
        </section>
      </div>
      {editor && (
        <Modal
          open
          closeDisabled={modalLocked}
          onOpenChange={(open) => {
            if (!open && !modalLocked) setEditor(null);
          }}
          title={appText(
            "change" in editor
              ? "Review staff change"
              : editor.kind === "CREATE"
                ? "Add staff member"
                : kindNames[editor.kind],
          )}
        >
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
            onLockChange={setModalLocked}
            close={() => setEditor(null)}
          />
        </Modal>
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
  onLockChange,
}: {
  editor: Editor;
  latest: Change | null;
  currentTarget?: Staff;
  unavailable: boolean;
  session: Session;
  refresh: () => Promise<void>;
  close: () => void;
  onLockChange: (locked: boolean) => void;
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
  const superAdmin =
    session.account.role === "ADMIN" && !!session.account.superAdmin;
  const directCreate = kind === "CREATE" && superAdmin;
  const existing =
      recorded || latest || ("change" in editor ? editor.change : null),
    proposer = existing?.proposerId === session.account.id,
    targetActor = existing?.targetAccountId === session.account.id;
  const cancelOnly = proposer && !directCreate;
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
          decision: cancelOnly ? "CANCEL" : outcome,
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
        message: directCreate
          ? "Staff account created and approved."
          : "Staff proposal saved for independent review.",
        onSaved: (result) => {
          if (directCreate) setRecorded(result as Change);
          setSaved(true);
        },
      });
    }
  }
  useEffect(() => {
    onLockChange(decision.locked);
    return () => onLockChange(false);
  }, [decision.locked, onLockChange]);
  const recovery = (
    <>
      <Feedback decision={decision} />
      {(decision.error || decision.conflict || unavailable) && (
        <RefreshButton
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => decision.reload()}
          label={appText("Reload staff records")}
        />
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
      <StepProgress
        steps={[
          appText("Staff details"),
          appText(directCreate ? "Review & create" : "Independent approval"),
          appText("Sign-in & authenticator"),
        ]}
        currentStep={
          finished
            ? existing?.status === "APPROVED" && existing.kind !== "SUSPEND"
              ? 2
              : existing
                ? null
                : 1
            : existing || (directCreate && reviewing)
              ? 1
              : 0
        }
        label={appText("Staff access progress")}
      />
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
                  ? directCreate && existing?.status === "APPROVED"
                    ? "Staff account created and approved. They can sign in with their staff email and set up an authenticator."
                    : existing
                      ? existing.status === "APPROVED" &&
                        existing.kind === "SUSPEND"
                        ? "Staff access is suspended. Existing sessions are revoked."
                        : "The review is recorded. Approved changes take effect immediately; affected staff must sign in and enroll their authenticator again."
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
                    ) : cancelOnly ? (
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
                        <p className="staff-role-guidance">
                          {appText(
                            role === "REVIEWER"
                              ? "Reviewers assess teacher evidence and applications within their assigned region. They cannot create or approve staff."
                              : role === "ADMIN"
                                ? "Administrators manage staff proposals and platform controls. Independent approval is still required."
                                : role === "FINANCE"
                                  ? "Finance staff handle authorized financial records, not teacher screening."
                                  : "Operators manage assigned support and operational work, not teacher screening.",
                          )}
                        </p>
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
                              ? cancelOnly
                                ? "I confirm that I want to cancel this proposal."
                                : directCreate
                                  ? "I checked the staff identity, role and region and approve this new account."
                                  : "I independently checked the restricted identity record, role, region and effects of this decision."
                              : directCreate
                                ? "I checked the staff identity, role and region. Create and approve this account now."
                                : "I checked the dedicated identity, requested access and recovery effects. A different administrator must approve.",
                          )}
                        </span>
                      </label>
                    )}
                  </>
                )}
                <FilterButtonGroup>
                  {!existing && reviewing && (
                    <FilterButton
                      type="button"
                      onClick={() => {
                        setReviewing(false);
                        setConfirmed(false);
                      }}
                    >
                      {appText("Edit staff proposal")}
                    </FilterButton>
                  )}
                  <FilterButton
                    accent
                    type="submit"
                    disabled={
                      locked ||
                      (!!existing &&
                        (targetActor ||
                          (!cancelOnly && expired && outcome === "APPROVE")))
                    }
                  >
                    {appText(
                      !reviewing
                        ? directCreate
                          ? "Review staff details"
                          : "Review staff proposal"
                        : existing
                          ? cancelOnly
                            ? "Cancel staff proposal"
                            : outcome === "APPROVE"
                              ? "Approve staff access"
                              : "Reject staff request"
                          : directCreate
                            ? "Create & approve staff"
                            : "Send for independent review",
                    )}
                  </FilterButton>
                </FilterButtonGroup>
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
