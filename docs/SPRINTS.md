# Delivery board

Source: **BetterCallSir_MVP_PRD.docx, Version 3.0, 11 October 2026**, supplied by the project owner. This board tracks implementation against that document; development demonstrations do not satisfy pilot release gates.

## Working agreement

- Follow the PRD Section 10 phases in order. Sprint-sized increments belong to the active phase; record its acceptance evidence before advancing. Existing later-phase slices are retained and qualified when their phase arrives.
- Link every API/feature to PRD tickets and stories. Define acceptance cases before extending it.
- Run the relevant checks, create a focused commit, and push the feature branch after each completed API or feature. Never call untested or synthetic provider behavior production-complete.
- Preserve the PRD's separate Next.js, NestJS API and worker applications, versioned contract, PostgreSQL constraints and server-owned permissions.
- Push implementation branches without merging or deploying unless requested. No real child records or production credentials in fixtures or Git history.

## Phase sequence — PRD Section 10

**Phase 2 development acceptance remains complete. Active work: backend completion before the remaining frontend, explicitly requested by the owner on 12 October 2026.** The initial implementation contains later-phase slices; they do not close those phases. The demo increments belong to Phase 4, even though they were developed earlier. See `docs/PHASE_1_ACCEPTANCE.md` for the foundation review and `docs/VALIDATION.md` for source-linked checks. The owner authorized Phase 2 completion on 12 October 2026.

| Phase | PRD deliverables | Exit evidence | Current status |
| --- | --- | --- | --- |
| 1 Foundation | Threat model, modules, schema draft, OpenAPI, CI, auth/consent skeleton | Contract/ownership tests and reviewed foundation evidence; integrated guardian demonstration | Foundation implementation/review recorded; 64 tests, builds, scans and hosted CI pass |
| 2 Backend core | Teacher screening, public projection, intake, eligible matching, reservations, audit | Real-database constraints and authorization checks | Development acceptance recorded; 79 tests, builds/scans and exact-source hosted CI pass |
| 3 Frontend | Independent web screens against mocks and the real Phase 2 API | Mobile/accessibility and integrated discovery tests | Early screens present; phase not accepted |
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


## Backend/frontend branch separation

At the owner's request, published frontend increments were reverted on `feat/backend-completion` without rewriting history. They were reapplied on `feat/frontend-implementation`, which owns further UI work. The backend branch retains the backend implementation and original web foundation.

### US02 / US19 — saved discovery draft contract correction

Frontend contract checks found that saved parent drafts accepted discoveryMethod/preferredTeacherId in the API but omitted them from OpenAPI's partial onboarding schema. Both fields now match Intake and the generated client. The real-database onboarding regression validates the saved/resumed discovery draft against its response contract. Runtime behavior and permissions are unchanged.

Validation: all 57 real-database API and eight contract tests pass, including the saved-draft response check. The fix is isolated on the backend branch; frontend integration consumes its generated schema.


## Owner-priority security audit — 13 October 2026

The owner paused frontend feature development to audit the 69 legible security checks in four supplied pictures; item 54 is unreadable. Security corrections and their evidence take priority until the applicable repository gaps are addressed. Deployment/provider controls must be recorded honestly rather than passed from local tests.

Security increment 1: corrected a cross-account payable-list fallback for teachers without profiles; added hashed, atomic PostgreSQL rate buckets shared across instances and retained across restarts, authenticated write/upload limits and worker expiry cleanup; bounded normal/upload/webhook bodies, database connection/query and HTTP timeouts; made malformed JSON and non-ASCII credential/signature rejection safe; preserved no-store headers and sanitized denial/startup logs. The API never trusts forwarded client IPs by default. OpenAPI now declares cookie authentication by default and the webhook HMAC separately.

