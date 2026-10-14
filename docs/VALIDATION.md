# Development validation — 12 October 2026

The table records current-instance development evidence; source-linked hosted CI status is recorded below. Neither establishes production qualification.

| Check                                                | Result                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frozen lockfile installation (`npm ci`)              | Passed                                                                                    |
| Prisma generation, migration deploy, repeatable seed | Passed against PostgreSQL 17.11                                                           |
| API, worker and Next.js independent builds           | Passed                                                                                    |
| TypeScript checks across three applications          | Passed                                                                                    |
| Domain policy/calendar/ranking tests                  | 9 passed; none failed/skipped                                                             |
| Isolated real-PostgreSQL API integration tests       | 40 passed; none failed/skipped                                                            |
| API operation/schema/client contract checks          | 8 passed; none failed/skipped                                                             |
| Contract-generated mock HTTP/startup tests           | 4 passed; none failed/skipped                                                             |
| Secrets scanner and CI evidence tests                 | 5 passed; none failed/skipped                                                             |
| Release verifier behavior tests                      | 2 passed; missing/stale pilot evidence correctly blocked                                  |
| Real/mock web/API browser journeys                        | 11 passed; none failed/skipped                                                             |
| Public discovery accessibility                       | No serious/critical axe findings in the tested page                                       |
| Responsive layout                                    | No horizontal overflow at 360px on home, discovery and parent onboarding                  |
| Production dependency audit                          | 0 known vulnerabilities across runtime and development tooling at this run                        |
| Running worker                                       | Synthetic request outbox events processed; live refund reconciliation remains unavailable |

Total automated tests: **79 passed**. Nine browser journeys used the actual development API; two additional guardian intake journeys used the contract mock. Integration tests created and dropped their own synthetic databases. Reservation conflicts were tested with simultaneous overlapping intervals; session replay, foreign ownership, child consent withdrawal, late capture, refund intent, note revocation, stale attendance and consultation overspend were exercised.

This does not establish all P0 story acceptance, 90% policy/80% backend coverage, ASVS compliance, full-site accessibility, provider sandbox contracts, production latency targets, penetration testing, production private-media qualification, live MFA, off-host backup restoration, immutable application-container qualification or VPS deployment. Hosted CI passed for the source commits listed below; raw private artifact contents have not been inspected here. Remaining work stays in `docs/SPRINTS.md`.

## US07 scheduling increment — 11 October 2026

The demo API and dashboard increments add five isolated database acceptance tests, one contract boundary test and one real browser journey. Checks cover proposal retry/ownership, demo-versus-revision concurrent collision, versioned acceptance and reschedule reset, independent completed outcomes before tuition terms, no-show review, expired proposals and calendar release. Browser evidence exercises the scheduling and review controls against the actual API; it moves only its own synthetic confirmed reservation into the past to test the outcome screen. API/worker/web build and type checks pass. The dependency audit above is the prior foundation result; no dependency changed in these increments. Hosted CI remains unverified.

## Phase 1 foundation completion evidence

Reviewed source: `2a0cc438af0c14bd8e3b777f597931921076bf71`. Local validation passes: 5 policy, 30 isolated real-DB API, 7 contract, 4 mock HTTP/startup, 5 security/evidence, 2 release-boundary and 11 browser tests (**64 total**); all application builds and type checks pass. Structural OpenAPI lint passes with one unused generic component warning. Source secrets scan has no findings (the exact synthetic loopback DB URI is the sole allowed credential); complete runtime/tooling dependency audit has zero known advisories at this run.

Hosted GitHub run pages report successful workflows for:

