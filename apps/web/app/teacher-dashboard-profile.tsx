"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Notice } from "./tuition-workflow";
import { useAppTranslation } from "./locale";
import { milestones } from "./teacher-details-form";
import { TeacherLockIn } from "./teacher-lock-in";

export function TeacherDashboardProfile({ session }: { session: Session }) {
  const { appText, appCurriculum, appLocale } = useAppTranslation();
  const query = useQuery({
    queryKey: ["teacher-dashboard-profile", session.account.id],
    queryFn: ({ signal }) =>
      api<{ profile: components["schemas"]["PrivateTeacher"] | null }>(
        "/dashboard",
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const p = !query.error ? query.data?.profile : null;
  const levels = Object.keys(milestones);
  const qualification = p?.education
    ?.filter((e) => e.status !== "NOT_APPLICABLE")
    .sort(
      (a, b) => levels.indexOf(b.milestone) - levels.indexOf(a.milestone),
    )[0];
  return (
    <div className="teacher-dashboard-details">
      <h4>{appText("Teaching details")}</h4>
      {query.isPending && (
        <p role="status">{appText("Loading teaching details…")}</p>
      )}
      {query.error && (
        <Notice error>
          {appText(
            "Teaching details could not be loaded. Private information is hidden until you retry.",
          )}
          <Button variant="outline" onClick={() => query.refetch()}>
            {appText("Retry teaching details")}
          </Button>
        </Notice>
      )}
      {query.isSuccess && !p && (
        <p>
          {appText(
            "Teaching details are not available yet. Open your application to complete your profile.",
          )}
        </p>
      )}
      {p && (
        <>
          <dl className="dashboard-facts">
            <div>
              <dt>{appText("Qualification")}</dt>
              <dd>
                {qualification?.qualification || appText("Not recorded")}
                {qualification?.status === "PURSUING"
                  ? ` (${appText("Pursuing")})`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>{appText("Experience")}</dt>
              <dd>{appText("{0} years", [p.experience])}</dd>
            </div>
            <div>
              <dt>{appText("Teaching format")}</dt>
              <dd>
                {p.modes
                  .map((v) => appText(v === "HOME" ? "At home" : "Online"))
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt>{appText("Teaching languages")}</dt>
              <dd>{p.languages.map((v) => appCurriculum(v)).join(", ")}</dd>
            </div>
            <div>
              <dt>{appText("Monthly tuition")}</dt>
              <dd>
                {new Intl.NumberFormat(appLocale, {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 2,
                }).format(p.monthlyPaise / 100)}
              </dd>
            </div>
            <div>
              <dt>{appText("Demo classes")}</dt>
              <dd>
                {appText(
                  p.demoOptIn === true
                    ? "Demo offered"
                    : p.demoOptIn === false
                      ? "Demo not offered"
                      : "Preference not yet recorded",
                )}
              </dd>
            </div>
            <div>
              <dt>{appText("Lock-in preference")}</dt>
              <dd>
                <TeacherLockIn days={p.lockInDays} />
              </dd>
            </div>
          </dl>
          <details className="dashboard-credentials">
            <summary>{appText("Education and work experience")}</summary>
            {p.education?.length ? (
              p.education.map((e) => (
                <section key={e.milestone} className="dashboard-qualification">
                  <h5>{appText(milestones[e.milestone])}</h5>
                  <dl className="dashboard-facts">
                    <div>
                      <dt>{appText("Status")}</dt>
                      <dd>
                        {appText(e.status.toLowerCase().replaceAll("_", " "))}
                      </dd>
                    </div>
                    {e.status !== "NOT_APPLICABLE" && (
                      <>
                        <div>
                          <dt>{appText("Qualification")}</dt>
                          <dd>{e.qualification}</dd>
                        </div>
                        <div>
                          <dt>{appText("Institution")}</dt>
                          <dd>{e.institution}</dd>
                        </div>
                        <div>
                          <dt>{appText("Year")}</dt>
                          <dd>{e.year ?? appText("Not recorded")}</dd>
                        </div>
                        <div>
                          <dt>{appText("Result")}</dt>
                          <dd>
                            {e.score === null
                              ? appText("Not recorded")
                              : `${e.score}${e.grading === "PERCENTAGE" ? "%" : e.outOf ? ` / ${e.outOf}` : ""}`}
                            {e.percentage !== null && e.grading !== "PERCENTAGE"
                              ? ` (${e.percentage}%)`
                              : ""}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                </section>
              ))
            ) : (
              <p>{appText("Education milestones not yet recorded.")}</p>
            )}
            <h5>{appText("Previous work")}</h5>
            {p.employment?.length ? (
              p.employment.map((e, i) => (
                <dl className="dashboard-facts dashboard-qualification" key={i}>
                  <div>
                    <dt>{appText("Organization")}</dt>
                    <dd>{e.organization}</dd>
                  </div>
                  <div>
                    <dt>{appText("Role")}</dt>
                    <dd>{e.role}</dd>
                  </div>
                  <div>
                    <dt>{appText("Period")}</dt>
                    <dd>
                      {e.fromYear}–{e.toYear ?? appText("current")}
                    </dd>
                  </div>
                  <div>
                    <dt>{appText("Experience certificate or reference")}</dt>
                    <dd>
                      {appText(e.proof.toLowerCase().replaceAll("_", " "))}
                    </dd>
                  </div>
                </dl>
              ))
            ) : (
              <p>{appText("No previous work recorded.")}</p>
            )}
            <p className="care-help">
              {appText(
                "These are your private declarations. They are not independently verified qualifications unless the review confirms them.",
              )}
            </p>
          </details>
        </>
      )}
    </div>
  );
}
