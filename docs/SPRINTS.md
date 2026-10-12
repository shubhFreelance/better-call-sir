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
| US01 | OTP sandbox, session replay/logout, consent and family isolation | Real adult verification, reviewed consent, provider abuse handling |
| US02 | Validated supported intake, region-scoped access, normalized structured schedules, child-grade/board consistency, unsupported-scope waitlist and idempotency | Persisted frontend draft resume: Phase 3; staging/live guardian qualification remains open |
| US03–04 | Private content-checked evidence, fail-closed ClamAV worker, revision-bound reviewer checks, fee acceptance snapshot, material-change re-review, suspension | Staging/private-store and current-signature qualification; full Phase 3 reviewer/upload UI |
| US05 | Allowlisted current-screening profiles, bounded cursor pagination, weekly IST availability, leave exceptions, capacity/travel settings and suspension hiding | Real supply and Phase 3 discovery/availability UI qualification |
| US06 | Capacity/schedule/travel/current-screening hard filters; immutable rules-v2 runs, reviewed publication, explicit shown/selection evidence, versioned teacher responses | Full Phase 3 publication/exposure UI and live cohort qualification; no ML training/export enabled |
| US07 | Demo API and guardian/teacher/operator screens: proposal, versioned dual acceptance, shared-calendar conflict protection, reschedule reset, outcome confirmations, no-show support case and operator review | Staging notification and private meeting qualification; reviewed pilot evidence |
| US08 | Completed-demo prerequisite, tuition terms/start acknowledgement and unique capped invoice | Recurring schedule acceptance and rolling 60-day materialization |
| US09 | Invoice records; payment integrity examples for revision sandbox | Teacher invoice checkout, signed raw-body provider webhooks, reconciliation |
| US10 | Revision hold, expert scope acceptance, exact synthetic capture, late-slot refund intent | Advertised expert slots, reviewed quote/payout policies, child lesson linkage, private meetings, recap, settlement |
| US11 | Support case records; early revision cancellation intent | Operational rematch and all approved replacement/cancellation policies |
| US12 | Private notes, named active teacher sharing/revocation | Sharing acknowledgement and complete replacement workflow |
| US13 | Consent withdrawal stops writes/matching and student access; privacy case intake | Approved deletion/retention jobs, backup deletion replay, correction fulfillment |
| US14 | Operational counts with explicit recorded metric semantics | Funnel/continuation cohorts and reconciled cash reporting |
| US15–16 | Live assisted purchase and AI remain disabled | Later scope per PRD |
| US17 | Separate dashboards, attendance correction history, disputes, verified totals | Parent/student confirmations, complete lesson identities, date filters, feedback and revised metrics |
| US18 | Synthetic prepaid entitlement, consultation request/acceptance, atomic allowance, failed-connection release | Approved masked-audio provider, subscription billing, cancellation/renewals, timeouts, teacher compensation |
| US19 | Separate routes, guardian-bound hashed single-use invitations and student principal | Draft resume, device revocation UI, reviewed activation/privacy notices, private teacher uploads |
| US20 | Development console, explicit review/flag reason, audit history and kill switches | Live MFA, region-scoped delegation, dual approval, finance/refund/retry controls, full configuration rollback |

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

Owner discovery direction: the frontend will have **Search** and **Let us search for you** tabs. Direct discovery uses the public teacher catalog with board, grade, subject, mode, language, locality and price filters. Guardian requests snapshot MANUAL plus a chosen teacher or ASSISTED with no preselected teacher; matching respects this boundary and still applies all eligibility checks. Both flows retain teacher agreement, demo and guardian booking permissions. Students browse public profiles; guardians submit learner criteria. Assisted discovery uses rules-v2 and operator review/adjustments; future ranking can replace the existing ranker without changing these request identities.

