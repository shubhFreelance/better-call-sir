# Hiring fees and service coverage

B3 applies to teacher discovery and hiring. It does not enable charges, payment providers, subscriptions, per-class pricing, calls or meetings. Those retain their separate scope/release gates.

The current pilot ceiling remains 25% (2500 basis points) and INR1500 (150000 paise). Administrators may configure a lower rate/cap, including zero, within those existing ceilings. Raising the pilot ceilings requires separately approved policy/code review. Teacher monthly prices remain teacher declarations; accepted arrangement prices are not rewritten by this console.

## Review and apply

1. An ADMIN with MFA verified within five minutes loads current settings, immutable history and region supply metadata. Propose a fee change, one registered/new region, or restoration of an old configuration. Supply a reason and opaque protected-policy-review reference; no secrets or identity documents belong in these fields.
2. The server saves explicit before/after snapshots against the current configuration version. No setting changes at proposal time. A different active ADMIN independently checks the policy reference, exact effects and supply before approving within24 hours. The proposer can cancel; the other administrator can reject. Self-approval, stale/expired proposals and revoked/changed proposers fail closed. Reviews are idempotent and audited.
3. Approval appends an immutable revision and updates the fee head/region registry in one transaction. Current in-flight intake/matching/quote transactions share the configuration lock so coverage cannot be partially applied. Approval never changes release/provider flags or sends live money.

## Coverage and supply

Region codes are stable. Register a new region disabled, then separately provision/review teachers against that registered region before requesting activation. Both proposal and approval require current screened, enabled teacher accounts with active recurring-availability declarations overlapping the next60 days for newly enabled regions. This is recorded supply, not proof of free capacity, travel fit or a guaranteed tutor for every subject. Request-specific eligibility/capacity/calendar checks remain authoritative. Accounts are not moved to another region by configuration.

Pausing a region removes its teachers from public discovery and prevents new intake/matching/opening arrangements in that coverage. Existing arrangements, accepted prices, support and private records remain intact. Existing consent/eligibility checks still govern any further hiring action. Registration/configuration is not evidence that the pilot region is commercially or operationally qualified.

## Snapshot prices and rollback

Every new guardian placement records its exact platform-fee amount and commercial revision; new independent-student terms record the same values in their immutable terms snapshot. Dashboards and any retained legacy invoice calculation read the recorded amount. Existing placements are backfilled once with the original25%/INR1500 calculation, keeping their legal policy version. New policy changes or rollback never reprice prior arrangements.

Select a historical revision to propose rollback. This is a fresh, independently reviewed revision rather than deleting/reusing history. Current region IDs absent from the old snapshot are retained and disabled, preserving referenced accounts, enquiries and arrangements. Reactivation during rollback still requires current supply. Rollback covers the complete fee/region snapshot; review every region effect before approving. Revision0 records the pre-existing pilot baseline and does not imply fresh commercial approval.

Current pilot bounds:200 configured regions,20 default revision-history rows (max50 per cursor page) and50 default proposal rows (max50). All histories remain reachable through stable version/ID cursors. Qualify a larger region registry before increasing the snapshot bound. CommercialRevision is append-only under triggers/runtime permissions. Do not edit state/regions directly outside this workflow.

Before launch: owner-approved live fees/notice/retention rules, real teacher supply, independent operator review, migrated web/API/worker image compatibility, provider/production-key qualification and release evidence remain required. No merge or deployment is authorized by local B3 acceptance.

A zero recorded platform fee creates no invoice when retained tuition-start confirmations complete. Positive fees still create the recorded obligation. Do not mix pre-B3 API images after changing fee policy: older invoice code recomputes the original fee. Qualify coordinated migration/web/API/worker images before release; use a reviewed configuration rollback for policy changes rather than claiming an older application image is compatible.
