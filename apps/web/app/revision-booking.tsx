"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Clock, BookOpen } from "lucide-react";
import {
  api,
  type components,
  type Dashboard,
  type Reservation,
  type Session,
  type Teacher,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import {
  CheckoutReview,
  MeetingAccess,
  bookingTime,
  exactMoney,
} from "./booking-payments";
const local = (iso: string) =>
  new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16);
const day = (offset = 2) =>
  local(new Date(Date.now() + offset * 86400000).toISOString()).slice(0, 10);
export function RevisionBooking({
  session,
  initialTeacher,
}: {
  session: Session | null;
  initialTeacher: string | null;
}) {
  const client = useQueryClient();
  const guardian = session?.account.role === "GUARDIAN";
  const dashboard = useQuery({
    queryKey: ["dashboard", session?.account.id],
    queryFn: () => api<Dashboard>("/dashboard"),
    enabled: !!guardian && !!session?.account.verified,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const permitted =
    !!guardian &&
    !!session?.account.verified &&
    !!dashboard.data?.consent &&
    !dashboard.data.consent.withdrawnAt;
  return (
    <main className="container section revision-workspace">
      <header className="revision-intro">
        <div>
          <BookOpen size={30} aria-hidden="true" />
          <h1>One topic. A clearer next step.</h1>
          <p>
            Choose the learner and a focused brief. Your expert reviews the
            scope before checkout.
          </p>
        </div>
        <div className="revision-duration">
          <strong>20 or 40 minutes</strong>
          <p>
            Current online sessions use Google Meet, with a 40-minute limit.
          </p>
          <small>
            Practice and an expert recap. No syllabus or score guarantee.
          </small>
        </div>
      </header>
      {!session ? (
        <Notice>
          Sign in with a guardian account to book for a learner.{" "}
          <Link
            className="inline-link"
            href={`/login?next=${encodeURIComponent(`/revision${initialTeacher ? `?teacher=${encodeURIComponent(initialTeacher)}` : ""}`)}`}
          >
            Sign in to book revision
          </Link>
        </Notice>
      ) : !guardian ? (
        <Notice>
          Only a guardian can book and pay for revision.{" "}
          <Link href="/dashboard" className="inline-link">
            Return to your dashboard
          </Link>
        </Notice>
      ) : !session.account.verified ? (
        <Notice>
          Guardian adult verification is required before learner details and
          booking are available.{" "}
          <Link href="/onboarding/parent" className="inline-link">
            Review guardian onboarding
          </Link>
        </Notice>
      ) : dashboard.isPending ? (
        <p role="status">Loading your family’s booking permissions…</p>
      ) : dashboard.error ? (
        <Notice error>
          {dashboard.error.message}{" "}
          <Button variant="outline" onClick={() => dashboard.refetch()}>
            Retry family details
          </Button>
        </Notice>
      ) : !permitted ? (
        <Notice>
          Active guardian consent is required to book revision.{" "}
          <Link href="/onboarding/parent" className="inline-link">
            Review guardian consent
          </Link>
        </Notice>
      ) : !dashboard.data?.children?.length ? (
        <Notice>
          Add a learner before booking revision.{" "}
          <Link href="/onboarding/parent" className="inline-link">
            Add a learner
          </Link>
        </Notice>
      ) : (
        <RevisionForm
          session={session}
          dashboard={dashboard.data}
          initialTeacher={initialTeacher}
          refresh={async () => {
            const current = await api<Dashboard>("/dashboard");
            client.setQueryData(["dashboard", session.account.id], current);
            return current;
          }}
        />
      )}
    </main>
  );
}
function RevisionForm({
  session,
  dashboard: d,
  initialTeacher,
  refresh,
}: {
  session: Session;
  dashboard: Dashboard;
  initialTeacher: string | null;
  refresh: () => Promise<Dashboard>;
}) {
  const [childId, setChildId] = useState(
      d.children?.length === 1 ? d.children[0].id : "",
    ),
    [subject, setSubject] = useState("Maths"),
    [language, setLanguage] = useState("English"),
    [teacherId, setTeacherId] = useState(initialTeacher || ""),
    [duration, setDuration] = useState("20"),
    [start, setStart] = useState(""),
    [topic, setTopic] = useState(""),
    [agreed, setAgreed] = useState(false),
    [review, setReview] = useState(false),
    [saved, setSaved] = useState<Reservation | null>(null),
    [availabilityDay, setAvailabilityDay] = useState(day()),
    [showTimes, setShowTimes] = useState(false);
  const learner = d.children?.find((c) => c.id === childId);
  const profiles = useInfiniteQuery({
    queryKey: [
      "revision-experts",
      subject,
      language,
      learner?.board,
      learner?.grade,
    ],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<{ items: Teacher[]; nextCursor?: string | null }>(
        `/teachers?${new URLSearchParams({ subject, language, mode: "ONLINE", limit: "50", ...(learner ? { board: learner.board, grade: String(learner.grade) } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (last) => last.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const experts = profiles.data?.pages.flatMap((p) => p.items) || [],
    expert = experts.find((t) => t.id === teacherId);
  useEffect(() => {
    if (
      initialTeacher &&
      !experts.some((t) => t.id === initialTeacher) &&
      profiles.hasNextPage &&
      !profiles.isFetchingNextPage &&
      (profiles.data?.pages.length || 0) < 4 &&
      !profiles.error
    )
      void profiles.fetchNextPage();
  }, [
    initialTeacher,
    profiles.hasNextPage,
    profiles.isFetchingNextPage,
    profiles.data?.pages.length,
    profiles.error,
    experts.length,
  ]);
  const range = useRef<{ day: string; start: string; end: string } | null>(
    null,
  );
  if (range.current?.day !== availabilityDay) {
    const from = new Date(availabilityDay + "T00:00:00+05:30"),
      until = new Date(from.getTime() + 86400000);
    range.current = {
      day: availabilityDay,
      start: Number.isFinite(from.getTime())
        ? new Date(Math.max(from.getTime(), Date.now() + 3600000)).toISOString()
        : "",
      end: Number.isFinite(until.getTime()) ? until.toISOString() : "",
    };
  }
  const times = useInfiniteQuery({
    queryKey: ["revision-times", teacherId, availabilityDay, duration],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<components["schemas"]["PublicSlots"]>(
        `/teachers/${teacherId}/availability?${new URLSearchParams({ kind: "REVISION", duration, startsAt: range.current!.start, endsAt: range.current!.end, limit: "50", ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (last) => last.nextCursor || undefined,
    enabled:
      showTimes && !!expert && !!range.current.start && !!range.current.end,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (review) {
      confirmation.current?.focus();
      confirmation.current?.scrollIntoView({ block: "nearest" });
    }
  }, [review]);
  const decision = useDecision(session, async () => {
    await refresh();
  });
  const locked = decision.locked || !!saved;
  function validate() {
    const from = new Date(start + ":00+05:30");
    if (
      !learner ||
      !expert ||
      !Number.isFinite(from.getTime()) ||
      from.getTime() < Date.now() + 3600000 ||
      from.getTime() > Date.now() + 60 * 86400000 ||
      !topic.trim() ||
      topic.trim().length > 1000
    ) {
      decision.invalid(
        "Choose a learner, an eligible expert, a specific brief and a start at least one hour ahead and within 60 days.",
      );
      return null;
    }
    return from;
  }
  async function submit() {
    const from = validate();
    if (!from) return;
    if (!agreed) {
      decision.invalid(
        "Review the session scope and hold conditions before saving.",
      );
      return;
    }
    await decision.run({
      path: "/revision/holds",
      body: {
        childId,
        teacherId,
        subject,
        language,
        startsAt: from.toISOString(),
        duration: Number(duration),
        topic: topic.trim(),
      },
      message:
        "Revision hold saved. Expert scope acceptance and payment are still required before booking confirmation.",
      onSaved: (result) => {
        setSaved(result as Reservation);
        setReview(false);
      },
    });
  }
  return (
    <div className="revision-columns">
      <aside className="revision-guide">
        <h2>Keep the brief focused.</h2>
        <ol>
          <li>
            <strong>Choose a topic</strong>
            <span>Class, board, subject and the question to work through.</span>
          </li>
          <li>
            <strong>Let the expert review</strong>
            <span>
              A ten-minute hold reserves the slot while the expert accepts your
              scope.
            </span>
          </li>
          <li>
            <strong>Review and pay</strong>
            <span>
              Checkout confirms payment separately from the final slot
              allocation.
            </span>
          </li>
        </ol>
        <p>
          Current development quotes: {exactMoney(30000)} for 20 minutes or{" "}
          {exactMoney(60000)} for 40 minutes. The saved reservation owns the
          exact price and policy.
        </p>
      </aside>
      <section className="revision-form">
        <h2>Plan your revision session</h2>
        <p>
          Keep this page open until your hold is saved. All starts are in IST.
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (validate()) setReview(true);
          }}
        >
          <fieldset disabled={locked}>
            <div className="booking-form-grid">
              <label>
                Learner
                <select
                  aria-label="Learner"
                  value={childId}
                  onChange={(e) => {
                    setChildId(e.target.value);
                    setReview(false);
                    setAgreed(false);
                  }}
                >
                  <option value="">Choose a learner</option>
                  {d.children?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.alias} · {c.board}, Class {c.grade}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Revision subject
                <select
                  aria-label="Revision subject"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setAgreed(false);
                    setReview(false);
                  }}
                >
                  <option>Maths</option>
                  <option>Science</option>
                </select>
              </label>
              <label>
                Teaching language
                <select
                  aria-label="Teaching language"
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setAgreed(false);
                    setReview(false);
                  }}
                >
                  <option>English</option>
                  <option>Hindi</option>
                </select>
              </label>
              <label>
                Session duration
                <select
                  aria-label="Session duration"
                  value={duration}
                  onChange={(e) => {
                    setDuration(e.target.value);
                    setAgreed(false);
                    setReview(false);
                  }}
                >
                  <option value="20">20 minutes</option>
                  <option value="40">40 minutes</option>
                </select>
              </label>
            </div>
            <label>
              Revision expert
              <select
                aria-label="Revision expert"
                value={teacherId}
                onChange={(e) => {
                  setTeacherId(e.target.value);
                  setShowTimes(false);
                  setAgreed(false);
                  setReview(false);
                }}
              >
                <option value="">Choose an eligible expert</option>
                {experts.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.subjects.join(" & ")}
                  </option>
                ))}
              </select>
            </label>
            {profiles.isPending && (
              <p role="status">Loading eligible profiles…</p>
            )}
            {profiles.error && <Notice error>{profiles.error.message}</Notice>}
            {initialTeacher && !expert && (
              <p>
                The chosen expert is not in the loaded eligible profiles. Load
                more profiles or choose another expert.
              </p>
            )}
            {profiles.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                disabled={profiles.isFetching}
                onClick={() => profiles.fetchNextPage()}
              >
                Load more expert profiles
              </Button>
            )}
            <div className="booking-form-grid">
              <label>
                Preferred start (IST)
                <Input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setReview(false);
                    setAgreed(false);
                  }}
                />
              </label>
              <label>
                Check advertised date (IST)
                <Input
                  type="date"
                  value={availabilityDay}
                  onChange={(e) => setAvailabilityDay(e.target.value)}
                />
              </label>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!expert || !availabilityDay || times.isFetching}
              onClick={() => {
                if (showTimes) void times.refetch();
                else setShowTimes(true);
              }}
            >
              See available revision times
            </Button>
            {showTimes && times.isPending && expert && (
              <p role="status">Checking advertised times…</p>
            )}
            {showTimes && times.error && (
              <Notice error>{times.error.message}</Notice>
            )}
            {times.data && showTimes && (
              <div className="revision-available">
                <p>
                  Advertised free times for the chosen date. Availability is
                  rechecked when saving.
                </p>
                {times.data.pages
                  .flatMap((p) => p.items)
                  .map((s) => (
                    <Button
                      key={s.startsAt}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setStart(local(s.startsAt));
                        setReview(false);
                        setAgreed(false);
                      }}
                    >
                      {bookingTime(s.startsAt)}
                    </Button>
                  ))}
                {!times.data.pages.some((p) => p.items.length) && (
                  <p>
                    No advertised free times for this date. Choose another date.
                  </p>
                )}
                {times.hasNextPage && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={times.isFetching}
                    onClick={() => times.fetchNextPage()}
                  >
                    Load more revision times
                  </Button>
                )}
              </div>
            )}
            <label>
              Topic brief
              <Textarea
                value={topic}
                maxLength={1000}
                rows={4}
                onChange={(e) => {
                  setTopic(e.target.value);
                  setReview(false);
                  setAgreed(false);
                }}
                placeholder="For example, Class 8 CBSE fractions: converting mixed numbers and checking signs"
              />
            </label>
            <Button className="button" type="submit">
              Review session request
            </Button>
          </fieldset>
        </form>
        {review && (
          <div className="checkout-review" ref={confirmation} tabIndex={-1}>
            <h3>Review your revision request</h3>
            <p>
              {learner?.alias} · {subject} · {language} · {duration} minutes
              with {expert?.name}
            </p>
            <p>
              {start &&
                bookingTime(new Date(start + ":00+05:30").toISOString())}{" "}
              IST
            </p>
            <p>{topic}</p>
            <p>
              A hold lasts ten minutes. Expert scope acceptance and current
              availability are required before checkout. No payment or booking
              confirmation happens at this step.
            </p>
            <fieldset disabled={locked}>
              <label className="booking-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I reviewed this topic, learner, time and hold conditions.
                </span>
              </label>
              <div className="booking-actions">
                <Button variant="outline" onClick={() => setReview(false)}>
                  Back to request
                </Button>
                <Button className="button" onClick={submit}>
                  Request scope & hold slot
                </Button>
              </div>
            </fieldset>
          </div>
        )}
        <Feedback decision={decision} />
        {decision.conflict && (
          <Button variant="outline" onClick={() => decision.reload()}>
            Refresh revision details
          </Button>
        )}
        {saved && (
          <Notice>
            Hold saved until{" "}
            {saved.expiresAt
              ? bookingTime(saved.expiresAt)
              : "its recorded expiry"}
            .{" "}
            <Link href="/dashboard/bookings" className="inline-link">
              Review your revision booking
            </Link>
          </Notice>
        )}
      </section>
    </div>
  );
}
export function ReservationBookings({
  session,
  dashboard: d,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const client = useQueryClient();
  async function refresh() {
    const current = await api<Dashboard>("/dashboard");
    client.setQueryData(["dashboard", session.account.id], current);
    return current;
  }
  return (
    <section
      className="reservation-bookings"
      aria-label="Revision and recurring bookings"
    >
      <div className="booking-section-heading">
        <h2>Booked learning, clearly tracked.</h2>
        {session.account.role === "GUARDIAN" && (
          <Link href="/revision" className="button">
            Request revision
          </Link>
        )}
      </div>
      <p>
        Holds, expert acceptance, payment and confirmed bookings remain separate
        states.
      </p>
      {d.reservations
        ?.filter((r) => r.kind !== "DEMO")
        .map((r) => (
          <ReservationCard
            key={r.id}
            session={session}
            reservation={r}
            dashboard={d}
            refresh={refresh}
          />
        ))}
      {!d.reservations?.some((r) => r.kind !== "DEMO") && (
        <Notice>
          No revision or recurring reservations in this view. Students can find
          their own booked lessons and meeting access in{" "}
          <Link href="/dashboard/lessons" className="inline-link">
            Classes & attendance
          </Link>
          .
        </Notice>
      )}
    </section>
  );
}
function ReservationCard({
  session,
  reservation: r,
  dashboard: d,
  refresh,
}: {
  session: Session;
  reservation: Reservation;
  dashboard: Dashboard;
  refresh: () => Promise<Dashboard>;
}) {
  const [now, setNow] = useState(Date.now()),
    [form, setForm] = useState<"scope" | "cancel" | null>(null),
    [agreed, setAgreed] = useState(false),
    [reason, setReason] = useState(""),
    [paymentLocked, setPaymentLocked] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const focus = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (form) {
      focus.current?.focus();
      focus.current?.scrollIntoView({ block: "nearest" });
    }
  }, [form]);
  const decision = useDecision(session, async () => {
    await refresh();
  });
  const activeHold =
    r.status === "HOLD" &&
    !!r.expiresAt &&
    new Date(r.expiresAt).getTime() > now;
  const guardian = session.account.role === "GUARDIAN",
    permitted =
      !guardian ||
      (session.account.verified && !!d.consent && !d.consent.withdrawnAt),
    locked = decision.locked || paymentLocked || !permitted;
  async function save() {
    if (!agreed || (form === "cancel" && !reason.trim())) {
      decision.invalid(
        "Review this decision and give a cancellation reason before saving.",
      );
      return;
    }
    await decision.run({
      path: `/reservations/${r.id}/${form === "scope" ? "scope" : "cancel"}`,
      body:
        form === "scope"
          ? { expectedVersion: r.version }
          : { expectedVersion: r.version, reason: reason.trim() },
      message:
        form === "scope"
          ? "Expert scope acceptance saved. The guardian still needs to review checkout."
          : "Cancellation saved. Any captured payment requires separate refund processing and settlement.",
      onSaved: () => setForm(null),
    });
  }
  const teacher =
      d.teachers?.find((t) => t.id === r.teacherId)?.name ||
      (d.profile?.id === r.teacherId ? d.profile.name : "Assigned teacher"),
    learner = d.children?.find((c) => c.id === r.childId)?.alias;
  return (
    <article className="reservation-card-new" data-reservation-id={r.id}>
      <div className="booking-section-heading">
        <div>
          <h3>
            {r.kind === "REVISION" ? "Focused revision" : "Recurring lesson"} ·{" "}
            {r.subject}
          </h3>
          <p>
            {teacher}
            {learner ? ` with ${learner}` : ""}
          </p>
        </div>
        <span className="booking-status">
          {r.status === "HOLD" && !activeHold
            ? "hold expired"
            : r.status.toLowerCase().replaceAll("_", " ")}
        </span>
      </div>
      <p className="booking-time">
        <Clock size={16} aria-hidden="true" />
        {bookingTime(r.startsAt)}–{bookingTime(r.endsAt)} IST
      </p>
      {r.topic && <p>{r.topic}</p>}
      {r.kind === "REVISION" && (
        <p>
          {r.language} · Expert scope {r.scopeAccepted ? "accepted" : "pending"}{" "}
          · {exactMoney(r.amountPaise)} · {r.pricePolicyVersion}
        </p>
      )}
      {r.expiresAt && r.status === "HOLD" && (
        <p className="booking-help">
          Hold expires {bookingTime(r.expiresAt)}. Expired holds cannot start
          checkout.
        </p>
      )}
      {r.status === "PAID_UNALLOCATED" && (
        <Notice>
          Payment was captured but this slot was not allocated. Refund
          processing needs review; no settled refund or confirmed meeting is
          promised.{" "}
          <Link href="/support" className="inline-link">
            Contact payment support
          </Link>
        </Notice>
      )}
      <div className="booking-actions">
        {session.account.role === "TEACHER" &&
          r.kind === "REVISION" &&
          activeHold &&
          !r.scopeAccepted && (
            <Button
              className="button"
              disabled={locked}
              onClick={() => {
                setForm("scope");
                setAgreed(false);
              }}
            >
              Review topic scope
            </Button>
          )}
        {guardian &&
          r.kind === "REVISION" &&
          ["HOLD", "CONFIRMED"].includes(r.status) && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => {
                setForm("cancel");
                setAgreed(false);
              }}
            >
              Review cancellation
            </Button>
          )}
        <Button
          variant="outline"
          disabled={decision.busy || decision.uncertain || paymentLocked}
          onClick={() => decision.reload()}
        >
          Refresh booking
        </Button>
      </div>
      {form && (
        <div className="checkout-review" ref={focus} tabIndex={-1}>
          <h4>
            {form === "scope"
              ? "Review expert scope acceptance"
              : "Review reservation cancellation"}
          </h4>
          <p>
            {form === "scope"
              ? "Accept only the brief, learner coverage and session time you can deliver. Payment is still separate."
              : "This cancels the reservation and its future scheduled lesson/meeting. Captured payments follow the approved policy and refund processing; late cancellation may require support review."}
          </p>
          <fieldset disabled={locked}>
            {form === "cancel" && (
              <label>
                Reason for cancellation
                <Textarea
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <label className="booking-check">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                {form === "scope"
                  ? "I can deliver this topic brief at the recorded time."
                  : "I reviewed the cancellation and pending refund implications."}
              </span>
            </label>
            <div className="booking-actions">
              <Button variant="outline" onClick={() => setForm(null)}>
                Keep booking
              </Button>
              <Button className="button" onClick={save}>
                {form === "scope"
                  ? "Accept topic scope"
                  : "Confirm cancellation"}
              </Button>
            </div>
          </fieldset>
        </div>
      )}
      <Feedback decision={decision} />
      {guardian &&
        r.kind === "REVISION" &&
        r.scopeAccepted &&
        [
          "HOLD",
          "EXPIRED",
          "CONFIRMED",
          "PAID_UNALLOCATED",
          "CANCELLED",
        ].includes(r.status) && (
          <CheckoutReview
            session={session}
            kind="REVISION"
            resourceId={r.id}
            amountPaise={r.amountPaise}
            expectedVersion={r.version}
            policy={r.pricePolicyVersion}
            refresh={refresh}
            onLock={setPaymentLocked}
            payable={activeHold && permitted && !decision.locked}
            ready={(current) => {
              const saved = current.reservations?.find((v) => v.id === r.id);
              return (
                current.role === "GUARDIAN" &&
                session.account.verified &&
                !!current.consent &&
                !current.consent.withdrawnAt &&
                saved?.status === "HOLD" &&
                saved.scopeAccepted &&
                !!saved.expiresAt &&
                new Date(saved.expiresAt).getTime() > Date.now() &&
                saved.amountPaise === r.amountPaise
              );
            }}
          />
        )}
      {r.status === "CONFIRMED" && (
        <MeetingAccess session={session} reservationId={r.id} confirmed />
      )}
    </article>
  );
}
export function PlacementInvoices({
  session,
  dashboard: d,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const client = useQueryClient();
  if (session.account.role !== "TEACHER") return null;
  return (
    <section className="placement-invoices" aria-label="Placement invoices">
      <h3>Placement invoices</h3>
      {d.invoices?.length ? (
        d.invoices.map((i) => {
          const invoice = i as typeof i & {
            version?: number;
            policyVersion?: string;
          };
          return (
            <div key={i.id} className="reservation-card-new">
              <h4>Teacher placement fee · {exactMoney(i.amountPaise)}</h4>
              <p>
                {i.status.toLowerCase()} ·{" "}
                {invoice.policyVersion || "Policy details unavailable"}
              </p>
              {invoice.version &&
                invoice.policyVersion &&
                ["DUE", "PAID"].includes(i.status) && (
                  <CheckoutReview
                    session={session}
                    kind="INVOICE"
                    payable={i.status === "DUE"}
                    resourceId={i.id}
                    amountPaise={i.amountPaise}
                    expectedVersion={invoice.version}
                    policy={invoice.policyVersion}
                    refresh={async () => {
                      const current = await api<Dashboard>("/dashboard");
                      client.setQueryData(
                        ["dashboard", session.account.id],
                        current,
                      );
                      return current;
                    }}
                    ready={(current) =>
                      current.role === "TEACHER" &&
                      current.invoices?.some(
                        (v) =>
                          v.id === i.id &&
                          v.status === "DUE" &&
                          v.amountPaise === i.amountPaise,
                      ) === true
                    }
                  />
                )}
            </div>
          );
        })
      ) : (
        <Notice>
          No placement invoices. Each party must independently confirm paid
          tuition start and receipt first.
        </Notice>
      )}
    </section>
  );
}
