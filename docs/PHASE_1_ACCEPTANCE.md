# Phase 1 foundation acceptance record

Source: owner-supplied Version 3 PRD, Sections 3, 4, 10 and 11. Review date: 11 October 2026. Scope: synthetic development foundation. This is an implementation review by Codex, not independent security, privacy/legal or pilot approval.

## S1-01–S1-08 audit

| Ticket | Foundation implementation and evidence | Later-phase work retained as open tickets |
| --- | --- | --- |
| S1-01 | Separate Next.js, NestJS and worker workspaces/builds; Node 24.19.0; lockfile; digest-pinned PostgreSQL 17.11; synthetic fixtures | Immutable app images and supported-host/recovery qualification: Phases 6–7 |
| S1-02 | ADR, threat model, module ownership and role matrix below; trust decisions enforced on server | Independent security/privacy review and operational control qualification: Phase 6 |
| S1-03 | Explicit discovery/auth/consent/intake schemas and synthetic examples; structural lint; generated client; example-derived mock; real/mock response validation | Complete later APIs and v1 breaking-change review tooling before evolving their contracts: Phases 2–5 |
| S1-04 | Repeatable migration deployment into isolated fresh test databases; account/session/consent/child/request schema and ownership tests | Full later-domain FK matrix: Phase 2; migration/restore rehearsal: Phase 6 |
| S1-05 | Sandbox OTP, hashed credentials, atomic refresh/replay/logout, fixed family expiry, consent/withdrawal, production startup rejection | Live OTP/adult-verification/MFA adapters and qualification remain open; production stays disabled |
| S1-06 | Minimal guardian intake calls the separate API; browser tests against contract examples and real API; input/failure states | Saved drafts, complete bilingual flows and later-role screens: Phase 3 |
| S1-07 | Unit/DB/contract/mock/browser checks; source secrets scan with redacted reports; runtime plus tooling audit; exact-commit CI outcomes and JUnit artifacts | SAST/SBOM/container/DAST, coverage targets, adversarial review and load evidence: Phase 6 |
| S1-08 | Guardian demonstration, cross-family denial, OTP expiry/replay, withdrawal and source-linked validation; implementation review recorded here | Independent live-service and final release review: Phase 6 |

The PRD's Phase 1 definition of done permits explicitly labelled provider stubs with live integration left open. Existing later-phase features are retained; their presence does not accept Phases 2–7. No phase acceptance may enable the blocked production runtime.

## Roles and object boundaries

| Principal | Current server-controlled scope | Restriction / remaining boundary |
| --- | --- | --- |
| Anonymous | Approved catalog projection, taxonomy, readiness; public OTP entry | No child/request/private-resource access. Synthetic account picker exists only in development |
| Guardian | Own children/requests; versioned consent; own bookings, placements, notes and cases in existing slices | Adult verification and active consent precede child writes. Foreign IDs produce 404; browser role assignment rejected |
| Student | Guardian-bound invitation creates a separate principal; own child/classes and permitted disputes/support | No purchasing, note ownership, teacher review or privileged mutation. Withdrawal blocks access and refresh. Complete dashboard field projections remain Phase 3/US17–19 qualification |
| Teacher | Own application/profile, assigned candidate/demo/reservation/lesson decisions and explicitly shared notes | Cannot self-approve, review another teacher or access unshared notes. Capability/evidence workflow remains Phase 2 |
| Operator | Request review/recommendations and demo dispute review APIs explicitly allow this role | Region-scoped delegation and console controls remain US20 work. The UI fixture named “Operator” is actually an ADMIN principal |
| Reviewer | Teacher review/list APIs explicitly allow this role | No self-service role assignment; actual restricted evidence/capability workflow remains Phase 2. No fixture claims reviewer onboarding is finished |
| Finance | Reserved role vocabulary | No finance mutation workflow is implemented; later billing/reconciliation requires dedicated permissions and MFA |
| Administrator | Explicit review/flag/audit development operations | Fixture access only. Production startup remains blocked; no MFA completion is claimed |

`AppService.actor` checks opaque access credentials, expiry/revocation, disabled accounts, mutation CSRF and allowed roles. Controllers also check object ownership. `AppService.guardian` holds a guardian advisory lock and checks independently verified account state plus active consent before child-data writes. Intake and invitation activation cannot assign privileged roles. Region-scoped delegation is an open later-phase control, not a claim of this foundation.

## Module ownership