Validation: all 62 isolated real-database API tests and eight contract tests pass, including profileless-teacher denial, concurrent distributed limiter consumption/recreation/expiry and malformed/oversized/non-ASCII requests. Type checks and source secret scanning pass; the full npm dependency audit currently reports zero known advisories. This increment is pushed separately to feat/backend-completion. MFA, browser CSP, history/bundle scanning and operational controls remain under audit; no live release was enabled.


Security increment 2 / US01, US20: staff roles (ADMIN, OPERATOR, REVIEWER, FINANCE) now require server-verified TOTP before any private staff API. Enrollment requires a recent primary sign-in, stays family-bound and expires after ten minutes; encrypted secrets use account-bound AES-256-GCM. Time steps are consumed atomically with limited skew, per-account attempt limits, eight hashed single-use recovery codes and audit records containing no secrets. Recovery consumption revokes other session families. Staff sessions have an eight-hour absolute cap, fifteen-minute idle expiry and a ten-minute MFA step-up window; refresh preserves primary-login age and MFA time. A local-only key generator creates private configuration once; CI gets its own ephemeral key. Enrollment/status/verification/recovery contracts and generated types are included.

Validation: all 65 real-database API tests, nine contract tests and three MFA unit/setup tests pass. Tests cover direct endpoint denial, encrypted enrollment, family binding, TOTP replay, concurrent recovery reuse, idle/step-up/refresh expiry, rate limits and expired enrollment; RFC vectors, account-bound authentication tags and private key generation are verified. Type checks and source secrets scan pass. This is a separately pushed backend/API increment. Browser enrollment and production host/key/recovery qualification remain open; production startup stays blocked.


Security increment 3 / US09, US10: checkout provider creation now follows a committed local order and a durable, unique attempt claim, outside the idempotency transaction. Concurrent calls, failed responses and a crash after claim cannot initiate a second automatic provider create. Unknown outcomes remain CREATING/FAILED for receipt reconciliation rather than being rolled back and retried as new orders. Pausing checkout hides the public handoff key for an existing live order; signed late captures still need processing. Live provider receipt reconciliation remains a release requirement.

Validation: all 68 real-database API and nine contract tests pass, plus type and source secret checks. New cases prove one provider call under concurrent claims, persisted failure/crash recovery, gateway key suppression when paused, and anonymous denial for every declared cookie-protected route. MFA verification/recovery authenticate before validating their payload. No running checkout gate was opened and no live provider call was made.


Security increment 4 / US01, US20, release controls: CI now fetches full history without retaining the checkout token, installs with lifecycle scripts disabled and runs only the reviewed locked Prisma-engine/esbuild installers. Separate historical-text and public-browser-bundle secret checks are mandatory in exact-source CI evidence. Provider HTTP transports refuse redirects; Google Meet responses must have a canonical HTTPS meeting URL. A reviewed runtime-permissions SQL script separates application DML from migration/role/schema/audit authority. The backup tool exports a consistent PostgreSQL snapshot, checks private-media hashes and encrypts the archive with a separate authenticated key. Restoration requires a new empty database and media directory; unsafe paths/links, tampering, wrong keys and overwrite attempts fail closed. Credentials and private payloads are excluded from diagnostics. The security operations runbook records host/secret-manager/monitoring/off-host requirements.

Validation: all 70 isolated real-database API tests, 18 unit tests, seven security/CI-evidence tests and two release-gate tests pass; type and source scans pass. A real isolated backup/restore drill preserves notes, private media and encrypted MFA credentials while rejecting wrong keys, tampering and existing data. The runtime role cannot alter schema/roles/audit or read migration records. Fetched text history (534 text blobs, one binary asset outside text rules at the recorded check) contains no findings. A fresh temporary install with the reduced script allowlist generates contracts and builds the API successfully. npm audit reports zero known advisories; npm signature/provenance verification could not download its registry data and is not claimed passed. Browser bundle scanning, CSP/MFA browser checks and exact-source hosted CI review remain open. Off-host scheduling/storage, TLS/disk encryption, production permissions/monitoring and an operator recovery drill require the chosen deployment environment; no deployment is performed.


