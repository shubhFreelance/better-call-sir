# Remaining MVP work

Updated 14 October 2026. Checkboxes track the stated item only; completed development screens do not close live-service or release requirements.

Current sprint: **F17 support/dispute handling**. F14 and F15 are implemented in development. Features are tested and pushed separately.


## Frontend features

- [x] **F14** Guardian/teacher correction and deletion requests, processing-pause status, retention explanation and progress
- [x] **F15** Reviewer workbench: private evidence, scan status, current-revision screening checks, changes requested, approval/suspension and reasons
- [x] **F16** Operator matching workbench: request criteria, run history, hard-filter explanations, adjustments, reviewed publication, teacher response and no-match recovery
- [ ] **F17** Operator support/rematch queues, scoped demo and attendance dispute review, assignments/status/replies
- [ ] **F18** Finance/admin screens for invoice/payment/refund/payable states and reconciliation, with explicit captured-versus-settled money
- [ ] **F19** Super-admin control console: people/linkage, supply/regions, commercial configuration, privacy/evidence queues, failed jobs, integration health, flags, audit and release state
- [ ] **F20** Real operational charts/reports: manual/assisted funnel, denominators, mature continuation cohorts, unknown/missing observations and separate finance obligations
- [ ] **F21** Finish dedicated role dashboards: per-learner summaries, assigned-teacher details, date presets, service-kind breakdown, teacher activity/completeness/cancellation and feedback sample size
- [ ] **F22** Complete age-appropriate student notice/preferences and remaining guardian/student/teacher onboarding recovery details
- [ ] **F23** Unsupported-scope waitlist intake/status and useful out-of-pilot recovery
- [ ] **F24** Full English/Hindi localization: all forms, notices, validation, dashboard/console copy and typography
- [ ] **F25** Finish remaining legacy screens/components and demo booking-detail forms using the shared shadcn controls and deliberate palette; review every loading/error/empty/retry state on mobile and keyboard

## Backend work

- [ ] **B1** Implement the approved guardian adult-verification process and its owner/reviewer states; newly signed-in adults currently cannot collect learner data until verified. Synthetic verified personas are not a live method.
- [ ] **B2** Server staff MFA, recent-authentication, idle/absolute/step-up sessions and browser enrollment are implemented. Remaining: managed keys, staff provisioning/recovery drill and role administration with required independent/dual approvals for sensitive grants and high-value actions.
- [ ] **B3** Versioned commercial/configuration administration: pricing, fees/plans, service/region coverage, supply checks, history and rollback. Keep accepted terms immutable.
- [ ] **B4** Provider refund execution, signed outcome/retry handling, partial-payment/refund correction records and allocation-loss/late-capture recovery through settlement. A pending refund is not a settled refund.
- [ ] **B5** Actual teacher payout execution and settlement/reconciliation, payee/provider onboarding, commercial/tax accounting and immutable financial adjustment records. A payable marked eligible is not money paid to a teacher.
- [ ] **B6** Periodic provider reconciliation and recovery queues, including captured events missing from local state, amount mismatches and out-of-order/late evidence. Existing manual order-query reconciliation is insufficient.
- [ ] **B7** Durable unique provider-attempt claims now run after the committed local order, outside the retry transaction; concurrency/crash/failure and current consent/eligibility rechecks are tested. Remaining: qualify live receipt/order recovery and reconciliation before charging; uncertain outcomes never automatically create another provider order.
- [ ] **B8** Actual notification delivery, status/receipt history, duplicate-safe retry and staff-visible failure recovery for scope requests, demos, bookings and follow-ups. Worker development delivery is still synthetic.
- [ ] **B9** Durable Google Meet credentials/OAuth lifecycle, participant/Workspace admission policy and recovery handling; current adapter uses an injected short-lived token.
- [ ] **B10** Richer role/date-filtered dashboard metrics and contracts: previous-calendar-month/custom ranges, recurring/demo/revision separation, denominators/sample sizes, pending confirmations and last-updated metadata.
- [ ] **B12** Durable per-request/revised-application/timetable drafts where required; invitation recovery/idempotency/device labels and complete pagination for bounded notes (latest 50), calendar/leave, demo/timetable, session, payable and administrative histories. Preserve owned data and uncertainty during recovery.
- [ ] **B13** Complete follow-up/service-operation read models and queues not covered by existing cases and immutable continuation observations.
- [ ] **B14** Production private-object storage and upload/download/deletion lifecycle; current-signature malware scanning; approved retention rules and external-backup deletion replay. Existing local private files and application scrubbing are development infrastructure.
- [ ] **B15** Contract/schema review for the completed UI: missing response metadata, remaining annotations/warnings, backward-compatible changes and web/API image compatibility evidence. Generated-client consistency checks already exist; they must cover the final contract.

## Live-provider and product acceptance

