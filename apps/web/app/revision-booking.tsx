"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { useAppTranslation } from "./locale";
import { pilotLearner } from "./learner-education";
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

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
          <h1>{appText("One topic. A clearer next step.")}</h1>
          <p>
            {appText(
              "Choose the learner and a focused brief. Your expert reviews the scope before checkout.",
            )}{" "}
          </p>
        </div>
        <div className="revision-duration">
          <strong>{appText("20 or 40 minutes")}</strong>
          <p>
            {appText(
              "Current online sessions use Google Meet, with a 40-minute limit.",
            )}{" "}
          </p>
          <small>
            {appText(
              "Practice and an expert recap. No syllabus or score guarantee.",
            )}{" "}
          </small>
        </div>
      </header>
      {!session ? (
        <Notice>
          {appText("Sign in with a guardian account to book for a learner.")}{" "}
          <Link
            className="inline-link"
            href={`/login?next=${encodeURIComponent(`/revision${initialTeacher ? `?teacher=${encodeURIComponent(initialTeacher)}` : ""}`)}`}
          >
            {appText("Sign in to book revision")}{" "}
          </Link>
        </Notice>
      ) : !guardian ? (
        <Notice>
          {appText("Only a guardian can book and pay for revision.")}{" "}
          <Link href="/dashboard" className="inline-link">
            {appText("Return to your dashboard")}{" "}
          </Link>
        </Notice>
      ) : !session.account.verified ? (
        <Notice>
          {appText(
            "Guardian adult verification is required before learner details and booking are available.",
          )}{" "}
          <Link href="/onboarding/parent" className="inline-link">
            {appText("Review guardian onboarding")}{" "}
          </Link>
        </Notice>
      ) : dashboard.isPending ? (
        <p role="status">
          {appText("Loading your family’s booking permissions…")}
        </p>
      ) : dashboard.error ? (
        <Notice error>
          {appError(dashboard.error.message)}{" "}
          <Button variant="outline" onClick={() => dashboard.refetch()}>
            {appText("Retry family details")}{" "}
          </Button>
        </Notice>
      ) : !permitted ? (
        <Notice>
          {appText("Active guardian consent is required to book revision.")}{" "}
          <Link href="/onboarding/parent" className="inline-link">
            {appText("Review guardian consent")}{" "}
          </Link>
        </Notice>
      ) : !dashboard.data?.children?.length ? (
        <Notice>
          {appText("Add a learner before booking revision.")}{" "}
          <Link href="/onboarding/parent" className="inline-link">
            {appText("Add a learner")}{" "}
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const learners = (d.children || []).filter(pilotLearner);
  const [childId, setChildId] = useState(
      learners.length === 1 ? learners[0].id : "",
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
  const learner = learners.find((c) => c.id === childId);
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
        <h2>{appText("Keep the brief focused.")}</h2>
        <ol>
          <li>
            <strong>{appText("Choose a topic")}</strong>
            <span>
              {appText(
                "Class, board, subject and the question to work through.",
              )}
            </span>
          </li>
          <li>
            <strong>{appText("Let the expert review")}</strong>
            <span>
              {appText(
                "A ten-minute hold reserves the slot while the expert accepts your scope.",
              )}{" "}
            </span>
          </li>
          <li>
            <strong>{appText("Review and pay")}</strong>
            <span>
              {appText(
                "Checkout confirms payment separately from the final slot allocation.",
              )}{" "}
            </span>
          </li>
        </ol>
        <p>
          {appText("Current development quotes:")}{" "}
          {exactMoney(30000, appLocale)} {appText("for 20 minutes or")}{" "}
          {exactMoney(60000, appLocale)}{" "}
          {appText(
            "for 40 minutes. The saved reservation owns the exact price and policy.",
          )}{" "}
        </p>
      </aside>
      <section className="revision-form">
        <h2>{appText("Plan your revision session")}</h2>
        <p>
          {appText(
            "Keep this page open until your hold is saved. All starts are in IST.",
          )}{" "}
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
                {appText("Learner")}{" "}
                <select
                  aria-label={appText("Learner")}
                  value={childId}
                  onChange={(e) => {
                    setChildId(e.target.value);
                    setReview(false);
                    setAgreed(false);
                  }}
                >
                  <option value="">{appText("Choose a learner")}</option>
                  {learners.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.alias} · {c.board}
                      {appText(", Class")} {c.grade}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {appText("Revision subject")}{" "}
                <select
                  aria-label={appText("Revision subject")}
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setAgreed(false);
                    setReview(false);
                  }}
                >
                  <option>{appText("Maths")}</option>
                  <option>{appText("Science")}</option>
                </select>
              </label>
              <label>
                {appText("Teaching language")}{" "}
                <select
                  aria-label={appText("Teaching language")}
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setAgreed(false);
                    setReview(false);
                  }}
                >
                  <option>{appText("English")}</option>
                  <option>{appText("Hindi")}</option>
                </select>
              </label>
              <label>
                {appText("Session duration")}{" "}
                <select
                  aria-label={appText("Session duration")}
                  value={duration}
                  onChange={(e) => {
                    setDuration(e.target.value);
                    setAgreed(false);
                    setReview(false);
                  }}
                >
                  <option value="20">{appText("20 minutes")}</option>
                  <option value="40">{appText("40 minutes")}</option>
                </select>
              </label>
            </div>
            <label>
              {appText("Revision expert")}{" "}
              <select
                aria-label={appText("Revision expert")}
                value={teacherId}
                onChange={(e) => {
                  setTeacherId(e.target.value);
                  setShowTimes(false);
                  setAgreed(false);
                  setReview(false);
                }}
              >
                <option value="">{appText("Choose an eligible expert")}</option>
                {experts.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ·{" "}
                    {t.subjects
                      .map((value) => appCurriculum(value))
                      .join(" & ")}
                  </option>
                ))}
              </select>
            </label>
            {profiles.isPending && (
              <p role="status">{appText("Loading eligible profiles…")}</p>
            )}
            {profiles.error && (
              <Notice error>{appError(profiles.error.message)}</Notice>
            )}
            {initialTeacher && !expert && (
              <p>
                {appText(
                  "The chosen expert is not in the loaded eligible profiles. Load more profiles or choose another expert.",
                )}{" "}
              </p>
            )}
            {profiles.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                disabled={profiles.isFetching}
                onClick={() => profiles.fetchNextPage()}
              >
                {appText("Load more expert profiles")}{" "}
              </Button>
            )}
            <div className="booking-form-grid">
              <label>
                {appText("Preferred start (IST)")}{" "}
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
                {appText("Check advertised date (IST)")}{" "}
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
              {appText("See available revision times")}{" "}
            </Button>
            {showTimes && times.isPending && expert && (
              <p role="status">{appText("Checking advertised times…")}</p>
            )}
            {showTimes && times.error && (
              <Notice error>{appError(times.error.message)}</Notice>
            )}
            {times.data && showTimes && (
              <div className="revision-available">
                <p>
                  {appText(
                    "Advertised free times for the chosen date. Availability is rechecked when saving.",
                  )}{" "}
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
                      {bookingTime(s.startsAt, appLocale)}
                    </Button>
                  ))}
                {!times.data.pages.some((p) => p.items.length) && (
                  <p>
                    {appText(
                      "No advertised free times for this date. Choose another date.",
                    )}{" "}
                  </p>
                )}
                {times.hasNextPage && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={times.isFetching}
                    onClick={() => times.fetchNextPage()}
                  >
                    {appText("Load more revision times")}{" "}
                  </Button>
                )}
              </div>
            )}
            <label>
              {appText("Topic brief")}{" "}
              <Textarea
                value={topic}
                maxLength={1000}
                rows={4}
                onChange={(e) => {
                  setTopic(e.target.value);
                  setReview(false);
                  setAgreed(false);
                }}
                placeholder={appText(
                  "For example, Class 8 CBSE fractions: converting mixed numbers and checking signs",
                )}
              />
            </label>
            <Button className="button" type="submit">
              {appText("Review session request")}{" "}
            </Button>
          </fieldset>
        </form>
        {review && (
          <div className="checkout-review" ref={confirmation} tabIndex={-1}>
            <h3>{appText("Review your revision request")}</h3>
            <p>
              {learner?.alias} · {appCurriculum(subject)} ·{" "}
              {appCurriculum(language)} · {duration} {appText("minutes with")}{" "}
              {expert?.name}
            </p>
            <p>
              {start &&
                bookingTime(
                  new Date(start + ":00+05:30").toISOString(),
                  appLocale,
                )}{" "}
              {appText("IST")}{" "}
            </p>
            <p>{topic}</p>
            <p>
              {appText(
                "A hold lasts ten minutes. Expert scope acceptance and current availability are required before checkout. No payment or booking confirmation happens at this step.",
              )}{" "}
            </p>
            <fieldset disabled={locked}>
              <label className="booking-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  {appText(
                    "I reviewed this topic, learner, time and hold conditions.",
                  )}{" "}
                </span>
              </label>
              <div className="booking-actions">
                <Button variant="outline" onClick={() => setReview(false)}>
                  {appText("Back to request")}{" "}
                </Button>
                <Button className="button" onClick={submit}>
                  {appText("Request scope & hold slot")}{" "}
                </Button>
              </div>
            </fieldset>
          </div>
        )}
        <Feedback decision={decision} />
        {decision.conflict && (
          <RefreshButton variant="outline" onClick={() => decision.reload()} label={appText("Refresh revision details")} />
        )}
        {saved && (
          <Notice>
            {appText("Hold saved until")}{" "}
            {saved.expiresAt
              ? bookingTime(saved.expiresAt, appLocale)
              : appText("its recorded expiry")}
            .{" "}
            <Link href="/dashboard/bookings" className="inline-link">
              {appText("Review your revision booking")}{" "}
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient();
  async function refresh() {
    const current = await api<Dashboard>("/dashboard");
    client.setQueryData(["dashboard", session.account.id], current);
    return current;
  }
  return (
    <section
      className="reservation-bookings"
      aria-label={appText("Revision and recurring bookings")}
    >
      <div className="booking-section-heading">
        <h2>{appText("Booked learning, clearly tracked.")}</h2>
        {session.account.role === "GUARDIAN" && (
          <Link href="/revision" className="button">
            {appText("Request revision")}{" "}
          </Link>
        )}
      </div>
      <p>
        {appText(
          "Holds, expert acceptance, payment and confirmed bookings remain separate states.",
        )}{" "}
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
          {appText(
            "No revision or recurring reservations in this view. Students can find their own booked lessons and meeting access in",
          )}{" "}
          <Link href="/dashboard/lessons" className="inline-link">
            {appText("Classes & attendance")}{" "}
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

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
            {r.kind === "REVISION"
              ? appText("Focused revision")
              : appText("Recurring lesson")}{" "}
            · {appCurriculum(r.subject)}
          </h3>
          <p>
            {teacher}
            {learner ? appText(" with {0}", [learner]) : ""}
          </p>
        </div>
        <span className="booking-status">
          {appText(
            r.status === "HOLD" && !activeHold
              ? appText("hold expired")
              : r.status.toLowerCase().replaceAll("_", " "),
          )}
        </span>
      </div>
      <p className="booking-time">
        <Clock size={16} aria-hidden="true" />
        {bookingTime(r.startsAt, appLocale)}–{bookingTime(r.endsAt, appLocale)}{" "}
        {appText("IST")}{" "}
      </p>
      {r.topic && <p>{r.topic}</p>}
      {r.kind === "REVISION" && (
        <p>
          {appCurriculum(r.language)} {appText("· Expert scope")}{" "}
          {r.scopeAccepted ? appText("accepted") : appText("pending")} ·{" "}
          {exactMoney(r.amountPaise, appLocale)} · {r.pricePolicyVersion}
        </p>
      )}
      {r.expiresAt && r.status === "HOLD" && (
        <p className="booking-help">
          {appText("Hold expires")} {bookingTime(r.expiresAt, appLocale)}
          {appText(". Expired holds cannot start checkout.")}{" "}
        </p>
      )}
      {r.status === "PAID_UNALLOCATED" && (
        <Notice>
          {appText(
            "Payment was captured but this slot was not allocated. Refund processing needs review; no settled refund or confirmed meeting is promised.",
          )}{" "}
          <Link href="/support" className="inline-link">
            {appText("Contact payment support")}{" "}
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
              {appText("Review topic scope")}{" "}
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
              {appText("Review cancellation")}{" "}
            </Button>
          )}
        <RefreshButton
          variant="outline"
          disabled={decision.busy || decision.uncertain || paymentLocked}
          onClick={() => decision.reload()}
         label={appText("Refresh booking")} />
      </div>
      {form && (
        <div className="checkout-review" ref={focus} tabIndex={-1}>
          <h4>
            {form === "scope"
              ? appText("Review expert scope acceptance")
              : appText("Review reservation cancellation")}
          </h4>
          <p>
            {form === "scope"
              ? appText(
                  "Accept only the brief, learner coverage and session time you can deliver. Payment is still separate.",
                )
              : appText(
                  "This cancels the reservation and its future scheduled lesson/meeting. Captured payments follow the approved policy and refund processing; late cancellation may require support review.",
                )}
          </p>
          <fieldset disabled={locked}>
            {form === "cancel" && (
              <label>
                {appText("Reason for cancellation")}{" "}
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
                  ? appText(
                      "I can deliver this topic brief at the recorded time.",
                    )
                  : appText(
                      "I reviewed the cancellation and pending refund implications.",
                    )}
              </span>
            </label>
            <div className="booking-actions">
              <Button variant="outline" onClick={() => setForm(null)}>
                {appText("Keep booking")}{" "}
              </Button>
              <Button className="button" onClick={save}>
                {form === "scope"
                  ? appText("Accept topic scope")
                  : appText("Confirm cancellation")}
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient();
  if (session.account.role !== "TEACHER") return null;
  return (
    <section
      className="placement-invoices"
      aria-label={appText("Placement invoices")}
    >
      <h3>{appText("Placement invoices")}</h3>
      {d.invoices?.length ? (
        d.invoices.map((i) => {
          const invoice = i as typeof i & {
            version?: number;
            policyVersion?: string;
          };
          return (
            <div key={i.id} className="reservation-card-new">
              <h4>
                {appText("Teacher placement fee ·")}{" "}
                {exactMoney(i.amountPaise, appLocale)}
              </h4>
              <p>
                {appText(i.status.toLowerCase())} ·{" "}
                {invoice.policyVersion || appText("Policy details unavailable")}
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
          {appText(
            "No placement invoices. Each party must independently confirm paid tuition start and receipt first.",
          )}{" "}
        </Notice>
      )}
    </section>
  );
}