Security increment 5 / US01, US09, US10: email OTPs now use address-bound keyed digests with a separate private key; missing configuration fails closed. Disabled/non-fixture identities are excluded from local persona discovery. Foreign lesson cursors are rejected, guardian revision holds are capped atomically at five, and new checkout attempts revalidate current consent and slot/teacher eligibility, including idempotency replay. Browser staff fixtures perform real server MFA and are revoked after each test.

Validation: 74 isolated API tests, 19 unit tests, nine contract tests and all 11 backend-branch browser journeys pass. Type checks and source secret scanning pass. Regression checks cover withdrawn consent on both new checkout and saved CREATING-order replay, concurrent hold limits, foreign cursors, private OTP keys and staff self-review denial after successful MFA. This backend increment is separately committed and pushed; production/provider qualification remains blocked.


Security increment 6 / release controls: corrected Secretlint v13 Git-ignore behavior so generated browser assets are actually scanned. Scanner configuration names use the same repository policy through stdin; all selected inputs must have coverage before success. Findings still exclude source/token values.

Validation: eight backend security/CI-evidence tests pass, including ignored generated files and scanner-config names containing synthetic tokens. The existing production build contains 11 JavaScript/map assets; all 11 were scanned with no findings. Backend source coverage is 154 files with no findings. This is separately committed/pushed; the initial zero-file bundle result was rejected and is not acceptance evidence.


F10 backend dependency / US17: lesson history now returns the teacher recap, caller-only attendance review, minimal private feedback for the guardian/lesson teacher and server-computed feedback eligibility. Students receive no guardian feedback; other families receive no lesson. Private feedback requires the current lesson version, current guardian confirmation and active verified consent; guardian/lesson locks serialize submissions and attendance corrections. A second feedback record cannot overwrite the immutable original. The unreleased development feedback contract now requires expectedVersion; in-repository callers/fixtures are migrated.

Validation: 75 isolated API and nine contract tests, type checks and source scanning pass. New real-DB coverage validates full history DTOs and role privacy, concurrent duplicate submissions, stale attendance versions and withdrawn consent. This dependency is separately committed/pushed on the backend branch; F10 UI and public-review moderation remain separate work.


F11 backend dependency / US11: added versioned, idempotent guardian note edits that save the new content privately, revoke previous sharing and clear acknowledgement. Owner-safe read records include learner alias, named teacher and active-versus-paused sharing without exposing guardian IDs. Teacher note reads require active placements, verified/enabled guardians, active consent and no pending account/child deletion pause. New/write/share contracts and generated types are explicit; read history remains the latest 50 records.

Validation: 76 isolated API and nine contract tests, type checks and source scanning pass. New coverage checks owner/role denial, stale edits, replay without another version increment, withdrawal after edit, revoked acknowledgement, current metadata/privacy and pending deletion pause. This is separately pushed on the backend branch; F11 UI follows independently. The initial test fixture omitted its required privacy resource ID and was corrected before the passing run.


F12 backend dependency / support conversations: case detail now pages the newest visible updates first, with owned-case cursors and a bounded 20/50 default/maximum. Participant reads exclude internal updates before pagination; minimal author labels distinguish the caller, case owner and support without exposing actor IDs. Contracts and generated types include the next update cursor.

Validation: 77 isolated real-database API tests, nine contract tests, type checks and source secret scanning pass. Added coverage verifies latest-first paging, hidden/foreign cursor denial, author privacy and query bounds. This API dependency is separately pushed; frontend history/replies follow separately. Live operator delivery and production qualification remain open.

F13 backend dependency / US11: replacement requests accept optional, strictly validated fresh subject, format, language, locality and budget criteria alongside required current availability. Omitting criteria preserves the prior contract. Replacement keeps the same owned learner/region and excludes the old teacher; original request criteria remain intact. Closure, cancellation, note-access revocation and ordinary replacement review remain authoritative.

