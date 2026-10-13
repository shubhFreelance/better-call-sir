# Delivery board

Source: **BetterCallSir_MVP_PRD.docx, Version 3.0, 11 October 2026**, supplied by the project owner. This board tracks implementation against that document; development demonstrations do not satisfy pilot release gates.

## Working agreement

- Follow the PRD Section 10 phases in order. Sprint-sized increments belong to the active phase; record its acceptance evidence before advancing. Existing later-phase slices are retained and qualified when their phase arrives.
- Link every API/feature to PRD tickets and stories. Define acceptance cases before extending it.
- Run the relevant checks, create a focused commit, and push the feature branch after each completed API or feature. Never call untested or synthetic provider behavior production-complete.
- Preserve the PRD's separate Next.js, NestJS API and worker applications, versioned contract, PostgreSQL constraints and server-owned permissions.
- Push implementation branches without merging or deploying unless requested. No real child records or production credentials in fixtures or Git history.

## Phase sequence — PRD Section 10

**Phase 2 development acceptance remains complete. Active work: Phase 3 frontend, explicitly requested by the owner on 12 October 2026 after deferring the remaining backend increments.** The initial implementation contains later-phase slices; they do not close those phases. The demo increments belong to Phase 4, even though they were developed earlier. See `docs/PHASE_1_ACCEPTANCE.md` for the foundation review and `docs/VALIDATION.md` for source-linked checks. The owner authorized Phase 2 completion on 12 October 2026.

| Phase | PRD deliverables | Exit evidence | Current status |
| --- | --- | --- | --- |
| 1 Foundation | Threat model, modules, schema draft, OpenAPI, CI, auth/consent skeleton | Contract/ownership tests and reviewed foundation evidence; integrated guardian demonstration | Foundation implementation/review recorded; 64 tests, builds, scans and hosted CI pass |
| 2 Backend core | Teacher screening, public projection, intake, eligible matching, reservations, audit | Real-database constraints and authorization checks | Development acceptance recorded; 79 tests, builds/scans and exact-source hosted CI pass |
| 3 Frontend | Independent web screens against mocks and the real Phase 2 API | Mobile/accessibility and integrated discovery tests | F1–F9 role onboarding, family access, discovery/shortlists, timetables/attendance, revision booking/checkout/meeting UI implemented; service/console/reporting/localization open; phase not accepted |
| 4 Transactions | Demos, terms, placement invoices, revision holds, checkout, reconciliation | Payment replay, concurrency and actual provider sandbox evidence | Development demo/booking slices present; phase not accepted |
| 5 Service operations | Notes, cases, rematches, follow-ups, deletion, outbox, reports | Privacy/retry tests and operator drills | Early slices present; phase not accepted |
| 6 Release qualification | Security scans, adversarial review, load, backup restore, migrations, rollback | All PRD release gates | Not accepted |
| 7 VPS pilot | Supported host, synthetic rehearsal, immutable image release and verification | Deployment gate and smoke/restore evidence | Not started; deployment requires separate authorization |

Phase 1's definition of done explicitly permits labelled provider stubs with live integration left as open tickets. Missing live-provider qualification is tracked for the relevant later phase and final release; it is not silently treated as complete or added as a new prerequisite to the foundation skeleton.

## Sprint 1 — foundation and an integrated development journey

This initial implementation also contains early development slices from later phases. Their presence does not mean those phases are complete.

| PRD ticket | Foundation status | Later-phase scope |
| --- | --- | --- |
| S1-01 | Separate builds, pinned runtime/database, lockfile and synthetic fixtures validated | Immutable application-container/pilot qualification: Phases 6–7 |
| S1-02 | ADR, initial threat model, role matrix and module ownership reviewed in Phase 1 acceptance record | Independent security/privacy review: Phase 6 |
| S1-03 | Explicit foundation schemas/examples, structural lint, generated client, contract-derived mock and real/mock response checks validated | Later API schemas and v1 change-review tooling: Phases 2–5 |
| S1-04 | Fresh isolated DB migrations, identity/consent/request models and ownership tests validated | Complete later-domain FKs: Phase 2; migration/restore rehearsal: Phase 6 |
| S1-05 | Sandbox OTP, atomic session-family rotation/replay/logout, consent and production adapter/MFA boundary validated | Reviewed live OTP/adult-verification/MFA adapters remain open; startup stays blocked |
| S1-06 | Minimal separate guardian frontend tested against mock successes/failures and real API | Draft resume, complete bilingual and later-role flows: Phase 3 |
| S1-07 | Test pipeline, secrets and runtime/tooling scans, source-bound results and JUnit artifacts; hosted CI passed | SAST/SBOM/container/DAST, coverage and load/recovery qualification: Phase 6 |
| S1-08 | Integrated guardian demonstration, ownership/withdrawal/replay checks and implementation review recorded | Independent live-service and final release acceptance: Phase 6 |

## Story coverage — development only


Latest complete remaining-work inventory: [MVP_REMAINING.md](MVP_REMAINING.md). The table below records foundational story coverage; detailed frontend increments and remaining backend/release acceptance take precedence over its earlier screen-status summaries.

