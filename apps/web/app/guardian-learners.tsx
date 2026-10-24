"use client";
import Link from "next/link";
import { Link2 } from "lucide-react";
import type { Session, components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { useAppTranslation } from "./locale";
import { useHistory, HistoryPages } from "./history";
type S = components["schemas"];
const relationshipStatus = {
  DRAFT: "Verification draft",
  PENDING: "Staff review pending",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Relationship verified",
  REJECTED: "Verification not approved",
  CANCELLED: "Verification cancelled",
  REVOKED: "Verification revoked",
  DELETED: "Verification deleted",
};
const invitationStatus = {
  PENDING: "Invitation awaiting your decision",
  ACTIVE: "Invitation accepted",
  EXPIRED: "Invitation expired",
  DECLINED: "Invitation declined",
  REVOKED: "Invitation access removed",
};
export function GuardianLearners({ session }: { session: Session }) {
  const { appText } = useAppTranslation();
  const relationships = useHistory<{
    items: S["GuardianVerification"][];
    nextCursor: string | null;
  }>({
    queryKey: ["guardian-overview-relationships", session.account.id],
    path: "/guardian-verifications?limit=6",
  });
  const invitations = useHistory<{
    items: S["StudentGuardianGrant"][];
    nextCursor: string | null;
  }>({
    queryKey: ["guardian-overview-invitations", session.account.id],
    path: "/student-guardian-grants?limit=6",
  });
  return (
    <section
      className="guardian-learners"
      aria-labelledby="guardian-learners-heading"
    >
      <header className="guardian-learners-heading">
        <div>
          <h2 id="guardian-learners-heading">
            {appText("Your learners & invitations")}
          </h2>
          <p>
            {appText(
              "Support more than one learner from this account. Each relationship and invitation has its own permissions.",
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/learners">
            {appText("Open education profiles")}
          </Link>
        </Button>
      </header>
      <div className="guardian-learner-groups">
        <section
          className="guardian-learner-group"
          aria-labelledby="guardian-relationships-heading"
        >
          <h3 id="guardian-relationships-heading">
            {appText("Your learner relationships")}
          </h3>
          <p>
            {appText(
              "Verification applies to the named learner only. Verify each additional child separately.",
            )}
          </p>
          {relationships.data && (
            <>
              {!relationships.data.items.length && (
                <p className="guardian-learner-empty">
                  {appText(
                    "No relationship requests yet. Start verification for your first learner.",
                  )}
                </p>
              )}
              <ul className="guardian-learner-cards">
                {relationships.data.items.map((row) => (
                  <li key={row.id}>
                    <div className="guardian-learner-card-heading">
                      <h4>{row.learnerName}</h4>
                      <span
                        className={
                          row.status === "APPROVED"
                            ? "guardian-learner-status verified"
                            : "guardian-learner-status"
                        }
                      >
                        {appText(relationshipStatus[row.status])}
                      </span>
                    </div>
                    <p>
                      <strong>{appText("Verification choice")}: </strong>
                      {appText(
                        {
                          GUARDIAN_ONLY: "Guardian manages learning",
                          SHARED: "Guardian and student manage together",
                          STUDENT_LED:
                            "Student manages; guardian follows progress",
                        }[row.managementMode],
                      )}
                    </p>
                    <p className="care-help">
                      {appText(
                        row.status === "APPROVED"
                          ? "Relationship approval is separate from learning permission and profile setup."
                          : "Review this request for evidence, acknowledgment and the next verification step.",
                      )}
                    </p>
                    <Button asChild variant="ghost">
                      <Link href="/guardian-verification">
                        {appText("Review relationship requests")}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <HistoryPages
            history={relationships}
            label="Learner relationship history"
          />
          <Button asChild variant="outline">
            <Link href="/guardian-verification">
              {appText("Verify another learner relationship")}
            </Link>
          </Button>
        </section>
        <section
          className="guardian-learner-group invited"
          aria-labelledby="guardian-invitations-heading"
        >
          <div className="guardian-invitation-header">
            <h3 id="guardian-invitations-heading">{appText("Students who invited you")}</h3>
            <span className="guardian-invitation-label"><Link2 size={16} aria-hidden="true" />{appText("Invited access")}</span>
          </div>
          <p>
            {appText(
              "An invitation shares learning access; it does not verify a parent or guardian relationship.",
            )}
          </p>
          {invitations.data && (
            <>
              {!invitations.data.items.length && (
                <p className="guardian-learner-empty">
                  {appText(
                    "No student invitations yet. Students can invite your registered email from Learning support.",
                  )}
                </p>
              )}
              <ul className="guardian-learner-cards">
                {invitations.data.items.map((row) => (
                  <li key={row.id}>
                    <div className="guardian-learner-card-heading">
                      <h4>{row.studentName || appText("Student")}</h4>
                      <span className="guardian-learner-status">
                        {appText(invitationStatus[row.status])}
                      </span>
                    </div>
                    <p>
                      <strong>{appText("Permission")}: </strong>
                      {appText(
                        row.supportMode === "MANAGE"
                          ? "Manage shared learning"
                          : "Advice only",
                      )}
                    </p>
                    <p className="care-help">
                      {appText(
                        row.status === "ACTIVE"
                          ? "Access covers this student's shared learning only. Account ownership, sign-in and financial confirmations stay with the student."
                          : "No shared-profile access is granted by a pending or closed invitation.",
                      )}
                    </p>
                    {row.status === "ACTIVE" ? (
                      <Button asChild variant="secondary">
                        <Link
                          href={
                            "/dashboard/supported-students?student=" +
                            encodeURIComponent(row.studentAccountId)
                          }
                        >
                          {appText(
                            row.supportMode === "MANAGE"
                              ? "Manage shared learning"
                              : "View shared learning",
                          )}
                        </Link>
                      </Button>
                    ) : row.status === "PENDING" ? (
                      <Button asChild variant="secondary">
                        <Link href="/dashboard/supported-students">
                          {appText("Review invitation")}
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
          <HistoryPages
            history={invitations}
            label="Student invitation history"
          />
          <Button asChild variant="outline">
            <Link href="/dashboard/supported-students">
              {appText("Manage invitations & shared access")}
            </Link>
          </Button>
        </section>
      </div>
    </section>
  );
}
