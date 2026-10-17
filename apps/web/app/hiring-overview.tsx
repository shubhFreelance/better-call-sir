"use client";
import { useAppTranslation } from "./locale";
import { educationLabel } from "./learner-education";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, ShieldCheck, ArrowUpRight } from "lucide-react";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
type View = components["schemas"]["HiringDashboard"];
type Enquiry = components["schemas"]["HiringEnquiry"];
type Arrangement = components["schemas"]["HiringArrangement"];
const label = (s: string) => s.toLowerCase().replaceAll("_", " ");
const date = (s: string, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(s));
const money = (n: number, locale = "en-IN") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n / 100);
export function HiringOverview({ session }: { session: Session }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const arrangementId = useSearchParams().get("arrangement");
  const role = session.account.role,
    guardian = role === "GUARDIAN",
    student = role === "STUDENT",
    teacher = role === "TEACHER",
    admin = role === "ADMIN";
  const [section, setSection] = useState<"ENQUIRIES" | "ARRANGEMENTS">(
      arrangementId ? "ARRANGEMENTS" : "ENQUIRIES",
    ),
    [cursors, setCursors] = useState<string[]>([]),
    [selected, setSelected] = useState<Enquiry | null>(null),
    [terms, setTerms] = useState<Arrangement | null>(null),
    [response, setResponse] = useState("ACCEPTED"),
    [ack, setAck] = useState(false);
  const termsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (terms) termsHeading.current?.focus();
  }, [terms?.id]);
  const params = new URLSearchParams({ section });
  if (arrangementId && section === "ARRANGEMENTS")
    params.set("arrangementId", arrangementId);
  else if (cursors.at(-1)) params.set("cursor", cursors.at(-1)!);
  const query = useQuery({
    queryKey: ["hiring-dashboard", session.account.id, params.toString()],
    queryFn: ({ signal }) =>
      api<View>("/dashboard/hiring?" + params, { signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const r = await query.refetch();
    if (r.error) throw r.error;
    if (terms) {
      setTerms(r.data?.arrangements.find((p) => p.id === terms.id) || null);
      setAck(false);
    }
    if (selected) {
      setSelected(r.data?.enquiries.find((e) => e.id === selected.id) || null);
      setAck(false);
    }
  }
  const decision = useDecision(session, refresh),
    data = query.data,
    locked = !!selected || !!terms || decision.locked;
  return (
    <div className="care-workspace hiring-overview">
      <section className="hiring-intro">
        <div>
          <span className="hiring-mark">
            {admin ? (
              <ShieldCheck size={26} aria-hidden="true" />
            ) : teacher ? (
              <Users size={26} aria-hidden="true" />
            ) : (
              <Search size={26} aria-hidden="true" />
            )}
          </span>
          <h2>
            {admin
              ? appText("A clear view of the marketplace.")
              : teacher
                ? appText("Your next teaching opportunity.")
                : student
                  ? appText("Your next step in learning.")
                  : appText("Your family’s learning, together.")}
          </h2>
          <p>
            {admin
              ? appText(
                  "Follow enquiries, screening and arrangements. Open the right queue to act on recorded evidence.",
                )
              : teacher
                ? appText(
                    "Keep your application current, review assigned enquiries and follow your teaching arrangements.",
                  )
                : student
                  ? appText(
                      "Explore teachers and see your own search progress. Your guardian sends enquiries and confirms arrangements.",
                    )
                  : appText(
                      "Find a teacher who fits, follow your enquiries and keep every choice in view.",
                    )}
          </p>
        </div>
        <div className="hiring-intro-actions">
          {teacher ? (
            <Link className="button" href="/onboarding/teacher">
              {appText("Review your application")}{" "}
            </Link>
          ) : admin ? (
            <Link className="button" href="/dashboard/admin">
              {appText("Open control console")}{" "}
            </Link>
          ) : (
            <>
              <Link className="button" href="/teachers">
                {appText("Find a teacher")} <ArrowUpRight size={17} />
              </Link>
              <Link className="button secondary" href="/teachers?tab=assisted">
                {appText("Let us search for you")}{" "}
              </Link>
            </>
          )}
        </div>
      </section>
      {query.isPending && (
        <p role="status">{appText("Loading your hiring overview…")}</p>
      )}
      {query.error && (
        <Notice error>
          {appText("Your hiring overview could not be refreshed.")}{" "}
          {data
            ? appText(
                "The displayed records are from the last successful read.",
              )
            : appText(
                "Counts are unavailable; this is not an empty enquiry list.",
              )}{" "}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => query.refetch()}
          >
            {appText("Retry hiring overview")}{" "}
          </Button>
          {cursors.length > 0 && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => setCursors([])}
            >
              {appText("Return to first page")}{" "}
            </Button>
          )}
        </Notice>
      )}
      {arrangementId && section === "ARRANGEMENTS" && (
        <Notice>
          {appText("Viewing the linked hiring arrangement.")}{" "}
          <Link href="/dashboard" className="inline-link">
            {appText("View all hiring records")}{" "}
          </Link>
        </Notice>
      )}
      <Feedback decision={decision} />
      {data && (
        <>
          <div className="hiring-snapshot">
            <span>
              {appText("Current records · Updated")}{" "}
              {date(data.asOf, appLocale)} {appText("IST")}
            </span>
            <Button
              variant="outline"
              disabled={locked || query.isFetching}
              onClick={() => query.refetch()}
            >
              {appText("Refresh overview")}{" "}
            </Button>
          </div>
          {guardian &&
            data.gate &&
            (!data.gate.verified ||
              !data.gate.consent ||
              data.gate.privacyPaused) && (
              <Notice>
                {data.gate.privacyPaused
                  ? appText(
                      "New tuition decisions are paused while your deletion request is reviewed.",
                    )
                  : !data.gate.verified
                    ? appText(
                        "Guardian verification is pending. Complete verification before submitting learner details.",
                      )
                    : appText(
                        "Guardian consent is missing or withdrawn. Review your permission before starting a new enquiry.",
                      )}{" "}
                <Link
                  href={
                    data.gate.privacyPaused
                      ? "/dashboard/privacy"
                      : "/onboarding/guardian"
                  }
                  className="inline-link"
                >
                  {data.gate.privacyPaused
                    ? appText("Review privacy request")
                    : appText("Review guardian onboarding")}
                </Link>
              </Notice>
            )}
          <dl className="hiring-counts">
            {[
              [
                teacher ? "Assigned enquiries" : "Enquiries",
                data.counts.enquiries,
              ],
              [
                teacher ? "Awaiting your response" : "Open enquiries",
                teacher
                  ? data.counts.pendingResponses
                  : data.counts.openEnquiries,
              ],
              ["Awaiting tuition start", data.counts.termsPending],
              ["Active arrangements", data.counts.activeArrangements],
            ].map(([name, value]) => (
              <div key={name}>
                <dt>{appText(name)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {admin && data.operations ? (
            <AdminQueues operations={data.operations} />
          ) : (
            <>
              {teacher && (
                <section className="care-card hiring-profile">
                  <div className="hiring-section-heading">
                    <h3>{appText("Your teaching application")}</h3>
                    <Link href="/onboarding/teacher" className="inline-link">
                      {appText("Review profile & evidence")}{" "}
                    </Link>
                  </div>
                  {data.profile ? (
                    <>
                      <strong>{data.profile.name}</strong>
                      <p>
                        {data.profile.subjects
                          .map((value) => appCurriculum(value))
                          .join(" & ")}
                      </p>
                      <dl className="hiring-details">
                        <div>
                          <dt>{appText("Application status")}</dt>
                          <dd>{appText(label(data.profile.status))}</dd>
                        </div>
                        <div>
                          <dt>{appText("Screening evidence")}</dt>
                          <dd>
                            {data.profile.screeningComplete &&
                            data.profile.screeningValidUntil &&
                            new Date(data.profile.screeningValidUntil) >
                              new Date()
                              ? appText("Recorded and current")
                              : appText("Pending or needs renewal")}
                          </dd>
                        </div>
                        <div>
                          <dt>{appText("Fee terms")}</dt>
                          <dd>
                            {data.profile.feeTermsAccepted
                              ? appText("Acceptance recorded")
                              : appText("Acceptance pending")}
                          </dd>
                        </div>
                      </dl>
                      <p className="care-help">
                        {appText(
                          "Approval, current screening and fit are required for an actionable enquiry. A profile status is not a guarantee of teaching work.",
                        )}{" "}
                      </p>
                    </>
                  ) : (
                    <p>
                      {appText(
                        "No teaching application yet. Create your profile and provide evidence to join the review process.",
                      )}{" "}
                    </p>
                  )}
                </section>
              )}
              <section className="hiring-records">
                <Tabs
                  value={section}
                  onValueChange={(v) => {
                    if (locked) return;
                    setSection(v as typeof section);
                    setCursors([]);
                  }}
                >
                  <TabsList
                    className="care-tabs"
                    aria-label={appText("Hiring records")}
                  >
                    <TabsTrigger value="ENQUIRIES" disabled={locked}>
                      {teacher
                        ? appText("Assigned enquiries")
                        : appText("Enquiry progress")}
                    </TabsTrigger>
                    <TabsTrigger value="ARRANGEMENTS" disabled={locked}>
                      {student
                        ? appText("Your teacher")
                        : appText("Teaching arrangements")}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="ENQUIRIES">
                    <div className="hiring-section-heading">
                      <h3>
                        {teacher
                          ? appText("Review your assigned enquiries")
                          : student
                            ? appText("Your teacher search progress")
                            : appText("Your teacher enquiries")}
                      </h3>
                      {guardian &&
                        data.gate?.verified &&
                        data.gate.consent &&
                        !data.gate.privacyPaused && (
                          <Link
                            className="inline-link"
                            href="/onboarding/parent"
                          >
                            {appText("New tuition enquiry")}{" "}
                          </Link>
                        )}
                    </div>
                    <p className="care-help">
                      {teacher
                        ? appText(
                            "Only currently presented enquiries with active family permission appear here. Expressing interest does not confirm hiring.",
                          )
                        : appText(
                            "A reviewed shortlist, a saved choice and an agreed arrangement are separate steps. Open an enquiry to review the details.",
                          )}
                    </p>
                    {!data.enquiries.length ? (
                      <section className="care-card">
                        <h4>
                          {teacher
                            ? appText("No current assigned enquiries")
                            : student
                              ? appText("No teacher enquiry recorded yet")
                              : appText("Ready to find your teacher?")}
                        </h4>
                        <p>
                          {teacher
                            ? appText(
                                "Keep your profile and availability current. Enquiries appear when they are presented to you and the family’s permission is active.",
                              )
                            : student
                              ? appText(
                                  "You can browse teacher profiles. Your guardian can tell us what you need and submit an enquiry.",
                                )
                              : appText(
                                  "Browse profiles yourself or share your criteria for a reviewed shortlist.",
                                )}
                        </p>
                        {!teacher && (
                          <Link className="inline-link" href="/teachers">
                            {appText("Explore teacher profiles")}{" "}
                          </Link>
                        )}
                      </section>
                    ) : (
                      <div className="hiring-card-grid">
                        {data.enquiries.map((e) => (
                          <article
                            className="care-card hiring-record"
                            key={e.id}
                            aria-label={appText("{0} enquiry{1}", [
                              e.subject,
                              e.learner.alias
                                ? appText(" for ") + e.learner.alias
                                : "",
                            ])}
                          >
                            <div className="hiring-section-heading">
                              <h4>{appCurriculum(e.subject)}</h4>
                              <span className="hiring-state">
                                {e.status === "OPEN"
                                  ? appText("Enquiry open")
                                  : appText(label(e.status))}
                              </span>
                            </div>
                            <p>
                              {e.learner.alias && (
                                <strong>{e.learner.alias} · </strong>
                              )}
                              {appText(educationLabel(e.learner))}
                            </p>
                            <dl className="hiring-details">
                              <div>
                                <dt>{appText("Search path")}</dt>
                                <dd>
                                  {e.discoveryMethod === "MANUAL"
                                    ? appText("Manual search")
                                    : appText("Let us search for you")}
                                </dd>
                              </div>
                              <div>
                                <dt>{appText("Teaching preference")}</dt>
                                <dd>
                                  {e.mode === "HOME"
                                    ? appText("At home")
                                    : appText("Online")}{" "}
                                  · {appCurriculum(e.language)}
                                </dd>
                              </div>
                              <div>
                                <dt>{appText("Locality")}</dt>
                                <dd>{e.locality}</dd>
                              </div>
                              {guardian && e.budgetPaise !== undefined && (
                                <div>
                                  <dt>{appText("Monthly budget")}</dt>
                                  <dd>{money(e.budgetPaise, appLocale)}</dd>
                                </div>
                              )}
                              <div>
                                <dt>{appText("Matching status")}</dt>
                                <dd>{appText(label(e.matchStatus))}</dd>
                              </div>
                              <div>
                                <dt>{appText("Teacher choice")}</dt>
                                <dd>
                                  {e.candidate
                                    ? e.candidate.selected
                                      ? appText("Family selected you")
                                      : appText("No selection of you recorded")
                                    : e.hasSelection
                                      ? appText("Choice recorded")
                                      : appText("Not chosen yet")}
                                </dd>
                              </div>
                              {e.candidate && (
                                <div>
                                  <dt>{appText("Your response")}</dt>
                                  <dd>
                                    {appText(label(e.candidate.response))}
                                  </dd>
                                </div>
                              )}
                            </dl>
                            <p className="care-help">
                              {appText("Submitted")}{" "}
                              {date(e.createdAt, appLocale)}{" "}
                              {appText("IST")}{" "}
                            </p>
                            <Link
                              className="inline-link"
                              href={`/support?request=${e.id}`}
                            >
                              {appText(
                                "Help and case progress for this enquiry",
                              )}{" "}
                            </Link>
                            {e.candidate ? (
                              <>
                                <p className="hiring-next">
                                  {e.candidate.response !== "PENDING"
                                    ? appText(
                                        "Your response is recorded. The guardian reviews their choice and opens hiring terms. Check Teaching arrangements to review and confirm any shared terms.",
                                      )
                                    : !e.candidate.eligible
                                      ? appText(
                                          "Current fit could not be confirmed. Refresh or review your availability before responding.",
                                        )
                                      : appText(
                                          "Review the learner’s needs before expressing interest or declining.",
                                        )}
                                </p>
                                <Button
                                  variant="outline"
                                  disabled={
                                    locked ||
                                    !!query.error ||
                                    !e.candidate.eligible ||
                                    e.candidate.response !== "PENDING"
                                  }
                                  onClick={() => {
                                    setSelected(e);
                                    setAck(false);
                                    setResponse("ACCEPTED");
                                  }}
                                >
                                  {appText("Review opportunity response")}{" "}
                                </Button>
                              </>
                            ) : guardian ? (
                              <Link
                                className="inline-link"
                                href={`/dashboard/requests?request=${e.id}`}
                              >
                                {appText("Open enquiry & teacher options")}{" "}
                              </Link>
                            ) : (
                              <p className="hiring-next">
                                {appText(
                                  "Your guardian reviews the teacher options and confirms the arrangement.",
                                )}{" "}
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="ARRANGEMENTS">
                    <h3>
                      {student
                        ? appText("Your teacher arrangements")
                        : appText("Your teaching arrangements")}
                    </h3>
                    <p className="care-help">
                      {appText(
                        "A saved choice or accepted term is not proof that teaching has started. These are the current recorded arrangement states.",
                      )}{" "}
                    </p>
                    {!data.arrangements.length ? (
                      <section className="care-card">
                        <h4>{appText("No arrangement recorded yet")}</h4>
                        <p>
                          {teacher
                            ? appText(
                                "Your assigned enquiries are the next place to review.",
                              )
                            : appText(
                                "Find a suitable teacher and review your enquiry progress.",
                              )}
                        </p>
                      </section>
                    ) : (
                      <div className="hiring-card-grid">
                        {data.arrangements.map((p) => (
                          <article
                            className="care-card hiring-record"
                            key={p.id}
                            aria-label={appText("{0} arrangement with {1}", [
                              p.subject,
                              p.teacher.name,
                            ])}
                          >
                            <div className="hiring-section-heading">
                              <h4>{p.teacher.name}</h4>
                              <span className="hiring-state">
                                {p.status === "CLOSED"
                                  ? appText("Closed")
                                  : p.guardianAccepted && p.teacherAccepted
                                    ? appText("Hiring terms confirmed")
                                    : appText("Hiring terms pending")}
                              </span>
                            </div>
                            <p>
                              {appCurriculum(p.subject)} ·{" "}
                              {p.mode === "HOME"
                                ? appText("At home")
                                : appText("Online")}{" "}
                              · {p.learner.alias}
                            </p>
                            <dl className="hiring-details">
                              <div>
                                <dt>{appText("Teacher profile")}</dt>
                                <dd>{appText(label(p.teacher.status))}</dd>
                              </div>
                              <div>
                                <dt>{appText("Guardian terms")}</dt>
                                <dd>
                                  {p.guardianAccepted
                                    ? appText("Acceptance recorded")
                                    : appText("Pending")}
                                </dd>
                              </div>
                              <div>
                                <dt>{appText("Teacher terms")}</dt>
                                <dd>
                                  {p.teacherAccepted
                                    ? appText("Acceptance recorded")
                                    : appText("Pending")}
                                </dd>
                              </div>
                              <div>
                                <dt>{appText("Start evidence")}</dt>
                                <dd>
                                  {p.guardianStarted &&
                                  p.teacherReceiptConfirmed
                                    ? appText("Both confirmations recorded")
                                    : appText("Not independently confirmed")}
                                </dd>
                              </div>
                              {!student && p.monthlyPaise !== undefined && (
                                <div>
                                  <dt>{appText("Recorded monthly terms")}</dt>
                                  <dd>{money(p.monthlyPaise, appLocale)}</dd>
                                </div>
                              )}
                            </dl>
                            <p className="hiring-next">
                              {p.status === "CLOSED"
                                ? appText(
                                    "This arrangement is closed. Its recorded terms remain available for reference.",
                                  )
                                : p.guardianAccepted && p.teacherAccepted
                                  ? appText(
                                      "Both parties have confirmed the hiring terms. This does not confirm a lesson, tuition payment or service start.",
                                    )
                                  : student
                                    ? appText(
                                        "Your guardian and teacher review and confirm the hiring terms.",
                                      )
                                    : (guardian && p.guardianAccepted) ||
                                        (teacher && p.teacherAccepted)
                                      ? appText(
                                          "Your acceptance is recorded. Waiting for the other party to confirm the same terms.",
                                        )
                                      : appText(
                                          "Review the monthly terms and policy before accepting. A demo and class timetable are not required to accept hiring terms.",
                                        )}
                            </p>
                            {(guardian || teacher) && (
                              <Button
                                variant="outline"
                                disabled={
                                  locked || !!query.error || query.isFetching
                                }
                                onClick={() => {
                                  setTerms(p);
                                  setAck(false);
                                }}
                              >
                                {appText("Review hiring terms")}{" "}
                              </Button>
                            )}
                            <Link
                              className="inline-link"
                              href={`/support?placement=${p.id}`}
                            >
                              {appText("Help and case progress")}{" "}
                            </Link>
                            {guardian && (
                              <Link
                                href={`/dashboard/arrangements?placement=${p.id}`}
                                className="inline-link"
                              >
                                {appText("Support or replacement")}{" "}
                              </Link>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
                {(data.nextCursor || cursors.length > 0) && (
                  <div className="hiring-pagination">
                    <Button
                      variant="outline"
                      disabled={
                        locked ||
                        query.isFetching ||
                        !!query.error ||
                        !cursors.length
                      }
                      onClick={() => setCursors((v) => v.slice(0, -1))}
                    >
                      {appText("Previous records")}{" "}
                    </Button>
                    <span>
                      {appText("Page")} {cursors.length + 1}
                    </span>
                    <Button
                      variant="outline"
                      disabled={
                        locked ||
                        query.isFetching ||
                        !!query.error ||
                        !data.nextCursor
                      }
                      onClick={() =>
                        setCursors((v) => [...v, data.nextCursor!])
                      }
                    >
                      {appText("Next records")}{" "}
                    </Button>
                  </div>
                )}
              </section>
              {terms && (
                <section
                  className="care-card hiring-terms-review"
                  aria-label={appText("Hiring terms review")}
                >
                  <h3 ref={termsHeading} tabIndex={-1}>
                    {appText("Review hiring terms")}{" "}
                  </h3>
                  <p>
                    {terms.teacher.name} · {terms.learner.alias} ·{" "}
                    {appCurriculum(terms.subject)} ·{" "}
                    {terms.mode === "HOME"
                      ? appText("Home tuition")
                      : appText("Online tuition")}
                  </p>
                  <dl className="hiring-details">
                    <div>
                      <dt>{appText("Monthly tuition")}</dt>
                      <dd>
                        {terms.monthlyPaise !== undefined
                          ? money(terms.monthlyPaise, appLocale)
                          : appText("Unavailable")}
                      </dd>
                    </div>
                    <div>
                      <dt>{appText("Recorded policy")}</dt>
                      <dd>{terms.policyVersion || appText("Unavailable")}</dd>
                    </div>
                    <div>
                      <dt>{appText("Guardian acceptance")}</dt>
                      <dd>
                        {terms.guardianAccepted
                          ? appText("Recorded")
                          : appText("Pending")}
                      </dd>
                    </div>
                    <div>
                      <dt>{appText("Teacher acceptance")}</dt>
                      <dd>
                        {terms.teacherAccepted
                          ? appText("Recorded")
                          : appText("Pending")}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    {appText(
                      "Tuition is paid directly to the teacher. Accepting these terms does not charge either party or confirm that teaching has started.",
                    )}{" "}
                  </p>
                  <p className="care-help">
                    {appText("Proposed teacher placement fee:")}{" "}
                    {terms.placementFeePaise !== undefined
                      ? money(terms.placementFeePaise, appLocale)
                      : appText("Unavailable")}
                    {appText(
                      ", only after separate service-start and tuition-receipt evidence. Final live commercial terms remain under review.",
                    )}{" "}
                  </p>
                  <p className="hiring-next">
                    {appText(
                      "A demo is optional. You can confirm hiring terms without booking a class or agreeing a class timetable.",
                    )}{" "}
                  </p>
                  {terms.status === "CLOSED" ? (
                    <p>
                      {appText(
                        "This arrangement is closed. Further acceptances are unavailable.",
                      )}{" "}
                    </p>
                  ) : (
                      guardian ? terms.guardianAccepted : terms.teacherAccepted
                    ) ? (
                    <p>
                      {appText("Your acceptance is already recorded.")}{" "}
                      {terms.guardianAccepted && terms.teacherAccepted
                        ? appText(
                            " Both parties have confirmed the hiring terms.",
                          )
                        : appText(" Waiting for the other party.")}
                    </p>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!ack) {
                          decision.invalid(
                            "Review and acknowledge the hiring terms before accepting.",
                          );
                          return;
                        }
                        if (
                          !terms.version ||
                          !terms.policyVersion ||
                          terms.monthlyPaise === undefined ||
                          terms.placementFeePaise === undefined ||
                          (guardian &&
                            (!data.gate?.verified ||
                              !data.gate.consent ||
                              data.gate.privacyPaused))
                        ) {
                          decision.invalid(
                            "Current terms and guardian permission are required. Refresh the overview before accepting.",
                          );
                          return;
                        }
                        void decision.run({
                          path: `/placements/${terms.id}/acceptances`,
                          body: {
                            expectedVersion: terms.version,
                            action: "ACCEPT_TERMS",
                          },
                          message: "Your hiring-term acceptance was recorded.",
                          onSaved: () => {
                            setTerms(null);
                            setAck(false);
                          },
                        });
                      }}
                    >
                      <label className="care-ack">
                        <input
                          type="checkbox"
                          checked={ack}
                          disabled={decision.locked}
                          onChange={(e) => setAck(e.target.checked)}
                        />{" "}
                        {appText(
                          "I have reviewed the monthly tuition and policy and agree to these hiring terms.",
                        )}{" "}
                      </label>
                      <Button
                        type="submit"
                        disabled={
                          !ack ||
                          decision.locked ||
                          !!query.error ||
                          !terms.version ||
                          !terms.policyVersion ||
                          terms.monthlyPaise === undefined ||
                          terms.placementFeePaise === undefined ||
                          (guardian &&
                            (!data.gate?.verified ||
                              !data.gate.consent ||
                              data.gate.privacyPaused))
                        }
                      >
                        {appText("Accept hiring terms")}{" "}
                      </Button>
                    </form>
                  )}
                  <div className="action-row">
                    <Button
                      variant="outline"
                      disabled={decision.locked}
                      onClick={() => {
                        setTerms(null);
                        setAck(false);
                      }}
                    >
                      {appText("Close terms review")}{" "}
                    </Button>
                  </div>
                </section>
              )}
              {selected?.candidate && (
                <section
                  className="care-card hiring-response"
                  aria-label={appText("Opportunity response review")}
                >
                  <h3>{appText("Review your response")}</h3>
                  <p>
                    {appCurriculum(selected.subject)} ·{" "}
                    {appText(educationLabel(selected.learner))} ·{" "}
                    {selected.mode === "HOME"
                      ? appText("At home")
                      : appText("Online")}{" "}
                    · {appCurriculum(selected.language)}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!ack) {
                        decision.invalid(
                          "Acknowledge the effect before responding.",
                        );
                        return;
                      }
                      void decision.run({
                        path: `/candidates/${selected.candidate!.id}/responses`,
                        body: {
                          response,
                          expectedVersion: selected.candidate!.version,
                        },
                        message: "Your opportunity response was recorded.",
                        onSaved: () => {
                          setSelected(null);
                          setAck(false);
                        },
                      });
                    }}
                  >
                    <div className="field">
                      <label htmlFor="opportunity-response">
                        {appText("Your response")}{" "}
                      </label>
                      <select
                        id="opportunity-response"
                        value={response}
                        disabled={decision.locked}
                        onChange={(e) => {
                          setResponse(e.target.value);
                          setAck(false);
                        }}
                      >
                        <option value="ACCEPTED">
                          {appText("I’m interested in this enquiry")}{" "}
                        </option>
                        <option value="DECLINED">
                          {appText("Decline this opportunity")}{" "}
                        </option>
                      </select>
                    </div>
                    <p className="hiring-next">
                      {response === "ACCEPTED"
                        ? appText(
                            "This records your interest. It does not hire you, create a lesson or confirm payment.",
                          )
                        : appText(
                            "This records a decline for this opportunity. The family may consider another teacher.",
                          )}
                    </p>
                    <label className="care-ack">
                      <input
                        type="checkbox"
                        checked={ack}
                        disabled={decision.locked}
                        onChange={(e) => setAck(e.target.checked)}
                      />{" "}
                      {appText("I understand and confirm this response.")}{" "}
                    </label>
                    <div className="action-row">
                      <Button type="submit" disabled={!ack || decision.locked}>
                        {appText("Confirm opportunity response")}{" "}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={decision.locked}
                        onClick={() => setSelected(null)}
                      >
                        {appText("Cancel review")}{" "}
                      </Button>
                    </div>
                  </form>
                </section>
              )}
              {decision.conflict && !decision.uncertain && (
                <Button
                  variant="outline"
                  disabled={decision.busy}
                  onClick={() => decision.reload()}
                >
                  {section === "ARRANGEMENTS"
                    ? appText("Reload current hiring terms")
                    : appText("Reload current enquiries")}
                </Button>
              )}
              {(guardian || student) && (
                <Link href="/dashboard/learners" className="inline-link">
                  {guardian
                    ? appText("Add or view education profiles")
                    : appText("View education profile")}
                </Link>
              )}
              {data.learners.length > 0 && (
                <section className="care-card">
                  <div className="hiring-section-heading">
                    <h3>
                      {student
                        ? appText("Your learner profile")
                        : appText("Your learners")}
                    </h3>
                    {guardian && (
                      <Link href="/dashboard/family" className="inline-link">
                        {appText("Manage learner permissions")}{" "}
                      </Link>
                    )}
                  </div>
                  <ul className="hiring-learners">
                    {data.learners.map((c) => (
                      <li key={c.id}>
                        <div>
                          <strong>{c.alias}</strong>
                          <span>{appText(educationLabel(c))}</span>
                          {c.schoolName && <span>{c.schoolName}</span>}
                          {!!c.schoolSubjects?.length && (
                            <span>
                              {c.schoolSubjects.length}{" "}
                              {appText("class subjects:")}{" "}
                              {c.schoolSubjects
                                .map((value) => appText(value))
                                .join(", ")}
                            </span>
                          )}
                        </div>
                        {guardian && (
                          <Link
                            href={`/dashboard/family?learner=${c.id}`}
                            className="inline-link"
                          >
                            {appText("Manage")} {c.alias}
                            {appText("’s access")}{" "}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                  {data.learnersLimited && (
                    <p className="care-help">
                      {appText(
                        "Showing the first 20 learner profiles. Open learner permissions to review the family list.",
                      )}{" "}
                    </p>
                  )}
                </section>
              )}
              <section className="hiring-help">
                <h3>{appText("When you need a hand")}</h3>
                <p>
                  {appText(
                    "Questions about teacher fit, a stalled enquiry or an existing arrangement? Contact support. Safety concerns can be reported at any time.",
                  )}{" "}
                </p>
                <Link href="/support" className="inline-link">
                  {appText("Get help & safety support")}{" "}
                </Link>
                {!student && (
                  <Link href="/dashboard/privacy" className="inline-link">
                    {appText("Review your privacy requests")}{" "}
                  </Link>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
function AdminQueues({
  operations: o,
}: {
  operations: NonNullable<View["operations"]>;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <>
      <div className="hiring-admin-grid">
        {[
          [
            "Enquiry & matching queues",
            "/dashboard/matching",
            "Review matching",
            o.requests.map((r) => ({
              label: `${appText(label(r.status))} · ${appText(label(r.matchStatus))}`,
              count: r.count,
            })),
          ],
          [
            "Teacher screening",
            "/dashboard/review",
            "Review teacher evidence",
            o.teachers.map((r) => ({
              label: appText(label(r.status)),
              count: r.count,
            })),
          ],
          [
            "Arrangement states",
            "/dashboard/reports",
            "Open operational reports",
            o.arrangements.map((r) => ({
              label: appText(label(r.status)),
              count: r.count,
            })),
          ],
        ].map(([title, href, action, rows]) => (
          <section className="care-card" key={title as string}>
            <h3>{appText(title as string)}</h3>
            {(rows as { label: string; count: number }[]).length ? (
              <dl className="hiring-details">
                {(rows as { label: string; count: number }[]).map((r) => (
                  <div key={r.label}>
                    <dt>{appText(r.label)}</dt>
                    <dd>{r.count}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>{appText("No recorded items in this queue.")}</p>
            )}
            <Link className="inline-link" href={href as string}>
              {appText(action as string)}
            </Link>
          </section>
        ))}
      </div>
      <section className="care-card">
        <h3>{appText("Attention & governance")}</h3>
        <dl className="hiring-details">
          <div>
            <dt>{appText("Open support cases")}</dt>
            <dd>{o.openSupport}</dd>
          </div>
          <div>
            <dt>{appText("Pending privacy requests")}</dt>
            <dd>{o.pendingPrivacy}</dd>
          </div>
          <div>
            <dt>{appText("Unprocessed jobs with five or more attempts")}</dt>
            <dd>{o.failedJobs}</dd>
          </div>
        </dl>
        <div className="hiring-links">
          <Link href="/dashboard/support" className="inline-link">
            {appText("Review support & disputes")}{" "}
          </Link>
          <Link href="/dashboard/admin" className="inline-link">
            {appText("Privacy, people, controls & audit")}{" "}
          </Link>
          <Link href="/dashboard/finance" className="inline-link">
            {appText("Inspect financial records")}{" "}
          </Link>
          <Link href="/dashboard/security" className="inline-link">
            {appText("Authenticator & recovery")}{" "}
          </Link>
        </div>
        <p className="care-help">
          {appText(
            "Queue counts describe recorded state. They do not establish screened supply availability, financial settlement or a live release. Sensitive grants and commercial editing retain their separate approval requirements.",
          )}{" "}
        </p>
      </section>
    </>
  );
}