| Story | Current implementation | Remaining work before story acceptance |
| --- | --- | --- |
| US01 | Email OTP/Resend boundary, session replay/logout, consent and family isolation | Live adult verification, MFA and reviewed privacy/provider abuse controls |
| US02 | Supported intake, persisted drafts, direct/assisted discovery identity, structured schedules, region ownership and waitlist | Full frontend forms and live guardian qualification |
| US03–04 | Private content-checked evidence, fail-closed ClamAV worker, revision-bound reviewer checks, fee acceptance snapshot, material-change re-review, suspension | Staging/private-store and current-signature qualification; full Phase 3 reviewer/upload UI |
| US05 | Allowlisted current-screening profiles, bounded cursor pagination, weekly IST availability, leave exceptions, capacity/travel settings and suspension hiding | Real supply and Phase 3 discovery/availability UI qualification |
| US06 | Capacity/schedule/travel/current-screening hard filters; immutable rules-v2 runs, reviewed publication, explicit shown/selection evidence, versioned teacher responses | Full Phase 3 publication/exposure UI and live cohort qualification; no ML training/export enabled |
| US07 | Demo API and guardian/teacher/operator screens: proposal, versioned dual acceptance, shared-calendar conflict protection, reschedule reset, outcome confirmations, no-show support case and operator review | Staging notification and private meeting qualification; reviewed pilot evidence |
| US08 | Demo prerequisite, versioned terms/start acknowledgement, agreed recurring schedule and rolling 60-day lessons, unique capped invoice | Live first-paid-lesson/receipt evidence and commercial acceptance |
| US09 | Exact invoice checkout, signed raw capture, replay/ownership constraints and provider query boundary | Refund/payout/partial-payment accounting, periodic reconciliation and real provider sandbox acceptance |
| US10 | Advertised holds, learner/subject checks, scope/price snapshot, signed capture, one revision lesson, recap, private meeting and held teacher payable | Approved prices/tax/payout/refund terms and provider settlement; live meeting OAuth qualification |
| US11 | Owner cases, regional triage/replies, guardian closure/rematch, past-evidence preservation and cancellation refund intent | Approved replacement/cancellation policies and finance fulfilment |
| US12 | Private notes, named active-teacher sharing, exact-version acknowledgement, revocation and replacement removal | Complete frontend notice/sharing forms and privacy acceptance |
| US13 | Scoped owner correction/deletion, processing pause, reviewed application scrubbing, retained-evidence ledger and backup replay API | Approved legal retention schedule, external backup lifecycle and restore drill |
| US14 | Region-scoped manual/assisted funnel and immutable mature continuation observations; captured funds separate from obligations | Provider-reconciled settlement and real cohort acceptance |
| US15–16 | Live assisted purchase and AI remain disabled | Later scope per PRD |
| US17 | Private role/date-filtered lesson records, guardian/student confirmation, disputes, feedback and recorded attendance metrics | Complete dashboards, boundary/metric UI and staging qualification |
| US18 | Prepaid entitlement overview/cancellation, protected consultation reservation/cancellation/timeout accounting | Calling deferred by owner; sale/renewal periods, masked provider evidence and approved compensation remain open |
| US19 | Saved onboarding, guardian-bound invitation/device grant, revocation, private teacher evidence and separate student principal | Full responsive onboarding/device UI and reviewed notices |
| US20 | Scoped review/support/report controls, media retry recovery, audit and provider kill switches | Production MFA/recent-auth, dual approvals, finance/refund controls and configuration history/rollback |

## Phase 2 backend core delivery

Phase 1's implementation review and evidence are recorded in `docs/PHASE_1_ACCEPTANCE.md` and `docs/VALIDATION.md`. Hosted acceptance passed for the reviewed source commit. Live provider stubs remain explicitly open, as permitted by the foundation definition of done.

Phase 2 now covers private teacher evidence/quarantine, capability-review records, public availability, schedule/capacity-aware eligibility and core relational/authorization checks. Its completed development evidence is in `docs/PHASE_2_ACCEPTANCE.md`. Full frontend completion follows in Phase 3. Qualify the existing demo slice and extend recurring schedules, invoice checkout and reconciliation in Phase 4. Parent Pro calling remains required under Version 3 and its release gates.

The remaining PRD phases stay required: frontend completion, transaction qualification, service operations, security/recovery/load evidence, and the final VPS pilot. Production release is blocked until all P0 stories and Sections 14–16 gates pass. The owner's 440–720 hour estimate is planning context, not work already completed.

## Earlier Phase 4 slice — US07 demo API increment

Implemented `GET/POST /demos`, versioned acceptance/reschedule/outcome/cancellation endpoints and restricted operator dispute review. Every mutation uses principal/resource-scoped retry keys, active guardian consent and an audit/outbox transaction. Proposals expire after 24 hours or at the proposed start, whichever comes first; demos last 20–60 minutes in this development increment. This is scheduling metadata, not a delivered video service.

Acceptance checks: isolated fresh-database migrations; cross-family/student denial; retry replay and payload mismatch; concurrent demo-versus-revision exclusion and adjacent slots; stale versions; reset of both acceptances on reschedule; premature outcome rejection; independent completed outcomes before tuition terms; no-show support case and authorized review; expired acceptance denial and calendar release on cancellation. The existing unit/API/contract suite passes with these cases. No recurring invoice is created by demo completion itself.

### US07 dashboard increment

Guardian recommendations now lead to demo scheduling. Guardian and teacher booking screens show current version, both acceptances, proposal expiry and outcome state; rescheduling requires a reason and resets acceptance. Operators can resolve a no-show case with a version and evidence/reason. Revision payment/scope controls are restricted to revision records. Tuition terms appear only after a completed demo.

Validated through a real browser/API journey: guardian proposal and acceptance; teacher acceptance; guardian reschedule with both acceptances reset; reconfirmation; no-show report after the synthetic test's demo end; restricted operator review and case resolution. All nine browser journeys and the separate API, worker and Next.js builds pass. Meeting delivery and actual notification providers remain outstanding.

## Phase 1 increment — S1-03 / S1-06 foundation contract and mocks

Added pinned Prism and Redocly tooling, explicit discovery/OTP/consent/intake schemas, named synthetic success/error examples, mock HTTP tests and validation against the real foundation API. Fixed over-escaped phone and OTP patterns in the contract. The gateway binds loopback, rejects production startup and marks responses as synthetic; it does not implement authentication, ownership or persistence. Existing real-DB acceptance remains authoritative for those controls.

Validation for this increment: 26 real-DB API tests, seven contract tests, four mock HTTP/startup tests and two mock-backed guardian browser cases pass. Type checks and OpenAPI structural lint pass (one unused generic component warning). The mock browser tests cover saved and denied-consent states; they do not establish live authentication or provider acceptance.

## Phase 1 increment — S1-07 security scans and CI evidence

Added Secretlint's pinned recommended rules, a tracked/nonignored source scan and a report that excludes source content and secret values. Only the exact documented synthetic loopback database URI is allowed; the same credential at a remote host fails the self-test. Synthetic-token detection, safe reporting, missing-input failure and exact-commit evidence are tested. CI now preserves separate JUnit reports, structural lint, generated-client drift, redacted secrets scan and both runtime/tooling audit outputs, with explicit failed/skipped outcomes.

The tooling audit identified vulnerable transitive packages. Removed the affected mock dependency, retained contract-derived routes/examples using the existing AJV validator, and updated the development runner and TypeScript launcher. The complete runtime plus development dependency audit reports zero known advisories at this run. The four mock tests and two mock-backed browser tests still pass; five scanner/evidence tests pass.

## Phase 1 increment — S1-05 atomic refresh family lifecycle

