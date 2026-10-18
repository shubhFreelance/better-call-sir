# Better Call Sir — remaining MVP work

Reviewed against the owner's Version 3 PRD, the delivery board and implementation on 14 October 2026. This is the outstanding-work inventory after frontend increment F21 and the owner-priority security audit. Development implementation, live provider qualification and pilot acceptance are different statuses. Phase 3 is still active; Phases 4–7 have not been accepted.

## Current owner-directed scope

The owner narrowed the next MVP on 14 October 2026 to teacher discovery, enquiries and hiring. [Current scope and priorities](MVP_SCOPE.md) supersede the original class-management launch requirements. H1 discovery/profile emphasis and H4 dashboards focused on hiring are implemented in development. Guardian enquiry drafts, weekly availability, teacher revisions, student preferences, invitation recovery and connected enquiry-to-hiring confirmation are implemented. No-match and future-coverage recovery are implemented. Whole-app English/Hindi localization is complete. Onboarding/access recovery is implemented in development. Remaining work covers other bounded histories, whole-journey UI review and launch qualification. Individual class booking, timetables, attendance/lesson feedback and related provider qualification move to later scale. Existing implementations and their limits remain recorded below. Authentication, consent, teacher screening, privacy, support and applicable security/release requirements still apply.

The inventory below preserves the broader backlog; it is not an instruction to complete every class-management item before the focused hiring MVP. F22–F25/B12 are reprioritized by relevance to the current journey; class-specific finance/Meet items are deferred unless separately required by an approved hiring payment flow.

## Implemented foundation to build on

Email OTP UI/transport boundary; guardian consent and saved onboarding; teacher application/private evidence/calendar; guardian-managed student activation/revocation; public manual and assisted discovery; guardian shortlists/teacher choice/demo/terms; recurring timetable agreement and lesson materialization; role-scoped lesson history/attendance review; revision request/expert scope/cancellation; saved checkout recovery and Razorpay browser handoff; invoice checkout; participant/time-gated private meeting access. Private guardian lesson feedback, teacher recap/feedback visibility and caller-only attendance review status now persist across reload, with version/consent checks and retry-safe submission. Private note creation/editing, named-teacher sharing/withdrawal and explicit acknowledgement are implemented with review, retry and privacy-pause handling. Private support case history/status/detail, paginated conversations and reviewed requests/replies are implemented for guardians, students and teachers, with free public emergency guidance and stale/uncertain/saved-refresh recovery. Guardian placement closure and replacement decisions now include effects review, fresh criteria/availability, private linked support and request progress, with retry/version recovery. Guardian/teacher privacy requests, reviewed correction/deletion forms, immediate processing-pause explanation and private status/outcome history are implemented. MFA-protected reviewer evidence/scanning, immutable current-revision screening checks, changes requested, approval and suspension review are implemented. Operator matching now includes owned/region-scoped request criteria, reloadable unpublished candidates, current eligibility, adjusted/replaced publication, teacher response, run history and no-match/schedule recovery. Staff support operations now include filtered regional queues, self-assignment/release, explicitly private notes versus owner replies, linked demo evidence and reviewed demo/attendance dispute outcomes with case progress. MFA-protected finance/admin screens now show dated recorded totals, paginated invoices/checkouts/captures/refund requests/payables and reviewed provider-status queries with separate capture/obligation/settlement wording. Refund/payout execution and periodic reconciliation remain pending. The ADMIN console now provides supervised account/linkage inspection, regional profile-status snapshots, read-only code policy examples, reviewed privacy/flags/private-media retries/deletion replays and paginated audit evidence, with specialist workspace routing and explicit blocked release. Independent staff grants are implemented in B2; commercial policy editing remains B3. Scoped operational reports now include manual/assisted request-created cohorts, independent recorded milestones, exact known-outcome continuation denominators and visible unknown/missing/immature evidence. IST calendar presets/custom ranges, ADMIN region filtering and OPERATOR assigned-region enforcement are implemented. Global ADMIN/FINANCE capture charts separate LIVE/SANDBOX/UNRECORDED modes from independent obligations; capture records do not establish settlement. Dedicated guardian/student/teacher dashboards now expose exact role-scoped rolling/calendar/custom metrics, authorized paginated per-learner summaries, current teacher assignments and next lessons. Recurring/revision lesson counts and dated demo outcomes stay separate. Teacher attendance completeness and feedback sample size use explicit denominators; pending family confirmations, cancellations/absence/disputes and lastUpdated remain visible. Student responses omit family membership, financial records and feedback aggregates. Staff MFA enrollment/recovery and browser CSP are also implemented. These use tested development APIs. Local sandbox payments and meetings are explicitly labelled and do not establish real service delivery or settlement.

F10 and B11’s owner-safe lesson metadata are implemented. Feedback remains private; there is no public review publication. Any future public use requires moderation. Attendance review/feedback correction still uses support escalation, with no self-service overwrite.

The owner-requested detailed onboarding increment is implemented: private teacher address, education/results and work declarations, learner school/class subjects, private review summaries and optional demo badges. Eligible terms no longer require a new demo. Broad enquiry simplification, separation of timetable/start evidence and other H2/H3 acceptance remain open in `remaing.md`.

Primary hiring dashboards also support private guardian/teacher review and acceptance of hiring terms without class timetable controls. Waiting/both-confirmed states and write recovery are implemented; service-start/receipt evidence stays separate. H2 enquiry simplification and complete H3 enquiry-to-confirmation navigation remain open.

