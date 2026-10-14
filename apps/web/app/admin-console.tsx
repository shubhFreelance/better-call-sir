"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import { ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { Notice, useDecision } from "./tuition-workflow";
type Console = components["schemas"]["AdminConsole"];
type Privacy = components["schemas"]["PrivacyRequest"];
type Flag = components["schemas"]["ConsoleFlag"];
type Job = components["schemas"]["JobQueue"]["items"][number];
type Deletion = components["schemas"]["DeletionRecord"];
type Action =
  | { kind: "flag"; item: Flag }
  | { kind: "privacy"; item: Privacy }
  | { kind: "job"; item: Job }
  | { kind: "replay"; item: Deletion };
const label = (v: string) => v.toLowerCase().replaceAll("_", " ");
const when = (v: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
const money = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(v / 100);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function AdminConsole({ session }: { session: Session }) {
  if (session.account.role !== "ADMIN")
    return (
      <Notice error>Administrator access is required for this console.</Notice>
    );
  return <ConsoleWorkspace session={session} />;
}
function ConsoleWorkspace({ session }: { session: Session }) {
  const [tab, setTab] = useState("overview"),
    [selected, setSelected] = useState<Action | null>(null);
  const current = useQuery({
    queryKey: ["admin-console", session.account.id],
    queryFn: ({ signal }) => api<Console>("/admin/console", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const q = await current.refetch();
    if (q.error) throw q.error;
  }
  return (
    <div className="care-workspace admin-workspace">
      <section className="care-intro">
        <ShieldCheck size={28} aria-hidden="true" />
        <h2>Make every decision traceable.</h2>
        <p>
          Inspect supervised account links, review privacy decisions and recover
          permitted work. Every change needs a reason and a current record.
        </p>
      </section>
      <Notice>
        Private administrator workspace. Live release is blocked. Staff
        provisioning and commercial policy editing await their independent
        approval and version-history workflows.
      </Notice>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (!selected) setTab(v);
        }}
      >
        <TabsList className="care-tabs" aria-label="Administrator workspaces">
          {[
            ["overview", "Overview & controls"],
            ["people", "People & linkage"],
            ["privacy", "Privacy review"],
            ["recovery", "Recovery & backups"],
            ["audit", "Audit history"],
          ].map(([v, n]) => (
            <TabsTrigger key={v} value={v} disabled={!!selected}>
              {n}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          {current.isPending && <p role="status">Loading console state…</p>}
          {current.error && (
            <Notice error>
              Console state could not be loaded.{" "}
              <Button
                variant="outline"
                disabled={!!selected}
                onClick={() => current.refetch()}
              >
                Retry console state
              </Button>
            </Notice>
          )}
          {current.data && !current.error && (
            <>
              <section className="care-card">
                <h3>Feature controls</h3>
                <p>
                  Recorded {when(current.data.asOf)} IST. Mode:{" "}
                  {label(current.data.mode)}. A flag change does not authorize
                  release or prove provider readiness.
                </p>
                <p>
                  {current.data.accounts} account records ·{" "}
                  {current.data.pendingPrivacy} privacy requests awaiting
                  review.
                </p>
                <div className="admin-controls">
                  {current.data.flags.map((f) => (
                    <article key={f.name}>
                      <div>
                        <strong>
                          {f.name === "proCalls"
                            ? "Masked calls"
                            : label(f.name)}
                        </strong>
                        <p>
                          <span className="care-status">
                            {f.enabled ? "Enabled" : "Paused"}
                          </span>{" "}
                          · Version {f.version}
                        </p>
                        {!f.enabled && f.name !== "revision" && (
                          <small>
                            Activation is blocked until reviewed
                            provider/release evidence exists.
                          </small>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        disabled={
                          !!selected || (!f.enabled && f.name !== "revision")
                        }
                        onClick={() => setSelected({ kind: "flag", item: f })}
                      >
                        {f.enabled ? "Review pause" : "Review enable"} {f.name}
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
              <section className="care-card">
                <h3>Regional supply snapshot</h3>
                <p>
                  Recorded teacher profile statuses, grouped by region. Approval
                  status alone does not prove current screening, available
                  capacity or a qualified pilot supply.
                </p>
                {current.data.supply.length ? (
                  <ul className="admin-supply">
                    {current.data.supply.map((r) => (
                      <li key={r.region + r.status}>
                        <strong>{r.region}</strong>
                        <span>
                          {label(r.status)} · {r.count} profiles
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No supply records.</p>
                )}
                <small>
                  Up to {current.data.supplyLimit} region/status groups. Region
                  and service configuration changes remain pending.
                </small>
              </section>
              <section className="care-card">
                <h3>Current commercial rules</h3>
                <p>
                  Read-only examples from the code's current pricing functions.
                  Accepted terms remain immutable; policy editing, history and
                  rollback require the separate configuration workflow.
                </p>
                <div className="admin-policy">
                  <div>
                    <h4>Placement fee examples</h4>
                    <ul>
                      {current.data.commercial.placementExamples.map((p) => (
                        <li key={p.monthlyPaise}>
                          {money(p.monthlyPaise)} monthly tuition →{" "}
                          {money(p.feePaise)} platform fee
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Revision prices</h4>
                    <ul>
                      {current.data.commercial.revisionPrices.map((p) => (
                        <li key={p.minutes}>
                          {p.minutes} minutes · {money(p.amountPaise)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
              <section className="care-card">
                <h3>Integration and release state</h3>
                <p>
                  These are configured modes, not uptime checks or
                  qualification. Current live adapters remain unqualified.
                </p>
                <ul>
                  {current.data.integrations.map((i) => (
                    <li key={i.name}>
                      {i.name}: {label(i.mode)}
                    </li>
                  ))}
                </ul>
                <Notice error>
                  Live release: {label(current.data.release.status)}. Provider
                  qualification:{" "}
                  {label(current.data.release.providerQualification)}. This
                  console cannot override the release verifier.
                </Notice>
              </section>
              <section className="care-card">
                <h3>Specialist workspaces</h3>
                <div className="care-actions">
                  <Link href="/dashboard/review">
                    Teacher screening & private evidence
                  </Link>
                  <Link href="/dashboard/matching">Matching & publication</Link>
                  <Link href="/dashboard/support">Support & disputes</Link>
                  <Link href="/dashboard/reports">
                    Operational reports & cohorts
                  </Link>
                  <Link href="/dashboard/finance">
                    Finance & recorded obligations
                  </Link>
                </div>
              </section>
            </>
          )}
          {selected?.kind === "flag" && (
            <AdminDecision
              key={selected.item.name}
              action={{
                kind: "flag",
                item:
                  current.data?.flags.find(
                    (f) => f.name === selected.item.name,
                  ) || selected.item,
              }}
              session={session}
              refresh={refresh}
              onClose={() => setSelected(null)}
            />
          )}
        </TabsContent>
        <TabsContent value="people">
          <People session={session} />
        </TabsContent>
        <TabsContent value="privacy">
          <PrivacyReview
            session={session}
            selected={selected?.kind === "privacy" ? selected : null}
            select={(a) => setSelected(a)}
          />
        </TabsContent>
        <TabsContent value="recovery">
          <Recovery
            session={session}
            selected={
              selected && ["job", "replay"].includes(selected.kind)
                ? selected
                : null
            }
            select={(a) => setSelected(a)}
          />
        </TabsContent>
        <TabsContent value="audit">
          <AuditHistory session={session} />
        </TabsContent>
      </Tabs>
      <small className="care-help">
        Sensitive account grants, impersonation and arbitrary database edits are
        unavailable. B2/B3 retain staff approval/provisioning and commercial
        configuration work. Live provider delivery, backup restore and
        operational release acceptance remain separate.
      </small>
    </div>
  );
}
function People({ session }: { session: Session }) {
  const [role, setRole] = useState(""),
    [draft, setDraft] = useState(""),
    [id, setId] = useState(""),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["admin-accounts", session.account.id, role, id],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["AdminAccountList"]>(
        `/admin/accounts?${new URLSearchParams({ limit: "20", ...(role ? { role } : {}), ...(id ? { id } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const detail = useQuery({
    queryKey: ["admin-linkage", session.account.id, selected],
    queryFn: ({ signal }) =>
      api<components["schemas"]["AdminLinkage"]>(
        `/admin/accounts/${selected}/linkage`,
        { signal },
      ),
    enabled: !!selected,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <>
      <section className="care-card">
        <h3>People & supervised linkage</h3>
        <p>
          Minimal account status and supervised learner/teacher links. Contact
          details, notes, feedback, session credentials and impersonation are
          excluded.
        </p>
        <form
          className="care-fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() && !uuid.test(draft.trim())) {
              setError("Enter a complete account UUID.");
              return;
            }
            setError("");
            setId(draft.trim());
            setSelected("");
          }}
        >
          <div>
            <label htmlFor="admin-role">Account role</label>
            <select
              id="admin-role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setSelected("");
              }}
            >
              <option value="">All roles</option>
              {[
                "GUARDIAN",
                "STUDENT",
                "TEACHER",
                "OPERATOR",
                "REVIEWER",
                "FINANCE",
                "ADMIN",
              ].map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="admin-account-id">
              Exact account ID (optional)
            </label>
            <Input
              id="admin-account-id"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <Button type="submit">Apply account ID</Button>
        </form>
        {error && <Notice error>{error}</Notice>}
        {list.isPending && <p role="status">Loading account directory…</p>}
        {list.error && (
          <Notice error>
            Account directory unavailable.{" "}
            <Button variant="outline" onClick={() => list.refetch()}>
              Retry account directory
            </Button>
          </Notice>
        )}
        {!list.isPending &&
          !list.error &&
          !list.data?.pages.some((p) => p.items.length) && (
            <p>No accounts match these filters.</p>
          )}
        <div className="admin-controls">
          {list.data?.pages
            .flatMap((p) => p.items)
            .map((a) => (
              <article key={a.id}>
                <div>
                  <strong>{a.name}</strong>
                  <p>
                    {label(a.role)} · {a.region} ·{" "}
                    {a.disabled ? "Disabled" : "Enabled"} ·{" "}
                    {a.verified ? "Verified" : "Unverified"}
                  </p>
                  <small>{a.id}</small>
                </div>
                <Button
                  variant="outline"
                  disabled={!!list.error}
                  aria-pressed={selected === a.id}
                  onClick={() => setSelected(a.id)}
                >
                  Inspect linkage {a.id.slice(0, 8)}
                </Button>
              </article>
            ))}
        </div>
        {list.hasNextPage && (
          <Button
            variant="outline"
            disabled={list.isFetching}
            onClick={() => list.fetchNextPage()}
          >
            Load more accounts
          </Button>
        )}
      </section>
      {selected && (
        <section className="care-card">
          <h3>Recorded account linkage</h3>
          {detail.isPending && <p role="status">Loading supervised linkage…</p>}
          {detail.error && (
            <Notice error>
              Linkage unavailable.{" "}
              <Button variant="outline" onClick={() => detail.refetch()}>
                Retry account linkage
              </Button>
            </Notice>
          )}
          {detail.data && !detail.error && (
            <>
              <p>
                {detail.data.account.name} · {detail.data.account.id}
              </p>
              {detail.data.children.length ? (
                <ul>
                  {detail.data.children.map((c) => (
                    <li key={c.id}>
                      {c.alias} · Class {c.grade}, {c.board}
                      <p>
                        Learner {c.id}
                        <br />
                        Guardian {c.guardianId}
                        <br />
                        {c.studentAccountId
                          ? `Student ${c.studentAccountId} · ${c.studentAccessRevokedAt ? "Access revoked" : "Access link recorded; consent must also remain active"}`
                          : "No student account link"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No guardian/student learner links recorded.</p>
              )}
              {detail.data.teacher && (
                <p>
                  Teacher {detail.data.teacher.id} ·{" "}
                  {label(detail.data.teacher.status)} ·{" "}
                  {detail.data.teacher.region} · Profile revision{" "}
                  {detail.data.teacher.profileRevision}
                </p>
              )}
              <small>
                Latest {detail.data.limit} linkage records. Staff grants,
                verification and account changes require their separate approved
                workflow.
              </small>
            </>
          )}
        </section>
      )}
    </>
  );
}
function PrivacyReview({
  session,
  selected,
  select,
}: {
  session: Session;
  selected: Extract<Action, { kind: "privacy" }> | null;
  select: (a: Action | null) => void;
}) {
  const [status, setStatus] = useState("PENDING");
  const list = useInfiniteQuery({
    queryKey: ["admin-privacy", session.account.id, status],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["AdminPrivacyQueue"]>(
        `/admin/privacy-requests?${new URLSearchParams({ status, limit: "20", ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) || [];
  async function refresh() {
    const q = await list.refetch();
    if (q.error) throw q.error;
  }
  return (
    <>
      <section className="care-card">
        <h3>Private correction & deletion review</h3>
        <p>
          Review the recorded request and policy before acting. Rejecting a
          deletion request does not automatically restore consent, student
          access or teacher approval.
        </p>
        <label htmlFor="admin-privacy-status">Privacy request status</label>
        <select
          id="admin-privacy-status"
          value={status}
          disabled={!!selected}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["PENDING", "COMPLETED", "REJECTED"].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        {list.isPending && <p role="status">Loading privacy requests…</p>}
        {list.error && (
          <Notice error>
            Privacy queue unavailable.{" "}
            <Button
              variant="outline"
              disabled={!!selected}
              onClick={() => list.refetch()}
            >
              Retry privacy queue
            </Button>
          </Notice>
        )}
        {!list.isPending && !list.error && !rows.length && (
          <p>No privacy requests in this status.</p>
        )}
        <div className="admin-controls">
          {rows.map((p) => (
            <article key={p.id}>
              <div>
                <span className="care-status">{label(p.status)}</span>
                <h4>
                  {label(p.kind)} · {label(p.scope)}
                </h4>
                <p>{p.reason}</p>
                <small>
                  {p.id} · Version {p.version} · {when(p.createdAt)} IST
                </small>
                {p.resolution && (
                  <p>
                    Recorded outcome: {p.resolution} · Policy {p.policyVersion}
                  </p>
                )}
                {p.accountId === session.account.id && (
                  <p>Another administrator must review your request.</p>
                )}
              </div>
              <Button
                variant="outline"
                disabled={
                  !!selected ||
                  !!list.error ||
                  p.status !== "PENDING" ||
                  p.accountId === session.account.id
                }
                onClick={() => select({ kind: "privacy", item: p })}
              >
                Review privacy request {p.id.slice(0, 8)}
              </Button>
            </article>
          ))}
        </div>
        {list.hasNextPage && (
          <Button
            variant="outline"
            disabled={!!selected || list.isFetching}
            onClick={() => list.fetchNextPage()}
          >
            Load more privacy requests
          </Button>
        )}
      </section>
      {selected && (
        <AdminDecision
          key={selected.item.id}
          action={{
            kind: "privacy",
            item: rows.find((p) => p.id === selected.item.id) || selected.item,
          }}
          available={rows.some(
            (p) => p.id === selected.item.id && p.status === "PENDING",
          )}
          session={session}
          refresh={refresh}
          onClose={() => select(null)}
        />
      )}
    </>
  );
}
function Recovery({
  session,
  selected,
  select,
}: {
  session: Session;
  selected: Action | null;
  select: (a: Action | null) => void;
}) {
  const [status, setStatus] = useState("FAILED");
  const jobs = useQuery({
    queryKey: ["admin-jobs", session.account.id, status],
    queryFn: ({ signal }) =>
      api<components["schemas"]["JobQueue"]>(`/admin/jobs?status=${status}`, {
        signal,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const ledger = useInfiniteQuery({
    queryKey: ["admin-ledger", session.account.id],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["DeletionLedger"]>(
        `/admin/privacy/deletion-ledger${pageParam ? "?cursor=" + pageParam : ""}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const a = await jobs.refetch();
    if (a.error) throw a.error;
    const b = await ledger.refetch();
    if (b.error) throw b.error;
  }
  const ledgerRows = ledger.data?.pages.flatMap((p) => p.items) || [];
  const current =
    selected?.kind === "job"
      ? {
          kind: "job" as const,
          item:
            jobs.data?.items.find((j) => j.id === selected.item.id) ||
            selected.item,
        }
      : selected?.kind === "replay"
        ? {
            kind: "replay" as const,
            item:
              ledgerRows.find((r) => r.id === selected.item.id) ||
              selected.item,
          }
        : null;
  return (
    <>
      <section className="care-card">
        <h3>Recovery queue</h3>
        <p>
          Sanitized oldest-50 unprocessed jobs. Only exhausted private
          scan/deletion jobs have this reviewed retry; payment, meeting and
          delivery jobs require their dedicated recovery workflow. A queued
          retry does not prove processing.
        </p>
        <label htmlFor="admin-job-status">Recovery job filter</label>
        <select
          id="admin-job-status"
          value={status}
          disabled={!!selected}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="FAILED">Exhausted attempts</option>
          <option value="PENDING">All unprocessed (including exhausted)</option>
        </select>
        {jobs.isPending && <p role="status">Loading recovery jobs…</p>}
        {jobs.error && (
          <Notice error>
            Recovery jobs unavailable.{" "}
            <Button
              variant="outline"
              disabled={!!selected}
              onClick={() => jobs.refetch()}
            >
              Retry recovery queue
            </Button>
          </Notice>
        )}
        {jobs.data && !jobs.error && !jobs.data.items.length && (
          <p>No recovery jobs in this filter.</p>
        )}
        <div className="admin-controls">
          {jobs.data?.items.map((j) => (
            <article key={j.id}>
              <div>
                <strong>{label(j.type)}</strong>
                <p>
                  {j.attempts} attempts · {when(j.createdAt)} IST
                </p>
                <small>
                  Job {j.id} · Resource {j.aggregateId}
                </small>
              </div>
              <Button
                variant="outline"
                disabled={
                  !!selected ||
                  !!jobs.error ||
                  j.attempts < 5 ||
                  j.attempts > 50 ||
                  ![
                    "evidence.scan_requested",
                    "privacy.evidence_delete_requested",
                  ].includes(j.type)
                }
                onClick={() => select({ kind: "job", item: j })}
              >
                Review retry {j.id.slice(0, 8)}
              </Button>
            </article>
          ))}
        </div>
      </section>
      <section className="care-card">
        <h3>Backup deletion replay ledger</h3>
        <p>
          Immutable deletion markers preserve policy and retention exceptions.
          Replay after a separately verified restore to reapply application
          scrubbing. This does not perform or qualify a backup restore, erase
          external backups or verify private-file delivery.
        </p>
        {ledger.isPending && <p role="status">Loading deletion ledger…</p>}
        {ledger.error && (
          <Notice error>
            Deletion ledger unavailable.{" "}
            <Button
              variant="outline"
              disabled={!!selected}
              onClick={() => ledger.refetch()}
            >
              Retry deletion ledger
            </Button>
          </Notice>
        )}
        {!ledger.isPending && !ledger.error && !ledgerRows.length && (
          <p>No deletion markers recorded.</p>
        )}
        <div className="admin-controls">
          {ledgerRows.map((r) => (
            <article key={r.id}>
              <div>
                <strong>
                  {label(r.scope)} · {r.id}
                </strong>
                <p>
                  Policy {r.policyVersion} · {r.retentionReason}
                </p>
                <small>{when(r.createdAt)} IST</small>
              </div>
              <Button
                variant="outline"
                disabled={!!selected || !!ledger.error}
                onClick={() => select({ kind: "replay", item: r })}
              >
                Review replay {r.id.slice(0, 8)}
              </Button>
            </article>
          ))}
        </div>
        {ledger.hasNextPage && (
          <Button
            variant="outline"
            disabled={!!selected || ledger.isFetching}
            onClick={() => ledger.fetchNextPage()}
          >
            Load more deletion markers
          </Button>
        )}
      </section>
      {current && (
        <AdminDecision
          key={current.item.id}
          action={current}
          available={
            current.kind !== "job" ||
            !!jobs.data?.items.some(
              (j) =>
                j.id === current.item.id && j.attempts >= 5 && j.attempts <= 50,
            )
          }
          session={session}
          refresh={refresh}
          onClose={() => select(null)}
        />
      )}
    </>
  );
}
function AuditHistory({ session }: { session: Session }) {
  const [draft, setDraft] = useState(""),
    [action, setAction] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["admin-audit", session.account.id, action],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["AdminAuditList"]>(
        `/admin/audit?${new URLSearchParams({ limit: "20", ...(action ? { action } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <section className="care-card">
      <h3>Append-only audit history</h3>
      <p>
        Recorded actions, resources and reasons. Raw before/after payloads and
        actor credentials are excluded. Reads are audited too.
      </p>
      <form
        className="care-fields"
        onSubmit={(e) => {
          e.preventDefault();
          setAction(draft.trim());
        }}
      >
        <div>
          <label htmlFor="admin-audit-action">
            Exact audit action (optional)
          </label>
          <Input
            id="admin-audit-action"
            value={draft}
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <Button type="submit">Apply audit action</Button>
      </form>
      {list.isPending && <p role="status">Loading audit history…</p>}
      {list.error && (
        <Notice error>
          Audit history unavailable.{" "}
          <Button variant="outline" onClick={() => list.refetch()}>
            Retry audit history
          </Button>
        </Notice>
      )}
      {!list.isPending &&
        !list.error &&
        !list.data?.pages.some((p) => p.items.length) && (
          <p>No audit records match this action.</p>
        )}
      <ol className="admin-audit">
        {list.data?.pages
          .flatMap((p) => p.items)
          .map((a) => (
            <li key={a.id}>
              <strong>{label(a.action)}</strong>
              <p>{a.reason}</p>
              <small>
                Resource {a.aggregateId} · {when(a.createdAt)} IST
              </small>
            </li>
          ))}
      </ol>
      {list.hasNextPage && (
        <Button
          variant="outline"
          disabled={list.isFetching}
          onClick={() => list.fetchNextPage()}
        >
          Load earlier audit records
        </Button>
      )}
    </section>
  );
}
function AdminDecision({
  action,
  session,
  refresh,
  onClose,
  available = true,
}: {
  action: Action;
  session: Session;
  refresh: () => Promise<void>;
  onClose: () => void;
  available?: boolean;
}) {
  const [choice, setChoice] = useState(""),
    [reason, setReason] = useState(""),
    [policy, setPolicy] = useState(""),
    [retention, setRetention] = useState(""),
    [restore, setRestore] = useState(""),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    [saved, setSaved] = useState(false),
    [flagTarget] = useState(
      action.kind === "flag" ? !action.item.enabled : false,
    ),
    sending = useRef(false);
  const identity = action.kind === "flag" ? action.item.name : action.item.id;
  const decision = useDecision(session, refresh, (value) => {
    if (!value || typeof value !== "object") return false;
    if (action.kind === "flag")
      return (
        "name" in value &&
        value.name === identity &&
        "version" in value &&
        typeof value.version === "number" &&
        value.version > 0 &&
        "enabled" in value &&
        value.enabled === flagTarget
      );
    if (action.kind === "replay")
      return (
        "deletionRecordId" in value &&
        value.deletionRecordId === identity &&
        "status" in value &&
        value.status === "REPLAYED"
      );
    return "id" in value && value.id === identity;
  });
  const title =
    action.kind === "flag"
      ? "Review feature change"
      : action.kind === "privacy"
        ? "Review privacy decision"
        : action.kind === "job"
          ? "Review recovery retry"
          : "Review deletion replay";
  function operation() {
    const trimmed = reason.trim();
    if (
      !available ||
      !trimmed ||
      trimmed.length >
        (action.kind === "privacy" || action.kind === "replay" ? 1000 : 500)
    ) {
      decision.invalid(
        "Load the current record and add a reason within its limit.",
      );
      return null;
    }
    if (action.kind === "flag" && action.item.enabled === flagTarget) {
      decision.invalid(
        "This flag already matches your intended state. Discard this draft and inspect the current control.",
      );
      return null;
    }
    if (action.kind === "flag")
      return {
        path: `/admin/flags/${identity}`,
        body: {
          enabled: flagTarget,
          expectedVersion: action.item.version,
          reason: trimmed,
          confirmed: true,
        },
      };
    if (action.kind === "job")
      return {
        path: `/admin/jobs/${identity}/retries`,
        body: {
          expectedAttempts: action.item.attempts,
          reason: trimmed,
          confirmed: true,
        },
      };
    if (action.kind === "replay") {
      if (!restore.trim()) {
        decision.invalid("Record the separately verified restore reference.");
        return null;
      }
      return {
        path: `/admin/privacy/deletion-ledger/${identity}/replays`,
        body: {
          restoreReference: restore.trim(),
          reason: trimmed,
          confirmed: true,
        },
      };
    }
    if (
      !choice ||
      !policy.trim() ||
      (choice === "FULFIL" &&
        action.item.kind === "DELETION" &&
        !retention.trim())
    ) {
      decision.invalid(
        "Choose a decision, record its policy and the deletion retention exception when fulfilling.",
      );
      return null;
    }
    return {
      path: `/admin/privacy-requests/${identity}/reviews`,
      body: {
        expectedVersion: action.item.version,
        action: choice,
        reason: trimmed,
        policyVersion: policy.trim(),
        ...(choice === "FULFIL" && action.item.kind === "DELETION"
          ? { retentionReason: retention.trim() }
          : {}),
        confirmed: true,
      },
    };
  }
  async function save() {
    if (decision.locked || sending.current || !agreed) return;
    const op = operation();
    if (!op) return;
    sending.current = true;
    try {
      await decision.run({
        ...op,
        message:
          action.kind === "job"
            ? "Retry queued; worker processing is not confirmed."
            : action.kind === "replay"
              ? "Application deletion replay recorded; external backups and private files remain separate."
              : "Reviewed decision recorded.",
        onSaved: () => {
          setSaved(true);
          setReview(false);
          setAgreed(false);
        },
      });
    } finally {
      sending.current = false;
    }
  }
  return (
    <section className="care-card care-editor">
      <h3>{title}</h3>
      <p>
        Record {identity}
        {"version" in action.item ? ` · Version ${action.item.version}` : ""}
      </p>
      {action.kind === "privacy" && (
        <>
          <p>
            Account {action.item.accountId} · {label(action.item.scope)}{" "}
            {action.item.resourceId}
          </p>
          <p>Owner request: {action.item.reason}</p>
          {action.item.correction && (
            <p>Proposed correction: {action.item.correction}</p>
          )}
          <Notice>
            {action.item.kind === "DELETION"
              ? "Deletion scrubs the selected scope while retaining financial, learning, safety and audit evidence under the recorded exception. Private-file processing and backup replay remain separate. Rejection does not restore paused consent or approval."
              : action.item.scope === "NOTE"
                ? "Fulfilment applies the recorded note correction, returns the note to private and clears previous acknowledgement. Rejection records the assessment without applying the proposed correction."
                : "Fulfilment applies the recorded name correction in its owned scope. Verification, consent and approval remain separate; rejection leaves the proposed correction unapplied."}
          </Notice>
        </>
      )}
      {action.kind === "flag" && (
        <Notice>
          {flagTarget ? "Enable" : "Pause"} {action.item.name}. Existing
          financial/service evidence is preserved. This does not authorize a
          production cohort or override the release gate.
        </Notice>
      )}
      {action.kind === "job" && (
        <Notice>
          Retry {action.item.type} for resource {action.item.aggregateId}. The
          server rechecks its current private-media state. Payment, meeting and
          notification recovery are not performed by this action.
        </Notice>
      )}
      {action.kind === "replay" && (
        <Notice>
          Reapply application scrubbing for {label(action.item.scope)}{" "}
          {action.item.resourceId}. Retention policy {action.item.policyVersion}
          : {action.item.retentionReason}. Restore validation and
          external-backup erasure are separate.
        </Notice>
      )}
      {!available && !saved && (
        <Notice error>
          This record is no longer actionable in the current queue. Close this
          review and inspect its recorded outcome.
        </Notice>
      )}
      {decision.error && <Notice error>{decision.error}</Notice>}
      {decision.success && <Notice>{decision.success}</Notice>}
      {!saved && !review && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (decision.locked) return;
            if (operation()) {
              setReview(true);
              setAgreed(false);
            }
          }}
        >
          <fieldset disabled={decision.locked || !available}>
            {action.kind === "privacy" && (
              <>
                <div>
                  <label htmlFor="admin-decision">Privacy decision</label>
                  <select
                    id="admin-decision"
                    value={choice}
                    onChange={(e) => setChoice(e.target.value)}
                  >
                    <option value="">Choose after reviewing</option>
                    <option value="FULFIL">Fulfil request</option>
                    <option value="REJECT">Reject with recorded reason</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="admin-policy">Reviewed policy version</label>
                  <Input
                    id="admin-policy"
                    value={policy}
                    maxLength={100}
                    onChange={(e) => setPolicy(e.target.value)}
                  />
                </div>
                {choice === "FULFIL" && action.item.kind === "DELETION" && (
                  <div>
                    <label htmlFor="admin-retention">
                      Approved retention exception
                    </label>
                    <Input
                      id="admin-retention"
                      value={retention}
                      maxLength={1000}
                      onChange={(e) => setRetention(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
            {action.kind === "replay" && (
              <div>
                <label htmlFor="admin-restore">
                  Verified restore reference
                </label>
                <Input
                  id="admin-restore"
                  value={restore}
                  maxLength={200}
                  onChange={(e) => setRestore(e.target.value)}
                />
              </div>
            )}
            <div>
              <label htmlFor="admin-reason">Reason for this decision</label>
              <Input
                id="admin-reason"
                value={reason}
                maxLength={
                  action.kind === "privacy" || action.kind === "replay"
                    ? 1000
                    : 500
                }
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button type="submit">Review effects and reason</Button>
          </fieldset>
        </form>
      )}
      {!saved && review && (
        <>
          <div className="care-review">
            <p>{reason}</p>
            {action.kind === "privacy" && (
              <p>
                Decision: {label(choice)} · Policy {policy}
                {retention ? ` · Retention exception: ${retention}` : ""}
              </p>
            )}
            {action.kind === "replay" && (
              <p>Verified restore reference: {restore}</p>
            )}
            <label className="care-check">
              <input
                type="checkbox"
                checked={agreed}
                disabled={decision.locked}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              I reviewed this evidence, reason and effects, and want to record
              this decision.
            </label>
          </div>
          <div className="care-actions">
            <Button
              variant="outline"
              disabled={decision.locked}
              onClick={() => {
                setReview(false);
                setAgreed(false);
              }}
            >
              Back to decision details
            </Button>
            <Button
              disabled={decision.locked || !agreed || !available}
              onClick={save}
            >
              Confirm reviewed decision
            </Button>
          </div>
        </>
      )}
      {decision.uncertain && (
        <Button disabled={decision.busy} onClick={() => decision.run()}>
          Retry identical administrator decision
        </Button>
      )}
      {decision.conflict && (
        <Button
          disabled={decision.busy}
          onClick={async () => {
            await decision.reload();
            setReview(false);
            setAgreed(false);
          }}
        >
          Refresh administrator review
        </Button>
      )}
      <div className="care-actions">
        {!saved && !decision.conflict && (
          <Button
            variant="outline"
            disabled={decision.busy || decision.uncertain}
            onClick={async () => {
              await decision.reload();
              setReview(false);
              setAgreed(false);
            }}
          >
            Reload current decision record
          </Button>
        )}
        <Button variant="outline" disabled={decision.locked} onClick={onClose}>
          {saved ? "Close recorded decision" : "Discard decision draft"}
        </Button>
      </div>
    </section>
  );
}