Validation: 77 isolated real-database API tests, nine contract tests, types and source secret checks pass. Existing rematch regression now verifies invalid-budget denial, changed criteria persistence, immutable source criteria, exact replay, owner/student denial and preserved past service evidence. This API increment is separately pushed. Commercial/refund fulfilment and production qualification remain open.

F14 backend privacy dependency / US13: fulfilled note corrections now revoke named teacher sharing as well as clearing acknowledgement, keeping corrected content private until a separate owner sharing decision. Existing owner, reviewed retention, immutable evidence and replay controls are preserved.

Validation: 77 isolated database API tests, type checks and source secret scanning pass. The privacy regression starts with an acknowledged shared note and confirms that corrected text is private with acknowledgement cleared. Separately pushed backend fix; owner privacy UI follows independently. Live retention/storage/backup qualification remains open.

F15 backend screening regression / US04: added a real-database check proving that a failed kind is immutable on its application revision, a later passed replacement is rejected, and the other three passed kinds cannot permit approval. The existing unique/append-only check constraints already enforce this rule; no redundant application restriction was added.

Validation: all 78 isolated API tests, nine contract tests, types and source secret scanning pass. Initial synthetic evidence lacked mandatory scanner metadata, and an attempted same-revision reassessment was correctly rejected; the final fixture exercises the actual immutable contract. Reviewer UI follows separately; live reviewer staffing and independent screening remain qualification work.

F16 backend dependency / US06: added an MFA/region-scoped current-candidate read for operators/admins, including unpublished IDs, minimal teacher names and current eligibility/expiry/decline checks. Guardians cannot read it; no teacher account/contact or learner/guardian identifiers are added to candidates. Current run ordering follows monotonic request version before timestamps. Republished adjustments now replace the previous published set in the transaction, incrementing removed-candidate versions and preserving immutable publication evidence.

Validation: all 78 isolated API tests, nine contract tests, types and source secret scanning pass. Matching regression covers unpublished reload, strict read DTO, role/regional denial, minimal metadata and replacing two published candidates with one without leaving the excluded candidate visible. This dependency is separately pushed; operator matching UI follows. Live supply, operator staffing and delivery qualification remain open.

F17 backend dependency / US07, US11, US17: added a paginated, region-scoped attendance-dispute read without private feedback or actor identities, including recorded participant reasons and owner-bound linked case references. Regional operators can also resolve their family's revision disputes. Case lists accept staff-only self/unassigned filters and scoped category filtering with cursor validation. Demo/attendance resolution records visible case outcomes and increments versions; foreign cases mentioning a lesson remain untouched. Generic case triage cannot bypass an open linked dispute. Regional demo filtering occurs before the latest-100 limit; suspended-teacher review cases keep the teacher's region. Attendance cannot be recorded before lesson end.

Validation: all 79 isolated API tests, nine contract tests, types and source secret scanning pass. Regression covers regional/foreign cursor denial, revision resolution, owner-only case association, in-progress case resolution, visible outcome/version evidence, stale case denial and unfinished lesson denial. Synthetic revision fixtures were corrected to supply their mandatory matching confirmed reservations. Legacy attendance descriptions remain a documented owner-bound shortcut; an explicit relation belongs to support-history migration work. This dependency is separately pushed; operator UI follows. Financial settlement, live staffing/delivery and release qualification remain open.


F18 backend dependency / US08, US09, US17: added audited, MFA-protected global ADMIN/FINANCE financial record queues for invoices, checkout orders, captured payments, refund requests and teacher payables. Exact-ID/status filters and 20/50 pagination validate cursor membership before reading. Explicit allowlisted DTOs omit payer/account/contact and provider-event identifiers, preserve linked checkout mode, exact paise, policy/eligibility and nullable unrecorded dates. Invoices have no creation timestamp; stable ID-descending ordering never claims chronology. Settlement remains unverified. Sandbox provider queries now retain the required reason/audit and idempotent replay without changing financial state or contacting a provider.

