# Remaining MVP work

Updated 16 October 2026. Checkboxes track the stated item only; completed development screens do not close live-service or release requirements.

Next sprint: **remaining H2 access polish, H5 localization and launch qualification**. Guardian drafts, weekly availability, teacher-revision drafts and dashboard hiring-term confirmation are implemented. The owner has deferred individual class booking/management until later scale. F14–F21 remain implemented development history. Features are tested and pushed separately.

Current scope: [Teacher discovery and hiring](docs/MVP_SCOPE.md). This overrides broader class-management launch requirements in the original PRD. Existing security, privacy and release controls remain required for the focused journey.

## Current priorities

- [x] **H1** Teacher discovery, manual/assisted primary navigation and enquiry-focused profile action implemented. Individual class-booking promotion removed; existing direct routes retained.
- [x] **H2 details increment** Teacher private address, education/results, work and certificate/reference declarations; learner school/class subjects; five-step teacher review and private owner/reviewer summaries. Actual evidence uses the existing private scanned upload workflow.
- [x] **H3 optional demo increment** Explicit teacher choice, public opt-in badge, opt-out proposal/slot protection and eligible terms without a demo. Already requested demos retain cancellation/outcome/dispute handling.
- [x] **H2 enquiry-draft increment** Initial onboarding and one active additional enquiry have separate private, versioned saved drafts; resume, duplicate-safe submit, explicit post-submission restart, stale/uncertain recovery and protection from a different teacher link. Multiple simultaneous unfinished enquiry drafts remain outside this increment.
- [x] **H2 draft-choice increment** Explicit acknowledged discard of unfinished initial/additional enquiry drafts, keeping submitted records/learner profiles; safe switch to another teacher, cancel/retry/version recovery and editing lock during review.
- [x] **H2 weekly-availability increment** New enquiries use weekday/time ranges; existing dated windows remain supported. Draft resume, review, family editing and operator summaries preserve weekly intent. Matching rechecks actual free overlap, leave, reservations, screening/travel/capacity without booking classes.
- [x] **H2 teacher-revision increment** Private saved application revisions, step-by-step resume, no publication before resubmission, fresh fee acknowledgement, retry/version protection and acknowledged stale-draft discard.
- [x] **H2 student welcome increment** Optional private subject/language/learning preferences using existing student draft endpoints, with age-appropriate guardian/privacy guidance and save/recovery states.
- [x] **H2 invitation-recovery increment** Private status, acknowledged versioned replacement, invalidation of earlier codes, metadata-only idempotent recovery, explicit refresh after lost responses and no readable code storage.
- [ ] **H2** Finish remaining access/recovery polish and history limits; guardian/teacher/student drafts, invitation recovery and the primary hiring handoff are implemented
- [x] **H3 dashboard terms increment** Guardian/teacher hiring-term review and versioned acceptance in primary dashboards; explicit waiting/both-confirmed states, policy/fee review, private financial scope and stale/uncertain recovery. Acceptance is independent of class timetables, service start and payment.
- [x] **H3 hiring journey increment** Enquiry detail/teacher replies → explicit selection → terms → exact owned hiring confirmation, with mutual acceptance states and no mandatory class timetable/demo. Legacy start controls remain secondary; live acceptance stays open.
- [x] **H4** Hiring overview for student, guardian, teacher and superadmin: scoped enquiry/arrangement records, counts, learner/application metadata, reviewed teacher responses, operational drill-downs and recovery states. Remaining H2/H5 polish and live qualification stay open.
- [ ] **H5** Finish no-match/waitlist, support/replacement, privacy, mobile/keyboard/recovery and localization for the hiring journey


## Earlier frontend backlog — reprioritized by current scope