The foundation review reproduced a race by delaying only the synthetic test's replacement-session insert: a replay could finish before that insert and leave the new session active. Refresh now serializes the whole family and inserts its replacement in the rotation transaction; cookies are emitted after commit. Logout uses the same family lock. Refresh preserves the absolute family expiry, validates CSRF before replay revocation, rejects malformed cookie values and checks student guardian consent before issuing credentials.

Validation: the controlled regression fails before the fix and passes after it; all 30 real-DB API tests and all application type checks pass. Added positive/single-use sandbox OTP and hashed-cookie assertions, invalid-CSRF/absolute-expiry checks, consent-withdrawn student refresh denial and API/worker production-startup rejection. Live OTP, independently approved adult verification and administrator MFA remain unconfigured and cannot be enabled by development evidence.

## Phase 1 completion record

Completed the S1-01–S1-08 implementation audit, role/module ownership matrix, OTP/adult-verification/MFA boundary and synthetic guardian demonstration record. 64 automated tests pass, all builds/type checks pass, source secrets scan has no findings and both runtime/tooling audits have zero known advisories at this run. Hosted CI run `38172798589` succeeds for reviewed source `2a0cc438af0c14bd8e3b777f597931921076bf71`. Raw private artifact payloads and independent live-service review are outside the claimed evidence. No Phase 2 implementation, merge or deployment occurred in this increment.

## Phase 2 backend acceptance plan

Implement US03–US06 backend requirements in focused increments: private content-checked evidence and fail-closed scanning; reviewer capability/identity/qualification/reference records and material-change re-review; UTC/timezone-valid advertised availability, leave exceptions and public pagination; structured request schedules and unsupported-scope waitlist; capacity/schedule/travel-aware matching with immutable run snapshots, actual presentation and versioned candidate decisions. Add core relational ownership constraints and authoritative reservation rechecks. Every increment has unauthorized/wrong-owner/stale/retry/failure-path real-DB checks and a separate push. Phase 3 UI and Phase 4 financial/recurring-commitment qualification remain separate.

### Phase 2 increment — US03 / US04 screening backend

Private PDF/PNG/JPEG uploads are capped at 5 MiB and checked against content signatures, stored outside the web root with private permissions and SHA-256, quarantined and scanned through ClamAV INSTREAM. Only scanner-cleared files can be downloaded by their owner or an authorized regional reviewer/admin; downloads are attachments, uncached and audited. Provider failure retains quarantine and a retryable outbox job. Infection cannot be approved. Four immutable checks (identity, qualifications, declared capability coverage and references) must match the current profile revision and unexpired evidence before approval. Every full profile resubmission reopens review and hides unreviewed capabilities; fee-policy acceptance is persisted.

Validation includes real engine clean/EICAR results, scanner-unavailable quarantine, owner/role/region denial, stale version/retry behavior, missing/current-revision checks, self-review denial and database rejection of foreign evidence. The pinned ClamAV engine test intentionally uses an EICAR-only definition; current production signature feeds and live private-store qualification remain Phase 6 prerequisites. Existing synthetic seed approvals retain explicitly synthetic fixture validity.

### Phase 2 increment — US05 public availability and catalog

Added teacher-owned weekly declarations in the launch IANA timezone (Asia/Kolkata), validity dates, leave/cancellation and capacity/travel settings. Declared patterns have a database overlap constraint. Public availability queries are bounded to seven days inside the 60-day horizon and return at most 50 UTC slots with a cursor; calendar data is fetched once per query, then projected without exposing reservations, guardians, children or leave reasons. Slot cadence starts at the declared local window, not a UTC grid. Leave cannot override a held/confirmed booking; disabling a declaration preserves accepted reservations. Discovery filters and stable name/UUID ordering now paginate approved, unexpired public projections.

Validation: 33 API and seven domain/calendar tests pass, plus contract/type checks. Cases include wrong owner/role, retry and stale edits, private-free projections, overlapping declarations, adjacent occupancy, occupied leave, capacity below committed students and pattern changes preserving accepted reservations. Pattern materialization describes available windows; accepted recurring-lesson commitments remain Phase 4.

Availability CI correction: hosted run `38208765381` failed the existing discovery browser journey because blank optional filters were rejected by the new enum validation. The backend now treats empty subject/mode values as unset, preserving the original v1 caller behavior. The same browser case reproduced the failure locally and passes after the fix; the application build itself passed. No test was weakened or skipped.

### Phase 2 increment — US02 structured requests and waitlist

Requests accept optional structured UTC windows in Asia/Kolkata, validate 20–120 minute durations, nonoverlap and the 60-day horizon, and store CONFIRMED versus UNCONFIRMED schedule state. A guardian can version/retry a schedule confirmation; stale, foreign and student writes fail. Linked-child grade/board mismatches fail rather than silently changing eligibility. Enabled launch-region records carry country/state/city identifiers; request and operator access are region-bound. Unsupported scope has a separate minimal waitlist with no child alias/record, booking, payment or fulfilment claim.

Validation: 35 real-DB API tests pass, including schedule invalidity/ownership/replay and waitlist privacy, retry mismatch, supported-scope routing and rejection of unnecessary child fields. Contract and type checks pass. Draft-resume and complete waitlist UI remain Phase 3.

### Phase 2 increment — US06 matching evidence and authority

Matching now requires confirmed, current schedule windows and applies current approval/check expiry, class/board/subject, language, budget, mode, service area plus travel acceptance, committed-student capacity, teacher account availability, weekly calendar and leave/booking filters. Transparent rules rank only eligible inputs; runs retain minimal approved request features, eligible-pool and ranking snapshots with ranker/feature versions and explicit NEEDS_SCHEDULE/MATCHED/NO_MATCH results. The prefiltered pool is bounded to 200 and reports truncation; a reviewed shortlist contains at most ten candidates.

Generation, operator publication and guardian-confirmed rendering are different records. Publication rechecks eligibility, expiry and current run, records operator order/reason, and does not imply actual display. Teacher response and guardian selection are optimistic/versioned and retry-safe; selection does not create a placement. Schedule edits invalidate prior candidate visibility and selections. Run/presentation/decision records are append-only. Existing web/API callers now pass response versions and retry keys; this is the in-repository migration for the unreleased development v1 contract. Phase 3 still owns complete schedule/publication/render-confirmation UI.

