"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LifeBuoy, ShieldCheck, MessageSquare } from "lucide-react";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Feedback, Notice, useDecision } from "./tuition-workflow";
type Case = components["schemas"]["SupportCase"];
const statuses: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "Under review",
  WAITING_OWNER: "Awaiting your response",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
const categories: Record<string, string> = {
  GENERAL: "General question",
  SAFETY: "Safety concern",
  REPLACEMENT: "Teacher replacement",
  ATTENDANCE: "Attendance record",
  PAYMENT: "Payment or refund",
  PRIVACY: "Privacy or deletion",
};
const date = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
export function SupportWorkspace({ session }: { session: Session | null }) {
  const router = useRouter(),
    params = useSearchParams(),
    canUse =
      !!session &&
      ["GUARDIAN", "TEACHER", "STUDENT"].includes(session.account.role);
  const requestLink = params.get("request"),
    placementLink = params.get("placement"),
    hasContext = !!(requestLink || placementLink);
  const contextParams = new URLSearchParams({
    ...(requestLink ? { requestId: requestLink } : {}),
    ...(placementLink ? { placementId: placementLink } : {}),
  });
  const context = useQuery({
    queryKey: [
      "support-context",
      session?.account.id,
      contextParams.toString(),
    ],
    queryFn: () =>
      api<components["schemas"]["SupportContext"]>(
        "/support/context?" + contextParams,
      ),
    enabled: canUse && hasContext,
    retry: false,
    refetchOnWindowFocus: false,
  });
  function caseUrl(id = "") {
    const next = new URLSearchParams({
      ...(requestLink ? { request: requestLink } : {}),
      ...(placementLink ? { placement: placementLink } : {}),
      ...(id ? { case: id } : {}),
    });
    return "/support" + (next.size ? "?" + next : "");
  }
  const [selected, setSelected] = useState(() =>
    /^[a-f0-9-]{36}$/i.test(params.get("case") || "")
      ? params.get("case")!
      : "",
  );
  const [filter, setFilter] = useState(""),
    [composing, setComposing] = useState(false),
    [category, setCategory] = useState("GENERAL"),
    [description, setDescription] = useState(""),
    [reply, setReply] = useState(""),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false);
  const sending = useRef(false),
    form = useRef<HTMLDivElement>(null);
  const list = useInfiniteQuery({
    queryKey: [
      "support-cases",
      session?.account.id,
      filter,
      contextParams.toString(),
    ],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["SupportCaseList"]>(
        `/cases?${new URLSearchParams({ limit: "20", ...Object.fromEntries(contextParams), ...(filter ? { status: filter } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: canUse && (!hasContext || (!!context.data && !context.error)),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const detail = useInfiniteQuery({
    queryKey: ["support-detail", session?.account.id, selected],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["SupportCaseDetail"]>(
        `/cases/${encodeURIComponent(selected)}?${new URLSearchParams({ updatesLimit: "20", ...(pageParam ? { updatesCursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (page) => page.updatesNextCursor || undefined,
    enabled:
      canUse &&
      !!selected &&
      (!hasContext || (!!context.data && !context.error)),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const a = await list.refetch();
    if (a.error) throw a.error;
    if (selected) {
      const b = await detail.refetch();
      if (b.error) throw b.error;
    }
  }
  const decision = useDecision(
      session || {
        account: { id: "", name: "", role: "", verified: false },
        csrfToken: "",
      },
      refresh,
    ),
    loaded = detail.data?.pages[0],
    item =
      hasContext &&
      (!context.data ||
        context.error ||
        (loaded &&
          !(
            loaded.requestId === context.data.requestId ||
            (!!context.data.placementId &&
              loaded.placementId === context.data.placementId)
          )))
        ? undefined
        : loaded,
    draft = composing || !!reply.trim(),
    locked = decision.locked || draft;
  const lastUrl = useRef(params.toString());
  useEffect(() => {
    if (!locked && lastUrl.current !== params.toString()) {
      lastUrl.current = params.toString();
      const value = params.get("case") || "";
      setSelected(/^[a-f0-9-]{36}$/i.test(value) ? value : "");
    }
  }, [params, locked]);
  useEffect(() => {
    if (composing) {
      form.current?.focus();
      form.current?.scrollIntoView({ block: "nearest" });
    }
  }, [composing]);
  function pick(id: string) {
    if (locked) return;
    setSelected(id);
    setReply("");
    setReview(false);
    setAgreed(false);
    router.replace(caseUrl(id), {
      scroll: false,
    });
    decision.invalid("");
  }
  async function save(create: boolean) {
    if (!canUse || sending.current || decision.locked) return;
    if (
      create &&
      hasContext &&
      (context.isPending || context.error || !context.data)
    ) {
      decision.invalid("Refresh the linked support context before sending.");
      return;
    }
    const message = (create ? description : reply).trim();
    if (!message || message.length > 3000 || !agreed) {
      decision.invalid(
        "Write a message of up to 3,000 characters and review it before sending.",
      );
      return;
    }
    if (
      !create &&
      (!item || ["RESOLVED", "CLOSED"].includes(item.status) || detail.error)
    ) {
      decision.invalid(
        "Refresh the case before sending a reply. Resolved cases cannot receive replies.",
      );
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        path: create ? "/cases" : `/cases/${item!.id}/updates`,
        body: create
          ? {
              category,
              description: message,
              ...(hasContext && context.data
                ? placementLink
                  ? { placementId: context.data.placementId! }
                  : { requestId: context.data.requestId }
                : {}),
            }
          : { expectedVersion: item!.version, message, internal: false },
        message: create
          ? "Your support request is recorded. This development service has no live support operator or notification delivery."
          : "Your reply is recorded. Check the case status for further updates.",
        onSaved: (result) => {
          setComposing(false);
          setDescription("");
          setReply("");
          setReview(false);
          setAgreed(false);
          if (create) {
            const id = (result as Case).id;
            setSelected(id);
            setFilter("");
            router.replace(caseUrl(id), {
              scroll: false,
            });
          }
        },
      });
    } finally {
      sending.current = false;
    }
  }
  return (
    <main className="container section support-workspace">
      <section className="support-intro">
        <LifeBuoy size={30} aria-hidden="true" />
        <h1>A clear path to help.</h1>
        <p>
          Ask a question, report a concern and follow the conversation in one
          place. Safety reporting and support are free, with or without Pro.
        </p>
      </section>
      <aside className="support-safety" aria-label="Safety guidance">
        <ShieldCheck size={24} aria-hidden="true" />
        <div>
          <strong>For immediate danger, contact emergency services.</strong>
          <p>
            <a href="tel:112">Call 112 in India</a>. This development service
            has no live emergency response.{" "}
            {session?.account.role === "STUDENT"
              ? "If it is safe, tell a trusted adult."
              : ""}
          </p>
          <p>
            To record a safety concern here, choose “Safety concern” when
            creating a case. No payment is required.
          </p>
        </div>
      </aside>
      {!session ? (
        <Notice>
          <Link href="/login?next=%2Fsupport">
            Sign in to submit or view your private cases
          </Link>
          . Emergency guidance is available without signing in.
        </Notice>
      ) : !canUse ? (
        <Notice>
          Use your <Link href="/dashboard">staff dashboard</Link> to review
          support cases.
        </Notice>
      ) : (
        <>
          <div className="support-toolbar">
            <h2>Your support cases</h2>
            <div className="support-toolbar-actions">
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => decision.reload()}
              >
                Refresh cases
              </Button>
              <Button
                disabled={
                  locked ||
                  (hasContext &&
                    (context.isPending || !!context.error || !context.data))
                }
                onClick={() => {
                  setComposing(true);
                  setReview(false);
                  setAgreed(false);
                  decision.invalid("");
                }}
              >
                Create a case
              </Button>
            </div>
          </div>
          {hasContext && (
            <section
              className="support-linked-context"
              aria-label="Linked support context"
            >
              {context.isPending ? (
                <p role="status">Loading the linked enquiry or arrangement…</p>
              ) : context.error || !context.data ? (
                <>
                  <Notice error>
                    This support link could not be verified. No case will be
                    sent against an unavailable enquiry or arrangement.
                  </Notice>
                  <Button
                    disabled={decision.locked}
                    variant="outline"
                    onClick={() => context.refetch()}
                  >
                    Retry support context
                  </Button>
                </>
              ) : (
                <>
                  <h2>
                    {context.data.kind === "ENQUIRY"
                      ? "Help with this enquiry"
                      : "Help with this arrangement"}
                  </h2>
                  <p>
                    {context.data.subject} ·{" "}
                    {context.data.mode === "HOME" ? "At home" : "Online"} ·
                    Reference {context.data.id.slice(0, 8)}
                  </p>
                  <p>
                    Your related cases and their progress appear below. Other
                    participants’ conversations stay private.
                  </p>
                  <div className="wizard-actions">
                    <Link
                      className="inline-link"
                      href={
                        session?.account.role === "GUARDIAN"
                          ? `/dashboard/requests?request=${context.data.requestId}`
                          : "/dashboard/enquiries"
                      }
                    >
                      Return to enquiry progress
                    </Link>
                    {context.data.placementId && (
                      <Link
                        className="inline-link"
                        href={`/dashboard?arrangement=${context.data.placementId}`}
                      >
                        Review hiring confirmation
                      </Link>
                    )}
                    {context.data.canRequestReplacement && (
                      <Link
                        className="inline-link"
                        href={`/dashboard/arrangements?placement=${context.data.placementId}`}
                      >
                        Review replacement options
                      </Link>
                    )}
                  </div>
                </>
              )}
            </section>
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
              Refresh current case
            </Button>
          )}
          {composing && (
            <section className="support-compose" ref={form} tabIndex={-1}>
              <h2>
                {review ? "Review your request" : "Tell us what you need"}
              </h2>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!review) {
                    if (
                      !description.trim() ||
                      description.trim().length > 3000
                    ) {
                      decision.invalid(
                        "Describe what happened in up to 3,000 characters.",
                      );
                      return;
                    }
                    setReview(true);
                    setAgreed(false);
                    return;
                  }
                  void save(true);
                }}
              >
                <fieldset disabled={decision.locked}>
                  {!review ? (
                    <>
                      <label htmlFor="support-category">
                        What can we help with?
                      </label>
                      <select
                        id="support-category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {Object.entries(categories).map(([key, title]) => (
                          <option key={key} value={key}>
                            {title}
                          </option>
                        ))}
                      </select>
                      <label htmlFor="support-description">
                        Tell us what happened
                      </label>
                      <Textarea
                        id="support-description"
                        rows={6}
                        value={description}
                        maxLength={3000}
                        onChange={(e) => setDescription(e.target.value)}
                        aria-describedby="support-writing-help"
                      />
                      <small id="support-writing-help">
                        {description.length}/3,000 characters. Include only what
                        helps resolve this case; avoid passwords and unnecessary
                        personal details.
                      </small>
                    </>
                  ) : (
                    <div className="support-review">
                      <strong>{categories[category]}</strong>
                      <p>{description}</p>
                      <p>
                        This records a private request. It does not arrange
                        emergency response, change a teacher assignment or
                        confirm a refund.
                      </p>
                      <label className="support-check">
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(e) => setAgreed(e.target.checked)}
                        />
                        <span>
                          I reviewed this request and want to send it to
                          support.
                        </span>
                      </label>
                    </div>
                  )}
                  <div className="support-actions">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        review
                          ? setReview(false)
                          : (setComposing(false), setDescription(""))
                      }
                    >
                      {review ? "Back to editing" : "Cancel request"}
                    </Button>
                    <Button type="submit">
                      {review ? "Send support request" : "Review request"}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </section>
          )}
          <div className="support-layout">
            <section className="support-history" aria-label="Your case history">
              <label htmlFor="case-filter">Case status</label>
              <select
                id="case-filter"
                value={filter}
                disabled={locked}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setSelected("");
                  router.replace(caseUrl(), { scroll: false });
                }}
              >
                <option value="">All statuses</option>
                {Object.entries(statuses).map(([key, title]) => (
                  <option key={key} value={key}>
                    {title}
                  </option>
                ))}
              </select>
              {list.isPending && (
                <p role="status">
                  {hasContext && context.error
                    ? "A verified context is needed to load related history."
                    : "Loading your case history…"}
                </p>
              )}
              {list.error && (
                <Notice error>
                  Case history could not be loaded.{" "}
                  <Button
                    variant="outline"
                    onClick={() => list.refetch()}
                    disabled={decision.uncertain}
                  >
                    Retry case history
                  </Button>
                </Notice>
              )}
              {!list.isPending &&
                !list.error &&
                !list.data?.pages.some((p) => p.items.length) && (
                  <div className="support-empty">
                    <MessageSquare size={24} aria-hidden="true" />
                    <h3>No cases for this status.</h3>
                    <p>
                      Create a case to start a private support conversation, or
                      choose another status.
                    </p>
                  </div>
                )}
              {list.data?.pages
                .flatMap((p) => p.items)
                .map((c) => (
                  <button
                    type="button"
                    className={`support-case-option ${selected === c.id ? "selected" : ""}`}
                    key={c.id}
                    disabled={locked}
                    aria-pressed={selected === c.id}
                    onClick={() => pick(c.id)}
                  >
                    <span>{categories[c.category] || c.category}</span>
                    <strong>Case {c.id.slice(0, 8)}</strong>
                    <span className="support-status">{statuses[c.status]}</span>
                    <small>{date(c.createdAt)} IST</small>
                  </button>
                ))}
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
            <section className="support-detail" aria-label="Case conversation">
              {!selected ? (
                <div className="support-empty">
                  <MessageSquare size={28} aria-hidden="true" />
                  <h3>Choose a case to follow its progress.</h3>
                  <p>
                    Replies and status changes appear here. Only your own cases
                    are listed.
                  </p>
                </div>
              ) : (
                <>
                  {detail.isPending && (
                    <p role="status">
                      {hasContext && context.error
                        ? "Resolve the support context before opening this case."
                        : "Loading case details…"}
                    </p>
                  )}
                  {detail.error && (
                    <Notice error>
                      This case could not be loaded or is no longer accessible.
                      Your reply stays here.{" "}
                      <Button
                        variant="outline"
                        disabled={decision.uncertain}
                        onClick={() => detail.refetch()}
                      >
                        Retry case details
                      </Button>
                    </Notice>
                  )}
                  {item && !detail.error && (
                    <>
                      <header className="support-case-heading">
                        <div>
                          <small>Case {item.id.slice(0, 8)}</small>
                          <h2>{categories[item.category] || item.category}</h2>
                        </div>
                        <span className="support-status">
                          {statuses[item.status]}
                        </span>
                      </header>
                      <div className="support-original">
                        <h3>Your original request</h3>
                        <p>{item.description}</p>
                        <small>Created {date(item.createdAt)} IST</small>
                      </div>
                      {item.resolution && (
                        <Notice>Resolution: {item.resolution}</Notice>
                      )}
                      <h3 className="support-updates-heading">Case updates</h3>
                      {detail.hasNextPage && (
                        <Button
                          variant="outline"
                          disabled={decision.locked || detail.isFetching}
                          onClick={() => detail.fetchNextPage()}
                        >
                          Load earlier updates
                        </Button>
                      )}
                      <ol className="support-updates">
                        {detail.data?.pages
                          .flatMap((p) => p.updates)
                          .filter((u) => !u.internal)
                          .reverse()
                          .map((u) => (
                            <li key={u.id}>
                              <div>
                                <strong>
                                  {u.author === "YOU"
                                    ? "You"
                                    : u.author === "CASE_OWNER"
                                      ? "Participant"
                                      : "Support"}
                                </strong>
                                <small>{date(u.createdAt)} IST</small>
                              </div>
                              <p>{u.message}</p>
                            </li>
                          ))}
                      </ol>
                      {!item.updates.length && (
                        <p className="support-help">
                          No replies yet. Recorded requests are not a promise of
                          immediate response.
                        </p>
                      )}
                      {!composing &&
                        (["RESOLVED", "CLOSED"].includes(item.status) ? (
                          <Notice>
                            This case is {statuses[item.status].toLowerCase()}{" "}
                            and cannot receive replies. Create a new case if you
                            need further help.
                          </Notice>
                        ) : (
                          <form
                            className="support-reply"
                            noValidate
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!review) {
                                if (
                                  !reply.trim() ||
                                  reply.trim().length > 3000
                                ) {
                                  decision.invalid(
                                    "Write a reply of up to 3,000 characters.",
                                  );
                                  return;
                                }
                                setReview(true);
                                setAgreed(false);
                                return;
                              }
                              void save(false);
                            }}
                          >
                            <fieldset disabled={decision.locked || composing}>
                              {review ? (
                                <h3>Review your reply</h3>
                              ) : (
                                <label htmlFor="case-reply">Add a reply</label>
                              )}
                              {review ? (
                                <div className="support-review">
                                  <p>{reply}</p>
                                  <label className="support-check">
                                    <input
                                      type="checkbox"
                                      checked={agreed}
                                      onChange={(e) =>
                                        setAgreed(e.target.checked)
                                      }
                                    />
                                    <span>
                                      I reviewed this reply and want to add it
                                      to the case.
                                    </span>
                                  </label>
                                </div>
                              ) : (
                                <Textarea
                                  id="case-reply"
                                  rows={4}
                                  value={reply}
                                  maxLength={3000}
                                  onChange={(e) => setReply(e.target.value)}
                                />
                              )}
                              <small>
                                Replies remain part of this case. Send only
                                relevant information.
                              </small>
                              <div className="support-actions">
                                <Button
                                  variant="outline"
                                  type="button"
                                  onClick={() =>
                                    review ? setReview(false) : setReply("")
                                  }
                                >
                                  {review ? "Edit reply" : "Discard reply"}
                                </Button>
                                <Button type="submit">
                                  {review ? "Send reply" : "Review reply"}
                                </Button>
                              </div>
                            </fieldset>
                          </form>
                        ))}
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
