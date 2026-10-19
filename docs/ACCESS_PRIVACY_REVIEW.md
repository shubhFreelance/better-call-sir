# Internal access-control and privacy verification

19 October 2026. Scope: current teacher-discovery/enquiry/hiring product and retained private legacy endpoints. Tests use isolated local databases, synthetic identities/files and sandbox adapters. No real credentials, real-person verification, provider delivery, merge or deployment. This is an internal regression review, not an independent penetration test or production certification.

## Scope and method

The [source inventory](ACCESS_CONTROL_INVENTORY.md) lists all 219 declared API operations. Reviewed entry guards, shared authorization, ownership/region predicates, delegated management, response projections and cached mutation recovery. The independently written entry-role policy in `tests/helpers/access-policy.ts` covers 53 critical surfaces and makes 334 rejected-role requests across all eight roles. It deliberately tests denial before resource lookup; valid-owner, same-role foreign-owner and revoked-authority scenarios use actual fixtures in `tests/api.test.ts`. The existing anonymous contract inventory checks every declared cookie-protected operation. Inventory coverage does not mean every possible operation/object/role pair was exhaustively executed.

| Role | Boundary exercised |
|---|---|
| Guardian | Own learners, notes, evidence, consent and privacy; foreign family denied; relationship proof is learner-specific |
| Managed student | Linked learner and current approved learning mode; no guardian ownership, staff, device administration or financial confirmations |
| Independent adult student | Own profile/enquiries/arrangements/devices/privacy; optional supporter does not receive ownership or recovery privileges |
| Teacher | Assigned opportunities/arrangements and currently shared notes; screened status, private contact consent and financial-party restrictions |
| Superadmin / ADMIN | Fresh MFA; dedicated staff identities and independent staff-change approvals; no ordinary-role elevation through client input |
| Operator | Region-scoped matching/support/service records; assignment-specific private contacts; recovery invalidates old sessions/receipts |
| Reviewer | Region-scoped teacher/guardian review and clean private evidence; no finance/operator/admin privileges |
| Finance | Finance-only privileged surfaces and scoped records; no reviewer evidence or general staff administration |

Existing tests also exercise foreign/filter-bound cursors, no-store responses, strict input/Origin/CSRF checks, public teacher allowlists, optional supporter downgrade/revocation, guardian-only/shared/student-led management, consent/privacy pauses, two-party hiring/contact sharing, financial ownership and regional support/finance/report access.

## Reproduced defects and fixes

All six findings were reproduced by failing isolated regression tests before the corresponding fix. None establishes that an actual user accessed another user's data.

1. **Regional staff receipt after access change.** A previously authorized keyed support mutation could return the old private response to a newly authenticated staff session after its region/authority epoch changed. Idempotency receipts now capture the account's authority version. Receipts from another epoch fail closed with409 and an instruction to reload the current record; they are never reexecuted under a new key namespace. The shared mutation helper also rechecks live account/session/expiry/epoch state after its queue lock and serializes staff mutations with staff administration. A deterministic queued-write test proves an independently approved suspension wins before the queued legacy write; no update is created.
2. **Learner proof missing from note sharing.** A guardian may be verified for a different learner while an older learner's relationship proof is revoked. Teacher note reads now filter current learner proof before pagination; new sharing/acknowledgment and cached retries recheck current ownership, proof, consent, screening and active placement. Old acknowledgment receipts fail after unsharing. Private owner history remains owner-readable.
3. **Student refresh used a weaker guardian gate.** Refresh could mint another session after learner proof revocation even though protected access already failed. Authentication, queued student mutations and refresh now share the same enabled guardian/current consent/linked learner/proof gate. Revoked proof or unverified guardian returns401 and creates no replacement session. This was an inconsistent refresh gate, not a demonstrated authorization bypass into protected learning data.
4. **Privacy correction depended on learning authority.** An owner with revoked learner proof could not request correction of their own child's data. Privacy request submission now checks ownership separately. Foreign-child requests stay404; staff review is still mandatory before correction.
5. **Legacy private meeting link outlived learning authority.** Participant ownership and time-window checks alone allowed a join URL after learner proof/consent was lost. Both meeting read paths now recheck current guardian/consent/learner proof, pending deletion and teacher screening/account state under the family lock before exposing a URL. Historical participant metadata remains readable; unavailable links return `canJoin:false` and `joinUrl:null`. Revoked student sessions remain401. No live Google Meet was used or enabled.
6. **Withdrawal of note sharing depended on learning authority.** An authenticated owner could be blocked from unsharing a note after verification was revoked. Withdrawing existing sharing now uses locked ownership authorization; foreign owners stay404. New sharing and edits retain learning gates. Consent withdrawal also retains its existing bulk unshare behavior.

## Recovery and private-data evidence

The full regression suite includes OTP exact-key retry, single-use invitation activation/replacement, refresh rotation/replay/absolute expiry, guardian-managed device recovery/revocation, independent owner device boundaries, staff fresh-MFA/TOTP/recovery-code replay, independent two-person authenticator recovery and queued stale-MFA rejection. Optional adult supporters cannot recover or assume the owner's account, manage devices or submit owner privacy requests. Losing the mailbox still needs the approved human recovery procedure; no new staff impersonation shortcut was added.

The new evidence test uploads a synthetic school image, verifies quarantine before scan, denies foreign owners/teachers/out-of-region reviewers, checks authorized byte digest, attachment/nosniff/no-store headers, then proves stale-session401 and new out-of-region-session404 after relocation. Existing teacher-evidence, guardian-review, contextual contact and B13 assignee-only reveal tests remain part of the full suite. Note/evidence/contact identifiers alone grant no permission.

## Migration and compatibility

Migration `20261019160000_idempotency_authority` adds a nonnegative `Idempotency.authVersion` with default0. Deploy it before starting the updated API; regenerate Prisma. It is additive and does not change public endpoint or response contracts. Old receipts from epoch0 remain recoverable while the account stays at0. A historical receipt created in a later epoch receives default0 and is deliberately rejected after upgrade; inspect the current business record instead of resubmitting an old action. Backfilling receipts with today's authority would incorrectly restore stale access.

Staff role/recovery changes must continue to advance `Account.authVersion` through the reviewed administration path. Initial guardian-to-independent onboarding intentionally changes role within the same epoch and supports concurrent exact-key recovery; the existing signup test verifies this. The global freshness check must not reject that legitimate transition. Current per-resource authorization continues to run before receipt recovery where required; epoch checks do not replace consent, grant, assignment or proof checks.

## Verification and remaining qualification

Final results are recorded in `docs/SPRINTS.md` and `remaing.md`. Run `npm run test:integration` alone, then contracts, unit/security checks and API/worker builds. Focused review: `npx tsx --test --test-concurrency=1 --test-name-pattern=AccessReview tests/api.test.ts`.

No live data or provider credentials were needed. Synthetic approved proofs are authorization fixtures, not proof of real guardian identity or process acceptance. Local scanner fixtures are not current production malware signatures. Real reviewer/recovery identity procedures, legal/retention decisions, B14 deployed private storage/scanning/deletion replay, B15 coordinated migrations/images and exact-source CI, independent security/DAST review and deployment/device/operational acceptance remain required. A previously disclosed external URL cannot be recalled from a browser; live Meet provider admission/revocation must be qualified before enabling that provider. Retained financial/safety/owner history is not silently erased by learning-consent withdrawal.
