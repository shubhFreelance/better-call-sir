"use client";
import Link from "next/link";
import {
  Link2,
  Eye,
  Plus,
  ChevronDown,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import type { Session, components } from "@bcs/api-client";
import {
  FilterButton,
  FilterButtonGroup,
} from "../components/ui/filter-button";
import { InfoTooltip } from "../components/ui/info-tooltip";
import { StatusBadge } from "../components/ui/status-controls";
import { LearningManagementBadge } from "../components/ui/learning-management-badge";
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
  const { appText, appLocale } = useAppTranslation();
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
  const invitationCount = invitations.loadedCount.toLocaleString(appLocale),
    pendingInvitations =
      invitations.data?.items.filter((row) => row.status === "PENDING")
        .length || 0,
    invitationsEmpty = !!invitations.data && !invitations.loadedCount;
  return (
    <section
      className="guardian-learners"
      aria-labelledby="guardian-relationships-heading"
    >
      <div className="guardian-family-panel">
        <section
          className="guardian-relationships"
          data-complete={
            !relationships.isFetching &&
            !!relationships.data &&
            !relationships.hasNextPage &&
            !relationships.looped
              ? "true"
              : undefined
          }
        >
          <header className="guardian-relationships-heading">
            <div>
              <h2 id="guardian-relationships-heading">
                {appText("Your learner relationships")}
              </h2>
              <InfoTooltip
                label={appText("About learner relationships")}
                items={[
                  appText(
                    "Verify each child separately. Saving education details does not send a verification request.",
                  ),
                  appText(
                    "Relationship approval is separate from learning permission and profile setup.",
                  ),
                ]}
              />
            </div>
            <FilterButton asChild accent>
              <Link href="/guardian-verification?new=1">
                <Plus size={16} aria-hidden="true" />
                {appText("Verify learner")}
              </Link>
            </FilterButton>
          </header>
          {relationships.data &&
            (!relationships.data.items.length ? (
              <p className="guardian-relationship-empty">
                {appText(
                  "No relationship requests yet. Start verification for your first learner.",
                )}
              </p>
            ) : (
              <ul className="guardian-relationship-list">
                {relationships.data.items.map((row) => (
                  <li key={row.id}>
                    <h3>{row.learnerName}</h3>
                    <StatusBadge
                      label={appText(relationshipStatus[row.status])}
                      tone={
                        row.status === "APPROVED"
                          ? "success"
                          : ["PENDING", "CHANGES_REQUESTED"].includes(
                                row.status,
                              )
                            ? "warning"
                            : "neutral"
                      }
                      icon={row.status === "APPROVED" ? ShieldCheck : Clock3}
                    />
                    <Link
                      className="guardian-learner-eye"
                      href={
                        "/guardian-verification?request=" +
                        encodeURIComponent(row.id)
                      }
                      aria-label={appText("View relationship for {0}", [
                        row.learnerName,
                      ])}
                      title={appText("View relationship for {0}", [
                        row.learnerName,
                      ])}
                    >
                      <Eye size={18} aria-hidden="true" />
                    </Link>
                    <div className="guardian-learner-management">
                      <LearningManagementBadge
                        label={appText(
                          {
                            GUARDIAN_ONLY: "Guardian manages learning",
                            SHARED: "Guardian and student manage together",
                            STUDENT_LED:
                              "Student manages; guardian follows progress",
                          }[row.managementMode],
                        )}
                        items={[
                          appText(
                            "Relationship approval is separate from learning permission and profile setup.",
                          ),
                          ...(row.status === "APPROVED"
                            ? []
                            : [
                                appText(
                                  "Review this request for evidence, acknowledgment and the next verification step.",
                                ),
                              ]),
                        ]}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          <footer className="guardian-relationships-footer">
            <HistoryPages
              history={relationships}
              label="Learner relationship history"
            />
            <Link
              className="guardian-education-link"
              href="/dashboard/learners"
            >
              {appText("Open education profiles")}
            </Link>
          </footer>
        </section>
        <details
          className="guardian-support-invitations"
          data-empty={invitationsEmpty ? "true" : undefined}
        >
          <summary>
            <Link2 size={18} aria-hidden="true" />
            <span className="guardian-support-title">
              {appText("Student support invitations")}
            </span>
            <span className="guardian-support-meta" aria-live="polite">
              {appText(
                invitations.error
                  ? "Invitations unavailable"
                  : invitations.isPending || invitations.isFetching
                    ? "Loading invitations…"
                    : invitations.loadedCount
                      ? "{0} invitations"
                      : "No invitations",
                [
                  invitationCount +
                    (invitations.hasNextPage || invitations.looped ? "+" : ""),
                ],
              )}
              {!!pendingInvitations && (
                <span className="guardian-support-pending">
                  {appText("{0} awaiting reply", [pendingInvitations])}
                </span>
              )}
            </span>
            <ChevronDown
              className="guardian-support-chevron"
              size={18}
              aria-hidden="true"
            />
          </summary>
          <div className="guardian-support-content">
            <div className="guardian-support-explainer">
              <p>
                {appText(
                  "Independent adult students can invite your registered email from Learning support.",
                )}
              </p>
              <InfoTooltip
                label={appText("About invited access")}
                items={[
                  appText(
                    "An invitation shares learning access; it does not verify a parent or guardian relationship.",
                  ),
                  appText(
                    "Access covers this student's shared learning only. Account ownership, sign-in and financial confirmations stay with the student.",
                  ),
                ]}
              />
            </div>
            {invitations.data && !!invitations.data.items.length && (
              <ul className="guardian-support-list">
                {invitations.data.items.map((row) => {
                  const name = row.studentName || appText("Student"),
                    action =
                      row.status === "PENDING"
                        ? appText("Review invitation from {0}", [name])
                        : appText(
                            row.supportMode === "MANAGE"
                              ? "Manage shared learning for {0}"
                              : "View shared learning for {0}",
                            [name],
                          );
                  return (
                    <li key={row.id}>
                      <h3>{name}</h3>
                      <StatusBadge
                        label={appText(invitationStatus[row.status])}
                        tone={
                          row.status === "ACTIVE"
                            ? "accent"
                            : row.status === "PENDING"
                              ? "warning"
                              : "neutral"
                        }
                        icon={row.status === "PENDING" ? Clock3 : Link2}
                      />
                      {["ACTIVE", "PENDING"].includes(row.status) && (
                        <Link
                          className="guardian-learner-eye"
                          href={
                            row.status === "ACTIVE"
                              ? "/dashboard/supported-students?student=" +
                                encodeURIComponent(row.studentAccountId)
                              : "/dashboard/supported-students"
                          }
                          aria-label={action}
                          title={action}
                        >
                          <Eye size={18} aria-hidden="true" />
                        </Link>
                      )}
                      <div className="guardian-support-permission">
                        <span>
                          {appText(
                            row.supportMode === "MANAGE"
                              ? "Manage shared learning"
                              : "Advice only",
                          )}
                        </span>
                        <InfoTooltip
                          label={appText("Shared access for {0}", [name])}
                          items={[
                            appText(
                              row.status === "ACTIVE"
                                ? "Access covers this student's shared learning only. Account ownership, sign-in and financial confirmations stay with the student."
                                : "No shared-profile access is granted by a pending or closed invitation.",
                            ),
                          ]}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <FilterButtonGroup className="guardian-support-actions">
              <HistoryPages
                history={invitations}
                label="Student invitation history"
              />
              <FilterButton asChild>
                <Link href="/dashboard/supported-students">
                  {appText("Manage invitations & shared access")}
                </Link>
              </FilterButton>
            </FilterButtonGroup>
          </div>
        </details>
      </div>
    </section>
  );
}
