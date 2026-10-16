"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
const labels: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "Under review",
  WAITING_OWNER: "Awaiting owner",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
const when = (s: string) =>
    new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  label = (s: string) =>
    s
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^./, (v) => v.toUpperCase());
export function SupportOperations({ session }: { session: Session }) {
  const [tab, setTab] = useState("cases"),
    [locked, setLocked] = useState(false);
  if (!["ADMIN", "OPERATOR"].includes(session.account.role))
    return (
      <Notice>
        Support operations belong to authorized operators and administrators.{" "}
        <Link href="/support">Your private support cases</Link> remain separate.
      </Notice>
    );
  return (
    <div className="care-workspace">
      <section className="care-intro">
        <LifeBuoy size={28} aria-hidden="true" />
        <h2>Every concern, a clear next step.</h2>
        <p>
          Review regional cases, distinguish private staff notes from owner
          replies, and resolve demo or attendance disputes from the recorded
          evidence. Safety reporting stays free.
        </p>
      </section>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (!locked) setTab(v);
        }}
      >
        <TabsList className="care-tabs" aria-label="Support operation queues">
          <TabsTrigger value="cases" disabled={locked}>
            Cases
          </TabsTrigger>
          <TabsTrigger value="demos" disabled={locked}>
            Demo disputes
          </TabsTrigger>
          <TabsTrigger value="lessons" disabled={locked}>
            Attendance disputes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cases">
          <CaseQueue session={session} onLock={setLocked} />
        </TabsContent>
        <TabsContent value="demos">
          <DisputeQueue session={session} kind="demo" onLock={setLocked} />
        </TabsContent>
        <TabsContent value="lessons">
          <DisputeQueue session={session} kind="lesson" onLock={setLocked} />
        </TabsContent>
      </Tabs>
      <small className="care-help">
        Case/update and attendance queues are paginated. Demo history is the
        latest 100 records. Self-assignment and release support team handoff;
        staff provisioning remains separate. These actions do not settle refunds
        or payouts. Live support hours, notification delivery and safeguarding
        procedures remain unqualified.
      </small>
    </div>
  );
}
function CaseQueue({
  session,
  onLock,
}: {
  session: Session;
  onLock: (v: boolean) => void;
}) {
  const params = useSearchParams(),
    [selected, setSelected] = useState(params.get("case") || ""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [assignment, setAssignment] = useState(""),
    [locked, setLocked] = useState(false);
  const list = useInfiniteQuery({
    queryKey: ["staff-cases", session.account.id, status, category, assignment],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["SupportCaseList"]>(
        `/cases?${new URLSearchParams({ limit: "20", ...(status ? { status } : {}), ...(category ? { category } : {}), ...(assignment ? { assignment } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    onLock(locked);
    return () => onLock(false);
  }, [locked, onLock]);
  return (
    <>
      <div className="care-fields">
        <div>
          <label htmlFor="ops-status">Case status</label>
          <select
            id="ops-status"
            value={status}
            disabled={locked}
            onChange={(e) => {
              setStatus(e.target.value);
              setSelected("");
            }}
          >
            <option value="">All statuses</option>
            {Object.entries(labels).map(([v, s]) => (
              <option key={v} value={v}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ops-category">Case category</label>
          <select
            id="ops-category"
            value={category}
            disabled={locked}
            onChange={(e) => {
              setCategory(e.target.value);
              setSelected("");
            }}
          >
            <option value="">All categories</option>
            {[
              "SAFETY",
              "REPLACEMENT",
              "ATTENDANCE",
              "DEMO_NO_SHOW",
              "PAYMENT",
              "PRIVACY",
              "GENERAL",
              "PAID_BOOKING_REVIEW",
            ].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ops-assignment">Assignment filter</label>
          <select
            id="ops-assignment"
            value={assignment}
            disabled={locked}
            onChange={(e) => {
              setAssignment(e.target.value);
              setSelected("");
            }}
          >
            <option value="">All assignments</option>
            <option value="ME">Assigned to me</option>
            <option value="UNASSIGNED">Unassigned</option>
          </select>
        </div>
      </div>
      {list.isPending && <p role="status">Loading cases…</p>}
      {list.error && (
        <Notice error>
          Case queue could not be loaded.{" "}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => list.refetch()}
          >
            Retry case queue
          </Button>
        </Notice>
      )}
      <section className="care-card">
        <h3>Case queue</h3>
        {!list.isPending &&
          !list.error &&
          !list.data?.pages.some((p) => p.items.length) && (
            <p>No cases for these filters.</p>
          )}
        <div className="ops-case-list">
          {list.data?.pages
            .flatMap((p) => p.items)
            .map((c) => (
              <Button
                variant={selected === c.id ? "default" : "outline"}
                key={c.id}
                disabled={locked}
                aria-pressed={selected === c.id}
                onClick={() => setSelected(c.id)}
              >
                {label(c.category)} · {labels[c.status]} · {c.id.slice(0, 8)}
              </Button>
            ))}
        </div>
        {list.hasNextPage && (
          <Button
            variant="outline"
            disabled={locked || list.isFetching}
            onClick={() => list.fetchNextPage()}
          >
            Load more cases
          </Button>
        )}
      </section>
      {selected && (
        <StaffCase
          key={selected}
          session={session}
          id={selected}
          onLock={setLocked}
          refreshList={async () => {
            const q = await list.refetch();
            if (q.error) throw q.error;
          }}
        />
      )}
    </>
  );
}
function StaffCase({
  session,
  id,
  onLock,
  refreshList,
}: {
  session: Session;
  id: string;
  onLock: (v: boolean) => void;
  refreshList: () => Promise<void>;
}) {
  const details = useInfiniteQuery({
    queryKey: ["staff-case-detail", session.account.id, id],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["SupportCaseDetail"]>(
        `/cases/${id}?${new URLSearchParams({ updatesLimit: "20", ...(pageParam ? { updatesCursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (p) => p.updatesNextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<"reply" | "triage" | "">(""),
    [message, setMessage] = useState(""),
    [internal, setInternal] = useState(false),
    [targetStatus, setTargetStatus] = useState("OPEN"),
    [assignment, setAssignment] = useState("keep"),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    sending = useRef(false),
    c = details.data?.pages[0];
  async function refresh() {
    const [, d] = await Promise.all([refreshList(), details.refetch()]);
    if (d.error) throw d.error;
  }
  const decision = useDecision(session, refresh);
  useEffect(() => {
    onLock(decision.locked || !!action);
    return () => onLock(false);
  }, [decision.locked, action, onLock]);
  const transitions: Record<string, string[]> = {
    OPEN: ["OPEN", "IN_PROGRESS", "WAITING_OWNER", "RESOLVED"],
    IN_PROGRESS: ["IN_PROGRESS", "OPEN", "WAITING_OWNER", "RESOLVED"],
    WAITING_OWNER: ["WAITING_OWNER", "OPEN", "IN_PROGRESS", "RESOLVED"],
    RESOLVED: ["RESOLVED", "OPEN", "CLOSED"],
    CLOSED: ["CLOSED"],
  };
  function begin(next: "reply" | "triage") {
    if (!c || decision.locked || action) return;
    setAction(next);
    setMessage("");
    setInternal(false);
    setTargetStatus(c.status);
    setAssignment("keep");
    setReview(false);
    setAgreed(false);
    decision.invalid("");
  }
  function operation() {
    if (
      !c ||
      details.error ||
      !message.trim() ||
      message.trim().length > (action === "reply" ? 3000 : 1000)
    ) {
      decision.invalid(
        "Load the current case and enter a relevant message within the stated limit.",
      );
      return null;
    }
    if (action === "reply") {
      if (["RESOLVED", "CLOSED"].includes(c.status)) {
        decision.invalid(
          "This case cannot receive replies until an allowed reopen is recorded.",
        );
        return null;
      }
      return {
        path: `/cases/${id}/updates`,
        body: { expectedVersion: c.version, message: message.trim(), internal },
      };
    }
    if (
      c.status === "CLOSED" ||
      !transitions[c.status].includes(targetStatus)
    ) {
      decision.invalid(
        "Review the current case transition. Closed cases cannot be reopened.",
      );
      return null;
    }
    return {
      path: `/admin/cases/${id}/triage`,
      body: {
        expectedVersion: c.version,
        status: targetStatus,
        reason: message.trim(),
        ...(assignment === "keep"
          ? {}
          : { assignedToId: assignment === "me" ? session.account.id : null }),
      },
    };
  }
  async function save() {
    if (decision.locked || sending.current) return;
    const op = operation();
    if (!op || !agreed) {
      if (op)
        decision.invalid(
          "Review the message visibility and effects before confirming.",
        );
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        ...op,
        message:
          action === "reply"
            ? internal
              ? "Private staff note recorded."
              : "Case-owner reply recorded."
            : "Case status and assignment decision recorded.",
        onSaved: () => {
          setAction("");
          setMessage("");
          setReview(false);
          setAgreed(false);
        },
      });
    } finally {
      sending.current = false;
    }
  }
  return (
    <>
      <Feedback decision={decision} />
      {decision.conflict && (
        <Button
          variant="outline"
          disabled={decision.busy}
          onClick={() => {
            setReview(false);
            setAgreed(false);
            void decision.reload();
          }}
        >
          Refresh current staff case
        </Button>
      )}
      {details.error && (
        <Notice error>
          This case is unavailable or outside your authorized scope.{" "}
          <Button
            variant="outline"
            disabled={decision.uncertain}
            onClick={() => details.refetch()}
          >
            Retry staff case
          </Button>
        </Notice>
      )}
      {details.isPending && <p role="status">Loading case conversation…</p>}
      {c && !details.error && (
        <section className="care-card care-editor">
          <span className="care-status">
            {labels[c.status]} · {c.region}
          </span>
          <h3>
            {label(c.category)} · Case {id.slice(0, 8)}
          </h3>
          <p>{c.description}</p>
          <p>
            Assignment:{" "}
            {c.assignedToId === session.account.id
              ? "You"
              : c.assignedToId
                ? "Another staff member " + c.assignedToId.slice(0, 8)
                : "Unassigned"}{" "}
            · Version {c.version}
          </p>
          {c.studentEnquiryId && (
            <Link
              className="inline-link"
              href={
                "/dashboard/student-enquiries?enquiry=" + c.studentEnquiryId
              }
            >
              Review linked student enquiry
            </Link>
          )}
          {c.placementId && (
            <small>Linked arrangement {c.placementId.slice(0, 8)}</small>
          )}
          {c.resolution && <Notice>Recorded resolution: {c.resolution}</Notice>}
          <h4>Conversation and staff notes</h4>
          {details.hasNextPage && (
            <Button
              variant="outline"
              disabled={decision.locked || !!action || details.isFetching}
              onClick={() => details.fetchNextPage()}
            >
              Load earlier staff updates
            </Button>
          )}
          <ol className="support-updates">
            {details.data?.pages
              .flatMap((p) => p.updates)
              .reverse()
              .map((u) => (
                <li key={u.id}>
                  <div>
                    <strong>
                      {u.author === "YOU"
                        ? "You"
                        : u.author === "CASE_OWNER"
                          ? "Case owner"
                          : "Support"}
                    </strong>
                    <span className="care-status">
                      {u.internal ? "Staff only" : "Visible to case owner"}
                    </span>
                  </div>
                  <p>{u.message}</p>
                  <small>{when(u.createdAt)} IST</small>
                </li>
              ))}
          </ol>
          <div className="care-actions">
            <Button
              disabled={
                decision.locked ||
                !!action ||
                ["RESOLVED", "CLOSED"].includes(c.status)
              }
              onClick={() => begin("reply")}
            >
              Write reply or staff note
            </Button>
            <Button
              variant="outline"
              disabled={decision.locked || !!action || c.status === "CLOSED"}
              onClick={() => begin("triage")}
            >
              Review status and assignment
            </Button>
            <Button
              variant="outline"
              disabled={decision.locked || !!action}
              onClick={() => decision.reload()}
            >
              Refresh case conversation
            </Button>
          </div>
          {action && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (review) {
                  void save();
                  return;
                }
                if (operation()) {
                  setReview(true);
                  setAgreed(false);
                }
              }}
            >
              <fieldset disabled={decision.locked}>
                {!review ? (
                  <>
                    {action === "triage" ? (
                      <div className="care-fields">
                        <div>
                          <label htmlFor="staff-case-status">
                            Next case status
                          </label>
                          <select
                            id="staff-case-status"
                            value={targetStatus}
                            onChange={(e) => setTargetStatus(e.target.value)}
                          >
                            {Object.entries(labels).map(([v, s]) => (
                              <option
                                key={v}
                                value={v}
                                disabled={!transitions[c.status].includes(v)}
                              >
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="staff-case-assignee">
                            Assignment decision
                          </label>
                          <select
                            id="staff-case-assignee"
                            value={assignment}
                            onChange={(e) => setAssignment(e.target.value)}
                          >
                            <option value="keep">
                              Keep current assignment
                            </option>
                            <option value="me">Assign to me</option>
                            <option value="unassigned">
                              Release to unassigned queue
                            </option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <label className="care-check reviewer-coverage">
                        <input
                          type="checkbox"
                          checked={internal}
                          onChange={(e) => setInternal(e.target.checked)}
                        />
                        <span>
                          Staff-only note: hide this message from the case
                          owner.
                        </span>
                      </label>
                    )}
                    <label htmlFor="staff-case-message">
                      {action === "reply"
                        ? "Case message"
                        : "Reason for status/assignment"}
                    </label>
                    <Textarea
                      id="staff-case-message"
                      rows={4}
                      maxLength={action === "reply" ? 3000 : 1000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <p>
                      {action === "triage"
                        ? "Triage reasons are visible to the case owner. Use the dispute tabs for demo/attendance outcomes; case triage alone does not decide a lesson outcome."
                        : internal
                          ? "This note is visible only to authorized support staff."
                          : "This reply is visible to the case owner."}
                    </p>
                  </>
                ) : (
                  <div className="care-review">
                    <h4>
                      Case {id.slice(0, 8)} · Version {c.version}
                    </h4>
                    <p>{message}</p>
                    <p>
                      {action === "reply"
                        ? internal
                          ? "Visibility: authorized staff only."
                          : "Visibility: case owner and authorized staff."
                        : `Record ${labels[targetStatus]}; ${assignment === "me" ? "assign to you" : assignment === "unassigned" ? "release to the unassigned queue" : "keep assignment"}. The reason is visible to the case owner.`}
                    </p>
                    {targetStatus === "CLOSED" && action === "triage" && (
                      <p>Closing is final; this case cannot be reopened.</p>
                    )}
                    <label className="care-check">
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                      />
                      <span>
                        I reviewed this case, message visibility and effects,
                        and want to record the decision.
                      </span>
                    </label>
                  </div>
                )}
                <div className="care-actions">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() =>
                      review
                        ? setReview(false)
                        : (setAction(""), setMessage(""))
                    }
                  >
                    {review ? "Back to editing" : "Cancel case decision"}
                  </Button>
                  <Button type="submit">
                    {review ? "Confirm case decision" : "Review case decision"}
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
        </section>
      )}
    </>
  );
}
type Dispute =
  | components["schemas"]["Demo"]
  | components["schemas"]["LessonDispute"];
function DisputeQueue({
  session,
  kind,
  onLock,
}: {
  session: Session;
  kind: "demo" | "lesson";
  onLock: (v: boolean) => void;
}) {
  const [selected, setSelected] = useState<Dispute | null>(null),
    [locked, setLocked] = useState(false),
    [notice, setNotice] = useState("");
  const demos = useQuery({
    queryKey: ["staff-demo-disputes", session.account.id],
    queryFn: ({ signal }) =>
      api<{ items: components["schemas"]["Demo"][] }>("/demos", { signal }),
    enabled: kind === "demo",
    retry: false,
    refetchOnWindowFocus: false,
  });
  const lessons = useInfiniteQuery({
    queryKey: ["staff-lesson-disputes", session.account.id],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["LessonDisputeList"]>(
        `/admin/lessons/disputes?${new URLSearchParams({ limit: "20", ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    enabled: kind === "lesson",
    retry: false,
    refetchOnWindowFocus: false,
  });
  const rows: Dispute[] =
      kind === "demo"
        ? demos.data?.items.filter((d) => d.status === "DISPUTED") || []
        : lessons.data?.pages.flatMap((p) => p.items) || [],
    query = kind === "demo" ? demos : lessons,
    item = rows.find((r) => r.id === selected?.id) || selected,
    available =
      !!item &&
      rows.some((r) => r.id === item.id) &&
      !query.error &&
      !query.isPending;
  useEffect(() => {
    onLock(locked);
    return () => onLock(false);
  }, [locked, onLock]);
  async function refresh() {
    const q = await query.refetch();
    if (q.error) throw q.error;
  }
  return (
    <>
      {notice && <Notice>{notice}</Notice>}
      <section className="care-card">
        <h3>
          {kind === "demo" ? "Demo outcome disputes" : "Attendance disputes"}
        </h3>
        {query.isPending && <p role="status">Loading disputes…</p>}
        {query.error && (
          <Notice error>
            Scoped dispute records are unavailable.{" "}
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => refresh()}
            >
              Retry dispute queue
            </Button>
          </Notice>
        )}
        {!query.isPending && !query.error && !rows.length && (
          <p>No open disputes in these records.</p>
        )}
        <div className="ops-case-list">
          {rows.map((r) => (
            <Button
              key={r.id}
              data-dispute-id={r.id}
              variant={selected?.id === r.id ? "default" : "outline"}
              disabled={locked || !!query.error}
              onClick={() => {
                setSelected(r);
                setNotice("");
              }}
            >
              {"reservation" in r
                ? "Demo · " + when(r.reservation.startsAt)
                : r.learner.alias +
                  " · " +
                  r.subject +
                  " · " +
                  when(r.startsAt)}{" "}
              IST
            </Button>
          ))}
        </div>
        <div className="care-actions">
          <Button variant="outline" disabled={locked} onClick={() => refresh()}>
            Refresh dispute queue
          </Button>
          {kind === "lesson" && lessons.hasNextPage && (
            <Button
              variant="outline"
              disabled={locked || lessons.isFetching}
              onClick={() => lessons.fetchNextPage()}
            >
              Load more attendance disputes
            </Button>
          )}
        </div>
      </section>
      {item && (
        <DisputeReview
          key={item.id}
          item={item}
          available={available}
          session={session}
          onLock={setLocked}
          refresh={refresh}
          onSaved={() => {
            setNotice(
              "Dispute outcome recorded. Linked support progress is updated; financial settlement remains separate.",
            );
            setSelected(null);
          }}
          onCancel={() => setSelected(null)}
        />
      )}
    </>
  );
}
function DisputeReview({
  item,
  available,
  session,
  onLock,
  refresh,
  onSaved,
  onCancel,
}: {
  item: Dispute;
  available: boolean;
  session: Session;
  onLock: (v: boolean) => void;
  refresh: () => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const demo = "reservation" in item ? item : null,
    lesson = "attendance" in item ? item : null,
    [choice, setChoice] = useState(""),
    [reason, setReason] = useState(""),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    sending = useRef(false),
    decision = useDecision(session, refresh);
  useEffect(() => {
    onLock(true);
    return () => onLock(false);
  }, [onLock]);
  const context = useQuery({
    queryKey: ["dispute-case-context", session.account.id, demo?.supportCaseId],
    queryFn: ({ signal }) =>
      api<components["schemas"]["SupportCaseDetail"]>(
        `/cases/${demo!.supportCaseId}?updatesLimit=20`,
        { signal },
      ),
    enabled: !!demo?.supportCaseId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  function operation() {
    if (
      !available ||
      (demo &&
        (!context.data || context.error || context.data.status === "CLOSED")) ||
      !choice ||
      !reason.trim() ||
      reason.trim().length > 1000
    ) {
      decision.invalid(
        "Load an open scoped dispute, choose the reviewed outcome and add a reason.",
      );
      return null;
    }
    return {
      path: demo
        ? `/admin/demos/${item.id}/reviews`
        : `/admin/lessons/${item.id}/dispute-resolutions`,
      body: {
        expectedVersion: item.version,
        ...(demo ? { resolution: choice } : { attendance: choice }),
        reason: reason.trim(),
      },
    };
  }
  async function save() {
    if (decision.locked || sending.current) return;
    const op = operation();
    if (!op || !agreed) {
      if (op)
        decision.invalid(
          "Acknowledge the evidence and recorded outcome before confirming.",
        );
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        ...op,
        message: "Dispute outcome recorded.",
        onSaved,
      });
    } finally {
      sending.current = false;
    }
  }
  return (
    <section className="care-card care-editor">
      <h3>{demo ? "Review demo outcome" : "Review recorded attendance"}</h3>
      <p>
        Record {item.id.slice(0, 8)} · Version {item.version}
      </p>
      {demo ? (
        <>
          <p>
            Guardian report: {demo.guardianOutcome || "Not recorded"} · Teacher
            report: {demo.teacherOutcome || "Not recorded"}
          </p>
          <p>
            {when(demo.reservation.startsAt)}–{when(demo.reservation.endsAt)}{" "}
            IST
          </p>
          {context.data && (
            <>
              <h4>Linked case evidence</h4>
              <p>{context.data.description}</p>
              {context.data.updates.map((u) => (
                <p key={u.id}>
                  {u.internal ? "Staff note" : "Case conversation"}: {u.message}
                </p>
              ))}
              <small>
                Latest 20 case updates. The case queue contains earlier history.
              </small>
            </>
          )}
          {context.isPending && (
            <p role="status">Loading linked case evidence…</p>
          )}
          {context.error && (
            <Notice error>
              Linked case evidence is unavailable; resolution is blocked until
              it loads.{" "}
              <Button
                variant="outline"
                disabled={decision.locked}
                onClick={() => context.refetch()}
              >
                Retry dispute evidence
              </Button>
            </Notice>
          )}
        </>
      ) : (
        lesson && (
          <>
            <p>
              {lesson.learner.alias} · Class {lesson.learner.grade} ·{" "}
              {lesson.learner.board} · {lesson.subject} · {lesson.teacher.name}
            </p>
            <p>
              {when(lesson.startsAt)}–{when(lesson.endsAt)} IST · Attendance:{" "}
              {label(lesson.attendance)}
            </p>
            {lesson.recap && <p>Teacher recap: {lesson.recap}</p>}
            {lesson.participantReviews.map((r, i) => (
              <p key={i}>
                {label(r.action)} for lesson version {r.lessonVersion}:{" "}
                {r.reason}
              </p>
            ))}
          </>
        )
      )}
      {!available && (
        <Notice>
          This record is no longer in the current open queue, or current records
          are unavailable. Your local assessment remains below; refresh or
          cancel before choosing another record.
        </Notice>
      )}
      <Feedback decision={decision} />
      {decision.conflict && (
        <Button
          variant="outline"
          disabled={decision.busy}
          onClick={() => {
            setReview(false);
            setAgreed(false);
            void decision.reload();
          }}
        >
          Refresh current dispute
        </Button>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (review) {
            void save();
            return;
          }
          if (operation()) {
            setReview(true);
            setAgreed(false);
          }
        }}
      >
        <fieldset disabled={decision.locked}>
          {!review ? (
            <>
              <label htmlFor="ops-outcome">Reviewed outcome</label>
              <select
                id="ops-outcome"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">Choose after reviewing evidence</option>
                {(demo
                  ? ["COMPLETED", "NOT_COMPLETED"]
                  : ["PRESENT", "LATE", "ABSENT"]
                ).map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
              <label htmlFor="ops-evidence-reason">
                Evidence and reason for resolution
              </label>
              <Textarea
                id="ops-evidence-reason"
                rows={4}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          ) : (
            <div className="care-review">
              <h4>
                {demo ? "Demo outcome" : "Attendance"}: {label(choice)}
              </h4>
              <p>{reason}</p>
              <p>
                This records the reviewed outcome and updates eligible linked
                support cases. Attendance correction may change a held payable's
                eligibility; refunds and actual payouts require separate finance
                review and settlement.
              </p>
              <label className="care-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I reviewed the participant evidence and outcome and want to
                  record this audited resolution.
                </span>
              </label>
            </div>
          )}
          <div className="care-actions">
            <Button
              variant="outline"
              type="button"
              onClick={() => (review ? setReview(false) : onCancel())}
            >
              {review ? "Back to evidence" : "Cancel dispute review"}
            </Button>
            <Button type="submit" disabled={!available}>
              {review ? "Confirm dispute resolution" : "Review dispute outcome"}
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
