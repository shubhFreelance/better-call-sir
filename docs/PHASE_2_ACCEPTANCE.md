# Phase 2 backend core — 12 October 2026

Completed development acceptance: **79 passing tests**, all application builds/type checks, source scan and dependency audit; hosted [run 38216194096](https://github.com/shubhFreelance/better-call-sir/actions/runs/38216194096) succeeds for exact implementation `2e241a95022c2fd1b82b117384809dedcb7d9a1f`.

Phase 2 implements the Version 3 PRD Section 10 backend deliverables in synthetic development: screening, public projection, intake, eligible matching, shared reservations and audit. The exit check is real PostgreSQL constraints and server authorization. Phase 3 completes the corresponding user interfaces; Phase 4 qualifies transaction delivery and providers. This record does not establish live MVP or all P0 acceptance.

| Deliverable | Implementation and acceptance |
| --- | --- |
| US03 / US04 screening | Private content-checked PDF/PNG/JPEG uploads; quarantine, SHA-256 and real ClamAV protocol; clean-only downloads; four immutable, expiring checks bound to the current profile revision; fee acceptance; reviewer region and self-review denial; material revisions reopen review |
| US05 public projection | Approved, unexpired, enabled teacher accounts; allowlisted profile fields; stable catalog cursor; bounded private-free availability; weekly Asia/Kolkata declarations, leave, shared occupancy and capacity/travel settings |
| US02 intake | Confirmed UTC schedule windows, supported region and linked-child consistency; legacy unconfirmed text cannot match; minimal unsupported-scope waitlist without child identity or bookings |
| US06 matching | Final current approval, coverage, language, budget, mode, home area/travel, capacity and calendar checks; immutable minimal run features, eligible pool, ranking/version and decisions; explicit operator publication and guardian shown records; versioned responses/selections |
| Shared reservations | PostgreSQL half-open exclusion; declared free windows; teacher/account/screening rechecks; guardian/teacher/resource serialization; source/provider metadata; late sandbox capture leaves refund intent pending when allocation fails |
| Audit and ownership | Append-only audit/check/run/presentation/decision evidence; family ownership and financial relationship constraints; request/session/region authorization; stale and foreign writes rejected |

## Demonstration through the real API

1. A teacher submits their full profile and fee acceptance, then uploads each required evidence kind under the current profile version. Upload response is QUARANTINED; scanner failure cannot approve or download it.
2. The separate worker scans private content and records engine result and integrity. An authorized regional reviewer records IDENTITY, QUALIFICATIONS, CAPABILITY and REFERENCES checks with clean evidence, exact declared coverage and validity. Approval fails if a required current check is missing. A profile revision hides prior approval and requires new checks.
3. A verified, consenting synthetic guardian submits supported intake with 20–120 minute, nonoverlapping future preferences. Unsupported scope uses the private waitlist. Intake neither charges nor assigns a teacher.
4. An operator generates a bounded, versioned matching run, rechecks and publishes ordered candidates. The guardian's explicit shown endpoint records rendered candidates; fetching or publication alone cannot imply display. The selected teacher responds under the candidate version. Guardian choice records evidence without forcing placement.
5. A booking is accepted only against currently declared free availability. Simultaneous overlapping demo/revision/recurring intervals cannot both hold; adjacent intervals are valid. Expired screening at sandbox capture cannot displace another booking and creates a pending refund intent.

Integration tests exercise these paths with fresh migrated synthetic databases, plus wrong role/owner/region, CSRF, retries, stale state, missing evidence, scanner outage/infection, suspension, expired review, changed schedules, exhausted capacity, cross-family SQL writes, expired/lost holds and simultaneous cancellation. Unit tests exercise timezone conversion, pattern cadence, half-open occupancy, confirmation lead time and deterministic ranking. Browser tests exercise existing discovery/intake and demo callers; they are not a claim that all new Phase 3 forms exist.

## Authorization review

| Principal | Allowed backend work | Restriction |
| --- | --- | --- |
| Anonymous | Public catalog/profile/availability | Enabled teacher account, current approval and allowlisted fields only |
| Verified guardian | Own intake, schedule, waitlist, shown/selection records and bookings | Active consent for new child work; family ownership; financial cancellation remains possible after withdrawal |
| Teacher | Own profile, evidence, declarations, capacity, assigned candidate responses and owned booking acceptance | No approval/self-review; current versions, expiry, calendar and ownership rechecked |
| Reviewer | Teacher screening/checks and evidence review | Same region; cannot review own account; clean evidence required |
| Operator | Request matching/publication/history and demo dispute review | Same request region, active guardian consent, current state and eligibility |
| Administrator | Explicit review/operator functions | Development fixtures only; production privileged access blocked pending MFA |
| Student / unrelated family | No intake, evidence review, finance or candidate mutation | Direct requests reject wrong role or inaccessible object |

Suspending an expert revokes discovery/new bookings and named note access, and flags paid future confirmed bookings for support review. It preserves accepted reservations and does not fabricate a cancellation or settled refund.

## Boundaries and remaining work

The matching pool is capped at 200 and exposes truncation; shortlist size is ten. Operator review remains required. Availability supports the launch timezone Asia/Kolkata; national region schema does not enable national operations. Active accepted reservations are preserved when a declaration changes. Rolling recurring commitment creation remains Phase 4.

The ClamAV fixture uses an actual pinned engine with EICAR-only test definitions. Current production signature feeds, live private-store access/recovery, legal/retention approval, independent security review and load targets remain open. Notifications, calls and financial delivery are synthetic or unconfigured; refunds remain pending. Production API/worker startup remains blocked pending live OTP, guardian verification, privileged MFA and provider qualification. No merge or deployment is part of this phase.

Phase 2 changes to the unreleased development v1 API require retry keys and optimistic versions. Repository browser callers, fixtures, generated client and OpenAPI are migrated together. Complete public-contract breaking-change automation and external client compatibility are not claimed. See [validation evidence](VALIDATION.md) and [remaining sprint gates](SPRINTS.md).
