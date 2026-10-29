# Sponsored teacher promotion

Owner-requested monetization increment, 29 October 2026. This is a fixed-duration promotion request and manual review flow in the development product. It does not collect money, renew a subscription, guarantee a hire or unlock Pro. Existing Pro tuition-calendar permissions remain separate.

## Product and pricing

| Placement | Suggested initial total in INR | Duration | Audience |
| --- | ---: | ---: | --- |
| Search | ₹299 | 7 days | People using relevant search criteria |
| Homepage | ₹599 | 7 days | Visitors exploring teachers |
| Subject spaces | ₹999 | 7 days | Authorized families/students with matching saved subject and education context |

These are starting price proposals, not demand-qualified prices. Admin may edit price, duration and availability. The per-day search price must remain below homepage, and homepage below spaces. A request snapshots the exact total, duration and plan version; later edits never silently reprice it. Disabling a placement immediately hides its active campaigns without extending their expiry. The configuration is a total quoted promotion price; no additional tax or fee is automatically added. Tax, invoices, lawful advertising terms and real payment settlement need qualification before charging people.

Recommended first launch experiment: keep the seven-day plans, manually review a small screened pilot cohort, and interview teachers about enquiries and value before increasing inventory or changing prices. Do not introduce pay-per-click billing until independently tested fraud-resistant accounting exists. Impression/click attribution and financial receipts are not fabricated by this implementation.

## Teacher and superadmin flow

Teachers use **Dashboard → Promote profile** (`/dashboard/promotions`). Three shared layered cards describe the placements, total price and duration. A modal shows the quote and requires explicit agreement. Only teachers with approved, currently screened profiles and spare student capacity may request/activate a promotion. There is one open request/campaign per teacher and placement.

Superadmin uses **Dashboard → Sponsored placements** at the same route. Admin can edit plans and filter/paginate campaigns. Each campaign expands into review controls. Approval needs a fresh authenticator verification, current campaign version, review note, explicit confirmation of full quoted payment and a unique reconciliation reference. There is no payment button or invented successful checkout. Do not tell a teacher to pay until authorized payment instructions and commercial terms exist. For synthetic testing, use clearly synthetic references.

Approval starts the clock immediately for the quoted number of 24-hour days. Teachers may pause, resume or cancel their own campaign; superadmin may also reject pending requests or moderate active campaigns. A staff pause can only be resumed by staff. Pausing does not extend expiry; cancellation does not automatically issue a refund. Paid promotion complaints/refunds must receive staff review. Rejected/cancelled/expired records cannot be reactivated; a fresh request is necessary. Statuses and UTC dates come from the API, with dates displayed in Asia/Kolkata.

## Matching, disclosure and privacy

Every ad displays **Sponsored**. Homepage, search and saved subject spaces use the same public teacher projection and the existing coverage rules. Space placement requires authorized learner access, a saved subject, the current education level, board/course/year, saved language when specified and online or relevant regional home coverage. Search also honors explicit mode, locality, language and budget filters. Ineligible, disabled, privacy-paused, screening-expired or full teachers do not serve ads. An ad does not authorize an enquiry or bypass the existing hiring checks.

Sponsored profiles live in a separate block; organic order is unchanged. At most three eligible teacher profiles are returned. Rotation is deterministic in five-minute intervals, without cookies, viewer identifiers, tracking pixels or machine learning. Inventory is capped at 100 active/paused campaigns per placement; raise it only with a reviewed allocation strategy and load evidence. Advertisers never receive learner names, private preferences, guardian contacts or learning histories through promotion.

Account erasure cancels campaigns, clears private review notes and deletes cached campaign decisions, including staff-owned retry receipts. Minimal quoted amounts, dates and reconciliation references follow the existing staff-reviewed financial/audit retention exception; no sensitive review narrative is copied into immutable audit records. A production retention policy and refund ledger remain release work.

## API and reuse

- `GET /promotion-plans`: public price/availability catalog; `chargesEnabled: false`.
- `POST /promotions`: teacher-owned request with `placement`, `planVersion`, `confirmed`.
- `GET /promotions`: own-teacher or superadmin, newest-first, bounded cursor pagination and optional status.
- `POST /promotions/:id/decision`: versioned approve/reject/pause/resume/cancel; approval requires reviewed payment reference and explicit confirmation.
- `POST /admin/promotion-plans/:id`: recent-MFA admin price/duration/availability controls with optimistic version.
- `GET /sponsored-teachers`: up to three public profiles, with placement and discovery criteria. SPACE requires authorized `learnerId` and subject. It does not retrieve the organic list again.
- `GET /teachers` also supports optional `promotionPlacement` for clients wanting organic and sponsored results in one response; existing clients receive the same organic response when omitted.

Promotion requests and decisions also write important notices to the existing live inbox for the teacher; new requests reach superadmin review. Socket.IO sends the existing post-commit invalidation only. These events do not enable new email delivery.

Writes use existing Origin/session/CSRF/idempotency checks, role gates, transaction locking and audit. No new dependency was added. Contract and generated client types are checked in. Migration: `202610290001_teacher_promotions`.

UI reuses LayeredSummaryCard, FilterButton/FilterButtonGroup, Modal, StepProgress, StatusBadge, RefreshButton, Feedback/useDecision, history pagination and existing typography. Ivory #F3F1EB, sage #E4E4D0, teal #034F46 and lavender #F0D7FF follow the current brand. New interface text is supplied in English and Hindi. Unknown writes retain the same retry key and lock editing.

## Verification and limitations

Run `npx tsx --test tests/promotions.test.ts tests/promotion-api.test.ts` and `npx playwright test tests/browser/promotions.spec.ts`. The real-HTTP integration test creates an isolated synthetic PostgreSQL database, executes every checked-in migration SQL file, seeds it, builds/starts the API, verifies the flow and drops only that temporary test database. It does not replace `prisma migrate deploy` qualification.

In this environment the Prisma engine host returned HTTP 403. Client generation succeeded using the bundled generator with `PRISMA_SCHEMA_ENGINE_BINARY=/bin/false` only for `prisma generate`; this is not a migration engine and must never be used for deployment. Database acceptance executes real migration SQL. Normal deployment migration-runner qualification, real money/refunds/tax invoices, named payment reviewers, traffic fraud controls, performance attribution, external-device/load qualification and production launch remain open. No deployment or main merge is part of this feature.

Acceptance for this increment includes eight real-HTTP/policy tests, English/Hindi promotion browser checks, existing family-space and learner-discovery regression checks, workspace type checking and API/security/localization contract checks. Exact final counts are recorded in `remaing.md` and `docs/SPRINTS.md` alongside the feature commits.
