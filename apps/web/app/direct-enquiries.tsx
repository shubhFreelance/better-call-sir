"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Session, type paths } from "@bcs/api-client";
import { ClipboardList, ChevronDown, ListFilter, Clock3, CircleCheck, CircleX, MessageSquare, CircleMinus } from "lucide-react";
import { StatusBadge, StatusFilters } from "../components/ui/status-controls";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useAppTranslation } from "./locale";
import { useDecision, Feedback } from "./tuition-workflow";
type Inbox =
  paths["/direct-enquiries"]["get"]["responses"][200]["content"]["application/json"];
type Item = Inbox["items"][number];
type Filter = "ALL" | "PENDING" | "ACCEPTED" | "DECLINED";
type Action =
  | "ACCEPT"
  | "DECLINE"
  | "PROPOSE"
  | "ACCEPT_PROPOSAL"
  | "DECLINE_PROPOSAL";
export function DirectEnquiries({ session }: { session: Session }) {
  const { appText, appCurriculum, appLocale } = useAppTranslation(),
    client = useQueryClient();
  const [cursors, setCursors] = useState<string[]>([]),
    [filter, setFilter] = useState<Filter>("ALL"),
    [review, setReview] = useState<{ item: Item; action: Action } | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [format, setFormat] = useState("ONE_TO_ONE"),
    [timing, setTiming] = useState(""),
    [message, setMessage] = useState("");
  const conversation = useSearchParams().get("conversation");
  const cursor = conversation ? undefined : cursors.at(-1);
  const status = conversation ? "ALL" : filter;
  const query = useQuery({
    queryKey: ["direct-enquiries", session.account.id, cursor, conversation, status],
    queryFn: ({ signal }) =>
      api<Inbox>(
        "/direct-enquiries?limit=10" +
          (cursor ? "&cursor=" + cursor : "") +
          (status !== "ALL" ? "&status=" + status : "") +
          (conversation ? "&id=" + encodeURIComponent(conversation) : ""),
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  async function refresh() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    await client.invalidateQueries({ queryKey: ["hiring-dashboard"] });
    await client.invalidateQueries({ queryKey: ["student-arrangements"] });
  }
  const decision = useDecision(session, refresh),
    teacher = session.account.role === "TEACHER",
    staff = ["ADMIN", "OPERATOR"].includes(session.account.role);
  const total = Object.values(query.data?.counts ?? {}).reduce(
    (a, b) => a + b,
    0,
  );
  function choose(item: Item, action: Action) {
    setReview({ item, action });
    setConfirmed(false);
    setFormat("ONE_TO_ONE");
    setTiming("");
    setMessage("");
  }
  function preferred(value: string) {
    try {
      const prefs = JSON.parse(value);
      if (Array.isArray(prefs.weekly))
        return prefs.weekly
          .map(
            (w: { weekday: number; startMinute: number; endMinute: number }) =>
              appText(
                [
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ][w.weekday],
              ) +
              " " +
              String(Math.floor(w.startMinute / 60)).padStart(2, "0") +
              ":" +
              String(w.startMinute % 60).padStart(2, "0") +
              "–" +
              String(Math.floor(w.endMinute / 60)).padStart(2, "0") +
              ":" +
              String(w.endMinute % 60).padStart(2, "0") +
              " IST",
          )
          .join("; ");
      if (Array.isArray(prefs.slots))
        return prefs.slots
          .map(
            (slot: { startsAt: string; endsAt: string }) =>
              new Date(slot.startsAt).toLocaleString(appLocale, {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              }) +
              " – " +
              new Date(slot.endsAt).toLocaleTimeString(appLocale, {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
              }) +
              " IST",
          )
          .join("; ");
    } catch {}
    return value;
  }
  return (
    <section
      className="direct-inbox"
      aria-label={appText(
        staff ? "Direct enquiry oversight" : "Direct enquiries",
      )}
    >
      <header className="direct-inbox-heading">
        <div className="direct-inbox-count">
          <span className="direct-inbox-icon">
            <ClipboardList aria-hidden="true" />
          </span>
          <div>
            <p>
              {appText(
                teacher
                  ? "Enquiries received"
                  : staff
                    ? "Recorded direct enquiries"
                    : "Enquiries sent",
              )}
            </p>
            <strong>{query.error ? "—" : query.isPending ? "…" : total}</strong>
          </div>
        </div>
        <div>
          <h2>
            {appText(
              staff
                ? "Direct enquiry oversight"
                : teacher
                  ? "Your teaching enquiries"
                  : "Your teacher conversations",
            )}
          </h2>
          <p>
            {appText(
              staff
                ? "Follow enquiries, proposals and accepted arrangements. Staff approval is not part of direct hiring."
                : "Teacher and family decide directly. Open an enquiry to review learning details and replies.",
            )}
          </p>
        </div>
      </header>
      {!conversation && <StatusFilters<Filter> label={appText("Filter enquiries")}
        value={filter} disabled={decision.locked} onChange={next => {
          setFilter(next); setCursors([]); setReview(null);
        }} options={[
          { value: "ALL", label: appText("All"), tone: "accent", icon: ListFilter },
          { value: "PENDING", label: appText("Awaiting teacher reply"), tone: "warning", icon: Clock3 },
          { value: "ACCEPTED", label: appText("Accepted"), tone: "success", icon: CircleCheck },
          { value: "DECLINED", label: appText("Declined"), tone: "danger", icon: CircleX },
        ]} />}
      {conversation && (
        <Button asChild variant="outline">
          <Link href="/dashboard/enquiries">{appText("All enquiries")}</Link>
        </Button>
      )}
      <Feedback decision={decision} />
      {query.isPending && <p role="status">{appText("Loading enquiries…")}</p>}
      {query.error ? (
        <p role="alert">
          {appText("Enquiries could not be loaded. Refresh before acting.")}
        </p>
      ) : query.data && !query.data.items.length ? (
        <p role="status">{appText(status === "ALL" ? "No direct enquiries yet." : "No enquiries match this filter.")}</p>
      ) : null}
      {!query.error &&
        query.data?.items.map((item) => {
          const l = item.learner as {
              name: string;
              grade?: number | null;
              board?: string | null;
              institution?: string | null;
              subjects?: string[];
              courseName?: string | null;
              studyYear?: number | null;
              education?: {
                grade?: number;
                board?: string;
                institutionName?: string;
                subjects?: string[];
                courseName?: string;
                studyYear?: number;
              };
            },
            education = l.education ?? l;
          return (
            <details
              className="direct-enquiry-card"
              key={item.id}
              open={conversation === item.id ? true : undefined}
            >
              <summary>
                <div>
                  <strong>{l.name}</strong>
                  <span>
                    {appCurriculum(item.subject)} ·{" "}
                    {appText(
                      teacher || staff
                        ? item.kind === "GUARDIAN"
                          ? "Parent"
                          : "Student"
                        : "Teacher",
                    )}
                    : {teacher || staff ? item.parentName : item.teacherName}
                  </span>
                </div>
                <div className="direct-enquiry-summary-meta">
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString(appLocale, {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                  <StatusBadge
                    label={appText(
                      !item.sourceOpen &&
                        ["PENDING", "PROPOSED"].includes(item.status)
                        ? "Closed"
                        : item.status === "PENDING"
                          ? "Awaiting teacher reply"
                          : item.status === "PROPOSED"
                            ? "Alternative proposed"
                            : item.status === "ACCEPTED"
                              ? "Accepted"
                              : "Declined",
                    )}
                    tone={!item.sourceOpen && ["PENDING", "PROPOSED"].includes(item.status) ? "neutral" : item.status === "PENDING" ? "warning" : item.status === "ACCEPTED" ? "success" : item.status === "DECLINED" ? "danger" : "accent"}
                    icon={!item.sourceOpen && ["PENDING", "PROPOSED"].includes(item.status) ? CircleMinus : item.status === "PENDING" ? Clock3 : item.status === "ACCEPTED" ? CircleCheck : item.status === "DECLINED" ? CircleX : MessageSquare}
                  />
                </div>
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <div className="direct-enquiry-body">
                <div className="direct-preferred-time">
                  <strong>{appText("Preferred time")}</strong>
                  <p>{preferred(item.preferredTime)}</p>
                </div>
                <dl className="direct-learning-details">
                  <div>
                    <dt>{appText("Student")}</dt>
                    <dd>{l.name}</dd>
                  </div>
                  <div>
                    <dt>{appText("Class / course")}</dt>
                    <dd>
                      {education.grade ?? education.courseName ?? "—"}{" "}
                      {education.board ?? ""}
                    </dd>
                  </div>
                  <div>
                    <dt>{appText("School / institution")}</dt>
                    <dd>
                      {("institutionName" in education
                        ? education.institutionName
                        : l.institution) ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{appText("Subjects")}</dt>
                    <dd>
                      {education.subjects?.map(appCurriculum).join(", ") ??
                        appCurriculum(item.subject)}
                    </dd>
                  </div>
                  <div>
                    <dt>{appText("Lesson mode")}</dt>
                    <dd>
                      {appText(item.mode === "ONLINE" ? "Online" : "At home")} ·{" "}
                      {appCurriculum(item.language)}
                    </dd>
                  </div>
                </dl>
                {item.proposal && (
                  <aside className="direct-proposal">
                    <strong>
                      {appText(
                        item.proposal.format === "GROUP"
                          ? "Group learning proposal"
                          : "One-to-one proposal",
                      )}
                    </strong>
                    <p>
                      <strong>{appText("Suggested time (IST)")}: </strong>
                      {item.proposal.timing}
                    </p>
                    <p>{item.proposal.message}</p>
                  </aside>
                )}
                {item.sourceOpen &&
                  ["PENDING", "PROPOSED"].includes(item.status) && (
                    <div className="wizard-actions">
                      {item.canReply &&
                        (
                          [
                            ["ACCEPT", "Accept enquiry"],
                            ["DECLINE", "Decline enquiry"],
                            ["PROPOSE", "Propose another time or group"],
                          ] as [Action, string][]
                        ).map(([action, label]) => (
                          <Button
                            variant={
                              action === "ACCEPT" ? "default" : "outline"
                            }
                            key={action}
                            disabled={decision.locked}
                            onClick={() => choose(item, action)}
                          >
                            {appText(label)}
                          </Button>
                        ))}
                      {item.canDecide && item.status === "PROPOSED" && (
                        <>
                          <Button
                            disabled={decision.locked}
                            onClick={() => choose(item, "ACCEPT_PROPOSAL")}
                          >
                            {appText("Accept proposal")}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={decision.locked}
                            onClick={() => choose(item, "DECLINE_PROPOSAL")}
                          >
                            {appText("Decline proposal")}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                {item.status === "ACCEPTED" && (
                  <p>
                    {appText(
                      "Enquiry accepted. Your tuition arrangement is ready; both parties review its recorded financial terms separately.",
                    )}
                  </p>
                )}
                {item.arrangementId && (
                  <Button asChild variant="outline">
                    <Link
                      href={
                        item.kind === "GUARDIAN"
                          ? "/dashboard/arrangements?arrangement=" +
                            item.arrangementId
                          : "/dashboard/student-arrangements"
                      }
                    >
                      {appText("View tuition arrangement")}
                    </Link>
                  </Button>
                )}
              </div>
            </details>
          );
        })}
      {review && (
        <form
          className="direct-reply-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirmed) return;
            decision.run({
              path: "/direct-enquiries/" + review.item.id + "/responses",
              body: {
                action: review.action,
                expectedVersion: review.item.version,
                expectedSourceVersion: review.item.sourceVersion,
                confirmed: true,
                ...(review.action === "PROPOSE"
                  ? { format, timing, message }
                  : {}),
              },
              message: "Enquiry reply recorded.",
              onSaved: () => setReview(null),
            });
          }}
        >
          <h3>
            {appText("Review your reply")}: {review.item.learner.name}
          </h3>
          <p>
            {appText(
              review.action === "ACCEPT"
                ? "Accept the requested teaching enquiry"
                : review.action === "DECLINE"
                  ? "Decline this teaching enquiry"
                  : review.action === "ACCEPT_PROPOSAL"
                    ? "Accept the teacher’s current proposal"
                    : review.action === "DECLINE_PROPOSAL"
                      ? "Decline the teacher’s current proposal"
                      : "Send an alternative teaching proposal",
            )}
          </p>
          <fieldset disabled={decision.locked}>
            {review.action === "PROPOSE" && (
              <>
                <label>
                  {appText("Teaching format")}
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="ONE_TO_ONE">{appText("One-to-one")}</option>
                    <option value="GROUP">{appText("Group")}</option>
                  </select>
                </label>
                <label>
                  {appText("Suggested time (IST)")}
                  <Input
                    required
                    maxLength={300}
                    value={timing}
                    onChange={(e) => setTiming(e.target.value)}
                  />
                </label>
                <label>
                  {appText("Message to the family")}
                  <Textarea
                    required
                    maxLength={1000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="wizard-checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                {appText(
                  "I reviewed this learner, the preferred time and my exact reply.",
                )}
              </span>
            </label>
            <div className="wizard-actions">
              <Button type="submit" disabled={!confirmed}>
                {appText("Confirm reply")}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => setReview(null)}
              >
                {appText("Cancel")}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="wizard-actions">
        <Button
          variant="outline"
          disabled={query.isFetching || decision.locked}
          onClick={() => refresh().catch(() => {})}
        >
          {appText("Refresh enquiries")}
        </Button>
        {cursors.length > 0 && (
          <Button
            variant="outline"
            disabled={decision.locked}
            onClick={() => setCursors([])}
          >
            {appText("First page")}
          </Button>
        )}
        {query.data?.nextCursor && !query.error && (
          <Button
            variant="outline"
            disabled={decision.locked}
            onClick={() => setCursors([...cursors, query.data!.nextCursor!])}
          >
            {appText("Older enquiries")}
          </Button>
        )}
      </div>
    </section>
  );
}
