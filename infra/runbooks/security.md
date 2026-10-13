# Security operations and release checks

This repository is a synthetic development environment. API/worker production startup and the release verifier deliberately fail closed. The owner's photographed checklist is audited in `docs/SECURITY_CHECKLIST.md`; implementing a control here does not demonstrate its configuration on a future VPS.

## Credentials and database permissions

- Keep `.env`, MFA/backup keys, dumps, encrypted archives and private media outside Git and public/static directories. Configuration and backup files must be owner-readable only; private media directories use mode 0700. Source, full fetched text history and built browser JavaScript have separate secret scans.
- `DATABASE_URL` is the application/worker runtime identity. Inject a separate migration owner as `MIGRATION_DATABASE_URL` for Prisma migrations. The local `bcs_dev` owner/password exists only to seed fixtures and create isolated test databases; it is not a deployment identity.
- On the dedicated deployment database, the migration owner sets `bcs.runtime_role` to a distinct role name and runs `infra/sql/runtime-permissions.sql`. The script creates a NOLOGIN role if necessary, refuses administrative authority/memberships/object ownership, grants application DML and revokes mutation of immutable evidence and access to migration records. An operator then injects a new SCRAM credential and enables LOGIN using the restricted database console. Never pass passwords in command arguments or commit them. Reapply reviewed grants after migrations; new immutable tables need the same exclusions.
- Restrict database/scanner ports to the private network. Apply host firewall rules and PostgreSQL authentication rules before enabling a runtime login. Require certificate-verified TLS for remote database connections, encrypted durable volumes and a supported patched host. The existing compose database is loopback-only; this is not proof of a production firewall or encrypted disk.

## Staff access and recovery

ADMIN, OPERATOR, REVIEWER and FINANCE APIs require server-verified TOTP. Primary email sign-in is not MFA. Enrollment requires primary authentication within five minutes, is tied to that session family and expires after ten minutes. Secrets use account-bound AES-256-GCM with a separately managed key. Staff sessions expire after eight hours or fifteen minutes idle; step-up expires after ten minutes and refresh cannot renew that proof.

Save the eight single-use recovery codes in a password manager. Recovery requires an authenticated primary session, consumes one hashed code atomically and revokes other session families. A used TOTP/recovery code cannot be retried after a lost response: inspect current session/MFA status instead. A fresh authenticator code can replace all recovery codes through the dedicated endpoint. The browser shows codes only in memory; no codes belong in tickets, screenshots, email, logs or browser storage.

If both authenticator and recovery codes are lost, do not invent a public email-only reset. A named operator must verify staff identity independently, obtain the required second approval, record the recovery reference and revoke every session before replacing enrollment through the restricted maintenance process. That real operator procedure and key rotation/escrow must be rehearsed before live release. There is no self-service role grant, impersonation or privileged bypass endpoint.

## Backup and isolated restore

`scripts/backup.mjs` implements encrypted database/media backups and restores into a new, empty database and a new private media directory. It exports a PostgreSQL repeatable-read snapshot; media must match the evidence hashes in that snapshot. Missing/changing media fails the backup. Deleted media is excluded. The dump and manifest are authenticated with AES-256-GCM; plaintext temporary files live in a private directory and are removed on completion/failure. Current bounds are 10,000 files and 2 GiB database/media input. Qualify larger limits from measured capacity rather than removing the bounds.

Inject a dedicated `BACKUP_ENCRYPTION_KEY` (32 random bytes, base64) through the operator's secret manager, separately from the MFA key. Keep recovery of both keys off-host; do not put key material into the archive. Standard PostgreSQL 17 client tools are required. For a local drill only, `PG_TOOLS_CONTAINER=better-call-sir-dev-db-1` uses the existing container after verifying its image against the pinned digest. Remote database connections require verified TLS; container-tool mode refuses remote targets.

From a restricted operator shell with the correct environment already injected:

```sh
node scripts/backup.mjs create /private/backups/pilot-YYYYMMDD.bcsbackup
```

Provision a new empty restore database with a maintenance identity, point `DATABASE_URL` at that target, and set `RESTORE_CONFIRM_DATABASE` to its exact name. Choose a new private media directory:

```sh
node scripts/backup.mjs restore /private/backups/pilot-YYYYMMDD.bcsbackup /private/restored-media
```

The source database, `bcs_dev`, system databases and existing target data cannot be overwritten. Wrong keys, tampering, unsafe archive links/paths, missing hashes and an incomplete media manifest fail before restoration. A successful restore is not permission to reopen traffic. Replay the latest deletion ledger retained independently of the older backup, rescan private media with current signatures, reconcile provider captures/refunds/payouts, restore the separate MFA key, apply runtime grants and test role/ownership access before a separately approved cutover. Preserve financial and audit evidence according to the approved retention policy.

Configure a daily schedule and encrypted transfer to a separate host/storage account, retention/immutability and failure alerts once the host/provider are chosen. Perform and record an off-host restore drill with measured RPO/RTO. Local tests already restore SQL, private evidence and encrypted MFA credentials, and reject wrong keys, tampering and existing data; they do not establish off-host durability or the production recovery targets.

## Monitoring and incident response

The API emits sanitized `security-denied` records with status/code/request ID for session, role/MFA, CSRF and rate-limit failures. Unexpected errors log an error class and request ID rather than payloads, cookies, email addresses or credentials. Upload/download/reviewer/admin/finance/recovery actions are audited; immutable records cannot be rewritten by the runtime role. Failed jobs and meeting recovery already have restricted queues.

On the chosen host, collect the API/worker/proxy/database logs into access-controlled monitoring, define retention, redact ingress headers/body/query strings and alert on sustained authentication failures, unusual privileged activity, error spikes, failed jobs, stale backups and provider/signature/amount failures. Name the responder and rehearse an alert. Raw private content and provider responses must not be placed in dashboard telemetry.

For an incident: pause new transactions through the existing kill switches, preserve relevant request/audit/job IDs, revoke affected session families, rotate compromised keys through the secret manager, review private-data/provider impact and reconcile money before reopening. Never delete immutable audit records or mark a pending refund/payout settled to clear an alert. Safeguarding and privacy escalations use their existing free support route.

## Build and deployment evidence

CI uses read-only source permissions, full SHA-pinned official actions, no retained checkout credential, locked registry integrity and disabled package lifecycle scripts except the reviewed Prisma-engine/esbuild installers. Security/history/bundle/audit failures fail the job and remain failures in exact-source evidence. History scanning requires a complete fetch; binary documents/assets are outside text rules and must be reviewed according to their content.

Before live release, inspect the exact-source hosted CI artifacts; complete independent code/access review, required SAST/DAST/container/IaC/SBOM checks, immutable image qualification, proxy/TLS/CSP/provider checks, restore/reconciliation and alert drills. No source-only or local success overrides the existing production gate. Actual Razorpay receipt recovery, refunds/payouts, Google Workspace admission/OAuth and verified email delivery still need provider evidence.