Guardian draft management now includes an explicit acknowledged discard for unfinished initial/additional enquiries and safe continuation to a different teacher. It preserves submitted records and learner profiles, with stale/uncertain recovery. Weekly availability is now implemented; remaining H2/H3 recovery/navigation stays open.

Weekly enquiry availability is implemented across intake, draft recovery, family updates and operator summaries. New enquiries default to weekday/time ranges; legacy dated windows remain supported. Current overlap matching retains leave/reservation/capacity checks without class creation. Teacher-revision drafts and other recovery/navigation work remain open.

F24 is complete across all forms, role dashboards, staff consoles, retained legacy workflows, validation, recovery screens, accessibility copy and typography. Server-rendered language, metadata, dates/currency and charts follow the same English/Hindi choice. API enums and authored content remain unchanged. See `remaing.md` and the final F24 sprint entry for acceptance evidence.

## Frontend work still open

| # | Work remaining | Backend position |
| --- | --- | --- |
| F22 | Development onboarding/access recovery implemented; real verification and release gates remain below | Role onboarding, learner profiles, drafts/revisions, invitation/device recovery, stale-read edit retention and confirmed application handoffs are covered. |
| F25 | Finish remaining legacy screens/components and demo booking-detail forms using the shared shadcn controls and deliberate palette; review every loading/error/empty/retry state on mobile and keyboard | Incremental migration is underway. Initial demo controls and service/console screens are not all at the new standard. |

The next practical sprint is remaining H5 cross-flow polish and focused launch qualification. F9 checkout/provider qualification is tracked below rather than described as live-ready.

## Backend implementation and contract gaps

| # | Work remaining |
| --- | --- |
| B1 | Implement the approved guardian adult-verification process and its owner/reviewer states; newly signed-in adults currently cannot collect learner data until verified. Synthetic verified personas are not a live method. |
| B2 | Development implementation complete: independently approved staff provisioning/roles/regions/suspension/recovery, fresh MFA, epoch/session revocation and MFA serialization, paginated bilingual console, private managed-key mounts, atomic rotation and initial bootstrap; isolated recovery/key/bootstrap drills pass. Actual key custody, independent identity review and production operator qualification remain launch gates. High-value money/provider activation remain deferred or blocked. |
| B3 | Versioned commercial/configuration administration: pricing, fees/plans, service/region coverage, supply checks, history and rollback. Keep accepted terms immutable. |
| B4 | Provider refund execution, signed outcome/retry handling, partial-payment/refund correction records and allocation-loss/late-capture recovery through settlement. A pending refund is not a settled refund. |
| B5 | Actual teacher payout execution and settlement/reconciliation, payee/provider onboarding, commercial/tax accounting and immutable financial adjustment records. A payable marked eligible is not money paid to a teacher. |
| B6 | Periodic provider reconciliation and recovery queues, including captured events missing from local state, amount mismatches and out-of-order/late evidence. Existing manual order-query reconciliation is insufficient. |
| B7 | Durable unique provider-attempt claims now run after the committed local order, outside the retry transaction; concurrency/crash/failure and current consent/eligibility rechecks are tested. Remaining: qualify live receipt/order recovery and reconciliation before charging; uncertain outcomes never automatically create another provider order. |
| B8 | Actual notification delivery, status/receipt history, duplicate-safe retry and staff-visible failure recovery for scope requests, demos, bookings and follow-ups. Worker development delivery is still synthetic. |
| B9 | Durable Google Meet credentials/OAuth lifecycle, participant/Workspace admission policy and recovery handling; current adapter uses an injected short-lived token. |
| B12 | One active additional-enquiry draft is implemented. Remaining: multiple concurrent enquiry drafts if required, timetable drafts (deferred); complete pagination for bounded notes (latest 50), calendar/leave, demo/timetable, session, payable and administrative histories. Preserve owned data and uncertainty during recovery. |
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

H2 teacher-revision recovery increment: saved private revision steps, reload/resume, current-application isolation, renewed fee acknowledgement, immutable uncertain retries and acknowledged stale-draft discard are implemented. Other guardian/student/invitation recovery and enquiry-to-hiring navigation remain open; this does not close H2 or launch qualification.

H2 invitation recovery increment is implemented: private status, expiry, acknowledged replacement, stale/unknown recovery and metadata-only idempotent issuance. Codes remain one-time delivery and are not retrievable after reload. Device labels and remaining onboarding/navigation work stay open.

H3 connected enquiry-to-hiring navigation and F23/H5 no-match/future-coverage recovery are now implemented in development. See the latest entries in remaing.md and SPRINTS.md; earlier open descriptions above preserve historical inventory. Waitlist status is recorded/pending only, with no teacher supply or notification promise. Other H5 and release qualification remain open.


17 October 2026 — F22/H2 development onboarding recovery is complete across guardian, teacher, linked-student and independent adult flows. Temporary setup-read failures retain local form/retry state and block actions until recovery; permission-denied reads hide cached forms. A saved teacher application recovers a failed workspace handoff without another submission. Invitations, device labels/pagination and role-specific education forms have integration/browser coverage. Earlier descriptions of onboarding/access polish as open are superseded by this entry. Real guardian verification, under-18 independent authorization, live notices/email and physical-device/release qualification remain explicitly open in remaing.md.


17 October 2026 — waitlist history now has guardian-owned stable cursor pagination, Previous/Next navigation, retained criteria and retry/first-page recovery. Teacher supply and notification promises remain unchanged. Student-device and waitlist histories are paginated; other B12 histories remain open.
