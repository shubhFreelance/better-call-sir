"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import { Bell, Check, ArrowUpRight, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Session } from "@bcs/api-client";
import { useAppTranslation } from "./locale";
type Item = {
  id: string;
  topic: string;
  actionPath: string;
  important: boolean;
  readAt: string | null;
  createdAt: string;
};
export function NotificationCard({
  children,
  important = false,
  read = false,
}: {
  children: ReactNode;
  important?: boolean;
  read?: boolean;
}) {
  return (
    <article
      className={
        "live-bell-item" +
        (important ? " is-important" : "") +
        (read ? " is-read" : "")
      }
    >
      {children}
    </article>
  );
}
export function LiveBell({ session }: { session: Session }) {
  const { appText, appLocale } = useAppTranslation(),
    client = useQueryClient(),
    [open, setOpen] = useState(false),
    [live, setLive] = useState(false),
    [error, setError] = useState(false),
    [cursor, setCursor] = useState<string | undefined>(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const q = useQuery({
    queryKey: ["live-inbox", session.account.id, cursor],
    queryFn: () =>
      api<{
        tasks?: { id: string; title: string; actionPath: string }[];
        items: Item[];
        unread: number;
        nextCursor: string | null;
      }>("/inbox" + (cursor ? "?cursor=" + cursor : "")),
    retry: false,
    refetchInterval: live ? false : 15000,
  });
  useEffect(() => {
    const socket = io({
      path: "/api/v1/live",
      addTrailingSlash: false,
      transports: ["polling"],
      withCredentials: true,
      auth: { csrfToken: session.csrfToken },
    });
    socket.on("connect", () => setLive(true));
    socket.on("disconnect", () => setLive(false));
    socket.on("connect_error", () => setLive(false));
    socket.on("inbox:changed", () => {
      void client.invalidateQueries({
        queryKey: ["live-inbox", session.account.id],
      });
      void client.invalidateQueries({
        queryKey: ["direct-enquiries", session.account.id],
      });
      void client.invalidateQueries({queryKey:["tuition-booking",session.account.id]});
    });
    return () => {
      socket.disconnect();
    };
  }, [session.account.id, session.csrfToken, client]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    root.current?.querySelector<HTMLButtonElement>(".live-bell-close")?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  function title(topic: string) {
    const labels: Record<string, string> = {
      "promotion.requested": "Promotion request awaiting review",
      "promotion.approve": "Your promotion is active",
      "promotion.reject": "Promotion request declined",
      "promotion.pause": "Promotion paused",
      "promotion.resume": "Promotion resumed",
      "promotion.cancel": "Promotion cancelled",
      "tuition-booking.confirmed": "Monthly tuition confirmation updated",
      "tuition-booking.class_recorded": "Class record updated",
      "guardian-verification.ping": "Your student is asking you to complete guardian verification.",
      "direct.accept": "Enquiry accepted — review tuition terms",
      "direct.decline": "Enquiry declined",
      "direct.accept_proposal": "Proposal confirmed — awaiting teacher acceptance",
      "direct.decline_proposal": "Alternative proposal declined",
      "direct.counter_propose": "Family suggested another time",
      "placement.terms_requested": "Tuition terms need your review",
      "placement.started": "Tuition has started",
      "student-arrangement.created": "Tuition terms need your review",
      "student-arrangement.confirmed": "Teaching arrangement confirmed",
      "student-arrangement.closed": "Teaching arrangement closed",
      "guardian-verification.reviewed": "Guardian review decision is ready",
      "supporter.changed": "Learning support permissions updated",
    };
    if (labels[topic]) return appText(labels[topic]);
    return appText(
      topic === "direct.propose"
        ? "A teacher suggested another option"
        : topic.startsWith("direct.")
          ? "Your enquiry has a reply"
          : topic === "request.created" || topic === "student-enquiry.created"
            ? "New teacher enquiry"
            : topic.includes("invited")
              ? "You have a learning invitation"
              : topic.includes("verification")
                ? "Guardian verification updated"
                : topic.includes("placement") ||
                    topic.includes("arrangement") ||
                    topic.includes("tuition")
                  ? "Tuition terms or progress updated"
                  : topic.includes("case") || topic.includes("support")
                    ? "Your support request has an update"
                    : "Your learning journey has an update",
    );
  }
  async function read(item: Item) {
    try {
      await api("/inbox/" + item.id + "/read", {
        method: "POST",
        csrf: session.csrfToken,
        body: {},
      });
      setError(false);
      await client.invalidateQueries({
        queryKey: ["live-inbox", session.account.id],
      });
    } catch {
      setError(true);
    }
  }
  return (
    <div className="live-bell" ref={root}>
      <button
        ref={trigger}
        className="live-bell-trigger"
        aria-label={appText("Notifications")}
        aria-expanded={open}
        aria-controls="live-inbox-popover"
        onClick={() => {
          if (!open) void q.refetch();
          setOpen(!open);
        }}
      >
        <Bell size={20} />
        {q.data && q.data.unread > 0 && (
          <span className="live-bell-badge">
            {q.data.unread > 99 ? "99+" : q.data.unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id="live-inbox-popover"
          className="live-bell-panel"
          aria-label={appText("Notifications")}
        >
          <header>
            <div>
              <h2>{appText("Notifications")}</h2>
              <small>
                {appText(
                  live
                    ? "Live updates connected"
                    : "Reconnecting to live updates…",
                )}
              </small>
            </div>
            <button
              className="live-bell-close"
              aria-label={appText("Close notifications")}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </header>
          {(q.error || error) && (
            <p role="alert">
              {appText("Notifications could not be updated. Try again.")}{" "}
              <button onClick={() => q.refetch()}>{appText("Retry")}</button>
            </p>
          )}
          {q.isPending && (
            <p role="status">{appText("Loading notifications…")}</p>
          )}
          <div className="live-bell-items">
            {q.data?.tasks?.map((task) => (
              <NotificationCard important key={task.id}>
                <div className="live-bell-symbol">
                  <Bell size={17} />
                </div>
                <div>
                  <strong>{appText(task.title)}</strong>
                  <Link href={task.actionPath} onClick={() => setOpen(false)}>
                    {appText("View details")} <ArrowUpRight size={13} />
                  </Link>
                </div>
              </NotificationCard>
            ))}
            {!q.error &&
              q.data?.items.map((item) => (
                <NotificationCard
                  key={item.id}
                  important={item.important}
                  read={!!item.readAt}
                >
                  <div className="live-bell-symbol">
                    <Bell size={17} />
                  </div>
                  <div>
                    <strong>{title(item.topic)}</strong>
                    {item.important && (
                      <small className="live-bell-priority">
                        {appText("Important update")}
                      </small>
                    )}
                    <time dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString(appLocale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    <Link
                      href={item.actionPath}
                      onClick={() => {
                        void read(item);
                        setOpen(false);
                      }}
                    >
                      {appText("View details")} <ArrowUpRight size={13} />
                    </Link>
                  </div>
                  {!item.readAt && (
                    <button
                      aria-label={appText("Mark as read")}
                      onClick={() => read(item)}
                    >
                      <Check size={16} />
                    </button>
                  )}
                </NotificationCard>
              ))}
            {q.data &&
              !q.error &&
              !q.data.items.length &&
              !q.data.tasks?.length && (
                <p>{appText("You’re all caught up.")}</p>
              )}
          </div>
          <footer>
            {cursor && (
              <button onClick={() => setCursor(undefined)}>
                {appText("Latest notifications")}
              </button>
            )}
            {q.data?.nextCursor && (
              <button onClick={() => setCursor(q.data!.nextCursor!)}>
                {appText("Older notifications")}
              </button>
            )}
          </footer>
        </section>
      )}
    </div>
  );
}
