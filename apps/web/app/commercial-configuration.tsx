"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rupees, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useAppTranslation } from "./locale";
import { useHistory, HistoryPages } from "./history";
import { Feedback, Notice, useDecision } from "./tuition-workflow";
type Configuration = components["schemas"]["CommercialConfiguration"];
type Snapshot = components["schemas"]["CommercialSnapshot"];
type Region = components["schemas"]["ServiceRegionSettings"];
type Change = components["schemas"]["CommercialChange"];
type Revision = components["schemas"]["CommercialRevision"];
type Editor =
  | { kind: "FEE"; base: Configuration }
  | { kind: "REGION"; base: Configuration; region?: Region }
  | { kind: "ROLLBACK"; base: Configuration; revision: Revision }
  | { change: Change };
export function CommercialConfiguration({
  session,
  onLockChange,
}: {
  session: Session;
  onLockChange: (locked: boolean) => void;
}) {
  const { appText, appLocale } = useAppTranslation(),
    client = useQueryClient(),
    heading = useRef<HTMLHeadingElement>(null),
    wasOpen = useRef(false);
  const [editor, setEditor] = useState<Editor | null>(null),
    [status, setStatus] = useState("PENDING");
  const current = useQuery({
    queryKey: ["commercial-current", session.account.id],
    queryFn: ({ signal }) =>
      api<Configuration>("/admin/commercial", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const changes = useHistory<{ items: Change[]; nextCursor: string | null }>({
    queryKey: ["commercial-changes", session.account.id, status],
    path: "/admin/commercial/changes" + (status ? "?status=" + status : ""),
  });
  const history = useHistory<{ items: Revision[]; nextCursor: string | null }>({
    queryKey: ["commercial-history", session.account.id],
    path: "/admin/commercial/history",
  });
  const unavailable = !!current.error || !!changes.error || !!history.error,
    data = !current.error ? current.data : undefined;
  useEffect(() => {
    onLockChange(!!editor);
    return () => onLockChange(false);
  }, [editor, onLockChange]);
  useEffect(() => {
    if (!editor && wasOpen.current) heading.current?.focus();
    wasOpen.current = !!editor;
  }, [editor]);
  async function refresh() {
    const result = await Promise.all([
      current.refetch(),
      changes.refetch(),
      history.refetch(),
    ]);
    if (result.some((r) => r.error))
      throw new Error("Configuration records could not be loaded.");
    await client.invalidateQueries({
      queryKey: ["admin-console", session.account.id],
    });
  }
  const latest =
    editor && "change" in editor
      ? changes.data?.items.find((c) => c.id === editor.change.id) ||
        editor.change
      : null;
  return (
    <section
      className="staff-workspace commercial-workspace"
      aria-label={appText("Fees and coverage")}
    >
      <header className="staff-heading">
        <div>
          <h3 tabIndex={-1} ref={heading}>
            {appText("Change the next agreement. Preserve the last.")}
          </h3>
          <p>
            {appText(
              "Review hiring fees and service coverage with another administrator. Accepted arrangements keep their recorded terms.",
            )}
          </p>
        </div>
      </header>
      <Notice>
        {appText(
          "These settings do not enable payments, subscriptions or live release. Every change and rollback needs independent approval and recent authenticator verification.",
        )}
      </Notice>
      {current.isPending && (
        <p role="status">{appText("Loading current configuration…")}</p>
      )}
      {current.error && (
        <Notice error>
          {appText(
            "Current configuration is unavailable. Reload before proposing a change.",
          )}{" "}
          <Button
            variant="outline"
            disabled={!!editor || current.isFetching}
            onClick={() => current.refetch()}
          >
            {appText("Retry current configuration")}
          </Button>
        </Notice>
      )}
      {data && (
        <>
          <section className="care-card commercial-current">
            <div>
              <h4>{appText("Current hiring fee")}</h4>
              <p className="commercial-rate">
                {new Intl.NumberFormat(appLocale, {
                  style: "percent",
                  maximumFractionDigits: 2,
                }).format(data.snapshot.placementBasisPoints / 10000)}
              </p>
              <p>
                {appText("Maximum platform fee: {0}", [
                  rupees(data.snapshot.placementCapPaise, appLocale),
                ])}
              </p>
              <small>
                {appText("Configuration version {0}", [data.version])}
              </small>
            </div>
            <div>
              <p>
                {appText(
                  "The teacher's monthly tuition is separate. A new arrangement shows its exact platform fee before either party accepts.",
                )}
              </p>
              <Button
                disabled={!!editor || unavailable}
                onClick={() => setEditor({ kind: "FEE", base: data })}
              >
                {appText("Propose fee change")}
              </Button>
            </div>
          </section>
          <section
            className="care-card"
            aria-label={appText("Service regions")}
          >
            <div className="staff-heading">
              <div>
                <h4>{appText("Service regions")}</h4>
                <p>
                  {appText(
                    "Activation requires currently screened teachers with recorded teaching availability. This does not guarantee a match or free capacity.",
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={
                  !!editor ||
                  unavailable ||
                  data.snapshot.regions.length >= data.limits.maxRegions
                }
                onClick={() => setEditor({ kind: "REGION", base: data })}
              >
                {appText("Register a region")}
              </Button>
            </div>
            {!data.snapshot.regions.length && (
              <p>{appText("No service regions are registered.")}</p>
            )}
            <div className="commercial-regions">
              {data.snapshot.regions.map((region) => {
                const supply = data.supply.find(
                  (s) => s.regionId === region.id,
                );
                return (
                  <article className="staff-person" key={region.id}>
                    <h5>{region.cityName}</h5>
                    <p>
                      {region.id} · {region.stateCode} ·{" "}
                      {appText(region.enabled ? "Enabled" : "Paused")}
                    </p>
                    <p>
                      {appText(
                        "Screened teachers: {0}; with recorded availability: {1}.",
                        [supply?.screened || 0, supply?.withAvailability || 0],
                      )}
                    </p>
                    <Button
                      variant="outline"
                      disabled={!!editor || unavailable}
                      onClick={() =>
                        setEditor({ kind: "REGION", base: data, region })
                      }
                    >
                      {appText("Review region {0}", [region.id])}
                    </Button>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
      <div className="staff-columns">
        <section className="care-card">
          <h4>{appText("Configuration proposals")}</h4>
          <label className="field">
            <span>{appText("Configuration proposal status")}</span>
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
            label="Configuration proposal history"
            disabled={!!editor}
          />
          {!changes.isPending &&
            !changes.error &&
            !changes.data?.items.length && (
              <p>{appText("No configuration proposals in this view.")}</p>
            )}
          {changes.data?.items.map((change) => (
            <article className="staff-person" key={change.id}>
              <h5>
                {appText(
                  change.kind === "FEE"
                    ? "Hiring fee change"
                    : change.kind === "REGION"
                      ? "Service region change"
                      : "Configuration rollback",
                )}
              </h5>
              <p>
                {appText("Based on version {0}", [change.expectedVersion])} ·{" "}
                {appText(
                  change.status === "PENDING"
                    ? "Pending review"
                    : change.status === "APPROVED"
                      ? "Approved"
                      : change.status === "REJECTED"
                        ? "Rejected"
                        : "Cancelled",
                )}
              </p>
              <Button
                variant="outline"
                disabled={!!editor || unavailable || !data}
                onClick={() => setEditor({ change })}
              >
                {appText("Review configuration change")}
              </Button>
            </article>
          ))}
        </section>
        <section className="care-card">
          <h4>{appText("Applied configuration history")}</h4>
          <HistoryPages
            history={history}
            label="Applied configuration history"
            disabled={!!editor}
          />
          {!history.isPending &&
            !history.error &&
            !history.data?.items.length && (
              <p>{appText("No configuration revisions to display.")}</p>
            )}
          {history.data?.items.map((revision) => (
            <article className="staff-person" key={revision.id}>
              <h5>
                {appText("Configuration version {0}", [revision.version])}
              </h5>
              <p>{revision.reason}</p>
              <small>
                {appText("Policy reference: {0}", [revision.evidenceRef])}
              </small>
              <div className="care-actions">
                <Button
                  variant="outline"
                  disabled={
                    !!editor ||
                    unavailable ||
                    !data ||
                    revision.version === data.version
                  }
                  onClick={() =>
                    data &&
                    setEditor({ kind: "ROLLBACK", base: data, revision })
                  }
                >
                  {appText("Restore version {0}", [revision.version])}
                </Button>
              </div>
            </article>
          ))}
        </section>
      </div>
      {editor && (
        <ConfigurationEditor
          key={
            "change" in editor
              ? editor.change.id
              : editor.kind +
                (editor.kind === "REGION"
                  ? editor.region?.id || "new"
                  : editor.kind === "ROLLBACK"
                    ? editor.revision.version
                    : "")
          }
          editor={editor}
          current={data}
          latest={latest}
          unavailable={unavailable}
          session={session}
          refresh={refresh}
          close={() => setEditor(null)}
        />
      )}
    </section>
  );
}
function Comparison({ before, after }: { before: Snapshot; after: Snapshot }) {
  const { appText, appLocale } = useAppTranslation();
  const changed = after.regions.filter((r) => {
    const old = before.regions.find((x) => x.id === r.id);
    return (
      !old ||
      old.enabled !== r.enabled ||
      old.cityName !== r.cityName ||
      old.stateCode !== r.stateCode ||
      old.countryCode !== r.countryCode
    );
  });
  return (
    <section
      className="commercial-comparison"
      aria-label={appText("Configuration effects")}
    >
      <h4>{appText("Before and after")}</h4>
      <dl className="staff-summary">
        <dt>{appText("Platform fee rate")}</dt>
        <dd>
          {before.placementBasisPoints / 100}% →{" "}
          {after.placementBasisPoints / 100}%
        </dd>
        <dt>{appText("Maximum platform fee")}</dt>
        <dd>
          {rupees(before.placementCapPaise, appLocale)} →{" "}
          {rupees(after.placementCapPaise, appLocale)}
        </dd>
      </dl>
      <h5>{appText("Coverage changes")}</h5>
      {!changed.length && <p>{appText("Coverage stays unchanged.")}</p>}
      {changed.map((r) => {
        const old = before.regions.find((x) => x.id === r.id);
        return (
          <article className="staff-person" key={r.id}>
            <strong>{r.id}</strong>
            <p>
              {old
                ? `${old.cityName} · ${old.stateCode}`
                : appText("Not registered")}{" "}
              → {r.cityName} · {r.stateCode}
            </p>
            <p>
              {appText(
                old ? (old.enabled ? "Enabled" : "Paused") : "Not registered",
              )}{" "}
              → {appText(r.enabled ? "Enabled" : "Paused")}
            </p>
          </article>
        );
      })}
      <Notice>
        {appText(
          "Only future hiring terms use an approved fee change. Existing arrangements and recorded fees are preserved. Paused regions keep their accounts, enquiries and support records.",
        )}
      </Notice>
    </section>
  );
}
function ConfigurationEditor({
  editor,
  current,
  latest,
  unavailable,
  session,
  refresh,
  close,
}: {
  editor: Editor;
  current?: Configuration;
  latest: Change | null;
  unavailable: boolean;
  session: Session;
  refresh: () => Promise<void>;
  close: () => void;
}) {
  const { appText } = useAppTranslation(),
    root = useRef<HTMLElement>(null);
  const [reviewing, setReviewing] = useState(
      "change" in editor || ("kind" in editor && editor.kind === "ROLLBACK"),
    ),
    [saved, setSaved] = useState(false),
    [recorded, setRecorded] = useState<Change | null>(null);
  const initial = "kind" in editor ? editor.base.snapshot : null,
    originalRegion =
      "kind" in editor && editor.kind === "REGION" ? editor.region : undefined;
  const [rate, setRate] = useState(
      String((initial?.placementBasisPoints || 0) / 100),
    ),
    [cap, setCap] = useState(String((initial?.placementCapPaise || 0) / 100)),
    [region, setRegion] = useState<Region>(
      originalRegion || {
        id: "",
        countryCode: "IN",
        stateCode: "CG",
        cityName: "",
        enabled: false,
      },
    ),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [outcome, setOutcome] = useState<"APPROVE" | "REJECT">("APPROVE");
  const decision = useDecision(
    session,
    refresh,
    (result) =>
      !!result &&
      typeof result === "object" &&
      "id" in result &&
      typeof result.id === "string" &&
      "status" in result &&
      ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(
        String(result.status),
      ) &&
      "version" in result &&
      typeof result.version === "number" &&
      result.version > 0,
  );
  useEffect(() => {
    root.current?.focus();
  }, []);
  useEffect(() => {
    if (saved && !decision.busy) root.current?.focus();
  }, [saved, decision.busy]);
  const change =
      recorded || latest || ("change" in editor ? editor.change : null),
    proposer = change?.proposerId === session.account.id,
    finished = saved || (!!change && change.status !== "PENDING"),
    expired = !!change && Date.parse(change.expiresAt) <= Date.now(),
    stale =
      !!current &&
      ("kind" in editor ? editor.base.version : change!.expectedVersion) !==
        current.version;
  let before = change?.before || initial!,
    after = change?.after || initial!;
  if ("kind" in editor && editor.kind === "FEE")
    after = {
      ...before,
      placementBasisPoints: Math.round(Number(rate) * 100),
      placementCapPaise: Math.round(Number(cap) * 100),
    };
  if ("kind" in editor && editor.kind === "REGION")
    after = {
      ...before,
      regions: before.regions.filter((r) => r.id !== region.id).concat(region),
    };
  if ("kind" in editor && editor.kind === "ROLLBACK") {
    const old = editor.revision.after;
    after = {
      ...old,
      regions: before.regions.map(
        (r) =>
          old.regions.find((x) => x.id === r.id) || { ...r, enabled: false },
      ),
    };
  }
  const locked = decision.locked || finished || unavailable;
  async function send() {
    if (locked || !confirmed) return;
    if (change) {
      await decision.run({
        path: `/admin/commercial/changes/${encodeURIComponent(change.id)}/decision`,
        body: {
          expectedVersion: change.version,
          decision: proposer ? "CANCEL" : outcome,
          reason: reason.trim(),
          independentlyVerified: true,
        },
        message: "Configuration review recorded.",
        onSaved: (result) => {
          setRecorded(result as Change);
          setSaved(true);
        },
      });
    } else if ("kind" in editor && !stale) {
      const common = {
        kind: editor.kind,
        expectedVersion: editor.base.version,
        reason: reason.trim(),
        evidenceRef: reference.trim(),
        confirmed: true,
      };
      const body =
        editor.kind === "FEE"
          ? {
              ...common,
              fee: {
                placementBasisPoints: after.placementBasisPoints,
                placementCapPaise: after.placementCapPaise,
              },
            }
          : editor.kind === "REGION"
            ? { ...common, region }
            : { ...common, restoreVersion: editor.revision.version };
      await decision.run({
        path: "/admin/commercial/changes",
        body,
        message: "Configuration proposal saved for independent review.",
        onSaved: () => setSaved(true),
      });
    }
  }
  return (
    <section
      ref={root}
      tabIndex={-1}
      className="care-card staff-editor"
      aria-label={appText("Configuration review")}
    >
      <h3>{appText("Review configuration effects")}</h3>
      <Feedback decision={decision} />
      {(decision.error || decision.conflict || unavailable) && (
        <Button
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => decision.reload()}
        >
          {appText("Reload configuration records")}
        </Button>
      )}
      <Button variant="ghost" disabled={decision.locked} onClick={close}>
        {appText(
          finished
            ? "Close configuration review"
            : "Discard configuration review",
        )}
      </Button>
      {unavailable ? (
        <Notice error>
          {appText(
            "Configuration records are unavailable. Private review details stay hidden until access is checked again.",
          )}
        </Notice>
      ) : finished ? (
        <>
          <p>
            {appText(
              change
                ? "The independent decision is recorded. Approved settings affect future hiring only."
                : "The proposal is saved. Current settings stay in effect until a different administrator approves.",
            )}
          </p>
          {change && (
            <dl className="staff-summary">
              <dt>{appText("Recorded outcome")}</dt>
              <dd>
                {appText(
                  change.status === "APPROVED"
                    ? "Approved"
                    : change.status === "REJECTED"
                      ? "Rejected"
                      : change.status === "CANCELLED"
                        ? "Cancelled"
                        : "Pending review",
                )}
              </dd>
              <dt>{appText("Decision reason")}</dt>
              <dd>{change.decisionReason}</dd>
            </dl>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reviewing) {
              setReviewing(true);
              setConfirmed(false);
              root.current?.focus();
            } else void send();
          }}
        >
          <fieldset className="staff-fields" disabled={locked}>
            <legend>
              {appText(
                reviewing
                  ? "Review before confirming"
                  : "Proposed configuration",
              )}
            </legend>
            {stale && (
              <Notice error>
                {appText(
                  "Configuration changed since this review opened. Discard a draft and reopen current settings; an outdated proposal can still be rejected or cancelled.",
                )}
              </Notice>
            )}
            {!reviewing && "kind" in editor && editor.kind === "FEE" && (
              <>
                <label className="field">
                  <span>{appText("Platform fee rate (%)")}</span>
                  <Input
                    type="number"
                    min="0"
                    max="25"
                    step="0.01"
                    required
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{appText("Maximum platform fee (₹)")}</span>
                  <Input
                    type="number"
                    min="0"
                    max="1500"
                    step="0.01"
                    required
                    value={cap}
                    onChange={(e) => setCap(e.target.value)}
                  />
                </label>
                <p>
                  {appText(
                    "Current pilot limits are 25% and ₹1,500. Zero permits a zero platform fee; it does not change teacher tuition.",
                  )}
                </p>
              </>
            )}
            {!reviewing && "kind" in editor && editor.kind === "REGION" && (
              <>
                <label className="field">
                  <span>{appText("Region code")}</span>
                  <Input
                    required
                    readOnly={!!originalRegion}
                    maxLength={80}
                    pattern="[A-Za-z0-9][A-Za-z0-9 _\-]{0,79}"
                    value={region.id}
                    onChange={(e) =>
                      setRegion({ ...region, id: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>{appText("City name")}</span>
                  <Input
                    required
                    maxLength={80}
                    value={region.cityName}
                    onChange={(e) =>
                      setRegion({ ...region, cityName: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>{appText("State code")}</span>
                  <Input
                    required
                    pattern="[A-Z]{2,16}"
                    maxLength={16}
                    value={region.stateCode}
                    onChange={(e) =>
                      setRegion({
                        ...region,
                        stateCode: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={region.enabled}
                    onChange={(e) =>
                      setRegion({ ...region, enabled: e.target.checked })
                    }
                  />
                  <span>
                    {appText("Enable this service region after approval")}
                  </span>
                </label>
                <Notice>
                  {appText(
                    "Register a new region paused first. Activation needs current screened teachers and recorded availability. Region codes remain permanent and accounts are not moved.",
                  )}
                </Notice>
              </>
            )}
            {reviewing && <Comparison before={before} after={after} />}
            {"kind" in editor && editor.kind === "ROLLBACK" && (
              <Notice>
                {appText(
                  "Restore version {0} as a new revision. Newer region codes remain registered and are paused when absent from the restored version.",
                  [editor.revision.version],
                )}
              </Notice>
            )}
            {change && (
              <>
                <dl className="staff-summary">
                  <dt>{appText("Proposal reason")}</dt>
                  <dd>{change.reason}</dd>
                  <dt>{appText("Restricted review reference")}</dt>
                  <dd>{change.evidenceRef}</dd>
                </dl>
                {proposer ? (
                  <Notice>
                    {appText(
                      "You proposed this change. Another administrator must approve or reject it; you may cancel it.",
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
                      <option value="APPROVE" disabled={expired || stale}>
                        {appText("Approve configuration")}
                      </option>
                      <option value="REJECT">
                        {appText("Reject configuration")}
                      </option>
                    </select>
                  </label>
                )}
                {expired && (
                  <Notice error>
                    {appText(
                      "This proposal expired. Reject or cancel it and create a fresh review.",
                    )}
                  </Notice>
                )}
              </>
            )}
            <label className="field">
              <span>
                {appText(change ? "Decision reason" : "Proposal reason")}
              </span>
              <Textarea
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {!change && (
              <label className="field">
                <span>{appText("Restricted review reference")}</span>
                <Input
                  required
                  maxLength={120}
                  pattern="[A-Za-z0-9]([A-Za-z0-9._:]|/|-){2,119}"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            )}
            {reviewing && (
              <label className="check-label">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  {appText(
                    change
                      ? proposer
                        ? "I confirm cancellation of this configuration proposal."
                        : "I independently checked the policy reference, fee and coverage effects, and current supply requirements."
                      : "I reviewed the before and after settings. A different administrator must approve before they apply.",
                  )}
                </span>
              </label>
            )}
            <div className="care-actions">
              {!change &&
                reviewing &&
                "kind" in editor &&
                editor.kind !== "ROLLBACK" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setReviewing(false);
                      setConfirmed(false);
                    }}
                  >
                    {appText("Edit configuration proposal")}
                  </Button>
                )}
              <Button
                type="submit"
                disabled={
                  locked ||
                  (!change && stale) ||
                  (!!change &&
                    !proposer &&
                    outcome === "APPROVE" &&
                    (expired || stale))
                }
              >
                {appText(
                  !reviewing
                    ? "Review configuration proposal"
                    : change
                      ? proposer
                        ? "Cancel configuration proposal"
                        : "Record configuration review"
                      : "Send for independent review",
                )}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
