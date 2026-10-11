# Development validation — 12 October 2026

This records current-instance development evidence, not production qualification or the GitHub runner's results.

| Check                                                | Result                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frozen lockfile installation (`npm ci`)              | Passed                                                                                    |
| Prisma generation, migration deploy, repeatable seed | Passed against PostgreSQL 17.11                                                           |
| API, worker and Next.js independent builds           | Passed                                                                                    |
| TypeScript checks across three applications          | Passed                                                                                    |
| Domain policy tests                                  | 5 passed; none failed/skipped                                                             |
| Isolated real-PostgreSQL API integration tests       | 20 passed; none failed/skipped                                                            |
| API operation/schema/client contract checks          | 4 passed; none failed/skipped                                                             |
| Release verifier behavior tests                      | 2 passed; missing/stale pilot evidence correctly blocked                                  |
| Real web/API browser journeys                        | 8 passed; none failed/skipped                                                             |
| Public discovery accessibility                       | No serious/critical axe findings in the tested page                                       |
| Responsive layout                                    | No horizontal overflow at 360px on home, discovery and parent onboarding                  |
| Production dependency audit                          | 0 known vulnerabilities at this run; tooling overrides revalidated                        |
| Running worker                                       | Synthetic request outbox events processed; live refund reconciliation remains unavailable |

Total automated tests: **39 passed**. Browser journeys used the actual development API, not mocked success cards. Integration tests created and dropped their own synthetic databases. Reservation conflicts were tested with simultaneous overlapping intervals; session replay, foreign ownership, child consent withdrawal, late capture, refund intent, note revocation, stale attendance and consultation overspend were exercised.

This does not establish all P0 story acceptance, 90% policy/80% backend coverage, ASVS compliance, full-site accessibility, provider sandbox contracts, production latency targets, penetration testing, private-media scanning, live MFA, off-host backup restoration, immutable application-container qualification or VPS deployment. GitHub CI has been configured; its hosted execution must be checked on the pushed branch. Remaining work stays in `docs/SPRINTS.md`.
