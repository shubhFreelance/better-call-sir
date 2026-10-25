"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GuardianSetup } from "./guardian-setup";
import { LearnerProfiles } from "./learner-profiles";
import { InvitationRecovery } from "./invitation-recovery";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { FilterButton, FilterButtonGroup } from "../components/ui/filter-button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useAppTranslation } from "./locale";
import { useHistory, HistoryPages } from "./history";
import { Feedback, Notice, useDecision } from "./tuition-workflow";
import { InfoTooltip } from "../components/ui/info-tooltip";
import { LearningManagementBadge } from "../components/ui/learning-management-badge";
import { GuardianDocumentPreview } from "./guardian-document-preview";
import { LoaderCircle, UploadCloud } from "lucide-react";
type Child = components["schemas"]["Child"];
type Verification = components["schemas"]["GuardianVerification"];
type Application = components["schemas"]["GuardianVerificationInput"];
type Invitation = components["schemas"]["GuardianVerificationInvitation"];
export const guardianManagementLabels: Record<string, string> = {
  GUARDIAN_ONLY: "Guardian manages everything",
  SHARED: "Guardian and student manage together",
  STUDENT_LED: "Student manages; guardian follows progress",
};
const statuses: Record<string, string> = {
  DRAFT: "Draft",
  PENDING: "Pending staff review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REVOKED: "Revoked",
  DELETED: "Deleted",
};
const initialApplication = (): Application => ({
  guardianName: "",
  learnerName: "",
  relationship: "PARENT",
  ageBand: "UNDER_15",
  managementMode: "GUARDIAN_ONLY",
  studentEmail: null,
  acknowledgmentMethod: "STAFF_CALL",
  documentNamesGuardian: true,
  adultDeclaration: true,
  authorityDeclaration: true,
  verificationPermission: true,
  policyVersion: "guardian-verification-v1",
});
const editable = (r: Verification) =>
  ["DRAFT", "CHANGES_REQUESTED"].includes(r.status);