Validation: 37 real-DB API tests, eight policy/calendar/ranking tests and all 11 browser journeys pass. Cases cover unconfirmed schedules, hidden unpresented candidates, immutable evidence, role/owner denials, replay/stale versions, actual shown records, selection without forced placement, changed schedules, capacity/travel/calendar constraints, suspension and expiry. Hosted run `38209843258` also passed for the preceding intake/filter-compatibility source.

### Phase 2 increment — shared reservation authority and database ownership

Reservation creation and acceptance now use current declared availability, exceptions and shared half-open occupancy, with current teacher screening/account checks. Existing valid holds can confirm inside the initial new-booking lead time. Guardian → teacher → resource lock ordering serializes conflicting mutations; cancellation remains available for financial closure after consent withdrawal. Late sandbox capture with expired screening or unavailable calendar creates paid-unallocated status and a pending full refund intent, without displacing bookings. Reservations persist internal provider, advertised source and declaration identifier. Demo choices append candidate decision evidence; operator demo access is region-bound. Scope acceptance and booking/capture/cancellation actions are audited.

Additive PostgreSQL migration enforces family ownership for request/child, invitation, note, placement, demo and consultation links; session/account, lesson/placement, reservation/payment/refund and invoice references; assigned-teacher invoice payer; refund not exceeding capture; and recommendation run ownership for presentation/decision inserts. Historical matching evidence remains append-only when mutable candidates are rerun. All 39 real-DB API, nine domain and eight contract checks pass. Browser verification uncovered a time-dependent synthetic preference end calculation; it now derives from the chosen start. No validation was loosened. Full hosted completion evidence is recorded separately after the final check.

### Phase 2 increment — US04 paid-booking suspension review

Suspension now creates an open support review and audit/outbox evidence when an expert has paid future confirmed reservations. It preserves the accepted bookings and makes no automatic cancellation, charge or settled-refund claim. The real-DB regression verifies both the support flag and unchanged booking/payment state. All 40 API tests and type checks pass.

## Phase 2 completion record

