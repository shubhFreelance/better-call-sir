"use client";
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
const date = (s: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(s));
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n / 100);
export function HiringOverview({ session }: { session: Session }) {
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
              ? "A clear view of the marketplace."
              : teacher
                ? "Your next teaching opportunity."
                : student
                  ? "Your next step in learning."
                  : "Your family’s learning, together."}
          </h2>
          <p>
            {admin
              ? "Follow enquiries, screening and arrangements. Open the right queue to act on recorded evidence."
              : teacher
                ? "Keep your application current, review assigned enquiries and follow your teaching arrangements."
                : student
                  ? "Explore teachers and see your own search progress. Your guardian sends enquiries and confirms arrangements."
                  : "Find a teacher who fits, follow your enquiries and keep every choice in view."}
          </p>
        </div>
        <div className="hiring-intro-actions">
          {teacher ? (
            <Link className="button" href="/onboarding/teacher">
              Review your application
            </Link>
          ) : admin ? (
            <Link className="button" href="/dashboard/admin">
              Open control console
            </Link>
          ) : (
            <>
              <Link className="button" href="/teachers">
                Find a teacher <ArrowUpRight size={17} />
              </Link>
              <Link className="button secondary" href="/teachers?tab=assisted">
                Let us search for you
              </Link>
            </>
          )}
        </div>
      </section>
      {query.isPending && <p role="status">Loading your hiring overview…</p>}
      {query.error && (
        <Notice error>
          Your hiring overview could not be refreshed.{" "}
          {data
            ? "The displayed records are from the last successful read."
            : "Counts are unavailable; this is not an empty enquiry list."}{" "}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => query.refetch()}
          >
            Retry hiring overview
          </Button>
          {cursors.length > 0 && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => setCursors([])}
            >
              Return to first page
            </Button>
          )}
        </Notice>
      )}
      {arrangementId && section === "ARRANGEMENTS" && (
        <Notice>
          Viewing the linked hiring arrangement.{" "}
          <Link href="/dashboard" className="inline-link">
            View all hiring records
          </Link>
        </Notice>
      )}
      <Feedback decision={decision} />
      {data && (
        <>
          <div className="hiring-snapshot">
            <span>Current records · Updated {date(data.asOf)} IST</span>
            <Button
              variant="outline"
              disabled={locked || query.isFetching}
              onClick={() => query.refetch()}
            >
              Refresh overview
            </Button>
          </div>
          {guardian &&
            data.gate &&
            (!data.gate.verified ||
              !data.gate.consent ||
              data.gate.privacyPaused) && (
              <Notice>
                {data.gate.privacyPaused
                  ? "New tuition decisions are paused while your deletion request is reviewed."
                  : !data.gate.verified
                    ? "Guardian verification is pending. Complete verification before submitting learner details."
                    : "Guardian consent is missing or withdrawn. Review your permission before starting a new enquiry."}{" "}
                <Link
                  href={
                    data.gate.privacyPaused
                      ? "/dashboard/privacy"
                      : "/onboarding/parent"
                  }
                  className="inline-link"
                >
                  {data.gate.privacyPaused
                    ? "Review privacy request"
                    : "Review guardian onboarding"}
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
                <dt>{name}</dt>
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
                    <h3>Your teaching application</h3>
                    <Link href="/onboarding/teacher" className="inline-link">
                      Review profile & evidence
                    </Link>
                  </div>
                  {data.profile ? (
                    <>
                      <strong>{data.profile.name}</strong>
                      <p>{data.profile.subjects.join(" & ")}</p>
                      <dl className="hiring-details">
                        <div>
                          <dt>Application status</dt>
                          <dd>{label(data.profile.status)}</dd>
                        </div>
                        <div>
                          <dt>Screening evidence</dt>
                          <dd>
                            {data.profile.screeningComplete &&
                            data.profile.screeningValidUntil &&
                            new Date(data.profile.screeningValidUntil) >
                              new Date()
                              ? "Recorded and current"
                              : "Pending or needs renewal"}
                          </dd>
                        </div>
                        <div>
                          <dt>Fee terms</dt>
                          <dd>
                            {data.profile.feeTermsAccepted
                              ? "Acceptance recorded"
                              : "Acceptance pending"}
                          </dd>
                        </div>
                      </dl>
                      <p className="care-help">
                        Approval, current screening and fit are required for an
                        actionable enquiry. A profile status is not a guarantee
                        of teaching work.
                      </p>
                    </>
                  ) : (
                    <p>
                      No teaching application yet. Create your profile and
                      provide evidence to join the review process.
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
                  <TabsList className="care-tabs" aria-label="Hiring records">
                    <TabsTrigger value="ENQUIRIES" disabled={locked}>
                      {teacher ? "Assigned enquiries" : "Enquiry progress"}
                    </TabsTrigger>
                    <TabsTrigger value="ARRANGEMENTS" disabled={locked}>
                      {student ? "Your teacher" : "Teaching arrangements"}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="ENQUIRIES">
                    <div className="hiring-section-heading">
                      <h3>
                        {teacher
                          ? "Review your assigned enquiries"
                          : student
                            ? "Your teacher search progress"
                            : "Your teacher enquiries"}
                      </h3>
                      {guardian &&
                        data.gate?.verified &&
                        data.gate.consent &&
                        !data.gate.privacyPaused && (
                          <Link
                            className="inline-link"
                            href="/onboarding/parent"
                          >
                            New tuition enquiry
                          </Link>
                        )}
                    </div>
                    <p className="care-help">
                      {teacher
                        ? "Only currently presented enquiries with active family permission appear here. Expressing interest does not confirm hiring."
                        : "A reviewed shortlist, a saved choice and an agreed arrangement are separate steps. Open an enquiry to review the details."}
                    </p>
                    {!data.enquiries.length ? (
                      <section className="care-card">
                        <h4>
                          {teacher
                            ? "No current assigned enquiries"
                            : student
                              ? "No teacher enquiry recorded yet"
                              : "Ready to find your teacher?"}
                        </h4>
                        <p>
                          {teacher
                            ? "Keep your profile and availability current. Enquiries appear when they are presented to you and the family’s permission is active."
                            : student
                              ? "You can browse teacher profiles. Your guardian can tell us what you need and submit an enquiry."
                              : "Browse profiles yourself or share your criteria for a reviewed shortlist."}
                        </p>
                        {!teacher && (
                          <Link className="inline-link" href="/teachers">
                            Explore teacher profiles
                          </Link>
                        )}
                      </section>
                    ) : (
                      <div className="hiring-card-grid">
                        {data.enquiries.map((e) => (
                          <article
                            className="care-card hiring-record"
                            key={e.id}
                            aria-label={`${e.subject} enquiry${e.learner.alias ? " for " + e.learner.alias : ""}`}
                          >
                            <div className="hiring-section-heading">
                              <h4>{e.subject}</h4>
                              <span className="hiring-state">
                                {e.status === "OPEN"
                                  ? "Enquiry open"
                                  : label(e.status)}
                              </span>
                            </div>
                            <p>
                              {e.learner.alias && (
                                <strong>{e.learner.alias} · </strong>
                              )}
                              Class {e.learner.grade} · {e.learner.board}
                            </p>
                            <dl className="hiring-details">
                              <div>
                                <dt>Search path</dt>
                                <dd>
                                  {e.discoveryMethod === "MANUAL"
                                    ? "Manual search"
                                    : "Let us search for you"}
                                </dd>
                              </div>
                              <div>
                                <dt>Teaching preference</dt>
                                <dd>
                                  {e.mode === "HOME" ? "At home" : "Online"} ·{" "}
                                  {e.language}
                                </dd>
                              </div>
                              <div>
                                <dt>Locality</dt>
                                <dd>{e.locality}</dd>
                              </div>
                              {guardian && e.budgetPaise !== undefined && (
                                <div>
                                  <dt>Monthly budget</dt>
                                  <dd>{money(e.budgetPaise)}</dd>
                                </div>
                              )}
                              <div>
                                <dt>Matching status</dt>
                                <dd>{label(e.matchStatus)}</dd>
                              </div>
                              <div>
                                <dt>Teacher choice</dt>
                                <dd>
                                  {e.candidate
                                    ? e.candidate.selected
                                      ? "Family selected you"
                                      : "No selection of you recorded"
                                    : e.hasSelection
                                      ? "Choice recorded"
                                      : "Not chosen yet"}
                                </dd>
                              </div>
                              {e.candidate && (
                                <div>
                                  <dt>Your response</dt>
                                  <dd>{label(e.candidate.response)}</dd>
                                </div>
                              )}
                            </dl>
                            <p className="care-help">
                              Submitted {date(e.createdAt)} IST
                            </p>
                            <Link
                              className="inline-link"
                              href={`/support?request=${e.id}`}
                            >
                              Help and case progress for this enquiry
                            </Link>
                            {e.candidate ? (
                              <>
                                <p className="hiring-next">
                                  {e.candidate.response !== "PENDING"
                                    ? "Your response is recorded. The guardian reviews their choice and opens hiring terms. Check Teaching arrangements to review and confirm any shared terms."
                                    : !e.candidate.eligible
                                      ? "Current fit could not be confirmed. Refresh or review your availability before responding."
                                      : "Review the learner’s needs before expressing interest or declining."}
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
                                  Review opportunity response
                                </Button>
                              </>
                            ) : guardian ? (
                              <Link
                                className="inline-link"
                                href={`/dashboard/requests?request=${e.id}`}
                              >
                                Open enquiry & teacher options
                              </Link>
                            ) : (
                              <p className="hiring-next">
                                Your guardian reviews the teacher options and
                                confirms the arrangement.
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
                        ? "Your teacher arrangements"
                        : "Your teaching arrangements"}
                    </h3>
                    <p className="care-help">
                      A saved choice or accepted term is not proof that teaching
                      has started. These are the current recorded arrangement
                      states.
                    </p>
                    {!data.arrangements.length ? (
                      <section className="care-card">
                        <h4>No arrangement recorded yet</h4>
                        <p>
                          {teacher
                            ? "Your assigned enquiries are the next place to review."
                            : "Find a suitable teacher and review your enquiry progress."}
                        </p>
                      </section>
                    ) : (
                      <div className="hiring-card-grid">
                        {data.arrangements.map((p) => (
                          <article
                            className="care-card hiring-record"
                            key={p.id}
                            aria-label={`${p.subject} arrangement with ${p.teacher.name}`}
                          >
                            <div className="hiring-section-heading">
                              <h4>{p.teacher.name}</h4>
                              <span className="hiring-state">
                                {p.status === "CLOSED"
                                  ? "Closed"
                                  : p.guardianAccepted && p.teacherAccepted
                                    ? "Hiring terms confirmed"
                                    : "Hiring terms pending"}
                              </span>
                            </div>
                            <p>
                              {p.subject} ·{" "}
                              {p.mode === "HOME" ? "At home" : "Online"} ·{" "}
                              {p.learner.alias}
                            </p>
                            <dl className="hiring-details">
                              <div>
                                <dt>Teacher profile</dt>
                                <dd>{label(p.teacher.status)}</dd>
                              </div>
                              <div>
                                <dt>Guardian terms</dt>
                                <dd>
                                  {p.guardianAccepted
                                    ? "Acceptance recorded"
                                    : "Pending"}
                                </dd>
                              </div>
                              <div>
                                <dt>Teacher terms</dt>
                                <dd>
                                  {p.teacherAccepted
                                    ? "Acceptance recorded"
                                    : "Pending"}
                                </dd>
                              </div>
                              <div>
                                <dt>Start evidence</dt>
                                <dd>
                                  {p.guardianStarted &&
                                  p.teacherReceiptConfirmed
                                    ? "Both confirmations recorded"
                                    : "Not independently confirmed"}
                                </dd>
                              </div>
                              {!student && p.monthlyPaise !== undefined && (
                                <div>
                                  <dt>Recorded monthly terms</dt>
                                  <dd>{money(p.monthlyPaise)}</dd>
                                </div>
                              )}
                            </dl>
                            <p className="hiring-next">
                              {p.status === "CLOSED"
                                ? "This arrangement is closed. Its recorded terms remain available for reference."
                                : p.guardianAccepted && p.teacherAccepted
                                  ? "Both parties have confirmed the hiring terms. This does not confirm a lesson, tuition payment or service start."
                                  : student
                                    ? "Your guardian and teacher review and confirm the hiring terms."
                                    : (guardian && p.guardianAccepted) ||
                                        (teacher && p.teacherAccepted)
                                      ? "Your acceptance is recorded. Waiting for the other party to confirm the same terms."
                                      : "Review the monthly terms and policy before accepting. A demo and class timetable are not required to accept hiring terms."}
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
                                Review hiring terms
                              </Button>
                            )}
                            <Link
                              className="inline-link"
                              href={`/support?placement=${p.id}`}
                            >
                              Help and case progress
                            </Link>
                            {guardian && (
                              <Link
                                href={`/dashboard/arrangements?placement=${p.id}`}
                                className="inline-link"
                              >
                                Support or replacement
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
                      Previous records
                    </Button>
                    <span>Page {cursors.length + 1}</span>
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
                      Next records
                    </Button>
                  </div>
                )}
              </section>
              {terms && (
                <section
                  className="care-card hiring-terms-review"
                  aria-label="Hiring terms review"
                >
                  <h3 ref={termsHeading} tabIndex={-1}>
                    Review hiring terms
                  </h3>
                  <p>
                    {terms.teacher.name} · {terms.learner.alias} ·{" "}
                    {terms.subject} ·{" "}
                    {terms.mode === "HOME" ? "Home tuition" : "Online tuition"}
                  </p>
                  <dl className="hiring-details">
                    <div>
                      <dt>Monthly tuition</dt>
                      <dd>
                        {terms.monthlyPaise !== undefined
                          ? money(terms.monthlyPaise)
                          : "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Recorded policy</dt>
                      <dd>{terms.policyVersion || "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Guardian acceptance</dt>
                      <dd>{terms.guardianAccepted ? "Recorded" : "Pending"}</dd>
                    </div>
                    <div>
                      <dt>Teacher acceptance</dt>
                      <dd>{terms.teacherAccepted ? "Recorded" : "Pending"}</dd>
                    </div>
                  </dl>
                  <p>
                    Tuition is paid directly to the teacher. Accepting these
                    terms does not charge either party or confirm that teaching
                    has started.
                  </p>
                  <p className="care-help">
                    Proposed teacher placement fee:{" "}
                    {terms.placementFeePaise !== undefined
                      ? money(terms.placementFeePaise)
                      : "Unavailable"}
                    , only after separate service-start and tuition-receipt
                    evidence. Final live commercial terms remain under review.
                  </p>
                  <p className="hiring-next">
                    A demo is optional. You can confirm hiring terms without
                    booking a class or agreeing a class timetable.
                  </p>
                  {terms.status === "CLOSED" ? (
                    <p>
                      This arrangement is closed. Further acceptances are
                      unavailable.
                    </p>
                  ) : (
                      guardian ? terms.guardianAccepted : terms.teacherAccepted
                    ) ? (
                    <p>
                      Your acceptance is already recorded.
                      {terms.guardianAccepted && terms.teacherAccepted
                        ? " Both parties have confirmed the hiring terms."
                        : " Waiting for the other party."}
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
                        I have reviewed the monthly tuition and policy and agree
                        to these hiring terms.
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
                        Accept hiring terms
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
                      Close terms review
                    </Button>
                  </div>
                </section>
              )}
              {selected?.candidate && (
                <section
                  className="care-card hiring-response"
                  aria-label="Opportunity response review"
                >
                  <h3>Review your response</h3>
                  <p>
                    {selected.subject} · Class {selected.learner.grade} ·{" "}
                    {selected.mode === "HOME" ? "At home" : "Online"} ·{" "}
                    {selected.language}
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
                        Your response
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
                          I’m interested in this enquiry
                        </option>
                        <option value="DECLINED">
                          Decline this opportunity
                        </option>
                      </select>
                    </div>
                    <p className="hiring-next">
                      {response === "ACCEPTED"
                        ? "This records your interest. It does not hire you, create a lesson or confirm payment."
                        : "This records a decline for this opportunity. The family may consider another teacher."}
                    </p>
                    <label className="care-ack">
                      <input
                        type="checkbox"
                        checked={ack}
                        disabled={decision.locked}
                        onChange={(e) => setAck(e.target.checked)}
                      />{" "}
                      I understand and confirm this response.
                    </label>
                    <div className="action-row">
                      <Button type="submit" disabled={!ack || decision.locked}>
                        Confirm opportunity response
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={decision.locked}
                        onClick={() => setSelected(null)}
                      >
                        Cancel review
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
                    ? "Reload current hiring terms"
                    : "Reload current enquiries"}
                </Button>
              )}
              {data.learners.length > 0 && (
                <section className="care-card">
                  <div className="hiring-section-heading">
                    <h3>
                      {student ? "Your learner profile" : "Your learners"}
                    </h3>
                    {guardian && (
                      <Link href="/dashboard/family" className="inline-link">
                        Manage learner permissions
                      </Link>
                    )}
                  </div>
                  <ul className="hiring-learners">
                    {data.learners.map((c) => (
                      <li key={c.id}>
                        <div>
                          <strong>{c.alias}</strong>
                          <span>
                            Class {c.grade} · {c.board}
                          </span>
                          {c.schoolName && <span>{c.schoolName}</span>}
                          {!!c.schoolSubjects?.length && (
                            <span>
                              {c.schoolSubjects.length} class subjects:{" "}
                              {c.schoolSubjects.join(", ")}
                            </span>
                          )}
                        </div>
                        {guardian && (
                          <Link
                            href={`/dashboard/family?learner=${c.id}`}
                            className="inline-link"
                          >
                            Manage {c.alias}’s access
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                  {data.learnersLimited && (
                    <p className="care-help">
                      Showing the first 20 learner profiles. Open learner
                      permissions to review the family list.
                    </p>
                  )}
                </section>
              )}
              <section className="hiring-help">
                <h3>When you need a hand</h3>
                <p>
                  Questions about teacher fit, a stalled enquiry or an existing
                  arrangement? Contact support. Safety concerns can be reported
                  at any time.
                </p>
                <Link href="/support" className="inline-link">
                  Get help & safety support
                </Link>
                {!student && (
                  <Link href="/dashboard/privacy" className="inline-link">
                    Review your privacy requests
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
  return (
    <>
      <div className="hiring-admin-grid">
        {[
          [
            "Enquiry & matching queues",
            "/dashboard/matching",
            "Review matching",
            o.requests.map((r) => ({
              label: `${label(r.status)} · ${label(r.matchStatus)}`,
              count: r.count,
            })),
          ],
          [
            "Teacher screening",
            "/dashboard/review",
            "Review teacher evidence",
            o.teachers.map((r) => ({ label: label(r.status), count: r.count })),
          ],
          [
            "Arrangement states",
            "/dashboard/reports",
            "Open operational reports",
            o.arrangements.map((r) => ({
              label: label(r.status),
              count: r.count,
            })),
          ],
        ].map(([title, href, action, rows]) => (
          <section className="care-card" key={title as string}>
            <h3>{title as string}</h3>
            {(rows as { label: string; count: number }[]).length ? (
              <dl className="hiring-details">
                {(rows as { label: string; count: number }[]).map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.count}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>No recorded items in this queue.</p>
            )}
            <Link className="inline-link" href={href as string}>
              {action as string}
            </Link>
          </section>
        ))}
      </div>
      <section className="care-card">
        <h3>Attention & governance</h3>
        <dl className="hiring-details">
          <div>
            <dt>Open support cases</dt>
            <dd>{o.openSupport}</dd>
          </div>
          <div>
            <dt>Pending privacy requests</dt>
            <dd>{o.pendingPrivacy}</dd>
          </div>
          <div>
            <dt>Unprocessed jobs with five or more attempts</dt>
            <dd>{o.failedJobs}</dd>
          </div>
        </dl>
        <div className="hiring-links">
          <Link href="/dashboard/support" className="inline-link">
            Review support & disputes
          </Link>
          <Link href="/dashboard/admin" className="inline-link">
            Privacy, people, controls & audit
          </Link>
          <Link href="/dashboard/finance" className="inline-link">
            Inspect financial records
          </Link>
          <Link href="/dashboard/security" className="inline-link">
            Authenticator & recovery
          </Link>
        </div>
        <p className="care-help">
          Queue counts describe recorded state. They do not establish screened
          supply availability, financial settlement or a live release. Sensitive
          grants and commercial editing retain their separate approval
          requirements.
        </p>
      </section>
    </>
  );
}
