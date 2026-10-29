# Teacher QA — 29 October 2026

Result: the tested teacher journeys pass after one API response-order correction and two test-assumption corrections. This is development/synthetic acceptance, not production launch sign-off.

## Test environment and evidence

- Current sponsored-promotion implementation plus the tuition authentication correction, integrated on `feat/frontend-implementation`.
- Production Next.js build on localhost:3001, real API on localhost:4000 for the combined journey, and disposable PostgreSQL databases with generated names.
- Email OTP uses labelled sandbox codes. The reviewed teacher, family, learner and staff are synthetic fixtures. Staff actions use real authenticated endpoints and MFA; the payment reference is explicitly synthetic. No live email, money, external provider or personal account is used.
- Full API acceptance uses a separate localhost:4100 service and isolated databases; the promotion API cases use localhost:4199.
- Temporary API processes, evidence and test databases are removed after the combined journey. Existing app databases are not migrated or seeded by that command.

| Check | Evidence | Result |
| --- | --- | --- |
| Teacher registration and email verification | Real browser → API → database, English desktop and Hindi phone | Pass |
| Full teacher application | Address, education, employment, coverage, tuition, demo and minimum-engagement preferences; real save/reload/submission and private upload | Pass |
| Draft/revision recovery | Stale versions, failed reads, interrupted writes, explicit retry and same-account recovery | Pass |
| Private evidence | Upload/quarantine, real ClamAV fixture, EICAR rejection, ownership and screening gates | Pass |
| Existing teacher sign-in | Real OTP preserves the existing account ID and TEACHER role | Pass |
| Incoming enquiries | Real family submission appears directly for the selected teacher, with owned learner details | Pass |
| Decline | Teacher declines through the UI; stored status is DECLINED and no tuition is created | Pass |
| Alternative timing/group | Teacher proposes; family confirms through the authenticated API; early acceptance stays disabled | Pass |
| Acceptance and tuition | Teacher accepts through the UI; both parties confirm the same month through real endpoints | Pass |
| Sponsored promotion | Teacher submits; staff uses MFA and synthetic payment review; campaign becomes active and serves relevant search | Pass |
| Live notification | Teacher receives the actual approval notification through the existing live inbox | Pass |
| Pause/resume/cancel | Teacher performs each action in the UI; cancelled promotion stops serving | Pass |
| Logout and returning sign-in | Same teacher ID, enquiry/arrangement identity and campaign record remain; no duplicate account/campaign | Pass |
| Sidebar | Notifications, enquiries, independent students, arrangements, profile, privacy, search and help load without a document reload | Pass |
| Runtime browser/network errors | Combined real journey records zero page exceptions or API403/404/5xx responses | Pass |
| Permissions/privacy | Full API suite includes cross-account access, revoked authority, regional staff and334 denied unauthorized-role requests across53 reviewed surfaces | Pass |
| Mobile/Hindi/accessibility | Teacher UI and recovery cases include phone layouts, keyboard controls, accessibility and translation checks | Pass |

## Final check results

- **236 API/integration/migration-safety tests: passed, zero failures/skips.** The full API run includes hiring, Pro calendar rules, support/replacement, privacy, provider sandbox behavior, protected evidence, payment guards, role access and Socket.IO, plus promotion cases.
- **29 teacher-specific production-browser scenarios:** all accepted. The initial broad run passed24; three real-server cases passed after the isolated API was ready, and the remaining two passed after correcting test assumptions. These include four teacher sign-in/onboarding/schedule scenarios against the real API; the other cases use explicit contract-driven fixtures for deterministic UI/failure/accessibility checks.
- **54 additional production-browser regression cases: passed.** Enquiry conversation decisions, onboarding recovery, returning accounts, notifications and promotions. These are fixture-driven UI checks, separately from the real backend journey.
- **One combined, real-backend production-browser journey: passed.** Includes teacher sign-in, decline/propose/accept, family confirmation, mutual tuition confirmation, promotion approval, live notification, pause/resume/cancel, returning sign-in and all teacher sidebar destinations. No API routes are mocked in this case.
- **30 unit,24 security/client/localization/CI and16 contract checks: passed.** Workspace type checking passes. The final519-file source secret scan reports no findings.

Screenshots, captured with synthetic data:

- `test-results/teacher-qa-real-accepted-enquiry.png`
- `test-results/teacher-qa-real-active-promotion.png`
- `test-results/teacher-signup-en-desktop.png`
- `test-results/teacher-signup-hi-mobile.png`

Screenshots are ignored test artifacts, not committed personal records. The active-promotion image was captured before the test subsequently paused, resumed and cancelled it.

## Corrections made

1. Monthly-tuition read, confirmation and completion endpoints now authenticate before validating route kind/ID. Anonymous callers previously received400 for an invalid kind instead of401. Access was denied in either case; the correct authentication response is now consistent. Existing valid-request, ownership, financial and concurrency checks remain unchanged.
2. A schedule browser test hard-coded localhost:3000 as its Origin. It now derives the actual page origin, so it tests the same protection correctly in development and the production build.
3. A student-role denial test now permits the existing authorized student identity-context read while still asserting the exact allowed request set and no teacher schedule access.
4. Added explicit SQL-only integration acceptance for generated disposable loopback databases. The test helper rejects application/system databases and remote hosts before connecting. It creates an empty migration metadata table solely for runtime-permission tests; it never claims Prisma CLI-applied migrations. Default migration-runner behavior is unchanged.

The original evidence-scan failure occurred before the ClamAV fixture was ready. The affected case and final complete suite pass with the fixture running; the app correctly kept the file quarantined while scanning was unavailable.

## Reproduce

Install the existing pinned dependencies and generate the client. Build the API and web application. A local PostgreSQL instance must be available using the synthetic settings in `.env.example` or your local loopback configuration. Stop your own API on port4000 and any process on port3001; the combined QA suite refuses to replace an existing API.

```sh
npm run build -w @bcs/api
npm run build -w @bcs/web
npm run test:teacher-qa
```

This command starts its own disposable database, seed and sandbox-only API, exercises the production UI, then cleans them up. It requires no sending or payment credentials. Build the frontend with API_INTERNAL_URL=http://127.0.0.1:4000; the suite checks the compiled rewrite before making requests and refuses a remote API target.

For full API SQL acceptance when the Prisma engine host is unavailable, first start the existing PostgreSQL and EICAR-only scanner fixtures:

```sh
docker compose -f infra/compose/development.yaml up -d --wait
npm run scanner:test:setup
BCS_TEST_SQL_MIGRATIONS=1 npx tsx --test --test-concurrency=1 tests/test-migrations.test.ts tests/api.test.ts tests/promotion-api.test.ts
```

In PowerShell set `$env:BCS_TEST_SQL_MIGRATIONS="1"` before the test command. Wait until the scanner is listening on3310. This opt-in mode executes checked-in SQL on disposable local databases only; never use it for deployment.

## Still unverified for launch

Normal Prisma CLI migration execution remains unqualified here because its engine download was blocked. Current production malware signatures/private storage, real SMTP/inbox delivery, payment capture/refund/payout/tax receipts, actual staff operations, real people/physical devices, external hosting/load and final release/security qualification remain open. The ClamAV fixture has only the EICAR test definition and is not a production scanner database. Existing dependency-security remediation remains the next release priority.