Validation: all 80 isolated database API tests, nine contract tests, types and source secret scanning pass. New acceptance covers active-role/MFA denial, bounded/filtered/cross-kind cursors, all five DTO shapes, linked sandbox evidence and exactly one reconciliation audit across replay. Initial fixtures violated assigned-teacher invoice/payable constraints and reused revoked student sessions; corrected isolated fixtures preserve production constraints and rate limits. A backup connection termination passed on targeted rerun and the final full 80-test run. Frontend follows separately; provider refund/payout execution, periodic reconciliation and settlement qualification remain open.


F19 backend dependency / US17, US19: added audited MFA-protected ADMIN console status, minimal paginated account directory/supervised linkage, append-only audit pages and filtered privacy-review pages. Read DTOs omit contact credentials, account sessions, learner notes, feedback and raw audit before/after data. Regional supply is a bounded profile-status snapshot, not qualified availability. Commercial examples call shared fee/revision-price functions; accepted terms stay immutable and configuration editing remains B3. Runtime mode is configuration evidence, not provider qualification; release remains fail-closed. Flag changes now use idempotent versioned writes, and privacy review denies self-review.

Validation: all 82 isolated database API tests, nine contract tests, types and source secret scanning pass. New acceptance covers role/MFA denial, read allowlists, actual policy amounts, scoped cursors, sanitized linkage/audit, flag replay without duplicate audit, release-gated activation and denied self-review. Staff provisioning/independent approval, commercial version/history/rollback and live-provider qualification remain B2/B3/release requirements. Frontend follows separately.


F20 backend dependency / US14, US17: added scoped region choices and ADMIN region-filtered request cohorts, with OPERATOR scope enforced on the server. Funnel-v2 names the request-created cohort/current-evidence basis, counts each request once per milestone, excludes future evidence and reports qualified mature day-30 outcomes separately from unknown, missing, immature and missing-start evidence. Total and manual/assisted continuation metrics expose known-outcome denominators and null rates when unestimable. Repeatable-read snapshots keep related aggregates consistent. Finance capture-mode classification separates LIVE/SANDBOX/UNRECORDED while retaining independent refund requests, current-all-time invoice dues and payable obligations; settlement remains unverified. captureModes is additive for existing finance clients.

Validation: all 84 isolated API and nine contract tests, types and source secret scanning pass. New acceptance covers inclusive/exclusive IST boundaries, operator scope override denial, role/MFA denial, unknown/missing and premature imported observations, method-specific continuation denominators and exact capture-mode amount/count partitions without identifiers. Initial region fixtures were corrected to satisfy the existing region FK. No provider or financial execution occurs. Frontend charts follow independently.


F21 backend dependency / US17, B10: added GET /dashboard/learning for GUARDIAN/STUDENT/TEACHER, default rolling 30 days and ordered custom ranges up to 366 days. The start-selected interval excludes its end and exposes timezone, metric version and lastUpdated. Server aggregates remain exact beyond the legacy latest-100 lesson preview and independently of learner pagination. Counts distinguish current completed status, ended present/late undisputed classes, distinct taught/active students, recorded attendance versus ended non-cancelled denominator, pending current-version family confirmations, cancellations, absence and disputes. Eligible teacher feedback reports average and sample size without comments; students receive neither feedback aggregates nor membership/finance metadata.

Per-learner summaries expose only authorized alias/class/board, current assignments with recorded profile status, next scheduled lesson and separate dated demo outcomes. Demo no-show counts use actual participant NO_SHOW reports and can overlap disputes; cancellation/absence counts do not attribute responsibility. Pagination validates the cursor within caller scope, with full scoped totals preserved. Current assignments are bounded to 20 with an explicit limit flag. Repeatable-read snapshots keep related metrics consistent. Guardian-only recorded membership allowance remains development evidence, not qualified masked-call delivery.

