// Reviewed entry-role policy. Resource ownership, consent and delegated permissions are tested separately.
const A = ["ADMIN"],
  O = ["ADMIN", "OPERATOR"],
  R = ["ADMIN", "REVIEWER"],
  F = ["ADMIN", "FINANCE"];
export const accessPolicy: {
  method: "GET" | "POST";
  path: string;
  roles: string[];
}[] = [
  ...[
    "/admin/console",
    "/admin/accounts",
    "/admin/accounts/{id}/linkage",
    "/admin/audit",
    "/admin/jobs",
    "/admin/staff",
    "/admin/staff/changes",
    "/admin/commercial",
    "/admin/commercial/history",
    "/admin/commercial/changes",
    "/admin/privacy-requests",
    "/admin/privacy/deletion-ledger",
  ].map((path) => ({ method: "GET" as const, path, roles: A })),
  ...[
    "/admin/requests/{id}/recommendations",
    "/admin/requests/{id}/recommendation-runs",
    "/admin/reports/regions",
    "/admin/reports/funnel",
    "/admin/service-followups",
    "/admin/service-followups/PLACEMENT/{id}",
    "/admin/service-followups/PLACEMENT/{id}/contact-details",
    "/admin/email-deliveries",
    "/admin/tuition-minimum-reviews",
    "/admin/lessons/disputes",
  ].map((path) => ({ method: "GET" as const, path, roles: O })),
  ...[
    "/admin/teachers",
    "/admin/teachers/{id}/checks",
    "/admin/guardian-verifications",
  ].map((path) => ({ method: "GET" as const, path, roles: R })),
  ...["/admin/finance/records", "/admin/reports/finance"].map((path) => ({
    method: "GET" as const,
    path,
    roles: F,
  })),
  { method: "GET", path: "/teachers/{id}/evidence", roles: ["TEACHER", ...R] },
  { method: "GET", path: "/evidence/{id}/content", roles: ["TEACHER", ...R] },
  {
    method: "GET",
    path: "/guardian-evidence/{id}/content",
    roles: ["GUARDIAN", ...R],
  },
  {
    method: "GET",
    path: "/guardian-verifications/{id}",
    roles: ["GUARDIAN", ...R],
  },
  { method: "GET", path: "/notes", roles: ["GUARDIAN", "TEACHER"] },
  { method: "GET", path: "/children", roles: ["GUARDIAN", "STUDENT"] },
  {
    method: "GET",
    path: "/children/{id}/student-sessions",
    roles: ["GUARDIAN"],
  },
  { method: "GET", path: "/learner-profiles", roles: ["GUARDIAN", "STUDENT"] },
  {
    method: "GET",
    path: "/independent-student/profile",
    roles: ["INDEPENDENT_STUDENT"],
  },
  {
    method: "GET",
    path: "/independent-student/sessions",
    roles: ["INDEPENDENT_STUDENT"],
  },
  {
    method: "GET",
    path: "/delegated-students/{id}/profile",
    roles: ["GUARDIAN"],
  },
  {
    method: "GET",
    path: "/delegated-students/{id}/enquiry-context",
    roles: ["GUARDIAN"],
  },
  {
    method: "GET",
    path: "/student-guardian-grants",
    roles: ["GUARDIAN", "INDEPENDENT_STUDENT"],
  },
  {
    method: "GET",
    path: "/student-arrangements/{id}/contact",
    roles: ["GUARDIAN", "INDEPENDENT_STUDENT", "TEACHER"],
  },
  {
    method: "GET",
    path: "/auth/mfa",
    roles: ["ADMIN", "OPERATOR", "REVIEWER", "FINANCE"],
  },
  { method: "POST", path: "/notes", roles: ["GUARDIAN"] },
  { method: "POST", path: "/notes/{id}/shares", roles: ["GUARDIAN"] },
  { method: "POST", path: "/notes/{id}/acknowledgements", roles: ["TEACHER"] },
  { method: "POST", path: "/admin/cases/{id}/triage", roles: O },
  {
    method: "POST",
    path: "/admin/service-followups/PLACEMENT/{id}/assignments",
    roles: O,
  },
  {
    method: "POST",
    path: "/admin/service-followups/PLACEMENT/{id}/contacts",
    roles: O,
  },
  { method: "POST", path: "/admin/teachers/{id}/checks", roles: R },
  { method: "POST", path: "/admin/evidence/{id}/retries", roles: R },
  { method: "POST", path: "/admin/staff/changes", roles: A },
  { method: "POST", path: "/admin/commercial/changes", roles: A },
  { method: "POST", path: "/consents", roles: ["GUARDIAN"] },
];
