# Development runbook

Use the existing checkout. Tasks are already isolated; no worktree is needed.

1. Activate Node 24.19.0. From the repository root, copy `.env.example` only if `.env` does not exist. Do not overwrite personal settings or print values.
2. Run `npm ci`, then `npm run generate`. Prisma engine downloads require `binaries.prisma.sh`; preserve TLS and checksum validation. npm artifacts require `registry.npmjs.org`.
3. Start the digest-pinned database with `docker compose -f infra/compose/development.yaml up -d --wait`. It exposes PostgreSQL only on loopback. Check for an existing service using port 5432 before changing ports.
4. Apply `npm run db:migrate`, then `npm run db:seed`. The seed refuses production and uses upserts to preserve fixture state. Do not reset or delete the volume to resolve an error without checking existing work.
5. Run `npm run dev` to start the three separate processes. API `/api/v1/health/ready` must report ready; a catalog request must return approved synthetic profiles. The web proxies `/api/v1` to the separate API. Use `WEB_ORIGIN` consistently with the browser origin (default localhost port 3000).
6. Run type, unit/integration/contract and browser checks. Integration creates a separate randomly named local database; it tests the actual SQL constraints and compiled API. The npm-distributed headless browser is pinned, with web security enabled; no separate browser download is required.
7. For independent build validation, stop the web development process before `npm run build` because Next dev/build share `.next`. Start API/worker with their workspace start commands and web with `npm run start -w @bcs/web` after building. Confirm a real catalog request and role login through the web.
8. Stop only processes started for this project. Preserve PostgreSQL volumes. Live processes do not survive publication; future tasks must restart them using this runbook.

All live-release work remains gated by the original PRD. This runbook does not provision a VPS, configure real secrets or complete restoration/security qualification.
