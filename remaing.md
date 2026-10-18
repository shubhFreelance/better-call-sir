# Backend increment status

18 October 2026 — Private privacy-request history API pagination (B12/H5).

- Implemented: validated page size/cursor; owner-scoped stable timestamp/ID pagination; foreign/missing/deleted cursor rejection; page-independent minimal pending-target summary; versioned contract and generated client.
- Privacy history frontend is complete on `feat/frontend-implementation` (`4b13af9`).
- Completed focused-history frontend: `bc3fff2` on the frontend branch. Optional hiring-demo API pagination is now implemented; frontend demo controls and final legacy/mobile review are next.
- Prior API increment: remaining scoped enquiry/reviewer/note/evidence/check/run/job/linkage/availability histories. Next: connect frontend history controls and complete the shared legacy/mobile/keyboard/recovery review.
- Multiple concurrent drafts are not currently required; class-specific histories remain explicitly deferred. See `docs/HISTORY_UX_AUDIT.md`.
- Full MVP implementation, decision/launch and deferred backlog remains maintained in `remaing.md` on `feat/frontend-implementation`. No launch blocker is closed by this API increment; no deployment.

- Final enquiry-filter review: PLACED is accepted and filter-bound cursors remain enforced. All 139 API cases and 12 contract cases pass; frontend final acceptance remains in progress.


18 October 2026 — B2 backend implementation complete: paginated staff/approval APIs, dedicated-email provisioning, role/region changes, suspension and authenticator recovery; different proposer/approver/target, five-minute MFA, expiry/version/epoch checks and audit. Managed private MFA keyring, backwards-compatible rewrap, initial three-admin bootstrap and isolated recovery/rotation/bootstrap drills implemented. Validation:147 API,13 contract,4 MFA unit and8 backend security/CI/client checks; API/tool types and secret scan pass; contract lint retains two existing warnings. Frontend integration follows separately. Actual secret-manager custody, independent operator identity review and production recovery qualification remain launch requirements. Next: B2 bilingual staff workspace, then B3 versioned commercial/coverage configuration. No merge/deployment.

B2 concurrency follow-up: per-account MFA locking plus in-transaction epoch/session validation prevents obsolete MFA requests from writing after approved recovery. All148 API,13 contract,4 MFA unit and8 backend security checks pass, including the deterministic lock-order recovery drill. Next remains the B2 frontend review; actual key-custody/independent-operator launch qualification stays open.

18 October 2026 — B3 backend complete in development: independently approved fee/region/rollback settings, fresh MFA, immutable history and cursor pages; fresh supply checks and paused-region discovery/intake/matching gates; guardian/independent fee snapshots and preserved legacy fees. Current pilot ceilings remain25%/INR1500. No subscriptions, charges or provider activation added. Validation:154 full API regression cases plus one separately selected concurrency case,14 contract,8 backend security/CI/client checks; build/lint/source scan pass (two existing contract warnings). Next:B3 bilingual configuration/review/rollback screens, then B8 live email. Actual policy/supply/release qualification stays open.
