# Better Call Sir — remaining MVP work

Reviewed against the owner's Version 3 PRD, the delivery board and implementation on 14 October 2026. This is the outstanding-work inventory after frontend increment F19 and the owner-priority security audit. Development implementation, live provider qualification and pilot acceptance are different statuses. Phase 3 is still active; Phases 4–7 have not been accepted.

## Implemented foundation to build on

Email OTP UI/transport boundary; guardian consent and saved onboarding; teacher application/private evidence/calendar; guardian-managed student activation/revocation; public manual and assisted discovery; guardian shortlists/teacher choice/demo/terms; recurring timetable agreement and lesson materialization; role-scoped lesson history/attendance review; revision request/expert scope/cancellation; saved checkout recovery and Razorpay browser handoff; invoice checkout; participant/time-gated private meeting access. Private guardian lesson feedback, teacher recap/feedback visibility and caller-only attendance review status now persist across reload, with version/consent checks and retry-safe submission. Private note creation/editing, named-teacher sharing/withdrawal and explicit acknowledgement are implemented with review, retry and privacy-pause handling. Private support case history/status/detail, paginated conversations and reviewed requests/replies are implemented for guardians, students and teachers, with free public emergency guidance and stale/uncertain/saved-refresh recovery. Guardian placement closure and replacement decisions now include effects review, fresh criteria/availability, private linked support and request progress, with retry/version recovery. Guardian/teacher privacy requests, reviewed correction/deletion forms, immediate processing-pause explanation and private status/outcome history are implemented. MFA-protected reviewer evidence/scanning, immutable current-revision screening checks, changes requested, approval and suspension review are implemented. Operator matching now includes owned/region-scoped request criteria, reloadable unpublished candidates, current eligibility, adjusted/replaced publication, teacher response, run history and no-match/schedule recovery. Staff support operations now include filtered regional queues, self-assignment/release, explicitly private notes versus owner replies, linked demo evidence and reviewed demo/attendance dispute outcomes with case progress. MFA-protected finance/admin screens now show dated recorded totals, paginated invoices/checkouts/captures/refund requests/payables and reviewed provider-status queries with separate capture/obligation/settlement wording. Refund/payout execution and periodic reconciliation remain pending. The ADMIN console now provides supervised account/linkage inspection, regional profile-status snapshots, read-only code policy examples, reviewed privacy/flags/private-media retries/deletion replays and paginated audit evidence, with specialist workspace routing and explicit blocked release. Staff grants and commercial policy editing remain B2/B3. Staff MFA enrollment/recovery and browser CSP are also implemented. These use tested development APIs. Local sandbox payments and meetings are explicitly labelled and do not establish real service delivery or settlement.

F10 and B11’s owner-safe lesson metadata are implemented. Feedback remains private; there is no public review publication. Any future public use requires moderation. Attendance review/feedback correction still uses support escalation, with no self-service overwrite.

## Frontend work still open

| # | Work remaining | Backend position |
| --- | --- | --- |
| F20 | Real operational charts/reports: manual/assisted funnel, denominators, mature continuation cohorts, unknown/missing observations and separate finance obligations | Funnel/finance APIs exist. Do not substitute invented activity charts for reporting data. |
| F21 | Finish dedicated role dashboards: per-learner summaries, assigned-teacher details, date presets, service-kind breakdown, teacher activity/completeness/cancellation and feedback sample size | Current dashboards provide recorded rolling-window metrics and bounded snapshots; richer date-bound metrics/read contracts are still needed. |
| F22 | Complete age-appropriate student notice/preferences and remaining guardian/student/teacher onboarding recovery details | Parent-managed activation and initial saved drafts exist. Preference fields and durable recovery for later drafts/invitations need contract work. |
| F23 | Unsupported-scope waitlist intake/status and useful out-of-pilot recovery | Waitlist API exists; the full user-facing flow is missing. |
| F24 | Full English/Hindi localization: all forms, notices, validation, dashboard/console copy and typography | Existing language toggle covers only part of the product. |
| F25 | Finish remaining legacy screens/components and demo booking-detail forms using the shared shadcn controls and deliberate palette; review every loading/error/empty/retry state on mobile and keyboard | Incremental migration is underway. Initial demo controls and service/console screens are not all at the new standard. |

