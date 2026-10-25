"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { CommercialConfiguration } from "./commercial-configuration";
import { StaffAdministration } from "./staff-administration";
import { useHistory, HistoryPages } from "./history";
import { useAppTranslation } from "./locale";
import { educationLabel } from "./learner-education";
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
import { Notice, Feedback, useDecision } from "./tuition-workflow";
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
const label = (v: string) =>
  v === "guardian-evidence.scan_requested"
    ? "Guardian report scan"
    : v === "privacy.guardian_evidence_delete_requested"
      ? "Guardian report deletion"
      : v.toLowerCase().replaceAll("_", " ");
const when = (v: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
const money = (v: number, locale = "en-IN") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(v / 100);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function AdminConsole({ session }: { session: Session }) {
  const { appText, appError, appLocale } = useAppTranslation();

  if (session.account.role !== "ADMIN")
    return (
      <Notice error>
        {appText("Administrator access is required for this console.")}
      </Notice>
    );
  return <ConsoleWorkspace session={session} />;
}
function ConsoleWorkspace({ session }: { session: Session }) {
  const { appText, appError, appLocale } = useAppTranslation();

  const [staffLocked, setStaffLocked] = useState(false);
  const [commercialLocked, setCommercialLocked] = useState(false);
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
        <h2>{appText("Make every decision traceable.")}</h2>
        <p>
          {appText(
            "Inspect supervised account links, review privacy decisions and recover permitted work. Every change needs a reason and a current record.",
          )}{" "}
        </p>
      </section>
      <Link href="/guardian-verification" className="inline-link">
        {appText("Review guardian relationships")}
      </Link>
      <Notice>
        {appText(
          "Private administrator workspace. Staff access, hiring fee and coverage changes require independent review. Live release retains its separate qualification requirements.",
        )}{" "}
      </Notice>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (!selected && !staffLocked && !commercialLocked) setTab(v);
        }}
      >
        <TabsList
          className="care-tabs"
          aria-label={appText("Administrator workspaces")}
        >
          {[
            ["overview", "Overview & controls"],
            ["people", "People & linkage"],
            ["staff", "Staff access"],
            ["commercial", "Fees & coverage"],
            ["privacy", "Privacy review"],
            ["recovery", "Recovery & backups"],
            ["audit", "Audit history"],
          ].map(([v, n]) => (
            <TabsTrigger
              key={v}
              value={v}
              disabled={!!selected || staffLocked || commercialLocked}
            >
              {appText(n)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="commercial">
          <CommercialConfiguration
            session={session}
            onLockChange={setCommercialLocked}
          />
        </TabsContent>
        <TabsContent value="staff">
          <StaffAdministration
            session={session}
            onLockChange={setStaffLocked}
          />
        </TabsContent>
        <TabsContent value="overview">
          {current.isPending && (
            <p role="status">{appText("Loading console state…")}</p>
          )}
          {current.error && (
            <Notice error>
              {appText("Console state could not be loaded.")}{" "}
              <Button
                variant="outline"
                disabled={!!selected}
                onClick={() => current.refetch()}
              >
                {appText("Retry console state")}{" "}
              </Button>
            </Notice>
          )}
          {current.data && !current.error && (
            <>
              <section className="care-card">
                <h3>{appText("Feature controls")}</h3>
                <p>
                  {appText("Recorded")} {when(current.data.asOf, appLocale)}{" "}
                  {appText("IST. Mode:")} {appText(label(current.data.mode))}
                  {appText(
                    ". A flag change does not authorize release or prove provider readiness.",
                  )}{" "}
                </p>
                <p>
                  {current.data.accounts} {appText("account records ·")}{" "}
                  {current.data.pendingPrivacy}{" "}
                  {appText("privacy requests awaiting review.")}{" "}
                </p>
                <div className="admin-controls">
                  {current.data.flags.map((f) => (
                    <article key={f.name}>
                      <div>
                        <strong>
                          {f.name === "proCalls"
                            ? appText("Masked calls")
                            : appText(label(f.name))}
                        </strong>
                        <p>
                          <span className="care-status">
                            {f.enabled ? appText("Enabled") : appText("Paused")}
                          </span>{" "}
                          {appText("· Version")} {f.version}
                        </p>
                        {!f.enabled && f.name !== "revision" && (
                          <small>
                            {appText(
                              "Activation is blocked until reviewed provider/release evidence exists.",
                            )}{" "}
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
                        {f.enabled
                          ? appText("Review pause")
                          : appText("Review enable")}{" "}
                        {appText(f.name)}
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
              <section className="care-card">
                <h3>{appText("Regional supply snapshot")}</h3>
                <p>
                  {appText(
                    "Recorded teacher profile statuses, grouped by region. Approval status alone does not prove current screening, available capacity or a qualified pilot supply.",
                  )}{" "}
                </p>
                {current.data.supply.length ? (
                  <ul className="admin-supply">
                    {current.data.supply.map((r) => (
                      <li key={r.region + r.status}>
                        <strong>{r.region}</strong>
                        <span>
                          {appText(label(r.status))} · {r.count}{" "}
                          {appText("profiles")}{" "}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{appText("No supply records.")}</p>
                )}
                <small>
                  {appText("Up to")} {current.data.supplyLimit}{" "}
                  {appText(
                    "region/status groups. Region and service configuration changes remain pending.",
                  )}{" "}
                </small>
              </section>
              <section className="care-card">
                <h3>{appText("Current commercial rules")}</h3>
                <p>
                  {appText(
                    "Read-only examples from the code's current pricing functions. Accepted terms remain immutable; policy editing, history and rollback require the separate configuration workflow.",
                  )}{" "}
                </p>
                <div className="admin-policy">
                  <div>
                    <h4>{appText("Placement fee examples")}</h4>
                    <ul>
                      {current.data.commercial.placementExamples.map((p) => (
                        <li key={p.monthlyPaise}>
                          {money(p.monthlyPaise, appLocale)}{" "}
                          {appText("monthly tuition →")}{" "}
                          {money(p.feePaise, appLocale)}{" "}
                          {appText("platform fee")}{" "}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>{appText("Revision prices")}</h4>
                    <ul>
                      {current.data.commercial.revisionPrices.map((p) => (
                        <li key={p.minutes}>
                          {p.minutes} {appText("minutes ·")}{" "}
                          {money(p.amountPaise, appLocale)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
              <section className="care-card">
                <h3>{appText("Integration and release state")}</h3>
                <p>
                  {appText(
                    "These are configured modes, not uptime checks or qualification. Current live adapters remain unqualified.",
                  )}{" "}
                </p>
                <ul>
                  {current.data.integrations.map((i) => (
                    <li key={i.name}>
                      {i.name}: {appText(label(i.mode))}
                    </li>
                  ))}
                </ul>
                <Notice error>
                  {appText("Live release:")}{" "}
                  {appText(label(current.data.release.status))}
                  {appText(". Provider qualification:")}{" "}
                  {appText(label(current.data.release.providerQualification))}
                  {appText(
                    ". This console cannot override the release verifier.",
                  )}{" "}
                </Notice>
              </section>
              <section className="care-card">
                <h3>{appText("Specialist workspaces")}</h3>
                <div className="care-actions">
                  <Link href="/dashboard/review">
                    {appText("Teacher screening & private evidence")}{" "}
                  </Link>
                  <Link href="/dashboard/matching">
                    {appText("Matching & publication")}
                  </Link>
                  <Link href="/dashboard/support">
                    {appText("Support & disputes")}
                  </Link>
                  <Link href="/dashboard/reports">
                    {appText("Operational reports & cohorts")}{" "}
                  </Link>
                  <Link href="/dashboard/finance">
                    {appText("Finance & recorded obligations")}{" "}
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
              readError={!!current.error}
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
        {appText(
          "Use Staff access and Fees & coverage for independently reviewed changes. Live provider delivery, backup restore and operational release acceptance remain separate.",
        )}{" "}
      </small>
    </div>
  );
}
function People({ session }: { session: Session }) {
  const { appText, appError, appLocale } = useAppTranslation();

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
  const detail = useHistory<components["schemas"]["AdminLinkage"]>({
    queryKey: ["admin-linkage", session.account.id, selected],
    path: `/admin/accounts/${selected}/linkage`,
    enabled: !!selected,
    arrayKeys: ["children"],
  });
  return (
    <>
      <section className="care-card">
        <h3>{appText("People & supervised linkage")}</h3>
        <p>
          {appText(
            "Minimal account status and supervised learner/teacher links. Contact details, notes, feedback, session credentials and impersonation are excluded.",
          )}{" "}
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
            <label htmlFor="admin-role">{appText("Account role")}</label>
            <select
              id="admin-role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setSelected("");
              }}
            >
              <option value="">{appText("All roles")}</option>
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
                  {appText(label(r))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="admin-account-id">
              {appText("Exact account ID (optional)")}{" "}
            </label>
            <Input
              id="admin-account-id"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <Button type="submit">{appText("Apply account ID")}</Button>
        </form>
        {error && <Notice error>{appError(error)}</Notice>}
        {list.isPending && (
          <p role="status">{appText("Loading account directory…")}</p>
        )}
        {list.error && (
          <Notice error>
            {appText("Account directory unavailable.")}{" "}
            <Button variant="outline" onClick={() => list.refetch()}>
              {appText("Retry account directory")}{" "}
            </Button>
          </Notice>
        )}
        {!list.isPending &&
          !list.error &&
          !list.data?.pages.some((p) => p.items.length) && (
            <p>{appText("No accounts match these filters.")}</p>
          )}
        <div className="admin-controls">
          {!list.error &&
            list.data?.pages
              .flatMap((p) => p.items)
              .map((a) => (
                <article key={a.id}>
                  <div>
                    <strong>{a.name}</strong>
                    <p>
                      {appText(label(a.role))} · {a.region} ·{" "}
                      {a.disabled ? appText("Disabled") : appText("Enabled")} ·{" "}
                      {a.verified ? appText("Verified") : appText("Unverified")}
                    </p>
                    <small>{a.id}</small>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!!list.error}
                    aria-pressed={selected === a.id}
                    onClick={() => setSelected(a.id)}
                  >
                    {appText("Inspect linkage")} {a.id.slice(0, 8)}
                  </Button>
                </article>
              ))}
        </div>
        {!list.error && list.hasNextPage && (
          <Button
            variant="outline"
            disabled={list.isFetching}
            onClick={() => list.fetchNextPage()}
          >
            {appText("Load more accounts")}{" "}
          </Button>
        )}
      </section>
      {selected && (
        <section className="care-card">
          <h3>{appText("Recorded account linkage")}</h3>
          {detail.isPending && (
            <p role="status">{appText("Loading supervised linkage…")}</p>
          )}
          <HistoryPages history={detail} label="Account learner linkage" />
          {detail.error && (
            <Notice error>
              {appText("Linkage unavailable.")}{" "}
              <Button variant="outline" onClick={() => detail.refetch()}>
                {appText("Retry account linkage")}{" "}
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
                      {c.alias} ·{" "}
                      {c.grade === null
                        ? appText(educationLabel(c))
                        : appText("Class {0}, {1}", [c.grade, c.board])}
                      <p>
                        {appText("Learner")} {c.id}
                        <br />
                        {appText("Guardian")} {c.guardianId}
                        <br />
                        {c.studentAccountId
                          ? appText("Student {0} · {1}", [
                              c.studentAccountId,
                              c.studentAccessRevokedAt
                                ? appText("Access revoked")
                                : appText(
                                    "Access link recorded; consent must also remain active",
                                  ),
                            ])
                          : appText("No student account link")}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{appText("No guardian/student learner links recorded.")}</p>
              )}
              {detail.data.teacher && (
                <p>
                  {appText("Teacher")} {detail.data.teacher.id} ·{" "}
                  {appText(label(detail.data.teacher.status))} ·{" "}
                  {detail.data.teacher.region} {appText("· Profile revision")}{" "}
                  {detail.data.teacher.profileRevision}
                </p>
              )}
              <small>
                {appText("Latest")} {detail.data.limit}{" "}
                {appText(
                  "linkage records. Staff grants, verification and account changes require their separate approved workflow.",
                )}{" "}
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
  const { appText, appError, appLocale } = useAppTranslation();

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
  const rows = list.error ? [] : list.data?.pages.flatMap((p) => p.items) || [];
  async function refresh() {
    const q = await list.refetch();
    if (q.error) throw q.error;
  }
  return (
    <>
      <section className="care-card">
        <h3>{appText("Private correction & deletion review")}</h3>
        <p>
          {appText(
            "Review the recorded request and policy before acting. Rejecting a deletion request does not automatically restore consent, student access or teacher approval.",
          )}{" "}
        </p>
        <label htmlFor="admin-privacy-status">
          {appText("Privacy request status")}
        </label>
        <select
          id="admin-privacy-status"
          value={status}
          disabled={!!selected}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["PENDING", "COMPLETED", "REJECTED"].map((s) => (
            <option key={s} value={s}>
              {appText(label(s))}
            </option>
          ))}
        </select>
        {list.isPending && (
          <p role="status">{appText("Loading privacy requests…")}</p>
        )}
        {list.error && (
          <Notice error>
            {appText("Privacy queue unavailable.")}{" "}
            <Button
              variant="outline"
              disabled={!!selected}
              onClick={() => list.refetch()}
            >
              {appText("Retry privacy queue")}{" "}
            </Button>
          </Notice>
        )}
        {!list.isPending && !list.error && !rows.length && (
          <p>{appText("No privacy requests in this status.")}</p>
        )}
        <div className="admin-controls">
          {rows.map((p) => (
            <article key={p.id}>
              <div>
                <span className="care-status">{appText(label(p.status))}</span>
                <h4>
                  {appText(label(p.kind))} · {appText(label(p.scope))}
                </h4>
                <p>{p.reason}</p>
                <small>
                  {p.id} {appText("· Version")} {p.version} ·{" "}
                  {when(p.createdAt, appLocale)} {appText("IST")}{" "}
                </small>
                {p.resolution && (
                  <p>
                    {appText("Recorded outcome:")} {p.resolution}{" "}
                    {appText("· Policy")} {p.policyVersion}
                  </p>
                )}
                {p.accountId === session.account.id && (
                  <p>
                    {appText("Another administrator must review your request.")}
                  </p>
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
                {appText("Review privacy request")} {p.id.slice(0, 8)}
              </Button>
            </article>
          ))}
        </div>
        {!list.error && list.hasNextPage && (
          <Button
            variant="outline"
            disabled={!!selected || list.isFetching}
            onClick={() => list.fetchNextPage()}
          >
            {appText("Load more privacy requests")}{" "}
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
          readError={!!list.error}
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
  const { appText, appError, appLocale } = useAppTranslation();

  const [status, setStatus] = useState("FAILED");
  const jobs = useHistory<components["schemas"]["JobQueue"]>({
    queryKey: ["admin-jobs", session.account.id, status],
    path: `/admin/jobs?status=${status}`,
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
  const ledgerRows = ledger.error
    ? []
    : ledger.data?.pages.flatMap((p) => p.items) || [];
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
        <h3>{appText("Recovery queue")}</h3>
        <p>
          {appText(
            "Sanitized unprocessed jobs, oldest first. Load more records to continue. Only exhausted private scan/deletion jobs have this reviewed retry; payment, meeting and delivery jobs require their dedicated recovery workflow. A queued retry does not prove processing.",
          )}{" "}
        </p>
        <label htmlFor="admin-job-status">
          {appText("Recovery job filter")}
        </label>
        <select
          id="admin-job-status"
          value={status}
          disabled={!!selected}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="FAILED">{appText("Exhausted attempts")}</option>
          <option value="PENDING">
            {appText("All unprocessed (including exhausted)")}
          </option>
        </select>
        {jobs.isPending && (
          <p role="status">{appText("Loading recovery jobs…")}</p>
        )}
        <HistoryPages
          history={jobs}
          label="Recovery jobs"
          disabled={!!selected}
        />
        {jobs.error && (
          <Notice error>
            {appText("Recovery jobs unavailable.")}{" "}
            <Button
              variant="outline"
              disabled={!!selected}
              onClick={() => jobs.refetch()}
            >
              {appText("Retry recovery queue")}{" "}
            </Button>
          </Notice>
        )}
        {jobs.data && !jobs.error && !jobs.data.items.length && (
          <p>{appText("No recovery jobs in this filter.")}</p>
        )}
        <div className="admin-controls">
          {jobs.data?.items.map((j) => (
            <article key={j.id}>
              <div>
                <strong>{appText(label(j.type))}</strong>
                <p>
                  {j.attempts} {appText("attempts ·")}{" "}
                  {when(j.createdAt, appLocale)} {appText("IST")}{" "}
                </p>
                <small>
                  {appText("Job")} {j.id} {appText("· Resource")}{" "}
                  {j.aggregateId}
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
                    "guardian-evidence.scan_requested",
                    "privacy.guardian_evidence_delete_requested",
                  ].includes(j.type)
                }
                onClick={() => select({ kind: "job", item: j })}
              >
                {appText("Review retry")} {j.id.slice(0, 8)}
              </Button>
            </article>
          ))}
        </div>
      </section>
      <section className="care-card">
        <h3>{appText("Backup deletion replay ledger")}</h3>
        <p>
          {appText(
            "Immutable deletion markers preserve policy and retention exceptions. Replay after a separately verified restore to reapply application scrubbing. This does not perform or qualify a backup restore, erase external backups or verify private-file delivery.",
          )}{" "}
        </p>
        {ledger.isPending && (
          <p role="status">{appText("Loading deletion ledger…")}</p>
        )}
        {ledger.error && (
          <Notice error>
            {appText("Deletion ledger unavailable.")}{" "}
            <Button
              variant="outline"
              disabled={!!selected}
              onClick={() => ledger.refetch()}
            >
              {appText("Retry deletion ledger")}{" "}
            </Button>
          </Notice>
        )}
        {!ledger.isPending && !ledger.error && !ledgerRows.length && (
          <p>{appText("No deletion markers recorded.")}</p>
        )}
        <div className="admin-controls">
          {ledgerRows.map((r) => (
            <article key={r.id}>
              <div>
                <strong>
                  {appText(label(r.scope))} · {r.id}
                </strong>
                <p>
                  {appText("Policy")} {r.policyVersion} · {r.retentionReason}
                </p>
                <small>
                  {when(r.createdAt, appLocale)} {appText("IST")}
                </small>
              </div>
              <Button
                variant="outline"
                disabled={!!selected || !!ledger.error}
                onClick={() => select({ kind: "replay", item: r })}
              >
                {appText("Review replay")} {r.id.slice(0, 8)}
              </Button>
            </article>
          ))}
        </div>
        {!ledger.error && ledger.hasNextPage && (
          <Button
            variant="outline"
            disabled={!!selected || ledger.isFetching}
            onClick={() => ledger.fetchNextPage()}
          >
            {appText("Load more deletion markers")}{" "}
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
          readError={current.kind === "job" ? !!jobs.error : !!ledger.error}
          refresh={refresh}
          onClose={() => select(null)}
        />
      )}
    </>
  );
}
function AuditHistory({ session }: { session: Session }) {
  const { appText, appError, appLocale } = useAppTranslation();

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
      <h3>{appText("Append-only audit history")}</h3>
      <p>
        {appText(
          "Recorded actions, resources and reasons. Raw before/after payloads and actor credentials are excluded. Reads are audited too.",
        )}{" "}
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
            {appText("Exact audit action (optional)")}{" "}
          </label>
          <Input
            id="admin-audit-action"
            value={draft}
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <Button type="submit">{appText("Apply audit action")}</Button>
      </form>
      {list.isPending && (
        <p role="status">{appText("Loading audit history…")}</p>
      )}
      {list.error && (
        <Notice error>
          {appText("Audit history unavailable.")}{" "}
          <Button variant="outline" onClick={() => list.refetch()}>
            {appText("Retry audit history")}{" "}
          </Button>
        </Notice>
      )}
      {!list.isPending &&
        !list.error &&
        !list.data?.pages.some((p) => p.items.length) && (
          <p>{appText("No audit records match this action.")}</p>
        )}
      <ol className="admin-audit">
        {!list.error &&
          list.data?.pages
            .flatMap((p) => p.items)
            .map((a) => (
              <li key={a.id}>
                <strong>{appText(label(a.action))}</strong>
                <p>{a.reason}</p>
                <small>
                  {appText("Resource")} {a.aggregateId} ·{" "}
                  {when(a.createdAt, appLocale)} {appText("IST")}{" "}
                </small>
              </li>
            ))}
      </ol>
      {!list.error && list.hasNextPage && (
        <Button
          variant="outline"
          disabled={list.isFetching}
          onClick={() => list.fetchNextPage()}
        >
          {appText("Load earlier audit records")}{" "}
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
  readError = false,
}: {
  action: Action;
  session: Session;
  refresh: () => Promise<void>;
  onClose: () => void;
  available?: boolean;
  readError?: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

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
  if (readError)
    return (
      <section className="care-card care-editor">
        <Feedback decision={decision} />
        <Notice error>
          {appText("Records are unavailable. Refresh before continuing.")}
        </Notice>
        <RefreshButton
          variant="outline"
          disabled={decision.busy || decision.uncertain}
          onClick={() => decision.reload()}
         label={appText(
            decision.conflict
              ? "Refresh administrator review"
              : "Reload current decision record",
          )} />
        <Button variant="ghost" disabled={decision.locked} onClick={onClose}>
          {saved
            ? appText("Close recorded decision")
            : appText("Discard decision draft")}
        </Button>
      </section>
    );
  return (
    <section className="care-card care-editor">
      <h3>{appText(title)}</h3>
      <p>
        {appText("Record")} {identity}
        {"version" in action.item
          ? appText(" · Version {0}", [action.item.version])
          : ""}
      </p>
      {action.kind === "privacy" && (
        <>
          <p>
            {appText("Account")} {action.item.accountId} ·{" "}
            {appText(label(action.item.scope))} {action.item.resourceId}
          </p>
          <p>
            {appText("Owner request:")} {action.item.reason}
          </p>
          {action.item.correction && (
            <p>
              {appText("Proposed correction:")} {action.item.correction}
            </p>
          )}
          <Notice>
            {action.item.kind === "DELETION"
              ? appText(
                  "Deletion scrubs the selected scope while retaining financial, learning, safety and audit evidence under the recorded exception. Private-file processing and backup replay remain separate. Rejection does not restore paused consent or approval.",
                )
              : action.item.scope === "NOTE"
                ? appText(
                    "Fulfilment applies the recorded note correction, returns the note to private and clears previous acknowledgement. Rejection records the assessment without applying the proposed correction.",
                  )
                : appText(
                    "Fulfilment applies the recorded name correction in its owned scope. Verification, consent and approval remain separate; rejection leaves the proposed correction unapplied.",
                  )}
          </Notice>
        </>
      )}
      {action.kind === "flag" && (
        <Notice>
          {flagTarget ? appText("Enable") : appText("Pause")}{" "}
          {appText(action.item.name)}
          {appText(
            ". Existing financial/service evidence is preserved. This does not authorize a production cohort or override the release gate.",
          )}{" "}
        </Notice>
      )}
      {action.kind === "job" && (
        <Notice>
          {appText("Retry")} {appText(label(action.item.type))}{" "}
          {appText("for resource")} {action.item.aggregateId}
          {appText(
            ". The server rechecks its current private-media state. Payment, meeting and notification recovery are not performed by this action.",
          )}{" "}
        </Notice>
      )}
      {action.kind === "replay" && (
        <Notice>
          {appText("Reapply application scrubbing for")}{" "}
          {appText(label(action.item.scope))} {action.item.resourceId}
          {appText(". Retention policy")} {action.item.policyVersion}:{" "}
          {action.item.retentionReason}
          {appText(
            ". Restore validation and external-backup erasure are separate.",
          )}{" "}
        </Notice>
      )}
      {!available && !saved && (
        <Notice error>
          {appText(
            "This record is no longer actionable in the current queue. Close this review and inspect its recorded outcome.",
          )}{" "}
        </Notice>
      )}
      {decision.error && <Notice error>{appError(decision.error)}</Notice>}
      {decision.success && <Notice>{appText(decision.success)}</Notice>}
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
                  <label htmlFor="admin-decision">
                    {appText("Privacy decision")}
                  </label>
                  <select
                    id="admin-decision"
                    value={choice}
                    onChange={(e) => setChoice(e.target.value)}
                  >
                    <option value="">
                      {appText("Choose after reviewing")}
                    </option>
                    <option value="FULFIL">{appText("Fulfil request")}</option>
                    <option value="REJECT">
                      {appText("Reject with recorded reason")}
                    </option>
                  </select>
                </div>
                <div>
                  <label htmlFor="admin-policy">
                    {appText("Reviewed policy version")}
                  </label>
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
                      {appText("Approved retention exception")}{" "}
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
                  {appText("Verified restore reference")}{" "}
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
              <label htmlFor="admin-reason">
                {appText("Reason for this decision")}
              </label>
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
            <Button type="submit">
              {appText("Review effects and reason")}
            </Button>
          </fieldset>
        </form>
      )}
      {!saved && review && (
        <>
          <div className="care-review">
            <p>{reason}</p>
            {action.kind === "privacy" && (
              <p>
                {appText("Decision:")} {appText(label(choice))}{" "}
                {appText("· Policy")} {policy}
                {retention
                  ? appText(" · Retention exception: {0}", [retention])
                  : ""}
              </p>
            )}
            {action.kind === "replay" && (
              <p>
                {appText("Verified restore reference:")} {restore}
              </p>
            )}
            <label className="care-check">
              <input
                type="checkbox"
                checked={agreed}
                disabled={decision.locked}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              {appText(
                "I reviewed this evidence, reason and effects, and want to record this decision.",
              )}{" "}
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
              {appText("Back to decision details")}{" "}
            </Button>
            <Button
              disabled={decision.locked || !agreed || !available}
              onClick={save}
            >
              {appText("Confirm reviewed decision")}{" "}
            </Button>
          </div>
        </>
      )}
      {decision.uncertain && (
        <Button disabled={decision.busy} onClick={() => decision.run()}>
          {appText("Retry identical administrator decision")}{" "}
        </Button>
      )}
      {decision.conflict && (
        <RefreshButton
          disabled={decision.busy}
          onClick={async () => {
            await decision.reload();
            setReview(false);
            setAgreed(false);
          }}
         label={appText("Refresh administrator review")} />
      )}
      <div className="care-actions">
        {!saved && !decision.conflict && (
          <RefreshButton
            variant="outline"
            disabled={decision.busy || decision.uncertain}
            onClick={async () => {
              await decision.reload();
              setReview(false);
              setAgreed(false);
            }}
           label={appText("Reload current decision record")} />
        )}
        <Button variant="outline" disabled={decision.locked} onClick={onClose}>
          {saved
            ? appText("Close recorded decision")
            : appText("Discard decision draft")}
        </Button>
      </div>
    </section>
  );
}