Validation: all 87 isolated real-DB API tests and nine contract checks pass; types and source secret scan pass. New examples exceed 100 lessons, test IST inclusive/exclusive boundaries, pending/current-version confirmations, correction once, unknown/empty feedback, absent/cancelled/disputed/recurring/revision cases, sibling and foreign teacher/cursor denial, consent revocation and separate demo/no-show evidence. Fixtures were corrected to preserve confirmed-revision, accepted-demo and no-overlap constraints; no database rule was relaxed. Frontend integration follows independently. Live US17/Phase 3/release qualification remains open.


H1/H4 backend dependency, owner-directed teacher discovery and hiring scope: added GET /dashboard/hiring for guardian, student, teacher and MFA-verified ADMIN. Current scoped counts remain independent of paginated enquiry/arrangement lists. Student DTOs omit budgets/prices, candidate decisions, other learners and administrative data. Teacher opportunities require presented unexpired recommendations, verified active family consent and no pending deletion; displayed eligibility uses the existing shared matching checks. Interest/choice/accepted terms are explicitly distinct from active-start evidence or money settlement. Guardian verification/consent/privacy gate and teacher application/screening metadata support useful next steps. ADMIN gets audited aggregate request/matching, teacher and arrangement states plus support/privacy/recovery queues, without personal learner data.

Validation: all 89 isolated API and nine contract checks pass; types and source secret scan pass. New coverage verifies scope/cursor denial, full counts over paginated/limited previews, student privacy, unpublished/expired/paused opportunity exclusion, profileless teachers and ADMIN MFA/audit. The privacy-pause fixture was completed with its required resource ID; application constraints were preserved. Learner previews are bounded to 20 and flagged. Stable ID pagination does not imply chronology. This read endpoint does not remove existing demo/timetable dependencies; H2/H3 remain open. No new provider action or financial execution occurs.


Owner-directed H2/H3 onboarding-detail backend: teacher applications/revisions now require a private complete address, four explicit education milestones (Class 10/12, undergraduate/postgraduate with completed/pursuing/not-applicable states), institutions/board/degree/year and bounded official percentage/marks/CGPA results, prior work organizations/roles/years/proof declarations and an explicit optional-demo choice. Empty work history is valid for independent/new teachers; actual certificates remain in the private scanned qualification/reference pipeline. Current approval requires these details in addition to existing independent screening. Material revisions reopen screening. Nullable additive database columns preserve legacy records without inventing details or demo permission; in-repository development callers/fixtures are migrated to the strengthened submission contract.

Guardian intake now collects school and the subjects studied in class for a new learner, validates unique bounded subjects, and can backfill an owned legacy learner without silently rewriting an existing school profile. Draft saving/reading treats school fields as protected child data. Hiring learner previews return school details only to the owning guardian/student. Teacher full addresses, educational results and employment data are omitted by the public projection; public discovery exposes only demoAvailable from an explicit opt-in. New demos reject absent/declined opt-in. Eligible accepted recommendations can open tuition terms without a demo; an already requested/incomplete/disputed demo still needs its dedicated cancellation/outcome/review workflow. Terms creation does not create a lesson or collect money. Account/child deletion scrubs the added fields.

Validation: all 91 isolated API and nine contract checks pass, including rich/invalid/missing qualification fields, private school/subject guards, public-field omission, opt-out denial, no-demo terms and continued dispute controls. Existing demo tests remain meaningful for already requested demos. Types and migration generation pass. Frontend onboarding/reviewer details, certificates and public badges follow separately. Production qualification and image/schema compatibility remain open.

Onboarding-detail API follow-up: public DEMO slot reads now return an empty list when demo preference is absent/declined, matching proposal denial and the public badge. Validation: all 91 isolated API tests pass again, including opted-out slot omission. Synthetic seed personas record explicit example preferences/details, with alternating offered/not-offered badges; only known legacy seed profiles with absent preferences/address are backfilled, preserving existing statuses and real application data.