Reviewed implementation: `2e241a95022c2fd1b82b117384809dedcb7d9a1f`. Hosted [run 38216194096](https://github.com/shubhFreelance/better-call-sir/actions/runs/38216194096) completed successfully and its commit link matches that source. Local validation passes: nine domain/calendar/ranking, 40 isolated real-DB API, eight contract, four mock, five scanner/evidence, two release-boundary and 11 browser tests (**79 total**, no failures/skips); all builds/type checks and contract lint pass, source scan has no findings and full dependency audit has zero known advisories at this run.

[Phase 2 acceptance](PHASE_2_ACCEPTANCE.md) records the implementation review, real-API demonstration, permission matrix, additive constraints, workflow migration and limits. Every completed feature/API increment was separately committed and pushed. The initial discovery-filter failure was reproduced and fixed; superseded CI runs cancelled by branch concurrency are not claimed successful. Raw private CI artifacts and independent production/provider review remain uninspected. Phase 3 has not started; no merge or deployment occurred.

## Owner-directed backend completion before frontend

The owner requested backend completion before the remaining frontend, with a tested commit and push after each feature. This overrides the original implementation phase order; it does not accept the live MVP or waive release/provider gates. Active branch: `feat/backend-completion`.

Provider direction: Razorpay payments, email OTP (provisional Resend), Google Meet with a 40-minute limit, and masked calls disabled. Credentials remain in environment secrets.

### Discovery: Search and Let us search for you

The future frontend has two tabs. Search uses public teacher filters for board, grade, subject, language, mode, locality and budget. A guardian's MANUAL request snapshots the chosen teacher; an ASSISTED request considers the eligible pool. Both retain the eligibility, teacher response, reviewed presentation, demo and agreement workflow. Students browse profiles; guardians submit learner criteria and book. Assisted discovery uses rules-v2 with operator publication and adjustments. The existing ranker boundary can accept a future algorithm. Implemented and pushed in `3d91bdb`.

### B1 / US01, US19 — identity, onboarding and returning student devices

Persisted owner-only drafts/status with versioning, atomic completion and no duplicate resources. Adult verification/consent precedes child fields; teacher submission cannot self-approve. Hashed guardian invitations and returning-device grants create a separate student principal; family/device revocation and consent withdrawal block access and refresh. Email OTP normalizes addresses, limits expiry/attempts/replay and uses an explicit Resend transport boundary. Live adult verification, privileged MFA and verified email-domain/provider acceptance remain open.

### B2 / US08, US17 — recurring commitments and learning records

Both parties accept a timetable version before rolling 60-day reservations and lessons are materialized. Collision rollback preserves old commitments; successful reschedule cancels future unstarted lessons. The worker extends timetables and opens a support review on failure. Role-scoped/date-filtered lesson history, immutable family confirmation/feedback, attendance correction and regional dispute review are implemented. Recorded activity metrics exclude disputed/absent lessons.

### B3 / US09, US10 — checkout, private meetings and revision fulfilment

Exact invoice/revision checkout and raw signed Razorpay capture are persisted, replay-safe and bounded by ownership/exact money. Successful revision capture creates one learner-linked lesson and one snapshotted payable. Lost allocation creates a pending refund without displacing another booking. Capture now also checks current guardian verification, consent and privacy restrictions. Delivered revision requires an expert recap; confirmed absence cannot make a payable eligible. Accepted payable terms are immutable in PostgreSQL; financial corrections require separate records.

Private meeting records, participant authorization/time-gated links, restricted Google Meet creation, worker retries and support escalation are implemented. Sandbox links are non-routable. Live OAuth/Workspace policy and provider evidence remain open. The current zero-platform-fee revision policy is explicitly development-only; approved pricing/tax, automated refund/payout settlement, periodic financial reconciliation and accounting acceptance are still required.

### B3 / US18 — prepaid membership lifecycle

Guardian membership overview distinguishes a prepaid pass from automatic renewal. Cancellation preserves purchased access until period end; expiry, call cancellation, failed connection and worker timeout release reserved allowance once. Outcome/cancellation use shared locks. Masked calling and Pro selling/renewal remain disabled or pending the owner's deferred calling scope, approved commercial terms and provider usage/compensation evidence.

### B4 / US11, US12, US20 — support, replacement, sharing and recovery

Cases have owner queues/details, private staff updates, public replies, current-version regional assignment/status changes and append-only update evidence. Safety support is free. Guardian closure/rematch cancels future scheduled commitments, revokes old note access and preserves completed/financial evidence. Rematch creates a linked assisted request with fresh criteria and excludes the old teacher; a replacement still requires the ordinary reviewed agreement workflow. Support/rematching was pushed in `5033ffd`.

Named active teachers can acknowledge a shared note version. Sharing/correction invalidates acknowledgement; revocation blocks new access. Teacher retry responses omit note text. Prepaid cleanup and acknowledgement were pushed in `dd066a1`.

The administrator recovery queue omits payloads. Exhausted scan/deletion work can be retried only against the current eligible resource state, with confirmation, retry key and audit; finance jobs require their dedicated workflow. Pending refunds are excluded from synthetic worker selection, and privacy file removal receives priority so money jobs cannot starve deletion.

### B4 / US13 — correction, application deletion and backup replay

Guardians/teachers submit privacy requests for their owned account, learner alias or private note. Students cannot authorize deletion. Account/learner requests pause processing and student access; note deletion immediately revokes sharing. Administrator fulfilment records a policy and approved retention exception, scrubs personal profile/learner/note/draft content, revokes sessions and retains the stated financial, learning, safety and audit evidence. Teacher evidence download is denied immediately and physical removal is queued/retryable.

The immutable deletion ledger supports restricted/audited pagination and idempotent deletion replay after restore. This is application-level replay; legal retention schedules, external backups and a real restore drill remain open. Pushed in `fa83666`.

### B4 / US14 — operational and finance reporting

Date-bound/versioned reports separate direct and assisted requests, count distinct requests at publication/show/teacher acceptance/demo/start, and display conversion numerators/denominators. Regional operators see their own region. Start/closure dates are recorded when events happen; legacy start dates are not invented. Worker continuation observations mature after 30 days, remain immutable and report missed observations as unknown. Unknown and immature records do not enter the continuation-rate denominator.

Finance/admin reporting separates captured payments, pending refunds, all-time outstanding invoices and payable statuses, with provider settlement explicitly unverified and no learner/family identity. Pushed in `6037b8d`.

### Remaining backend acceptance

Frontend dependency / US09, US10 — owned checkout recovery and meeting discovery (13 October 2026): GET /checkout-orders?kind&resourceId verifies the original invoice payer or revision guardian, prefers an already-captured order and returns only the public Razorpay key ID for a real provider order. Existing checkout/capture release gates remain unchanged. GET /reservations/:id/meeting authorizes guardian, assigned teacher or linked student before returning a nullable meeting; both meeting reads share the same time-gated projection. The projection explicitly distinguishes SANDBOX from LIVE, and no join URL is exposed outside the participant's join window. This does not qualify provider delivery, refunds or settlement.

Validation: 58 isolated real-database API tests and eight contract tests pass; contract lint passes with existing warnings. Cases cover no-order/no-meeting recovery, wrong family/role/unauthenticated denial, strict query parsing, latest/captured-order precedence, invoice ownership, participant meeting discovery, provider mode and private join-window suppression. Backend build, application type checks and source secrets scan pass. This dependency is committed and pushed separately on feat/backend-completion before frontend consumption. No merge, release-gate activation or deployment occurred.

Checkout concurrency correction / US09, US10: resource-scoped locking now reuses the owned order across different retry keys and simultaneous tabs. An existing captured order takes precedence, failed orders require review, and a changed price/currency cannot mint a second order. This does not solve external provider creation interrupted before local commit; that remains a live qualification/recovery item. Validation: all 59 real-database API tests and eight contract tests pass, including concurrent distinct keys, later retries, failed-order reuse and price-change denial. Backend build/type checks and source secrets scan pass. No release gate was activated for the running application; the integration suite uses an isolated synthetic database.

Refund/payout settlement, partial-payment/refund adjustment records and periodic financial reconciliation remain implementation/qualification work. Approved tax/fee/refund policies are required before live money workflows. Production adult-verification, privileged MFA/recent-auth, dual approval for sensitive actions, configuration version history/rollback, actual notification delivery and provider qualification remain open. Pro sale/renewal/calling is deferred while masked calls are disabled. Frontend completion follows the owner's backend review; independent load/security/recovery and VPS rollout remain later gates.

Development test success does not close these remaining items. No merge or deployment is authorized by the feature-push agreement.


## Owner-directed Phase 3 frontend

The owner deferred the remaining backend increments and authorized frontend implementation. Refund/payout/reconciliation, provider qualification and other open backend acceptance criteria remain tracked; deferral does not record them as implemented.

Design direction: shadcn/ui components, a consistent font/forms/charts/banner system, and the owner-supplied Wispr Flow palette: teal `#034F46`, lavender `#F0D7FF`, cream `#FFFFEB`, white and charcoal neutrals. The frontend-design skill was installed, committed and pushed in `f7b7971`. [Frontend design direction](FRONTEND_DESIGN.md) records the plan, official component provenance and the blocked external-site inspection.

### F1 / US02, US05, US06 — component foundation and discovery

Shared Button/Alert helpers now use official shadcn controls; search uses its Input and keyboard-accessible Radix Tabs. Manrope is self-hosted. The catalog exposes board, grade, language, locality and budget alongside subject/mode/text filters. Students may browse; guardian submission stays enforced. Assisted requests use the eligible pool; manual requests preserve the selected teacher through sign-in and send its identifier to the existing backend. Guardian consent, current teacher eligibility and backend-confirmed save states remain required.

Remaining frontend: email OTP login, complete saved/stepped guardian and teacher onboarding, structured schedule confirmation, evidence/calendar/review UI, and the rest of the role-specific workflows and reporting charts. The earlier development account shortcuts remain labelled until the authentication UI increment is complete. This increment does not complete Phase 3.

Validation for F1: all 13 browser journeys pass against the real development API and contract mocks, including keyboard tab navigation, chosen-teacher sign-in/submission, capability/budget prefills, current catalog server rendering, consent denial, role isolation, demo scheduling, 360px overflow checks after font loading, and no serious/critical axe findings on discovery. Desktop/mobile screenshots were inspected and a tab-label overflow was corrected. The production Next.js build and all application type checks pass; runtime dependency audit reports zero known vulnerabilities and the source secrets scan has no findings. Backend integration tests and hosted CI were not rerun for this frontend-only increment. No merge or deployment occurred.

### F2 / US01, US19 — email sign-in frontend

The primary sign-in screen now uses name/email entry and six-digit OTP verification through the existing API, with labelled shadcn fields/actions, preserved input on delivery failure, wrong-code recovery, expiry, resend cooldown, and change-email navigation. Development personas are in an expandable preview section. The OTP is retained only in component memory; preview codes are shown only for SANDBOX responses and never presented as delivered email. New accounts remain unverified and cannot enter learner information until the backend's guardian requirements are met. Sign-in preserves the allowed onboarding destination and selected teacher; otherwise new unverified guardians enter parent onboarding and returning accounts enter their dashboard.

Complete saved/stepped guardian onboarding, structured schedule confirmation and the remaining role-specific screens are still open. Live email/adult-verification qualification remains a backend/release gate.

Validation for F2: all 17 browser tests pass. New cases cover a real sandbox OTP session with wrong-code recovery, current-version teacher onboarding return, new-adult verification blocking after reload, local validation without network submission, failed delivery with preserved inputs, SENT response preview-code suppression, expiry/resend/reset, keyboard focus recovery, mobile overflow and serious/critical axe checks on both sign-in steps. Desktop/mobile screenshots were inspected and the mobile form was moved ahead of introductory content. The production Next.js build, all application type checks and source secrets scan pass. Backend-only suites and hosted CI were not rerun; live email/adult-verification acceptance remains open. No merge or deployment occurred.


## Backend/frontend branch separation

At the owner's request, published frontend increments were reverted on `feat/backend-completion` without rewriting history. They were reapplied on `feat/frontend-implementation`, which owns further UI work. The backend branch retains the backend implementation and original web foundation.

### US02 / US19 — saved discovery draft contract correction

Frontend contract checks found that saved parent drafts accepted discoveryMethod/preferredTeacherId in the API but omitted them from OpenAPI's partial onboarding schema. Both fields now match Intake and the generated client. The real-database onboarding regression validates the saved/resumed discovery draft against its response contract. Runtime behavior and permissions are unchanged.

Validation: all 57 real-database API and eight contract tests pass, including the saved-draft response check. The fix is isolated on the backend branch; frontend integration consumes its generated schema.

### F3 / US02, US19 — guided guardian onboarding

Active frontend branch: `feat/frontend-implementation`. The backend branch is `feat/backend-completion`; frontend increments are now separate, with published history preserved. The backend-only discovery-draft contract correction `31854d4` is integrated as a dependency, rather than hidden in the UI feature.

Guardian onboarding now has five steps: permission, learner, tuition need, structured IST availability, and review. Unverified accounts have a status/help screen and no learner entry; consent is confirmed before child fields appear. Existing learner class/board is preserved. The first onboarding draft is owner-scoped, versioned and saved at Continue checkpoints; resume and Back preserve values. Review includes exact budget precision, teacher discovery context and UTC-backed availability preferences. Missing/overlapping/past/out-of-horizon windows fail before submission; the backend remains authoritative.

Completion uses the existing atomic onboarding endpoint. Repeated/uncertain submission retains its exact payload and retry key, disables edits while the outcome is unknown and displays success only after confirmation. Conflict recovery requires an explicit saved-progress reload. Completed guardians may create additional requests through the same UI and the existing ordinary request API. Additional requests currently persist at submission, with an explicit keep-page-open notice; per-request draft storage needs a separate backend increment.

Teacher onboarding/evidence/calendar/review screens, guardian/student service dashboards, private meeting/checkout flows, operational charts and full localization remain frontend work. Adult-verification/provider qualification remains open. No merge to main or deployment is authorized by this increment.

Validation for F3: all 20 browser tests pass, including real first/additional request persistence, initial draft resume after reload, unchanged learner creation until submission, exact budget/UTC preferences, consent denial before child fields, manual teacher retention, stale-version recovery, unreadable submission response with one resource and identical retry payload/key, keyboard/role checks, 360px overflow and serious/critical axe checks. Desktop and mobile screenshots were reviewed; native ghost-button styling was normalized within shadcn controls. The production web build, all application type checks and source secrets scan pass. The backend dependency separately passed 57 API and eight contract tests. Hosted CI and live provider qualification were not inspected; main was not merged and nothing was deployed.

### F4 / US03, US04, US19 — teacher application and private evidence

Teacher onboarding now has three steps: profile, explicit teaching coverage/tuition, and review. Initial drafts save at Continue checkpoints and resume after reload. Home tuition requires localities; subject, board, class, language and format choices are explicit. Exact tuition paise survive review and submission. The account-role change and proposed pilot fee acknowledgement are visible before the atomic onboarding completion. Owner session/cache refresh opens the teacher workspace without retaining guardian data.

Existing applications use versioned resubmission, with an explicit warning that screening reopens, discovery eligibility is removed and private-note shares are revoked. Review status comes from the owner API; teachers cannot approve themselves. Evidence upload supports private PDF/PNG/JPEG files of at most 5 MiB. Metadata displays quarantine/clean/blocked/deleted states; only clean files get an authenticated download link. Files and retry payloads stay in component memory. Uncertain submissions/uploads reuse the same payload/key and prevent edits; conflicts preserve local changes until explicit reload.

Validation: the complete 24-test browser suite passed, then all five teacher cases passed after adding home-locality, oversize-upload and uncertain-upload checks. Coverage includes a real email session, draft resume, atomic role switch, exact saved coverage/tuition and private upload; contract-checked mocks cover identical completion/upload retries, stale-draft recovery and approved-profile resubmission. Mobile overflow and serious/critical axe checks pass; desktop/mobile screenshots were inspected. The production web build, application type checks and source secrets scan pass. Weekly availability, capacity and leave UI remain the next increment. Independent screening and live-provider qualification remain open; backend-only suites and hosted CI were not rerun. No merge or deployment occurred.

### F5 / US05, US19 — teacher availability, capacity and leave frontend

The teacher workspace now includes weekly Demo/Revision/Regular tuition availability, student capacity/travel preferences and private leave. Teachers can declare explicit IST start/end times, weekday and validity dates, including an end at midnight; pause/reopen declarations; and add/cancel leave with a reason. These actions use existing owner APIs and version checks. Availability does not create lessons or cancel accepted bookings. Travel matching still requires declared home localities. Capacity cannot drop below committed students, and leave conflicts require resolving the accepted/held booking first.

Form entries survive tabs and explicit current-version refresh. Each uncertain mutation retains its exact payload and retry key and blocks editing until retry confirms the result. Saved state appears only after API confirmation. Teacher dashboard navigation and a mobile-visible anchor lead to the schedule. Student accounts cannot load teacher calendar data. Masked-call windows cannot be created. The current backend calendar has a 50-window/50-active-leave bound, stated in the UI; complete pagination remains a backend item.

Validation: the full 31-test browser suite passed, followed by all six schedule cases after adding a guard against profile editing/refresh during an uncertain schedule save. The real API journey verifies capacity persistence, updated profile versions, exact IST weekly declarations, overlap rejection with preserved entries, pause/reopen and UTC-backed leave/cancellation. Contract-checked mocks cover stale refresh, committed capacity denial, local validation without POST, identical retry key/payload with one created window, midnight, booking-conflict recovery and student isolation. Keyboard tabs, 360px overflow and serious/critical axe checks pass; desktop and three mobile-tab screenshots were inspected, and inactive-tab contrast was corrected. Production web build, all application type checks and source secrets scan pass. No backend implementation changed; backend-only suites, hosted CI and live-provider qualification were not rerun. No merge or deployment occurred.

Next frontend increment: guardian/student dashboards and invitation/device access, followed by recommendations, placement terms, regular lessons and attendance. Provider qualification and other deferred backend acceptance remain open.

### F6 / US01, US19 — family overview and guardian-managed student access

Guardian/student overview screens now show recorded activity, future scheduled classes and active teacher assignments. Guardians get learner cards and a dedicated Learners & access route; student navigation and direct-route checks keep guardian controls out of their interface. New learners continue through the existing verified/consented tuition onboarding rather than an unguarded creation form. Reporting uses actual server metrics and labels its family-wide window; no synthetic trends or charts are presented. Upcoming classes are derived from the backend’s bounded dashboard snapshot, with full learning-history work still tracked separately.

Guardians can generate a single-use 24-hour first invitation, explicitly reveal its private code, authorize this browser for an already activated learner, revoke one student session or all access, and withdraw consent through inline review/confirmation. Invitation codes stay in page memory and out of URLs/storage. Device authorization warns that it switches this browser to a student account. Guardian screens are hidden and private query data cleared before a session handover; unknown authorization/activation results require session inspection rather than replaying a non-idempotent POST. A failed inspection keeps guardian content hidden, with a sign-in recovery path. Confirmed student sessions use their own role/CSRF and no guardian query cache.

Session revocation is versioned and retries an uncertain result with identical payload/key. Stale versions preserve the reason until explicit access refresh. Consent withdrawal retains its pause/revocation effect and checks server consent after an uncertain response. Unverified accounts cannot open learner controls or authorize devices; inactive consent prevents new authorization, while existing access can still be revoked. Session names are not recorded; the UI accurately shows identifiers and expiry, up to the current API bound of 50 groups. Complete pagination/device naming, invitation recovery/idempotency and live adult-verification qualification remain open backend items.

Validation: the full 41-test browser suite passed, followed by all ten family cases after final form/navigation styling; the mobile/desktop visual case was also rechecked after waiting explicitly for loaded overview content. The suite includes ten new family cases. A real guardian journey creates a separate synthetic learner, rejects a wrong-recipient invitation, activates it once on the intended browser, verifies restricted student APIs, rejects replay, revokes access and reauthorizes the linked learner. Contract-checked children/session mocks cover uncertain identical revocation retries, stale recovery, private-code handling, non-idempotent handover recovery including failed session inspection, uncommitted-switch recovery, consent withdrawal and verification/role blocking. Desktop/mobile screenshots were inspected; mobile dashboard overflow and navigation contrast were fixed. Keyboard-labelled activation fields, 360px overflow and serious/critical axe checks pass. The production web build, all application type checks and source secrets scan pass. No backend implementation changed; backend-only suites, hosted CI and live-provider qualification were not rerun. No merge or deployment occurred.

### F7 / US06, US07, US08, US19 — guardian shortlists, demos and tuition decisions

Guardian requests now show the learner, exact budget, manual/assisted discovery path, saved IST availability and current reviewed teacher options. Public profiles resolve through paginated catalog reads; only visible, identified, current options record presentation evidence. Teacher acceptance is distinct from the guardian's explicitly confirmed choice. Versioned selection saves a preference, without claiming teacher assignment or paid tuition. Confirmed availability updates send UTC slots and explain the cleared shortlist/choice.

Demo proposals provide 20–40-minute durations and paginated advertised times while retaining backend availability checks. Existing demo acceptance, rescheduling, cancellation and outcome controls remain available. Completed demos can open pending tuition agreements even after the original shortlist expires; the backend rechecks teacher fit and acceptance. Guardians and teachers separately review/accept the stored tuition terms and confirm actual start/receipt. Start stays blocked without both terms acceptances and an accepted recurring timetable. The proposed pilot teacher fee is labelled pending final live qualification.

Unknown writes freeze edits and retry identical keys/payloads. Stale versions retain confirmation until an explicit refresh; an API-confirmed save followed by a failed refresh does not offer a fresh mutation. Current verification/consent and role restrictions remain enforced. The request picker stays fixed during a decision. No backend implementation changed, and this increment does not close the full US07/US08 or Phase 3 acceptance gates.

Validation: all 51 browser tests passed, including ten new contract-checked shortlist/terms cases and a real guardian selection, demo, acceptance/rescheduling/no-show journey. Focused cases cover profile pagination, visible presentation evidence, uncertain selection/terms retries, stale versions, exact UTC preference replacement, expired/no-match recovery, student isolation and completed-demo agreement creation after shortlist expiry. The final 21 affected browser cases passed after save-refresh handling was tightened; these include 360px overflow and serious/critical axe checks on choice and tuition-review forms. Desktop/mobile screenshots were inspected. The production web build, all application type checks and source secrets scan pass. Backend-only suites, hosted CI and live-provider qualification were not rerun. No merge or deployment occurred.

Demos/schedules retain the API's bounded lists (100/50); full histories require backend pagination. Remaining booking-detail design, service/finance/reporting/localization flows and deferred backend qualification still prevent Phase 3/MVP completion.

### F8 / US08, US10, US17, US19 — weekly timetables and lesson attendance

Classes & attendance now includes guardian/teacher weekly timetable proposal, mutual acceptance and rolling booking checks. Structured IST days/times, future validity dates, reason and explicit replacement-policy review precede submission. Local checks reject overlaps, invalid ranges and inappropriate online duration; the backend remains authoritative for current terms, consent, owner scope, availability/collision checks and materialization. Pending proposals remain distinct from accepted timetables and booked lessons. Mutual acceptance can replace future commitments at least one hour away; earlier commitments remain. Tuition-start confirmation remains a separate decision.

Lessons now load through the role-scoped, date-filtered and cursor-paginated API rather than the bounded dashboard snapshot. Upcoming and Attendance & records views expose learner, teacher, actual times, cancelled records and confirmation history. Teachers record present/late/absent after the lesson's end, with a reason; delivered revision sessions require a recap. Guardians/students review and confirm attendance or submit a versioned dispute with an inline reason. Disputed records are labelled excluded from totals. Students cannot query or operate guardian timetable controls.

Owner-directed visual refinement gives color a deliberate role: deep teal anchors the learning summary and accepted weekday slots, lavender distinguishes proposals/active choices, cream marks review, and white preserves form readability. Absent/cancelled records use neutral states. Mobile strips omit empty weekdays. The existing shortlist heading/criteria summary also adopt this hierarchy. Loaded-font desktop/mobile screenshots and contrast checks guide the refinement.

Unknown writes freeze editing and retry identical keys/payloads; an uncertain attendance decision also blocks other lesson actions, date/tab changes and pagination. Stale proposal refresh preserves confirmation and uses the latest placement version. API-confirmed saves followed by failed refresh block new decisions until recovery. Extension responses are checked against their actual created-count/60-day contract rather than a resource-ID assumption.

Validation: all 64 browser tests passed in the final regression run, including 13 new learning cases. The 23 affected learning/shortlist cases also passed after making the real attendance fixture unique to each run and fixing confirmation-form completion after a successful retry, including a real guardian/teacher timetable proposal, independent acceptance, actual recurring lesson/reservation creation, teacher attendance and guardian confirmation. Contract-checked mocks cover overlap/IST serialization, uncertain proposal/attendance/extension retries, stale recovery, collision/terms/consent/closed-agreement blocking, student disputes/isolation, date-range validation, pagination and confirmed-save refresh failure. Mobile 360px overflow, keyboard tab access and serious/critical axe checks pass on timetable and attendance review forms. A retry retains its original completion callback, so the confirmation closes and the recorded-review guard is applied after either the initial save or a successful replay. The production web build, all application type checks and source secrets scan pass. Final loaded-font desktop/mobile screenshots of the learning and shortlist screens were inspected; mobile overflow and serious/critical axe checks pass. Backend-only suites, hosted CI and live-provider qualification were not rerun. No merge or deployment occurred.

Remaining: timetable history is limited to the latest 50 records; teacher dashboard does not expose the learner alias before lessons exist, so an agreement identifier is shown. The backend allows one review per person per lesson. Confirmation history omits actor IDs; only confirmation submitted in the current view can suppress a duplicate UI action, and recorded-review history directs later corrections to support. Feedback, private meeting/checkout, remaining booking-detail design, service/finance/reporting/localization flows and deferred backend qualification remain open. This frontend increment does not complete all of US10/US17 or Phase 3. No backend implementation changed.

Next frontend increment: revision checkout and private meeting access, followed by feedback and the remaining support/privacy/reporting workflows.

### F9 / US09, US10, US17, US19 — revision booking, checkout and private meeting access

Guardians now have a dedicated revision request with owned-learner selection, filtered online experts, advertised IST times, 20/40-minute scope, a topic brief and an explicit hold review. A saved hold waits for expert scope acceptance and retains its exact retry key after uncertain outcomes. Booking details show the current state, version, amount, cancellation review and hold expiry; a hold, captured payment, final slot allocation and settled refund are never conflated. Confirmed demos, revisions and lessons expose participant-only meeting lookup, with a live Google Meet join action only in the permitted time window. Student lesson views do not query guardian money.

Guardians and teachers review their own revision/invoice amount and policy before checkout. The frontend reads and recovers a server-owned order across reloads, blocks rapid duplicate submissions, and only opens Razorpay for a current live order using the public key, server order ID and exact paise. Browser callbacks trigger an owner status refresh; they do not prove payment. Failed, mismatched, sandbox or unallocated orders never claim a completed booking or refund. The running application's checkout flag stays closed. Backend dependencies for owned checkout/meeting discovery and resource-scoped order reuse were tested and pushed separately to feat/backend-completion, then brought into this frontend branch.

The visual treatment makes teal the revision introduction and payment amount, lavender the timing/status guide, cream the confirmation layer and white the working form. The new UI uses labelled controls and responsive layouts. [The complete remaining-work inventory](MVP_REMAINING.md) replaces earlier shorthand remaining-feature descriptions. Phase 3, provider qualification, finance settlement and pilot acceptance remain open.

Validation: all 82 browser tests pass, including 18 new revision/payment/meeting cases and a real API guardian–teacher hold, scope, release-gate and synthetic-capture journey. The new cases cover simultaneous checkout taps, exact saved-order reuse, lost responses, amount mismatches, provider script failure, callback versus signed server capture, expired/unallocated states, role and join-window limits, keyboard access, 360px overflow and serious/critical axe findings. Loaded-font desktop and mobile revision/checkout screenshots were inspected. All 59 real-database API and eight contract tests pass for the two separately pushed backend dependencies. Production web build, all application type checks, formatting and source secrets scan pass. Hosted CI evidence and live Razorpay/Meet qualification remain uninspected; no merge, release-gate activation or deployment occurred.

## Owner-priority security audit — 13 October 2026

The owner paused frontend feature development to audit the 69 legible security checks in four supplied pictures; item 54 is unreadable. Security corrections and their evidence take priority until the applicable repository gaps are addressed. Deployment/provider controls must be recorded honestly rather than passed from local tests.

Security increment 1: corrected a cross-account payable-list fallback for teachers without profiles; added hashed, atomic PostgreSQL rate buckets shared across instances and retained across restarts, authenticated write/upload limits and worker expiry cleanup; bounded normal/upload/webhook bodies, database connection/query and HTTP timeouts; made malformed JSON and non-ASCII credential/signature rejection safe; preserved no-store headers and sanitized denial/startup logs. The API never trusts forwarded client IPs by default. OpenAPI now declares cookie authentication by default and the webhook HMAC separately.

Validation: all 62 isolated real-database API tests and eight contract tests pass, including profileless-teacher denial, concurrent distributed limiter consumption/recreation/expiry and malformed/oversized/non-ASCII requests. Type checks and source secret scanning pass; the full npm dependency audit currently reports zero known advisories. This increment is pushed separately to feat/backend-completion. MFA, browser CSP, history/bundle scanning and operational controls remain under audit; no live release was enabled.