| Source increment | Hosted run |
| --- | --- |
| `cff8545` — foundation contracts and mocks | [38171753865](https://github.com/shubhFreelance/better-call-sir/actions/runs/38171753865) |
| `1e8a906` — redacted source scan, dependency checks and CI evidence | [38172408109](https://github.com/shubhFreelance/better-call-sir/actions/runs/38172408109) |
| `2a0cc438af0c14bd8e3b777f597931921076bf71` — atomic refresh family lifecycle | [38172798589](https://github.com/shubhFreelance/better-call-sir/actions/runs/38172798589) |

The final run page's commit link matches the reviewed source exactly. Workflow configuration preserves JUnit, browser, build, contract, secrets and dependency reports and an exact-commit check-outcome record. Public run pages were used because the GitHub API CONNECT request was blocked; private artifact payloads have not been downloaded or claimed reviewed. The final acceptance documentation is a subsequent documentation-only commit.

See [Phase 1 acceptance and boundaries](PHASE_1_ACCEPTANCE.md). This establishes the synthetic development foundation and its implementation review. Live guardian verification, provider integrations, MFA and independent release/security/recovery review remain open; neither the evidence generator nor this record enables production.

## Phase 2 backend core completion evidence

Reviewed implementation: `2e241a95022c2fd1b82b117384809dedcb7d9a1f`. Local checks pass with **79 tests**: nine policy/calendar/ranking, 40 fresh-PostgreSQL API, eight contract, four mock, five security/evidence, two release-boundary and 11 browser journeys. API/worker/Next.js builds, TypeScript checks, generated client and structural lint pass. Source scan has no findings; runtime and development tooling audit has zero known advisories at this run. Existing development migrations apply without resetting the persistent fixture database.

| Implementation increment | Successful hosted evidence |
| --- | --- |
| `c3a9e4f` — screening/quarantine | [38207929283](https://github.com/shubhFreelance/better-call-sir/actions/runs/38207929283) |
| `4aa2347` — intake plus optional-filter compatibility | [38209843258](https://github.com/shubhFreelance/better-call-sir/actions/runs/38209843258) |
| `a0abcca` — current matching and immutable evidence | [38211939892](https://github.com/shubhFreelance/better-call-sir/actions/runs/38211939892) |
| `2e241a95022c2fd1b82b117384809dedcb7d9a1f` — final ownership/reservation/suspension source | [38216194096](https://github.com/shubhFreelance/better-call-sir/actions/runs/38216194096) |

The final run reports success and its commit link matches the reviewed source exactly. The final acceptance documentation is a subsequent documentation-only commit. Public run pages were inspected; authenticated raw artifacts were not downloaded. The original availability run failed its blank-filter browser case and was fixed without relaxing validation; superseded runs were cancelled by configured branch concurrency. The final browser fixture uses its chosen preference start for both ends, avoiding time-of-day-dependent invalid durations.

Real ClamAV engine checks include clean and EICAR-infected content plus unavailable-provider quarantine. The deterministic scanner has EICAR-only definitions and proves no current production signature coverage. API and worker have been restarted with Phase 2 code; worker notifications remain synthetic and refund jobs stay pending. See [Phase 2 acceptance and remaining boundaries](PHASE_2_ACCEPTANCE.md).

## Owner-priority security audit, 13 October 2026

Backend security increments through `cc48cf4` and their frontend dependency commits now cover rate limits, authorization/cursors, keyed OTP hashing, staff MFA/session limits, durable checkout claims, supply-chain/history/bundle checks, runtime database grants and encrypted backup/restore. See [complete owner checklist](SECURITY_CHECKLIST.md) for per-item evidence and necessary unresolved requirements. The frontend adds staff verification/recovery and production nonce CSP.

Local results: 74 isolated PostgreSQL API tests, 19 unit tests, nine contract tests, 11 security/client/CI-evidence tests, four mock tests, two release-gate tests, 91 development browser tests and two production browser tests pass with no skips. Structural contract lint passes with three pre-existing warnings. Generated-client/API/worker/Next builds and TypeScript checks pass. The mobile verification screenshot was visually inspected; keyboard/overflow and serious/critical axe checks pass. Staff browser fixtures really enroll/verify TOTP and are revoked after each test.

Source and all fetched text-history scans have no findings; the separate public-bundle scan covers all 11 generated JavaScript files and has no findings. An initial zero-file result caused by Git-ignore behavior was rejected and corrected, with regression tests for ignored generated assets and scanner configuration. No zero-coverage scan is accepted. npm audit reports zero known runtime/tooling advisories at this check. Package signature/provenance registry data was unavailable, so that check is incomplete. Historical binary documents are outside text scanning rules.

This is local evidence. Exact-source hosted CI artifacts, GitHub required-review/branch-protection configuration, independent security review, production host/TLS/permissions/monitoring/off-host restore and real provider behavior have not been qualified in this increment. The production API remains blocked and payment/refund/payout qualification remains open. No branch was merged or deployed.

## F10 private lesson feedback — 13 October 2026

Backend source `a3f5073` (frontend dependency `a4bae5b`) adds role-safe recap, own-review and feedback metadata with version/consent/atomic submission checks; 75 isolated API and nine contract tests pass. The frontend adds private guardian feedback review, saved teacher/guardian feedback, student recap-only access and persistent own attendance status.

The 96-case development browser run initially passed 94 and failed two test integration assumptions: the student meeting fixture lacked the now-required lesson metadata, and the real persistence assertion reloaded without restoring its date filter, leaving past lessons beyond the first bounded page. After correcting these fixtures/filters, both affected cases and the mobile feedback case pass on targeted rerun. No test assertion was removed. The actual submission is verified after reload and in a separate teacher browser session. Five new feedback cases cover validation/visibility, unknown-response retry, stale-version recovery, role restrictions and mobile keyboard/axe. A real contrast failure on inherited recap text was fixed before this full run. Mobile and desktop screenshots were inspected. This is cumulative case verification, not a claim that the initial full run succeeded.

Type checks, API/worker/Next build, 11 security/client/CI-evidence tests, two production browser tests and contract lint pass (three existing warnings). Source/history/bundle checks have no findings; the bundle check covers all 11 generated JavaScript assets. Packages/lockfile are unchanged. Production/provider/independent review and exact-source hosted CI inspection remain open; private feedback does not publish public reviews or qualify live payments/meetings.

## F11 private notes — 14 October 2026

Backend `3eb9a65` (frontend dependency `d0e24f3`) adds versioned private edits and owner-safe note metadata, including current sharing and privacy-pause filtering. All 76 isolated API and nine contract cases pass. Frontend acceptance covers controlled create/edit, review of named sharing/withdrawal, current acknowledgement, role denial, lost-response retries, stale edits, saved/refresh recovery, empty learner/teacher states and draft protection.

All 12 notes browser tests and all 11 existing navigation/discovery/demo browser journeys pass, with no skips. A real guardian creates and shares a note, the separate teacher session acknowledges it, and guardian withdrawal removes the teacher’s future read access. Mobile keyboard/overflow/serious-critical axe checks pass; four synthetic screenshots were visually inspected. Type checks, full API/worker/web build (and final web rebuild), 11 security/client tests, two final production browser checks and structural contract lint pass, with three existing lint warnings. Source/fetched text history and all 11 generated public JavaScript assets have no secret findings.

The full unrelated browser suite was not rerun; existing affected journeys and all new notes cases were exercised. F10’s earlier 96-case evidence remains historical. Screenshots are local synthetic UI artifacts, not live cohort screenshots; screenshot-only styling removes Next development indicators. Current note reads are limited to the latest 50; pagination and reviewed privacy deletion remain tracked. Hosted exact-source CI inspection and independent/provider/deployment qualification remain open. No production startup, merge or deployment was enabled.