H3 hiring-term review backend dependency: the role-scoped hiring arrangement projection now includes the current version, recorded policy and proposed teacher placement-fee amount for the owning guardian/teacher. Student projections omit these financial/write fields. Existing versioned ACCEPT_TERMS remains the only write: both parties can accept without a demo or timetable; acceptance does not confirm service start, create lessons or raise an invoice. The old class-start evidence and timetable gates remain on CONFIRM_START. No schema migration or live provider action is added. API/contract acceptance evidence follows below before push.
Validation: all 91 isolated API and nine contract checks pass, along with types and source secret scan. The hiring-scope test verifies guardian/student field separation, owner/versioned acceptance, foreign/student denial, idempotent retry, stale-version rejection, both-party acceptance without a recurring schedule, and zero resulting lessons/invoices. The persisted TERMS_PENDING lifecycle is preserved for later service-start evidence; mutual hiring-term confirmation is derived independently from the two recorded acceptances.

H2 additional-enquiry draft backend: existing owner/versioned onboarding draft machinery now supports an independent ENQUIRY record, preserving the first PARENT onboarding completion. Guardian-only enquiry drafts save private criteria, resume under current consent, and atomically submit through the existing validated intake. A completed additional draft can explicitly restart with its current version; an unfinished draft cannot be restarted/overwritten by this action. One active additional draft per guardian is enforced by the existing owner/kind uniqueness. The additive migration extends the kind constraint and preserves database ownership validation for enquiry completions. Account deletion already scrubs all owner-kind draft records. No lesson, booking, payment or provider action is introduced. Acceptance evidence follows before push.
Validation: all 92 isolated API and nine contract checks pass, plus types and source secret scan. New acceptance covers separate initial/additional records, consent-safe reads and replay denial after withdrawal, authenticated student/unverified denial, partial input validation, private ownership, version conflicts, unfinished-draft restart denial, atomic/idempotent submission and restart, preserved submitted records and database completion-owner enforcement. Existing retry infrastructure already scopes keys to the request path; a reused key across initial/additional draft routes is explicitly tested. No new dependency is added.

H2 explicit draft-discard backend: guardian-only /onboarding/{kind}/discards supports unfinished PARENT and ENQUIRY drafts with a current version and literal acknowledgement. The action clears only the saved criteria and increments the version under the same owner lock as saves/completions; submitted records and learner profiles are untouched. Current guardian/consent/privacy permission is checked before idempotent replay and inside the transaction. Completed/stale drafts fail closed; audit records only kind/effect, not private draft contents. No schema migration, provider action or new dependency is added. Validation follows before push.
Validation: all 93 isolated API and nine contract checks pass, plus types and source secret scanning. New tests cover both draft kinds, missing/false acknowledgement, unsupported owner input, guardian/teacher scope, stale saves, exact retry replay, replay denial after consent withdrawal, immutable submitted enquiries and exactly-once discard auditing. Existing save/complete/restart acceptance remains intact.

H2 broad availability backend: enquiry intake/drafts and versioned preference changes now accept either existing dated windows or nonoverlapping weekly IST day/time ranges. Stored weekly criteria retain their weekly meaning; matching reevaluates current teacher patterns, leave, reservations, lead time and a bounded 60-day horizon. A free overlap of at least 20 minutes supplies initial fit evidence only, with no class creation or duration agreement. Odd-minute starts and occupancy boundaries are handled without a sampling grid. Screening, account, travel, coverage and capacity checks remain unchanged. Existing dated criteria preserve their previous validation. No schema migration or provider action is added; final validation follows before push.
Validation: all 94 isolated API and nine contract checks pass, plus API types and source secret scan. Five calendar checks include weekly validation, odd-minute free overlap and leave/expiry boundaries. The new API acceptance verifies persistence, actual matching-run eligibility, leave exclusion, versioned preference updates/stale rejection and no resulting lesson/reservation/timetable. Old dated-window acceptance remains passing. Frontend consumers of the expanded preference union follow separately; coordinated web/API image qualification remains a release requirement.