| Source owner | Responsibility |
| --- | --- |
| `apps/api/src/modules/identity` | OTP, sessions, consent, child access and guardian-bound invitations |
| `apps/api/src/modules/catalog` | Public taxonomy, allowlisted discovery and readiness |
| `apps/api/src/modules/requests` | Guardian intake and request object ownership |
| `apps/api/src/shared.ts` | Persistence, session/role/CSRF checks, consent/ownership helpers, transaction-bound idempotency, audit/outbox writes |
| `teachers`, `matching` | Later Phase 2 screening/application and recommendation slices |
| `demos`, `placements`, `revision`, `memberships` | Later transactions and Parent Pro slices; independent qualification remains open |
| `learning-records`, `notes`, `support`, `administration` | Later learning/service/operator slices; independent qualification remains open |
| `apps/web` | UI and transport only; no DB imports or browser-owned permissions |
| `packages/api-client`, `contracts` | Generated public client types and API schemas/examples; no persistence |
| `apps/worker` | Outbox handling and expired holds; synthetic notifications only, no false refund settlement |

## Identity adapter and MFA integration boundary

The only executable authentication mode is `APP_MODE=development` with `NODE_ENV` other than `production`. The API and worker reject other modes before serving work. Their production-startup rejection is exercised by API integration tests. There is no environment flag, evidence file or browser role field that enables a live administrator.

The development OTP handler returns a clearly named sandbox code and persists its hash, expiry and attempts. Normal OTP success creates an unverified guardian; it cannot grant adult verification or accept child intake. Fixture adult verification is pre-seeded for synthetic accounts. Live adult identity/lawful-guardian relationship verification must replace that fixture proof and be reviewed before accepting real child data.

Live OTP integration belongs at the identity module's send/verify boundary. Reviewed provider expiry, attempt limits, distributed abuse controls and failure handling must preserve the existing session/role/consent checks. MFA must be validated on the server before issuing a privileged live session, with shorter configurable privileged lifetimes, recovery/revocation rules and integration tests. Current synthetic admin sessions do not demonstrate any of those controls. Do not remove the startup block merely because a provider returns success.

Refresh follows a defined concurrent policy: one request rotates under the family lock; a valid replay of the old credential revokes every generation, requiring sign-in again. Invalid CSRF cannot revoke a replacement. Rotation and replacement insertion are one transaction; cookies are sent after commit; the original family expiry is inherited. Logout uses the same family lock. Student refresh serializes with guardian consent and cannot restore access after withdrawal.

## Integrated guardian demonstration

1. Browse approved synthetic profiles through public discovery. Private application/contact/child fields are excluded by the public response schema and real API test.
2. Sign in using a sandbox fixture. A new OTP guardian remains unverified and receives 403 for consent/child intake.
3. As a verified synthetic guardian, accept the development purpose/version and submit supported tuition intake. A retry returns the same resource; a different payload under the same key returns 409.
4. The other guardian cannot read or attach the first guardian's child/request. Student/teacher mutation attempts and forged Origin/CSRF fail.
5. Withdraw consent. New child intake is denied; linked student access and refresh fail. No real notifications or teacher assignment are implied by the saved request.

The browser suite exercises real intake and mocked saved/denied-consent states. The mock validates inputs and examples but has no authentication, ownership, persistence or provider fulfilment. Its responses are marked `X-BCS-Mock: synthetic-contract`; it binds loopback and refuses production startup. Real-DB tests establish the ownership and withdrawal controls.

## Security and evidence limits

Source scanning selects tracked files and nonignored untracked files. Its report retains locations/rule IDs only, without source or secret values. Only the exact documented synthetic loopback DB URI is allowed; the same credential at a remote host is rejected. Binary document contents and historical commits are not a demonstrated secrets-review surface. Independent secret-history, SAST, DAST, container and operational review remain Phase 6 work.

CI has read-only repository permissions, SHA-pinned actions, fresh synthetic configuration/database, generated-client drift checks and separate test/scan artifacts. `ci-evidence.json` records the exact commit and failed/skipped check outcomes; it cannot authorize phase review or release. Hosted run status is verified from GitHub's run page; private artifact contents require authenticated access and are not claimed inspected here.

The source-linked checks and hosted run links are recorded in `docs/VALIDATION.md`. All live provider integrations, production MFA, teacher screening operations, retention/legal approval, off-host recovery and VPS deployment remain open. No deployment or merge is performed by this acceptance record.