export function GuardianVerificationWorkspace({
  session,
  onSessionChange,
  studentView = false,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
  studentView?: boolean;
}) {
  const { appText } = useAppTranslation();
  if (["ADMIN", "REVIEWER"].includes(session.account.role))
    return <VerificationQueue session={session} />;
  if (!["GUARDIAN", "STUDENT"].includes(session.account.role))
    return (
      <Notice error>
        {appText(
          "Use a guardian or student account for relationship verification.",
        )}
      </Notice>
    );
  return (
    <div className="guardian-verification-workspace">
      <StudentAcknowledgments
        session={session}
        onSessionChange={onSessionChange}
        studentView={studentView}
      />
      {session.account.role === "GUARDIAN" && !studentView && (
        <GuardianRequests session={session} onSessionChange={onSessionChange} />
      )}
    </div>
  );
}
function GuardianRequests({
  session,
  onSessionChange,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
}) {
  const { appText } = useAppTranslation(),
    heading = useRef<HTMLHeadingElement>(null),
    [selected, setSelected] = useState<Verification | "new" | null>(null);
  const params = useSearchParams();
  useEffect(() => { if (params.get("new") === "1") setSelected("new"); }, [params]);
  const requestedId=params.get("request");
  const requested=useQuery({queryKey:["guardian-verification",session.account.id,requestedId],queryFn:({signal})=>api<Verification>("/guardian-verifications/"+requestedId,{signal}),enabled:!!requestedId&&/^[0-9a-f-]{36}$/i.test(requestedId),retry:false});
  useEffect(()=>{if(requested.data&&!requested.error)setSelected(requested.data);},[requested.data,requested.error]);
  const history = useHistory<{
    items: Verification[];
    nextCursor: string | null;
  }>({
    queryKey: ["guardian-verifications", session.account.id],
    path: "/guardian-verifications",
  });
  async function refresh() {
    const r = await history.refetch();
    if (r.error) throw new Error("Verification records could not be loaded.");
  }
  return (
    <section className="care-workspace guardian-requests">
      {requested.error && <Notice error>{appText("Verification records could not be loaded.")}</Notice>}
      <aside className="guardian-verification-guidance" role="note">{appText("Verify each child separately. Saving education details does not send a verification request.")}</aside>
      <header className="staff-heading guardian-verification-intro">
        <div>
          <div className="guardian-verification-title">
          <h2 ref={heading} tabIndex={-1}>
            {appText("How guardian verification works")}
          </h2>
          <InfoTooltip label={appText("How guardian verification works")} items={[appText("Verify your relationship with each child separately. Approval for another child remains valid. Submit this request to send it to staff; saving education details does not submit verification.")]} />
          </div>
          <p>
            {appText(
              "First we check your relationship with the student. After approval, you can give learning permission and create their profile.",
            )}
          </p>
        </div>
        {!selected && (
          <FilterButton accent
            disabled={!!history.error || history.isPending}
            onClick={() => setSelected("new")}
          >
            {appText("Start guardian verification")}
          </FilterButton>
        )}
      </header>
      {!selected && (
        <ol
          className="guardian-verification-steps"
          aria-label={appText("Guardian verification steps")}
        >
          {[
            [
              "Your details",
              "Tell us your relationship and who will manage learning.",
            ],
            [
              "Report and confirmation",
              "Upload a school report. The student confirms by email or with staff on a call.",
            ],
            [
              "Staff review",
              "Our team checks the relationship and asks for changes if needed.",
            ],
            [
              "Student setup",
              "After approval, give learning permission and create the student profile.",
            ],
          ].map(([title, description], i) => (
            <li key={title}>
              <span aria-hidden="true">{i + 1}</span>
              <div>
                <strong>{appText(title)}</strong>
                <p>{appText(description)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {history.isPending && (
        <p role="status">{appText("Loading verification requests…")}</p>
      )}
      {history.error && (
        <Notice error>
          {appText("Verification records could not be loaded.")}
          <Button
            variant="outline"
            disabled={!!selected}
            onClick={() => history.refetch()}
          >
            {appText("Retry")}
          </Button>
        </Notice>
      )}
      {selected && (
        <OwnerVerification
          key={selected === "new" ? "new" : selected.id}
          initial={selected === "new" ? null : selected}
          session={session}
          queueUnavailable={!!history.error}
          refreshQueue={refresh}
          onSessionChange={onSessionChange}
          close={() => {
            setSelected(null);
            requestAnimationFrame(() => heading.current?.focus());
          }}
        />
      )}
      {!history.error && !history.isPending && (
        <>
          <div className="guardian-verification-list">
            {!!history.loadedCount && (
              <h3>{appText("Your verification requests")}</h3>
            )}
            {!history.data?.items.length && !selected && (
              <p className="guardian-verification-ready">
                {appText(
                  "Ready to begin? Start guardian verification, then enter your name and the student’s name as shown on the school report.",
                )}
              </p>
            )}
            {history.data?.items.map((r) => (
              <article key={r.id} className="staff-person">
                <div>
                  <h3>
                    {r.status === "DELETED"
                      ? appText("Deleted learner")
                      : r.learnerName}
                  </h3>
                  <p>
                    {r.status === "DELETED"
                      ? appText("Deleted guardian")
                      : r.guardianName}{" "}
                    · {appText(statuses[r.status])}
                  </p>
                  <LearningManagementBadge label={appText(guardianManagementLabels[r.managementMode])} items={[appText("Relationship approval is separate from learning permission and profile setup.")]} />
                </div>
                <FilterButton
                  disabled={!!selected}
                  onClick={() => setSelected(r)}
                >
                  {appText("View verification")}
                </FilterButton>
              </article>
            ))}
          </div>
          {!!history.loadedCount && (
            <HistoryPages
              label={appText("Guardian verification history")}
              history={history}
              disabled={!!selected}
            />
          )}
        </>
      )}
    </section>
  );
}
function ApplicationFields({
  value,
  setValue,
  disabled,
  step,
}: {
  step: number;
  value: Application;
  setValue: (a: Application) => void;
  disabled: boolean;
}) {
  const { appText } = useAppTranslation();
  const set = <K extends keyof Application>(k: K, v: Application[K]) =>
    setValue({ ...value, [k]: v });
  return (
    <fieldset disabled={disabled} className="guardian-verification-fields">
      <legend>
        {appText(
          step === 0
            ? "Relationship details"
            : step === 1
              ? "Who should manage learning?"
              : "Student confirmation",
        )}
      </legend>
      {step === 0 && (
        <>
          <div className="guardian-verification-grid">
            <label>
              {appText("Guardian's full name")}
              <Input
                required
                maxLength={100}
                autoComplete="name"
                value={value.guardianName}
                onChange={(e) => set("guardianName", e.target.value)}
              />
            </label>
            <label>
              {appText("Learner's name on the school report")}
              <Input
                required
                maxLength={40}
                value={value.learnerName}
                onChange={(e) => set("learnerName", e.target.value)}
              />
            </label>
            <label>
              {appText("Your relationship")}
              <select
                value={value.relationship}
                onChange={(e) =>
                  set(
                    "relationship",
                    e.target.value as Application["relationship"],
                  )
                }
              >
                <option value="PARENT">{appText("Parent")}</option>
                <option value="SIBLING">{appText("Adult sibling")}</option>
                <option value="OTHER">
                  {appText("Other authorized adult")}
                </option>
              </select>
            </label>
            <label>
              {appText("Learner's age group")}
              <select
                value={value.ageBand}
                onChange={(e) =>
                  set("ageBand", e.target.value as Application["ageBand"])
                }
              >
                <option value="UNDER_15">{appText("Under 15")}</option>
                <option value="15_TO_17">{appText("15–17 years")}</option>
                <option value="18_PLUS">{appText("18 years or older")}</option>
              </select>
            </label>
          </div>
        </>
      )}
      {step === 1 && (
        <fieldset className="guardian-management-options">
          <legend>{appText("Who should manage learning?")}</legend>
          {Object.entries(guardianManagementLabels).map(([mode, label]) => (
            <label key={mode} className="guardian-management-option">
              <input
                type="radio"
                name="guardian-management-mode"
                value={mode}
                checked={value.managementMode === mode}
                onChange={() =>
                  set("managementMode", mode as Application["managementMode"])
                }
              />
              <span>
                <strong>{appText(label)}</strong>
                <small>
                  {appText(
                    mode === "GUARDIAN_ONLY"
                      ? "The guardian makes learning and teacher choices."
                      : mode === "SHARED"
                        ? "Both can make learning and teacher choices."
                        : "The student makes everyday learning choices; the guardian keeps oversight.",
                  )}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {step === 2 && (
        <>
          <label>
            {appText("How will the student confirm this relationship?")}
            <select
              value={value.acknowledgmentMethod}
              onChange={(e) =>
                setValue({
                  ...value,
                  acknowledgmentMethod: e.target
                    .value as Application["acknowledgmentMethod"],
                  studentEmail:
                    e.target.value === "STAFF_CALL" ? null : value.studentEmail,
                })
              }
            >
              <option value="STAFF_CALL">
                {appText("During a staff video or phone review")}
              </option>
              <option value="STUDENT_ACCOUNT">
                {appText("Using the student's separate email account")}
              </option>
            </select>
          </label>
          {value.acknowledgmentMethod === "STUDENT_ACCOUNT" ? (
            <label>
              {appText("Student's email address")}
              <Input
                type="email"
                required
                maxLength={254}
                autoComplete="off"
                value={value.studentEmail || ""}
                onChange={(e) => set("studentEmail", e.target.value)}
              />
              <small>
                {appText(
                  "Use the same email the student already registered with. They sign in, open Guardian verification and confirm or decline this relationship. Do not enter your own email.",
                )}
              </small>
            </label>
          ) : (
            <Notice>
              {appText(
                "Student already registered? Choose the email option and use their existing email. If they cannot use email, staff can confirm the relationship with them during a video or phone call.",
              )}
            </Notice>
          )}
          <label className="care-check">
            <input
              type="checkbox"
              checked={value.documentNamesGuardian}
              onChange={(e) => set("documentNamesGuardian", e.target.checked)}
            />
            <span>
              {appText("The school report names me as the parent or guardian.")}
            </span>
          </label>
          {!value.documentNamesGuardian && (
            <Notice>
              {appText(
                "A staff video or phone review is required because the report does not name you. Upload the available school report for context.",
              )}
            </Notice>
          )}
        </>
      )}
    </fieldset>
  );
}
function VerificationSummary({ record: r,
  staff = false,
}: { record: Verification;
  staff?: boolean;
}) {
  const { appText } = useAppTranslation();
  return (
    <>
      <section className="staff-summary verification-summary-card">
        <div className="verification-summary-management">
          <LearningManagementBadge label={appText(guardianManagementLabels[r.managementMode])} items={[appText("The student sees this choice before acknowledging the relationship. Management permissions are separate from learning-data consent.")]} />
        </div>
      <dl className="verification-summary-fields">
        <dt>{appText("Guardian")}</dt>
        <dd>
          {r.status === "DELETED"
            ? appText("Deleted guardian")
            : r.guardianName}
        </dd>
        <dt>{appText("Learner")}</dt>
        <dd>
          {r.status === "DELETED" ? appText("Deleted learner") : r.learnerName}
        </dd>
        <dt>{appText("Status")}</dt>
        <dd>{appText(statuses[r.status])}</dd>
        <dt>{appText("Student acknowledgment")}</dt>
        <dd>
          {appText(
            r.studentAcknowledgedAt
              ? "Acknowledgment recorded"
              : "Awaiting student or staff-observed acknowledgment",
          )}
        </dd>
        <dt>{appText("School report")}</dt>
        <dd>
          <span className="evidence-scan-status">
          {r.evidence
            ? appText(
                r.evidence.status === "CLEAN"
                  ? "Scan cleared"
                  : r.evidence.status === "INFECTED"
                    ? "Unsafe file — replace the image"
                    : r.evidence.status === "DELETED"
                      ? "Deleted"
                      : r.scanStatus === "RETRY_REQUIRED"
                        ? "Safety scan needs recovery"
                        : "Scan pending",
              )
            : appText("No image uploaded")}
          {r.evidence?.status === "CLEAN" && <GuardianDocumentPreview key={r.evidence.id} evidenceId={r.evidence.id} learnerName={r.learnerName} />}
          </span>
        </dd>
      </dl>
      </section>
      {r.evidence?.status === "QUARANTINED" && (
        <Notice>
          {appText(
            r.scanStatus === "RETRY_REQUIRED"
              ? "Your report is stored privately, but safety scanning needs recovery. An administrator can restore processing and retry this file."
              : "Your report is stored privately and waiting for its safety scan. It becomes available to view after scan clearance.",
          )}
          {staff && (
            <p>
              {appText(
                "If scanning does not finish, check the scanner and worker before retrying. Approval and download remain blocked until clearance.",
              )}
            </p>
          )}
        </Notice>
      )}
      {!staff && editable(r) && r.evidence && (
        <p className="care-help">
          {appText(
            "Uploading saves the file. Select Send for staff review to submit this relationship request.",
          )}
        </p>
      )}
      {r.reason && (
        <Notice>
          <strong>{appText("Staff feedback")}</strong>
          <p>
            {r.reason === "Student declined the guardian relationship."
              ? appText("Student declined the guardian relationship.")
              : r.reason}
          </p>
        </Notice>
      )}
    </>
  );
}
const verificationSteps = [
  ["Relationship details", "Enter both names as shown on the school report."],
  [
    "Learning choices",
    "Choose who will manage learning and teacher decisions.",
  ],
  [
    "Student confirmation",
    "Choose how the student confirms, then review your answers.",
  ],
  [
    "Report and confirmation",
    "Upload a school report. The student confirms by email or with staff on a call.",
  ],
  [
    "Staff review",
    "Our team checks the relationship and asks for changes if needed.",
  ],
  [
    "Student setup",
    "After approval, give learning permission and create the student profile.",
  ],
];
function VerificationProgress({
  step,
  stopped,
}: {
  step: number;
  stopped: boolean;
}) {
  const { appText } = useAppTranslation();
  return (
    <nav
      className="verification-progress"
      aria-label={appText("Guardian verification progress")}
    >
      <p
        className="verification-progress-status"
        role="status"
        aria-live="polite"
      >
        {stopped
          ? appText("This request is closed. Check its status below.")
          : appText("Step {0} of {1}: {2}", [
              String(step + 1),
              String(verificationSteps.length),
              appText(verificationSteps[step][0]),
            ])}
      </p>
      <ol aria-label={appText("Guardian verification steps")}>
        {verificationSteps.map(([label], index) => (
          <li
            key={label}
            data-state={
              stopped
                ? "paused"
                : index < step
                  ? "complete"
                  : index === step
                    ? "current"
                    : "upcoming"
            }
            aria-current={!stopped && index === step ? "step" : undefined}
          >
            <span className="verification-step-marker" aria-hidden="true">
              {!stopped && index < step ? "✓" : index + 1}
            </span>
            <strong>{appText(label)}</strong>
          </li>
        ))}
      </ol>
      {!stopped && (
        <p className="verification-step-hint" key={step}>
          {appText(verificationSteps[step][1])}
        </p>
      )}
    </nav>
  );
}
function OwnerVerification({
  initial,
  session,
  queueUnavailable,
  refreshQueue,
  onSessionChange,
  close,
}: {
  initial: Verification | null;
  session: Session;
  queueUnavailable: boolean;
  refreshQueue: () => Promise<void>;
  onSessionChange: (s: Session) => void;
  close: () => void;
}) {
  const { appText, appError } = useAppTranslation(),
    root = useRef<HTMLElement>(null),
    fileRef = useRef<HTMLInputElement>(null);
  const [invitationLocked, setInvitationLocked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [id, setId] = useState(initial?.id || ""),
    [application, setApplication] = useState<Application>(
      initial
        ? ({
            ...initial,
            adultDeclaration: true,
            authorityDeclaration: true,
            verificationPermission: true,
            policyVersion: "guardian-verification-v1",
          } as Application)
        : initialApplication(),
    ),
    [formStep, setFormStep] = useState(0),
    [editing, setEditing] = useState(!initial),
    [reviewing, setReviewing] = useState(false),
    [adult, setAdult] = useState(false),
    [permission, setPermission] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [file, setFile] = useState<{
      mediaType: "image/png" | "image/jpeg";
      contentBase64: string;
    } | null>(null),
    [reading, setReading] = useState(false),
    [discard, setDiscard] = useState(false);
  const detail = useQuery({
    queryKey: ["guardian-verification", session.account.id, id],
    queryFn: ({ signal }) =>
      api<Verification>(`/guardian-verifications/${id}`, { signal }),
    enabled: !!id,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const r = !detail.error ? detail.data : null;
  async function refresh() {
    const result = await Promise.all([
      refreshQueue(),
      ...(id ? [detail.refetch()] : []),
    ]);
    if (
      result.some((q) => q && typeof q === "object" && "error" in q && q.error)
    )
      throw new Error("Verification records could not be loaded.");
  }
  const decision = useDecision(session, refresh),
    unavailable = queueUnavailable || !!detail.error,
    locked =
      decision.locked || invitationLocked || reading || unavailable || (!!id && detail.isFetching);
  useEffect(() => {
    if (
      !r ||
      r.evidence?.status !== "QUARANTINED" ||
      editing ||
      file ||
      reading ||
      unavailable ||
      decision.locked
    )
      return;
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible")
          void detail.refetch().then((next) => {
            if (
              next.data &&
              (next.data.version !== r.version ||
                next.data.currentEvidenceId !== r.currentEvidenceId)
            )
              setConfirmed(false);
          });
      },
      r.scanStatus === "RETRY_REQUIRED" ? 15000 : 5000,
    );
    return () => window.clearInterval(timer);
  }, [r, editing, file, reading, unavailable, decision.locked, detail.refetch]);
  const learners = useQuery({
    queryKey: ["guardian-verification-learners", session.account.id],
    queryFn: ({ signal }) => api<{ items: Child[] }>("/children", { signal }),
    enabled: !!r && r.status === "APPROVED" && !r.learnerId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const existing =
    learners.data?.items.filter(
      (c) => c.alias.toLowerCase() === r?.learnerName.toLowerCase(),
    ) || [];
  useEffect(() => {
    root.current?.focus();
  }, [formStep, reviewing]);
  const saved = (value: unknown) => {
    const v = value as Verification;
    setId(v.id);
    setEditing(false);
    setReviewing(false);
    setConfirmed(false);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  async function saveApplication() {
    if (locked || !reviewing || !confirmed) return;
    const body: Application = {
      guardianName: application.guardianName.trim(),
      learnerName: application.learnerName.trim(),
      relationship: application.relationship,
      ageBand: application.ageBand,
      managementMode: application.managementMode,
      studentEmail:
        application.acknowledgmentMethod === "STUDENT_ACCOUNT"
          ? application.studentEmail?.trim().toLowerCase() || null
          : null,
      acknowledgmentMethod: application.acknowledgmentMethod,
      documentNamesGuardian: application.documentNamesGuardian,
      adultDeclaration: true,
      authorityDeclaration: true,
      verificationPermission: true,
      policyVersion: "guardian-verification-v1",
    };
    await decision.run({
      path: id
        ? `/guardian-verifications/${id}/revisions`
        : "/guardian-verifications",
      body: id ? { expectedVersion: r!.version, application: body } : body,
      message: "Relationship details saved for verification.",
      onSaved: saved,
    });
  }
  async function chooseFile(f: File | undefined) {
    if (!f || locked) return;
    if (
      !["image/png", "image/jpeg"].includes(f.type) ||
      f.size > 5 * 1024 * 1024 ||
      !f.size
    ) {
      setFile(null);
      decision.invalid("Choose a PNG or JPEG image of at most 5 MiB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setReading(true);
    setFile(null);
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      setFile({
        mediaType: f.type as "image/png" | "image/jpeg",
        contentBase64: result,
      });
    } catch {
      decision.invalid("The image could not be read. Choose it again.");
    } finally {
      setReading(false);
    }
  }
  return (
    <section
      className="staff-editor guardian-verification-editor"
      tabIndex={-1}
      ref={root}
      aria-label={appText("Guardian verification details")}
    >
      {!unavailable && (!id || r) && (
        <VerificationProgress
          step={
            editing
              ? formStep
              : r?.status === "APPROVED"
                ? 5
                : r?.status === "PENDING"
                  ? 4
                  : 3
          }
          stopped={
            !!r &&
            ["REJECTED", "CANCELLED", "REVOKED", "DELETED"].includes(r.status)
          }
        />
      )}
      <h3>
        {appText(
          id
            ? "Your relationship verification"
            : "Student and guardian details",
        )}
      </h3>
      <Feedback decision={decision} floating />
      {(decision.conflict || unavailable || (!!id && !editing)) &&
        !decision.uncertain && (
          <Button
            variant="outline"
            disabled={decision.busy || detail.isFetching}
            onClick={() => {
              setConfirmed(false);
              decision.reload();
            }}
          >
            {appText("Refresh verification details")}
          </Button>
        )}
      {unavailable && (
        <Notice error>
          {appText(
            "Private verification details are unavailable. Refresh before making another change.",
          )}
        </Notice>
      )}
      {!!id && detail.isPending && (
        <p role="status">{appText("Loading verification details…")}</p>
      )}
      {!unavailable && (!id || r) && (
        <>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reviewing) saveApplication();
                else if (formStep < 2) setFormStep(formStep + 1);
                else if (adult && permission) {
                  setReviewing(true);
                  setConfirmed(false);
                  root.current?.focus();
                }
              }}
            >
              {!reviewing ? (
                <>
                  <ApplicationFields
                    value={application}
                    setValue={setApplication}
                    disabled={locked}
                    step={formStep}
                  />
                  {formStep === 2 && (
                    <fieldset disabled={locked}>
                      <legend>
                        {appText("Permission for this verification")}
                      </legend>
                      <label className="care-check">
                        <input
                          type="checkbox"
                          required
                          checked={adult}
                          onChange={(e) => setAdult(e.target.checked)}
                        />
                        <span>
                          {appText(
                            "I am an adult authorized to act for this learner, and I acknowledge this guardian relationship.",
                          )}
                        </span>
                      </label>
                      <label className="care-check">
                        <input
                          type="checkbox"
                          required
                          checked={permission}
                          onChange={(e) => setPermission(e.target.checked)}
                        />
                        <span>
                          {appText(
                            "I permit private review of these relationship details and the school report for verification. This does not grant learning-data consent.",
                          )}
                        </span>
                      </label>
                    </fieldset>
                  )}
                  <FilterButtonGroup className="guardian-verification-actions">
                    {formStep > 0 && (
                      <FilterButton
                        type="button"
                        disabled={locked}
                        onClick={() => setFormStep(formStep - 1)}
                      >
                        {appText("Back")}
                      </FilterButton>
                    )}
                    <FilterButton accent type="submit" disabled={locked}>
                      {appText(
                        formStep < 2
                          ? "Continue"
                          : "Review relationship details",
                      )}
                    </FilterButton>
                  </FilterButtonGroup>
                </>
              ) : (
                <>
                  <section className="guardian-relationship-review" aria-label={appText("Student and guardian details")}>
                    <h4>{appText("Check the names before sending")}</h4>
                    <dl>
                      <div><dt>{appText("Guardian")}</dt><dd>{application.guardianName}</dd></div>
                      <div><dt>{appText("Learner")}</dt><dd>{application.learnerName}</dd></div>
                    </dl>
                    <LearningManagementBadge label={appText(guardianManagementLabels[application.managementMode])} items={[appText("The student sees this choice before acknowledging the relationship. Management permissions are separate from learning-data consent.")]} />
                    <p>
                      {appText(
                        application.acknowledgmentMethod === "STAFF_CALL"
                          ? "Acknowledgment will be reviewed during a staff call."
                          : "The named student must acknowledge from their separate account.",
                      )}
                    </p>
                  </section>
                  <div className="guardian-review-confirmation">
                  <label className="care-check">
                    <input
                      type="checkbox"
                      required
                      disabled={locked}
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                      {appText(
                        "I reviewed the names, management choice and verification permission.",
                      )}
                    </span>
                  </label>
                  <FilterButtonGroup className="guardian-verification-actions">
                    <FilterButton accent type="submit" disabled={locked || !confirmed}>
                      {appText("Save relationship details")}
                    </FilterButton>
                    <FilterButton
                      disabled={locked}
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        setConfirmed(false);
                        setReviewing(false);
                      }}
                    >
                      {appText("Back to details")}
                    </FilterButton>
                  </FilterButtonGroup>
                  </div>
                </>
              )}
            </form>
          ) : (
            r && (
              <>
                <VerificationSummary record={r} />
                {editable(r) && (
                  <>
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => {
                        setApplication({
                          ...r,
                          adultDeclaration: true,
                          authorityDeclaration: true,
                          verificationPermission: true,
                          policyVersion: "guardian-verification-v1",
                        } as Application);
                        setFormStep(0);
                        setEditing(true);
                        setReviewing(false);
                        setAdult(false);
                        setPermission(false);
                      }}
                    >
                      {appText("Edit relationship details")}
                    </Button>
                    <section className="guardian-evidence-step guardian-report-upload" aria-busy={reading || uploading}>
                      <header><UploadCloud size={24} aria-hidden="true" /><h4>{appText("Upload the school report")}</h4>
                        <InfoTooltip label={appText("Upload the school report")} items={[appText("Keep the learner and guardian names visible. Crop unrelated grades, identifiers and other pupils. The image stays private and must pass a safety scan.")]} />
                      </header>
                      <small>
                        {appText(
                          "PNG or JPEG, up to 5 MiB. Report images are never public.",
                        )}
                      </small>
                      <label>
                        {appText("School marksheet or performance-card image")}
                        <Input
                          ref={fileRef}
                          type="file"
                          accept="image/png,image/jpeg"
                          disabled={locked}
                          onChange={(e) => chooseFile(e.target.files?.[0])}
                        />
                      </label>
                      <Button
                        disabled={locked || !file}
                        onClick={async () => {
                          setUploading(true);
                          try { await decision.run({
                            path: `/guardian-verifications/${id}/evidence`,
                            body: { expectedVersion: r.version, ...file },
                            message:
                              "School report uploaded privately. Scan clearance is still required.",
                            onSaved: saved,
                          }); } finally { setUploading(false); }
                        }}
                      >
                        {appText("Upload school report")}
                      </Button>
                      {(reading || uploading) && <div className="report-upload-progress" role="status"><LoaderCircle className="upload-spinner" size={18} aria-hidden="true" />{appText(reading ? "Preparing document…" : "Uploading document…")}<span className="upload-progress-track" aria-hidden="true" /></div>}
                    </section>
                    <label className="care-check">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      <span>
                        {appText(
                          "Send this relationship and its current report to staff for review.",
                        )}
                      </span>
                    </label>
                    <Button
                      disabled={
                        locked ||
                        !confirmed ||
                        !r.evidence ||
                        ["INFECTED", "DELETED"].includes(r.evidence.status)
                      }
                      onClick={() =>
                        decision.run({
                          path: `/guardian-verifications/${id}/submissions`,
                          body: { expectedVersion: r.version, confirmed: true },
                          message:
                            "Verification submitted. Follow acknowledgment, scan and staff-review progress here.",
                          onSaved: saved,
                        })
                      }
                    >
                      {appText("Send for staff review")}
                    </Button>
                  </>
                )}
                {r.status === "PENDING" && (
                  <Notice>
                    {appText(
                      "Staff will review the report and relationship. If the guardian name is missing or does not match, a video or phone review is required. You can explore teachers while waiting.",
                    )}
                  </Notice>
                )}
                {r.status === "APPROVED" && (
                  <section className="guardian-evidence-step">
                    <h4>
                      {appText(
                        "Student setup",
                      )} <InfoTooltip label={appText("Student setup")} items={[appText("Complete learning permission and education details here. Student sign-in remains subject to acknowledgment and access permissions.")]} />
                    </h4>
                    <GuardianSetup session={session} onSessionChange={onSessionChange} embeddedChildren={<><LearnerProfiles key={r.id} session={session} targetName={r.learnerName} targetId={r.learnerId || undefined} />{r.learnerId && !r.studentAccountId && <InvitationRecovery session={session} childId={r.learnerId} alias={r.learnerName} blocked={decision.locked || unavailable} consentActive onLockChange={setInvitationLocked} />}</>} />
                    {existing
                      .filter((c) => c.guardianVerificationId !== r.id)
                      .map((c) => (
                        <Button
                          key={c.id}
                          variant="outline"
                          disabled={locked}
                          onClick={() =>
                            decision.run({
                              path: `/children/${c.id}/guardian-verifications`,
                              body: {
                                expectedVersion: c.version,
                                verificationId: r.id,
                                confirmed: true,
                              },
                              message:
                                "The new guardian review is linked to the existing learner.",
                              onSaved: () => {},
                            })
                          }
                        >
                          {appText("Restore verification for {0}", [c.alias])}
                        </Button>
                      ))}
                  </section>
                )}
                {["DRAFT", "PENDING", "CHANGES_REQUESTED"].includes(
                  r.status,
                ) && (
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      decision.run({
                        path: `/guardian-verifications/${id}/cancellations`,
                        body: { expectedVersion: r.version, confirmed: true },
                        message: "Verification cancelled.",
                        onSaved: saved,
                      })
                    }
                  >
                    {appText("Cancel verification request")}
                  </Button>
                )}
              </>
            )
          )}
        </>
      )}
      <div className="guardian-verification-close">
        {editing && !decision.uncertain && (
          <label className="care-check">
            <input
              type="checkbox"
              checked={discard}
              disabled={decision.busy}
              onChange={(e) => setDiscard(e.target.checked)}
            />
            <span>{appText("Discard unsaved details when closing.")}</span>
          </label>
        )}
        <Button
          variant="ghost"
          disabled={
            decision.busy ||
            decision.uncertain ||
            reading ||
            (editing && !discard)
          }
          onClick={close}
        >
          {appText("Close verification")}
        </Button>
      </div>
    </section>
  );
}
function StudentAcknowledgments({
  session,
  onSessionChange,
  studentView = false,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
  studentView?: boolean;
}) {
  const { appText, appError } = useAppTranslation(),
    [selected, setSelected] = useState<Invitation | null>(null),
    [action, setAction] = useState("ACKNOWLEDGE"),
    [confirmed, setConfirmed] = useState(false),
    heading = useRef<HTMLHeadingElement>(null);
  const history = useHistory<{
    items: Invitation[];
    nextCursor: string | null;
  }>({
    queryKey: ["guardian-verification-invitations", session.account.id],
    path: "/guardian-verification-invitations",
  });
  async function refresh() {
    const q = await history.refetch();
    if (q.error)
      throw new Error("Acknowledgment requests could not be loaded.");
  }
  const decision = useDecision(session, refresh),
    current = selected && history.data?.items.find((r) => r.id === selected.id),
    ready =
      current &&
      ["DRAFT", "PENDING"].includes(current.status) &&
      !current.studentAcknowledgedAt;
  if (
    !selected &&
    !history.error &&
    !history.isPending &&
    !history.data?.items.length
  )
    return session.account.role === "STUDENT" || studentView ? (
      <Notice>
        {appText("No guardian relationship requests are waiting for you.")}
        {studentView && (
          <p>
            {appText(
              "Ask your guardian to start verification using the same email you used here. Once saved, the relationship request will appear on this page.",
            )}
          </p>
        )}
      </Notice>
    ) : null;
  return (
    <section className="care-workspace guardian-acknowledgment">
      <h2 ref={heading} tabIndex={-1}>
        {appText("Your guardian relationship")}
      </h2>
      <p>
        {appText(
          "Only acknowledge someone you recognize as your guardian. You can decline a relationship that is wrong.",
        )}
      </p>
      <Feedback decision={decision} floating />
      {decision.conflict && !decision.uncertain && (
        <Button
          variant="outline"
          disabled={decision.busy}
          onClick={() => {
            setConfirmed(false);
            decision.reload();
          }}
        >
          {appText("Refresh relationship requests")}
        </Button>
      )}
      {history.isPending && (
        <p role="status">{appText("Loading acknowledgment requests…")}</p>
      )}
      {history.error ? (
        <Notice error>
          {appText("Acknowledgment requests could not be loaded.")}
          <Button
            variant="outline"
            disabled={decision.locked}
            onClick={() => history.refetch()}
          >
            {appText("Retry")}
          </Button>
        </Notice>
      ) : (
        <>
          {history.data?.items.map((r) => (
            <article className="staff-person" key={r.id}>
              <div>
                <strong>
                  {r.status === "DELETED"
                    ? appText("Deleted guardian")
                    : r.guardianName}
                </strong>
                <p>
                  {r.status === "DELETED"
                    ? appText("Deleted learner")
                    : r.learnerName}{" "}
                  · {appText(statuses[r.status])}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!!selected || decision.locked}
                onClick={() => {
                  setSelected(r);
                  setConfirmed(false);
                  setAction("ACKNOWLEDGE");
                }}
              >
                {appText("Review guardian relationship")}
              </Button>
            </article>
          ))}
          <HistoryPages
            label={appText("Guardian acknowledgment history")}
            history={history}
            disabled={!!selected || decision.locked}
          />
          {selected && !current && (
            <Notice>
              {appText("This relationship request is no longer available.")}
              <Button
                variant="outline"
                disabled={decision.locked}
                onClick={() => setSelected(null)}
              >
                {appText("Close relationship review")}
              </Button>
            </Notice>
          )}
          {current && (
            <section
              className="guardian-management-summary"
              aria-label={appText("Review guardian relationship")}
            >
              <h3>{current.guardianName}</h3>
              <p>{current.learnerName}</p>
              <LearningManagementBadge label={appText(guardianManagementLabels[current.managementMode])} items={[appText("Acknowledgment confirms the relationship you recognize. It does not make you an adult or replace separate guardian consent.")]} />
              <p>
                {appText(
                  "Acknowledgment confirms the relationship you recognize. It does not make you an adult or replace separate guardian consent.",
                )}
              </p>
              {ready && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (confirmed && !decision.locked)
                      decision.run({
                        path: `/guardian-verifications/${current.id}/student-acknowledgments`,
                        body: {
                          expectedVersion: current.version,
                          decision: action,
                          confirmed: true,
                        },
                        message:
                          action === "DECLINE"
                            ? "Guardian relationship declined."
                            : "Guardian relationship acknowledgment recorded.",
                      });
                  }}
                >
                  <fieldset disabled={decision.locked}>
                    <label>
                      {appText("Your decision")}
                      <select
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                      >
                        <option value="ACKNOWLEDGE">
                          {appText("This is my guardian")}
                        </option>
                        <option value="DECLINE">
                          {appText("This relationship is incorrect")}
                        </option>
                      </select>
                    </label>
                    <label className="care-check">
                      <input
                        type="checkbox"
                        required
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      <span>
                        {appText(
                          "I reviewed this person, the management choice and my decision.",
                        )}
                      </span>
                    </label>
                    <Button type="submit" disabled={!confirmed}>
                      {appText("Confirm relationship decision")}
                    </Button>
                  </fieldset>
                </form>
              )}
              <FilterButtonGroup>
                <FilterButton
                  disabled={decision.busy || decision.uncertain}
                  onClick={() => {
                    setSelected(null);
                    requestAnimationFrame(() => heading.current?.focus());
                  }}
                >
                  {appText("Close relationship review")}
                </FilterButton>
                <FilterButton accent
                  disabled={decision.locked}
                  onClick={async () => {
                    try {
                      onSessionChange(await api<Session>("/auth/session"));
                    } catch {
                      decision.invalid(
                        "Your account could not be refreshed. Try again.",
                      );
                    }
                  }}
                >
                  {appText("Refresh account status")}
                </FilterButton>
              </FilterButtonGroup>
            </section>
          )}
        </>
      )}
    </section>
  );
}
function VerificationQueue({ session }: { session: Session }) {
  const { appText } = useAppTranslation(),
    [status, setStatus] = useState("PENDING"),
    [selected, setSelected] = useState<Verification | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const queue = useHistory<{
    items: Verification[];
    nextCursor: string | null;
  }>({
    queryKey: ["guardian-review-queue", session.account.id, status],
    path: "/admin/guardian-verifications" + (status ? "?status=" + status : ""),
  });
  return (
    <section className="care-workspace guardian-verification-workspace">
      <Link className="inline-link" href="/dashboard/security">
        {appText("Authenticator & recovery")}
      </Link>
      <h2 ref={heading} tabIndex={-1}>
        {appText("Review the relationship behind the account.")}
      </h2>
      <p>
        {appText(
          "A clean school report is evidence for a human review. Check adult status, authority, student acknowledgment and the named relationship separately.",
        )}
      </p>
      <label>
        {appText("Verification queue status")}
        <select
          disabled={!!selected}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{appText("All statuses")}</option>
          {Object.entries(statuses).map(([key, label]) => (
            <option key={key} value={key}>
              {appText(label)}
            </option>
          ))}
        </select>
      </label>
      {queue.isPending && (
        <p role="status">{appText("Loading verification requests…")}</p>
      )}
      {queue.error ? (
        <Notice error>
          {appText("Verification records could not be loaded.")}
          <Button disabled={!!selected} onClick={() => queue.refetch()}>
            {appText("Retry")}
          </Button>
        </Notice>
      ) : (
        <>
          {!queue.isPending && !queue.data?.items.length && (
            <Notice>{appText("No guardian requests for this status.")}</Notice>
          )}
          {queue.data?.items.map((r) => (
            <article className="staff-person" key={r.id}>
              <div>
                <h3>
                  {r.status === "DELETED"
                    ? appText("Deleted learner")
                    : r.learnerName}
                </h3>
                <p>
                  {r.status === "DELETED"
                    ? appText("Deleted guardian")
                    : r.guardianName}{" "}
                  · {appText(statuses[r.status])}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!!selected}
                onClick={() => setSelected(r)}
              >
                {appText("Review guardian evidence")}
              </Button>
            </article>
          ))}
          <HistoryPages
            label={appText("Guardian review queue")}
            history={queue}
            disabled={!!selected}
          />
        </>
      )}
      {selected && (
        <StaffVerification
          key={selected.id}
          initial={selected}
          session={session}
          queueUnavailable={!!queue.error}
          refreshQueue={async () => {
            const r = await queue.refetch();
            if (r.error)
              throw new Error("Verification records could not be loaded.");
          }}
          close={() => {
            setSelected(null);
            requestAnimationFrame(() => heading.current?.focus());
          }}
        />
      )}
    </section>
  );
}
function StaffVerification({
  initial,
  session,
  queueUnavailable,
  refreshQueue,
  close,
}: {
  initial: Verification;
  session: Session;
  queueUnavailable: boolean;
  refreshQueue: () => Promise<void>;
  close: () => void;
}) {
  const { appText, appError } = useAppTranslation(),
    root = useRef<HTMLElement>(null),
    [outcome, setOutcome] = useState(
      initial.status === "APPROVED" ? "REVOKE" : "APPROVE",
    ),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [adult, setAdult] = useState(false),
    [names, setNames] = useState(false),
    [observed, setObserved] = useState(false),
    [call, setCall] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [saved, setSaved] = useState(false),
    [retryScan, setRetryScan] = useState(false),
    [retryReason, setRetryReason] = useState(""),
    [retryConfirmed, setRetryConfirmed] = useState(false);
  const detail = useQuery({
    queryKey: ["guardian-review", session.account.id, initial.id],
    queryFn: ({ signal }) =>
      api<Verification>(`/guardian-verifications/${initial.id}`, { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const [, r] = await Promise.all([refreshQueue(), detail.refetch()]);
    if (r.error) throw new Error("Verification records could not be loaded.");
  }
  const decision = useDecision(session, refresh),
    r = !detail.error ? detail.data : null,
    unavailable = queueUnavailable || !!detail.error,
    locked = decision.locked || unavailable || detail.isFetching || saved;
  const approvalBlockers =
    r && outcome === "APPROVE"
      ? [
          r.evidence?.status !== "CLEAN" &&
            appText("Wait for the school report to pass its safety scan."),
          !adult &&
            appText(
              "Confirm that you independently checked adult status and authority.",
            ),
          !((r.documentNamesGuardian && names) || call) &&
            appText(
              "Confirm the matching report names, or record a completed phone or video review.",
            ),
          r.acknowledgmentMethod === "STUDENT_ACCOUNT"
            ? !r.studentAcknowledgedAt &&
              appText(
                "The student must confirm this relationship from their own account. A staff call does not replace this confirmation. After they confirm, refresh verification details.",
              )
            : !(call && observed) &&
              appText(
                "Complete a phone or video review and confirm that you observed the student acknowledging this guardian.",
              ),
        ].filter((message): message is string => typeof message === "string")
      : [];
  const decisionBlockers = [
    ...approvalBlockers,
    !reason.trim() && appText("Enter feedback for the guardian."),
    !reference.trim() && appText("Enter a protected review reference."),
    !confirmed &&
      appText(
        "Confirm that you reviewed this learner, guardian, evidence and the exact decision.",
      ),
  ].filter((message): message is string => typeof message === "string");
  useEffect(() => {
    if (
      !r ||
      r.evidence?.status !== "QUARANTINED" ||
      retryScan ||
      unavailable ||
      decision.locked ||
      saved
    )
      return;
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible")
          void detail.refetch().then((next) => {
            if (
              next.data &&
              (next.data.version !== r.version ||
                next.data.evidence?.version !== r.evidence?.version)
            )
              setConfirmed(false);
          });
      },
      r.scanStatus === "RETRY_REQUIRED" ? 15000 : 5000,
    );
    return () => window.clearInterval(timer);
  }, [r, retryScan, unavailable, decision.locked, saved, detail.refetch]);
  useEffect(() => {
    root.current?.focus();
  }, []);
  return (
    <section
      className="staff-editor guardian-verification-editor"
      ref={root}
      tabIndex={-1}
      aria-label={appText("Review guardian evidence")}
    >
      <h3>{appText("Review guardian evidence")}</h3>
      <Feedback decision={decision} floating />
      {!decision.uncertain && (!retryScan || decision.conflict || unavailable) && (
        <Button
          variant="outline"
          disabled={decision.busy || detail.isFetching}
          onClick={() => {
            setRetryScan(false);
            setRetryConfirmed(false);
            setConfirmed(false);
            decision.reload();
          }}
        >
          {appText("Refresh verification details")}
        </Button>
      )}
      {detail.isPending && (
        <p role="status">{appText("Loading verification details…")}</p>
      )}
      {unavailable ? (
        <Notice error>
          {appText(
            "Private verification details are unavailable. Refresh before making another change.",
          )}
        </Notice>
      ) : (
        r && (
          <>
            <VerificationSummary record={r} staff />
            {session.account.role === "ADMIN" &&
              r.scanRetry &&
              r.evidence?.status === "QUARANTINED" && (
                <section className="guardian-scan-recovery">
                  <h4>{appText("Restore report scanning")}</h4>
                  {!retryScan ? (
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => {
                        setRetryScan(true);
                        setRetryConfirmed(false);
                      }}
                    >
                      {appText("Review scan retry")}
                    </Button>
                  ) : (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const retry = r.scanRetry;
                        if (
                          locked ||
                          !retry ||
                          !retryConfirmed ||
                          !retryReason.trim()
                        )
                          return;
                        decision.run({
                          path: `/admin/jobs/${retry.jobId}/retries`,
                          body: {
                            expectedAttempts: retry.expectedAttempts,
                            reason: retryReason.trim(),
                            confirmed: true,
                          },
                          message:
                            "Safety scan queued again. The report stays blocked until the scanner clears it.",
                          onSaved: () => {
                            setRetryScan(false);
                            setRetryConfirmed(false);
                            setRetryReason("");
                          },
                        });
                      }}
                    >
                      <fieldset disabled={locked}>
                        <legend>
                          {appText("Retry this report scan only")}
                        </legend>
                        <label>
                          {appText("Reason for scan retry")}
                          <Textarea
                            value={retryReason}
                            onChange={(event) =>
                              setRetryReason(event.target.value)
                            }
                            required
                            maxLength={500}
                          />
                        </label>
                        <label className="care-check">
                          <input
                            type="checkbox"
                            checked={retryConfirmed}
                            onChange={(event) =>
                              setRetryConfirmed(event.target.checked)
                            }
                          />
                          <span>
                            {appText(
                              "I checked the scanner and worker and want to retry this file's safety scan.",
                            )}
                          </span>
                        </label>
                      </fieldset>
                      <FilterButtonGroup>
                        <FilterButton accent
                          type="submit"
                          disabled={
                            locked || !retryConfirmed || !retryReason.trim()
                          }
                        >
                          {appText("Retry safety scan")}
                        </FilterButton>
                        <FilterButton
                          type="button"
                          disabled={decision.locked}
                          onClick={() => setRetryScan(false)}
                        >
                          {appText("Go back")}
                        </FilterButton>
                      </FilterButtonGroup>
                    </form>
                  )}
                </section>
              )}
            {r.reviewReference && (
              <p>
                {appText("Protected review reference")}: {r.reviewReference}
              </p>
            )}
            {["PENDING", "APPROVED"].includes(r.status) && !saved && !retryScan && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    locked ||
                    decisionBlockers.length > 0
                  )
                    return;
                  decision.run({
                    path: `/admin/guardian-verifications/${r.id}/decisions`,
                    body: {
                      expectedVersion: r.version,
                      decision: outcome,
                      reason: reason.trim(),
                      reviewReference: reference.trim(),
                      adultAndAuthorityChecked: adult,
                      documentNameMatched: names,
                      studentAcknowledgmentObserved: observed,
                      ...(call ? { callMethod: call } : {}),
                      confirmed: true,
                    },
                    message: "Guardian verification review recorded.",
                    onSaved: () => setSaved(true),
                  });
                }}
              >
                <fieldset disabled={locked}>
                  <legend>{appText("Record the staff decision")}</legend>
                  <label>
                    {appText("Decision")}
                    <select
                      value={outcome}
                      onChange={(e) => {
                        setOutcome(e.target.value);
                        setConfirmed(false);
                      }}
                    >
                      {r.status === "APPROVED" ? (
                        <option value="REVOKE">
                          {appText("Revoke verification")}
                        </option>
                      ) : (
                        <>
                          <option value="APPROVE">
                            {appText("Approve relationship")}
                          </option>
                          <option value="REQUEST_CHANGES">
                            {appText("Request changes")}
                          </option>
                          <option value="REJECT">
                            {appText("Reject relationship")}
                          </option>
                        </>
                      )}
                    </select>
                  </label>
                  {outcome === "APPROVE" && (
                    <>
                      <label className="care-check">
                        <input
                          type="checkbox"
                          checked={adult}
                          onChange={(e) => setAdult(e.target.checked)}
                        />
                        <span>
                          {appText(
                            "I independently checked adult status and authority. A matching report name alone is insufficient.",
                          )}
                        </span>
                      </label>
                      <label className="care-check">
                        <input
                          type="checkbox"
                          checked={names}
                          onChange={(e) => setNames(e.target.checked)}
                        />
                        <span>
                          {appText(
                            "The clean report names this guardian and matches this learner.",
                          )}
                        </span>
                      </label>
                      <label>
                        {appText("Completed call review")}
                        <select
                          value={call}
                          onChange={(e) => setCall(e.target.value)}
                        >
                          <option value="">
                            {appText("No call recorded")}
                          </option>
                          <option value="VIDEO">
                            {appText("Video review completed")}
                          </option>
                          <option value="PHONE">
                            {appText("Phone review completed")}
                          </option>
                        </select>
                      </label>
                      {r.acknowledgmentMethod === "STAFF_CALL" && <label className="care-check">
                        <input
                          type="checkbox"
                          checked={observed}
                          onChange={(e) => setObserved(e.target.checked)}
                        />
                        <span>
                          {appText(
                            "I observed the student acknowledgment during this call.",
                          )}
                        </span>
                      </label>}
                      {(!r.documentNamesGuardian ||
                        !names ||
                        r.acknowledgmentMethod === "STAFF_CALL") && (
                        <Notice>
                          {appText(
                            "Record a completed video or phone review when the guardian name is missing or student acknowledgment is staff-observed.",
                          )}
                        </Notice>
                      )}
                    </>
                  )}
                  <label>
                    {appText("Feedback for the guardian")}
                    <Textarea
                      required
                      minLength={1}
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <label>
                    {appText("Protected review reference")}
                    <Input
                      aria-label={appText("Protected review reference")}
                      aria-describedby="guardian-review-reference-help"
                      required
                      maxLength={200}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                    <small id="guardian-review-reference-help">
                      {appText(
                        "Use a private review-record reference. Do not enter identity numbers, document contents or secrets.",
                      )}
                    </small>
                  </label>
                  <label className="care-check">
                    <input
                      type="checkbox"
                      required
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                      {appText(
                        "I reviewed this learner, guardian, evidence and the exact decision.",
                      )}
                    </span>
                  </label>
                  <section className="guardian-decision-readiness" id="guardian-decision-readiness" aria-live="polite" aria-atomic="true">
                    <h4>{decisionBlockers.length ? appText("Before you can record this decision") : appText("Ready to record this decision")}</h4>
                    {decisionBlockers.length > 0 && <ul>{decisionBlockers.map((message) => <li key={message}>{message}</li>)}</ul>}
                  </section>
                  <Button
                    type="submit"
                    aria-describedby="guardian-decision-readiness"
                    disabled={decisionBlockers.length > 0}
                  >
                    {appText("Record verification decision")}
                  </Button>
                </fieldset>
              </form>
            )}
          </>
        )
      )}
      <Button
        variant="ghost"
        disabled={decision.busy || decision.uncertain}
        onClick={close}
      >
        {appText("Close evidence review")}
      </Button>
    </section>
  );
}
