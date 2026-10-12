# Better Call Sir

Find a suitable Maths or Science teacher for Classes 6–10 in Raipur, online or at home. This repository implements a **synthetic development build** from the owner's [Version 3 PRD](docs/BetterCallSir_MVP_PRD.docx). See the [Phase 2 acceptance record](docs/PHASE_2_ACCEPTANCE.md) and [sprint board](docs/SPRINTS.md) for implemented slices and remaining acceptance criteria. It is not the complete live MVP or a production-ready service.

## Run locally

Requirements: Node **24.19.0**, npm 11, Docker with Compose. API, web and worker are separate processes; PostgreSQL 17.11 is pinned by image digest. Use only synthetic data.

```bash
cp .env.example .env
npm ci
npm run generate
docker compose -f infra/compose/development.yaml up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

The web uses port 3000 and the API port 4000. Start from the web's **Get started** button and choose a synthetic parent, student, teacher or admin. Parent Kavita has a linked student, active teaching assignment and a demo prepaid Pro entitlement. New/unverified parents cannot submit child data. Tuition matching and safety-support access do not require Pro.

The root `.env` is ignored. The example database credentials are for a loopback-only local development database. Do not use them on a public host. No real OTP, guardian verification, checkout, masked audio or notification providers are configured. The API and worker deliberately refuse live startup.

## Applications and contract

- `apps/web`: Next.js, responsive discovery/onboarding/dashboards, React Hook Form and TanStack Query. Public discovery is rendered from the API; authenticated queries use private, uncached responses.
- `apps/api`: NestJS modules, Prisma/pg, server sessions/permissions, consent, eligibility, reservation/financial policies and auditing.
- `apps/worker`: separately restarted PostgreSQL outbox consumer and expired-hold cleanup. Notifications are synthetic; refund intent is left pending until provider integration.
- `packages/api-client`: generated OpenAPI definitions and a browser client. No database imports.
- `packages/evidence`: private local object storage, signature validation, integrity checks and fail-closed ClamAV scanning.
- `packages/test-fixtures`: synthetic identities and public profiles; seeding is repeatable and preserves existing fixture changes.
- `contracts/openapi.yaml`: versioned API contract. All existing routes are documented; later resource contracts still need stronger schemas.
- `prisma/migrations`: explicit SQL, including half-open interval exclusion, entitlement checks and append-only audit history.

## Foundation mock server

Run `npm run dev:mock` for a contract-generated, loopback-only API mock on port 4010. It includes deterministic discovery, identity, consent and intake examples plus selectable failure responses. See [mock usage and limits](contracts/MOCKS.md). Run `npm run contract:lint` and `npm run test:mock` to validate it. Mocks have no persisted user or financial state.

## Validation

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run security:dependencies
npm run security:tooling
npm run security:secrets
```

Integration tests create and drop their own `bcs_test_<random>` database on the local PostgreSQL service and launch the compiled API on port 4100. They never truncate the development database. Local test credentials need database-creation rights; do not run them against a live database. Browser journeys use the actual web/API and synthetic development records; they may add a synthetic tuition request. The pinned headless Chromium test package is distributed through npm with lockfile integrity verification. Browser security remains enabled for Origin/CSRF checks.

`npm run build` builds API, worker and web independently. `npm run release:verify` intentionally fails while required production acceptance or evidence is missing; a development test pass is not pilot approval. See [threat boundaries](docs/THREAT_MODEL.md), [architecture](docs/adr/001-applications-and-development-boundary.md), and [development runbook](infra/runbooks/development.md).

## Sprint workflow

Each feature/API links to a PRD story, gets relevant tests, and is committed and pushed to its implementation branch. The Phase 2 implementation branch is `feat/phase-2-backend-core`. Review integration and acceptance evidence before merging. Never include `.env`, real child records, credentials or provider data in commits.

## Phase 2 evidence and matching development

See [Phase 2 acceptance and API workflow](docs/PHASE_2_ACCEPTANCE.md). Teacher evidence stays quarantined until the worker receives a valid clean result from a configured ClamAV engine. Files live outside the web root, defaulting to `.cache/private-evidence`; keep API and worker on the same private `EVIDENCE_DIRECTORY`. Only clean owner/reviewer-authorized files have attachment downloads. Never serve that directory directly.

For deterministic **synthetic testing only**, run `npm run scanner:test:setup`, then start the worker with `CLAMAV_HOST=127.0.0.1 CLAMAV_PORT=3310 npm run dev -w @bcs/worker`. The pinned test container has an EICAR-only signature database. It proves the engine/worker protocol and infection failure path, **not production malware coverage**. Without scanner configuration, jobs retry while files remain quarantined. Live media requires reviewed storage access, current signed definitions, monitoring, retention and restore qualification in Phase 6.

Structured schedules and reviewer/publication workflows are available through the documented API. The complete corresponding forms and render-confirmation hooks belong to Phase 3. Development v1 mutations require retry keys and current versions; the repository callers and generated types are updated together. No external released v1/mobile client is claimed migrated.