The owner changed delivery order on 12 October 2026: complete missing backend workflows before the remaining frontend. This overrides the earlier phase-order working agreement for implementation sequence; it does not waive provider/security/release gates or mark Phases 4–6 accepted. Continue feature-sized tested commits and pushes on `feat/backend-completion`.

| Sprint | Scope | Status |
| --- | --- | --- |
| B1 / US01, US19 | Persist onboarding drafts/status, prevent premature child capture, parent-managed returning student sessions and device revocation | In progress |
| B2 / US08, US17 | Accepted recurring schedule/version, rolling lesson reservations, learning-record queries, confirmation and dispute resolution | Pending |
| B3 / US09, US10, US18 | Checkout/webhook/reconciliation, revision lesson lifecycle, Pro periods/cancellation/timeouts and teacher payable records | Pending; provider/commercial decisions needed |
| B4 / US11–14, US20 | Support queue/status, replacement/rematch, sharing acknowledgement, privacy requests/retention boundary and operational reports | Pending |
| Provider qualification | Live OTP/adult verification/MFA, payment/refund, private meetings, masked audio, notifications, current scanner signatures/private storage | Provider selection/credentials and external review pending; never label simulated delivery complete |

### B3 / US10 — revision fulfilment, recap and teacher payable

Successful sandbox or signed Razorpay capture now creates one learner-linked revision lesson and one separately tracked teacher payable. The reservation snapshots subject, language, price, payable and the explicit development policy version; current unapproved commercial terms use a zero-platform-fee pass-through policy. Teacher eligibility is rechecked against the learner's grade/board and selected subject/language before the hold is created.

Delivered revision attendance requires an expert recap. A guardian confirmation makes the payable eligible, a learner confirmation records service evidence without authorizing finance, a dispute holds the payable, and operator resolution records eligibility or manual review. Eligible cancellation cancels the scheduled lesson and moves its payable to refund-pending. Teachers can list only their own payable projection; finance/admin can operate the bounded queue. PostgreSQL binds the payment, revision reservation, lesson and teacher and rejects payables above captured funds. No provider payout is represented as sent; live fee/tax terms, payout settlement and accounting acceptance remain open.

### B2 / US08 — mutually accepted recurring tuition calendar

Added versioned weekly Asia/Kolkata schedules owned by a placement. A guardian or assigned teacher proposes 20–120 minute windows; online windows are capped at the owner's selected 40-minute meeting limit. Both parties must accept the same version before the backend materializes confirmed reservations and lessons through the rolling 60-day horizon. Tuition cannot enter the started state until terms and a recurring schedule are accepted.

Materialization uses the shared expert calendar, declared recurring availability, leave exceptions, current screening/account/consent and PostgreSQL overlap protection. Retry-safe unique keys prevent duplicate lessons. A conflicting replacement rolls back and preserves the old accepted timetable; a successful replacement cancels only future unstarted commitments. The worker extends accepted schedules and opens one support case with retry time when extension fails, preserving existing lessons. Real-DB tests cover roles, stale acceptance, idempotency, conflict rollback, replacement, revision collision, owner constraints, extension and failure escalation. All 44 API, 11 domain and eight contract tests pass.

### B2 / US17 — learning records, confirmation and feedback

Added bounded date-range lesson history for guardians, students and teachers with family/assignment filtering, stable cursors, learner alias/class/board, assigned public teacher identity and confirmation state. Private finance, guardian identity and notes are excluded from the learning projection. Teacher attendance remains versioned and retry-safe.

Guardians and linked students can append an immutable attendance confirmation or dispute against the current completed lesson version. A dispute opens a support case and excludes the record from verified totals. Same-region operators or administrators resolve an open dispute with an audited correction; stale resolution fails. Guardians can record one private, retry-safe rating/comment only after confirming non-disputed attendance. Database triggers enforce family ownership and append-only confirmation/feedback evidence. Tests cover wrong family/role, stale state, replay, feedback prerequisites, regional resolution, projection privacy and direct SQL ownership/mutation rejection. All 45 real-DB API, eight contract and application type checks pass.

