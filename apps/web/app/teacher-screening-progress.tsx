"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Clock3, CircleAlert } from "lucide-react";
import { api, type components } from "@bcs/api-client";
import { RefreshButton } from "../components/ui/refresh-button";
import { FilterButton } from "../components/ui/filter-button";
import { StatusBadge } from "../components/ui/status-controls";
import { useAppTranslation } from "./locale";

export type ScreeningKind =
  components["schemas"]["TeacherScreeningProgress"]["categories"][number]["kind"];
export const screeningLabels = {
  IDENTITY: "Identity",
  QUALIFICATIONS: "Qualifications",
  CAPABILITY: "Teaching capability",
  REFERENCES: "References",
};
const guidance = {
  IDENTITY: "Upload an identity document for staff verification.",
  QUALIFICATIONS:
    "Upload marksheets, degrees or relevant certificates, one file at a time.",
  CAPABILITY:
    "Upload a teaching sample or assessment evidence for your declared subjects and classes.",
  REFERENCES:
    "Upload an experience certificate or reference evidence. New to teaching? Ask support about a reference check.",
};
export function TeacherScreeningProgress({
  teacherId,
  actorId,
  staff = false,
  disabled = false,
  onUpload,
}: {
  teacherId: string;
  actorId: string;
  staff?: boolean;
  disabled?: boolean;
  onUpload?: (kind: ScreeningKind) => void;
}) {
  const { appText } = useAppTranslation();
  const query = useQuery({
    queryKey: ["teacher-screening", actorId, teacherId],
    queryFn: ({ signal }) =>
      api<components["schemas"]["TeacherScreeningProgress"]>(
        `/teachers/${teacherId}/screening`,
        { signal },
      ),
    retry: false,
    refetchInterval: disabled ? false : 60000,
    refetchOnWindowFocus: !disabled,
  });
  const data = !query.error ? query.data : undefined;
  return (
    <section
      className="teacher-screening-progress"
      aria-label={appText("Evidence & screening")}
    >
      <header>
        <div>
          <h3>{appText("Evidence & screening")}</h3>
          <p>
            {appText(
              "Teachers upload evidence. Staff reviews it and records each screening check.",
            )}
          </p>
        </div>
        <RefreshButton
          label={appText("Refresh screening progress")}
          disabled={disabled || query.isFetching}
          onClick={() => query.refetch()}
        />
      </header>
      {query.isPending && (
        <p role="status">{appText("Loading screening progress…")}</p>
      )}
      {query.error && (
        <p role="alert">
          {appText(
            "Screening progress could not be loaded. Refresh to see current requirements.",
          )}
        </p>
      )}
      {data && (
        <>
          <p className="screening-revision">
            {appText("{0} of {1} checks current for revision {2}", [
              data.categories.filter((c) => c.reviewStatus === "PASSED").length,
              4,
              data.profileRevision,
            ])}
          </p>
          <div className="screening-categories">
            {data.categories.map((c) => {
              const passed = c.reviewStatus === "PASSED",
                problem = ["FAILED", "EXPIRED", "NEEDS_REVIEW"].includes(
                  c.reviewStatus,
                );
              const review = passed
                ? "Passed"
                : c.reviewStatus === "FAILED"
                  ? "Changes needed"
                  : c.reviewStatus === "EXPIRED"
                    ? "Expired"
                    : c.reviewStatus === "NEEDS_REVIEW"
                      ? "Needs review"
                      : c.cleared
                        ? "Awaiting staff review"
                        : "Not reviewed";
              return (
                <article key={c.kind}>
                  <h4>{appText(screeningLabels[c.kind])}</h4>
                  <p className="screening-guidance">
                    {appText(guidance[c.kind])}
                  </p>
                  <dl>
                    <div>
                      <dt>{appText("Evidence")}</dt>
                      <dd>
                        {!c.uploaded
                          ? appText("Not uploaded")
                          : appText("{0} uploaded · {1} scan-cleared", [
                              c.uploaded,
                              c.cleared,
                            ])}
                        {c.scanning > 0 && (
                          <span>
                            {appText("{0} awaiting scan", [c.scanning])}
                          </span>
                        )}
                        {c.blocked > 0 && (
                          <span>
                            {appText("{0} blocked by scan", [c.blocked])}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{appText("Staff screening")}</dt>
                      <dd>
                        <StatusBadge
                          label={appText(review)}
                          tone={
                            passed ? "success" : problem ? "danger" : "warning"
                          }
                          icon={
                            passed
                              ? CircleCheck
                              : problem
                                ? CircleAlert
                                : Clock3
                          }
                        />
                      </dd>
                    </div>
                  </dl>
                  {onUpload && (
                    <FilterButton
                      type="button"
                      disabled={
                        disabled ||
                        !["SUBMITTED", "CHANGES_REQUESTED"].includes(
                          data.applicationStatus,
                        )
                      }
                      onClick={() => onUpload(c.kind)}
                    >
                      {appText(c.uploaded ? "Add evidence" : "Upload evidence")}
                    </FilterButton>
                  )}
                </article>
              );
            })}
          </div>
          <p className="screening-next-step">
            {appText(
              data.readyForApproval
                ? data.applicationStatus === "APPROVED"
                  ? "Your screening checks are current. Profile discovery also depends on availability and eligibility."
                  : "All four screening checks are current. A staff member must record the final application decision."
                : data.categories.some((c) => !c.uploaded)
                  ? staff
                    ? "Some evidence is missing. Ask the teacher to upload the remaining categories."
                    : "Evidence is missing in the categories above. Upload the remaining files; staff will complete the checks."
                  : data.categories.some((c) =>
                        ["FAILED", "EXPIRED", "NEEDS_REVIEW"].includes(
                          c.reviewStatus,
                        ),
                      )
                    ? "Some checks need attention. Review your evidence or contact support; staff must record the assessment."
                    : staff
                      ? "Files are uploaded. Record the staff screening checks; a clean scan alone does not approve the teacher."
                      : "Your evidence is uploaded. Scan-cleared files are ready for staff screening; you do not need to upload them again.",
            )}
          </p>
          {!data.detailsComplete && (
            <p>
              {appText(
                "Complete your private application details before approval.",
              )}
            </p>
          )}
          <p className="screening-fees">
            {appText("Fee terms:")}{" "}
            <strong>
              {appText(data.feeTermsAccepted ? "Accepted" : "Not accepted")}
            </strong>
          </p>
          {!staff && !onUpload && (
            <Link
              className="inline-link"
              href="/onboarding/teacher#screening-evidence"
            >
              {appText("Manage evidence & screening")}
            </Link>
          )}
        </>
      )}
    </section>
  );
}