- [x] **F14** Guardian/teacher correction and deletion requests, processing-pause status, retention explanation and progress
- [x] **F15** Reviewer workbench: private evidence, scan status, current-revision screening checks, changes requested, approval/suspension and reasons
- [x] **F16** Operator matching workbench: request criteria, run history, hard-filter explanations, adjustments, reviewed publication, teacher response and no-match recovery
- [x] **F17** Operator support/rematch queues, scoped demo and attendance dispute review, assignments/status/replies
- [x] **F18** Finance/admin screens for invoice/payment/refund/payable states and reconciliation, with explicit captured-versus-settled money
- [x] **F19** Super-admin console: people/linkage inspection, regional supply snapshot, read-only commercial rules, privacy review/evidence routing, recovery jobs/deletion replay, integration modes, reviewed flags, audit and blocked release state. Staff grants and commercial editing remain B2/B3.
- [x] **F20** Operational charts/reports: scoped manual/assisted request cohorts, exact denominators, mature continuation outcomes with unknown/missing evidence, IST date presets/custom ranges and separate finance capture modes/obligations. Live settlement remains unverified.
- [x] **F21** Dedicated guardian/student/teacher dashboards: paginated authorized learner summaries, current teacher/next class, rolling/calendar/custom periods, recurring/revision/demo separation, exact teaching/attendance denominators, cancellations/absence/disputes, pending confirmations and private feedback sample size. Live acceptance stays open.
- [x] **F22 student welcome increment** Age-appropriate privacy/guardian guidance and optional private learning preferences, with save/resume, clearing, stale/uncertain recovery and skip/discovery routes.
- [ ] **F22** Remaining access polish, device labels and final cross-journey recovery review; primary onboarding/revision/invitation recovery is implemented
- [x] **F23** Unsupported-scope waitlist intake/private recorded status, supported-scope recovery, retry-safe save/history and useful no-match/discovery alternatives. No future teacher supply or notifications are promised.
- [ ] **F24** Full English/Hindi localization: all forms, notices, validation, dashboard/console copy and typography
- [ ] **F25** Finish remaining legacy screens/components and demo booking-detail forms using the shared shadcn controls and deliberate palette; review every loading/error/empty/retry state on mobile and keyboard

## Backend inventory — apply to the focused journey

- [ ] **B1** Implement the approved guardian adult-verification process and its owner/reviewer states; newly signed-in adults currently cannot collect learner data until verified. Synthetic verified personas are not a live method.
- [ ] **B2** Server staff MFA, recent-authentication, idle/absolute/step-up sessions and browser enrollment are implemented. Remaining: managed keys, staff provisioning/recovery drill and role administration with required independent/dual approvals for sensitive grants and high-value actions.
- [ ] **B3** Versioned commercial/configuration administration: pricing, fees/plans, service/region coverage, supply checks, history and rollback. Keep accepted terms immutable.
- [ ] **B4** Provider refund execution, signed outcome/retry handling, partial-payment/refund correction records and allocation-loss/late-capture recovery through settlement. A pending refund is not a settled refund.
- [ ] **B5** Actual teacher payout execution and settlement/reconciliation, payee/provider onboarding, commercial/tax accounting and immutable financial adjustment records. A payable marked eligible is not money paid to a teacher.
- [ ] **B6** Periodic provider reconciliation and recovery queues, including captured events missing from local state, amount mismatches and out-of-order/late evidence. Existing manual order-query reconciliation is insufficient.
- [ ] **B7** Durable unique provider-attempt claims now run after the committed local order, outside the retry transaction; concurrency/crash/failure and current consent/eligibility rechecks are tested. Remaining: qualify live receipt/order recovery and reconciliation before charging; uncertain outcomes never automatically create another provider order.
- [ ] **B8** Actual notification delivery, status/receipt history, duplicate-safe retry and staff-visible failure recovery for scope requests, demos, bookings and follow-ups. Worker development delivery is still synthetic.
- [ ] **B9** Durable Google Meet credentials/OAuth lifecycle, participant/Workspace admission policy and recovery handling; current adapter uses an injected short-lived token.
- [x] **B10** Role/date-filtered learning dashboard metrics and contracts: rolling/default and previous-calendar-month/custom ranges, recurring/revision lessons and separate demo outcomes, denominators/sample sizes, pending confirmations, current assignments/next lessons, learner pagination and lastUpdated metadata. Live/release qualification stays open.
- [ ] **B12** One active additional-enquiry draft is implemented. Remaining: multiple concurrent enquiry drafts if required, timetable drafts (deferred); device labels and complete pagination for bounded notes (latest 50), calendar/leave, demo/timetable, session, payable and administrative histories. Preserve owned data and uncertainty during recovery.
- [ ] **B13** Complete follow-up/service-operation read models and queues not covered by existing cases and immutable continuation observations.
- [ ] **B14** Production private-object storage and upload/download/deletion lifecycle; current-signature malware scanning; approved retention rules and external-backup deletion replay. Existing local private files and application scrubbing are development infrastructure.
- [ ] **B15** Contract/schema review for the completed UI: missing response metadata, remaining annotations/warnings, backward-compatible changes and web/API image compatibility evidence. Generated-client consistency checks already exist; they must cover the final contract.

