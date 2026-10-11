# Delivery board

Source: **BetterCallSir_MVP_PRD.docx, Version 3.0, 11 October 2026**, supplied by the project owner. This board tracks implementation against that document; development demonstrations do not satisfy pilot release gates.

## Working agreement

- Work in sprint-sized increments, starting with the PRD's foundation sprint.
- Link every API/feature to PRD tickets and stories. Define acceptance cases before extending it.
- Run the relevant checks, create a focused commit, and push the feature branch after each completed API or feature. Never call untested or synthetic provider behavior production-complete.
- Preserve the PRD's separate Next.js, NestJS API and worker applications, versioned contract, PostgreSQL constraints and server-owned permissions.
- Push implementation branches without merging or deploying unless requested. No real child records or production credentials in fixtures or Git history.

## Sprint 1 — foundation and an integrated development journey

This initial implementation also contains early development slices from later phases. Their presence does not mean those phases are complete.

| PRD ticket | Implemented now | Outstanding acceptance |
| --- | --- | --- |
| S1-01 | npm workspaces; separate API, worker and Next.js builds; Node 24; synthetic fixtures; PostgreSQL 17.11 pinned image | Qualify immutable application containers for pilot |
| S1-02 | Architecture decision, threat boundaries and delivery board | Independent security/privacy review; complete control register |
| S1-03 | Versioned OpenAPI, generated TypeScript definitions, schema and operation coverage checks | Full resource schemas for all later APIs; contract-diff CI; full mock server |
| S1-04 | PostgreSQL migrations, account/session/consent/request and later-flow schema, isolated real-DB tests | Full foreign-key ownership model and operational schema evolution/restore rehearsal |
| S1-05 | Development OTP expiry/rate limiting, hashed session rotation/replay, CSRF/Origin, consent gates | Live OTP, independently reviewed adult verification, production MFA, distributed rate limiter |
| S1-06 | Guardian intake against the separate API; ownership, validation and retry protection | Saved onboarding drafts and step-by-step resume; complete bilingual notices |
| S1-07 | Unit, real-DB API, contract and browser tasks; dependency audit; CI configuration | Complete secrets/SAST/container/DAST scans and coverage evidence |
| S1-08 | Integrated discovery/intake/dashboard demonstration; withdrawal and ownership tests | All production provider contracts and signed release evidence |

## Story coverage — development only

| Story | Current implementation | Remaining work before story acceptance |
| --- | --- | --- |
| US01 | OTP sandbox, session replay/logout, consent and family isolation | Real adult verification, reviewed consent, provider abuse handling |
| US02 | Validated supported intake, child linkage and idempotency | Unsupported-scope waitlist, persisted draft resume and schedule validation |
| US03–04 | Pending teacher application, server-only approval with screening gate, suspension | Private evidence store, quarantine/scanner, capability check workflow and material-change review |
| US05 | Allowlisted approved profiles, filters, SSR and suspension hiding | Cursor pagination, real supply and availability |
| US06 | Hard eligibility filters, fit reasons, operator shortlist, teacher response | Capacity/schedule eligibility, ranking evidence snapshots, exposure tracking |
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

## Next sprint — backend core completion

Complete US03–US07 in focused increments: private-evidence adapter and capability-review records; public availability contract; schedule/capacity-aware matching evidence; demo proposal and dual acceptance with shared-calendar tests. Then extend terms and recurring schedules (US08), followed by transactions and actual provider sandbox integration (US09/US10/US18).

The remaining PRD phases stay required: frontend completion, transaction qualification, service operations, security/recovery/load evidence, and the final VPS pilot. Production release is blocked until all P0 stories and Sections 14–16 gates pass. The owner's 440–720 hour estimate is planning context, not work already completed.

## Sprint 2 — US07 demo API increment

Implemented `GET/POST /demos`, versioned acceptance/reschedule/outcome/cancellation endpoints and restricted operator dispute review. Every mutation uses principal/resource-scoped retry keys, active guardian consent and an audit/outbox transaction. Proposals expire after 24 hours or at the proposed start, whichever comes first; demos last 20–60 minutes in this development increment. This is scheduling metadata, not a delivered video service.

Acceptance checks: isolated fresh-database migrations; cross-family/student denial; retry replay and payload mismatch; concurrent demo-versus-revision exclusion and adjacent slots; stale versions; reset of both acceptances on reschedule; premature outcome rejection; independent completed outcomes before tuition terms; no-show support case and authorized review; expired acceptance denial and calendar release on cancellation. The existing unit/API/contract suite passes with these cases. No recurring invoice is created by demo completion itself.

### US07 dashboard increment

Guardian recommendations now lead to demo scheduling. Guardian and teacher booking screens show current version, both acceptances, proposal expiry and outcome state; rescheduling requires a reason and resets acceptance. Operators can resolve a no-show case with a version and evidence/reason. Revision payment/scope controls are restricted to revision records. Tuition terms appear only after a completed demo.

Validated through a real browser/API journey: guardian proposal and acceptance; teacher acceptance; guardian reschedule with both acceptances reset; reconfirmation; no-show report after the synthetic test's demo end; restricted operator review and case resolution. All nine browser journeys and the separate API, worker and Next.js builds pass. Meeting delivery and actual notification providers remain outstanding.