The next practical sprint is operator support/disputes, followed by finance/admin/reporting screens and localization. F9 checkout/provider qualification is tracked below rather than described as live-ready.

## Backend implementation and contract gaps

| # | Work remaining |
| --- | --- |
| B1 | Implement the approved guardian adult-verification process and its owner/reviewer states; newly signed-in adults currently cannot collect learner data until verified. Synthetic verified personas are not a live method. |
| B2 | Server staff MFA, recent-authentication, idle/absolute/step-up sessions and browser enrollment are implemented. Remaining: managed keys, staff provisioning/recovery drill and role administration with required independent/dual approvals for sensitive grants and high-value actions. |
| B3 | Versioned commercial/configuration administration: pricing, fees/plans, service/region coverage, supply checks, history and rollback. Keep accepted terms immutable. |
| B4 | Provider refund execution, signed outcome/retry handling, partial-payment/refund correction records and allocation-loss/late-capture recovery through settlement. A pending refund is not a settled refund. |
| B5 | Actual teacher payout execution and settlement/reconciliation, payee/provider onboarding, commercial/tax accounting and immutable financial adjustment records. A payable marked eligible is not money paid to a teacher. |
| B6 | Periodic provider reconciliation and recovery queues, including captured events missing from local state, amount mismatches and out-of-order/late evidence. Existing manual order-query reconciliation is insufficient. |
| B7 | Durable unique provider-attempt claims now run after the committed local order, outside the retry transaction; concurrency/crash/failure and current consent/eligibility rechecks are tested. Remaining: qualify live receipt/order recovery and reconciliation before charging; uncertain outcomes never automatically create another provider order. |
| B8 | Actual notification delivery, status/receipt history, duplicate-safe retry and staff-visible failure recovery for scope requests, demos, bookings and follow-ups. Worker development delivery is still synthetic. |
| B9 | Durable Google Meet credentials/OAuth lifecycle, participant/Workspace admission policy and recovery handling; current adapter uses an injected short-lived token. |
| B10 | Richer role/date-filtered dashboard metrics and contracts: previous-calendar-month/custom ranges, recurring/demo/revision separation, denominators/sample sizes, pending confirmations and last-updated metadata. |
| B12 | Durable per-request/revised-application/timetable drafts where required; invitation recovery/idempotency/device labels and complete pagination for bounded notes (latest 50), calendar/leave, demo/timetable, session, payable and administrative histories. Preserve owned data and uncertainty during recovery. |
| B13 | Complete follow-up/service-operation read models and queues not covered by existing cases and immutable continuation observations. |
| B14 | Production private-object storage and upload/download/deletion lifecycle; current-signature malware scanning; approved retention rules and external-backup deletion replay. Existing local private files and application scrubbing are development infrastructure. |
| B15 | Contract/schema review for the completed UI: missing response metadata, remaining annotations/warnings, backward-compatible changes and web/API image compatibility evidence. Generated-client consistency checks already exist; they must cover the final contract. |

These items include backend work previously deferred by the owner to progress the frontend. That deferral does not record the work as implemented.

## Provider, commercial and product acceptance still open