## Earlier live-provider and product acceptance inventory

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

- [ ] Individual class/revision booking, recurring timetables/lesson materialization, attendance/confirmation/disputes, lesson feedback/notes/analytics and expanded student learning dashboards. Existing code is retained; further work and launch qualification move to later scale.
- [ ] Class-specific Razorpay checkout/refund/payout/reconciliation and Google Meet delivery qualification. Hiring payments, if introduced, require their own scoped approval and provider qualification; existing gates stay closed.

- [ ] Masked calling stays disabled, as requested. Parent Pro call delivery, paid sale/renewal/refund periods, provider usage/outcomes and teacher consultation compensation are deferred. The Version 3 PRD calls this US18 P0; the owner's current deferral must remain explicit when defining the first live cohort's accepted scope.
- [ ] Current Google Meet scope is at most 40 minutes; 60-minute online revision is deferred until a qualified provider/account policy supports it.
- [ ] Live paid assisted-selection service (US15) is later. The existing “Let us search for you” request tab remains an operator-reviewed rules workflow.
- [ ] New AI/ML selection/ranking models (US16) are later. Eligibility cannot be overridden; no unapproved child-data training/export is enabled.
- [ ] Teacher Pro subscriptions, instant tutoring, gamification, coaching-centre tooling and native mobile are later scope.
- [ ] AWS migration/high availability/national operational rollout follow demonstrated demand, load/recovery evidence and a separate infrastructure plan.

## Delivery record

- H1/H4: discovery and the four hiring overviews implemented. 89 API, nine contract and 46 hiring/family/navigation/history browser checks pass; all 15 focused hiring checks passed after final recovery refinement. Class management is secondary; H2/H3 remain open.

- F1–F13 development UI and existing API foundation are implemented; live gates above remain open.
- F14: implemented; seven browser checks, 77 API checks and production/security validation passed.
- F15: implemented; 11 reviewer checks, 78 API checks, privacy/support/journey regression and production/security validation passed.

- F16: implemented; nine browser checks and 78 API checks, with separate tested backend/frontend pushes.
- F17: implemented; 11 staff support/dispute checks, 79 API checks and journey/learning/support regression verified.

- F18: implemented; 14 finance browser checks, 80 API checks and nine contract checks pass; frontend/backend pushes remain separate. Refund/payout execution stays open above.

- F19: console implemented; 17 console browser checks, 39 related browser regressions and 82 API checks pass. Staff grants/configuration editing remain B2/B3; live release stays blocked.

- F20: reporting endpoints and charts implemented; 84 API, nine contract and 39 report/finance/navigation browser checks pass. Dedicated role dashboards remain F21/B10.

- F21: role dashboards and metric contract implemented; 87 API, nine contract and 32 dashboard/family/navigation browser checks pass. Personal dashboards exclude student finance and feedback.

Full context: [MVP remaining inventory](docs/MVP_REMAINING.md) and [sprint evidence](docs/SPRINTS.md).