- [ ] Approve and test the live guardian-verification method, child-data purposes, consent/notice wording, safeguarding procedure and legal retention/deletion rules.
- [ ] Qualify email OTP delivery on a verified sending domain, provider failure/expiry/abuse controls and delivery/data terms. Email replaces SMS per the owner.
- [ ] Approve actual pilot scope, available screened teacher supply, current capability/availability declarations, fee caps, revision pricing, cancellation/refund/replacement rules and teacher compensation/tax treatment.
- [ ] Razorpay account/provider approval, correct keys/webhook configuration, browser checkout, raw signed captures, replay/concurrency/late-capture scenarios, refunds, payouts and reconciled settlement with real provider sandbox evidence. The current checkout kill switch remains closed.
- [ ] Google Meet account/OAuth/Workspace policy, restricted participant access, working 40-minute sessions, join-window expiry, provider failure/recovery and real delivery evidence. A READY sandbox record has no usable meeting.
- [ ] Real end-to-end acceptance for discovery → shortlist → demo → terms/timetable → independently confirmed paid start → invoice/payment; and revision → scope → capture/allocation → private session/recap → attendance/refund where applicable.
- [ ] Complete story acceptance for all in-scope P0 requirements, with owner/reviewer sign-off and no unresolved critical failure. F1–F9 implementation and passing browser tests alone do not close Phases 3–5 or the full MVP.

## Release qualification

- [ ] Finish the versioned security-control register and independent/manual horizontal/vertical access review, including nested IDs, reviewer/operator/finance regions, uploads, provider responses, refunds and session handover.
- [ ] Qualify browser CSP, cross-origin/security headers, XSS/input/CORS/CSRF controls for the actual web/API/proxy and Razorpay/Meet integration.
- [ ] Add/run missing SAST, container/IaC and SBOM scans and authenticated DAST against isolated synthetic accounts. Secret/dependency scans already run, but do not replace these checks.
- [ ] Record critical-domain/backend branch coverage and exclusions against the PRD targets, complete previous-schema migration tests and inspect the latest hosted CI evidence for the exact final source. Basic local/hosted test infrastructure already exists.
- [ ] Build immutable web/API/worker images, test those images together, record digests/contract/migration versions and connect applicable evidence to the existing fail-closed release verifier.
- [ ] Run realistic load/concurrency/resource tests and select a supported VPS/region/capacity/cost from measured results rather than the planning estimate.
- [ ] Configure production private storage and daily encrypted off-host backups; restore database/media, reconcile money after restore and replay deletion markers. Demonstrate the PRD recovery targets and repeatable restore process.
- [ ] Rehearse compatible migrations, application rollback/forward repair, provider and outbox crash recovery and failed-job draining without duplicated money/messages.
- [ ] Establish named operators, support hours/emergency limitations, incident/safeguarding/privacy runbooks, external uptime monitoring and actionable API/database/worker/provider alerts; test an actual alert and operator drill.
- [ ] Provision/harden the supported VPS, domain/DNS/HTTPS, proxy, non-root identities/containers, private database networks, durable volumes, secret injection, health checks and resource/restart limits.
- [ ] Run a synthetic deployment rehearsal, review all mandatory release evidence, then separately authorize merge/deployment/cohort opening. Perform post-deployment smoke checks, provider reconciliation and observation.

## Explicitly deferred / later

- [ ] Masked calling stays disabled, as requested. Parent Pro call delivery, paid sale/renewal/refund periods, provider usage/outcomes and teacher consultation compensation are deferred. The Version 3 PRD calls this US18 P0; the owner's current deferral must remain explicit when defining the first live cohort's accepted scope.
- [ ] Current Google Meet scope is at most 40 minutes; 60-minute online revision is deferred until a qualified provider/account policy supports it.
- [ ] Live paid assisted-selection service (US15) is later. The existing “Let us search for you” request tab remains an operator-reviewed rules workflow.
- [ ] New AI/ML selection/ranking models (US16) are later. Eligibility cannot be overridden; no unapproved child-data training/export is enabled.
- [ ] Teacher Pro subscriptions, instant tutoring, gamification, coaching-centre tooling and native mobile are later scope.
- [ ] AWS migration/high availability/national operational rollout follow demonstrated demand, load/recovery evidence and a separate infrastructure plan.

## Delivery record

- F1–F13 development UI and existing API foundation are implemented; live gates above remain open.
- F14: implemented; seven browser checks, 77 API checks and production/security validation passed.
- F16: implemented; nine browser checks and 78 API checks, with separate tested backend/frontend pushes.
- F15: implemented; 11 reviewer checks, 78 API checks, privacy/support/journey regression and production/security validation passed.

Full context: [MVP remaining inventory](docs/MVP_REMAINING.md) and [sprint evidence](docs/SPRINTS.md).
