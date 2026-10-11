# Development validation — 11 October 2026

The table records current-instance development evidence; source-linked hosted CI status is recorded below. Neither establishes production qualification.

| Check                                                | Result                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frozen lockfile installation (`npm ci`)              | Passed                                                                                    |
| Prisma generation, migration deploy, repeatable seed | Passed against PostgreSQL 17.11                                                           |
| API, worker and Next.js independent builds           | Passed                                                                                    |
| TypeScript checks across three applications          | Passed                                                                                    |
| Domain policy tests                                  | 5 passed; none failed/skipped                                                             |
| Isolated real-PostgreSQL API integration tests       | 30 passed; none failed/skipped                                                            |
| API operation/schema/client contract checks          | 7 passed; none failed/skipped                                                             |
| Contract-generated mock HTTP/startup tests           | 4 passed; none failed/skipped                                                             |
| Secrets scanner and CI evidence tests                 | 5 passed; none failed/skipped                                                             |
| Release verifier behavior tests                      | 2 passed; missing/stale pilot evidence correctly blocked                                  |
| Real/mock web/API browser journeys                        | 11 passed; none failed/skipped                                                             |
| Public discovery accessibility                       | No serious/critical axe findings in the tested page                                       |
| Responsive layout                                    | No horizontal overflow at 360px on home, discovery and parent onboarding                  |
| Production dependency audit                          | 0 known vulnerabilities across runtime and development tooling at this run                        |
| Running worker                                       | Synthetic request outbox events processed; live refund reconciliation remains unavailable |

Total automated tests: **64 passed**. Nine browser journeys used the actual development API; two additional guardian intake journeys used the contract mock. Integration tests created and dropped their own synthetic databases. Reservation conflicts were tested with simultaneous overlapping intervals; session replay, foreign ownership, child consent withdrawal, late capture, refund intent, note revocation, stale attendance and consultation overspend were exercised.

This does not establish all P0 story acceptance, 90% policy/80% backend coverage, ASVS compliance, full-site accessibility, provider sandbox contracts, production latency targets, penetration testing, private-media scanning, live MFA, off-host backup restoration, immutable application-container qualification or VPS deployment. Hosted CI passed for the source commits listed below; raw private artifact contents have not been inspected here. Remaining work stays in `docs/SPRINTS.md`.

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
