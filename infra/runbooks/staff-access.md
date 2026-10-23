# Staff access and authenticator custody

Implementation supports development qualification. Production authentication/release remain blocked. Never use synthetic personas, environment-generated development keys, or database edits as live staff onboarding.

## Two-person access review

An MFA-verified ADMIN proposes a dedicated staff email, name, role and region (CREATE), or a versioned role/region change, suspension or authenticator recovery for existing email staff. Use an opaque reference to a restricted identity/employment review record; never enter identity documents, OTPs, authenticator seeds or recovery codes. Keep that record outside this general audit interface under the approved retention/access policy.

A different active ADMIN independently checks that record, the required role/region and the target identity, then approves or rejects within 24 hours. The proposer can cancel. Neither participant may be the target. Changes are serialized, version checked, retry-safe and audited; a revoked or changed proposer invalidates old approvals. Family/teacher/student accounts cannot be converted. Approval grants no guardian verification and sends no synthetic invitation. The new staff member uses the existing email sign-in, then enrolls their own authenticator before private work. Qualify live email first (B8).

CHANGE explicitly reactivates a suspended account. Approved CHANGE/SUSPEND/RECOVER increments the access epoch, revokes all session generations, removes pending OTPs and deletes the previous authenticator/recovery hashes. A fresh sign-in and fresh enrollment are required. Suspension keeps records/audit intact. No self-service bypass of lost-authenticator recovery exists. Two active administrators must remain; establish three separately controlled initial administrators so any one can be recovered by the other two. Never share authenticators/mailboxes.

## Initial bootstrap only

Use the migration/operator identity on a database containing **no staff accounts**. This is deliberately unavailable through HTTP and cannot recover an existing installation. Two named independent reviewers approve the initial three identities in a restricted record. A private regular JSON file (mode 0600 or stricter) contains `reviewers` (two distinct review-record identities) and `admins` (three distinct objects with email, name and region). It contains no passwords or authenticator seeds. Inject DATABASE_URL/MIGRATION_DATABASE_URL and MFA_KEYRING_FILE through the restricted operator environment. Set STAFF_SECURITY_REVIEW_REF to the opaque approved record and STAFF_BOOTSTRAP_CONFIRM to INITIAL_THREE_ADMINS_NO_EXISTING_STAFF. Run:

```
npx tsx scripts/staff-security.ts bootstrap /private/initial-staff.json
```

The transaction creates exactly three staff accounts and an immutable bootstrap audit record, or creates none. Existing staff, duplicate email, malformed/private-file failures roll back. Verify each identity and separate mailbox/authenticator enrollment before opening staff access. If all administrators are lost, keep traffic closed and use the approved independently reviewed infrastructure recovery procedure; do not change rows to bypass approval.

## Managed MFA keyring and rotation

The secret manager/operator mounts MFA_KEYRING_FILE as a private regular file (0600 or stricter, at most 16 KiB). JSON: `activeId` names the encrypting key, `keys` maps at most 16 opaque IDs to independent 32-byte canonical base64 keys, and optional `legacyKeyId` identifies the key for existing unversioned credentials. Key IDs contain 1–40 ASCII letters, digits, underscores or hyphens. No keys belong in Git, API responses, screenshots, chat, logs or backups. Local MFA_ENCRYPTION_KEY is a backwards-compatible development fallback only when no file is configured. Configured missing/malformed/unsafe keyrings fail closed without fallback.

1. Have two independent custodians authorize and record the rotation. Retain the previous key securely off-host for compatible backups. Generate the new key in the secret manager; publish an atomically replaced private keyring containing both old and new keys, with the new activeId and old legacyKeyId as needed.
2. Inject STAFF_SECURITY_REVIEW_REF and STAFF_SECURITY_ACTOR_ID (the accountable active administrator UUID) and run `npx tsx scripts/staff-security.ts rewrap` under the restricted operator identity. No secrets are output. All credential updates commit together; unavailable keys, invalid ciphertext or concurrent credential edits roll back. The tool records count and active key ID in the audit. Current bound: 10,000 credentials; qualify batching before exceeding it.
3. Re-read/verify enabled credentials with the new key, test fresh TOTP and single-use recovery on isolated synthetic accounts, and rehearse encrypted backup restore with the retained old key. Only then remove retired keys from the runtime keyring. Do not retire backup keys before their retention/deletion policy permits it. Keep OTP, MFA and backup encryption keys independent.

## Recovery drill evidence

Automated isolated tests cover independent proposal/approval, self/target denial, version/race/expiry/revoked-proposer handling, session/refresh epoch invalidation, deletion of old OTP/MFA/recovery records, fresh enrollment, paginated authorized history, atomic key rewrap and wrong/retired-key rejection. Audit includes the two actors, record reference, reason, target and before/after access versions without secrets.

Before live release, the named operators must perform the approved real-world identity checks, secret-manager mount/rotation/backup-restore and lost-device exercise, measure restoration time, test denial from every old session/code, and attach exact-source evidence for reviewer sign-off. This application cannot establish external identity verification, key custody, mailbox ownership or operator independence merely from an attestation. Those qualifications remain launch blockers; no deployment is authorized.

High-value refund/payout execution and provider activation remain deferred or release-gated. This increment does not enable them. Any future financial execution must add its own independent approval and amount/scope checks before activation.


## Guardian review staff assignment —19 October2026

The owner assigns guardian review to staff workers with superadmin oversight. Select `REVIEWER` for those workers, scoped to their approved region; superadmin uses `ADMIN`. Matching/support `OPERATOR` and finance staff retain their own existing scopes and cannot read guardian evidence merely because they are employees. Use the dedicated-account/independent provisioning process above; do not grant ADMIN for convenience, share mailboxes or modify the database to turn a developer fixture into a real appointment. See the [operating and policy approval pack](../../docs/GUARDIAN_OPERATIONS_POLICY.md). Actual names, independently reviewed identity/employment references, training, rota, deputies and controlled privacy/safeguarding/recovery contacts must be recorded before live work. Role selection alone does not establish those facts.

## Finding staff sign-in in the review UI

The public login page includes a visible **Admin & staff sign-in** entry at `/login?intent=staff`. This view uses the existing registered-email OTP endpoint, followed by existing staff MFA; it does not assign roles or offer public account creation. A non-staff account keeps its own role and cannot open protected staff tools. Unknown verified staff emails receive a provisioning explanation rather than entering registration.

For isolated local development only, the view expands **Development accounts** and filters its buttons to existing staff personas from GET `/dev/accounts`. Select **Operator · demo admin** if present, then enroll/verify the authenticator. No password is configured. The selector reports loading, missing accounts, unavailable endpoints and recoverable failures. If the development database has not been seeded, the project owner runs `npm run db:seed` (`npm.cmd run db:seed` in Windows PowerShell) from the repository root and refreshes. Do not seed a live database or enable development shortcuts to bypass a production gate. When the server returns404 for this development-only endpoint, use an already provisioned staff email. Actual staff provisioning/recovery still follows the independent approval rules above; never turn a personal guardian account into an administrator through row edits or public signup.