### B3 / US09–10 — Razorpay checkout and signed capture

Added owner-bound exact-INR checkout orders for teacher placement invoices and guardian revision reservations. Sandbox order IDs are explicitly synthetic. The live Razorpay transport has fixed-origin HTTPS calls, server-only credentials, timeout and strict response checks. The API preserves raw webhook bytes, requires HMAC signature and provider event ID, deduplicates replay, serializes payment by payer, and rechecks order, amount and currency. Invoice capture marks the unique invoice paid; revision capture rechecks screening/account/calendar and either confirms the reservation or records paid-unallocated plus a pending full refund instruction without displacing another booking.

Amount mismatch and reconciliation mismatch open payment support cases and never confirm payment. Finance/admin reconciliation is versioned and retry-safe; sandbox reports local-only state rather than pretending provider settlement. PostgreSQL constrains checkout ownership/exact amount and unique payment subjects. Tests cover wrong payer, stale state, invalid signature, replay under same/different events, exact capture, amount mismatch, direct SQL ownership and revision final eligibility. Actual Razorpay credentials, provider sandbox run, automated refund API and finance approval remain open; checkout stays feature-gated.

Acceptance uses real persisted state, schema/ownership constraints, contract generation and unauthorized/stale/retry/dependency-failure checks. Endpoint existence alone is not full workflow acceptance. Independent student signup is intentionally excluded by PRD Section 20; returning access is guardian-approved and needs no child phone.

### B1 / US19 — persisted onboarding and guardian-managed student devices

Added owner-only parent/teacher/student progress and strict, versioned, retry-safe draft saves. Parent child fields require current adult verification and consent; linked child references require ownership. Atomic completion reuses authoritative request/application creation, clears the submitted draft and stores a DB-constrained owner resource link. Retries cannot duplicate children, requests or teacher applications; teacher completion remains SUBMITTED pending screening. Existing profile revisions remain the only way to revise a submitted application.

A guardian can authorize a returning student device without a child phone, list active student session families without credentials, revoke one family or all access, and explicitly authorize access again. Revocation blocks both access and refresh; consent withdrawal still blocks new grants. Authorizing a student device switches that browser to the separate student principal. Credentials remain hashed in the DB; session issuance is versioned rather than saving plaintext credentials in idempotency history. Tests cover owner/role isolation, stale/replayed completion, prohibited child capture, self-approval fields, device refresh after revocation and no duplicate resource creation. All 43 real-DB API tests, contract/type checks and source scan pass.

Provider direction supplied by owner: Razorpay payments; email OTP instead of SMS; Google Meet with a 40-minute booking limit; masked calls disabled for now with an integration boundary retained. This explicitly overrides the PRD's mandatory live masked-call delivery for current implementation scope; no audio delivery acceptance is claimed. Email sender choice is being confirmed; credentials belong in environment secrets.

### B1 / US01 — email OTP and Resend transport boundary

Replaced the unreleased phone-OTP contract with normalized email request/verify inputs; no SMS delivery is used. Existing synthetic accounts are preserved; new adults have nullable phone and unique normalized email. Existing phone challenges are expired by additive migration. Codes use unbiased cryptographic generation, hash storage, expiry, attempt limits and single-use verification. Email possession does not establish adult/guardian verification or grant privileged roles.

Sandbox delivery stays explicitly labelled. The provisional Resend transport uses server-only configuration, a fixed HTTPS origin, timeout and delivery idempotency key; SENT responses omit the code. Missing configuration, transport failure or malformed success leaves no valid matching challenge and returns a generic 503 without provider details. The sender choice can be replaced by SMTP if requested; no real email is sent or claimed qualified without credentials/verified domain. Updated contract, generated client, mocks and tests are the explicit development v1 migration. All 43 real-DB API tests, ten unit tests, eight contract and four mock tests, type checks, lint and source scan pass; a controlled transport test exercises success/failure without external delivery.
