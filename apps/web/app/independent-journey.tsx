"use client";
import { MonthlyHiring } from "./monthly-hiring";
import { RefreshButton } from "../components/ui/refresh-button";
import { minimumHref } from "./tuition-minimum-workspace";
import { useAppTranslation } from "./locale";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, rupees, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import {
  WeeklyAvailability,
  WeeklySummary,
  emptyWeekly,
  weeklyPreferences,
} from "./weekly-availability";
type S = components["schemas"];
const copy = (hi: boolean) => (en: string, hindi: string) => (hi ? hindi : en);
const enc = encodeURIComponent;
export function StudentFeedback({
  decision,
  hindi = false,
}: {
  decision: ReturnType<typeof useDecision>;
  hindi?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  if (!hindi)
    return (
      <>
        <Feedback decision={decision} />
        {decision.conflict && (
          <RefreshButton disabled={decision.busy} onClick={() => decision.reload()} label={appText("Reload current details")} />
        )}
      </>
    );
  return (
    <>
      {decision.error && (
        <Notice error>
          {decision.uncertain
            ? "नतीजे की पुष्टि नहीं हुई। बदलाव करने से पहले वही निर्णय फिर भेजें।"
            : decision.conflict
              ? "जानकारी बदल गई है। नई जानकारी लोड करके फिर समीक्षा करें।"
              : "यह निर्णय पूरा नहीं हुआ। अपनी अनुमति और जानकारी जाँचें और फिर कोशिश करें।"}
        </Notice>
      )}
      {decision.success && (
        <Notice>निर्णय सहेजा गया। नीचे मौजूदा स्थिति देखें।</Notice>
      )}
      {decision.busy && <p role="status">सहेजा जा रहा है…</p>}
      {decision.uncertain && (
        <Button disabled={decision.busy} onClick={() => decision.run()}>
          वही निर्णय फिर भेजें
        </Button>
      )}
      {decision.conflict && (
        <Button disabled={decision.busy} onClick={() => decision.reload()}>
          नई जानकारी लोड करें
        </Button>
      )}
    </>
  );
}
function ListState({
  pending,
  error,
  retry,
  hindi,
}: {
  pending: boolean;
  error: unknown;
  retry: () => unknown;
  hindi: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const t = copy(hindi);
  return (
    <>
      {pending && (
        <p role="status">
          {appText(
            t("Loading current details…", "मौजूदा जानकारी लोड हो रही है…"),
          )}
        </p>
      )}
      {!!error && (
        <Notice error>
          {appText(
            t(
              "These details could not be loaded. Check your access and try again.",
              "जानकारी लोड नहीं हुई। अपनी अनुमति जाँचकर फिर कोशिश करें।",
            ),
          )}{" "}
          <Button variant="outline" onClick={retry}>
            {appText(t("Try again", "फिर कोशिश करें"))}
          </Button>
        </Notice>
      )}
    </>
  );
}
export function IndependentJourney({
  session,
  id,
  hindi = false,
  canManage = true,
  onSaved,
}: {
  session: Session;
  id: string;
  hindi?: boolean;
  canManage?: boolean;
  onSaved: () => Promise<void>;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const t = copy(hindi),
    staff = ["ADMIN", "OPERATOR"].includes(session.account.role),
    teacher = session.account.role === "TEACHER",
    router = useRouter(),
    params = useSearchParams();
  const [order, setOrder] = useState<string[]>([]),
    [review, setReview] = useState<S["StudentShortlistCandidate"] | null>(null),
    [agreed, setAgreed] = useState(false),
    [runReview, setRunReview] = useState(false);
  const q = useQuery({
    queryKey: ["student-shortlist", session.account.id, id],
    queryFn: ({ signal }) =>
      api<S["StudentShortlist"]>(
        "/student-enquiries/" + enc(id) + "/shortlist",
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const r = await q.refetch();
    if (r.error) throw r.error;
    setOrder([]);
    setReview(null);
    setAgreed(false);
    setRunReview(false);
    await onSaved();
  }
  const d = useDecision(session, refresh),
    r = q.data;
  return (
    <section className="student-journey care-section">
      <h2>
        {staff
          ? t("Matching review", "मिलान की समीक्षा")
          : t("Your teacher shortlist", "आपके लिए चुने गए शिक्षक")}
      </h2>
      <StudentFeedback decision={d} hindi={hindi} />
      <ListState
        pending={q.isPending}
        error={q.error}
        retry={() => q.refetch()}
        hindi={hindi}
      />
      {r && !q.error && (
        <>
          <ol
            className="student-progress"
            aria-label={appText(t("Hiring progress", "शिक्षक चुनने की प्रगति"))}
          >
            <li data-complete={r.matchStatus !== "PENDING"}>
              {appText(t("Criteria received", "ज़रूरतें मिलीं"))}
            </li>
            <li data-complete={r.items.some((c) => !!c.position)}>
              {appText(t("Staff shortlist", "स्टाफ़ की सूची"))}
            </li>
            <li data-complete={r.items.some((c) => c.response === "ACCEPTED")}>
              {appText(t("Teacher response", "शिक्षक का जवाब"))}
            </li>
            <li data-complete={!!r.selectedCandidateId}>
              {appText(
                t("Choose and agree terms", "चुनें और शर्तें स्वीकारें"),
              )}
            </li>
          </ol>
          {r.matchStatus === "NO_MATCH" && (
            <Notice>
              {appText(
                t(
                  "No eligible teacher is available for these criteria right now. Keep this enquiry open for staff review, browse other subjects or formats, or withdraw it and send a revised brief.",
                  "अभी इन ज़रूरतों के लिए उपयुक्त शिक्षक उपलब्ध नहीं है। समीक्षा के लिए पूछताछ खुली रखें, दूसरे विषय या तरीके देखें, या इसे वापस लेकर नई ज़रूरतें भेजें।",
                ),
              )}
            </Notice>
          )}
          {!r.items.length && r.matchStatus !== "NO_MATCH" && (
            <Notice>
              {appText(
                t(
                  "Your brief is waiting for a staff-reviewed shortlist. No teacher has been assigned. You can continue browsing while we review it.",
                  "आपकी ज़रूरतों की समीक्षा हो रही है। शिक्षक अभी तय नहीं हुआ है। तब तक आप शिक्षक खोज सकते हैं।",
                ),
              )}
            </Notice>
          )}
          {staff && !r.selectedCandidateId && (
            <div className="student-review-panel">
              <h3>
                {appText(
                  t("Review current eligibility", "मौजूदा पात्रता जाँचें"),
                )}
              </h3>
              <p>
                {appText(
                  t(
                    "Run current coverage, privacy, availability and capacity checks. Results remain private until you publish the chosen order.",
                    "पढ़ाई, गोपनीयता, समय और क्षमता जाँचें। क्रम प्रकाशित करने तक नतीजे निजी रहेंगे।",
                  ),
                )}
              </p>
              <label className="wizard-checkbox">
                <input
                  type="checkbox"
                  checked={runReview}
                  disabled={d.locked}
                  onChange={(e) => setRunReview(e.target.checked)}
                />
                <span>
                  {appText(
                    t(
                      "I reviewed this enquiry and want a fresh matching run.",
                      "मैंने पूछताछ की समीक्षा की है और नया मिलान चाहता/चाहती हूँ।",
                    ),
                  )}
                </span>
              </label>
              <Button
                disabled={d.locked || !runReview}
                onClick={() =>
                  d.run({
                    path: "/admin/student-enquiries/" + id + "/matches",
                    body: { expectedVersion: r.version, confirmed: true },
                    message: "Matching run recorded.",
                  })
                }
              >
                {appText(t("Run matching", "मिलान करें"))}
              </Button>
            </div>
          )}
          <ul className="student-candidate-list">
            {r.items.map((c) => (
              <li key={c.id}>
                <div className="student-candidate-heading">
                  <div>
                    <h3>{c.teacherName}</h3>
                    <p>
                      {rupees(c.monthlyPaise, appLocale)}{" "}
                      {appText(t("per month", "प्रति माह"))}
                    </p>
                  </div>
                  <span className="student-status-tag">
                    {c.response === "ACCEPTED"
                      ? t("Teacher is interested", "शिक्षक इच्छुक हैं")
                      : c.response === "DECLINED"
                        ? t("Teacher declined", "शिक्षक ने मना किया")
                        : t(
                            "Awaiting teacher response",
                            "शिक्षक के जवाब का इंतज़ार",
                          )}
                  </span>
                </div>
                <p>
                  {c.eligibleNow
                    ? t("Fits current criteria", "मौजूदा ज़रूरतों के अनुकूल")
                    : t(
                        "Unavailable, expired or already selected. Ask staff to review again.",
                        "अनुपलब्ध, समय समाप्त या पहले चुना गया। स्टाफ़ से फिर समीक्षा कराएँ।",
                      )}
                </p>
                <p>
                  {appText(t("Response window ends", "जवाब का समय समाप्त"))}{" "}
                  {new Date(c.expiresAt).toLocaleString(
                    hindi ? "hi-IN" : appLocale,
                    { timeZone: "Asia/Kolkata" },
                  )}{" "}
                  {appText("IST")}{" "}
                </p>
                {!d.locked && (
                  <Link
                    className="inline-link"
                    href={"/teachers/" + enc(c.teacherSlug)}
                  >
                    {appText(
                      t("Read teacher profile", "शिक्षक की प्रोफ़ाइल पढ़ें"),
                    )}
                  </Link>
                )}
                {staff && !r.selectedCandidateId && (
                  <label className="wizard-checkbox">
                    <input
                      type="checkbox"
                      checked={order.includes(c.id)}
                      disabled={d.locked || !c.eligibleNow}
                      onChange={(e) =>
                        setOrder(
                          e.target.checked
                            ? [...order, c.id]
                            : order.filter((x) => x !== c.id),
                        )
                      }
                    />
                    <span>
                      {order.includes(c.id)
                        ? t("Publish position ", "प्रकाशन क्रम ") +
                          (order.indexOf(c.id) + 1)
                        : t(
                            "Add to published shortlist",
                            "प्रकाशित सूची में जोड़ें",
                          )}
                    </span>
                  </label>
                )}
                {!staff &&
                  !teacher &&
                  !r.selectedCandidateId &&
                  canManage &&
                  c.response === "ACCEPTED" &&
                  c.eligibleNow && (
                    <Button
                      variant="outline"
                      disabled={d.locked}
                      onClick={() => {
                        setReview(c);
                        setAgreed(false);
                      }}
                    >
                      {appText(
                        t("Review this choice", "इस विकल्प की समीक्षा करें"),
                      )}
                    </Button>
                  )}
              </li>
            ))}
          </ul>
          {staff && order.length > 0 && !r.selectedCandidateId && (
            <div className="student-review-panel">
              <p>
                {appText(
                  t(
                    "Teachers will appear in the order selected. Uncheck and select again to change the order. Publishing invites teacher responses; it does not hire anyone.",
                    "शिक्षक चुने गए क्रम में दिखेंगे। क्रम बदलने के लिए हटाकर फिर चुनें। प्रकाशन केवल जवाब आमंत्रित करता है।",
                  ),
                )}
              </p>
              <Button
                disabled={d.locked}
                onClick={() =>
                  d.run({
                    path: "/admin/student-enquiries/" + id + "/presentations",
                    body: {
                      expectedVersion: r.version,
                      runId: r.runId,
                      candidateIds: order,
                      confirmed: true,
                    },
                    message: "Shortlist published.",
                  })
                }
              >
                {appText(
                  t(
                    "Publish reviewed shortlist",
                    "समीक्षित सूची प्रकाशित करें",
                  ),
                )}
              </Button>
            </div>
          )}
          {review && !r.selectedCandidateId && (
            <div className="student-review-panel">
              <h3>
                {appText(t("Choose ", "चुनें "))}
                {review.teacherName}?
              </h3>
              <p>
                {appText(
                  t(
                    "This opens a separate review of the monthly fee and coordination terms. Both you and the teacher must accept; no classes or payments are booked.",
                    "इससे मासिक फ़ीस और संपर्क की शर्तें खुलेंगी। आपको और शिक्षक को अलग-अलग स्वीकार करना होगा। कोई कक्षा या भुगतान बुक नहीं होगा।",
                  ),
                )}
              </p>
              <label className="wizard-checkbox">
                <input
                  type="checkbox"
                  checked={agreed}
                  disabled={d.locked}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  {appText(
                    t(
                      "I want to review hiring terms with this teacher.",
                      "मैं इस शिक्षक के साथ शर्तों की समीक्षा करना चाहता/चाहती हूँ।",
                    ),
                  )}
                </span>
              </label>
              <div className="care-actions">
                <Button
                  variant="outline"
                  disabled={d.locked}
                  onClick={() => setReview(null)}
                >
                  {appText(t("Keep comparing", "तुलना जारी रखें"))}
                </Button>
                <Button
                  disabled={d.locked || !agreed}
                  onClick={() =>
                    d.run({
                      path: "/student-enquiries/" + id + "/selections",
                      body: {
                        expectedVersion: r.version,
                        candidateId: review.id,
                        candidateVersion: review.version,
                        confirmed: true,
                      },
                      message: "Teacher selected. Review the terms next.",
                      onSaved: (v) =>
                        router.push(
                          "/dashboard/student-arrangements?arrangement=" +
                            (v as S["StudentArrangement"]).id +
                            (params.get("student")
                              ? "&student=" + enc(params.get("student")!)
                              : ""),
                        ),
                    })
                  }
                >
                  {appText(t("Open hiring terms", "शर्तें देखें"))}
                </Button>
              </div>
            </div>
          )}
          {r.selectedCandidateId && !d.locked && (
            <Link
              className="button"
              href={
                "/dashboard/student-arrangements" +
                (params.get("student")
                  ? "?student=" + enc(params.get("student")!)
                  : "")
              }
            >
              {appText(
                t("Continue to hiring terms", "नियुक्ति की शर्तें देखें"),
              )}
            </Link>
          )}
        </>
      )}
    </section>
  );
}
export function StudentOpportunities({
  session,
  hindi = false,
  embedded = false,
}: {
  session: Session;
  hindi?: boolean;
  embedded?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const Heading = embedded ? "h2" : "h1";
  const t = copy(hindi),
    client = useQueryClient(),
    [review, setReview] = useState<{
      item: S["StudentOpportunity"];
      response: "ACCEPTED" | "DECLINED";
    } | null>(null),
    [agreed, setAgreed] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ["student-opportunities", session.account.id],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<S["StudentOpportunityList"]>(
        "/student-opportunities?limit=10" +
          (pageParam ? "&cursor=" + enc(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (r) => r.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const r = await q.refetch();
    if (r.error) throw r.error;
    setReview(null);
    setAgreed(false);
    await client.invalidateQueries({ queryKey: ["student-arrangements"] });
  }
  const d = useDecision(session, refresh);
  return (
    <section className="student-workspace" lang={hindi ? "hi" : "en"}>
      <Heading>
        {appText(
          t(
            "Independent student enquiries",
            "स्वतंत्र विद्यार्थियों की पूछताछ",
          ),
        )}
      </Heading>
      <p>
        {appText(
          t(
            "Review the learning brief before showing interest. Accepting an enquiry starts a conversation; hiring needs a separate mutual agreement.",
            "इच्छा जताने से पहले पढ़ाई की ज़रूरतें देखें। पूछताछ स्वीकारने के बाद भी नियुक्ति के लिए अलग सहमति ज़रूरी है।",
          ),
        )}
      </p>
      <Link className="inline-link" href="/dashboard/student-arrangements">
        {appText(
          t("View student arrangements", "विद्यार्थी की व्यवस्थाएँ देखें"),
        )}
      </Link>
      <StudentFeedback decision={d} hindi={hindi} />
      <ListState
        pending={q.isPending}
        error={q.error}
        retry={() => q.refetch()}
        hindi={hindi}
      />
      {q.data && !q.error && (
        <>
          <ul className="student-candidate-list">
            {q.data.pages
              .flatMap((p) => p.items)
              .map((c) => (
                <li key={c.id}>
                  <h2>
                    {appCurriculum(c.subject)} ·{" "}
                    {c.mode === "HOME"
                      ? t("At home", "घर पर")
                      : t("Online", "ऑनलाइन")}
                  </h2>
                  <p>
                    {c.educationScope.stage === "SCHOOL"
                      ? t("Class ", "कक्षा ") +
                        c.educationScope.grade +
                        " · " +
                        c.educationScope.board
                      : c.educationScope.courseName +
                        " · " +
                        c.educationScope.studyYear}{" "}
                    · {appCurriculum(c.language)}
                  </p>
                  <p>
                    {c.locality} · {rupees(c.budgetPaise, appLocale)}{" "}
                    {appText(t("monthly budget", "मासिक बजट"))}
                  </p>
                  <WeeklySummary preferences={c.preferences} hindi={hindi} />
                  <p>
                    {c.response === "PENDING"
                      ? t("Response needed", "जवाब चाहिए")
                      : c.response === "ACCEPTED"
                        ? t(
                            "You are interested. The student can now choose you.",
                            "आपने रुचि जताई है। विद्यार्थी अब आपको चुन सकता है।",
                          )
                        : t(
                            "You declined this enquiry.",
                            "आपने इस पूछताछ को मना किया।",
                          )}
                  </p>
                  {c.response === "PENDING" && (
                    <div className="care-actions">
                      {(["ACCEPTED", "DECLINED"] as const).map((response) => (
                        <Button
                          key={response}
                          variant={
                            response === "ACCEPTED" ? "default" : "outline"
                          }
                          disabled={d.locked}
                          onClick={() => {
                            setReview({ item: c, response });
                            setAgreed(false);
                          }}
                        >
                          {response === "ACCEPTED"
                            ? t("Review interest", "रुचि की समीक्षा करें")
                            : t("Review decline", "मना करने की समीक्षा करें")}
                        </Button>
                      ))}
                    </div>
                  )}
                  {!d.locked && (
                    <Link
                      className="inline-link"
                      href={"/support?studentEnquiry=" + c.enquiryId}
                    >
                      {appText(t("Get private help", "निजी सहायता लें"))}
                    </Link>
                  )}
                </li>
              ))}
          </ul>
          {!q.data.pages.some((p) => p.items.length) && (
            <Notice>
              {appText(
                t(
                  "No active student opportunities on this page. Keep your coverage and availability current.",
                  "इस पृष्ठ पर सक्रिय पूछताछ नहीं है। पढ़ाने के विषय और उपलब्ध समय अद्यतन रखें।",
                ),
              )}
            </Notice>
          )}
          {q.hasNextPage && (
            <Button
              disabled={d.locked || q.isFetching}
              onClick={() => q.fetchNextPage()}
            >
              {appText(t("Load more enquiries", "और पूछताछ देखें"))}
            </Button>
          )}
        </>
      )}
      {review && (
        <div className="student-review-panel">
          <h2>
            {review.response === "ACCEPTED"
              ? t("Confirm your interest", "अपनी रुचि की पुष्टि करें")
              : t("Decline this enquiry?", "यह पूछताछ मना करें?")}
          </h2>
          <p>
            {appText(
              t(
                "Review the subject, fee range and weekly preferences above. This response does not book a class or confirm a hire.",
                "ऊपर विषय, बजट और साप्ताहिक समय देखें। इस जवाब से कक्षा बुक या नियुक्ति तय नहीं होगी।",
              ),
            )}
          </p>
          <label className="wizard-checkbox">
            <input
              type="checkbox"
              checked={agreed}
              disabled={d.locked}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {appText(
                t(
                  "I reviewed this response.",
                  "मैंने इस जवाब की समीक्षा की है।",
                ),
              )}
            </span>
          </label>
          <div className="care-actions">
            <Button
              variant="outline"
              disabled={d.locked}
              onClick={() => setReview(null)}
            >
              {appText(t("Go back", "वापस जाएँ"))}
            </Button>
            <Button
              disabled={d.locked || !agreed}
              onClick={() =>
                d.run({
                  path: "/student-candidates/" + review.item.id + "/responses",
                  body: {
                    expectedVersion: review.item.version,
                    response: review.response,
                    confirmed: true,
                  },
                  message: "Response recorded.",
                })
              }
            >
              {appText(t("Confirm response", "जवाब की पुष्टि करें"))}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
export function StudentArrangements({
  session,
  hindi = false,
}: {
  session: Session;
  hindi?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const t = copy(hindi),
    params = useSearchParams(),
    studentId =
      session.account.role === "GUARDIAN" ? params.get("student") || "" : "",
    id = params.get("arrangement") || "",
    router = useRouter();
  const q = useInfiniteQuery({
    queryKey: ["student-arrangements", session.account.id, studentId],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<S["StudentArrangementList"]>(
        "/student-arrangements?limit=10" +
          (studentId ? "&studentId=" + enc(studentId) : "") +
          (pageParam ? "&cursor=" + enc(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (r) => r.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <section className="student-workspace" lang={hindi ? "hi" : "en"}>
      <h1>{appText(t("Hiring and arrangements", "नियुक्ति और व्यवस्थाएँ"))}</h1>
      <p>
        {appText(
          t(
            "A clear record of the teacher, agreed fee and each person’s acceptance. Individual classes can be arranged separately.",
            "शिक्षक, सहमत फ़ीस और दोनों की स्वीकृति का साफ़ रिकॉर्ड। अलग-अलग कक्षाएँ बाद में तय की जा सकती हैं।",
          ),
        )}
      </p>
      {id && (
        <StudentArrangementDetail
          key={id + studentId}
          id={id}
          studentId={studentId}
          session={session}
          hindi={hindi}
        />
      )}
      <h2>{appText(t("Arrangement history", "व्यवस्थाओं का इतिहास"))}</h2>
      <ListState
        pending={q.isPending}
        error={q.error}
        retry={() => q.refetch()}
        hindi={hindi}
      />
      {q.data && !q.error && (
        <>
          <ul className="student-candidate-list">
            {q.data.pages
              .flatMap((p) => p.items)
              .map((a) => (
                <li key={a.id}>
                  <h3>
                    {appCurriculum(a.terms.subject)} ·{" "}
                    {rupees(a.terms.monthlyPaise, appLocale)}{" "}
                    {appText(t("per month", "प्रति माह"))}
                  </h3>
                  <p>
                    {a.status === "CONFIRMED"
                      ? t("Both sides confirmed", "दोनों ने पुष्टि की")
                      : a.status === "CLOSED"
                        ? t("Closed", "बंद")
                        : t("Reviewing terms", "शर्तों की समीक्षा")}{" "}
                    · {a.id.slice(0, 8)}
                  </p>
                  <MonthlyHiring session={session} kind="INDEPENDENT" id={a.id}/>
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(
                        "/dashboard/student-arrangements?arrangement=" +
                          a.id +
                          (studentId ? "&student=" + enc(studentId) : ""),
                      )
                    }
                  >
                    {appText(t("View arrangement", "व्यवस्था देखें"))}
                  </Button>
                </li>
              ))}
          </ul>
          {!q.data.pages.some((p) => p.items.length) && (
            <Notice>
              {appText(
                t(
                  "No arrangements yet. Choose an interested teacher from your enquiry shortlist to review terms.",
                  "अभी कोई व्यवस्था नहीं है। शर्तों की समीक्षा के लिए पूछताछ की सूची से इच्छुक शिक्षक चुनें।",
                ),
              )}
            </Notice>
          )}
          {q.hasNextPage && (
            <Button disabled={q.isFetching} onClick={() => q.fetchNextPage()}>
              {appText(t("Load more arrangements", "और व्यवस्थाएँ देखें"))}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
function StudentArrangementDetail({
  session,
  id,
  studentId,
  hindi,
}: {
  session: Session;
  id: string;
  studentId: string;
  hindi: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const t = copy(hindi),
    client = useQueryClient(),
    teacher = session.account.role === "TEACHER",
    staff = ["ADMIN", "OPERATOR"].includes(session.account.role),
    [accepted, setAccepted] = useState(false),
    [closing, setClosing] = useState(false),
    [replacement, setReplacement] = useState(false),
    [reason, setReason] = useState(""),
    [contact, setContact] = useState<{
      email: string | null;
      available: boolean;
    } | null>(null),
    [contactError, setContactError] = useState(""),
    [contactBusy, setContactBusy] = useState(false);
  const q = useQuery({
    queryKey: ["student-arrangement", session.account.id, id],
    queryFn: ({ signal }) =>
      api<S["StudentArrangement"]>("/student-arrangements/" + enc(id), {
        signal,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const shortlist = useQuery({
    queryKey: [
      "student-arrangement-teacher",
      session.account.id,
      id,
      q.data?.enquiryId,
    ],
    queryFn: () =>
      api<S["StudentShortlist"]>(
        "/student-enquiries/" + enc(q.data!.enquiryId!) + "/shortlist",
      ),
    enabled: !!q.data?.enquiryId && !q.error,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const grant = useQuery({
      queryKey: ["student-delegation", session.account.id, studentId],
      queryFn: () =>
        api<S["DelegatedStudentProfile"]>(
          "/delegated-students/" + enc(studentId) + "/profile",
        ),
      enabled: session.account.role === "GUARDIAN" && !!studentId,
      retry: false,
    }),
    canManage =
      session.account.role === "GUARDIAN"
        ? grant.data?.supportMode === "MANAGE"
        : !staff;
  async function refresh() {
    setContact(null);
    setContactError("");
    const r = await q.refetch();
    if (r.error) throw r.error;
    setAccepted(false);
    setClosing(false);
    setReason("");
    await client.invalidateQueries({ queryKey: ["student-arrangements"] });
    await client.invalidateQueries({ queryKey: ["student-enquiries"] });
  }
  const d = useDecision(session, refresh),
    a = q.data;
  async function readContact() {
    setContactBusy(true);
    setContact(null);
    setContactError("");
    try {
      setContact(await api("/student-arrangements/" + id + "/contact"));
    } catch {
      setContactError(
        t(
          "Contact is unavailable. Check both acceptances and use support if access is paused.",
          "संपर्क उपलब्ध नहीं है। दोनों की स्वीकृति जाँचें और ज़रूरत हो तो सहायता लें।",
        ),
      );
    } finally {
      setContactBusy(false);
    }
  }
  return (
    <section className="student-terms-panel">
      <h2>
        {appText(
          t(
            "Review your tuition arrangement",
            "ट्यूशन की व्यवस्था की समीक्षा करें",
          ),
        )}
      </h2>
      <StudentFeedback decision={d} hindi={hindi} />
      <ListState
        pending={q.isPending}
        error={q.error}
        retry={() => q.refetch()}
        hindi={hindi}
      />
      {a && !q.error && (
        <>
          <p>
            <Link
              className="inline-link"
              href={
                minimumHref("INDEPENDENT", a.id) +
                (studentId ? "&student=" + enc(studentId) : "")
              }
            >
              {appText("Minimum tuition, commencement and payment credits")}
            </Link>
          </p>
          <div className="student-terms-layout">
            <div>
              <h3>{appCurriculum(a.terms.subject)}</h3>
              <p>
                {appText(t("Teacher", "शिक्षक"))}:{" "}
                {teacher
                  ? session.account.name
                  : shortlist.data?.items.find(
                      (c) => c.teacherId === a.teacherId,
                    )?.teacherName || a.teacherId.slice(0, 8)}
              </p>
              <p className="student-terms-price">
                {rupees(a.terms.monthlyPaise, appLocale)}{" "}
                <span>{appText(t("per month", "प्रति माह"))}</span>
              </p>
              <dl className="independent-summary">
                <dt>{appText(t("Format", "तरीका"))}</dt>
                <dd>
                  {a.terms.mode === "HOME"
                    ? t("At home", "घर पर")
                    : t("Online", "ऑनलाइन")}{" "}
                  · {appCurriculum(a.terms.language)}
                </dd>
                <dt>
                  {appText(
                    t("Teacher’s lock-in preference", "शिक्षक की अवधि की पसंद"),
                  )}
                </dt>
                <dd>
                  {a.terms.lockInDays === null
                    ? t("Not recorded", "दर्ज नहीं")
                    : a.terms.lockInDays === 0
                      ? t("No lock-in", "कोई बाध्य अवधि नहीं")
                      : a.terms.lockInDays + t(" days", " दिन")}
                </dd>
                <dt>{appText(t("Demo preference", "डेमो की पसंद"))}</dt>
                <dd>
                  {a.terms.demoAvailable
                    ? t("Teacher offers a demo", "शिक्षक डेमो देते हैं")
                    : t("No demo offered", "डेमो नहीं देते")}
                </dd>
                <dt>
                  {appText(
                    t("Placement fee declaration", "प्लेसमेंट फ़ीस की घोषणा"),
                  )}
                </dt>
                <dd>
                  {rupees(a.terms.platformFeePaise, appLocale)} ·{" "}
                  {appText(
                    t(
                      "Recorded; no payment is taken here",
                      "दर्ज है; यहाँ भुगतान नहीं लिया जाता",
                    ),
                  )}
                </dd>
              </dl>
              <p>
                {appText(
                  t(
                    "Learning acceptance is separate from financial commencement. Review the frozen minimum, start confirmations and payment credits before making a financial decision.",
                    "पढ़ाई की स्वीकृति और पैसों की जिम्मेदारी शुरू होने की पुष्टि अलग हैं। पैसों का निर्णय लेने से पहले तय न्यूनतम फ़ीस, शुरुआत की पुष्टि और भुगतान का रिकॉर्ड देखें।",
                  ),
                )}
              </p>
            </div>
            <aside className="student-agreement-status">
              <h3>{appText(t("Agreement status", "सहमति की स्थिति"))}</h3>
              <p>
                {a.studentAcceptedAt
                  ? t("Student side accepted", "विद्यार्थी पक्ष ने स्वीकारा")
                  : t(
                      "Student side pending",
                      "विद्यार्थी पक्ष की स्वीकृति बाकी",
                    )}
              </p>
              <p>
                {a.teacherAcceptedAt
                  ? t("Teacher accepted", "शिक्षक ने स्वीकारा")
                  : t("Teacher acceptance pending", "शिक्षक की स्वीकृति बाकी")}
              </p>
              <strong>
                {a.status === "CONFIRMED"
                  ? t("Both sides confirmed", "दोनों ने पुष्टि की")
                  : a.status === "CLOSED"
                    ? t("Arrangement closed", "व्यवस्था बंद")
                    : t(
                        "Waiting for both acceptances",
                        "दोनों की स्वीकृति का इंतज़ार",
                      )}
              </strong>
              {a.closureReason && <p>{a.closureReason}</p>}
            </aside>
          </div>
          {a.status === "TERMS_PENDING" &&
            canManage &&
            !(teacher ? a.teacherAcceptedAt : a.studentAcceptedAt) && (
              <div className="student-review-panel">
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={d.locked}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>
                    {appText(
                      t(
                        "I accept these exact terms and authorize sharing the student’s and teacher’s account email addresses with each other after both sides confirm.",
                        "मैं ये शर्तें स्वीकार करता/करती हूँ। दोनों की पुष्टि के बाद विद्यार्थी और शिक्षक के खाते के ईमेल एक-दूसरे से साझा करने की अनुमति देता/देती हूँ।",
                      ),
                    )}
                  </span>
                </label>
                <Button
                  disabled={d.locked || !accepted}
                  onClick={() =>
                    d.run({
                      path: "/student-arrangements/" + id + "/acceptances",
                      body: {
                        expectedVersion: a.version,
                        confirmed: true,
                        policyVersion: a.terms.policyVersion,
                        contactShareAccepted: true,
                      },
                      message:
                        "Terms accepted. Current agreement status is shown above.",
                    })
                  }
                >
                  {appText(
                    t("Accept reviewed terms", "समीक्षित शर्तें स्वीकारें"),
                  )}
                </Button>
              </div>
            )}
          {a.status === "CONFIRMED" && canManage && (
            <div className="student-review-panel">
              <h3>
                {appText(
                  t("Coordinate with each other", "आपस में संपर्क करें"),
                )}
              </h3>
              <Button
                disabled={d.locked || contactBusy}
                variant="outline"
                onClick={readContact}
              >
                {contactBusy
                  ? t("Checking access…", "अनुमति जाँच रहे हैं…")
                  : t("Show agreed contact email", "सहमत संपर्क ईमेल देखें")}
              </Button>
              {contactError && <Notice error>{appError(contactError)}</Notice>}
              {contact && (
                <p className="student-contact">
                  {contact.available && contact.email ? (
                    <a href={"mailto:" + contact.email}>{contact.email}</a>
                  ) : (
                    t(
                      "No email is available. Use support.",
                      "ईमेल उपलब्ध नहीं है। सहायता लें।",
                    )
                  )}
                </p>
              )}
            </div>
          )}
          <div className="care-actions">
            {!d.locked && (
              <Link
                className="button secondary"
                href={
                  a.enquiryId &&
                  (session.account.role !== "GUARDIAN" || canManage)
                    ? "/support?studentEnquiry=" + a.enquiryId
                    : "/support"
                }
              >
                {appText(t("Help and progress", "सहायता और प्रगति"))}
              </Link>
            )}
            {a.status !== "CLOSED" && canManage && (
              <>
                <Button
                  variant="outline"
                  disabled={d.locked}
                  onClick={() => {
                    setClosing(!closing);
                    setReplacement(false);
                    setAccepted(false);
                  }}
                >
                  {appText(t("Close arrangement", "व्यवस्था बंद करें"))}
                </Button>
                {!teacher && a.enquiryId && (
                  <Button
                    variant="outline"
                    disabled={d.locked}
                    onClick={() => {
                      setReplacement(!replacement);
                      setClosing(false);
                    }}
                  >
                    {appText(
                      t("Request a different teacher", "दूसरा शिक्षक माँगें"),
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
          {closing && (
            <div className="student-review-panel">
              <h3>
                {appText(t("Close this arrangement?", "यह व्यवस्था बंद करें?"))}
              </h3>
              <p>
                {appText(
                  t(
                    "This closes contact access and releases the teacher’s place. It does not cancel or refund external payments.",
                    "इससे संपर्क की अनुमति और शिक्षक की जगह बंद होगी। बाहरी भुगतान रद्द या वापस नहीं होंगे।",
                  ),
                )}
              </p>
              <label className="field">
                {appText(t("Reason", "कारण"))}
                <Textarea
                  value={reason}
                  maxLength={1000}
                  disabled={d.locked}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="wizard-checkbox">
                <input
                  type="checkbox"
                  checked={accepted}
                  disabled={d.locked}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  {appText(
                    t(
                      "I understand and want to close it.",
                      "मैं समझता/समझती हूँ और इसे बंद करना चाहता/चाहती हूँ।",
                    ),
                  )}
                </span>
              </label>
              <Button
                disabled={d.locked || !accepted || !reason.trim()}
                onClick={() =>
                  d.run({
                    path: "/student-arrangements/" + id + "/closures",
                    body: {
                      expectedVersion: a.version,
                      confirmed: true,
                      reason: reason.trim(),
                    },
                    message: "Arrangement closed.",
                  })
                }
              >
                {appText(t("Confirm closure", "बंद करने की पुष्टि करें"))}
              </Button>
            </div>
          )}
          {replacement && canManage && (
            <StudentReplacement
              session={session}
              arrangement={a}
              studentId={studentId}
              hindi={hindi}
              onSaved={refresh}
            />
          )}
        </>
      )}
    </section>
  );
}
function StudentReplacement({
  session,
  arrangement: a,
  studentId,
  hindi,
  onSaved,
}: {
  session: Session;
  arrangement: S["StudentArrangement"];
  studentId: string;
  hindi: boolean;
  onSaved: () => Promise<void>;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const t = copy(hindi),
    router = useRouter(),
    [weekly, setWeekly] = useState(emptyWeekly),
    [subject, setSubject] = useState(a.terms.subject),
    [mode, setMode] = useState(a.terms.mode),
    [language, setLanguage] = useState(a.terms.language),
    [budget, setBudget] = useState(String(a.terms.monthlyPaise / 100)),
    [locality, setLocality] = useState(""),
    [reason, setReason] = useState(""),
    [review, setReview] = useState<S["StudentReplacementInput"] | null>(null),
    [agreed, setAgreed] = useState(false);
  const q = useQuery({
    queryKey: ["student-replacement-context", session.account.id, studentId],
    queryFn: () =>
      api<S["StudentEnquiryContext"]>(
        studentId
          ? "/delegated-students/" + enc(studentId) + "/enquiry-context"
          : "/independent-student/enquiry-context",
      ),
    retry: false,
  });
  const d = useDecision(session, async () => {
    const result = await q.refetch();
    if (result.error) throw result.error;
    setReview(null);
    setAgreed(false);
    await onSaved();
  });
  function prepare() {
    const prefs = weeklyPreferences(weekly),
      paise = Math.round(Number(budget) * 100);
    if (
      !q.data ||
      q.error ||
      q.data.gate !== "READY" ||
      !prefs ||
      !subject.trim() ||
      !locality.trim() ||
      !reason.trim() ||
      !/^\d+(\.\d{1,2})?$/.test(budget) ||
      !Number.isFinite(paise) ||
      paise < 50000 ||
      paise > 2000000
    ) {
      d.invalid(
        t(
          "Complete every field, use a ₹500–₹20,000 budget and valid nonoverlapping weekly times.",
          "सभी जानकारी भरें, ₹500–₹20,000 बजट और बिना टकराव का समय चुनें।",
        ),
      );
      return;
    }
    setReview({
      expectedVersion: a.version,
      confirmed: true,
      reason: reason.trim(),
      criteria: {
        expectedProfileVersion: q.data.profileVersion,
        subject: subject.trim(),
        mode,
        language,
        locality: locality.trim(),
        budgetPaise: paise,
        preferences: prefs,
      },
    });
    setAgreed(false);
  }
  return (
    <div className="student-review-panel student-enquiry-form">
      <h3>
        {appText(
          t("Review a replacement brief", "बदले हुए शिक्षक की ज़रूरतें देखें"),
        )}
      </h3>
      <StudentFeedback decision={d} hindi={hindi} />
      <ListState
        pending={q.isPending}
        error={q.error}
        retry={() => q.refetch()}
        hindi={hindi}
      />
      {!review ? (
        <fieldset disabled={d.locked}>
          <legend>
            {appText(t("Your updated criteria", "आपकी नई ज़रूरतें"))}
          </legend>
          <div className="student-fields">
            <label className="field">
              {appText(t("Subject", "विषय"))}
              <Input
                value={subject}
                maxLength={60}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label className="field">
              {appText(t("Format", "तरीका"))}
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="ONLINE">{appText(t("Online", "ऑनलाइन"))}</option>
                <option value="HOME">{appText(t("At home", "घर पर"))}</option>
              </select>
            </label>
            <label className="field">
              {appText(t("Language", "भाषा"))}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                <option value="English">
                  {appText(t("English", "अंग्रेज़ी"))}
                </option>
                <option value="Hindi">{appText(t("Hindi", "हिंदी"))}</option>
              </select>
            </label>
            <label className="field">
              {appText(t("Locality", "इलाका"))}
              <Input
                value={locality}
                maxLength={80}
                onChange={(e) => setLocality(e.target.value)}
              />
            </label>
            <label className="field">
              {appText(t("Monthly budget (₹)", "मासिक बजट (₹)"))}
              <Input
                value={budget}
                inputMode="decimal"
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            {appText(
              t(
                "Why do you need a replacement?",
                "शिक्षक क्यों बदलना चाहते हैं?",
              ),
            )}
            <Textarea
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <WeeklyAvailability
            rows={weekly}
            onChange={setWeekly}
            hindi={hindi}
          />
          <Button
            disabled={
              !q.data || q.isFetching || !!q.error || q.data.gate !== "READY"
            }
            onClick={prepare}
          >
            {appText(t("Review replacement", "बदलाव की समीक्षा करें"))}
          </Button>
        </fieldset>
      ) : (
        <>
          <p>
            {appCurriculum(review.criteria.subject)} ·{" "}
            {appText(review.criteria.mode)} ·{" "}
            {appCurriculum(review.criteria.language)} ·{" "}
            {review.criteria.locality} ·{" "}
            {rupees(review.criteria.budgetPaise, appLocale)}
          </p>
          <p>{review.reason}</p>
          <WeeklySummary
            preferences={review.criteria.preferences}
            hindi={hindi}
          />
          <Notice>
            {appText(
              t(
                "Confirming closes this arrangement and its contact access, creates a fresh assisted enquiry and a private replacement support request. The previous teacher is excluded. A replacement is not guaranteed and external payments are unchanged.",
                "पुष्टि करने से मौजूदा व्यवस्था और संपर्क बंद होगा। नई सहायक पूछताछ और निजी सहायता अनुरोध बनेगा। पुराना शिक्षक बाहर रहेगा। नया शिक्षक मिलने की गारंटी नहीं है और बाहरी भुगतान नहीं बदलेंगे।",
              ),
            )}
          </Notice>
          <label className="wizard-checkbox">
            <input
              type="checkbox"
              checked={agreed}
              disabled={d.locked}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {appText(
                t(
                  "I reviewed the brief and want to request a different teacher.",
                  "मैंने ज़रूरतें देखी हैं और दूसरा शिक्षक चाहता/चाहती हूँ।",
                ),
              )}
            </span>
          </label>
          <div className="care-actions">
            <Button
              variant="outline"
              disabled={d.locked}
              onClick={() => setReview(null)}
            >
              {appText(t("Edit brief", "जानकारी बदलें"))}
            </Button>
            <Button
              disabled={d.locked || !agreed}
              onClick={() =>
                d.run({
                  path: "/student-arrangements/" + a.id + "/replacements",
                  body: review,
                  message: "Replacement request recorded.",
                  onSaved: (v) =>
                    router.push(
                      "/dashboard/student-enquiries?enquiry=" +
                        (v as S["StudentEnquiry"]).id +
                        (studentId ? "&student=" + enc(studentId) : ""),
                    ),
                })
              }
            >
              {appText(
                t(
                  "Confirm replacement request",
                  "बदलाव के अनुरोध की पुष्टि करें",
                ),
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function StudentLearningSummary({
  session,
  hindi = false,
}: {
  session: Session;
  hindi?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const t = copy(hindi),
    enquiries = useQuery({
      queryKey: ["student-enquiries", "home", session.account.id],
      queryFn: ({ signal }) =>
        api<S["StudentEnquiryList"]>("/student-enquiries?limit=3", { signal }),
      retry: false,
    }),
    arrangements = useQuery({
      queryKey: ["student-arrangements", "home", session.account.id],
      queryFn: ({ signal }) =>
        api<S["StudentArrangementList"]>("/student-arrangements?limit=3", {
          signal,
        }),
      retry: false,
    });
  return (
    <section className="care-section">
      <h2>
        {appText(t("Your next learning decision", "पढ़ाई का आपका अगला निर्णय"))}
      </h2>
      <p>
        {appText(
          t(
            "Follow teacher responses and mutual agreement here. Open the full enquiry and arrangement histories to see more.",
            "शिक्षक के जवाब और दोनों की सहमति यहाँ देखें। और रिकॉर्ड के लिए पूछताछ और व्यवस्थाओं का पूरा इतिहास खोलें।",
          ),
        )}
      </p>
      <div className="student-fields">
        <section>
          <h3>{appText(t("Enquiry overview", "पूछताछ का अवलोकन"))}</h3>
          <ListState
            pending={enquiries.isPending}
            error={enquiries.error}
            retry={() => enquiries.refetch()}
            hindi={hindi}
          />
          {enquiries.data && !enquiries.error && (
            <>
              {!enquiries.data.items.length && (
                <p>
                  {appText(
                    t(
                      "No enquiries yet. Start with teacher search or an assisted brief.",
                      "अभी पूछताछ नहीं है। शिक्षक खोजें या मदद से खोजने का अनुरोध भेजें।",
                    ),
                  )}
                </p>
              )}
              <ul className="student-candidate-list">
                {enquiries.data.items.map((e) => (
                  <li key={e.id}>
                    <strong>{appCurriculum(e.subject)}</strong>
                    <p>
                      {e.status === "HIRED"
                        ? t("Both sides confirmed", "दोनों ने पुष्टि की")
                        : e.status === "WITHDRAWN"
                          ? t("Withdrawn", "वापस ली गई")
                          : e.matchStatus === "NO_MATCH"
                            ? t(
                                "Awaiting a suitable teacher",
                                "उपयुक्त शिक्षक का इंतज़ार",
                              )
                            : t(
                                "Review teacher progress",
                                "शिक्षक की प्रगति देखें",
                              )}
                    </p>
                    <Link
                      className="inline-link"
                      href={"/dashboard/enquiries?enquiry=" + e.id}
                    >
                      {appText(t("Open enquiry", "पूछताछ खोलें"))}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link className="inline-link" href="/dashboard/enquiries">
                {appText(t("All enquiry history", "पूछताछ का पूरा इतिहास"))}
              </Link>
            </>
          )}
        </section>
        <section>
          <h3>{appText(t("Arrangement overview", "व्यवस्थाओं का अवलोकन"))}</h3>
          <ListState
            pending={arrangements.isPending}
            error={arrangements.error}
            retry={() => arrangements.refetch()}
            hindi={hindi}
          />
          {arrangements.data && !arrangements.error && (
            <>
              {!arrangements.data.items.length && (
                <p>
                  {appText(
                    t(
                      "After an interested teacher is chosen, review the exact terms here.",
                      "इच्छुक शिक्षक चुनने के बाद यहाँ शर्तों की समीक्षा करें।",
                    ),
                  )}
                </p>
              )}
              <ul className="student-candidate-list">
                {arrangements.data.items.map((a) => (
                  <li key={a.id}>
                    <strong>
                      {appCurriculum(a.terms.subject)} ·{" "}
                      {rupees(a.terms.monthlyPaise, appLocale)}
                    </strong>
                    <p>
                      {a.status === "CONFIRMED"
                        ? t("Both sides confirmed", "दोनों ने पुष्टि की")
                        : a.status === "CLOSED"
                          ? t("Closed", "बंद")
                          : t("Acceptance needed", "स्वीकृति चाहिए")}
                    </p>
                    <Link
                      className="inline-link"
                      href={
                        "/dashboard/student-arrangements?arrangement=" + a.id
                      }
                    >
                      {appText(t("Review arrangement", "व्यवस्था देखें"))}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                className="inline-link"
                href="/dashboard/student-arrangements"
              >
                {appText(t("All arrangements", "सभी व्यवस्थाएँ"))}
              </Link>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