1. Approve and test the live guardian-verification method, child-data purposes, consent/notice wording, safeguarding procedure and legal retention/deletion rules.
2. Qualify email OTP delivery on a verified sending domain, provider failure/expiry/abuse controls and delivery/data terms. Email replaces SMS per the owner.
3. Approve actual pilot scope, available screened teacher supply, current capability/availability declarations, fee caps, revision pricing, cancellation/refund/replacement rules and teacher compensation/tax treatment.
4. Razorpay account/provider approval, correct keys/webhook configuration, browser checkout, raw signed captures, replay/concurrency/late-capture scenarios, refunds, payouts and reconciled settlement with real provider sandbox evidence. The current checkout kill switch remains closed.
5. Google Meet account/OAuth/Workspace policy, restricted participant access, working 40-minute sessions, join-window expiry, provider failure/recovery and real delivery evidence. A READY sandbox record has no usable meeting.
6. Real end-to-end acceptance for discovery → shortlist → demo → terms/timetable → independently confirmed paid start → invoice/payment; and revision → scope → capture/allocation → private session/recap → attendance/refund where applicable.
7. Complete story acceptance for all in-scope P0 requirements, with owner/reviewer sign-off and no unresolved critical failure. F1–F9 implementation and passing browser tests alone do not close Phases 3–5 or the full MVP.

## Release qualification — Phases 6–7

1. Finish the versioned security-control register and independent/manual horizontal/vertical access review, including nested IDs, reviewer/operator/finance regions, uploads, provider responses, refunds and session handover.
2. Qualify browser CSP, cross-origin/security headers, XSS/input/CORS/CSRF controls for the actual web/API/proxy and Razorpay/Meet integration.
3. Add/run missing SAST, container/IaC and SBOM scans and authenticated DAST against isolated synthetic accounts. Secret/dependency scans already run, but do not replace these checks.
4. Record critical-domain/backend branch coverage and exclusions against the PRD targets, complete previous-schema migration tests and inspect the latest hosted CI evidence for the exact final source. Basic local/hosted test infrastructure already exists.
5. Build immutable web/API/worker images, test those images together, record digests/contract/migration versions and connect applicable evidence to the existing fail-closed release verifier.
6. Run realistic load/concurrency/resource tests and select a supported VPS/region/capacity/cost from measured results rather than the planning estimate.
7. Configure production private storage and daily encrypted off-host backups; restore database/media, reconcile money after restore and replay deletion markers. Demonstrate the PRD recovery targets and repeatable restore process.
8. Rehearse compatible migrations, application rollback/forward repair, provider and outbox crash recovery and failed-job draining without duplicated money/messages.
9. Establish named operators, support hours/emergency limitations, incident/safeguarding/privacy runbooks, external uptime monitoring and actionable API/database/worker/provider alerts; test an actual alert and operator drill.
10. Provision/harden the supported VPS, domain/DNS/HTTPS, proxy, non-root identities/containers, private database networks, durable volumes, secret injection, health checks and resource/restart limits.
11. Run a synthetic deployment rehearsal, review all mandatory release evidence, then separately authorize merge/deployment/cohort opening. Perform post-deployment smoke checks, provider reconciliation and observation.

## Owner-deferred and later work — not silently included as completed MVP

- Masked calling stays disabled, as requested. Parent Pro call delivery, paid sale/renewal/refund periods, provider usage/outcomes and teacher consultation compensation are deferred. The Version 3 PRD calls this US18 P0; the owner's current deferral must remain explicit when defining the first live cohort's accepted scope.
- Current Google Meet scope is at most 40 minutes; 60-minute online revision is deferred until a qualified provider/account policy supports it.
- Live paid assisted-selection service (US15) is later. The existing “Let us search for you” request tab remains an operator-reviewed rules workflow.
- New AI/ML selection/ranking models (US16) are later. Eligibility cannot be overridden; no unapproved child-data training/export is enabled.
- Teacher Pro subscriptions, instant tutoring, gamification, coaching-centre tooling and native mobile are later scope.
- AWS migration/high availability/national operational rollout follow demonstrated demand, load/recovery evidence and a separate infrastructure plan.

No arbitrary completion percentage is assigned: frontend screens, backend implementation gaps and live acceptance gates have different effort and prerequisites.
